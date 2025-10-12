import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { ListRootsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

/**
 * MCP Client Manager - handles lifecycle of MCP server connections
 */

const activeClients = new Map();

/**
 * Start an MCP server and create a client connection
 * @param {string} name - Server identifier
 * @param {Object} config - Server configuration { command, args, env }
 * @param {string} cwd - Working directory for the MCP server
 * @param {string[]} allowedDirectories - Optional directories to expose via roots capability
 * @returns {Promise<Client>} - Connected MCP client
 */
export async function startMCPServer(name, config, cwd, allowedDirectories = null, verbose = false) {
    // Check if already running
    if (activeClients.has(name)) {
        return activeClients.get(name);
    }

    if (!cwd) {
        throw new Error('cwd is required for MCP server initialization');
    }

    const { command, args = [], env = {} } = config;

    // Replace process.cwd() in args with the provided cwd
    const processedArgs = args.map(arg => arg === process.cwd() ? cwd : arg);

    // Create transport using stdio, suppress stderr unless verbose
    const transport = new StdioClientTransport({
        command,
        args: processedArgs,
        env: { ...process.env, ...env },
        cwd,
        stderr: verbose ? 'inherit' : 'ignore'
    });

    // Create client with roots capability if allowedDirectories provided
    const capabilities = {};
    if (allowedDirectories && allowedDirectories.length > 0) {
        capabilities.roots = {
            listChanged: true
        };
    }

    const client = new Client({
        name: `thinksuit-${name}`,
        version: '1.0.0'
    }, {
        capabilities
    });

    // Set up roots/list request handler if we have allowedDirectories
    if (allowedDirectories && allowedDirectories.length > 0) {
        client.setRequestHandler(ListRootsRequestSchema, async () => {
            return {
                roots: allowedDirectories.map(dir => ({
                    uri: `file://${dir}`,
                    name: dir.split('/').pop() || dir
                }))
            };
        });
    }

    await client.connect(transport);

    // Store for reuse
    activeClients.set(name, { client, transport });

    return client;
}

/**
 * Start all MCP servers from module configuration
 * @param {Object} mcpServers - Server configurations from module
 * @param {string} cwd - Working directory for the MCP servers
 * @param {string[]} allowedDirectories - Optional directories to expose via roots capability
 * @param {boolean} verbose - Whether to show MCP server stderr output
 * @returns {Promise<Map>} - Map of server name to client
 */
export async function startMCPServers(mcpServers = {}, cwd, allowedDirectories = null, verbose = false) {
    if (!cwd) {
        throw new Error('cwd is required for MCP server initialization');
    }

    const clients = new Map();

    for (const [name, config] of Object.entries(mcpServers)) {
        try {
            const client = await startMCPServer(name, config, cwd, allowedDirectories, verbose);
            clients.set(name, client);
        } catch (error) {
            console.error(`Failed to start MCP server ${name}:`, error);
        }
    }

    return clients;
}

/**
 * Stop an MCP server
 * @param {string} name - Server identifier
 */
export async function stopMCPServer(name) {
    const entry = activeClients.get(name);
    if (!entry) return;

    const { client, transport } = entry;

    // Disconnect client
    await client.close();

    // Stop transport
    await transport.close();

    // Remove from active clients
    activeClients.delete(name);
}

/**
 * Stop all active MCP servers
 */
export async function stopAllMCPServers() {
    for (const name of activeClients.keys()) {
        await stopMCPServer(name);
    }
}

// Cleanup on process exit
process.on('exit', () => {
    for (const { transport } of activeClients.values()) {
        try {
            transport.close();
        } catch {
            // Ignore errors on exit
        }
    }
});