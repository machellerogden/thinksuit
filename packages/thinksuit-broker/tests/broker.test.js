import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { derivePendingApproval, derivePendingApprovalDetail } from '../src/approvals.js';
import { createBroker } from '../src/broker.js';
import * as client from '../src/client.js';
import { listDesignations } from 'thinksuit';

function tmpSock() {
    return join(tmpdir(), `ts-broker-test-${randomBytes(5).toString('hex')}.sock`);
}

describe('derivePendingApproval', () => {
    it('returns null when there are no approval events', () => {
        expect(derivePendingApproval([{ event: 'session.input' }, {}])).toBe(null);
    });

    it('returns an unresolved approvalId', () => {
        const entries = [{ event: 'execution.tool.approval-requested', approvalId: 'a1' }];
        expect(derivePendingApproval(entries)).toBe('a1');
    });

    it('returns null once the approval is approved', () => {
        const entries = [
            { event: 'execution.tool.approval-requested', approvalId: 'a1' },
            { event: 'execution.tool.approved', approvalId: 'a1' }
        ];
        expect(derivePendingApproval(entries)).toBe(null);
    });

    it('returns null once the approval is denied', () => {
        const entries = [
            { event: 'execution.tool.approval-requested', approvalId: 'a1' },
            { event: 'execution.tool.denied', approvalId: 'a1' }
        ];
        expect(derivePendingApproval(entries)).toBe(null);
    });

    it('tracks the latest pending across multiple approvals', () => {
        const entries = [
            { event: 'execution.tool.approval-requested', approvalId: 'a1' },
            { event: 'execution.tool.approved', approvalId: 'a1' },
            { event: 'execution.tool.approval-requested', approvalId: 'a2' }
        ];
        expect(derivePendingApproval(entries)).toBe('a2');
    });
});

describe('derivePendingApprovalDetail', () => {
    it('returns null when there are no approval events', () => {
        expect(derivePendingApprovalDetail([{ event: 'session.input' }, {}])).toBe(null);
    });

    it('returns the pending request detail (approvalId + tool + args)', () => {
        const entries = [
            {
                event: 'execution.tool.approval-requested',
                approvalId: 'a1',
                data: { tool: 'roll_dice', args: { notation: 'd20' } }
            }
        ];
        expect(derivePendingApprovalDetail(entries)).toEqual({
            approvalId: 'a1',
            tool: 'roll_dice',
            args: { notation: 'd20' }
        });
    });

    it('returns null once the approval is approved', () => {
        const entries = [
            { event: 'execution.tool.approval-requested', approvalId: 'a1', data: { tool: 't' } },
            { event: 'execution.tool.approved', approvalId: 'a1' }
        ];
        expect(derivePendingApprovalDetail(entries)).toBe(null);
    });

    it('returns null once the approval is denied', () => {
        const entries = [
            { event: 'execution.tool.approval-requested', approvalId: 'a1', data: { tool: 't' } },
            { event: 'execution.tool.denied', approvalId: 'a1' }
        ];
        expect(derivePendingApprovalDetail(entries)).toBe(null);
    });

    it('tracks the latest pending across multiple approvals', () => {
        const entries = [
            { event: 'execution.tool.approval-requested', approvalId: 'a1', data: { tool: 'one' } },
            { event: 'execution.tool.approved', approvalId: 'a1' },
            { event: 'execution.tool.approval-requested', approvalId: 'a2', data: { tool: 'two' } }
        ];
        expect(derivePendingApprovalDetail(entries)?.tool).toBe('two');
    });
});

describe('classifyTurnOutcome', () => {
    it('interrupt wins over everything', () => {
        expect(
            client.classifyTurnOutcome({ sawInterrupted: true, response: { success: true } })
        ).toBe('interrupted');
    });

    it('a response with success:false is a failure', () => {
        expect(
            client.classifyTurnOutcome({ sawInterrupted: false, response: { success: false } })
        ).toBe('failed');
    });

    it('a successful response is completed', () => {
        expect(
            client.classifyTurnOutcome({ sawInterrupted: false, response: { success: true } })
        ).toBe('completed');
    });

    it('no response (e.g. before exited failsafe) is completed', () => {
        expect(client.classifyTurnOutcome({})).toBe('completed');
    });
});

