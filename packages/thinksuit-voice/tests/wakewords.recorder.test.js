import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Mock the PortAudio capture and the daemon control client so the recorder can be
// exercised with no native modules and no running daemon.
const h = vi.hoisted(() => ({ frameCb: null, status: 'down' }));

vi.mock('../src/audio/capture.js', () => ({
    createCapture: ({ onFrames }) => {
        h.frameCb = onFrames;
        return { start: () => {}, stop: () => {} };
    }
}));

vi.mock('../src/control/client.js', () => ({
    status: async () => {
        if (h.status === 'down') throw new Error('ThinkSuit voice daemon is not running.');
        return h.status;
    }
}));

const recorder = await import('../src/wakewords/recorder.js');

describe('recorder', () => {
    beforeEach(() => {
        h.frameCb = null;
        h.status = 'down';
    });

    it('trims to the spoken region with padding', () => {
        const s = new Int16Array(16000); // 1s of silence
        for (let i = 8000; i < 8500; i++) s[i] = 12000; // a burst in the middle
        const t = recorder.trim(s);
        expect(t.length).toBeLessThan(s.length);
        expect(t.length).toBeGreaterThan(500);
    });

    it('writes a valid 16k mono PCM wav', () => {
        const dir = mkdtempSync(join(tmpdir(), 'ts-rec-'));
        const path = join(dir, 'clip.wav');
        const samples = new Int16Array([0, 100, -100, 32767, -32768]);
        recorder.writeWavFile(path, samples);
        const buf = readFileSync(path);
        expect(buf.toString('latin1', 0, 4)).toBe('RIFF');
        expect(buf.toString('latin1', 8, 12)).toBe('WAVE');
        expect(buf.readUInt32LE(24)).toBe(16000); // sample rate
        expect(buf.readUInt16LE(22)).toBe(1); // mono
        expect(buf.readUInt32LE(40)).toBe(samples.length * 2); // data bytes
        expect(buf.readInt16LE(44 + 3 * 2)).toBe(32767);
    });

    it('captureClip collects only frames pushed during the window', async () => {
        const session = await recorder.createRecorderSession({ deviceId: -1 });
        const p = session.captureClip(0.03);
        // collecting is true synchronously before the await, so these are kept;
        h.frameCb(new Int16Array([1, 2, 3]));
        h.frameCb(new Int16Array([4, 5]));
        const out = await p;
        expect(Array.from(out)).toEqual([1, 2, 3, 4, 5]);
        // frames after the window are ignored.
        h.frameCb(new Int16Array([9, 9]));
        const p2 = session.captureClip(0.03);
        const out2 = await p2;
        expect(out2.length).toBe(0);
        session.close();
    });

    it('assertMicAvailable refuses when the daemon holds the mic', async () => {
        h.status = { micOn: true };
        await expect(recorder.assertMicAvailable()).rejects.toThrow(/holds the mic/);
    });

    it('assertMicAvailable proceeds when the daemon is down or mic is off', async () => {
        h.status = 'down';
        await expect(recorder.assertMicAvailable()).resolves.toBeUndefined();
        h.status = { micOn: false };
        await expect(recorder.assertMicAvailable()).resolves.toBeUndefined();
    });
});
