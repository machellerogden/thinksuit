/**
 * MCP Server Factory
 * Creates MCP server configurations with system-enforced security boundaries
 *
 * The filesystem server is baked in and always created using allowedDirectories
 * from user config. Additional servers can be defined in user config.
 */

/**
 * Create MCP server configurations from user config
 * @param {Object} userConfig - User configuration containing allowedDirectories and optional mcpServers
 * @param {boolean} offline - Whether to use offline mode for npx
 * @returns {Object} MCP server configurations ready for startMCPServers()
 *
 * @example
 * const config = {
 *     allowedDirectories: ['/Users/mac/repos'],
 *     cwd: '/Users/mac/repos/myproject',
 *     mcpServers: {
 *         customTools: {
 *             command: 'npx',
 *             args: ['-y', 'my-custom-tools'],
 *             env: {}
 *         }
 *     }
 * };
 *
 * const servers = createMcpServersFromConfig(config, false);
 * // Returns:
 * // {
 * //   filesystem: { command: 'npx', args: [...], env: {} },
 * //   customTools: { command: 'npx', args: [...], env: {} }
 * // }
 */
export function createMcpServersFromConfig(userConfig, offline = false) {
    const servers = {};

    // BAKED-IN: Filesystem server is always created with system-enforced allowedDirectories
    // This ensures the trust boundary is enforced by the system, not by module code
    const allowedDirectories = userConfig.allowedDirectories || [userConfig.cwd];

    // Use --offline when offline (uses cache only), -y when online (auto-install if needed)
    const npxFlag = offline ? '--offline' : '-y';

    servers.filesystem = {
        command: 'npx',
        args: [
            npxFlag,
            '@modelcontextprotocol/server-filesystem',
            ...allowedDirectories
        ],
        env: {}
    };

    // Merge additional servers from user config if present
    if (userConfig.mcpServers) {
        for (const [name, serverConfig] of Object.entries(userConfig.mcpServers)) {
            servers[name] = serverConfig;
        }
    }

    return servers;
}
