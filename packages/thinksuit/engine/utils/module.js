/**
 * Module utilities for working with module schemas
 */

/**
 * Find role configuration by name
 * @param {Object} module - Module with roles array
 * @param {string} roleName - Name of role to find
 * @returns {Object|null} Role configuration or null if not found
 */
export function getRoleConfig(module, roleName) {
    if (!module?.roles || !Array.isArray(module.roles)) {
        return null;
    }
    return module.roles.find(r => r.name === roleName) || null;
}

/**
 * Get default role from module
 * @param {Object} module - Module with roles array
 * @returns {Object|null} Default role configuration or null if no default
 */
export function getDefaultRole(module) {
    if (!module?.roles || !Array.isArray(module.roles)) {
        return null;
    }
    // Only return a role explicitly marked as default
    // Don't fall back to roles[0] - that's too implicit
    return module.roles.find(r => r.isDefault) || null;
}

/**
 * Get temperature for a role
 * @param {Object} module - Module with roles array
 * @param {string} roleName - Name of role
 * @param {number} fallback - Fallback temperature (default: 0.7)
 * @returns {number} Temperature value
 */
export function getRoleTemperature(module, roleName, fallback = 0.7) {
    const roleConfig = getRoleConfig(module, roleName);
    if (roleConfig?.temperature !== undefined) {
        return roleConfig.temperature;
    }

    // Try default role
    const defaultRole = getDefaultRole(module);
    if (defaultRole?.temperature !== undefined) {
        return defaultRole.temperature;
    }

    return fallback;
}

/**
 * Get all role names from module
 * @param {Object} module - Module with roles array
 * @returns {string[]} Array of role names
 */
export function getRoleNames(module) {
    if (!module?.roles || !Array.isArray(module.roles)) {
        return [];
    }
    return module.roles.map(r => r.name);
}
