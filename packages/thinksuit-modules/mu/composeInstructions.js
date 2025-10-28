/**
 * Mu Module - Instruction Composition
 * Simple plan-driven composition for role-based engagement
 */

/**
 * Compose instructions based on execution plan
 * @param {Object} input - { plan, factMap }
 * @param {Object} module - The mu module
 * @returns {Object} - { system, primary, adaptations, lengthGuidance, toolInstructions, maxTokens, metadata }
 */
export async function composeInstructions({ plan = {}, factMap = {} }, module) {
    // Find the role configuration
    const roleConfig = module.roles.find(r => r.name === plan.role) || module.roles.find(r => r.isDefault) || module.roles[0];
    const role = roleConfig.name;

    // Resolve system and primary prompts from keys
    const systemPrompt = module.prompts[roleConfig.prompts.system] || '';
    const primaryPrompt = module.prompts[roleConfig.prompts.primary] || '';

    // Format adaptations from plan (if specified)
    const adaptationList = (plan.adaptations || [])
        .map(key => module.prompts[`adapt.${key}`])
        .filter(Boolean);

    const adaptationText = adaptationList.length > 0
        ? `## Adaptations\n\nThe following adjustments apply based on the current context:\n\n${adaptationList.map(text => `- ${text}`).join('\n')}`
        : '';

    // Get length guidance
    const lengthLevel = plan.lengthLevel || 'standard';
    const lengthGuidance = module.lengthGuidance[lengthLevel] || module.lengthGuidance.standard || '';

    // Build tool instructions if tools are available
    let toolInstructions = '';
    if (plan.tools && plan.tools.length > 0) {
        const toolPrompts = [
            module.prompts['adapt.tools-available'],
            module.prompts['adapt.task-execution'],
            module.prompts['adapt.task-tool-guidance'],
            module.prompts['adapt.task-budget-awareness']
        ].filter(Boolean);

        toolInstructions = toolPrompts.length > 0
            ? `\n\n${toolPrompts.join('\n\n')}`
            : '';
    }

    // Calculate max tokens
    const maxTokens = plan.maxTokens || roleConfig.baseTokens || 500;

    return {
        system: systemPrompt,
        primary: primaryPrompt,
        adaptations: adaptationText,
        lengthGuidance,
        toolInstructions,
        maxTokens,
        metadata: {
            role,
            baseTokens: roleConfig.baseTokens,
            lengthLevel,
            adaptations: plan.adaptations || []
        }
    };
}
