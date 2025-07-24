import { z } from 'zod';
import { detectSignalsCore, loadModule, createLogger } from 'thinksuit';

export function registerSignalsTool(server) {
    server.tool(
        'thinksuit-signals',
        {
            conversation: z
                .array(
                    z.object({
                        role: z
                            .enum(['user', 'assistant'])
                            .describe('The role of the message sender'),
                        content: z.string().describe('The message content')
                    })
                )
                .describe('Conversation thread to analyze'),
            options: z
                .object({
                    module: z
                        .string()
                        .optional()
                        .describe(
                            'Module to use for signal detection (default: thinksuit/mu)'
                        ),
                    profile: z
                        .enum(['fast', 'balanced', 'thorough'])
                        .optional()
                        .describe('Detection profile'),
                    budgetMs: z
                        .number()
                        .optional()
                        .describe('Time budget for detection in milliseconds')
                })
                .optional()
        },
        async ({ conversation, options = {} }) => {
            try {
                const moduleId = options.module || 'thinksuit/mu';
                const module = await loadModule(moduleId, null);

                const rootLogger = createLogger({
                    trace: false,
                    silent: true
                });
                const execLogger = rootLogger.child({
                    sessionId: `signals-${Date.now()}`,
                    spanId: 'root',
                    spanName: 'signals'
                });

                const thread = [...conversation];
                const context = {};

                const result = await detectSignalsCore(
                    {
                        thread,
                        context,
                        profile: options.profile,
                        budgetMs: options.budgetMs
                    },
                    {
                        module,
                        config: { apiKey: process.env.OPENAI_API_KEY },
                        execLogger
                    }
                );

                const signals = {};
                const patterns = [];

                if (result.facts) {
                    result.facts.forEach((fact) => {
                        if (fact.type === 'Signal') {
                            signals[fact.name] = true;
                        } else if (fact.type.endsWith('Pattern')) {
                            patterns.push({
                                name: fact.name,
                                insight: fact.insight,
                                confidence: fact.confidence
                            });
                        }
                    });
                }

                let output = '## Signal Analysis\n\n';

                output += '### Signals Detected\n';
                const detectedSignals = Object.keys(signals).filter((s) => signals[s]);
                if (detectedSignals.length > 0) {
                    detectedSignals.forEach((signal) => {
                        output += `- ✓ ${signal}\n`;
                    });
                } else {
                    output += '- (no signals detected)\n';
                }
                output += '\n';

                if (patterns.length > 0) {
                    output += '### Patterns Identified\n';
                    patterns.forEach((pattern) => {
                        output += `- **${pattern.name}**: ${pattern.insight}`;
                        if (pattern.confidence) {
                            output += ` (confidence: ${pattern.confidence})`;
                        }
                        output += '\n';
                    });
                    output += '\n';
                }

                output += '### Raw Data\n';
                output += '```json\n';
                output += JSON.stringify(
                    {
                        signals,
                        facts: result.facts,
                        metrics: result.metrics
                    },
                    null,
                    2
                );
                output += '\n```';

                return {
                    content: [
                        {
                            type: 'text',
                            text: output
                        }
                    ]
                };
            } catch (error) {
                return {
                    content: [
                        {
                            type: 'text',
                            text: `❌ **Signals Error**: ${error.message}`
                        }
                    ]
                };
            }
        }
    );
}
