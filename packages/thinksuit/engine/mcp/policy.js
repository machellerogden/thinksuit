/**
 * MCP Tool Policy - filtering boundary between discovery and execution
 */

/**
 * Apply tool policy to filter discovered tools
 *
 * @param {Object} discoveredTools - All tools discovered from MCP servers
 * @param {Object} config - Configuration including optional allowedTools allowlist
 * @returns {Object} - Filtered tools based on policy
 */
export function applyToolPolicy(discoveredTools, config) {
    // No tools discovered - nothing to filter
    if (!discoveredTools || Object.keys(discoveredTools).length === 0) {
        return {};
    }

    // No restriction specified - return all discovered tools
    if (!config.allowedTools || config.allowedTools.length === 0) {
        return discoveredTools;
    }

    // Apply allowlist filtering
    const allowed = {};
    for (const [name, metadata] of Object.entries(discoveredTools)) {
        if (config.allowedTools.includes(name)) {
            allowed[name] = metadata;
        }
    }

    return allowed;
}

/**
 * Get list of filtered tool names for logging
 *
 * @param {Object} allTools - All discovered tools
 * @param {Object} allowedTools - Tools after policy filtering
 * @returns {string[]} - Names of tools that were filtered out
 */
export function getFilteredToolNames(allTools, allowedTools) {
    const allNames = Object.keys(allTools);
    const allowedNames = new Set(Object.keys(allowedTools));

    return allNames.filter(name => !allowedNames.has(name));
}