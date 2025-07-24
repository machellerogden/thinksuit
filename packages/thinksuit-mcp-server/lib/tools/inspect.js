import { z } from 'zod';
import { getSession } from 'thinksuit';
import { readFileSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { SESSION_EVENTS, ORCHESTRATION_EVENTS } from 'thinksuit/constants/events';

export function registerInspectTool(server) {
    server.tool(
        'thinksuit-inspect',
        {
            action: z.enum(['session', 'trace', 'list-traces']).describe('What to inspect'),
            id: z.string().optional().describe('Session or trace ID to inspect'),
            options: z
                .object({
                    entryIndex: z.number().optional().describe('Specific entry index in session'),
                    showRaw: z.boolean().optional().describe('Show raw JSON data'),
                    limit: z.number().optional().describe('Limit results for list actions')
                })
                .optional()
        },
        async ({ action, id, options = {} }) => {
            try {
                switch (action) {
                    case 'session': {
                        if (!id) {
                            throw new Error('Session ID required for session inspection');
                        }

                        const session = await getSession(id);
                        if (!session) {
                            return {
                                content: [
                                    {
                                        type: 'text',
                                        text: `Session ${id} not found.`
                                    }
                                ]
                            };
                        }

                        let output = `## Session Inspection: ${id}\n\n`;

                        if (options.entryIndex !== undefined) {
                            const entry = session.entries[options.entryIndex];
                            if (!entry) {
                                return {
                                    content: [
                                        {
                                            type: 'text',
                                            text: `Entry ${options.entryIndex} not found in session.`
                                        }
                                    ]
                                };
                            }

                            output += `### Entry ${options.entryIndex}\n\n`;

                            if (entry.event === ORCHESTRATION_EVENTS.COMPLETE) {
                                if (entry.signals) {
                                    output += '**Signals Detected:**\n';
                                    Object.entries(entry.signals).forEach(([signal, value]) => {
                                        if (value) output += `- ✓ ${signal}\n`;
                                    });
                                    output += '\n';
                                }

                                if (entry.plan) {
                                    output += '**Execution Plan:**\n';
                                    output += `- Type: ${entry.plan.type}\n`;
                                    output += `- Strategy: ${entry.plan.strategy || 'direct'}\n`;
                                    if (entry.plan.role) {
                                        output += `- Role: ${entry.plan.role}\n`;
                                    } else if (entry.plan.roles) {
                                        output += `- Roles: ${entry.plan.roles.join(', ')}\n`;
                                    } else if (entry.plan.sequence) {
                                        const roles = entry.plan.sequence.map((s) =>
                                            typeof s === 'string' ? s : s.role
                                        );
                                        output += `- Sequence: ${roles.join(' → ')}\n`;
                                    }
                                    output += '\n';
                                }

                                if (entry.response) {
                                    output += '**Response:**\n';
                                    output += entry.response.substring(0, 500);
                                    if (entry.response.length > 500) {
                                        output += '...\n\n(truncated)';
                                    }
                                    output += '\n\n';
                                }
                            }

                            if (options.showRaw) {
                                output += '**Raw Entry Data:**\n';
                                output += '```json\n';
                                output += JSON.stringify(entry, null, 2);
                                output += '\n```\n';
                            }
                        } else {
                            output += `**Status:** ${session.status}\n`;
                            output += `**Entries:** ${session.entries.length}\n\n`;

                            output += '### Execution Flow\n\n';
                            session.entries.forEach((entry, i) => {
                                if (entry.event === SESSION_EVENTS.INPUT) {
                                    const input = entry.data?.input;
                                    if (input) {
                                        output += `${i}. 📝 **Input**: "${input.substring(0, 50)}${input.length > 50 ? '...' : ''}"\n`;
                                    }
                                } else if (entry.event === ORCHESTRATION_EVENTS.COMPLETE) {
                                    if (entry.plan?.strategy) {
                                        output += `${i}. 🎯 **Execution**: ${entry.plan.strategy}`;
                                        if (entry.plan.role) {
                                            output += ` (${entry.plan.role})`;
                                        } else if (entry.plan.roles) {
                                            output += ` (${entry.plan.roles.join(', ')})`;
                                        }
                                        output += '\n';
                                    }
                                } else if (entry.event === SESSION_EVENTS.RESPONSE) {
                                    output += `${i}. ✅ **Response**\n`;
                                }
                            });

                            if (session.metadata.hasTrace) {
                                output += `\n**Trace Available:** ${session.metadata.traceId}\n`;
                                output +=
                                    'Use `action: "trace"` to inspect the full execution trace.\n';
                            }
                        }

                        return {
                            content: [
                                {
                                    type: 'text',
                                    text: output
                                }
                            ]
                        };
                    }

                    case 'trace': {
                        if (!id) {
                            throw new Error('Trace ID required for trace inspection');
                        }

                        const tracesDir = join(homedir(), '.thinksuit', 'traces');
                        const traceFile = join(tracesDir, `${id}.jsonl`);

                        if (!existsSync(traceFile)) {
                            return {
                                content: [
                                    {
                                        type: 'text',
                                        text: `Trace ${id} not found.`
                                    }
                                ]
                            };
                        }

                        const lines = readFileSync(traceFile, 'utf8').split('\n').filter(Boolean);
                        const entries = lines.map((line) => JSON.parse(line));

                        let output = `## Trace Inspection: ${id}\n\n`;
                        output += `**Entries:** ${entries.length}\n\n`;

                        const spans = {};
                        entries.forEach((entry) => {
                            if (!spans[entry.spanId]) {
                                spans[entry.spanId] = {
                                    name: entry.spanName,
                                    parent: entry.parentSpanId,
                                    entries: []
                                };
                            }
                            spans[entry.spanId].entries.push(entry);
                        });

                        output += '### Execution Tree\n\n';
                        const renderSpan = (spanId, indent = '') => {
                            const span = spans[spanId];
                            if (!span) return '';

                            let result = `${indent}${span.name}\n`;

                            Object.keys(spans).forEach((childId) => {
                                if (spans[childId].parent === spanId) {
                                    result += renderSpan(childId, indent + '  ');
                                }
                            });

                            return result;
                        };

                        const rootSpans = Object.keys(spans).filter((id) => !spans[id].parent);
                        rootSpans.forEach((rootId) => {
                            output += renderSpan(rootId);
                        });

                        if (options.showRaw) {
                            output += '\n### Raw Trace Data\n';
                            output += '```json\n';
                            output += JSON.stringify(
                                entries.slice(0, options.limit || 10),
                                null,
                                2
                            );
                            output += '\n```\n';
                            if (entries.length > (options.limit || 10)) {
                                output += `\n(Showing first ${options.limit || 10} of ${entries.length} entries)\n`;
                            }
                        }

                        return {
                            content: [
                                {
                                    type: 'text',
                                    text: output
                                }
                            ]
                        };
                    }

                    case 'list-traces': {
                        const tracesDir = join(homedir(), '.thinksuit', 'traces');

                        if (!existsSync(tracesDir)) {
                            return {
                                content: [
                                    {
                                        type: 'text',
                                        text: 'No traces directory found. Run ThinkSuit with tracing enabled to generate traces.'
                                    }
                                ]
                            };
                        }

                        const files = readdirSync(tracesDir)
                            .filter((f) => f.endsWith('.jsonl'))
                            .map((f) => f.replace('.jsonl', ''))
                            .sort()
                            .reverse();

                        const limited = options.limit ? files.slice(0, options.limit) : files;

                        let output = `## Available Traces (${limited.length}${options.limit ? ` of ${files.length}` : ''})\n\n`;

                        if (limited.length === 0) {
                            output += 'No traces found.\n';
                        } else {
                            limited.forEach((traceId) => {
                                output += `- ${traceId}\n`;
                            });
                        }

                        return {
                            content: [
                                {
                                    type: 'text',
                                    text: output
                                }
                            ]
                        };
                    }

                    default:
                        throw new Error(`Unknown action: ${action}`);
                }
            } catch (error) {
                return {
                    content: [
                        {
                            type: 'text',
                            text: `❌ **Inspect Error**: ${error.message}`
                        }
                    ]
                };
            }
        }
    );
}
