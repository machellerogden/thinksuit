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
 * Helper to add resolved prompt to thread
 */
function addPromptToThread(resolved, thread) {
    if (!resolved) return;

    if (typeof resolved === 'string') {
        // String becomes assistant message
        thread.push({ role: 'assistant', content: resolved });
    } else if (Array.isArray(resolved)) {
        // Array is spread into thread
        thread.push(...resolved);
    } else if (typeof resolved === 'object') {
        // Object is added as-is (full message object)
        thread.push(resolved);
    }
}

/**
 * Compose instructions based on execution plan
 * Builds thread with system instructions embedded based on composition type
 *
 * @param {Object} input - { plan, factMap, thread, input, frame, compositionType }
 * @param {Object} module - The mu module
 * @returns {Object} - { thread, indices, adaptations, lengthGuidance, toolInstructions, maxTokens, metadata }
 */
export async function composeInstructions({ plan = {}, factMap = {}, thread = [], input = '', frame = null, compositionType = 'default', cwd = null }, module) {
    // Find the role configuration
    const roleConfig = module.roles.find(r => r.name === plan.role) || module.roles.find(r => r.isDefault) || module.roles[0];
    const role = roleConfig.name;

    // Build context for prompt functions
    const promptContext = {
        plan,
        factMap,
        tools: plan.tools || [],
        maxTokens: plan.maxTokens || roleConfig.baseTokens || 500,
        role,
        adaptations: plan.adaptations || [],
        lengthLevel: plan.lengthLevel || 'standard',
        cwd
    };

    // Resolve system prompt (always a string)
    const systemPromptValue = module.prompts[roleConfig.prompts.system];
    const systemPrompt = typeof systemPromptValue === 'function'
        ? systemPromptValue(promptContext)
        : systemPromptValue;

    // Resolve primary prompt
    const primaryPrompt = resolvePrompt(roleConfig.prompts.primary, promptContext, module);

    // Format adaptations from plan (if specified)
    const adaptationList = (plan.adaptations || [])
        .map(key => resolvePrompt(`adapt.${key}`, promptContext, module))
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
            resolvePrompt('adapt.tools-available', promptContext, module),
            resolvePrompt('adapt.task-execution', promptContext, module),
            resolvePrompt('adapt.task-tool-guidance', promptContext, module)
        ].filter(Boolean);

        toolInstructions = toolPrompts.join('\n\n');
    }

    // Build complete thread based on composition type
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

    if (compositionType === 'default') {
        // Default composition: frame (if any) + system + primary + input

        // Add frame exchange first if provided
        if (frame?.text) {
            indices.frameSet = completeThread.length;
            completeThread.push(
                { role: 'user', content: frame.text, semantic: 'frame_set' }
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

        // Add task execution alignment if this is a task strategy execution
        // (before primary prompt so primary is last instruction before user input)
        if (plan.strategy === 'task') {
            const alignmentScript = resolvePrompt('adapt.task-execution-alignment', promptContext, module);
            addPromptToThread(alignmentScript, completeThread);
        }

        // Add primary prompt (last before user input)
        indices.primaryPrompt = completeThread.length;
        completeThread.push({
            role: 'user',
            content: primaryPrompt,
            semantic: 'primary_instruction'
        });

        // Add primary prompt (last before user input)
        indices.teeUserInput = completeThread.length;

        completeThread.push({
            role: 'user',
            content: 'The following is your primary instruction for this session:',
            semantic: 'tee_input'
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

    } else if (compositionType === 'continuation') {
        // Continuation: preserve existing thread, minimal additions
        // The thread already has system + primary from the first cycle

        if (thread && thread.length > 0) {
            indices.conversationStart = 0;
            completeThread.push(...thread);
            indices.conversationEnd = completeThread.length - 1;
        }

        // Optionally add new user input if provided (e.g., progress messages)
        if (input && input.trim()) {
            indices.userInput = completeThread.length;
            completeThread.push({
                role: 'user',
                content: input,
                semantic: 'input'
            });
        }

    } else if (compositionType === 'accumulation') {
        // Accumulation: accumulated history + new system + new primary (no input)

        // Add all accumulated history first
        if (thread && thread.length > 0) {
            indices.conversationStart = 0;
            completeThread.push(...thread);
            indices.conversationEnd = completeThread.length - 1;
        }

        // Add new system instructions for this step
        indices.systemInstruction = completeThread.length;
        completeThread.push({
            role: 'system',
            content: systemInstructions,
            semantic: 'system_instruction'
        });

        // Add new primary prompt for this step
        indices.primaryPrompt = completeThread.length;
        completeThread.push({
            role: 'user',
            content: primaryPrompt,
            semantic: 'primary_instruction'
        });

        // No user input for accumulation - the input is in the first step only
    }

    // Calculate max tokens
    const maxTokens = plan.maxTokens || roleConfig.baseTokens || 500;

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
            adaptations: plan.adaptations || []
        }
    };
}
