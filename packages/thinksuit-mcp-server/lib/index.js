import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerThinkSuitTool } from './tools/thinksuit.js';
import { registerSignalsTool } from './tools/signals.js';
import { registerSessionTool } from './tools/session.js';
import { registerInspectTool } from './tools/inspect.js';

export async function createMcpServer() {
    const server = new McpServer({
        name: 'ThinkSuit',
        version: '0.0.0'
    });

    registerThinkSuitTool(server);
    registerSignalsTool(server);
    registerSessionTool(server);
    registerInspectTool(server);

    return server;
}
