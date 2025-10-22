import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerDiceRoller } from './tools/dice.js';

export async function createMcpServer() {
    const server = new McpServer({
        name: 'ThinkSuit Custom Tools',
        version: '0.1.0'
    });

    registerDiceRoller(server);

    return server;
}