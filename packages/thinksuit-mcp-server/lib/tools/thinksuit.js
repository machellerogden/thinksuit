import { z } from 'zod';
import { schedule } from 'thinksuit';

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
                const config = {
                    ...options,
                    apiKey: process.env.OPENAI_API_KEY
                };

                const { sessionId, isNew, execution } = await schedule({
                    input,
                    sessionId: options.sessionId,
                    ...config
                });

                const result = await execution;

                const response = {
                    content: [
                        {
                            type: 'text',
                            text: result.response
                        }
                    ]
                };

                if (options.trace && result.metadata?.traceId) {
                    response.content.push({
                        type: 'text',
                        text: `\n\n_Session: ${sessionId}${isNew ? ' (new)' : ' (resumed)'}_`
                    });
                    response.content.push({
                        type: 'text',
                        text: `_Trace: ${result.metadata.traceId}_`
                    });
                }

                return response;
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
