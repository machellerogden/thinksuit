import { z } from 'zod';
import { listSessions, getSession, getSessionMetadata, getSessionStatus } from 'thinksuit';

export function registerSessionTool(server) {
    server.tool(
        'thinksuit-session',
        {
            action: z.enum(['list', 'get', 'status', 'metadata']).describe('Action to perform'),
            sessionId: z
                .string()
                .optional()
                .describe('Session ID (required for get/status/metadata)'),
            options: z
                .object({
                    fromTime: z
                        .string()
                        .optional()
                        .describe('Start time for listing sessions (ISO 8601)'),
                    toTime: z
                        .string()
                        .optional()
                        .describe('End time for listing sessions (ISO 8601)'),
                    sortOrder: z
                        .enum(['asc', 'desc'])
                        .optional()
                        .describe('Sort order for listing'),
                    limit: z.number().optional().describe('Maximum number of sessions to return')
                })
                .optional()
        },
        async ({ action, sessionId, options = {} }) => {
            try {
                switch (action) {
                    case 'list': {
                        const sessions = await listSessions({
                            fromTime: options.fromTime,
                            toTime: options.toTime,
                            sortOrder: options.sortOrder || 'desc'
                        });

                        const limitedSessions = options.limit
                            ? sessions.slice(0, options.limit)
                            : sessions;

                        let output = `## Sessions (${limitedSessions.length}${options.limit ? ` of ${sessions.length}` : ''})\n\n`;

                        if (limitedSessions.length === 0) {
                            output += 'No sessions found.\n';
                        } else {
                            limitedSessions.forEach((session) => {
                                output += `### ${session.id}\n`;
                                output += `- Status: ${session.status}\n`;
                                if (session.firstEvent) {
                                    output += `- Started: ${new Date(session.firstEvent.time).toLocaleString()}\n`;
                                    if (session.firstEvent.thread?.[0]) {
                                        const firstMessage = session.firstEvent.thread[0].content;
                                        output += `- First input: "${firstMessage.substring(0, 50)}${firstMessage.length > 50 ? '...' : ''}"\n`;
                                    }
                                }
                                if (session.lastEvent && session.lastEvent !== session.firstEvent) {
                                    output += `- Last activity: ${new Date(session.lastEvent.time).toLocaleString()}\n`;
                                }
                                output += '\n';
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

                    case 'get': {
                        if (!sessionId) {
                            throw new Error('Session ID required for get action');
                        }

                        const session = await getSession(sessionId);

                        if (!session) {
                            return {
                                content: [
                                    {
                                        type: 'text',
                                        text: `Session ${sessionId} not found.`
                                    }
                                ]
                            };
                        }

                        let output = `## Session: ${session.id}\n\n`;
                        output += `- Status: ${session.status}\n`;
                        output += `- Entries: ${session.metadata.entryCount}\n`;
                        if (session.metadata.hasTrace) {
                            output += `- Has trace: Yes (${session.metadata.traceId})\n`;
                        }
                        output += '\n';

                        if (session.thread && session.thread.length > 0) {
                            output += '### Conversation Thread\n\n';
                            session.thread.forEach((msg) => {
                                output += `**${msg.role}**: ${msg.content}\n\n`;
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

                    case 'status': {
                        if (!sessionId) {
                            throw new Error('Session ID required for status action');
                        }

                        const status = await getSessionStatus(sessionId);

                        return {
                            content: [
                                {
                                    type: 'text',
                                    text: `Session ${sessionId} status: **${status}**`
                                }
                            ]
                        };
                    }

                    case 'metadata': {
                        if (!sessionId) {
                            throw new Error('Session ID required for metadata action');
                        }

                        const metadata = await getSessionMetadata(sessionId);

                        if (!metadata) {
                            return {
                                content: [
                                    {
                                        type: 'text',
                                        text: `Session ${sessionId} not found.`
                                    }
                                ]
                            };
                        }

                        let output = `## Session Metadata: ${metadata.id}\n\n`;
                        output += `- Status: ${metadata.status}\n`;

                        if (metadata.firstEvent) {
                            output += `- Started: ${new Date(metadata.firstEvent.time).toLocaleString()}\n`;
                        }

                        if (metadata.lastEvent) {
                            output += `- Last activity: ${new Date(metadata.lastEvent.time).toLocaleString()}\n`;
                            if (metadata.lastEvent.response) {
                                const preview = metadata.lastEvent.response.substring(0, 100);
                                output += `- Last response: "${preview}${metadata.lastEvent.response.length > 100 ? '...' : ''}"\n`;
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

                    default:
                        throw new Error(`Unknown action: ${action}`);
                }
            } catch (error) {
                return {
                    content: [
                        {
                            type: 'text',
                            text: `❌ **Session Error**: ${error.message}`
                        }
                    ]
                };
            }
        }
    );
}
