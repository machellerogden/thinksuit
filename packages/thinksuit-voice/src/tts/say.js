// macOS `say` TTS provider (keyless, local) — a stepping stone until a cloud
// provider replaces it. speak(text) -> Promise<void>. Text is piped via stdin
// (no argv length limit, no shell, no injection).

import { spawn } from 'node:child_process';

export function createSayProvider({ voice, rate } = {}) {
    async function speak(text) {
        if (!text) return;
        const args = [];
        if (voice) args.push('-v', voice);
        if (rate) args.push('-r', String(rate));

        await new Promise((resolve, reject) => {
            const proc = spawn('say', args, { stdio: ['pipe', 'ignore', 'ignore'] });
            proc.on('error', reject);
            proc.on('close', (code) =>
                code === 0 ? resolve() : reject(new Error(`say exited ${code}`))
            );
            proc.stdin.end(text);
        });
    }

    return { speak };
}
