import matter from 'gray-matter';
import { homedir } from 'node:os';
import { join } from 'node:path';
import {
    readArtifacts,
    writeArtifact,
    removeArtifact,
    mergeArtifacts
} from './artifacts/store.js';

const KIND = 'frames';
const EXT = '.md';

// Resolved at call time so tests (and callers) can redirect via env.
function userBase() {
    return process.env.THINKSUIT_ARTIFACTS_DIR || join(homedir(), '.thinksuit');
}

/**
 * A frame is named context stored in the frames library:
 *   <name>.md → frontmatter (name, description) + body (the frame text).
 * Filename (sans ext) is the address.
 */
function parseFrame(name, raw) {
    const { data, content } = matter(raw);
    return {
        name: data.name || name,
        description: data.description || '',
        text: content.startsWith('\n') ? content.slice(1) : content
    };
}

function serializeFrame(entry) {
    return matter.stringify(entry.text || '', {
        name: entry.name,
        description: entry.description || ''
    });
}

/**
 * Load frames for a module: module-shipped frames (from the module's own
 * directory) merged with the user's frames (`~/.thinksuit/frames/`), user winning
 * on collision.
 *
 * @param {string} _moduleName - Full module name (unused; kept for call-site symmetry)
 * @param {Object} module - Module object; `module.dir` locates its on-disk artifacts
 * @returns {Promise<Array<Object>>} Frames with { id, name, description, text, source }
 */
export async function loadFrames(_moduleName, module) {
    const moduleFrames = module?.dir
        ? (await readArtifacts(module.dir, KIND, EXT, parseFrame)).map((f) => ({
              ...f,
              source: 'module'
          }))
        : [];
    const userFrames = (await readArtifacts(userBase(), KIND, EXT, parseFrame)).map((f) => ({
        ...f,
        source: 'user'
    }));
    return mergeArtifacts(moduleFrames, userFrames);
}

/**
 * Get a specific frame by id (its filename address).
 */
export async function getFrame(frameId, moduleName, module) {
    const frames = await loadFrames(moduleName, module);
    return frames.find((f) => f.id === frameId) || null;
}

/**
 * Save a user frame to `~/.thinksuit/frames/<id>.md`.
 *
 * @param {Object} frame - { id, name, description, text }
 * @returns {Promise<{ success: boolean, error?: string }>}
 */
export async function saveFrame(frame) {
    try {
        if (!frame?.id) throw new Error('Frame id is required');
        await writeArtifact(userBase(), KIND, frame.id, EXT, serializeFrame(frame));
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

/**
 * Delete a user frame. Module frames cannot be deleted.
 */
export async function deleteFrame(frameId) {
    try {
        await removeArtifact(userBase(), KIND, frameId, EXT);
        return { success: true };
    } catch (error) {
        if (error.code === 'ENOENT') return { success: false, error: 'Frame not found' };
        return { success: false, error: error.message };
    }
}
