import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pino } from '../../engine/logger.js';
import { InterruptError } from '../../engine/errors/InterruptError.js';

// The one primitive the loop actually calls out to. Everything else — plan resolution,
// v1→v2 adaptation, composition, the loop, the composer — runs for real.
vi.mock('../../engine/providers/io.js', () => ({ callLLM: vi.fn() }));

import { executeOnce, formatFinalResult } from '../../engine/run/internals.js';
import { callLLM } from '../../engine/providers/io.js';
import { validateTurnResult } from '../../schemas/validate.js';
import { modules } from 'thinksuit-modules';

const mu = modules['thinksuit/mu'];

const makeLogger = () => {
    const logger = pino({ level: 'silent' });
    logger.child = () => logger;
    logger.bindings = () => ({ traceId: 'flip-trace' });
    return logger;
};

const baseParams = (overrides = {}) => ({
    finalConfig: {
        sessionId: 'flip-session',
        module: 'thinksuit/mu',
        model: 'gpt-4o-mini',
        frame: null,
        modality: null,
        ...overrides.finalConfig
    },
    logger: makeLogger(),
    module: mu,
    discoveredTools: {},
    thread: [],
    input: 'hello there',
    abortSignal: null,
    turnBoundaryId: 'turn-1',
    ...overrides
});

describe('turn executes through executePlan (real turn, mocked provider)', () => {
    let artifactsDir;
    let prevArtifactsDir;

    beforeEach(() => {
        vi.clearAllMocks();
        // Isolate plan resolution to the module's own library (no dev user plans).
        prevArtifactsDir = process.env.THINKSUIT_ARTIFACTS_DIR;
        artifactsDir = mkdtempSync(join(tmpdir(), 'thinksuit-flip-'));
        process.env.THINKSUIT_ARTIFACTS_DIR = artifactsDir;
    });

    afterEach(() => {
        if (artifactsDir) rmSync(artifactsDir, { recursive: true, force: true });
        if (prevArtifactsDir === undefined) delete process.env.THINKSUIT_ARTIFACTS_DIR;
        else process.env.THINKSUIT_ARTIFACTS_DIR = prevArtifactsDir;
    });

    it('resolves the module default plan and produces a conformant success turn', async () => {
        callLLM.mockResolvedValue({
            output: 'the canned answer',
            usage: { prompt: 5, completion: 3 },
            model: 'gpt-4o-mini',
            finishReason: 'end_turn'
        });

        const [status, result] = await executeOnce(baseParams());

        expect(status).toBe('SUCCEEDED');
        expect(result.handlerResult.response.output).toBe('the canned answer');
        expect(callLLM).toHaveBeenCalledTimes(1);

        // The turn boundary must render into a turnResult-conformant shape.
        const out = formatFinalResult(status, result, 'flip-session', makeLogger(), 'turn-1', 'session-1');
        expect(out.success).toBe(true);
        expect(out.response).toBe('the canned answer');
        expect(validateTurnResult(JSON.parse(JSON.stringify(out))).valid).toBe(true);
    });

    it('honors an explicit v1 selectedPlan without touching the library', async () => {
        callLLM.mockResolvedValue({
            output: 'chat reply',
            usage: { prompt: 2, completion: 2 },
            model: 'gpt-4o-mini',
            finishReason: 'end_turn'
        });

        const params = baseParams({
            finalConfig: { selectedPlan: { strategy: 'direct', role: 'chat', lengthLevel: 'brief' } }
        });
        const [status, result] = await executeOnce(params);

        expect(status).toBe('SUCCEEDED');
        expect(result.handlerResult.response.output).toBe('chat reply');
    });

    it('surfaces an interrupt as the interrupted turn outcome', async () => {
        callLLM.mockRejectedValue(new InterruptError('user stop', { stage: 'test' }));

        const [status, result] = await executeOnce(baseParams());

        expect(status).toBe('interrupted');
        expect(result.interrupted).toBe(true);

        const logger = makeLogger();
        const events = [];
        logger.info = (entry) => events.push(entry.event);
        const out = formatFinalResult(status, result, 'flip-session', logger, 'turn-1', 'session-1');
        expect(out.success).toBe(false);
        expect(events).toContain('session.interrupted');
        expect(events).not.toContain('session.response');
    });
});
