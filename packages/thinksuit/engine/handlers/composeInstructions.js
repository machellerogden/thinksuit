/**
 * composeInstructions handler - core logic only
 * Pure decision plane - creates instructions based on plan and module configuration
 */

import {
    DEFAULT_INSTRUCTIONS,
    DEFAULT_ROLE,
    DEFAULT_MIN_TOKENS,
    DEFAULT_MAX_TOKENS
} from '../constants/defaults.js';
import { PIPELINE_EVENTS, PROCESSING_EVENTS } from '../constants/events.js';

/**
 * Core instruction composition logic
 * @param {Object} input - { plan, module, facts }
 * @param {Object} ctx - Enhanced context from middleware
 * @returns {Object} - { instructions: Instructions }
 */
export async function composeInstructionsCore(input, machineContext) {
    const { plan = {}, factMap = {} } = input;
    const traceId = input.context?.traceId;
    const sessionId = input.context?.sessionId;
    const logger = machineContext.execLogger;

    // Get the full module from machineContext
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

    // If no module provided, use minimal defaults
    if (!module || !module.instructionSchema) {
        logger.warn({ traceId }, 'No module or instruction schema provided, using defaults');
        return DEFAULT_INSTRUCTIONS;
    }

    const { instructionSchema } = module;
    const { prompts: promptGetters, tokens: tokenConfig } = instructionSchema;

    // Determine the role(s) to compose instructions for
    const defaultRole = module?.defaultRole || DEFAULT_ROLE;
    const role = plan.role || defaultRole;

    // Get base prompts for the role
    const systemPrompt = promptGetters.system(role) || '';
    const primaryPrompt = promptGetters.primary(role) || '';

    // Collect adaptations based on detected signals
    const signals = factMap.Signal || [];
    const adaptations = [];
    const adaptationKeys = []; // Track which keys were used
    const addedSignals = new Set(); // Track to avoid duplicates

    // First, check if plan has an explicit adaptationKey (for iteration-specific adaptations)
    if (plan.adaptationKey) {
        const iterationAdaptation = promptGetters.adaptation(plan.adaptationKey);
        if (iterationAdaptation) {
            adaptations.push(iterationAdaptation);
            adaptationKeys.push(plan.adaptationKey);
            logger.debug(
                {
                    event: PROCESSING_EVENTS.RULES_ITERATION,
                    traceId,

                    data: {
                        adaptationKey: plan.adaptationKey,
                        role
                    }
                },
                'Applied iteration-specific adaptation'
            );
        }
    }

    for (const signal of signals) {
        if (!addedSignals.has(signal.signal)) {
            // Use just the signal name for adaptation lookup
            const adaptation = promptGetters.adaptation(signal.signal);
            if (adaptation) {
                adaptations.push(adaptation);
                adaptationKeys.push(signal.signal);
                addedSignals.add(signal.signal);
            }
        }
    }

    // Check for composite adaptations (Derived facts from rules)
    const derivedAdaptations = (factMap.Derived || [])
        .filter((f) => f.directive)
        .map((f) => f.directive);
    adaptations.push(...derivedAdaptations);
    // Track derived adaptations (they don't have explicit keys, mark as 'derived')
    for (let i = 0; i < derivedAdaptations.length; i++) {
        adaptationKeys.push('derived');
    }

    // Also check for Adaptation facts directly
    const adaptationFacts = (factMap.Adaptation || []).filter(
        (f) => f.signal && !addedSignals.has(f.signal)
    );
    for (const fact of adaptationFacts) {
        const adaptation = promptGetters.adaptation(fact.signal);
        if (adaptation) {
            adaptations.push(adaptation);
            adaptationKeys.push(fact.signal);
            addedSignals.add(fact.signal);
        }
    }

    // Determine length guidance based on contract signals
    let lengthLevel = 'standard';
    const contractSignal = signals.find((s) => s.dimension === 'contract');
    if (contractSignal) {
        switch (contractSignal.signal) {
            case 'ack-only':
            case 'capture-only':
                lengthLevel = 'brief';
                break;
            case 'explore':
            case 'analyze':
                lengthLevel = 'comprehensive';
                break;
        }
    }
    const lengthGuidance = promptGetters.length(lengthLevel) || '';

    // Calculate token budget
    const baseTokens = plan.maxTokens || tokenConfig.roleDefaults[role] || 500;
    let tokenMultiplier = plan.tokenMultiplier || 1;

    // Apply signal-based multipliers
    for (const signal of signals) {
        const signalKey = `${signal.dimension}.${signal.signal}`;
        const signalMultiplier = tokenConfig.signalMultipliers[signalKey];
        if (signalMultiplier) {
            tokenMultiplier *= signalMultiplier;
        }
    }

    // Apply TokenMultiplier facts from rules
    const tokenMultiplierFacts = factMap.TokenMultiplier || [];
    for (const tmFact of tokenMultiplierFacts) {
        if (tmFact.value) {
            tokenMultiplier *= tmFact.value;
        }
    }

    // Calculate final token count with safety bounds
    const rawTokens = Math.round(baseTokens * tokenMultiplier);
    const maxTokens = Math.max(DEFAULT_MIN_TOKENS, Math.min(DEFAULT_MAX_TOKENS, rawTokens));

    // Build tool instructions using module prompts
    let toolInstructions = '';
    const toolAdaptations = [];

    if (plan.tools && plan.tools.length > 0) {
        // Add general tools-available adaptation
        const toolsAvailableAdapt = promptGetters.adaptation('tools-available');
        if (toolsAvailableAdapt) {
            toolAdaptations.push(toolsAvailableAdapt);
            adaptationKeys.push('tools-available');
        }

        // Add task-aware instructions when in task mode
        if (plan.taskContext && plan.taskContext.isTask) {
            // Get task execution philosophy from module
            const taskExecutionAdapt = promptGetters.adaptation('task-execution');
            const taskToolAdapt = promptGetters.adaptation('task-tool-guidance');
            const taskBudgetAdapt = promptGetters.adaptation('task-budget-awareness');

            // Combine task adaptations
            const taskAdaptations = [
                { key: 'task-execution', adapt: taskExecutionAdapt },
                { key: 'task-tool-guidance', adapt: taskToolAdapt },
                { key: 'task-budget-awareness', adapt: taskBudgetAdapt }
            ].filter(item => item.adapt);

            if (taskAdaptations.length > 0) {
                taskAdaptations.forEach(item => adaptationKeys.push(item.key));
                toolAdaptations.push('\n' + taskAdaptations.map(item => item.adapt).join('\n\n'));
            }
        }

        toolInstructions = toolAdaptations.filter(Boolean).join('\n');
    }

    // Combine adaptations into single text
    const adaptationText = adaptations.filter(Boolean).join('\n\n');

    // Return instructions at top level (middleware will add metrics)
    const result = {
        system: systemPrompt,
        primary: primaryPrompt,
        adaptations: adaptationText,
        lengthGuidance,
        toolInstructions,
        maxTokens,
        metadata: {
            role,
            strategy: plan.strategy,
            signalCount: signals.length,
            adaptationCount: adaptations.length,
            tokenMultiplier: Math.round(tokenMultiplier * 100) / 100,
            lengthLevel,
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
                role,
                baseTokens,
                tokenMultiplier: result.metadata.tokenMultiplier,
                maxTokens,
                adaptationCount: adaptations.length,
                adaptationKeys,
                lengthLevel,
                toolsAvailable: plan.tools || []
            }
        },
        'Instruction composition completed'
    );

    return result;
}
