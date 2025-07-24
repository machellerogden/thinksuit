/**
 * selectPlan handler - core logic only
 * Pure decision plane - selects a single plan from SelectedPlan facts
 */

import { PIPELINE_EVENTS } from '../constants/events.js';

/**
 * Core plan selection logic
 * @param {Object} input - { factMap }
 * @param {Object} machineContext - Enhanced context from middleware
 * @returns {Object} - { plan: Object }
 */
export async function selectPlanCore(input, machineContext) {
    const { factMap } = input;
    const { traceId, sessionId } = input.context || {};
    const logger = machineContext.execLogger;

    // Generate unique boundary ID for this pipeline stage
    const boundaryId = `pipeline-plan_selection-${sessionId}-${Date.now()}`;

    logger.info(
        {
            event: PIPELINE_EVENTS.PLAN_SELECTION_START,
            eventRole: 'boundary_start',
            boundaryType: 'pipeline',
            boundaryId,
            parentBoundaryId: input.context?.parentBoundaryId || null,
            traceId,
            data: {
                stage: 'plan_selection',
                selectedPlanCount: factMap.SelectedPlan?.length || 0
            }
        },
        'Starting plan selection'
    );

    // Get all SelectedPlan facts
    const allSelectedPlanFacts = factMap.SelectedPlan || [];

    if (allSelectedPlanFacts.length === 0) {
        logger.warn({ traceId }, 'No SelectedPlan facts available');
        return {
            plan: {
                strategy: 'direct',
                role: 'assistant',
                rationale: 'Fallback: No plans available'
            }
        };
    }

    // Prefer the plan with tools if available, otherwise use the last one
    const selectedPlanFacts = allSelectedPlanFacts.filter(f => f.plan?.hasTools);
    const finalSelectedPlan = selectedPlanFacts.length > 0
        ? selectedPlanFacts.at(-1)  // Last plan with tools
        : allSelectedPlanFacts.at(-1); // Last plan overall

    const plan = finalSelectedPlan?.plan || finalSelectedPlan;

    logger.info(
        {
            event: PIPELINE_EVENTS.PLAN_SELECTION_COMPLETE,
            eventRole: 'boundary_end',
            boundaryType: 'pipeline',
            boundaryId,
            parentBoundaryId: input.context?.parentBoundaryId || null,
            traceId,
            data: {
                stage: 'plan_selection',
                selectedPlan: plan
            }
        },
        'Plan selection completed'
    );

    return { plan };
}
