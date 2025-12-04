import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { readFileSync, existsSync } from 'node:fs';
import {
    DEFAULT_CONFIG_FILE,
    DEFAULT_APPROVAL_TIMEOUT_MS,
    DEFAULT_MODULE,
    DEFAULT_PROVIDER,
    DEFAULT_MODEL,
    DEFAULT_POLICY
} from './constants/defaults.js';
import { validateConfig, formatValidationErrors } from '../schemas/validate.js';

import meow from 'meow';

/**
 * Parse CLI arguments with meow
 * Contained in function to avoid import-time side effects
 * @param {string[]} argv - Optional custom argv for testing
 */
function parseCLI(argv) {
    return meow(
        `
    Usage
      $ node engine/execute.js [input]

    Options
      --module, -m       Module to load (default: thinksuit/mu)
      --modules-package  Path to custom modules package directory
      --provider, -p     LLM provider (default: openai)
      --model            Model name (default: gpt-4o-mini)
      --max-depth        Max recursion depth (default: 5)
      --max-fanout       Max parallel branches (default: 3)
      --max-children     Max child operations (default: 5)
      --session-id       Session ID to resume or create
      --preset           Preset plan to use (from module presets)
      --frame            Frame context text (persistent session context)
      --cwd              Working directory for tools (default: current directory)
      --allow-tool       Tool to allow (can be specified multiple times)
      --allow-tools      Comma-separated list of tools to allow
      --allow-dir        Directory to allow access to (can be specified multiple times)
      --approval-timeout Tool approval timeout in ms (default: 12 hours, -1 to disable)
      --output, -o       Output format: json|text|none (default: text)
      --trace            Write detailed trace files (independent of console output)
      --verbose, -v      Increase log detail level
      --config, -c       Path to config file
      --help             Show help
      --version          Show version

    Environment Variables
      OPENAI_API_KEY       OpenAI API key
      ANTHROPIC_API_KEY    Anthropic API key
      GOOGLE_CLOUD_PROJECT Google Cloud project ID (for Vertex AI)
      GOOGLE_CLOUD_LOCATION Google Cloud location (default: us-central1)
      HF_TOKEN             Hugging Face API token (for hugging-face provider)

    Config File
      Default location: ~/.thinksuit.json
      Override with --config flag

    Examples
      $ node engine/execute.js "Analyze this claim"
      $ node engine/execute.js --module thinksuit/mu --model gpt-5
      $ node engine/execute.js --config ~/.thinksuit.json
`,
        {
            importMeta: import.meta,
            envPrefix: 'THINKSUIT', // Automatically check THINKSUIT_* env vars
            flags: {
                module: {
                    type: 'string',
                    shortFlag: 'm'
                    // No default - we'll handle this in buildConfig
                },
                modulesPackage: {
                    type: 'string'
                    // Path to custom modules package directory
                },
                provider: {
                    type: 'string',
                    shortFlag: 'p'
                    // No default
                },
                model: {
                    type: 'string'
                    // No default
                },
                maxDepth: {
                    type: 'number'
                    // No default
                },
                maxFanout: {
                    type: 'number'
                    // No default
                },
                maxChildren: {
                    type: 'number'
                    // No default
                },
                sessionId: {
                    type: 'string'
                    // No default - will generate if not provided
                },
                preset: {
                    type: 'string'
                    // No default - optional preset selection
                },
                frame: {
                    type: 'string'
                    // No default - optional frame context
                },
                cwd: {
                    type: 'string'
                    // No default - will use process.cwd()
                },
                allowTool: {
                    type: 'string',
                    isMultiple: true
                    // No default - all discovered tools allowed if not specified
                },
                allowTools: {
                    type: 'string'
                    // Comma-separated alternative to --allow-tool
                },
                allowDir: {
                    type: 'string',
                    isMultiple: true
                    // No default - will use cwd if not specified
                },
                approvalTimeout: {
                    type: 'number'
                    // No default - will use DEFAULT_APPROVAL_TIMEOUT_MS
                },
                trace: {
                    type: 'boolean',
                    default: false
                },
                verbose: {
                    type: 'boolean',
                    shortFlag: 'v',
                    default: false
                },
                output: {
                    type: 'string',
                    shortFlag: 'o',
                    default: 'text'
                },
                config: {
                    type: 'string',
                    shortFlag: 'c'
                },
                help: {
                    type: 'boolean',
                    default: false
                },
                version: {
                    type: 'boolean',
                    default: false
                }
            },
            ...(argv !== undefined && { argv }) // Only pass argv if explicitly provided
        }
    );
}

