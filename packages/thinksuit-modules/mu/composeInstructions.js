/**
 * Mu Module - Instruction Composition
 * Builds complete thread with system instructions separated
 * Module owns the complete thread structure for maximum flexibility
 */

/**
 * Helper to resolve prompts (call if function, use if string/array)
 */
function resolvePrompt(key, context, module) {
    const prompt = module.prompts[key];
    if (!prompt) return null;
    if (typeof prompt === 'function') return prompt(context);
    return prompt;
}

/**
 * Compose instructions for a plan.v1 task node.
 * Builds the complete thread with system instructions embedded, in one default path:
 * prelude (frame + modality) → system → conversation history → primary → user input.
 *
 * @param {Object} input - { plan, thread, input, frame, modality, cwd, workdir }
 *   plan - a plan.v1 node: { type, role, tools?, params? }; module knobs (lengthLevel,
 *          adaptations, maxTokens) live in `params`.
 * @param {Object} module - The mu module
 * @returns {Object} - { thread, indices, adaptations, lengthGuidance, toolInstructions, maxTokens, metadata }
 */
export async function composeInstructions({ plan = {}, thread = [], input = '', frame = null, modality = null, cwd = null, workdir = null }, module) {
    // Resolve the modality instruction text the module declares for the active
    // modality name (e.g. 'voice'). A discrete sibling to frame, composed into the
    // same synthetic prelude. Unknown/absent modality → nothing.
    const modalityText = (modality && module.modalities?.[modality]) || null;
    // Find the role configuration
    const roleConfig = module.roles.find(r => r.name === plan.role) || module.roles.find(r => r.isDefault) || module.roles[0];
    const role = roleConfig.name;

    // Module knobs live in the plan node's open `params` bag.
    const params = plan.params || {};
    const planAdaptations = params.adaptations || [];
    const lengthLevel = params.lengthLevel || 'standard';
    const maxTokens = params.maxTokens || roleConfig.baseTokens || 500;

    // Build context for prompt functions
    const promptContext = {
        plan,
        tools: plan.tools || [],
        maxTokens,
        role,
        adaptations: planAdaptations,
        lengthLevel,
        cwd,
        workdir // session home base; available to prompts (unused in mu today)
    };

    // Resolve system prompt (always a string)
    const systemPromptValue = module.prompts[roleConfig.prompts.system];
    const systemPrompt = typeof systemPromptValue === 'function'
        ? systemPromptValue(promptContext)
        : systemPromptValue;

    // Resolve primary prompt
    const primaryPrompt = resolvePrompt(roleConfig.prompts.primary, promptContext, module);

    // Format adaptations from the plan (if specified)
    const adaptationList = planAdaptations
        .map(key => resolvePrompt(`adapt.${key}`, promptContext, module))
        .filter(Boolean);

    const adaptationText = adaptationList.length > 0
        ? `## Adaptations\n\nThe following adjustments apply based on the current context:\n\n${adaptationList.map(text => `- ${text}`).join('\n')}`
        : '';

    // Get length guidance
    const lengthGuidance = module.lengthGuidance[lengthLevel] || module.lengthGuidance.standard || '';

    // Build tool instructions if tools are available
    let toolInstructions = '';
    if (plan.tools && plan.tools.length > 0) {
        const toolPrompts = [
            resolvePrompt('adapt.tools-available', promptContext, module),
            resolvePrompt('adapt.task-execution', promptContext, module),
            resolvePrompt('adapt.task-tool-guidance', promptContext, module)
        ].filter(Boolean);

        toolInstructions = toolPrompts.join('\n\n');
    }

    // Build the complete thread: prelude → system → history → primary → user input.
    const completeThread = [];
    const indices = {
        systemInstruction: -1,
        frameSet: -1,
        frameAck: -1,
        primaryPrompt: -1,
        conversationStart: -1,
        conversationEnd: -1,
        userInput: -1
    };

    // Build system instructions once
    let systemInstructions = systemPrompt;
    if (toolInstructions) {
        systemInstructions += '\n\n' + toolInstructions;
    }

    // Add the synthetic prelude first if present: the situational frame, then the
    // modality as its own section after it. Both are established as an enacted,
    // acknowledged exchange (not system directives).
    const preludeText = [frame?.text, modalityText].filter(Boolean).join('\n\n');
    if (preludeText) {
        indices.frameSet = completeThread.length;
        completeThread.push(
            { role: 'user', content: preludeText, semantic: 'frame_set' }
        );
        indices.frameAck = completeThread.length;
        completeThread.push(
            { role: 'assistant', content: 'Understood. I will maintain this context throughout our session.', semantic: 'frame_ack' }
        );
    }

    // Add system instructions
    indices.systemInstruction = completeThread.length;
    completeThread.push({
        role: 'system',
        content: systemInstructions,
        semantic: 'system_instruction'
    });

    // Include conversation history from previous turns
    if (thread && thread.length > 0) {
        indices.conversationStart = completeThread.length;
        completeThread.push(...thread);
        indices.conversationEnd = completeThread.length - 1;
    }

    // Add primary prompt (last before user input)
    indices.primaryPrompt = completeThread.length;
    completeThread.push({
        role: 'user',
        content: primaryPrompt,
        semantic: 'primary_instruction'
    });

    // Add user input
    if (input && input.trim()) {
        indices.userInput = completeThread.length;
        completeThread.push({
            role: 'user',
            content: input,
            semantic: 'input'
        });
    }

    return {
        thread: completeThread,
        indices,
        adaptations: adaptationText,  // For logging/UI
        lengthGuidance,               // For logging/UI
        toolInstructions,             // For logging/UI
        maxTokens,
        metadata: {
            role,
            baseTokens: roleConfig.baseTokens,
            lengthLevel,
            adaptations: planAdaptations
        }
    };
}
