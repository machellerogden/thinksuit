#!/usr/bin/env node

// Sets up the ThinkSuit services as macOS LaunchAgents.
//
// Idempotent and re-runnable. Detects machine-specific paths, renders the
// etc/*.service.plist.template files into ~/Library/LaunchAgents, builds the voice
// .app bundle (mic-permission shim), provisions the shipped default wakeword, seeds
// the required slice of ~/.thinksuit.json (without clobbering user values), and loads
// all four services. Secrets remain a manual step — see the closing reminder.
//
// Flags:
//   --yes, -y    non-interactive: keep existing config values, fill defaults where absent
//   --no-load    do everything except bootstrap/kickstart the LaunchAgents

import { homedir, platform } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');
const HOME = homedir();
const UID = process.getuid();
const NODE_BIN = process.execPath;
const NODE_DIR = dirname(NODE_BIN);
const VOICE_APP_EXE = process.env.VOICE_APP_EXE || 'ThinkSuit Voice';
const LAUNCH_AGENTS = join(HOME, 'Library', 'LaunchAgents');
const LOGS = join(HOME, 'Library', 'Logs');

const args = new Set(process.argv.slice(2));
const YES = args.has('--yes') || args.has('-y');
const NO_LOAD = args.has('--no-load');

const SERVICES = ['broker', 'voice', 'console', 'tty'];
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
        return execFileSync(cmd, argv, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...opts });
    } catch {
        return '';
    }
}

// ── steps ────────────────────────────────────────────────────────────────────

function preflight() {
    C.head('Preflight');
    if (platform() !== 'darwin') {
        throw new Error('This installer targets macOS (launchd). Detected: ' + platform());
    }
    const major = Number(process.versions.node.split('.')[0]);
    if (major < 22) {
        throw new Error(`Node >= 22 required; running ${process.versions.node}`);
    }
    C.ok(`node ${process.versions.node} (${NODE_BIN})`);
    C.ok(`repo ${REPO}`);
    mkdirSync(LAUNCH_AGENTS, { recursive: true });
    mkdirSync(LOGS, { recursive: true });
}

function npmInstall() {
    C.head('Installing dependencies (npm install)');
    sh('npm', ['install'], { cwd: REPO });
    C.ok('dependencies installed');
}

async function seedConfig() {
    C.head('Configuring ~/.thinksuit.json');
    const { readUserConfig, patchUserConfig } = await import(
        join(REPO, 'packages/thinksuit/engine/config.js')
    );
    const current = readUserConfig();

    // Required, authoritative: the local custom-tools MCP server, addressed by absolute
    // path so it resolves with no publish / no global npm link, independent of cwd. The
    // filesystem MCP server is auto-provided by the engine, so it is not seeded here.
    const customTools = {
        command: 'node',
        args: [join(REPO, 'packages/thinksuit-mcp-tools/server.js')],
        env: {}
    };
    patchUserConfig({ mcpServers: { customTools } });
    C.ok(`mcpServers.customTools → ${customTools.args[0]}`);

    // Preferences: prompt (or, with --yes, fill only when absent). Never overwrite an
    // existing value without the user confirming it at the prompt.
    const patch = {};
    if (YES) {
        for (const key of Object.keys(DEFAULTS)) {
            if (current[key] === undefined) patch[key] = DEFAULTS[key];
        }
    } else {
        const rl = createInterface({ input: stdin, output: stdout });
        try {
            const ask = async (label, key, fmt = (v) => v) => {
                const def = current[key] ?? DEFAULTS[key];
                const ans = (await rl.question(`  ${label} [${fmt(def)}]: `)).trim();
                return ans === '' ? def : ans;
            };
            patch.provider = await ask('LLM provider', 'provider');
            patch.model = await ask('Model', 'model');
            const dirs = await ask(
                'Allowed directories (comma-separated)',
                'allowedDirectories',
                (v) => (Array.isArray(v) ? v.join(',') : v)
            );
            patch.allowedDirectories = Array.isArray(dirs)
                ? dirs
                : dirs.split(',').map((d) => d.trim()).filter(Boolean);
        } finally {
            rl.close();
        }
    }
    if (Object.keys(patch).length) {
        patchUserConfig(patch);
        for (const [k, v] of Object.entries(patch)) C.ok(`${k} → ${JSON.stringify(v)}`);
    }
}

function resolveAuthToken() {
    // Reuse an already-installed token so re-runs don't churn it (and console/tty stay in
    // sync); otherwise mint one.
    const ttyPlist = join(LAUNCH_AGENTS, 'thinksuit-tty.service.plist');
    if (existsSync(ttyPlist)) {
        const m = readFileSync(ttyPlist, 'utf8').match(
            /THINKSUIT_TTY_AUTH_TOKEN<\/key>\s*<string>([^<]+)<\/string>/
        );
        if (m && m[1] && !/REPLACE|replace-with/.test(m[1])) return m[1];
    }
    return randomBytes(32).toString('hex');
}

