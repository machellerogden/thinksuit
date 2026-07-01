import { z } from 'zod';
import { buildConfig } from 'thinksuit';
import * as client from 'thinksuit-broker';

export function registerThinkSuitTool(server) {
    server.tool(
        'thinksuit',
        {
            input: z.string().describe('The input message to process'),
            options: z
                .object({
                    sessionId: z
                        .string()
                        .optional()
                        .describe('Session ID to continue an existing session'),
                    module: z
                        .string()
                        .optional()
                        .describe('Module to use (default: thinksuit/mu)'),
                    model: z.string().optional().describe('LLM model to use'),
                    provider: z.string().optional().describe('LLM provider'),
                    maxDepth: z.number().optional().describe('Maximum recursion depth'),
                    maxFanout: z.number().optional().describe('Maximum parallel fanout'),
                    temperature: z.number().optional().describe('LLM temperature'),
                    maxTokens: z.number().optional().describe('Maximum tokens for response'),
                    trace: z.boolean().optional().describe('Enable execution tracing'),
                    cwd: z.string().optional().describe('Working directory for tools'),
                    tools: z.array(z.string()).optional().describe('List of tools to enable'),
                    autoApproveTools: z.boolean().optional().describe('Auto-approve tool usage')
                })
                .optional()
        },
        async ({ input, options = {} }) => {
            try {
                // The broker hosts the execution out-of-process; this server is a
                // thin client. Base config comes from ~/.thinksuit.json via
                // buildConfig (mcpServers, provider/model defaults, policy,
                // allowedDirectories); call-time options override on top. Credentials
                // are resolved by the worker from the environment /
                // ~/.thinksuit/secrets.env — never passed from here.
                const base = buildConfig();
                const { tools, autoApproveTools, maxDepth, maxFanout, ...rest } = options;
                const config = {
                    module: base.module,
                    modulesPackage: base.modulesPackage,
                    provider: base.provider,
                    model: base.model,
                    providerConfig: base.providerConfig,
                    cwd: base.cwd,
                    allowedDirectories: base.allowedDirectories,
                    mcpServers: base.mcpServers,
                    allowedTools: base.allowedTools,
                    policy: base.policy,
                    approvalTimeout: base.approvalTimeout,
                    trace: base.trace,
                    // Call-time overrides: module, provider, model, trace, cwd,
                    // sessionId, temperature, maxTokens.
                    ...rest,
                    input,
                    ...(tools !== undefined && { allowedTools: tools }),
                    ...((maxDepth !== undefined || maxFanout !== undefined) && {
                        policy: {
                            ...base.policy,
                            ...(maxDepth !== undefined && { maxDepth }),
                            ...(maxFanout !== undefined && { maxFanout })
                        }
                    }),
                    // Headless: no approval channel, so default to auto-approve to
                    // avoid hanging on a prompt nobody can answer. Honor explicit false.
                    autoApproveTools: autoApproveTools ?? true
                };

                // Start the turn in the broker. `from` is the pre-run entry count,
                // so awaitTurn observes only this turn, not session history.
                const { sessionId, from = 0, isNew } = await client.run(config);

                let traceId = null;
                const { outcome, response, error } = await client.awaitTurn(sessionId, {
                    from,
                    onEvent: (entry) => {
                        if (!traceId && entry.traceId) traceId = entry.traceId;
                    }
                });

                if (outcome !== 'completed') {
                    return {
                        content: [
                            {
                                type: 'text',
                                text: `❌ **Error** (${outcome}): ${error || 'Turn did not complete'}`
                            }
                        ]
                    };
                }

                const content = [
                    {
                        type: 'text',
                        text: response ?? ''
                    }
                ];

                if (options.trace) {
                    content.push({
                        type: 'text',
                        text: `\n\n_Session: ${sessionId}${isNew ? ' (new)' : ' (resumed)'}_`
                    });
                    if (traceId) {
                        content.push({ type: 'text', text: `_Trace: ${traceId}_` });
                    }
                }

                return { content };
            } catch (error) {
                return {
                    content: [
                        {
                            type: 'text',
                            text: `❌ **Error**: ${error.message}`
                        }
                    ]
                };
            }
        }
    );
}
