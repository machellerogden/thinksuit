import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveSecret, clearSecretsCache } from '../src/secrets.js';

describe('resolveSecret', () => {
    let dir;
    let prevFile;

    beforeEach(() => {
        clearSecretsCache();
        dir = mkdtempSync(join(tmpdir(), 'ts-secrets-'));
        prevFile = process.env.THINKSUIT_SECRETS_FILE;
    });

    afterEach(() => {
        clearSecretsCache();
        if (prevFile === undefined) delete process.env.THINKSUIT_SECRETS_FILE;
        else process.env.THINKSUIT_SECRETS_FILE = prevFile;
        rmSync(dir, { recursive: true, force: true });
    });

    function writeSecrets(contents) {
        const p = join(dir, 'secrets.env');
        writeFileSync(p, contents);
        process.env.THINKSUIT_SECRETS_FILE = p;
        clearSecretsCache();
        return p;
    }

    it('prefers the environment over the file', () => {
        writeSecrets('TS_TEST_A=fromfile');
        process.env.TS_TEST_A = 'fromenv';
        try {
            expect(resolveSecret('TS_TEST_A')).toBe('fromenv');
        } finally {
            delete process.env.TS_TEST_A;
        }
    });

    it('reads a value from the secrets file when not in env', () => {
        delete process.env.TS_TEST_B;
        writeSecrets('TS_TEST_B=frombar');
        expect(resolveSecret('TS_TEST_B')).toBe('frombar');
    });

    it('handles comments, blanks, padding, and quoted values', () => {
        writeSecrets(
            [
                '# a comment',
                '',
                'TS_TEST_PLAIN=plain',
                'TS_TEST_DQ="double quoted"',
                "TS_TEST_SQ='single quoted'",
                '   TS_TEST_PAD = padded '
            ].join('\n')
        );
        expect(resolveSecret('TS_TEST_PLAIN')).toBe('plain');
        expect(resolveSecret('TS_TEST_DQ')).toBe('double quoted');
        expect(resolveSecret('TS_TEST_SQ')).toBe('single quoted');
        expect(resolveSecret('TS_TEST_PAD')).toBe('padded');
    });

    it('returns undefined when the file is absent (env-only)', () => {
        process.env.THINKSUIT_SECRETS_FILE = join(dir, 'does-not-exist.env');
        clearSecretsCache();
        expect(resolveSecret('TS_TEST_MISSING')).toBeUndefined();
    });

    it('returns undefined for a name set nowhere', () => {
        writeSecrets('TS_TEST_C=present');
        expect(resolveSecret('TS_TEST_NOPE')).toBeUndefined();
    });

    it('memoizes the file (re-read only after clearSecretsCache)', () => {
        const p = writeSecrets('TS_TEST_M=v1');
        expect(resolveSecret('TS_TEST_M')).toBe('v1');
        writeFileSync(p, 'TS_TEST_M=v2'); // change on disk, no cache clear
        expect(resolveSecret('TS_TEST_M')).toBe('v1'); // still cached
        clearSecretsCache();
        expect(resolveSecret('TS_TEST_M')).toBe('v2');
    });
});
