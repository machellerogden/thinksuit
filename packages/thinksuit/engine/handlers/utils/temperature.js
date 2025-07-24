/**
 * Get temperature setting for a given role from module configuration
 * @param {Object} module - Module containing instructionSchema
 * @param {string} role - Role to get temperature for
 * @param {number} fallback - Fallback temperature if not found (default: 0.7)
 * @returns {number} Temperature value between 0.0 and 1.0
 */
export function getTemperature(module, role, fallback = 0.7) {
    const roleTemp = module?.instructionSchema?.temperature?.[role];
    const defaultTemp = module?.instructionSchema?.temperature?.default;

    // Priority: role-specific > default > fallback
    if (roleTemp !== undefined) {
        return roleTemp;
    }

    if (defaultTemp !== undefined) {
        return defaultTemp;
    }

    return fallback;
}
