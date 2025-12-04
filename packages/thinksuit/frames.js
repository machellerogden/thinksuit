import { homedir } from 'node:os';
import { join } from 'node:path';
import { readFile, writeFile, access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { DEFAULT_CONFIG_FILE } from './engine/constants/defaults.js';

/**
 * Load frames for a given module
 * Merges module frames with user-defined frames from config file
 *
 * @param {string} moduleName - Full module name (e.g., 'thinksuit/mu')
 * @param {Object} module - Module object with frames property
 * @returns {Promise<Array<Object>>} Array of frame objects with { id, name, description, text, source }
 */
export async function loadFrames(moduleName, module) {
    const frames = [];

    // 1. Load module frames (built-in)
    const moduleFrames = module?.frames || [];
    for (const frame of moduleFrames) {
        frames.push({
            id: frame.id || frame.name?.toLowerCase().replace(/\s+/g, '-'),
            name: frame.name,
            description: frame.description || '',
            text: frame.text,
            source: 'module'
        });
    }

    // 2. Load user frames from config file
    const configPath = join(homedir(), DEFAULT_CONFIG_FILE);
    try {
        await access(configPath, constants.F_OK);
        const configContent = await readFile(configPath, 'utf-8');
        const config = JSON.parse(configContent);

        // User frames are stored per-module
        const userFrames = config.frames?.[moduleName] || [];
        for (const frame of userFrames) {
            frames.push({
                ...frame,
                source: 'user'
            });
        }
    } catch (error) {
        // If config file doesn't exist or is malformed, just use module frames
        if (error.code !== 'ENOENT') {
            console.warn(`Warning: Could not load user frames from ${configPath}: ${error.message}`);
        }
    }

    return frames;
}

/**
 * Get a specific frame by ID
 *
 * @param {string} frameId - Frame ID to find
 * @param {string} moduleName - Full module name
 * @param {Object} module - Module object
 * @returns {Promise<Object|null>} Frame object or null if not found
 */
export async function getFrame(frameId, moduleName, module) {
    const frames = await loadFrames(moduleName, module);
    return frames.find(f => f.id === frameId) || null;
}

/**
 * Save a user frame to config file
 *
 * @param {string} moduleName - Full module name
 * @param {Object} frame - Frame object { id, name, description, text }
 * @returns {Promise<Object>} { success: boolean, error?: string }
 */
export async function saveFrame(moduleName, frame) {
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

        // Ensure frames structure exists
        if (!config.frames) {
            config.frames = {};
        }
        if (!config.frames[moduleName]) {
            config.frames[moduleName] = [];
        }

        // Check if frame with this ID already exists
        const existingIndex = config.frames[moduleName].findIndex(f => f.id === frame.id);

        if (existingIndex >= 0) {
            // Update existing frame
            config.frames[moduleName][existingIndex] = {
                id: frame.id,
                name: frame.name,
                description: frame.description || '',
                text: frame.text
            };
        } else {
            // Add new frame
            config.frames[moduleName].push({
                id: frame.id,
                name: frame.name,
                description: frame.description || '',
                text: frame.text
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
 * Delete a user frame from config file
 * Module frames cannot be deleted
 *
 * @param {string} moduleName - Full module name
 * @param {string} frameId - Frame ID to delete
 * @returns {Promise<Object>} { success: boolean, error?: string }
 */
export async function deleteFrame(moduleName, frameId) {
    const configPath = join(homedir(), DEFAULT_CONFIG_FILE);

    try {
        await access(configPath, constants.F_OK);
    } catch (error) {
        return { success: false, error: 'Config file does not exist' };
    }

    try {
        const configContent = await readFile(configPath, 'utf-8');
        const config = JSON.parse(configContent);

        if (!config.frames?.[moduleName]) {
            return { success: false, error: 'No frames found for this module' };
        }

        // Find and remove frame
        const index = config.frames[moduleName].findIndex(f => f.id === frameId);
        if (index < 0) {
            return { success: false, error: 'Frame not found' };
        }

        config.frames[moduleName].splice(index, 1);

        // Write back to file
        await writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');

        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
}
