/**
 * MCP Tool Validation
 * Validates that module tool dependencies are satisfied by discovered MCP tools
 */

/**
 * Validate that all module tool dependencies are available
 * @param {Object} module - Module with toolDependencies array
 * @param {Object} discoveredTools - Tools discovered from MCP servers
 * @throws {Error} If required tools are missing
 *
 * @example
 * const module = {
 *     toolDependencies: [
 *         { name: 'read_file', description: 'Read file contents' },
 *         { name: 'write_file', description: 'Write file contents' }
 *     ]
 * };
 *
 * const discoveredTools = {
 *     read_file: { name: 'read_file', ... },
 *     list_directory: { name: 'list_directory', ... }
 * };
 *
 * validateToolDependencies(module, discoveredTools);
 * // Throws: Error with message about missing write_file
 */
export function validateToolDependencies(module, discoveredTools) {
    // Module may not have tool dependencies (e.g., conversation-only modules)
    if (!module.toolDependencies || module.toolDependencies.length === 0) {
        return;
    }

    const available = new Set(Object.keys(discoveredTools));
    const missing = [];

    for (const dependency of module.toolDependencies) {
        if (!available.has(dependency.name)) {
            missing.push(dependency);
        }
    }

    if (missing.length > 0) {
        const missingDetails = missing
            .map(dep => `  - ${dep.name}: ${dep.description}`)
            .join('\n');

        const availableTools = [...available].join(', ');

        throw new Error(
            'Module requires tools not provided by MCP servers:\n\n' +
            `${missingDetails}\n\n` +
            `Available tools: ${availableTools}\n\n` +
            'Check your ~/.thinksuit.json mcpServers configuration.'
        );
    }
}
