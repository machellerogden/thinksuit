/**
 * Subcommand dispatcher for the `thinksuit` binary.
 *
 * Bare `thinksuit` launches the REPL (handled in index.js). When the first arg
 * is a known verb, we route here and act as a thin client over the broker
 * socket. All hosting happens in the broker; this process just talks to it.
 */

import process from 'node:process';
import readline from 'node:readline';
import { buildConfig } from 'thinksuit';
import * as client from 'thinksuit-broker';

function hasFlag(args, name) {
    return args.includes(`--${name}`);
}

function firstPositional(args) {
    return args.find((a) => !a.startsWith('--'));
}

function fail(message) {
    console.error(message);
    process.exitCode = 1;
}

/**
 * Turn parsed CLI config into the serializable run config the broker forwards
 * to a worker. Note: loaded `modules` and the `_cli` handle are intentionally
 * dropped — the worker loads modules itself from `modulesPackage`.
 */
function buildRunConfig(flagArgv) {
    const c = buildConfig({ argv: flagArgv });
    return {
        input: c.input,
        sessionId: c.sessionId,
        module: c.module,
        modulesPackage: c.modulesPackage,
        provider: c.provider,
        model: c.model,
        providerConfig: c.providerConfig,
        cwd: c.cwd || process.env.INIT_CWD || process.cwd(),
        workdir: c.workdir, // optional: bind session to an existing dir (else provisioned)
        allowedDirectories: c.allowedDirectories,
        mcpServers: c.mcpServers,
        allowedTools: c.allowedTools,
        policy: c.policy,
        trace: c.trace,
        approvalTimeout: c.approvalTimeout,
        // Fire-and-forget `run` auto-approves tools; interactive attach (P3)
        // will set this false and answer approvals over the socket.
        autoApproveTools: true
    };
}

async function cmdRun(args) {
    const config = buildRunConfig(args);
    if (!config.input) {
        return fail('Usage: thinksuit run "<input>" [--model ...] [--require-approval] [--json]');
    }
    // --require-approval makes tool calls wait for an explicit `thinksuit approve`,
    // exercising the cross-process approval path instead of auto-approving.
    if (hasFlag(args, 'require-approval')) {
        config.autoApproveTools = false;
    }
    const res = await client.run(config);
    if (hasFlag(args, 'json')) {
        console.log(JSON.stringify(res));
    } else {
        console.log(res.sessionId);
    }
}

// `ps` is the CLI view verb over the session resource (Docker-style): the CLI
// reads `ps`, while the broker route / client stay `sessions` (the resource).
async function cmdPs(args) {
    const all = hasFlag(args, 'all') || args.includes('-a');
    const list = await client.sessions({ all });
    if (hasFlag(args, 'json')) {
        console.log(JSON.stringify(list, null, 2));
        return;
    }
    if (!list.length) {
        console.log(all ? 'No sessions.' : 'No active sessions. (use -a to include history)');
        return;
    }
    for (const s of list) {
        const marker = s.live ? '*' : ' ';
        console.log(`${marker} ${s.id}\t${s.status}`);
    }
}

async function cmdQueue(args) {
    const list = await client.queue();
    if (hasFlag(args, 'json')) {
        console.log(JSON.stringify(list, null, 2));
        return;
    }
    if (!list.length) {
        console.log('Nothing awaiting approval.');
        return;
    }
    for (const item of list) {
        console.log(`${item.sessionId}\t${item.tool || '(tool)'}\t${item.approvalId}`);
    }
    console.log('approve with: thinksuit approve <sessionId>');
}

async function cmdStatus(args) {
    const id = firstPositional(args);
    if (!id) return fail('Usage: thinksuit status <sessionId>');
    const res = await client.status(id);
    if (hasFlag(args, 'json')) {
        console.log(JSON.stringify(res));
    } else {
        console.log(`${res.sessionId}\t${res.status}${res.live ? '\t(live)' : ''}`);
        if (res.workdir) console.log(`Workdir: ${res.workdir}`);
    }
}

async function cmdLog(args) {
    const id = firstPositional(args);
    if (!id) return fail('Usage: thinksuit log <sessionId> [--tail]');

    if (hasFlag(args, 'tail')) {
        const handle = client.tail(
            id,
            (entry) => console.log(JSON.stringify(entry)),
            { onError: (err) => fail(err.message) }
        );
        process.on('SIGINT', () => {
            handle.close();
            process.exit(0);
        });
        return; // stay alive streaming until Ctrl+C
    }

    const entries = await client.log(id);
    for (const entry of entries) {
        console.log(JSON.stringify(entry));
    }
}

