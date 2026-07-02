import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeFileSync, readFileSync, rmSync, mkdtempSync } from 'node:fs';
import { setDesignation, getDesignation, listDesignations } from '../../engine/designations/index.js';

describe('designations', () => {
    let dir;
    let statePath;
    let prev;

    beforeEach(() => {
        dir = mkdtempSync(join(tmpdir(), 'ts-desig-'));
        statePath = join(dir, 'state.json');
        prev = process.env.THINKSUIT_STATE_FILE;
        process.env.THINKSUIT_STATE_FILE = statePath;
    });

    afterEach(() => {
        if (prev === undefined) delete process.env.THINKSUIT_STATE_FILE;
        else process.env.THINKSUIT_STATE_FILE = prev;
        rmSync(dir, { recursive: true, force: true });
    });

    it('setting one designation does not disturb the others', () => {
        setDesignation('voice', 'S1');
        setDesignation('home', 'S2');
        expect(getDesignation('voice')).toBe('S1');
        expect(getDesignation('home')).toBe('S2');
    });

    it('a corrupt state file is not silently overwritten (which would wipe all designations)', () => {
        // Two designations already recorded.
        setDesignation('voice', 'S1');
        setDesignation('home', 'S2');

        // The file gets corrupted (e.g. a truncated/interrupted write).
        writeFileSync(statePath, '{ "designations": { "voice": "S1", ', 'utf-8');

        // Writing a new designation must NOT silently clobber the file down to just
        // the new key — it should refuse rather than destroy the other designations.
        expect(() => setDesignation('scratch', 'S3')).toThrow();

        // The corrupt file was left intact, not overwritten with only { scratch }.
        const raw = readFileSync(statePath, 'utf-8');
        expect(raw).not.toContain('scratch');
    });
});
