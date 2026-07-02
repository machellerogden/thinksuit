/**
 * Broker turn-lifecycle audit — proving tests.
 *
 * Demonstrates lifecycle bugs by failing against the current code. Uses a throwaway
 * HTTP server on a temp unix socket to stand in for the broker.
 */

import { describe, it, expect, afterEach } from 'vitest';
import http from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { unlinkSync } from 'node:fs';
import { awaitTurn } from '../src/client.js';

function withTimeout(promise, ms) {
    return Promise.race([
        promise,
        new Promise((_, reject) =>
            setTimeout(() => reject(new Error('awaitTurn did not settle')), ms)
        )
    ]);
}

describe('broker turn lifecycle (proving tests)', () => {
    let server = null;
    let socketPath = null;

    afterEach(async () => {
        if (server) await new Promise((r) => server.close(r));
        server = null;
        try {
            if (socketPath) unlinkSync(socketPath);
        } catch {
            // already gone
        }
    });

    it('awaitTurn settles when the SSE stream closes without a terminal event (broker death)', async () => {
        socketPath = join(tmpdir(), `ts-broker-test-${Date.now()}.sock`);
        server = http.createServer((req, res) => {
            res.writeHead(200, { 'content-type': 'text/event-stream' });
            // A non-terminal event, then close the stream WITHOUT emitting
            // turn.complete / session.interrupted / broker.worker.exited — i.e. the
            // broker went away mid-turn.
            res.write(
                `data: ${JSON.stringify({
                    event: 'session.response',
                    data: { response: 'partial', success: true }
                })}\n\n`
            );
            res.end();
        });
        await new Promise((r) => server.listen(socketPath, r));

        const result = await withTimeout(awaitTurn('sess-1', { from: 0, socketPath }), 1500);
        expect(result.outcome).toBe('exited');
    });
});
