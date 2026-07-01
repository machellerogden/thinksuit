#!/usr/bin/env node

// thinkctl — ThinkSuit operations control plane.
//
// One central CLI for operating the system's services. Services are PACKAGES:
// thinkctl manages the ones it declares as dependencies, resolving each BY
// NAME (never by filesystem position) via a lightweight `./service` subpath so
// discovery never loads a daemon or its native deps. Each service package exports
// a self-describing `service` definition that resolves its own entry; thinkctl
// owns the generic launchd mechanics and generates each plist in code from the
// definition + this machine's values.
//
// Replaces the former per-service bin/service.*.sh scripts, etc/*.plist.template
// files, and scripts/install-macos.mjs. Service ops go through here, never raw
// launchctl.

import { homedir, platform } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, writeFileSync, existsSync, rmSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { readUserConfig, patchUserConfig } from 'thinksuit';
import pkg from '../package.json' with { type: 'json' };

const HOME = homedir();
const UID = process.getuid();
const NODE_BIN = process.execPath;
const NODE_DIR = dirname(NODE_BIN);
const LAUNCH_AGENTS = join(HOME, 'Library', 'LaunchAgents');
const LOGS = join(HOME, 'Library', 'Logs');

const args = new Set(process.argv.slice(3));
const YES = args.has('--yes') || args.has('-y');

const DEFAULTS = {
    provider: 'anthropic',
    model: 'claude-sonnet-4-6',
    allowedDirectories: [join(HOME, 'repos')]
};

const C = {
    head: (s) => console.log(`\n\x1b[1m\x1b[36m▸ ${s}\x1b[0m`),
    ok: (s) => console.log(`  \x1b[32m✓\x1b[0m ${s}`),
    info: (s) => console.log(`  ${s}`),
    warn: (s) => console.log(`  \x1b[33m!\x1b[0m ${s}`)
};

