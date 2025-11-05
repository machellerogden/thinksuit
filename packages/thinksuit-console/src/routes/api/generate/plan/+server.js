import { json } from '@sveltejs/kit';
import { buildConfig, loadModules, createLogger, callLLM } from 'thinksuit';
import { validatePlan } from 'thinksuit/schemas/validate';
import { modules as defaultModules } from 'thinksuit-modules';
import planSchema from 'thinksuit/schemas/plan.v1.json' with { type: 'json' };

export async function POST({ request }) {
    try {
        const { description, currentPlan } = await request.json();

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

        // Extract available options for the LLM
        const availableRoles = module.roles?.map(r =>
            typeof r === 'string' ? r : r.name
        ) || [];

        const availableAdaptations = Object.keys(module.prompts || {})
            .filter(key => key.startsWith('adapt.'))
            .map(key => key.replace('adapt.', ''));

        // Build system prompt with schema and available options
        const systemPrompt = `You are a plan generator for ThinkSuit orchestration.

Available strategies: direct, task, sequential, parallel
Available roles: ${availableRoles.join(', ')}
Available adaptations: ${availableAdaptations.join(', ')}

CRITICAL RULES - READ CAREFULLY:

1. DIRECT STRATEGY - Use "role" field, NOT "sequence" or "roles":
   {
     "strategy": "direct",
     "name": "plan-name",
     "role": "role-name"
   }
   - MUST include: strategy, name, role
   - NEVER include: sequence, roles
   - Optional: adaptations (array of strings)

2. TASK STRATEGY - Use "role" field, NOT "sequence" or "roles":
   {
     "strategy": "task",
     "name": "plan-name",
     "role": "role-name",
     "tools": ["tool1"]
   }
   - MUST include: strategy, name, role
   - NEVER include: sequence, roles
   - Optional: tools (array), adaptations (array), resolution (object with maxCycles/maxTokens/maxToolCalls/timeoutMs)

3. SEQUENTIAL STRATEGY - Use "sequence" field, NOT "role" or "roles":
   {
     "strategy": "sequential",
     "name": "plan-name",
     "sequence": [
       { "role": "role-name", "strategy": "direct" }
     ]
   }
   - MUST include: strategy, name, sequence (array of objects)
   - NEVER include: role, roles
   - Each sequence item MUST have: role, strategy
   - Optional: resultStrategy ("last" or "concat"), buildThread (boolean)

4. PARALLEL STRATEGY - Use "roles" field, NOT "role" or "sequence":
   {
     "strategy": "parallel",
     "name": "plan-name",
     "roles": [
       { "role": "role-name", "strategy": "direct" }
     ]
   }
   - MUST include: strategy, name, roles (array of objects)
   - NEVER include: role, sequence
   - Each roles item MUST have: role, strategy
   - Optional: resultStrategy ("last" or "concat")

VALIDATION CHECKLIST:
- If strategy is "direct" or "task" → use "role" field only
- If strategy is "sequential" → use "sequence" field only
- If strategy is "parallel" → use "roles" field only
- Never mix these fields together
- All field names must match exactly (case-sensitive)

Return ONLY the JSON plan object. No explanation, no markdown code blocks.`;

        // Build user prompt
        let userPrompt = `Generate an execution plan for: ${description}`;
        if (currentPlan) {
            userPrompt += `\n\nCurrent plan:\n${JSON.stringify(currentPlan, null, 2)}\n\nRevise this plan based on the description.`;
        }

        // Build machine context for callLLM
        const machineContext = {
            config,
            execLogger
        };

        // Transform schema for structured output - OpenAI requires all properties in required arrays
        function transformSchemaForStructuredOutput(schema) {
            const transformed = JSON.parse(JSON.stringify(schema));

            function processNode(node, isRoot = false) {
                if (!node || typeof node !== 'object') return;

                // Remove oneOf and use the object variant (for sequence/roles items)
                if (node.oneOf) {
                    const objectVariant = node.oneOf.find(v => v.type === 'object');
                    if (objectVariant) {
                        delete node.oneOf;
                        Object.assign(node, objectVariant);
                    }
                }

                // Set additionalProperties: false and add required for ALL objects
                if (node.type === 'object' && node.properties) {
                    node.additionalProperties = false;
                    // OpenAI strict mode requires all properties to be in required array
                    node.required = Object.keys(node.properties);
                }

                // Recurse
                if (node.properties) {
                    Object.values(node.properties).forEach(prop => processNode(prop, false));
                }
                if (node.items) {
                    processNode(node.items, false);
                }
            }

            processNode(transformed, true);
            return transformed;
        }

        const structuredSchema = transformSchemaForStructuredOutput(planSchema);

        // Call LLM through ThinkSuit's provider abstraction
        const response = await callLLM(
            machineContext,
            {
                model: config.model || 'gpt-4o-mini',
                thread: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userPrompt }
                ],
                responseFormat: {
                    name: 'execution_plan',
                    schema: structuredSchema
                },
                maxTokens: 2000,
                temperature: 0.7
            }
        );

        const generatedPlan = JSON.parse(response.output);

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
