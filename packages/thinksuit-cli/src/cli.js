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

async function cmdSessions(args) {
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

async function cmdStatus(args) {
    const id = firstPositional(args);
    if (!id) return fail('Usage: thinksuit status <sessionId>');
    const res = await client.status(id);
    if (hasFlag(args, 'json')) {
        console.log(JSON.stringify(res));
    } else {
        console.log(`${res.sessionId}\t${res.status}${res.live ? '\t(live)' : ''}`);
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
    const id = firstPositional(args);
    if (!id) return fail('Usage: thinksuit interrupt <sessionId>');
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

export async function dispatch(verb, args) {
    try {
        switch (verb) {
            case 'run':
                return await cmdRun(args);
            case 'sessions':
                return await cmdSessions(args);
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
