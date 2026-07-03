import { z } from 'zod';
import { getSession } from 'thinksuit';
import { readFileSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { SESSION_EVENTS, EXECUTION_EVENTS } from 'thinksuit/constants/events';

const NODE_COMPLETE_EVENTS = [
    EXECUTION_EVENTS.TASK_COMPLETE,
    EXECUTION_EVENTS.SEQUENTIAL_COMPLETE,
    EXECUTION_EVENTS.PARALLEL_COMPLETE
];

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
                            output += `**Event:** ${entry.event}\n\n`;

                            if (NODE_COMPLETE_EVENTS.includes(entry.event)) {
                                const d = entry.data || {};
                                output += '**Execution:**\n';
                                if (d.role) output += `- Role: ${d.role}\n`;
                                if (d.rounds !== undefined) output += `- Rounds: ${d.rounds}\n`;
                                if (d.finishReason) output += `- Finish: ${d.finishReason}\n`;
                                if (d.usage) output += `- Usage: ${JSON.stringify(d.usage)}\n`;
                                output += '\n';
                            } else if (entry.event === SESSION_EVENTS.RESPONSE) {
                                const resp = entry.data?.response;
                                if (resp) {
                                    output += '**Response:**\n';
                                    output += resp.substring(0, 500);
                                    if (resp.length > 500) {
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
                                } else if (NODE_COMPLETE_EVENTS.includes(entry.event)) {
                                    const kind = entry.event.split('.')[1]; // task | sequential | parallel
                                    output += `${i}. 🎯 **${kind}**`;
                                    if (entry.data?.role) {
                                        output += ` (${entry.data.role})`;
                                    }
                                    output += '\n';
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
