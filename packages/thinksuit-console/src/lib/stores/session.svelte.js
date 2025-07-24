/**
 * Session store for tracking active ThinkSuit session
 * Single source of truth for session data and state
 * Uses Svelte 5 runes for reactive state management
 */

import { buildSessionTree } from 'thinksuit/sessions/tree';
import { deriveSessionStatus } from 'thinksuit/sessions/deriveSessionStatus';
import { SESSION_EVENTS, SESSION_STATUS } from 'thinksuit/constants/events';

// Core state
let activeSessionId = $state(null);
let entries = $state([]);
let isLoading = $state(false);
let loadingFrom = $state(null); // Track incremental load position
let error = $state(null);
let forkNavigation = $state({});

// Derived state - transform session events into hierarchical tree
let thread = $derived(buildSessionTree(entries));
let status = $derived(deriveSessionStatus(entries));
let isProcessing = $derived(status === SESSION_STATUS.BUSY);
let isReady = $derived(status === SESSION_STATUS.READY);
let messageCount = $derived(thread?.children?.length || 0);

/**
 * Load session data (full or incremental)
 * @param {string} sessionId - Session to load
 * @param {number} [fromIndex] - Optional index for incremental loading
 */
export async function loadSession(sessionId, fromIndex = null) {
    if (!sessionId) {
        // Clear session
        activeSessionId = null;
        entries = [];
        error = null;
        forkNavigation = {};
        return;
    }
    
    // If switching to a new session, reset everything
    if (sessionId !== activeSessionId) {
        activeSessionId = sessionId;
        entries = [];
        forkNavigation = {};
        fromIndex = null; // Force full load for new session
    }
    
    // Skip if already loading
    if (isLoading && loadingFrom === fromIndex) {
        return;
    }
    
    isLoading = true;
    loadingFrom = fromIndex;
    error = null;
    
    try {
        // Construct URL based on whether this is incremental
        const url = fromIndex !== null 
            ? `/api/sessions/${sessionId}?fromIndex=${fromIndex}`
            : `/api/sessions/${sessionId}`;
            
        const response = await fetch(url);
        
        if (!response.ok) {
            throw new Error(`Failed to load session: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (fromIndex !== null && fromIndex > 0) {
            // Incremental update - append new entries
            if (data.entries && data.entries.length > 0) {
                entries = [...entries, ...data.entries];
            }
        } else {
            // Full load - replace all entries
            entries = data.entries || [];
        }
        
        // Load fork navigation data if this is a full load
        if (fromIndex === null) {
            await loadForkNavigation(sessionId);
        }
        
    } catch (err) {
        console.error('Error loading session:', err);
        error = err.message || 'Failed to load session';
        
        // Clear data on error if this was a full load
        if (fromIndex === null) {
            entries = [];
            forkNavigation = {};
        }
    } finally {
        isLoading = false;
        loadingFrom = null;
    }
}

/**
 * Load fork navigation data for the session
 * @param {string} sessionId
 */
async function loadForkNavigation(sessionId) {
    try {
        const response = await fetch(`/api/sessions/${sessionId}/fork-navigation`);
        if (response.ok) {
            forkNavigation = await response.json();
        } else {
            forkNavigation = {};
        }
    } catch (err) {
        console.error('Error loading fork navigation:', err);
        forkNavigation = {};
    }
}

/**
 * Create a fork from a specific event
 * @param {number} eventIndex - Index of the event to fork from
 * @param {string|null} sourceSessionId - Optional original session ID for replayed events
 */
export async function createFork(eventIndex, sourceSessionId = null) {
    if (!activeSessionId) {
        throw new Error('No active session to fork');
    }
    
    try {
        const response = await fetch(`/api/sessions/${activeSessionId}/fork`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                forkPoint: eventIndex,
                sourceSessionId: sourceSessionId 
            })
        });

        if (!response.ok) {
            throw new Error(`Failed to create fork: ${response.status}`);
        }

        const result = await response.json();
        return result.sessionId;
        
    } catch (err) {
        console.error('Error creating fork:', err);
        throw err;
    }
}

/**
 * Get read-only access to session state
 */
export function getSession() {
    return {
        // Core state
        get id() { return activeSessionId; },
        get entries() { return entries; },
        get thread() { return thread; },
        get error() { return error; },
        get forkNavigation() { return forkNavigation; },
        
        // Loading state
        get isLoading() { return isLoading; },
        get loadingFrom() { return loadingFrom; },
        
        // Derived state
        get status() { return status; },
        get isProcessing() { return isProcessing; },
        get isReady() { return isReady; },
        get messageCount() { return messageCount; },
        
        // Helpers
        canSubmit: () => !isProcessing && !isLoading
    };
}

/**
 * Helper to check if we can submit to a session
 * @param {string} sessionId
 */
export function canSubmitToSession(sessionId) {
    // Can't submit if currently processing this session
    if (sessionId === activeSessionId) {
        return !isProcessing && !isLoading;
    }
    return true; // Different session or no session
}