function renderPlists() {
    C.head('Rendering LaunchAgent plists');
    const token = resolveAuthToken();
    const subs = {
        '{{HOME}}': HOME,
        '{{REPO}}': REPO,
        '{{NODE_BIN}}': NODE_BIN,
        '{{NODE_DIR}}': NODE_DIR,
        '{{CONSOLE_PORT}}': process.env.THINKSUIT_CONSOLE_PORT || '60660',
        '{{TTY_PORT}}': process.env.THINKSUIT_TTY_PORT || '60662',
        '{{TTY_AUTH_TOKEN}}': token,
        '{{VOICE_APP_EXE}}': VOICE_APP_EXE
    };
    for (const svc of SERVICES) {
        const tpl = join(REPO, `packages/thinksuit-${svc}/etc/thinksuit-${svc}.service.plist.template`);
        const out = join(LAUNCH_AGENTS, `thinksuit-${svc}.service.plist`);
        let body = readFileSync(tpl, 'utf8');
        for (const [k, v] of Object.entries(subs)) body = body.split(k).join(v);
        const leftover = body.match(/{{[^}]+}}/g);
        if (leftover) throw new Error(`unrendered placeholders in ${svc}: ${leftover.join(', ')}`);
        writeFileSync(out, body);
        // Validate the rendered plist before launchd ever sees it.
        sh('plutil', ['-lint', out], { stdio: ['ignore', 'ignore', 'inherit'] });
        C.ok(`thinksuit-${svc}.service.plist`);
    }
}

function buildVoiceBundle() {
    C.head('Building voice .app bundle (mic-permission shim)');
    sh('bash', [join(REPO, 'packages/thinksuit-voice/bin/service.appbundle.sh')], {
        cwd: join(REPO, 'packages/thinksuit-voice'),
        env: { ...process.env, VOICE_NODE_BIN: NODE_BIN, VOICE_APP_EXE }
    });
    C.ok('bundle built');
}

function provisionWakeword() {
    C.head('Provisioning default wakeword (hey_thinksuit)');
    const manifest = join(HOME, '.thinksuit/voice/wakewords/hey_thinksuit/manifest.json');
    if (existsSync(manifest)) {
        C.info('hey_thinksuit already present — skipping');
        return;
    }
    const defaultsDir = join(REPO, 'packages/thinksuit-voice/defaults/hey_thinksuit');
    const meta = JSON.parse(readFileSync(join(defaultsDir, 'meta.json'), 'utf8'));
    const ctl = join(REPO, 'packages/thinksuit-voice/bin/ctl.mjs');
    sh('node', [ctl, 'wakeword', 'import', 'hey_thinksuit', '--phrase', meta.phrase, '--model', join(defaultsDir, 'model.onnx')]);
    if (meta.binding && meta.binding !== 'converse') {
        sh('node', [ctl, 'wakeword', 'bind', 'hey_thinksuit', meta.binding]);
    }
    if (meta.threshold != null && meta.threshold !== 0.7) {
        sh('node', [ctl, 'wakeword', 'threshold', 'hey_thinksuit', String(meta.threshold)]);
    }
    C.ok('hey_thinksuit imported and enabled');
}

function loadServices() {
    C.head('Loading services');
    if (NO_LOAD) {
        C.warn('--no-load: skipping launchctl bootstrap/kickstart');
        return;
    }
    for (const svc of SERVICES) {
        const label = `gui/${UID}/thinksuit-${svc}.service`;
        const plist = join(LAUNCH_AGENTS, `thinksuit-${svc}.service.plist`);
        shCap('launchctl', ['bootout', label]); // ignore "not loaded"
        sh('launchctl', ['bootstrap', `gui/${UID}`, plist]);
        shCap('launchctl', ['kickstart', '-k', label]);
        C.ok(`thinksuit-${svc} loaded`);
    }
}

function summary() {
    C.head('Status');
    for (const svc of SERVICES) {
        const out = shCap('launchctl', ['print', `gui/${UID}/thinksuit-${svc}.service`]);
        const state = (out.match(/state = (\S+)/) || [, NO_LOAD ? '(not loaded)' : 'unknown'])[1];
        C.info(`thinksuit-${svc}: ${state}`);
    }

    C.head('Manual step required: secrets');
    const secrets = join(HOME, '.thinksuit/secrets.env');
    if (existsSync(secrets)) {
        C.ok(`${secrets} exists`);
    } else {
        C.warn(`Create ${secrets} with your provider keys, e.g.:`);
        C.info('    ANTHROPIC_API_KEY=sk-ant-...');
        C.info('    OPENAI_API_KEY=sk-...');
        C.info('  Then restart the broker: launchctl kickstart -k gui/' + UID + '/thinksuit-broker.service');
    }

    C.head('Microphone permission (voice)');
    C.info('On first voice run macOS should prompt for mic access. If it does not,');
    C.info('grant "ThinkSuit Voice" under System Settings → Privacy & Security → Microphone.');
}

async function main() {
    preflight();
    npmInstall();
    await seedConfig();
    renderPlists();
    buildVoiceBundle();
    provisionWakeword();
    loadServices();
    summary();
    console.log('\n\x1b[1m\x1b[32mDone.\x1b[0m\n');
}

main().catch((err) => {
    console.error(`\n\x1b[31minstall failed:\x1b[0m ${err.message}`);
    process.exit(1);
});
