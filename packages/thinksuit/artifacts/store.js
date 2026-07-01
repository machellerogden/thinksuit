import { join, extname, basename } from 'node:path';
import { readdir, readFile, writeFile, unlink, mkdir } from 'node:fs/promises';

/**
 * Generic, kind-agnostic artifact store.
 *
 * An artifact "kind" (e.g. 'plans', 'frames') is a folder of self-describing
 * definition files under a base directory, plus an optional sibling overlay file
 * `<baseDir>/<kind>.json` that is simply an ordered array of names. The overlay
 * only orders; it does not gate membership — every definition file is returned.
 * A definition file's address is its filename without extension.
 */

/**
 * Read the ordering overlay (an array of names) for a kind.
 * Absent overlay returns null (meaning: use directory order).
 */
async function readOverlay(baseDir, kind) {
    try {
        const raw = await readFile(join(baseDir, `${kind}.json`), 'utf-8');
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : null;
    } catch (error) {
        if (error.code === 'ENOENT') return null;
        throw error;
    }
}

/**
 * Sort entries by an ordered name list. Names present in the overlay come first
 * in overlay order; names absent from it keep their directory order at the end.
 */
function sortByOverlay(entries, order) {
    if (!order || order.length === 0) return entries;
    const rank = new Map(order.map((name, i) => [name, i]));
    return entries
        .map((entry, i) => ({ entry, i }))
        .sort((a, b) => {
            const ar = rank.has(a.entry.id) ? rank.get(a.entry.id) : Infinity;
            const br = rank.has(b.entry.id) ? rank.get(b.entry.id) : Infinity;
            return ar === br ? a.i - b.i : ar - br;
        })
        .map(({ entry }) => entry);
}

/**
 * Read every definition of a kind from a base directory.
 *
 * @param {string} baseDir - Base directory containing `<kind>/` and optional `<kind>.json`
 * @param {string} kind - Artifact kind (folder name)
 * @param {string} ext - File extension to match (e.g. '.json', '.md')
 * @param {(name: string, raw: string) => object} parse - Maps filename + contents to an entry
 * @returns {Promise<Array<object>>} Entries, each with `id` (= filename address), ordered by overlay
 */
export async function readArtifacts(baseDir, kind, ext, parse) {
    const dir = join(baseDir, kind);
    let files;
    try {
        files = await readdir(dir);
    } catch (error) {
        if (error.code === 'ENOENT') return [];
        throw error;
    }

    const entries = [];
    for (const file of files) {
        if (extname(file) !== ext) continue;
        const id = basename(file, ext);
        let raw;
        try {
            raw = await readFile(join(dir, file), 'utf-8');
        } catch (error) {
            if (error.code === 'EISDIR' || error.code === 'ENOENT') continue;
            throw error;
        }
        const parsed = parse(id, raw);
        if (parsed) entries.push({ ...parsed, id });
    }

    return sortByOverlay(entries, await readOverlay(baseDir, kind));
}

/**
 * Write a single definition file (user space).
 *
 * @param {string} baseDir - Base directory
 * @param {string} kind - Artifact kind (folder name)
 * @param {string} name - Address (filename without extension)
 * @param {string} ext - File extension
 * @param {string} contents - Serialized file contents
 */
export async function writeArtifact(baseDir, kind, name, ext, contents) {
    const dir = join(baseDir, kind);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, `${name}${ext}`), contents, 'utf-8');
}

/**
 * Delete a single definition file (user space).
 */
export async function removeArtifact(baseDir, kind, name, ext) {
    await unlink(join(baseDir, kind, `${name}${ext}`));
}

/**
 * Merge artifact lists by id; later lists win on collision. Insertion order is
 * preserved, so an overridden entry keeps the position of its first appearance.
 *
 * @param {...Array<object>} lists - Entry lists in increasing precedence
 * @returns {Array<object>}
 */
export function mergeArtifacts(...lists) {
    const byId = new Map();
    for (const list of lists) {
        for (const entry of list) {
            byId.set(entry.id, entry);
        }
    }
    return [...byId.values()];
}
