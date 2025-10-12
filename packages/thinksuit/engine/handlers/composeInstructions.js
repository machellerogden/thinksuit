/**
 * composeInstructions handler - core logic only
 * Pure decision plane - creates instructions based on plan and module configuration
 */

import { DEFAULT_INSTRUCTIONS } from '../constants/defaults.js';
import { PIPELINE_EVENTS } from '../constants/events.js';

/**
 * Engine wrapper for instruction composition
 * Delegates composition logic to module while providing infrastructure
 * @param {Object} input - { plan, factMap, context }
 * @param {Object} machineContext - { execLogger, module }
 * @returns {Object} - { system, primary, adaptations, lengthGuidance, toolInstructions, maxTokens, metadata }
 */
export async function composeInstructionsCore(input, machineContext) {
    const { plan = {}, factMap = {} } = input;
    const traceId = input.context?.traceId;
    const sessionId = input.context?.sessionId;
    const logger = machineContext.execLogger;
    const module = machineContext?.module;

    // Generate unique boundary ID for this pipeline stage
    const boundaryId = `pipeline-instruction_composition-${sessionId}-${Date.now()}`;

    logger.info(
        {
            event: PIPELINE_EVENTS.INSTRUCTION_COMPOSITION_START,
            eventRole: 'boundary_start',
            boundaryType: 'pipeline',
            boundaryId,
            parentBoundaryId: input.context?.parentBoundaryId || null,
            traceId,

            data: {
                stage: 'instruction_composition',
                strategy: plan.strategy,
                role: plan.role,
                sequence: plan.sequence,
                moduleVersion: module?.version,
                usingModuleFromContext: !!machineContext?.module
            }
        },
        'Starting instruction composition'
    );

    // Validate module has composition function
    if (!module?.composeInstructions) {
        logger.warn({ traceId }, 'Module missing composeInstructions function, using defaults');
        return DEFAULT_INSTRUCTIONS;
    }

    // Call module's composition logic
    const moduleResult = await module.composeInstructions({ plan, factMap }, module);

    // Engine enriches result with plan metadata
    const result = {
        ...moduleResult,
        metadata: {
            ...moduleResult.metadata,
            strategy: plan.strategy,
            toolsAvailable: plan.tools || []
        }
    };

    logger.info(
        {
            event: PIPELINE_EVENTS.INSTRUCTION_COMPOSITION_COMPLETE,
            eventRole: 'boundary_end',
            boundaryType: 'pipeline',
            boundaryId,
            parentBoundaryId: input.context?.parentBoundaryId || null,
            traceId,

            data: {
                stage: 'instruction_composition',
                role: result.metadata.role,
                baseTokens: result.metadata.baseTokens,
                tokenMultiplier: result.metadata.tokenMultiplier,
                maxTokens: result.maxTokens,
                adaptationCount: result.metadata.adaptationCount,
                adaptationKeys: result.metadata.adaptationKeys,
                lengthLevel: result.metadata.lengthLevel,
                toolsAvailable: plan.tools || [],
                // Include actual composed instructions for UI display
                instructions: {
                    system: result.system,
                    primary: result.primary,
                    adaptations: result.adaptations,
                    lengthGuidance: result.lengthGuidance,
                    toolInstructions: result.toolInstructions
                }
            }
        },
        'Instruction composition completed'
    );

    return result;
}
