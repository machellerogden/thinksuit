/**
 * MCP Tool Discovery - discovers and caches tool metadata from MCP servers
 */

/**
 * Discover all tools from connected MCP clients
 * @param {Map} mcpClients - Map of server name to MCP client
 * @returns {Promise<Object>} - Tool name to metadata mapping
 */
export async function discoverTools(mcpClients) {
    const tools = {};

    for (const [serverName, client] of mcpClients.entries()) {
        try {
            // List available tools from this server
            const { tools: serverTools } = await client.listTools();

            // Add each tool with metadata
            for (const tool of serverTools) {
                tools[tool.name] = {
                    name: tool.name,
                    description: tool.description,
                    inputSchema: tool.inputSchema,
                    server: serverName,
                    client
                };
            }
        } catch (error) {
            console.error(`Failed to discover tools from ${serverName}:`, error);
        }
    }

    return tools;
}

/**
 * Find which client handles a specific tool
 * @param {string} toolName - Name of the tool
 * @param {Object} discoveredTools - Tool metadata from discovery
 * @returns {Object|null} - Tool metadata including client reference
 */
export function findToolHandler(toolName, discoveredTools) {
    return discoveredTools[toolName] || null;
}

/**
 * Get tool schemas formatted for LLM providers
 * @param {string[]} toolNames - List of tool names
 * @param {Object} discoveredTools - Tool metadata from discovery
 * @returns {Object} - Tool name to schema mapping
 */
export function getToolSchemas(toolNames, discoveredTools) {
    const schemas = {};

    for (const name of toolNames) {
        const tool = discoveredTools[name];
        if (tool) {
            schemas[name] = {
                description: tool.description,
                inputSchema: tool.inputSchema
            };
        }
    }

    return schemas;
}

/**
 * List all available tool names
 * @param {Object} discoveredTools - Tool metadata from discovery
 * @returns {string[]} - Array of tool names
 */
export function listAvailableTools(discoveredTools) {
    return Object.keys(discoveredTools);
}