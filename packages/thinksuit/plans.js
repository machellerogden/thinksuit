import { homedir } from 'node:os';
import { join } from 'node:path';
import {
    readArtifacts,
    writeArtifact,
    removeArtifact,
    mergeArtifacts
} from './artifacts/store.js';

const KIND = 'plans';
const EXT = '.json';

// Resolved at call time so tests (and callers) can redirect via env.
function userBase() {
    return process.env.THINKSUIT_ARTIFACTS_DIR || join(homedir(), '.thinksuit');
}

/**
 * A plan is a named plan.v1 node stored inline in the plans library:
 *   <name>.json → { name, description?, ...Node }   // the file *is* the root node
 * Filename (sans ext) is the address; `name`/`description` are authoring metadata
 * carried alongside the node fields (`type`, `role`, `children`, …).
 */
function parsePlan(name, raw) {
    const data = JSON.parse(raw);
    return {
        ...data,
        name: data.name || name,
        description: data.description || ''
    };
}

function serializePlan(entry) {
    // `id` (filename address) and `source` (module|user) are store-managed — never
    // persist them into the file body, which is the inline node itself.
    const node = { ...entry, description: entry.description || '' };
    delete node.id;
    delete node.source;
    return JSON.stringify(node, null, 2);
}

/**
 * Load plans for a module: module-shipped plans (from the module's own directory)
 * merged with the user's plans (`~/.thinksuit/plans/`), user winning on collision.
 *
 * @param {string} _moduleName - Full module name (unused; kept for call-site symmetry)
 * @param {Object} module - Module object; `module.dir` locates its on-disk artifacts
 * @returns {Promise<Array<Object>>} Plans with { id, name, description, plan, source }
 */
export async function loadPlans(_moduleName, module) {
    const modulePlans = module?.dir
        ? (await readArtifacts(module.dir, KIND, EXT, parsePlan)).map((p) => ({
            ...p,
            source: 'module'
        }))
        : [];
    const userPlans = (await readArtifacts(userBase(), KIND, EXT, parsePlan)).map((p) => ({
        ...p,
        source: 'user'
    }));
    return mergeArtifacts(modulePlans, userPlans);
}

/**
 * Get a specific plan by id (its filename address).
 */
export async function getPlan(planId, moduleName, module) {
    const plans = await loadPlans(moduleName, module);
    return plans.find((p) => p.id === planId) || null;
}

/**
 * Save a user plan to `~/.thinksuit/plans/<id>.json`.
 *
 * @param {Object} plan - { id, name, description, plan }
 * @returns {Promise<{ success: boolean, error?: string }>}
 */
export async function savePlan(plan) {
    try {
        if (!plan?.id) throw new Error('Plan id is required');
        await writeArtifact(userBase(), KIND, plan.id, EXT, serializePlan(plan));
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

/**
 * Delete a user plan. Module plans cannot be deleted.
 */
export async function deletePlan(planId) {
    try {
        await removeArtifact(userBase(), KIND, planId, EXT);
        return { success: true };
    } catch (error) {
        if (error.code === 'ENOENT') return { success: false, error: 'Plan not found' };
        return { success: false, error: error.message };
    }
}
