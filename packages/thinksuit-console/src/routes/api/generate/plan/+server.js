import { json } from '@sveltejs/kit';
import { buildConfig, loadModules, createLogger, callLLM } from 'thinksuit';
import { validatePlan } from 'thinksuit/schemas/validate';
import { modules as defaultModules } from 'thinksuit-modules';

// Stage 1 Schema: High-level structure (strategy selection)
const stage1Schema = {
    type: 'object',
    required: ['strategy', 'name', 'roles', 'buildThread', 'resultStrategy', 'rationale'],
    properties: {
        strategy: {
            enum: ['direct', 'task', 'sequential', 'parallel'],
            description: 'Execution strategy for this plan'
        },
        name: {
            type: 'string',
            description: 'Unique identifier for this plan'
        },
        roles: {
            type: 'array',
            items: { type: 'string' },
            description: 'Role names involved in this plan'
        },
        buildThread: {
            type: 'boolean',
            description: 'Whether to build conversation thread between sequential steps'
        },
        resultStrategy: {
            enum: ['last', 'concat'],
            description: 'How to combine results'
        },
        rationale: {
            type: 'string',
            description: 'Why this approach was chosen'
        }
    },
    additionalProperties: false
};

// Stage 2 Schemas: Strategy-specific details

const directDetailsSchema = {
    type: 'object',
    required: ['adaptations'],
    properties: {
        adaptations: {
            type: 'array',
            items: { type: 'string' },
            description: 'Adaptation keys to apply'
        }
    },
    additionalProperties: false
};

const taskDetailsSchema = {
    type: 'object',
    required: ['tools', 'adaptations'],
    properties: {
        tools: {
            type: 'array',
            items: { type: 'string' },
            description: 'Tool names to make available'
        },
        adaptations: {
            type: 'array',
            items: { type: 'string' },
            description: 'Adaptation keys to apply'
        }
    },
    additionalProperties: false
};

const sequentialDetailsSchema = {
    type: 'object',
    required: ['steps'],
    properties: {
        steps: {
            type: 'array',
            items: {
                type: 'object',
                required: ['role', 'strategy', 'tools', 'adaptations'],
                properties: {
                    role: {
                        type: 'string',
                        description: 'Role for this step'
                    },
                    strategy: {
                        enum: ['direct', 'task'],
                        description: 'Execution strategy for this step'
                    },
                    tools: {
                        type: 'array',
                        items: { type: 'string' },
                        description: 'Tools for this step (empty array for direct strategy)'
                    },
                    adaptations: {
                        type: 'array',
                        items: { type: 'string' },
                        description: 'Adaptations for this step'
                    }
                },
                additionalProperties: false
            }
        }
    },
    additionalProperties: false
};

const parallelDetailsSchema = {
    type: 'object',
    required: ['branches'],
    properties: {
        branches: {
            type: 'array',
            items: {
                type: 'object',
                required: ['role', 'strategy', 'tools', 'adaptations'],
                properties: {
                    role: {
                        type: 'string',
                        description: 'Role for this branch'
                    },
                    strategy: {
                        enum: ['direct', 'task'],
                        description: 'Execution strategy for this branch'
                    },
                    tools: {
                        type: 'array',
                        items: { type: 'string' },
                        description: 'Tools for this branch (empty array for direct strategy)'
                    },
                    adaptations: {
                        type: 'array',
                        items: { type: 'string' },
                        description: 'Adaptations for this branch'
                    }
                },
                additionalProperties: false
            }
        }
    },
    additionalProperties: false
};

// Stitching function
function stitchPlan(stage1Result, stage2Result) {
    const plan = {
        name: stage1Result.name,
        strategy: stage1Result.strategy,
        rationale: stage1Result.rationale || '',
        buildThread: stage1Result.buildThread !== false, // default true for sequential
        resultStrategy: stage1Result.resultStrategy || 'last'
    };

    switch (stage1Result.strategy) {
        case 'direct':
            plan.role = stage1Result.roles[0];
            plan.adaptations = stage2Result.adaptations || [];
            break;

        case 'task':
            plan.role = stage1Result.roles[0];
            plan.tools = stage2Result.tools || [];
            plan.adaptations = stage2Result.adaptations || [];
            break;

        case 'sequential':
            plan.sequence = stage2Result.steps || [];
            break;

        case 'parallel':
            plan.roles = stage2Result.branches || [];
            break;
    }

    return plan;
}

