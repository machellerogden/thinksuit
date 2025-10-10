import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * Load modules from a package path
 * @param {string} modulesPackage - Path to modules package (absolute or relative)
 * @returns {Promise<Object>} Modules object
 */
export async function loadModules(modulesPackage) {
    try {
        // Resolve relative paths to absolute
        const absolutePath = resolve(modulesPackage);

        // Convert to file:// URL for import()
        const fileUrl = pathToFileURL(absolutePath).href;

        const imported = await import(fileUrl);
        return imported.modules || imported;
    } catch (error) {
        throw new Error(`Failed to load modules from ${modulesPackage}: ${error.message}`);
    }
}
