/**
 * Pure function for executing a ThinkSuit cycle
 * Used by both entry points and recursive handlers
 */

import { executeMachine } from 'trajectory';
import { logStateEvent, generateSpanId } from './logger.js';
import { ORCHESTRATION_EVENTS, EXECUTION_EVENTS } from './constants/events.js';
import { generateId } from './utils/id.js';
import { InterruptError, isInterruptError } from './errors/InterruptError.js';

/**
 * Execute a single cycle through the state machine
 *
 * @param {Object} params - All parameters for execution
 * @param {Object} params.logger - Logger to decorate with trace context
 * @param {Array} params.thread - Conversation thread
 * @param {Object} params.module - Behavioral module
 * @param {number} params.depth - Recursion depth (default: 0)
 * @param {string} params.branch - Branch identifier (default: 'root')
 * @param {string} params.traceId - Trace ID (generated if not provided)
 * @param {string} params.spanId - Span ID (generated if not provided)
 * @param {string} params.parentSpanId - Parent span for tracing
 * @param {string} params.sessionId - Session ID for continuity
 * @param {Object} params.selectedPlan - Bypass signal detection if provided
 * @param {*} params.previousOutput - Context from previous execution
 * @param {Object} params.machineDefinition - ASL state machine definition
 * @param {Object} params.handlers - Handler functions
 * @param {Object} params.config - Provider config, policy, etc.
 * @param {AbortSignal} params.abortSignal - AbortSignal for interruption support
 * @returns {Promise<Array>} [status, result] from state machine execution
 */
export async function runCycle({
    // Core inputs
    logger,
    thread,
    input,
    module,

    // Context
    depth = 0,
    branch = 'root',
    traceId = null,
    spanId = null,
    parentSpanId = null,
    sessionId = null,
    parentBoundaryId = null,  // Parent boundary for execution handlers
    historicalSignals = [],  // Historical signals from previous turns
    currentTurnIndex = 1,  // Current turn index

    // Optional control
    selectedPlan = null,
    previousOutput = null,
    abortSignal = null,  // AbortSignal for interruption
    frame = null,  // Frame context { text: string } | null
    compositionType = 'default',  // Composition type: 'default', 'continuation', 'accumulation'

    // System dependencies
    machineDefinition,
    handlers,
    config,
    discoveredTools = null  // MCP discovered tools
}) {
    // Validate required parameters
    if (!logger) throw new Error('Logger is required');
    if (!thread) throw new Error('Thread is required');
    if (!module) throw new Error('Module is required');
    if (!machineDefinition) throw new Error('Machine definition is required');
    if (!handlers) throw new Error('Handlers are required');
    if (!config) throw new Error('Config is required');

    // Generate IDs if not provided
    const finalTraceId = traceId || generateId();
    const finalSpanId = spanId || generateSpanId();

    // Create trace-decorated logger
    const execLogger = logger.child({
        traceId: finalTraceId,
        spanId: finalSpanId,
        parentSpanId,
        depth,
        branch,
        sessionId
    });

    // Build machine context with abort support
    const machineContext = {
        handlers,
        config,
        module,
        discoveredTools,  // Pass MCP tools to handlers
        machineDefinition,
        execLogger,
        abortSignal,  // Pass AbortSignal to handlers via context
        log: (ctx, event, label, ...args) => {
            try {
                // Pass execLogger in context for logStateEvent to use
                const contextWithLogger = { ...ctx, execLogger };
                logStateEvent(contextWithLogger, event, label, ...args);
            } catch (error) {
                console.error('Logging error:', error);
            }
        }
    };

    // Generate unique boundary ID for this orchestration
    const orchestrationBoundaryId = `orchestration-${sessionId}-${branch}-${Date.now()}`;

    // Build input for state machine
    const machineInput = {
        thread,
        userInput: input || '',
        compositionType,
        context: {
            depth,
            branch,
            traceId: finalTraceId,
            sessionId,
            previousOutput,
            parentBoundaryId: orchestrationBoundaryId, // Pipeline handlers should nest under orchestration
            historicalSignals: historicalSignals || [], // Pass historical signals through context
            currentTurnIndex: currentTurnIndex || 1, // Pass current turn index through context
            frame: frame || null, // Pass frame through context
            cwd: config.cwd || null // Pass working directory for prompt context if configured
        },
        policy: config.policy || {},
        // Include selected plan if provided
        ...(selectedPlan && { selectedPlan })
    };

    // Log execution start
    execLogger.info(
        {
            event: ORCHESTRATION_EVENTS.START,
            eventRole: 'boundary_start',
            boundaryType: 'orchestration',
            boundaryId: orchestrationBoundaryId,
            parentBoundaryId: parentBoundaryId || null,
            data: {
                depth,
                branch,
                hasSelectedPlan: !!selectedPlan,
                ...(selectedPlan && { selectedPlan })
            }
        },
        'Starting execution cycle'
    );

    // Execute the state machine with interrupt handling
    const startTime = Date.now();
    let status, result;

    try {
        // Check if already aborted before starting
        if (abortSignal?.aborted) {
            throw new InterruptError('Execution aborted before start', {
                stage: 'pre-execution',
                depth,
                branch
            });
        }

        // Execute machine - Trajectory will pass the signal to handlers
        [status, result] = await executeMachine(machineDefinition, machineContext, machineInput);
        const duration = Date.now() - startTime;

        // Check if result is an interrupt
        if (isInterruptError(result)) {
            status = 'interrupted';
            result = {
                interrupted: true,
                message: 'Task interrupted by user',
                partialData: result.gatheredData || null
            };
        }

        // Log execution complete
        execLogger.info(
            {
                event: ORCHESTRATION_EVENTS.COMPLETE,
                eventRole: 'boundary_end',
                boundaryType: 'orchestration',
                boundaryId: orchestrationBoundaryId,
                parentBoundaryId: parentBoundaryId || null,
                data: {
                    status,
                    duration,
                    depth,
                    branch
                }
            },
            'Execution cycle complete'
        );
    } catch (error) {
        const duration = Date.now() - startTime;

        // Check if this is an interrupt
        if (isInterruptError(error) || (abortSignal?.aborted && error.name === 'AbortError')) {
            execLogger.warn(
                {
                    event: EXECUTION_EVENTS.INTERRUPTED,
                    data: {
                        duration,
                        depth,
                        branch,
                        stage: error.stage || 'execution',
                        summary: error.getSummary ? error.getSummary() : {}
                    }
                },
                'Execution interrupted by user'
            );

            // Return interrupted status with partial results if available
            status = 'interrupted';
            result = {
                interrupted: true,
                message: 'Task interrupted by user',
                partialData: error.gatheredData || null
            };
        } else {
            // Re-throw non-interrupt errors
            execLogger.error(
                {
                    event: ORCHESTRATION_EVENTS.ERROR,
                    data: {
                        error: error.message,
                        duration,
                        depth,
                        branch
                    }
                },
                'Execution failed'
            );
            throw error;
        }
    }

    return [status, result];
}
