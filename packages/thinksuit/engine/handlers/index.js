/**
 * Handler Index - Centralizes middleware wrapping for all handlers
 *
 * This module imports core handler logic and wraps each with appropriate middleware.
 * Keeps handler implementations clean and focused on business logic.
 */

import { withMiddleware } from '../middleware/index.js';
import { loggingMiddleware } from '../middleware/logging.js';
import { withBudget } from '../middleware/metrics.js';

// Import core handler logic (without middleware)
import { detectSignalsCore } from './detectSignals.js';
import { aggregateFactsCore } from './aggregateFacts.js';
import { evaluateRulesCore } from './evaluateRules.js';
import { selectPlanCore } from './selectPlan.js';
import { composeInstructionsCore } from './composeInstructions.js';
import { execDirectCore } from './execDirect.js';
import { execSequentialCore } from './execSequential.js';
import { execParallelCore } from './execParallel.js';
import { execTaskCore } from './execTask.js';
import { execFallbackCore } from './execFallback.js';

/**
 * Initialize handlers with middleware
 * This function must be called after logger configuration
 * to avoid import-time side effects
 */
export function initializeHandlers() {
    /**
     * Decision Plane Handlers (Pure)
     * These handlers don't have side effects and optionally use IO for enhancement
     */
    const detectSignals = withMiddleware(
        detectSignalsCore,
        loggingMiddleware({ name: 'detectSignals' }),
        withBudget(10000, 'detectSignals') // 10 second budget
    );

    const aggregateFacts = withMiddleware(
        aggregateFactsCore,
        loggingMiddleware({ name: 'aggregateFacts' }),
        withBudget(50, 'aggregateFacts') // 50ms budget
    );

    const evaluateRules = withMiddleware(
        evaluateRulesCore,
        loggingMiddleware({ name: 'evaluateRules' }),
        withBudget(100, 'evaluateRules') // 100ms budget per blueprint
    );

    const selectPlan = withMiddleware(
        selectPlanCore,
        loggingMiddleware({ name: 'selectPlan' }),
        withBudget(50, 'selectPlan') // 50ms budget
    );

    const composeInstructions = withMiddleware(
        composeInstructionsCore,
        loggingMiddleware({ name: 'composeInstructions' }),
        withBudget(50, 'composeInstructions') // 50ms budget
    );

    /**
     * Execution Plane Handlers (Effectful)
     * These handlers make external calls and require IO
     */
    const execDirect = withMiddleware(
        execDirectCore,
        loggingMiddleware({ name: 'execDirect' }),
        withBudget(30000, 'execDirect') // 30 second budget
    );

    const execSequential = withMiddleware(
        execSequentialCore,
        loggingMiddleware({ name: 'execSequential' }),
        withBudget(60000, 'execSequential') // 60 second budget
    );

    const execParallel = withMiddleware(
        execParallelCore,
        loggingMiddleware({ name: 'execParallel' }),
        withBudget(30000, 'execParallel') // 30 second budget
    );

    const execTask = withMiddleware(
        execTaskCore,
        loggingMiddleware({ name: 'execTask' }),
        withBudget(60000, 'execTask') // 60 second budget for multi-cycle
    );

    const execFallback = withMiddleware(
        execFallbackCore,
        loggingMiddleware({ name: 'execFallback' }),
        withBudget(1000, 'execFallback') // 1 second budget
    );

    // Return all handlers
    return {
        detectSignals,
        aggregateFacts,
        evaluateRules,
        selectPlan,
        composeInstructions,
        execDirect,
        execSequential,
        execParallel,
        execTask,
        execFallback,
        Fallback: execFallback // Alias for state machine compatibility
    };
}

// Export core handlers for testing or direct use
export {
    detectSignalsCore,
    aggregateFactsCore,
    evaluateRulesCore,
    selectPlanCore,
    composeInstructionsCore,
    execDirectCore,
    execSequentialCore,
    execParallelCore,
    execTaskCore,
    execFallbackCore
};