export async function POST({ request }) {
    try {
        const { description, currentPlan, availableTools = [] } = await request.json();

        if (!description || typeof description !== 'string') {
            return json({ error: 'Description is required and must be a string' }, { status: 400 });
        }

        // Load base config
        const config = buildConfig({ argv: [] });

        // Create logger for this request
        const execLogger = createLogger({
            level: 'info',
            silent: false,
            format: 'json'
        });

        // Determine modules
        let modules;
        const packagePath = config.modulesPackage;
        if (packagePath) {
            modules = await loadModules(packagePath);
        } else {
            modules = defaultModules;
        }

        // Get module metadata
        const moduleName = config.module || 'thinksuit/mu';
        const module = modules[moduleName];

        if (!module) {
            return json({
                error: `Module ${moduleName} not found`,
                availableModules: Object.keys(modules)
            }, { status: 404 });
        }

        // Extract available roles with descriptions
        const roles = module.roles || [];
        const roleDescriptions = roles.map(role => {
            const name = typeof role === 'string' ? role : role.name;
            const description = typeof role === 'object' && role.description
                ? role.description
                : '';
            return `- ${name}: ${description}`;
        }).join('\n');

        const availableAdaptations = Object.keys(module.prompts || {})
            .filter(key => key.startsWith('adapt.'))
            .map(key => key.replace('adapt.', ''));

        // Build machine context for callLLM
        const machineContext = {
            config,
            execLogger
        };

        // ============================================================
        // STAGE 1: Determine strategy and roles
        // ============================================================

        const stage1SystemPrompt = `You are a plan generator for ThinkSuit orchestration.

Available strategies:
- direct: Single role execution without tools
- task: Single role execution with tools
- sequential: Multiple roles executed in order
- parallel: Multiple roles executed concurrently

Available roles and their purposes:
${roleDescriptions}

Your task is to determine:
1. Which strategy is most appropriate for the request
2. Which role(s) are needed
3. Whether sequential steps should build a conversation thread
4. How results should be combined (for sequential/parallel)

Return ONLY the JSON object. No explanation, no markdown code blocks.`;

        const stage1UserPrompt = currentPlan
            ? `Revise the strategy for: ${description}\n\nCurrent plan:\n${JSON.stringify(currentPlan, null, 2)}`
            : `Determine the strategy and roles for: ${description}`;

        const stage1Response = await callLLM(
            machineContext,
            {
                model: config.model || 'gpt-4o-mini',
                thread: [
                    { role: 'system', content: stage1SystemPrompt },
                    { role: 'user', content: stage1UserPrompt }
                ],
                responseFormat: {
                    name: 'plan_structure',
                    schema: stage1Schema
                },
                maxTokens: 1000,
                temperature: 0.7
            }
        );

        const stage1Result = JSON.parse(stage1Response.output);

        // ============================================================
        // STAGE 2: Get strategy-specific details
        // ============================================================

        const toolsSection = availableTools.length > 0
            ? `Available tools:\n${availableTools.map(t => `- ${t.name}: ${t.description}`).join('\n')}`
            : 'Available tools: none';

        const adaptationsSection = `Available adaptations: ${availableAdaptations.join(', ')}`;

        let stage2Schema;
        let stage2SystemPrompt;
        let stage2UserPrompt;

        switch (stage1Result.strategy) {
            case 'direct':
                stage2Schema = directDetailsSchema;
                stage2SystemPrompt = `You are specifying details for a direct strategy plan.

Role: ${stage1Result.roles[0]}

${adaptationsSection}

Direct strategy executes a single role without tools. Specify which adaptations should be applied.

Return ONLY the JSON object. No explanation, no markdown code blocks.`;
                stage2UserPrompt = `What adaptations should be applied for: ${description}`;
                break;

            case 'task':
                stage2Schema = taskDetailsSchema;
                stage2SystemPrompt = `You are specifying details for a task strategy plan.

Role: ${stage1Result.roles[0]}

${toolsSection}

${adaptationsSection}

Task strategy executes a single role WITH tools. Specify which tools and adaptations are needed.

IMPORTANT: Only use tool names from the "Available tools" list above. Tool names must match exactly.

Return ONLY the JSON object. No explanation, no markdown code blocks.`;
                stage2UserPrompt = `What tools and adaptations are needed for: ${description}`;
                break;

            case 'sequential':
                stage2Schema = sequentialDetailsSchema;
                stage2SystemPrompt = `You are specifying details for a sequential strategy plan.

Roles to use (in order): ${stage1Result.roles.join(', ')}

${toolsSection}

${adaptationsSection}

Sequential strategy executes multiple roles in order. For each step, specify:
- role: which role to use
- strategy: "direct" (no tools) or "task" (with tools)
- tools: array of tool names (empty array [] if strategy is "direct")
- adaptations: array of adaptation names

IMPORTANT:
- Only use tool names from the "Available tools" list above
- Tool names must match exactly
- Use empty array [] for tools when strategy is "direct"
- Adaptations starting with "task-" are ONLY for task strategy steps
- Direct strategy steps should use general adaptations, not task-specific ones

For filesystem and codebase exploration tasks:
- Include tools for listing/discovering (to see what exists)
- Include tools for reading/examining (to inspect contents)
- Include tools for searching (to find specific patterns)
- Complete exploration typically requires multiple complementary tools, not just one

Return ONLY the JSON object. No explanation, no markdown code blocks.`;
                stage2UserPrompt = `For each step, specify ALL tools needed for thorough execution. For information gathering steps, include tools for both discovering and examining content. Specify: ${description}`;
                break;

            case 'parallel':
                stage2Schema = parallelDetailsSchema;
                stage2SystemPrompt = `You are specifying details for a parallel strategy plan.

Roles to use (concurrently): ${stage1Result.roles.join(', ')}

${toolsSection}

${adaptationsSection}

Parallel strategy executes multiple roles concurrently. For each branch, specify:
- role: which role to use
- strategy: "direct" (no tools) or "task" (with tools)
- tools: array of tool names (empty array [] if strategy is "direct")
- adaptations: array of adaptation names

IMPORTANT:
- Only use tool names from the "Available tools" list above
- Tool names must match exactly
- Use empty array [] for tools when strategy is "direct"
- Adaptations starting with "task-" are ONLY for task strategy steps
- Direct strategy steps should use general adaptations, not task-specific ones

For filesystem and codebase exploration tasks:
- Include tools for listing/discovering (to see what exists)
- Include tools for reading/examining (to inspect contents)
- Include tools for searching (to find specific patterns)
- Complete exploration typically requires multiple complementary tools, not just one

Return ONLY the JSON object. No explanation, no markdown code blocks.`;
                stage2UserPrompt = `For each branch, specify ALL tools needed for thorough execution. For information gathering, include tools for both discovering and examining content. Specify: ${description}`;
                break;
        }

        const stage2Response = await callLLM(
            machineContext,
            {
                model: config.model || 'gpt-4o-mini',
                thread: [
                    { role: 'system', content: stage2SystemPrompt },
                    { role: 'user', content: stage2UserPrompt }
                ],
                responseFormat: {
                    name: 'plan_details',
                    schema: stage2Schema
                },
                maxTokens: 1500,
                temperature: 0.7
            }
        );

        const stage2Result = JSON.parse(stage2Response.output);

        // ============================================================
        // STITCH: Combine stage 1 and stage 2 results
        // ============================================================

        const generatedPlan = stitchPlan(stage1Result, stage2Result);

        // Validate the generated plan
        const validation = validatePlan(generatedPlan);
        if (!validation.valid) {
            console.error('Generated plan failed validation:', validation.errors);
            return json({
                error: 'Generated plan is invalid',
                validationErrors: validation.errors,
                generatedPlan
            }, { status: 500 });
        }

        return json({ plan: generatedPlan });

    } catch (error) {
        console.error('Error generating plan:', error);

        // Handle provider errors (wrapped with E_PROVIDER prefix)
        if (error.message?.startsWith('E_PROVIDER:')) {
            const originalError = error.originalError || error;

            // Check for specific provider error codes
            if (originalError.status === 401 || originalError.code === 'invalid_api_key') {
                return json({
                    error: 'Invalid or missing API key. Please configure your API key in ~/.thinksuit.config.json or environment variables.'
                }, { status: 401 });
            }

            if (originalError.status === 429 || originalError.code === 'rate_limit_exceeded') {
                return json({
                    error: 'Rate limit exceeded. Please try again later.'
                }, { status: 429 });
            }
        }

        return json({
            error: error.message || 'Failed to generate plan'
        }, { status: 500 });
    }
}
