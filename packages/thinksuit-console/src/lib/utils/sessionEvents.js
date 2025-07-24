/**
 * Subscribe to session events via Server-Sent Events
 * @param {string} sessionId - The session to subscribe to
 * @param {Function} onEvent - Callback for new events
 * @param {Function} [onError] - Optional error callback
 * @returns {Object} Subscription handle with close method
 */
export function subscribeToSessionEvents(sessionId, onEvent, onError) {
    const eventSource = new EventSource(`/api/sessions/${sessionId}/subscribe`);
    
    eventSource.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            
            if (data.type === 'changed') {
                // Session file changed - trigger reload
                onEvent({ changed: true, sessionId: data.sessionId });
            } else if (data.type === 'error' && onError) {
                onError(new Error(data.error));
            } else if (data.type === 'connected') {
                console.log(`Connected to session ${sessionId} events`);
            }
        } catch (error) {
            if (onError) {
                onError(error);
            } else {
                console.error('Error parsing event:', error);
            }
        }
    };
    
    eventSource.onerror = (error) => {
        if (onError) {
            onError(error);
        } else {
            console.error('SSE connection error:', error);
        }
    };
    
    return {
        close: () => {
            eventSource.close();
        }
    };
}