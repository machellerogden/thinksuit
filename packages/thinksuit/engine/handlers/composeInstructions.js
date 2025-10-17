/**
 * composeInstructions handler - core logic only
 * Pure decision plane - creates instructions based on plan and module configuration
 */

import { DEFAULT_INSTRUCTIONS } from '../constants/defaults.js';
import { PIPELINE_EVENTS } from '../constants/events.js';

/**
 * Validate that module's composeInstructions returned the required shape
 * @param {*} result - Result from module.composeInstructions
 * @returns {Object} - { valid: boolean, errors: string[] }
 */
function validateInstructionsResult(result) {
    const errors = [];

    if (!result || typeof result !== 'object') {
        errors.push('Result must be an object');
        return { valid: false, errors };
    }

    // Required string fields
    const requiredStrings = ['system', 'primary', 'adaptations', 'lengthGuidance', 'toolInstructions'];
    for (const field of requiredStrings) {
        if (typeof result[field] !== 'string') {
            errors.push(`${field} must be a string`);
        }
    }

    // Required number field
    if (typeof result.maxTokens !== 'number') {
        errors.push('maxTokens must be a number');
    }

    // Required metadata object with specific fields
    if (!result.metadata || typeof result.metadata !== 'object') {
        errors.push('metadata must be an object');
    } else {
        if (typeof result.metadata.role !== 'string') {
            errors.push('metadata.role must be a string');
        }
        if (typeof result.metadata.baseTokens !== 'number') {
            errors.push('metadata.baseTokens must be a number');
        }
        if (typeof result.metadata.tokenMultiplier !== 'number') {
            errors.push('metadata.tokenMultiplier must be a number');
        }
        if (typeof result.metadata.lengthLevel !== 'string') {
            errors.push('metadata.lengthLevel must be a string');
        }
        // adaptationKeys is optional but if present must be an array
        if (result.metadata.adaptationKeys !== undefined && !Array.isArray(result.metadata.adaptationKeys)) {
            errors.push('metadata.adaptationKeys must be an array if present');
        }
    }

    return { valid: errors.length === 0, errors };
}

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
    const parentBoundaryId = input.context?.parentBoundaryId || null;

    logger.info(
        {
            event: PIPELINE_EVENTS.INSTRUCTION_COMPOSITION_START,
            eventRole: 'boundary_start',
            boundaryType: 'pipeline',
            boundaryId,
            parentBoundaryId,
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
        logger.warn(
            {
                traceId,
                boundaryType: 'pipeline',
                boundaryId,
                parentBoundaryId
            },
            'Module missing composeInstructions function, using defaults'
        );
        return DEFAULT_INSTRUCTIONS;
    }

    // Call module's composition logic
    const moduleResult = await module.composeInstructions({ plan, factMap }, module);

    // Validate the module returned the expected shape
    const validation = validateInstructionsResult(moduleResult);
    if (!validation.valid) {
        logger.error(
            {
                traceId,
                boundaryType: 'pipeline',
                boundaryId,
                parentBoundaryId,
                data: {
                    errors: validation.errors
                }
            },
            'Module composeInstructions returned invalid shape'
        );
        return DEFAULT_INSTRUCTIONS;
    }

    // Engine enriches result with plan metadata
    const result = {
        ...moduleResult,
        metadata: {
            ...moduleResult.metadata,
            strategy: plan.strategy,
            toolsAvailable: plan.tools || []
        }
    };

    // Engine computes derived stats for logging (not part of module's responsibility)
    const signals = factMap.Signal || [];
    const signalCount = signals.length;
    const adaptationCount = result.metadata.adaptationKeys?.length || 0;

    logger.info(
        {
            event: PIPELINE_EVENTS.INSTRUCTION_COMPOSITION_COMPLETE,
            eventRole: 'boundary_end',
            boundaryType: 'pipeline',
            boundaryId,
            parentBoundaryId,
            traceId,

            data: {
                stage: 'instruction_composition',
                role: result.metadata.role,
                baseTokens: result.metadata.baseTokens,
                tokenMultiplier: result.metadata.tokenMultiplier,
                maxTokens: result.maxTokens,
                lengthLevel: result.metadata.lengthLevel,
                adaptationKeys: result.metadata.adaptationKeys,
                // Engine-computed stats
                signalCount,
                adaptationCount,
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
