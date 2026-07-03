import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerThinkSuitTool } from './tools/thinksuit.js';
import { registerSessionTool } from './tools/session.js';
import { registerInspectTool } from './tools/inspect.js';

export async function createMcpServer() {
    const server = new McpServer({
        name: 'ThinkSuit',
        version: '0.1.3'
    });

    registerThinkSuitTool(server);
    registerSessionTool(server);
    registerInspectTool(server);

    return server;
}
