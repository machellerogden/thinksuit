/**
 * Session subscription system
 * Uses file watching to emit real-time events as sessions are updated
 */

import { EventEmitter } from 'node:events';
import chokidar from 'chokidar';
import { getSessionFilePath } from './utils/paths.js';

/**
 * Create a session subscriber that watches for changes and emits events
 * @returns {SessionSubscriber}
 */
export function createSessionSubscriber() {
    return new SessionSubscriber();
}

const SESSION_EVENT_NS = 'session';

class SessionSubscriber extends EventEmitter {
    constructor() {
        super();
        this.watchers = new Map();
    }

    /**
     * Subscribe to events for a specific session
     * @param {string} sessionId - The session to watch
     * @returns {void}
     */
    subscribe(sessionId) {
        if (this.watchers.has(sessionId)) {
            return;
        }

        const filePath = getSessionFilePath(sessionId);

        const watcher = chokidar.watch(filePath, {
            persistent: true,
            ignoreInitial: true,
            awaitWriteFinish: {
                stabilityThreshold: 100,
                pollInterval: 50
            }
        });

        watcher.on('change', async () => {
            try {
                this.emit(`${SESSION_EVENT_NS}:${sessionId}`, {
                    sessionId,
                    type: 'change',
                    msg: 'Session changed.'
                });
            } catch (error) {
                this.emit('error', {
                    sessionId,
                    error
                });
            }
        });

        watcher.on('error', (error) => {
            this.emit('error', {
                sessionId,
                error
            });
        });

        this.watchers.set(sessionId, watcher);
        this.emit('subscribed', sessionId);
    }

    /**
     * Unsubscribe from a session
     * @param {string} sessionId - The session to stop watching
     * @returns {Promise<void>}
     */
    async unsubscribe(sessionId) {
        const watcher = this.watchers.get(sessionId);
        if (!watcher) return;

        await watcher.close();
        this.watchers.delete(sessionId);
        this.emit('unsubscribed', sessionId);
    }

    /**
     * Unsubscribe from all sessions
     * @returns {Promise<void>}
     */
    async unsubscribeAll() {
        const promises = [];
        for (const sessionId of this.watchers.keys()) {
            promises.push(this.unsubscribe(sessionId));
        }
        await Promise.all(promises);
    }

    /**
     * Get list of currently subscribed sessions
     * @returns {string[]}
     */
    getSubscriptions() {
        return Array.from(this.watchers.keys());
    }

    /**
     * Check if subscribed to a session
     * @param {string} sessionId
     * @returns {boolean}
     */
    isSubscribed(sessionId) {
        return this.watchers.has(sessionId);
    }
}

/**
 * Create a simple subscription for a single session
 * @param {string} sessionId - The session to watch
 * @param {Function} onEvent - Callback for new events
 * @param {Function} [onError] - Optional error callback
 * @returns {Object} Subscription handle with unsubscribe method
 */
export function subscribeToSession(sessionId, onEvent, onError) {
    const subscriber = new SessionSubscriber();

    subscriber.on(`${SESSION_EVENT_NS}:${sessionId}`, onEvent);
    if (onError) {
        subscriber.on('error', (data) => {
            if (data.sessionId === sessionId) {
                onError(data.error);
            }
        });
    }

    subscriber.subscribe(sessionId);

    return {
        unsubscribe: async () => {
            await subscriber.unsubscribeAll();
        },
        subscriber
    };
}
