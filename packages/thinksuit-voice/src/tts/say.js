// macOS `say` TTS provider (keyless, local) — a stepping stone until a cloud
// provider replaces it. speak(text) -> Promise<void>. Text is piped via stdin
// (no argv length limit, no shell, no injection). stop() cancels in-flight
// speech so a re-wake can interrupt the spoken response.

import { spawn } from 'node:child_process';

export function createSayProvider({ voice, rate } = {}) {
    let current = null;

    function stop() {
        if (current) {
            current.kill();
            current = null;
        }
    }

    async function speak(text) {
        if (!text) return;
        const args = [];
        if (voice) args.push('-v', voice);
        if (rate) args.push('-r', String(rate));

        stop(); // one utterance at a time
        await new Promise((resolve, reject) => {
            const proc = spawn('say', args, { stdio: ['pipe', 'ignore', 'ignore'] });
            current = proc;
            proc.on('error', (err) => {
                if (current === proc) current = null;
                reject(err);
            });
            proc.on('close', (code, signal) => {
                if (current === proc) current = null;
                // A kill (interrupt) or clean exit both resolve; only a natural
                // nonzero exit is a real error.
                if (signal || code === 0) resolve();
                else reject(new Error(`say exited ${code}`));
            });
            proc.stdin.end(text);
        });
    }

    return { speak, stop };
}
