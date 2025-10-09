import { writable } from 'svelte/store';

// Store for sequential shortcuts (vim-style)
const activeShortcut = writable(null);

// Store for currently held keys
/* eslint-disable svelte/prefer-svelte-reactivity */
const heldKeys = writable(new Set());

// Sequential key handling logic
function listenForKeys(mapping) {
    const handlers = [ ...mapping.entries() ].map(([ chars, handler ]) => {
        let typed = '';
        return async function triggerListener(event) {
            const ignoreRoles = ['textbox'].includes(event.target.getAttribute('role'));
            const ignoreNodes = [
                'INPUT', 'TEXTAREA', 'SELECT'
            ].includes(event.target.nodeName);
            const ignore = ignoreRoles || ignoreNodes;
            if (ignore) return;
            typed += event.key;
            if (!chars.startsWith(typed)) {
                typed = '';
            } else if (typed.length === chars.length) {
                typed = '';
                await handler();
            }
        };
    });
    return event => handlers.forEach(h => h(event));
}

// Default sequential shortcuts mapping
const defaultMapping = new Map([
    ['g', () => activeShortcut.set('goto')],
    ['?', () => activeShortcut.set('help')],
    ['Escape', () => activeShortcut.set(null)],
    ['d', () => activeShortcut.set('darkMode')],
    ['s', () => activeShortcut.set('search')]
]);

// Create the sequential trigger listener
const triggerListener = listenForKeys(defaultMapping);

// Held keys tracking
function handleKeyDown(event) {
    heldKeys.update(keys => {
        const newKeys = new Set(keys);
        newKeys.add(event.key);
        return newKeys;
    });
}

function handleKeyUp(event) {
    // Also trigger sequential shortcuts on keyup
    triggerListener(event);

    // Remove from held keys
    heldKeys.update(keys => {
        const newKeys = new Set(keys);
        newKeys.delete(event.key);
        return newKeys;
    });
}

// Clear held keys when window loses focus
function handleBlur() {
    heldKeys.set(new Set());
}

// Track if listeners are attached
let listenersAttached = false;

// Attach global event listeners
function attachListeners() {
    if (listenersAttached || typeof window === 'undefined') return;

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleBlur);
    listenersAttached = true;
}

// Detach global event listeners
function detachListeners() {
    if (!listenersAttached || typeof window === 'undefined') return;

    window.removeEventListener('keydown', handleKeyDown);
    window.removeEventListener('keyup', handleKeyUp);
    window.removeEventListener('blur', handleBlur);
    listenersAttached = false;
}

// Sequential shortcuts interface (vim-style)
export const keyboardShortcut = {
    clear() {
        activeShortcut.set(null);
    },
    subscribe(cb) {
        const unsub = activeShortcut.subscribe(cb);
        attachListeners();
        return function unsubscribe() {
            unsub();
            // Only detach if no other subscribers
            if (activeShortcut && typeof activeShortcut['subscribers'] === 'number' && activeShortcut['subscribers'] === 0) {
                detachListeners();
            }
        };
    }
};

// Held keys interface (for modes)
export const keyboard = {
    subscribe(cb) {
        const unsub = heldKeys.subscribe(cb);
        attachListeners();
        return unsub;
    },
    isHeld(key) {
        let held = false;
        const unsub = heldKeys.subscribe(keys => {
            held = keys.has(key);
        });
        unsub();
        return held;
    }
};

// Ensure listeners are attached when module loads
if (typeof window !== 'undefined') {
    attachListeners();
}
