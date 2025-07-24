import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';

import pino from 'pino';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Export pino for direct use
export { default as pino } from 'pino';

// Create base logger configuration
function createBaseConfig(level) {
    return {
        level: level || 'info',
        base: {
            pid: process.pid,
            hostname: undefined // Remove hostname for cleaner logs
        },
        // depthLimit: 10,
        // edgeLimit: 1000,
        timestamp: pino.stdTimeFunctions.isoTime,
        formatters: {
            log(object) {
                // Add unique eventId to every log entry
                return {
                    ...object,
                    eventId: `event-${randomUUID()}`
                };
            }
        },
        serializers: {
            error: pino.stdSerializers.err,
            // Custom serializer for large objects - only log keys and types
            // data: (obj) => {
            //     if (!obj) return obj;
            //     if (typeof obj !== 'object') return obj;
            //
            //     // For large objects, just log structure
            //     const keys = Object.keys(obj);
            //     if (keys.length > 10) {
            //         return {
            //             _type: 'large_object',
            //             _keys: keys.slice(0, 10),
            //             _totalKeys: keys.length
            //         };
            //     }
            //     return obj;
            // }
        },
        // Redact sensitive patterns
        redact: {
            paths: [
                'password',
                'token',
                'secret',
                'apiKey',
                'api_key',
                '*.password',
                '*.token',
                '*.secret'
            ],
            censor: '[REDACTED]'
        }
    };
}

// Development transport with pretty printing
function createPrettyTransport(level) {
    return {
        target: join(__dirname, 'transports', 'pretty-transport.js'),
        level,
        options: {
            colorize: true,
            translateTime: 'HH:MM:ss.l',
            ignore: 'pid,hostname',
            messageFormat: '{msg}',
            errorLikeObjectKeys: ['err', 'error'],
            singleLine: false
        }
    };
}

/**
 * Create a logger instance with appropriate transports
 * @param {Object} options - Configuration options
 * @param {string} options.level - Log level: 'error', 'warn', 'info', 'debug', 'trace' (default: 'info')
 * @param {boolean} options.silent - Whether to suppress stdout output (default: false)
 * @param {boolean} options.trace - Whether to write trace files (default: false)
 * @param {boolean} options.session - Whether to write session files (default: false)
 * @param {string} options.format - Output format: 'pretty' or 'json' (default: 'pretty')
 * @returns {Object} Pino logger instance
 */
export function createLogger(options = {}) {
    const {
        level = 'info',
        silent = false,
        trace = false,
        session = false,
        format = 'pretty'
    } = options;

    const baseConfig = createBaseConfig(level);

    if (trace || session || !silent) {
        // Build transport targets
        const targets = [];

        // Add console transport (unless silent)
        if (!silent) {
            if (format === 'pretty') {
                targets.push(createPrettyTransport(level));
            } else {
                targets.push({
                    target: 'pino/file',
                    level,
                    options: { destination: 1 } // stdout
                });
            }
        }

        // Add trace file writer transport if tracing enabled
        if (trace) {
            const traceTransport = {
                target: join(__dirname, 'transports', 'trace-router.js'),
                level: 'trace', // Capture everything at trace level for files
                options: {}
            };
            targets.push(traceTransport);
        }

        // Add session file writer transport if session enabled
        if (session) {
            const sessionTransport = {
                target: join(__dirname, 'transports', 'session-router.js'),
                level: 'info', // Capture info level and above for sessions
                options: {}
            };
            targets.push(sessionTransport);
        }

        // Create logger with multistream transport
        const transport = pino.transport({ targets });
        // Use trace level to capture everything when writing to file
        return pino({ ...baseConfig, level: trace || session ? 'trace' : level }, transport);
    } else {
        // Silent mode with no file writing - return a silent logger
        return pino({ ...baseConfig, level: 'silent' });
    }
}

// Export base config creation for direct use
export { createBaseConfig };

// Event type to log level mapping
const EVENT_LOG_LEVELS = {
    // Machine lifecycle - info level
    MachineStart: 'info',
    MachineEnd: 'info',
    MachineFail: 'error',

    // State transitions - debug level
    StateEntered: 'debug',
    StateExited: 'debug',
    StateInitialized: 'debug',

    // Handler execution - debug/trace
    HandlerStarted: 'debug',
    HandlerSucceeded: 'debug',
    StateSucceed: 'debug',

    // Detailed state info - trace level
    StateInfo: 'trace',
    Parameters: 'trace',
    ResultPath: 'trace',

    // Errors and warnings
    StateError: 'error',
    StateFailed: 'error',
    HandlerFailed: 'error',
    ExecutionFailed: 'error',
    RetryAttempt: 'warn',
    FallbackTriggered: 'warn'
};