/**
 * Load configuration from file
 * @param {string} path - Path to config file
 * @returns {{config: object, exists: boolean, error?: string}} Config object, whether file exists, and any error message
 * @throws {Error} When config file is invalid or cannot be parsed
 */
function loadConfigFile(path) {
    if (!existsSync(path)) {
        return { config: {}, exists: false, error: null };
    }
    try {
        const content = readFileSync(path, 'utf-8');
        const parsed = JSON.parse(content);
        const isEmpty = Object.keys(parsed).length === 0;
        if (isEmpty) {
            console.info(`Config file "${path}" exists but is empty`);
            return { config: parsed, exists: true, error: null, isEmpty };
        }

        // Validate config against schema
        const validation = validateConfig(parsed);
        if (!validation.valid) {
            const errorMsg = `Invalid config file "${path}":\n${formatValidationErrors(validation)}`;
            throw new Error(errorMsg);
        }

        return { config: parsed, exists: true, error: null, isEmpty };
    } catch (error) {
        // Re-throw with context about which file failed
        if (error.message.includes('Invalid config file')) {
            throw error; // Already has context
        }
        throw new Error(`Error parsing config file "${path}": ${error.message}`);
    }
}

/**
 * Merge configuration sources in priority order:
 * 1. CLI flags (highest priority)
 * 2. Project config file (cwd/.thinksuit.json)
 * 3. Global config file (~/.thinksuit.json)
 * 4. Defaults (lowest priority)
 *
 * Note: Environment variables for API keys are read directly via process.env
 */
