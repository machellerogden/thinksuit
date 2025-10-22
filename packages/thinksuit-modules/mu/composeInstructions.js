/**
 * Mu Module - Instruction Composition
 * Composes LLM instructions based on signals, plan, and module configuration
 */

const DEFAULT_MIN_TOKENS = 50;
const DEFAULT_MAX_TOKENS = 4000;

/**
 * Find role configuration by name
 * @param {Array} roles - Array of role objects
 * @param {string} roleName - Name of role to find
 * @returns {Object|null} Role configuration or null if not found
 */
function getRoleConfig(roles, roleName) {
    return roles.find(r => r.name === roleName) || null;
}

/**
 * Get default role from module
 * @param {Object} module - Module with roles array
 * @returns {Object} Default role configuration
 */
function getDefaultRole(module) {
    return module.roles.find(r => r.isDefault) || module.roles[0];
}

/**
 * Compose instructions for the mu module
 * @param {Object} input - { plan, factMap }
 * @param {Object} module - The mu module with new schema
 * @returns {Object} - { system, primary, adaptations, lengthGuidance, toolInstructions, maxTokens, metadata }
 */
export async function composeInstructions({ plan = {}, factMap = {} }, module) {
    // Determine the role to compose instructions for
    const roleConfig = plan.role
        ? getRoleConfig(module.roles, plan.role) || getDefaultRole(module)
        : getDefaultRole(module);

    const role = roleConfig.name;

    // Get base prompts for the role from role configuration
    const systemPrompt = roleConfig.prompts.system || '';
    const primaryPrompt = roleConfig.prompts.primary || '';

    // Collect adaptations based on detected signals
    const signals = factMap.Signal || [];
    const adaptations = [];
    const adaptationKeys = []; // Track which keys were used
    const addedSignals = new Set(); // Track to avoid duplicates

    // First, check if plan has an explicit adaptationKey (for iteration-specific adaptations)
    if (plan.adaptationKey) {
        const iterationAdaptation = module.adaptations[plan.adaptationKey];
        if (iterationAdaptation) {
            adaptations.push(iterationAdaptation);
            adaptationKeys.push(plan.adaptationKey);
        }
    }

    // Add signal-based adaptations
    for (const signal of signals) {
        if (!addedSignals.has(signal.signal)) {
            // Look up signal configuration
            const signalConfig = module.signals[signal.signal];
            if (signalConfig?.adaptation) {
                adaptations.push(signalConfig.adaptation);
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
        const signalConfig = module.signals[fact.signal];
        if (signalConfig?.adaptation) {
            adaptations.push(signalConfig.adaptation);
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
    const lengthGuidance = module.lengthGuidance[lengthLevel] || module.lengthGuidance.standard || '';

    // Calculate token budget
    const baseTokens = plan.maxTokens || roleConfig.baseTokens || 500;
    let tokenMultiplier = plan.tokenMultiplier || 1;

    // Apply signal-based multipliers
    for (const signal of signals) {
        const signalConfig = module.signals[signal.signal];
        if (signalConfig?.tokenMultiplier) {
            tokenMultiplier *= signalConfig.tokenMultiplier;
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

    // Build tool instructions using module adaptations
    let toolInstructions = '';
    const toolAdaptations = [];

    if (plan.tools && plan.tools.length > 0) {
        // Add general tools-available adaptation
        const toolsAvailableAdapt = module.adaptations['tools-available'];
        if (toolsAvailableAdapt) {
            toolAdaptations.push(toolsAvailableAdapt);
            adaptationKeys.push('tools-available');
        }

        // Add task-aware instructions when in task mode
        if (plan.taskContext && plan.taskContext.isTask) {
            // Get task execution philosophy from module
            const taskExecutionAdapt = module.adaptations['task-execution'];
            const taskToolAdapt = module.adaptations['task-tool-guidance'];
            const taskBudgetAdapt = module.adaptations['task-budget-awareness'];

            // Combine task adaptations
            const taskAdaptations = [
                { key: 'task-execution', adapt: taskExecutionAdapt },
                { key: 'task-tool-guidance', adapt: taskToolAdapt },
                { key: 'task-budget-awareness', adapt: taskBudgetAdapt }
            ].filter(item => item.adapt);

            if (taskAdaptations.length > 0) {
                taskAdaptations.forEach(item => adaptationKeys.push(item.key));
                toolAdaptations.push('\n\n' + taskAdaptations.map(item => item.adapt).join('\n\n'));
            }
        }

        toolInstructions = toolAdaptations.filter(Boolean).join('\n');
    }

    // Combine adaptations into single text
    const adaptationText = adaptations.filter(Boolean).join('\n\n');

    // Return instructions and composition metadata
    // Module only returns what it naturally computed during composition
    return {
        system: systemPrompt,
        primary: primaryPrompt,
        adaptations: adaptationText,
        lengthGuidance,
        toolInstructions,
        maxTokens,
        metadata: {
            role,
            baseTokens,
            tokenMultiplier: Math.round(tokenMultiplier * 100) / 100,
            lengthLevel,
            adaptationKeys  // Useful for debugging which adaptations were applied
        }
    };
}