// Helper to serialize data for logging
function serializeData(obj) {
    if (!obj) return obj;
    if (typeof obj !== 'object') return obj;

    // For large objects, just log structure
    const keys = Object.keys(obj);
    if (keys.length > 10) {
        return {
            _type: 'large_object',
            _keys: keys.slice(0, 10),
            _totalKeys: keys.length
        };
    }
    return obj;
}

/**
 * Create a child logger for a specific execution context
 * The traceId will be included in all logs from this logger
 * @param {Object} logger - Parent logger instance
 * @param {string} traceId - Trace ID for this execution
 */
export function createExecutionLogger(logger, traceId) {
    return logger.child({ traceId });
}

/**
 * Generate a unique span ID for tracing
 * Uses timestamp and counter for ordering and uniqueness
 */
let spanCounter = 0;
export function generateSpanId() {
    return `span-${(++spanCounter).toString().padStart(5, '0')}`;
}

/**
 * Create a child logger with span context for tracing
 * Automatically sets up parent-child relationship and depth
 */
export function createSpanLogger(parentLogger, operation, metadata = {}) {
    const parentBindings = parentLogger.bindings();
    return parentLogger.child({
        spanId: generateSpanId(),
        parentSpanId: parentBindings.spanId || null,
        depth: (parentBindings.depth || 0) + 1,
        sessionId: parentBindings.sessionId || null, // Preserve sessionId from parent
        operation,
        ...metadata
    });
}

/**
 * Log Trajectory state machine events with appropriate structure and level
 * Note: This function now needs a logger passed via context or will fallback to console
 */
export function logStateEvent(context, event, label, ...args) {
    // Guard against null/undefined inputs
    if (!context || !event) {
        return;
    }

    // Try to extract traceId from the state data
    // In StateEntered/StateExited, the first arg is the state data
    // For MachineStart, it could be in the label
    let traceId = null;
    if (args.length > 0 && typeof args[0] === 'object') {
        traceId = args[0]?.context?.traceId;
    }
    // Also check the label for MachineStart event
    if (!traceId && typeof label === 'object' && label?.context?.traceId) {
        traceId = label.context.traceId;
    }

    // Try to get logger from context (passed in via machineContext.execLogger)
    // This is a temporary solution - eventually we should pass logger explicitly
    const logger = context?.execLogger || console;
    const loggerToUse = traceId && logger.child ? logger.child({ traceId }) : logger;

    // Always log errors with full details
    if (
        event === 'MachineFail' ||
        event === 'StateError' ||
        event === 'StateFailed' ||
        event === 'StateFail'
    ) {
        loggerToUse.error(
            {
                event,
                state: context?.stateKey,
                depth: context?.depth,
                label,
                error: args[0],
                fullArgs: args
            },
            `Machine error: ${event}`
        );
        return;
    }

    // Determine log level based on event type
    const logLevel = EVENT_LOG_LEVELS[event] || EVENT_LOG_LEVELS[label] || 'debug';

    // Skip if current log level doesn't include this event
    if (!loggerToUse[logLevel]) return;

    // Build structured log entry
    const entry = {
        event,
        state: context.stateKey,
        depth: context.depth
    };

    // Add label if it's not redundant with event
    if (label && label !== event) {
        entry.label = label;
    }

    // Process arguments based on event type
    if (args.length > 0) {
        const [firstArg, ...restArgs] = args;

        // Special handling for different event types
        switch (label) {
            case 'HandlerSucceeded':
            case 'StateSucceed':
                // Log handler output summary
                if (firstArg && typeof firstArg === 'object') {
                    entry.output_keys = Object.keys(firstArg);
                    if (firstArg.error) entry.error = firstArg.error;
                }
                break;

            case 'Parameters':
                // Log parameter resolution
                entry.params = firstArg;
                if (restArgs[0]) {
                    entry.resolved = Object.keys(restArgs[0]);
                }
                break;

            case 'ResultPath':
                // Log where result was stored
                entry.path = firstArg;
                break;

            case 'StateEntered':
            case 'StateExited':
                // Log data shape without full content
                if (firstArg && typeof firstArg === 'object') {
                    entry.data_keys = Object.keys(firstArg).filter(
                        (k) => !['thread', 'module', 'context', 'policy'].includes(k)
                    );
                }
                break;

            default:
                // For trace level, include more detail
                if (logLevel === 'trace' && firstArg !== undefined) {
                    entry.data = serializeData(firstArg);
                }
        }

        // Add any error information
        if (restArgs.find((arg) => arg instanceof Error)) {
            entry.error = restArgs.find((arg) => arg instanceof Error);
        }
    }

    // Format message based on event
    let message = `[${event}]`;
    if (label && label !== event) {
        message += ` ${label}`;
    }
    if (context.stateKey) {
        message += ` :: ${context.stateKey}`;
    }

    // Log with appropriate level
    loggerToUse[logLevel](entry, message);
}
