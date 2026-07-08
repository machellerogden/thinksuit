import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveEnv, clearEnvCache } from '../src/env.js';

describe('resolveEnv', () => {
    let dir;
    let prevFile;

    beforeEach(() => {
        clearEnvCache();
        dir = mkdtempSync(join(tmpdir(), 'ts-env-'));
        prevFile = process.env.THINKSUIT_ENV_FILE;
    });

    afterEach(() => {
        clearEnvCache();
        if (prevFile === undefined) delete process.env.THINKSUIT_ENV_FILE;
        else process.env.THINKSUIT_ENV_FILE = prevFile;
        rmSync(dir, { recursive: true, force: true });
    });

    function writeEnvFile(contents) {
        const p = join(dir, '.env');
        writeFileSync(p, contents);
        process.env.THINKSUIT_ENV_FILE = p;
        clearEnvCache();
        return p;
    }

    it('prefers the process environment over the file', () => {
        writeEnvFile('TS_TEST_A=fromfile');
        process.env.TS_TEST_A = 'fromenv';
        try {
            expect(resolveEnv('TS_TEST_A')).toBe('fromenv');
        } finally {
            delete process.env.TS_TEST_A;
        }
    });

    it('reads a value from the env file when not in process env', () => {
        delete process.env.TS_TEST_B;
        writeEnvFile('TS_TEST_B=frombar');
        expect(resolveEnv('TS_TEST_B')).toBe('frombar');
    });

    it('handles comments, blanks, padding, and quoted values', () => {
        writeEnvFile(
            [
                '# a comment',
                '',
                'TS_TEST_PLAIN=plain',
                'TS_TEST_DQ="double quoted"',
                "TS_TEST_SQ='single quoted'",
                '   TS_TEST_PAD = padded '
            ].join('\n')
        );
        expect(resolveEnv('TS_TEST_PLAIN')).toBe('plain');
        expect(resolveEnv('TS_TEST_DQ')).toBe('double quoted');
        expect(resolveEnv('TS_TEST_SQ')).toBe('single quoted');
        expect(resolveEnv('TS_TEST_PAD')).toBe('padded');
    });

    it('returns undefined when the file is absent (process-env-only)', () => {
        process.env.THINKSUIT_ENV_FILE = join(dir, 'does-not-exist.env');
        clearEnvCache();
        expect(resolveEnv('TS_TEST_MISSING')).toBeUndefined();
    });

    it('returns undefined for a name set nowhere', () => {
        writeEnvFile('TS_TEST_C=present');
        expect(resolveEnv('TS_TEST_NOPE')).toBeUndefined();
    });

    it('memoizes the file (re-read only after clearEnvCache)', () => {
        const p = writeEnvFile('TS_TEST_M=v1');
        expect(resolveEnv('TS_TEST_M')).toBe('v1');
        writeFileSync(p, 'TS_TEST_M=v2'); // change on disk, no cache clear
        expect(resolveEnv('TS_TEST_M')).toBe('v1'); // still cached
        clearEnvCache();
        expect(resolveEnv('TS_TEST_M')).toBe('v2');
    });
});
