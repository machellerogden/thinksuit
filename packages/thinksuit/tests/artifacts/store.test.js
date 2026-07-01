import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
    readArtifacts,
    writeArtifact,
    removeArtifact,
    mergeArtifacts
} from '../../artifacts/store.js';

const EXT = '.json';
const parse = (name, raw) => ({ name, value: JSON.parse(raw).value });

function seed(baseDir, kind, files) {
    mkdirSync(join(baseDir, kind), { recursive: true });
    for (const [name, value] of Object.entries(files)) {
        writeFileSync(join(baseDir, kind, `${name}${EXT}`), JSON.stringify({ value }), 'utf-8');
    }
}

describe('artifacts/store', () => {
    let dir;

    beforeEach(() => {
        dir = mkdtempSync(join(tmpdir(), 'ts-store-'));
    });

    afterEach(() => {
        rmSync(dir, { recursive: true, force: true });
    });

    it('returns [] when the kind directory does not exist', async () => {
        expect(await readArtifacts(dir, 'plans', EXT, parse)).toEqual([]);
    });

    it('reads every definition file, attaching id = filename address', async () => {
        seed(dir, 'plans', { chat: 1, capture: 2 });
        const entries = await readArtifacts(dir, 'plans', EXT, parse);
        expect(entries).toHaveLength(2);
        expect(entries.map((e) => e.id).sort()).toEqual(['capture', 'chat']);
        expect(entries.find((e) => e.id === 'chat').value).toBe(1);
    });

    it('ignores files that do not match the extension', async () => {
        seed(dir, 'plans', { chat: 1 });
        writeFileSync(join(dir, 'plans', 'notes.md'), 'ignore me', 'utf-8');
        const entries = await readArtifacts(dir, 'plans', EXT, parse);
        expect(entries.map((e) => e.id)).toEqual(['chat']);
    });

    it('absent overlay → directory order (all returned)', async () => {
        seed(dir, 'plans', { a: 1, b: 2, c: 3 });
        const ids = (await readArtifacts(dir, 'plans', EXT, parse)).map((e) => e.id);
        expect(ids.sort()).toEqual(['a', 'b', 'c']);
    });

    it('overlay orders by name list', async () => {
        seed(dir, 'plans', { a: 1, b: 2, c: 3 });
        writeFileSync(join(dir, 'plans.json'), JSON.stringify(['c', 'a', 'b']), 'utf-8');
        const ids = (await readArtifacts(dir, 'plans', EXT, parse)).map((e) => e.id);
        expect(ids).toEqual(['c', 'a', 'b']);
    });

    it('names absent from the overlay are still returned, after the listed ones', async () => {
        seed(dir, 'plans', { a: 1, b: 2, c: 3 });
        writeFileSync(join(dir, 'plans.json'), JSON.stringify(['c']), 'utf-8');
        const ids = (await readArtifacts(dir, 'plans', EXT, parse)).map((e) => e.id);
        expect(ids[0]).toBe('c');
        expect(ids.slice(1).sort()).toEqual(['a', 'b']);
    });

    it('write + remove round-trips a single definition file', async () => {
        await writeArtifact(dir, 'plans', 'mine', EXT, JSON.stringify({ value: 42 }));
        expect(existsSync(join(dir, 'plans', 'mine.json'))).toBe(true);

        const entries = await readArtifacts(dir, 'plans', EXT, parse);
        expect(entries).toEqual([{ name: 'mine', value: 42, id: 'mine' }]);

        await removeArtifact(dir, 'plans', 'mine', EXT);
        expect(existsSync(join(dir, 'plans', 'mine.json'))).toBe(false);
    });

    it('merge: later lists win on id collision, insertion order preserved', () => {
        const moduleEntries = [
            { id: 'chat', source: 'module' },
            { id: 'capture', source: 'module' }
        ];
        const userEntries = [
            { id: 'chat', source: 'user' },
            { id: 'mine', source: 'user' }
        ];
        const merged = mergeArtifacts(moduleEntries, userEntries);
        expect(merged.map((e) => e.id)).toEqual(['chat', 'capture', 'mine']);
        expect(merged.find((e) => e.id === 'chat').source).toBe('user');
    });
});