function buildConfig(options = {}) {
    // Parse CLI with provided argv (or undefined for default behavior)
    // If argv is provided in options, pass it to parseCLI for testing
    const cli = parseCLI(options.argv);
    // Start with defaults
    const defaults = {
        module: DEFAULT_MODULE,
        provider: DEFAULT_PROVIDER,
        model: DEFAULT_MODEL,
        policy: DEFAULT_POLICY,
        logging: {
            level: 'info'
        },
        trace: false,
        approvalTimeout: DEFAULT_APPROVAL_TIMEOUT_MS
    };

    // Collect config sources
    const loadedConfigs = [];
    const configMetadata = [];

    if (cli.flags.config) {
        // Explicit config path overrides all layering
        const result = loadConfigFile(cli.flags.config);
        if (result.exists && !result.error) {
            loadedConfigs.push({
                path: cli.flags.config,
                type: 'explicit',
                config: result.config
            });
            configMetadata.push({
                path: cli.flags.config,
                type: 'explicit',
                isEmpty: result.isEmpty
            });
        } else if (!result.exists) {
            console.warn(`Config file not found: "${cli.flags.config}"`);
        } else if (result.error) {
            configMetadata.push({
                path: cli.flags.config,
                type: 'explicit',
                error: result.error
            });
        }
        // Parse errors already logged by loadConfigFile
    } else {
        // Layered config loading
        const globalConfigPath = join(homedir(), DEFAULT_CONFIG_FILE);
        const globalResult = loadConfigFile(globalConfigPath);

        if (globalResult.exists && !globalResult.error) {
            loadedConfigs.push({
                path: globalConfigPath,
                type: 'global',
                config: globalResult.config
            });
            configMetadata.push({
                path: globalConfigPath,
                type: 'global',
                isEmpty: globalResult.isEmpty
            });
        } else if (globalResult.exists && globalResult.error) {
            configMetadata.push({
                path: globalConfigPath,
                type: 'global',
                error: globalResult.error
            });
        }
        // No warning for missing global config (it's optional)

        // Determine working directory for project config
        const projectWorkingDir = cli.flags.cwd || globalResult.config.cwd || process.cwd();
        const projectConfigPath = join(projectWorkingDir, DEFAULT_CONFIG_FILE);

        // Only load project config if it's different from global (resolve to handle symlinks/relative paths)
        if (resolve(projectConfigPath) !== resolve(globalConfigPath)) {
            const projectResult = loadConfigFile(projectConfigPath);
            if (projectResult.exists && !projectResult.error) {
                loadedConfigs.push({
                    path: projectConfigPath,
                    type: 'project',
                    config: projectResult.config
                });
                configMetadata.push({
                    path: projectConfigPath,
                    type: 'project',
                    isEmpty: projectResult.isEmpty
                });
            } else if (projectResult.exists && projectResult.error) {
                configMetadata.push({
                    path: projectConfigPath,
                    type: 'project',
                    error: projectResult.error
                });
            }
            // No warning for missing project config (it's optional)
        }
    }

    // Merge all loaded configs (later ones override earlier)
    const fileConfig = loadedConfigs.reduce((acc, { config }) => ({ ...acc, ...config }), {});

    // Final working directory determination
    const workingDir = cli.flags.cwd || fileConfig.cwd || process.cwd();

    // Build final config with proper priority: CLI > env > file > defaults

    // Determine output mode
    const outputMode = cli.flags.output || fileConfig.output || 'text';

    // Validate output mode
    const validOutputModes = ['json', 'text', 'none'];
    if (!validOutputModes.includes(outputMode)) {
        throw new Error(`Invalid output mode: "${outputMode}". Must be one of: ${validOutputModes.join(', ')}`);
    }

    const config = {
        module:
            cli.flags.module !== undefined && cli.flags.module !== ''
                ? cli.flags.module
                : fileConfig.module || defaults.module,
        modulesPackage: cli.flags.modulesPackage || fileConfig.modulesPackage || undefined,
        provider:
            cli.flags.provider !== undefined
                ? cli.flags.provider
                : fileConfig.provider || defaults.provider,
        model: cli.flags.model !== undefined ? cli.flags.model : fileConfig.model || defaults.model,
        policy: {
            maxDepth:
                cli.flags.maxDepth !== undefined
                    ? cli.flags.maxDepth
                    : fileConfig.maxDepth || defaults.policy.maxDepth,
            maxFanout:
                cli.flags.maxFanout !== undefined
                    ? cli.flags.maxFanout
                    : fileConfig.maxFanout || defaults.policy.maxFanout,
            maxChildren:
                cli.flags.maxChildren !== undefined
                    ? cli.flags.maxChildren
                    : fileConfig.maxChildren || defaults.policy.maxChildren
        },
        output: outputMode,
        verbose: cli.flags.verbose || fileConfig.verbose || false,
        logging: {
            level: 'info'
        },
        trace: cli.flags.trace || fileConfig.trace || defaults.trace,
        sessionId: cli.flags.sessionId || fileConfig.sessionId,
        preset: cli.flags.preset || fileConfig.preset,
        cwd: cli.flags.cwd || fileConfig.cwd, // No default here
        allowedTools: (() => {
            const fromFlags = [
                ...(cli.flags.allowTool || []),
                ...(cli.flags.allowTools ? cli.flags.allowTools.split(',').map(t => t.trim()) : [])
            ];
            return fromFlags.length > 0 ? fromFlags : (fileConfig.allowedTools || undefined);
        })(), // No restriction if not specified
        allowedDirectories: (cli.flags.allowDir && cli.flags.allowDir.length > 0) ? cli.flags.allowDir : (fileConfig.allowedDirectories || undefined), // Will default to [cwd] in normalizeConfig
        mcpServers: fileConfig.mcpServers || undefined, // MCP server configurations from user config
        approvalTimeout: cli.flags.approvalTimeout !== undefined
            ? cli.flags.approvalTimeout
            : fileConfig.approvalTimeout !== undefined
                ? fileConfig.approvalTimeout
                : defaults.approvalTimeout,
        input: cli.input[0] || '',
        frame: cli.flags.frame ? { text: cli.flags.frame } : (fileConfig.frame || null),
        help: cli.flags.help,
        version: cli.flags.version,
        // Expose CLI object for help/version display
        _cli: cli
    };

    // Provider-specific configurations under providerConfig namespace
    config.providerConfig = {
        openai: {
            apiKey: process.env.OPENAI_API_KEY
        },
        google: {
            projectId: process.env.GOOGLE_CLOUD_PROJECT,
            location: process.env.GOOGLE_CLOUD_LOCATION || 'global'
        },
        anthropic: {
            apiKey: process.env.ANTHROPIC_API_KEY
        },
        huggingFace: {
            apiKey: process.env.HF_TOKEN
        },
        onnx: {
            dtype: process.env.ONNX_DTYPE || 'q4'
        }
    };

    // Add debug flag from environment
    config.debug = process.env.DEBUG === 'true' || process.env.DEBUG === '1';

    // Add metadata about config sources (for debugging/inspection)
    const sources = {
        files: configMetadata,
        environment: {
            openai: !!process.env.OPENAI_API_KEY,
            anthropic: !!process.env.ANTHROPIC_API_KEY,
            google: !!process.env.GOOGLE_CLOUD_PROJECT,
            huggingFace: !!process.env.HF_TOKEN,
            debug: !!process.env.DEBUG,
            trace: !!process.env.THINKSUIT_TRACE,
            silent: !!process.env.LOG_SILENT
        },
        cli: Object.keys(cli.flags).some(k => cli.flags[k] !== undefined),
        workingDirectory: workingDir
    };

    config._sources = sources;

    return config;
}

// Export only the build function to avoid import-time side effects
export { buildConfig };