async function cmdInterrupt(args) {
    // `--all`/`-a` fans out across every live turn (mirrors `ps -a`); the broker
    // stays up. Taking the daemon down is a separate service-management concern.
    if (hasFlag(args, 'all') || args.includes('-a')) {
        const res = await client.interruptAll();
        if (hasFlag(args, 'json')) {
            console.log(JSON.stringify(res));
            return;
        }
        if (!res.count) {
            console.log('No in-flight turns to interrupt.');
            return;
        }
        console.log(`Interrupted ${res.count} session${res.count === 1 ? '' : 's'}`);
        for (const id of res.interrupted) console.log(`  ${id}`);
        return;
    }
    const id = firstPositional(args);
    if (!id) return fail('Usage: thinksuit interrupt <sessionId> | --all/-a [--json]');
    await client.interrupt(id);
    console.log(`Interrupted ${id}`);
}

async function cmdApprove(args) {
    const positionals = args.filter((a) => !a.startsWith('--'));
    const id = positionals[0];
    const approvalId = positionals[1]; // optional; broker derives from log if absent
    if (!id) return fail('Usage: thinksuit approve <sessionId> [approvalId] [--deny]');
    const approved = !hasFlag(args, 'deny');
    const res = await client.approve(id, { approved, approvalId });
    console.log(`${approved ? 'Approved' : 'Denied'} ${res.approvalId} for ${id}`);
}

function renderEvent(entry) {
    const ev = entry.event || entry.type;
    if (!ev) return;
    if (ev === 'execution.tool.approval-requested') {
        const tool = entry.data?.tool || '';
        console.log(`⚠ approval needed for tool: ${tool}  — type :approve or :deny`);
        return;
    }
    if (ev === 'session.response') {
        const r = entry.data?.response ?? entry.response;
        console.log(`< ${typeof r === 'string' ? r : JSON.stringify(r)}`);
        return;
    }
    console.log(`· ${ev}${entry.msg ? '  ' + entry.msg : ''}`);
}

/**
 * Interactive attach: observe the session's live events, and act on the
 * in-flight turn. Per the broker model, mid-run interaction is just approvals +
 * interrupt; "providing input" means submitting the next turn (a run on the same
 * sessionId). Detaching leaves the run alive in the broker for re-attach.
 */
async function cmdAttach(args) {
    const id = firstPositional(args);
    if (!id) return fail('Usage: thinksuit attach <sessionId>');

    const handle = client.tail(id, renderEvent, {
        onError: (err) => console.error(`! stream: ${err.message}`)
    });

    console.error(
        `Attached to ${id}. Type a message to send the next turn.\n` +
            `Commands: :interrupt  :approve  :deny  :detach`
    );

    const rl = readline.createInterface({ input: process.stdin, terminal: false });
    let detached = false;
    const detach = () => {
        if (detached) return;
        detached = true;
        handle.close();
        rl.close();
        console.error('Detached. Session continues in the broker.');
        process.exit(0);
    };

    rl.on('line', async (line) => {
        const cmd = line.trim();
        if (!cmd) return;
        try {
            if (cmd === ':detach') return detach();
            if (cmd === ':interrupt') return void (await client.interrupt(id));
            if (cmd === ':approve') return void (await client.approve(id, { approved: true }));
            if (cmd === ':deny') return void (await client.approve(id, { approved: false }));
            // Anything else is the next turn for this session.
            const config = buildRunConfig([cmd]);
            config.sessionId = id;
            config.autoApproveTools = false; // interactive: surface approvals
            await client.run(config);
        } catch (err) {
            console.error(`! ${err.message}`);
        }
    });
    rl.on('close', detach);
    process.on('SIGINT', detach);
}

export function printUsage() {
    console.log(`thinksuit — interactive REPL + thin client over the ThinkSuit broker

usage:
  thinksuit                          launch the interactive REPL
  thinksuit <command> [args]         run a one-shot client command

commands:
  run "<input>" [--model M] [--require-approval] [--json]
                                     start a turn (prints sessionId; --json for full result)
  ps [-a/--all] [--json]             list sessions (default: active only)
  queue [--json]                     list tool calls awaiting approval
  status <sessionId> [--json]        show a session's status + workdir
  log <sessionId> [--tail]           print a session's event log (--tail to follow)
  attach <sessionId>                 observe a live session; act on the in-flight turn
  interrupt <sessionId> | -a/--all [--json]
                                     cancel in-flight turn(s)
  approve <sessionId> [approvalId] [--deny]
                                     approve (or --deny) a pending tool call

service ops (broker, console, tty, voice) live in a separate control plane: thinkctl`);
}

export async function dispatch(verb, args) {
    try {
        switch (verb) {
            case 'run':
                return await cmdRun(args);
            case 'ps':
                return await cmdPs(args);
            case 'queue':
                return await cmdQueue(args);
            case 'status':
                return await cmdStatus(args);
            case 'log':
                return await cmdLog(args);
            case 'interrupt':
                return await cmdInterrupt(args);
            case 'approve':
                return await cmdApprove(args);
            case 'attach':
                return await cmdAttach(args);
            default:
                return fail(`Unknown command: ${verb}`);
        }
    } catch (err) {
        fail(err.message);
    }
}