function sh(cmd, argv, opts = {}) {
    return execFileSync(cmd, argv, { stdio: 'inherit', ...opts });
}
function shCap(cmd, argv, opts = {}) {
    try {
        return execFileSync(cmd, argv, { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8', ...opts });
    } catch {
        return '';
    }
}

// ── service resolution (by name, from our own dependencies) ──────────────────────

let _cache;
async function services() {
    if (_cache) return _cache;
    const out = [];
    for (const name of Object.keys(pkg.dependencies ?? {})) {
        let mod;
        try {
            mod = await import(`${name}/service`);
        } catch {
            continue; // deps without a ./service subpath aren't services
        }
        if (mod.service) out.push(unit(mod.service));
    }
    _cache = out;
    return out;
}

// Augment a service definition with this-machine launchd facts.
function unit(def) {
    if (!def.name) throw new Error('service definition missing "name"');
    if (!def.entry && typeof def.programArgs !== 'function') {
        throw new Error(`service "${def.name}" needs "entry" or "programArgs"`);
    }
    const label = `${def.name}.service`;
    return {
        ...def,
        label,
        target: `gui/${UID}/${label}`,
        plist: join(LAUNCH_AGENTS, `${label}.plist`),
        stdout: join(LOGS, `${label}.stdout.log`),
        stderr: join(LOGS, `${label}.stderr.log`)
    };
}

async function targets(arg) {
    const all = await services();
    if (arg === '--all' || arg === '-a') return all;
    if (!arg || arg.startsWith('-')) throw new Error('expected a service name or -a/--all');
    const svc = all.find((s) => s.name === arg || s.name === `thinksuit-${arg}`);
    if (!svc) {
        throw new Error(`unknown service: ${arg} (known: ${all.map((s) => s.name).join(', ') || 'none'})`);
    }
    return [svc];
}

function stateOf(svc) {
    const out = shCap('launchctl', ['print', svc.target]);
    if (!out) return { state: 'not loaded', pid: null };
    return {
        state: (out.match(/state = (\S+)/) || [, 'unknown'])[1],
        pid: (out.match(/pid = (\d+)/) || [, null])[1]
    };
}

// ── onboarding (shared, gathered once per install/up) ─────────────────────────

// Reuse an already-installed token so re-runs don't churn it (console/tty must
// agree); otherwise mint one.
function resolveAuthToken() {
    const ttyPlist = join(LAUNCH_AGENTS, 'thinksuit-tty.service.plist');
    if (existsSync(ttyPlist)) {
        const m = readFileSync(ttyPlist, 'utf8').match(
            /THINKSUIT_TTY_AUTH_TOKEN<\/key>\s*<string>(?:<!\[CDATA\[)?([0-9a-f]{32,})/i
        );
        if (m) return m[1];
    }
    return randomBytes(32).toString('hex');
}

async function onboard() {
    C.head('Onboarding');
    const current = readUserConfig();

    // Custom-tools MCP server: seed ONLY when absent. An existing entry (e.g.
    // `npx thinksuit-mcp-tools`, which runs the local workspace package) is left
    // untouched. The filesystem MCP server is auto-provided by the engine.
    if (!current.mcpServers?.customTools) {
        const customTools = {
            command: 'node',
            args: [fileURLToPath(import.meta.resolve('thinksuit-mcp-tools/server.js'))],
            env: {}
        };
        patchUserConfig({ mcpServers: { customTools } });
        C.ok(`mcpServers.customTools → ${customTools.args[0]}`);
    } else {
        C.info('mcpServers.customTools already set — left as-is');
    }

    // Preferences: fill only what's MISSING (interview cadence = "only when
    // incomplete"). A fully-configured machine is asked nothing.
    const missing = Object.keys(DEFAULTS).filter((k) => current[k] === undefined);
    const patch = {};
    if (!missing.length) {
        C.info('provider/model/allowedDirectories already set — no prompts');
    } else if (YES) {
        for (const k of missing) patch[k] = DEFAULTS[k];
    } else {
        const rl = createInterface({ input: stdin, output: stdout });
        try {
            const ask = async (label, key, fmt = (v) => v) => {
                const ans = (await rl.question(`  ${label} [${fmt(DEFAULTS[key])}]: `)).trim();
                return ans === '' ? DEFAULTS[key] : ans;
            };
            for (const k of missing) {
                if (k === 'provider') patch[k] = await ask('LLM provider', k);
                else if (k === 'model') patch[k] = await ask('Model', k);
                else if (k === 'allowedDirectories') {
                    const dirs = await ask('Allowed directories (comma-separated)', k, (v) =>
                        Array.isArray(v) ? v.join(',') : v
                    );
                    patch[k] = Array.isArray(dirs)
                        ? dirs
                        : dirs.split(',').map((d) => d.trim()).filter(Boolean);
                }
            }
        } finally {
            rl.close();
        }
    }
    if (Object.keys(patch).length) {
        patchUserConfig(patch);
        for (const [k, v] of Object.entries(patch)) C.ok(`${k} → ${JSON.stringify(v)}`);
    }

    return {
        token: resolveAuthToken(),
        consolePort: process.env.THINKSUIT_CONSOLE_PORT || '60660',
        ttyPort: process.env.THINKSUIT_TTY_PORT || '60662'
    };
}

function secretsReminder() {
    const secrets = join(HOME, '.thinksuit', 'secrets.env');
    if (existsSync(secrets)) return;
    C.head('Manual step: provider secrets');
    C.warn(`Create ${secrets} with your provider keys, e.g.:`);
    C.info('    ANTHROPIC_API_KEY=sk-ant-...');
    C.info('    OPENAI_API_KEY=sk-...');
    C.info(`  Then restart: thinkctl start broker`);
}

// ── plist generation (in code — nothing is repo-relative) ────────────────────────

function renderPlist(svc, ctx) {
    const PATH = `${NODE_DIR}:/opt/homebrew/bin:/usr/local/bin:/usr/local/sbin:/usr/bin:/bin:/usr/sbin:/sbin`;
    const rawEnv = typeof svc.env === 'function' ? svc.env(ctx) : (svc.env ?? {});
    const env = { FORCE_COLOR: 'true', PATH, ...rawEnv };
    const envXml = Object.entries(env)
        .map(([k, v]) => `      <key>${k}</key>\n      <string><![CDATA[${v}]]></string>`)
        .join('\n');
    const workdir = svc.cwd
        ? `\n    <key>WorkingDirectory</key>\n    <string>${svc.cwd}</string>`
        : '';
    const progArgs = typeof svc.programArgs === 'function' ? svc.programArgs(ctx) : [NODE_BIN, svc.entry];
    const argsXml = progArgs.map((a) => `      <string>${a}</string>`).join('\n');
    // Restart policy: 'on-crash' → restart only on a crash signal (not clean exit,
    // not a `thinkctl stop`/TERM), throttled. Absent → no KeepAlive key (die and stay
    // dead until `thinkctl start`), matching the pre-collapse plists.
    const keepAlive =
        svc.restart === 'on-crash'
            ? `\n    <key>KeepAlive</key>\n    <dict>\n      <key>Crashed</key>\n      <true/>\n    </dict>\n    <key>ThrottleInterval</key>\n    <integer>30</integer>`
            : '';
    return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>Label</key>
    <string>${svc.label}</string>
    <key>RunAtLoad</key>
    <true/>${keepAlive}
    <key>StandardOutPath</key>
    <string>${svc.stdout}</string>
    <key>StandardErrorPath</key>
    <string>${svc.stderr}</string>
    <key>EnvironmentVariables</key>
    <dict>
${envXml}
    </dict>${workdir}
    <key>ProgramArguments</key>
    <array>
${argsXml}
    </array>
  </dict>
</plist>
`;
}

// ── lifecycle ────────────────────────────────────────────────────────────────

async function installOne(svc, ctx) {
    mkdirSync(LAUNCH_AGENTS, { recursive: true });
    mkdirSync(LOGS, { recursive: true });
    if (typeof svc.preInstall === 'function') await svc.preInstall({ svc, NODE_BIN, ...ctx });
    writeFileSync(svc.plist, renderPlist(svc, ctx));
    sh('plutil', ['-lint', svc.plist], { stdio: ['ignore', 'ignore', 'inherit'] });
    if (typeof svc.postInstall === 'function') await svc.postInstall({ svc, NODE_BIN, ...ctx });
    C.ok(`${svc.name} installed`);
}
function uninstall(svc) {
    if (existsSync(svc.plist)) rmSync(svc.plist);
    C.ok(`${svc.name} uninstalled`);
}
function load(svc) {
    sh('launchctl', ['bootstrap', `gui/${UID}`, svc.plist]);
    C.ok(`${svc.name} loaded`);
}
function unload(svc) {
    shCap('launchctl', ['bootout', svc.target]); // ignore "not loaded"
    C.ok(`${svc.name} unloaded`);
}
function start(svc) {
    sh('launchctl', ['kickstart', '-k', svc.target]);
    C.ok(`${svc.name} started`);
}
function stop(svc) {
    shCap('launchctl', ['kill', 'TERM', svc.target]);
    C.ok(`${svc.name} stopped`);
}

// ── commands ───────────────────────────────────────────────────────────────

// The verbs and service definitions are platform-neutral; only the service
// *backend* below (plist generation + launchctl) is macOS-specific. launchd is the
// only backend today — Linux (systemd) and Windows are intended, and would slot in
// behind the same verbs without changing the interface or the definitions.
function ensureEnv() {
    if (platform() !== 'darwin') {
        throw new Error(
            `thinkctl currently ships only a macOS (launchd) service backend; detected ${platform()}. ` +
                `Linux/Windows backends are intended but not yet implemented.`
        );
    }
    const major = Number(process.versions.node.split('.')[0]);
    if (major < 22) throw new Error(`Node >= 22 required; running ${process.versions.node}`);
}

const commands = {
    // up/down are pure sugar — transparent composition of the primitives.
    async up(arg) {
        await commands.install(arg);
        await commands.load(arg);
    },
    async down(arg) {
        await commands.unload(arg);
        await commands.uninstall(arg);
    },

    async ls() {
        const svcs = await services();
        if (!svcs.length) {
            C.info('no services declared');
            return;
        }
        for (const svc of svcs) {
            const { state, pid } = stateOf(svc);
            C.info(`${svc.name.padEnd(24)} ${state}${pid ? ` (pid ${pid})` : ''}`);
        }
    },

    async install(arg) {
        const svcs = await targets(arg);
        const ctx = await onboard();
        for (const svc of svcs) await installOne(svc, ctx);
        secretsReminder();
    },
    async uninstall(arg) {
        for (const svc of await targets(arg)) uninstall(svc);
    },
    async load(arg) {
        for (const svc of await targets(arg)) load(svc);
    },
    async unload(arg) {
        for (const svc of await targets(arg)) unload(svc);
    },
    async start(arg) {
        for (const svc of await targets(arg)) start(svc);
    },
    async stop(arg) {
        for (const svc of await targets(arg)) stop(svc);
    },

    async logs(arg) {
        const [svc] = await targets(arg);
        for (const f of [svc.stdout, svc.stderr]) if (!existsSync(f)) writeFileSync(f, '');
        sh('tail', ['-q', '-n', '1000', '-f', svc.stdout, svc.stderr]);
    },

    async 'clear-logs'(arg) {
        for (const svc of await targets(arg)) {
            for (const f of [svc.stdout, svc.stderr]) if (existsSync(f)) rmSync(f);
            C.ok(`${svc.name} logs cleared`);
        }
    },

    async status(arg) {
        C.head('Status');
        for (const svc of await targets(arg || '--all')) {
            const { state, pid } = stateOf(svc);
            C.info(`${svc.name}: ${state}${pid ? ` (pid ${pid})` : ''}`);
        }
    }
};

function usage() {
    console.log(`thinkctl — ThinkSuit operations control plane

usage: thinkctl <command> [service|-a|--all] [--yes]

  up         <svc|-a/--all>   install + load (sugar)
  down       <svc|-a/--all>   unload + uninstall (sugar)
  install    <svc|-a/--all>   onboard (config + token), generate plist, run hooks
  uninstall  <svc|-a/--all>   remove plist file
  load       <svc|-a/--all>   register with launchd
  unload     <svc|-a/--all>   unregister from launchd
  start      <svc|-a/--all>   (re)start
  stop       <svc|-a/--all>   signal stop (TERM)
  status     [svc|-a/--all]   show launchd state
  ls                          list services and their state
  logs       <svc>            tail stdout + stderr
  clear-logs <svc|-a/--all>   delete stdout + stderr logs

  --yes, -y   non-interactive onboarding (keep existing config, fill defaults)

services are resolved by short name (broker) or full name (thinksuit-broker).`);
}

async function main() {
    const cmd = process.argv[2];
    const arg = process.argv[3];
    if (!cmd || cmd === 'help' || cmd === '-h' || cmd === '--help') {
        usage();
        process.exit(cmd ? 0 : 1);
    }
    if (!commands[cmd]) {
        console.error(`thinkctl: unknown command '${cmd}'\n`);
        usage();
        process.exit(1);
    }
    ensureEnv();
    await commands[cmd](arg);
}

main().catch((err) => {
    console.error(`\n\x1b[31mthinkctl: ${err.message}\x1b[0m`);
    process.exit(1);
});
