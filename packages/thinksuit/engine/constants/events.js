/**
 * Standardized event types for ThinkSuit
 *
 * Event naming convention: domain.component.action
 * - domain: The high-level area (session, orchestration, pipeline, execution, system)
 * - component: The specific component within the domain
 * - action: The specific action (start, complete, error, etc.)
 */

// Session lifecycle events
export const SESSION_EVENTS = {
    PENDING: 'session.pending', // Session reserved but not yet processing
    TURN_START: 'session.turn.start', // Turn boundary start
    INPUT: 'session.input',
    RESPONSE: 'session.response',
    TURN_COMPLETE: 'session.turn.complete', // Turn boundary complete
    END: 'session.end',
    RESUME: 'session.resume',
    FORKED: 'session.forked', // Session was forked to create a new branch
    INTERRUPTED: 'session.interrupted' // User interrupted execution
};

// Session status constants (derived from session events)
export const SESSION_STATUS = {
    NOT_FOUND: 'not_found', // No file exists
    EMPTY: 'empty', // File exists but no content
    INITIALIZED: 'initialized', // Only session.pending event
    BUSY: 'busy', // Processing, not ready for input
    MALFORMED: 'malformed', // JSON not parseable
    READY: 'ready' // Ready for input
};

// Events that indicate a session is ready for input
export const READY_EVENTS = new Set([
    SESSION_EVENTS.PENDING,
    SESSION_EVENTS.INTERRUPTED,
    SESSION_EVENTS.TURN_COMPLETE
]);

// Orchestration lifecycle events
export const ORCHESTRATION_EVENTS = {
    START: 'orchestration.start',
    COMPLETE: 'orchestration.complete',
    ERROR: 'orchestration.error'
};

// Pipeline stage events (state machine stages)
export const PIPELINE_EVENTS = {
    // Signal Detection
    SIGNAL_DETECTION_START: 'pipeline.signal_detection.start',
    SIGNAL_DETECTION_COMPLETE: 'pipeline.signal_detection.complete',
    SIGNAL_DETECTION_FAILED: 'pipeline.signal_detection.failed',

    // Fact Aggregation
    FACT_AGGREGATION_START: 'pipeline.fact_aggregation.start',
    FACT_AGGREGATION_COMPLETE: 'pipeline.fact_aggregation.complete',
    FACT_AGGREGATION_FAILED: 'pipeline.fact_aggregation.failed',

    // Rule Evaluation
    RULE_EVALUATION_START: 'pipeline.rule_evaluation.start',
    RULE_EVALUATION_COMPLETE: 'pipeline.rule_evaluation.complete',
    RULE_EVALUATION_FAILED: 'pipeline.rule_evaluation.failed',
    RULE_EXECUTION_TRACE: 'pipeline.rule_evaluation.trace',

    // Plan Selection
    PLAN_SELECTION_START: 'pipeline.plan_selection.start',
    PLAN_SELECTION_COMPLETE: 'pipeline.plan_selection.complete',
    PLAN_SELECTION_FAILED: 'pipeline.plan_selection.failed',

    // Instruction Composition
    INSTRUCTION_COMPOSITION_START: 'pipeline.instruction_composition.start',
    INSTRUCTION_COMPOSITION_COMPLETE: 'pipeline.instruction_composition.complete',
    INSTRUCTION_COMPOSITION_FAILED: 'pipeline.instruction_composition.failed',

    // Policy Check
    POLICY_CHECK_START: 'pipeline.policy_check.start',
    POLICY_CHECK_COMPLETE: 'pipeline.policy_check.complete',
    POLICY_CHECK_FAILED: 'pipeline.policy_check.failed',

    // Generic handler events (for middleware)
    HANDLER_START: 'pipeline.handler.start',
    HANDLER_COMPLETE: 'pipeline.handler.complete',
    HANDLER_FAILED: 'pipeline.handler.failed'
};

// Execution events
export const EXECUTION_EVENTS = {
    // Direct execution
    DIRECT_START: 'execution.direct.start',
    DIRECT_COMPLETE: 'execution.direct.complete',

    // Sequential execution
    SEQUENTIAL_START: 'execution.sequential.start',
    SEQUENTIAL_STEP_START: 'execution.sequential.step_start',
    SEQUENTIAL_STEP_COMPLETE: 'execution.sequential.step_complete',
    SEQUENTIAL_STEP_ERROR: 'execution.sequential.step_error',
    SEQUENTIAL_COMPLETE: 'execution.sequential.complete',

    // Parallel execution
    PARALLEL_START: 'execution.parallel.start',
    PARALLEL_BRANCH_START: 'execution.parallel.branch_start',
    PARALLEL_BRANCH_COMPLETE: 'execution.parallel.branch_complete',
    PARALLEL_BRANCH_ERROR: 'execution.parallel.branch_error',
    PARALLEL_COMPLETE: 'execution.parallel.complete',

    // Task execution (multi-cycle)
    TASK_START: 'execution.task.start',
    TASK_CYCLE_START: 'execution.task.cycle_start',
    TASK_CYCLE_COMPLETE: 'execution.task.cycle_complete',
    TASK_COMPLETE: 'execution.task.complete',
    TASK_BUDGET_EXCEEDED: 'execution.task.budget_exceeded',
    TASK_INTERRUPTED: 'execution.task.interrupted',

    // Tool execution
    TOOL_START: 'execution.tool.start',
    TOOL_REQUESTED: 'execution.tool.requested',
    TOOL_APPROVAL_REQUESTED: 'execution.tool.approval-requested',
    TOOL_APPROVED: 'execution.tool.approved',
    TOOL_DENIED: 'execution.tool.denied',
    TOOL_EXECUTED: 'execution.tool.executed',
    TOOL_ERROR: 'execution.tool.error',
    TOOL_COMPLETE: 'execution.tool.complete',

    // Interrupt events
    INTERRUPTED: 'execution.interrupted'
};

