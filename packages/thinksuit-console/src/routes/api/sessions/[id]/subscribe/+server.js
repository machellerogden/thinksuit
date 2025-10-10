import { subscribeToSession } from 'thinksuit';

export async function GET({ params }) {
    const { id } = params;

    // Create SSE response
    const stream = new ReadableStream({
        start(controller) {
            // Track if the controller is closed
            let isClosed = false;

            // Safe enqueue wrapper
            const safeEnqueue = (data) => {
                if (!isClosed) {
                    try {
                        controller.enqueue(data);
                    } catch (error) {
                        // Controller is closed, mark it and clean up
                        if (error.code === 'ERR_INVALID_STATE') {
                            isClosed = true;
                            cleanup();
                        } else {
                            console.error('Error sending event:', error);
                        }
                    }
                }
            };

            // Send initial connection message
            safeEnqueue('data: {"type":"connected"}\n\n');

            // Subscribe to session events
            const subscription = subscribeToSession(
                id,
                // Event handler
                ({ sessionId, type, msg, data }) => {
                    if (sessionId) {
                        const json = JSON.stringify({ sessionId, type, msg, data });
                        safeEnqueue(`data: ${json}\n\n`);
                    }
                },
                // Error handler
                (error) => {
                    const data = JSON.stringify({
                        type: 'error',
                        error: error.message
                    });
                    safeEnqueue(`data: ${data}\n\n`);
                }
            );

            // Heartbeat to keep connection alive
            const heartbeat = setInterval(() => {
                safeEnqueue(':heartbeat\n\n');
            }, 30000);

            // Cleanup function
            const cleanup = () => {
                if (!isClosed) {
                    isClosed = true;
                }
                clearInterval(heartbeat);
                if (subscription && subscription.unsubscribe) {
                    subscription.unsubscribe();
                }
            };

            // Return cleanup function for when stream is cancelled
            return cleanup;
        }
    });

    return new Response(stream, {
        headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'X-Accel-Buffering': 'no' // Disable nginx buffering
        }
    });
}
