import { readFile } from 'node:fs/promises';
import { getTraceFilePath } from './utils/paths.js';
import { exists } from './utils/fs.js';

/**
 * Get full trace data
 * @param {string} traceId
 * @returns {Promise<Object|null>}
 */
export async function getTrace(traceId) {
    const filePath = getTraceFilePath(traceId);

    if (!(await exists(filePath))) {
        return null;
    }

    try {
        const content = await readFile(filePath, 'utf-8');
        const lines = content.trim().split('\n').filter(Boolean);

        const entries = lines
            .map((line) => {
                try {
                    return JSON.parse(line);
                } catch {
                    return null;
                }
            })
            .filter(Boolean);

        return {
            id: traceId,
            entries,
            metadata: {
                entryCount: entries.length,
                filePath
            }
        };
    } catch (error) {
        console.error(`Error reading trace ${traceId}:`, error);
        return null;
    }
}
