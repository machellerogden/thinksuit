/**
 * UI state store for global UI preferences
 * Uses Svelte 5 runes with localStorage persistence
 */
import { LocalStorage } from '$lib/utils/localStorage.svelte.js';

const uiState = new LocalStorage('thinksuit-ui-state', {
    leftSidebarCollapsed: false,
    rightSidebarCollapsed: true,
    darkMode: false,
    terminalOpen: false,
    terminalPosition: 'bottom',
    terminalSizeVertical: 300,
    terminalSizeHorizontal: 800,
    terminalFullscreen: false,
    presetOrder: [],  // Array of preset names for custom sort order
    frameOrder: []    // Array of frame names for custom sort order
});

// Create a proxy that always forwards to the current state
export const ui = new Proxy({}, {
    get(_, prop) {
        return uiState.current[prop];
    },
    set(_, prop, value) {
        uiState.current[prop] = value;
        return true;
    }
});