describe('client refuse-when-down', () => {
    it('health rejects with an actionable hint when no broker is listening', async () => {
        await expect(client.health({ socketPath: tmpSock() })).rejects.toThrow(
            /broker is not running/i
        );
    });

    it('run rejects with the same hint when no broker is listening', async () => {
        await expect(
            client.run({ input: 'hi' }, { socketPath: tmpSock() })
        ).rejects.toThrow(/broker is not running/i);
    });
});

describe('broker HTTP surface', () => {
    let server;
    let socketPath;

    afterEach(async () => {
        if (server) {
            await new Promise((resolve) => server.close(resolve));
            server = null;
        }
    });

    async function listen() {
        socketPath = tmpSock();
        const broker = createBroker();
        server = broker.server;
        await new Promise((resolve, reject) => {
            server.once('error', reject);
            server.listen(socketPath, () => {
                server.removeListener('error', reject);
                resolve();
            });
        });
    }

    it('answers health', async () => {
        await listen();
        const h = await client.health({ socketPath });
        expect(h.ok).toBe(true);
        expect(typeof h.version).toBe('string');
        expect(h.sessions).toBe(0);
    });

    it('survives a malformed session id without crashing', async () => {
        await listen();
        await expect(client.status('not-a-valid-id', { socketPath })).rejects.toThrow();
        // Broker must still be alive after the bad request.
        const h = await client.health({ socketPath });
        expect(h.ok).toBe(true);
    });

    it('refuses interrupt for an unknown session', async () => {
        await listen();
        await expect(client.interrupt('20990101T000000000Z-aaaaaaaa', undefined, { socketPath }))
            .rejects.toThrow(/no in-flight turn/i);
    });

    it('interruptAll returns an empty result when nothing is live', async () => {
        await listen();
        const res = await client.interruptAll(undefined, { socketPath });
        expect(res).toEqual({ ok: true, interrupted: [], count: 0 });
        // Broker must still be healthy after a fan-out with nothing to do.
        const h = await client.health({ socketPath });
        expect(h.ok).toBe(true);
    });

    it('lists only active sessions by default (empty when no live workers)', async () => {
        await listen();
        const active = await client.sessions({ socketPath });
        expect(active).toEqual([]);
    });

    it('queue is empty with no live sessions', async () => {
        await listen();
        const queue = await client.queue({ socketPath });
        expect(queue).toEqual([]);
    });

    it('includes on-disk history when all:true', async () => {
        await listen();
        const all = await client.sessions({ all: true, socketPath });
        expect(Array.isArray(all)).toBe(true);
    });
});

// The broker is the single writer of ~/.thinksuit/state.json; surfaces route
// designation writes through POST /designations.
describe('broker designations (single writer)', () => {
    let server;
    let socketPath;
    let dir;
    let prevStateFile;

    beforeEach(() => {
        dir = mkdtempSync(join(tmpdir(), 'ts-broker-desig-'));
        prevStateFile = process.env.THINKSUIT_STATE_FILE;
        process.env.THINKSUIT_STATE_FILE = join(dir, 'state.json');
    });

    afterEach(async () => {
        if (server) {
            await new Promise((resolve) => server.close(resolve));
            server = null;
        }
        if (prevStateFile === undefined) delete process.env.THINKSUIT_STATE_FILE;
        else process.env.THINKSUIT_STATE_FILE = prevStateFile;
        rmSync(dir, { recursive: true, force: true });
    });

    async function listen() {
        socketPath = join(tmpdir(), `ts-broker-test-${randomBytes(5).toString('hex')}.sock`);
        const broker = createBroker();
        server = broker.server;
        await new Promise((resolve, reject) => {
            server.once('error', reject);
            server.listen(socketPath, () => {
                server.removeListener('error', reject);
                resolve();
            });
        });
    }

    it('writes a designation and it lands in state.json', async () => {
        await listen();
        const res = await client.setDesignation('voice', 'S1', { socketPath });
        expect(res).toMatchObject({ ok: true, name: 'voice', sessionId: 'S1' });
        expect(listDesignations()).toEqual({ voice: 'S1' });
    });

    it('rejects an invalid designation name with a 400', async () => {
        await listen();
        await expect(client.setDesignation('bad name!', 'S1', { socketPath })).rejects.toThrow(
            /invalid designation name/i
        );
        // Broker stays healthy after the bad request.
        const h = await client.health({ socketPath });
        expect(h.ok).toBe(true);
    });

    it('rejects a missing sessionId with a 400', async () => {
        await listen();
        await expect(client.setDesignation('voice', '', { socketPath })).rejects.toThrow(
            /sessionId/i
        );
    });
});
