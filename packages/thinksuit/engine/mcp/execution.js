/**
 * MCP Tool Execution - executes tools via MCP protocol
 */

import { findToolHandler } from './discovery.js';

/**
 * Parse JSON arguments if needed
 * @param {string|object} args - Raw arguments from API
 * @returns {any} - Parsed arguments
 */
function parseArguments(args) {
    if (typeof args === 'string') {
        try {
            return JSON.parse(args);
        } catch {
            // If not valid JSON, treat as plain string
            return args;
        }
    }
    return args;
}

/**
 * Call a tool via MCP
 * @param {Object} request - Tool request { tool, args }
 * @param {Object} discoveredTools - Tool metadata from discovery
 * @returns {Promise<Object>} - Tool result { success, result, error? }
 */
export async function callMCPTool(request, discoveredTools) {
    const { tool, args } = request;

    // Find the handler for this tool
    const handler = findToolHandler(tool, discoveredTools);

    if (!handler) {
        return {
            success: false,
            error: `Tool not found: ${tool}`
        };
    }

    try {
        // Parse arguments - handle both string and object
        let parsedArgs = parseArguments(args);

        // If args came as {args: "..."}, extract the actual arguments
        if (parsedArgs && typeof parsedArgs === 'object' && 'args' in parsedArgs) {
            parsedArgs = parsedArgs.args;
        }

        // Call the tool via MCP client
        const result = await handler.client.callTool({
            name: tool,
            arguments: parsedArgs
        });

        // Check if result has content array (MCP response format)
        if (result.content && Array.isArray(result.content)) {
            // Extract text content from MCP response
            const textContent = result.content
                .filter(item => item.type === 'text')
                .map(item => item.text)
                .join('\n');

            return {
                success: true,
                result: textContent || JSON.stringify(result.content)
            };
        }

        // Fallback for other response formats
        return {
            success: true,
            result: typeof result === 'string' ? result : JSON.stringify(result)
        };
    } catch (error) {
        return {
            success: false,
            error: `Tool execution failed: ${error.message}`
        };
    }
}