// System events
export const SYSTEM_EVENTS = {
    ERROR: 'system.error',
    WARNING: 'system.warning',
    METRIC: 'system.metric',
    PERFORMANCE_WARNING: 'system.performance.warning',
    BUDGET_EXCEEDED: 'system.budget.exceeded',

    // MCP (Model Context Protocol) events
    MCP_SERVERS_START: 'system.mcp.servers_start',
    MCP_SERVERS_STARTED: 'system.mcp.servers_started',
    MCP_SERVERS_ERROR: 'system.mcp.servers_error',
    MCP_TOOLS_DISCOVERED: 'system.mcp.tools_discovered',
    MCP_TOOLS_FILTERED: 'system.mcp.tools_filtered',
    MCP_VALIDATION_ERROR: 'system.mcp.validation_error',
    MCP_SERVERS_STOP: 'system.mcp.servers_stop',
    MCP_SERVERS_STOPPED: 'system.mcp.servers_stopped'
};

// Internal processing events
export const PROCESSING_EVENTS = {
    // Classifier operations
    CLASSIFIER_START: 'processing.classifier.start',
    CLASSIFIER_COMPLETE: 'processing.classifier.complete',
    CLASSIFIER_REGEX: 'processing.classifier.regex',
    CLASSIFIER_LLM: 'processing.classifier.llm',

    // LLM operations
    LLM_REQUEST: 'processing.llm.request',
    LLM_RESPONSE: 'processing.llm.response',
    LLM_ERROR: 'processing.llm.error',

    // Provider API operations
    PROVIDER_API_RAW_REQUEST: 'provider.api.raw_request',
    PROVIDER_API_RAW_RESPONSE: 'provider.api.raw_response',

    // Rules processing
    RULES_START: 'processing.rules.start',
    RULES_COMPLETE: 'processing.rules.complete',
    RULES_ITERATION: 'processing.rules.iteration',

    // Data flow
    INPUT_RECEIVED: 'processing.input.received',
    OUTPUT_GENERATED: 'processing.output.generated'
};

// Aggregate all events for convenience
export const EVENTS = {
    ...SESSION_EVENTS,
    ...ORCHESTRATION_EVENTS,
    ...PIPELINE_EVENTS,
    ...EXECUTION_EVENTS,
    ...SYSTEM_EVENTS,
    ...PROCESSING_EVENTS
};

// Helper to determine event domain
export function getEventDomain(eventType) {
    if (!eventType || typeof eventType !== 'string') return null;
    const parts = eventType.split('.');
    return parts[0] || null;
}

// Helper to determine event component
export function getEventComponent(eventType) {
    if (!eventType || typeof eventType !== 'string') return null;
    const parts = eventType.split('.');
    return parts.slice(0, 2).join('.') || null;
}

// Helper to determine event action
export function getEventAction(eventType) {
    if (!eventType || typeof eventType !== 'string') return null;
    const parts = eventType.split('.');
    return parts.at(-1) || null;
}

// Helper to check if an event is a start event
export function isStartEvent(eventType) {
    return getEventAction(eventType) === 'start';
}

// Helper to check if an event is a complete event
export function isCompleteEvent(eventType) {
    return getEventAction(eventType) === 'complete';
}

// Helper to get the corresponding complete event for a start event
export function getCompleteEvent(startEvent) {
    if (!isStartEvent(startEvent)) return null;
    return startEvent.replace('.start', '.complete');
}

// Helper to get the corresponding start event for a complete event
export function getStartEvent(completeEvent) {
    if (!isCompleteEvent(completeEvent)) return null;
    return completeEvent.replace('.complete', '.start');
}

// Event role constants
export const EVENT_ROLES = {
    BOUNDARY_START: 'boundary_start',
    BOUNDARY_END: 'boundary_end'
};

// Boundary type constants
export const BOUNDARY_TYPES = {
    SESSION: 'session',
    TURN: 'turn',
    ORCHESTRATION: 'orchestration',
    PIPELINE: 'pipeline',
    EXECUTION: 'execution',
    CYCLE: 'cycle',
    STEP: 'step',
    BRANCH: 'branch',
    TOOL: 'tool',
    LLM_EXCHANGE: 'llm_exchange'
};
