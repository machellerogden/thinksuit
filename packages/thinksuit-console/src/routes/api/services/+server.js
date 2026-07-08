import { json } from '@sveltejs/kit';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { homedir } from 'node:os';
import { join } from 'node:path';

// Coarse start/stop/restart for the thinksuit launchd agents. The console runs as
// a LaunchAgent in the Aqua (GUI) domain, so it can manage the other Aqua agents
// via launchctl. Labels are a fixed allowlist (never request input) and launchctl
// is invoked via execFile (no shell), so there's no command injection surface.

const run = promisify(execFile);
const LAUNCHCTL = '/bin/launchctl';

const SERVICES = [
    { id: 'broker', label: 'thinksuit-broker.service', name: 'Broker' },
    { id: 'genai', label: 'thinksuit-genai.service', name: 'GenAI' },
    { id: 'tty', label: 'thinksuit-tty.service', name: 'TTY' },
    { id: 'voice', label: 'thinksuit-voice.service', name: 'Voice' },
    // self: the console can't stop/restart itself — that would kill this responder.
    { id: 'console', label: 'thinksuit-console.service', name: 'Console', self: true }
];
const byLabel = new Map(SERVICES.map((s) => [s.label, s]));

const uid = process.getuid();
const domain = `gui/${uid}`;
const target = (label) => `${domain}/${label}`;
const plistPath = (label) => join(homedir(), 'Library', 'LaunchAgents', `${label}.plist`);

async function status(label) {
    try {
        const { stdout } = await run(LAUNCHCTL, ['print', target(label)]);
        const stateM = stdout.match(/state = (\S+)/);
        const pidM = stdout.match(/pid = (\d+)/);
        const state = stateM ? stateM[1] : 'unknown';
        return { loaded: true, running: state === 'running', state, pid: pidM ? Number(pidM[1]) : null };
    } catch {
        return { loaded: false, running: false, state: 'not loaded', pid: null };
    }
}

export async function GET() {
    const services = await Promise.all(SERVICES.map(async (s) => ({ ...s, ...(await status(s.label)) })));
    return json({ services });
}

export async function POST({ request }) {
    const { label, action } = await request.json();
    const svc = byLabel.get(label);
    if (!svc) return json({ error: `unknown service: ${label}` }, { status: 400 });
    if (!['start', 'stop', 'restart'].includes(action)) {
        return json({ error: `unknown action: ${action}` }, { status: 400 });
    }
    if (svc.self && action !== 'start') {
        return json(
            { error: 'Manage the console service from a terminal — this action would kill the console.' },
            { status: 400 }
        );
    }

    try {
        if (action === 'stop') {
            await run(LAUNCHCTL, ['bootout', target(label)]);
        } else if (action === 'start') {
            try {
                await run(LAUNCHCTL, ['bootstrap', domain, plistPath(label)]);
            } catch {
                // already loaded — make sure it's actually running
                await run(LAUNCHCTL, ['kickstart', target(label)]);
            }
        } else if (action === 'restart') {
            try {
                await run(LAUNCHCTL, ['kickstart', '-k', target(label)]);
            } catch {
                // not loaded yet — load it
                await run(LAUNCHCTL, ['bootstrap', domain, plistPath(label)]);
            }
        }
        return json({ success: true, label, action, status: await status(label) });
    } catch (error) {
        return json({ error: error.message }, { status: 500 });
    }
}
