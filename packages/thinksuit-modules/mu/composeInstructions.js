/**
 * Mu Module - Instruction Composition
 * Composes LLM instructions based on signals, plan, and module configuration
 */

const DEFAULT_ROLE = 'assistant';
const DEFAULT_MIN_TOKENS = 50;
const DEFAULT_MAX_TOKENS = 4000;

/**
 * Compose instructions for the mu module
 * @param {Object} input - { plan, factMap }
 * @param {Object} module - The mu module with instructionSchema
 * @returns {Object} - { system, primary, adaptations, lengthGuidance, toolInstructions, maxTokens, metadata }
 */
export async function composeInstructions({ plan = {}, factMap = {} }, module) {
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

    // Return instructions and composition metadata
    return {
        system: systemPrompt,
        primary: primaryPrompt,
        adaptations: adaptationText,
        lengthGuidance,
        toolInstructions,
        maxTokens,
        metadata: {
            role,
            signalCount: signals.length,
            adaptationCount: adaptations.length,
            adaptationKeys,
            tokenMultiplier: Math.round(tokenMultiplier * 100) / 100,
            lengthLevel
        }
    };
}
