import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
    listDesignations,
    getDesignation,
    setDesignation
} from '../engine/designations/index.js';

describe('designations', () => {
    let dir;
    let prevFile;

    beforeEach(() => {
        dir = mkdtempSync(join(tmpdir(), 'ts-designations-'));
        prevFile = process.env.THINKSUIT_STATE_FILE;
        process.env.THINKSUIT_STATE_FILE = join(dir, 'state.json');
    });

    afterEach(() => {
        if (prevFile === undefined) delete process.env.THINKSUIT_STATE_FILE;
        else process.env.THINKSUIT_STATE_FILE = prevFile;
        rmSync(dir, { recursive: true, force: true });
    });

    it('returns empty when no state file exists', () => {
        expect(listDesignations()).toEqual({});
        expect(getDesignation('voice')).toBeNull();
    });

    it('set/get/list round-trips and creates the file', () => {
        setDesignation('voice', 'sess-1');
        expect(getDesignation('voice')).toBe('sess-1');
        expect(listDesignations()).toEqual({ voice: 'sess-1' });

        const onDisk = JSON.parse(readFileSync(process.env.THINKSUIT_STATE_FILE, 'utf-8'));
        expect(onDisk).toEqual({ designations: { voice: 'sess-1' } });
    });

    it('repoints a name (cardinality-one) and keeps other names', () => {
        setDesignation('voice', 'sess-1');
        setDesignation('home', 'sess-2');
        setDesignation('voice', 'sess-3'); // repoint
        expect(listDesignations()).toEqual({ voice: 'sess-3', home: 'sess-2' });
    });

    it('allows two names to point at the same session (session -> names is many)', () => {
        setDesignation('voice', 'sess-1');
        setDesignation('home', 'sess-1');
        expect(getDesignation('voice')).toBe('sess-1');
        expect(getDesignation('home')).toBe('sess-1');
    });

    it('preserves unrelated keys already in state.json', () => {
        setDesignation('voice', 'sess-1');
        const path = process.env.THINKSUIT_STATE_FILE;
        const state = JSON.parse(readFileSync(path, 'utf-8'));
        state.somethingElse = { keep: true };
        // write it back, then confirm a later set preserves the unrelated key
        writeFileSync(path, JSON.stringify(state, null, 4));
        setDesignation('home', 'sess-2');
        const after = JSON.parse(readFileSync(path, 'utf-8'));
        expect(after.somethingElse).toEqual({ keep: true });
        expect(after.designations).toEqual({ voice: 'sess-1', home: 'sess-2' });
    });

    it('rejects invalid names and empty sessionIds', () => {
        expect(() => setDesignation('bad name', 'sess-1')).toThrow(/invalid designation name/);
        expect(() => setDesignation('voice', '')).toThrow(/non-empty sessionId/);
    });
});
