import { json } from '@sveltejs/kit';
import { buildConfig } from 'thinksuit';
import { startMCPServers, stopAllMCPServers } from 'thinksuit/engine/mcp/client';
import { discoverTools } from 'thinksuit/engine/mcp/discovery';
import { createMcpServersFromConfig } from 'thinksuit/engine/mcp/factory';
import { applyToolPolicy } from 'thinksuit/engine/mcp/policy';

export async function GET() {
    let mcpClients = null;

    try {
        // Load base config
        const config = buildConfig({ argv: [] });

        // Start MCP servers and discover tools
        const mcpServersConfig = createMcpServersFromConfig(config);
        mcpClients = await startMCPServers(mcpServersConfig, config.cwd, config.allowedDirectories, false);
        const allDiscoveredTools = await discoverTools(mcpClients);

        // Apply tool policy filtering
        const filteredTools = applyToolPolicy(allDiscoveredTools, config);

        // Format tools for response
        const tools = Object.entries(filteredTools).map(([name, tool]) => ({
            name: tool.name,
            description: tool.description,
            inputSchema: tool.inputSchema,
            server: tool.server
        }));

        return json({ tools });

    } catch (error) {
        console.error('Error discovering tools:', error);
        return json({
            error: 'Failed to discover tools',
            details: error.message
        }, { status: 500 });
    } finally {
        // Clean up MCP servers
        if (mcpClients) {
            try {
                await stopAllMCPServers(mcpClients);
            } catch (error) {
                console.error('Error stopping MCP servers:', error);
            }
        }
    }
}
