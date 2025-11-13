import { homedir } from 'node:os';
import { join } from 'node:path';
import { readFile, writeFile, access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { DEFAULT_CONFIG_FILE } from './engine/constants/defaults.js';

/**
 * Load presets for a given module
 * Merges module presets with user-defined presets from config file
 *
 * @param {string} moduleName - Full module name (e.g., 'thinksuit/mu')
 * @param {Object} module - Module object with presets property
 * @returns {Promise<Array<Object>>} Array of preset objects with { id, name, description, plan, source }
 */
export async function loadPresets(moduleName, module) {
    const presets = [];

    // 1. Load module presets (built-in)
    const modulePresets = module?.presets || {};
    for (const [id, preset] of Object.entries(modulePresets)) {
        presets.push({
            id,
            name: preset.name || id,
            description: preset.description || '',
            plan: preset.plan,
            source: 'module'
        });
    }

    // 2. Load user presets from config file
    const configPath = join(homedir(), DEFAULT_CONFIG_FILE);
    try {
        await access(configPath, constants.F_OK);
        const configContent = await readFile(configPath, 'utf-8');
        const config = JSON.parse(configContent);

        // User presets are stored per-module
        const userPresets = config.presets?.[moduleName] || [];
        for (const preset of userPresets) {
            presets.push({
                ...preset,
                source: 'user'
            });
        }
    } catch (error) {
        // If config file doesn't exist or is malformed, just use module presets
        if (error.code !== 'ENOENT') {
            console.warn(`Warning: Could not load user presets from ${configPath}: ${error.message}`);
        }
    }

    return presets;
}

/**
 * Get a specific preset by ID
 *
 * @param {string} presetId - Preset ID to find
 * @param {string} moduleName - Full module name
 * @param {Object} module - Module object
 * @returns {Promise<Object|null>} Preset object or null if not found
 */
export async function getPreset(presetId, moduleName, module) {
    const presets = await loadPresets(moduleName, module);
    return presets.find(p => p.id === presetId) || null;
}

/**
 * Save a user preset to config file
 *
 * @param {string} moduleName - Full module name
 * @param {Object} preset - Preset object { id, name, description, plan }
 * @returns {Promise<Object>} { success: boolean, error?: string }
 */
export async function savePreset(moduleName, preset) {
    const configPath = join(homedir(), DEFAULT_CONFIG_FILE);

    try {
        // Load existing config or create empty
        let config = {};
        try {
            await access(configPath, constants.F_OK);
            const configContent = await readFile(configPath, 'utf-8');
            config = JSON.parse(configContent);
        } catch (error) {
            // File doesn't exist, start with empty config
            if (error.code !== 'ENOENT') {
                throw error;
            }
        }

        // Ensure presets structure exists
        if (!config.presets) {
            config.presets = {};
        }
        if (!config.presets[moduleName]) {
            config.presets[moduleName] = [];
        }

        // Check if preset with this ID already exists
        const existingIndex = config.presets[moduleName].findIndex(p => p.id === preset.id);

        if (existingIndex >= 0) {
            // Update existing preset
            config.presets[moduleName][existingIndex] = {
                id: preset.id,
                name: preset.name,
                description: preset.description || '',
                plan: preset.plan
            };
        } else {
            // Add new preset
            config.presets[moduleName].push({
                id: preset.id,
                name: preset.name,
                description: preset.description || '',
                plan: preset.plan
            });
        }

        // Write back to file
        await writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');

        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

/**
 * Delete a user preset from config file
 * Module presets cannot be deleted
 *
 * @param {string} moduleName - Full module name
 * @param {string} presetId - Preset ID to delete
 * @returns {Promise<Object>} { success: boolean, error?: string }
 */
export async function deletePreset(moduleName, presetId) {
    const configPath = join(homedir(), DEFAULT_CONFIG_FILE);

    try {
        await access(configPath, constants.F_OK);
    } catch (error) {
        return { success: false, error: 'Config file does not exist' };
    }

    try {
        const configContent = await readFile(configPath, 'utf-8');
        const config = JSON.parse(configContent);

        if (!config.presets?.[moduleName]) {
            return { success: false, error: 'No presets found for this module' };
        }

        // Find and remove preset
        const index = config.presets[moduleName].findIndex(p => p.id === presetId);
        if (index < 0) {
            return { success: false, error: 'Preset not found' };
        }

        config.presets[moduleName].splice(index, 1);

        // Write back to file
        await writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');

        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
}
