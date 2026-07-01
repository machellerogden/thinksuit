// Service definition consumed by thinksuitctl (packages/thinksuit-control). Lives
// on the lightweight `./service` subpath, not the package main, so the control
// plane can discover it without loading the daemon or its dependencies.
//
// Voice is the exceptional service: it runs a signed .app bundle (a mic-permission
// shim — launchd pointed at bare node is silently denied the mic by TCC), and its
// install builds that bundle and provisions the shipped default wakeword.

import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
const VOICE_APP_EXE = process.env.VOICE_APP_EXE || 'ThinkSuit Voice';

export const service = {
    name: 'thinksuit-voice',
    cwd: here,
    // The .app dir name is fixed; only the executable filename tracks VOICE_APP_EXE
    // (see bin/service.appbundle.sh). Second arg is relative to cwd.
    programArgs: () => [
        join(homedir(), 'Applications', 'ThinkSuit Voice.app', 'Contents', 'MacOS', VOICE_APP_EXE),
        'bin/service.mjs'
    ],
    // Build the .app bundle before writing the plist: macOS grants mic access per
    // code-signed bundle, so the LaunchAgent needs a bundle identity to run under.
    async preInstall({ NODE_BIN }) {
        execFileSync('bash', [join(here, 'bin/service.appbundle.sh')], {
            cwd: here,
            stdio: 'inherit',
            env: { ...process.env, VOICE_NODE_BIN: NODE_BIN, VOICE_APP_EXE }
        });
    },
    // Provision the shipped default wakeword (idempotent — skip if already present).
    async postInstall() {
        const manifest = join(homedir(), '.thinksuit/voice/wakewords/hey_thinksuit/manifest.json');
        if (existsSync(manifest)) return;
        const defaultsDir = join(here, 'defaults/hey_thinksuit');
        const meta = JSON.parse(readFileSync(join(defaultsDir, 'meta.json'), 'utf8'));
        const ctl = join(here, 'bin/ctl.mjs');
        const run = (args) => execFileSync('node', [ctl, ...args], { stdio: 'inherit' });
        run(['wakeword', 'import', 'hey_thinksuit', '--phrase', meta.phrase, '--model', join(defaultsDir, 'model.onnx')]);
        if (meta.binding && meta.binding !== 'converse') run(['wakeword', 'bind', 'hey_thinksuit', meta.binding]);
        if (meta.threshold != null && meta.threshold !== 0.7) run(['wakeword', 'threshold', 'hey_thinksuit', String(meta.threshold)]);
    }
};
