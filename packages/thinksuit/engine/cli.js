#!/usr/bin/env node

import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { buildConfig } from './config.js';
import { schedule } from './schedule.js';
import { createLogger } from './logger.js';
import { loadModules } from './modules/loader.js';
import { modules as defaultModules } from 'thinksuit-modules';

/**
 * Main entry point - contains all side effects
 */
async function main() {
    // Get configuration (this is where CLI parsing happens)
    let config;
    try {
        config = buildConfig();
    } catch (error) {
        console.error(error.message);
        process.exit(1);
    }

    // Handle help and version flags
    if (config.help) {
        config._cli.showHelp();
        process.exit(0);
    }

    if (config.version) {
        config._cli.showVersion();
        process.exit(0);
    }

    // Get input from stdin if not provided via CLI
    let input = config.input;
    if (!input && process.stdin.isTTY) {
        console.error('Error: No input provided. Use --help for usage information.');
        process.exit(1);
    }

    if (!input && !process.stdin.isTTY) {
        input = await new Promise((resolve) => {
            let data = '';
            process.stdin.on('data', (chunk) => (data += chunk));
            process.stdin.on('end', () => resolve(data.trim()));
        });
    }

    // Create logger for CLI context
    const logger = createLogger({
        level: config.logging.verbose ? 'trace' : 'info',
        silent: config.logging.silent,
        trace: config.trace,
        session: true, // Always enable session logging
        format: 'pretty' // Use pretty formatting for CLI
    });

    // Determine modules
    let modules;
    if (config.modules) {
        modules = config.modules;
    } else if (config.modulesPackage) {
        // Resolve relative paths from where the user ran the command (INIT_CWD)
        // This handles npm workspace directory changes correctly
        const basePath = process.env.INIT_CWD || process.cwd();
        const resolvedPath = config.modulesPackage.startsWith('/')
            ? config.modulesPackage
            : join(basePath, config.modulesPackage);
        modules = await loadModules(resolvedPath);
    } else {
        modules = defaultModules;
    }

    // Map CLI config to schedule() config
    const scheduleConfig = {
        input,
        module: config.module,
        modules,
        provider: config.provider,
        model: config.model,
        providerConfig: config.providerConfig,
        // Use INIT_CWD (where npm was run from) if available, else config.cwd, else process.cwd()
        cwd: config.cwd || process.env.INIT_CWD || process.cwd(),
        allowedDirectories: config.allowedDirectories, // Pass through allowed directories
        mcpServers: config.mcpServers, // Pass through MCP server configurations
        tools: config.tools, // Pass through the tools list if provided
        autoApproveTools: true, // CLI always auto-approves tools
        policy: {
            maxDepth: config.policy.maxDepth,
            maxFanout: config.policy.maxFanout,
            maxChildren: config.policy.maxChildren
        },
        logging: {
            level: config.logging.verbose ? 'trace' : 'info',
            silent: config.logging.silent
        },
        trace: config.trace,
        sessionId: config.sessionId,
        logger // Pass the pre-configured logger
    };

    try {
        // Schedule and await execution
        const { sessionId, scheduled, isNew, execution, interrupt, reason } = await schedule(scheduleConfig);

        if (!scheduled) {
            console.error(`Cannot start execution: ${reason}`);
            process.exit(1);
        }

        // Display session ID if it's a new session
        if (isNew) {
            console.log(`[SESSION ID] ${sessionId}`);
        }

        // Set up SIGINT handler for clean interrupt and exit
        let interruptHandled = false;
        const handleSigInt = async () => {
            if (interruptHandled) {
                // Force exit on second Ctrl+C
                console.log('\n[EXIT] Force exit');
                process.exit(1);
            }
            interruptHandled = true;

            console.log('\n[INTERRUPT] Ctrl+C pressed, interrupting task...');
            if (interrupt) {
                const result = await interrupt('User pressed Ctrl+C');
                if (result.success) {
                    console.log('[INTERRUPT] Task interrupted.');
                } else {
                    console.error('[INTERRUPT] Failed to interrupt cleanly:', result.error);
                }
            }
            // Let the execution complete and exit naturally
        };

        process.on('SIGINT', handleSigInt);

        // Wait for execution to complete
        const result = await execution;

        // Handle interrupted execution
        if (result.interrupted) {
            console.log('\n[INTERRUPTED]', result.response);
            if (result.partialData) {
                console.log('[PARTIAL DATA] Some data was gathered before interruption.');
            }
            console.log(`[SESSION] ${sessionId} - Ready for new input`);
        }

        // Always display the response, even if it's an error message
        console.log(result.response);

        if (result.error) {
            console.error('Error:', result.error);
            process.exit(1);
        }
    } catch (error) {
        console.error('Execution failed:', error.message);
        if (config.debug) {
            console.error('Stack trace:', error.stack);
        }
        process.exit(1);
    }
}

// Run if this file is executed directly
if (
    import.meta.url.startsWith('file:') &&
    realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)
) {
    await main().catch((error) => {
        console.error('Fatal error:', error);
        process.exit(1);
    });
}
