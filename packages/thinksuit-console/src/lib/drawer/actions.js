// Drawer action functions - state mutations
// These are the only functions that mutate the drawer registry

import { drawers, ui } from './drawerState.svelte.js';
import {
    getSiblings,
    getFirstVisibleChild,
    isVisible,
    cycleStateForward as cycleForward,
    cycleStateBackward as cycleBackward,
    getVisibleDrawersAtDepth,
    getDepth
} from './state.js';
import { findClosestInDirection, vimKeyToDirection } from './navigation.js';

/**
 * Register a drawer in the registry
 * @param {string} id - Drawer ID
 * @param {Object} metadata - Drawer metadata
 */
export function registerDrawer(id, { position, parentId, state, element = null }) {
    drawers.set(id, {
        id,
        state,
        position,
        parentId,
        element
    });
}

/**
 * Unregister a drawer from the registry
 * @param {string} id - Drawer ID
 */
export function unregisterDrawer(id) {
    drawers.delete(id);
}

/**
 * Update drawer element reference
 * @param {string} id - Drawer ID
 * @param {HTMLElement} element - DOM element
 */
export function updateElement(id, element) {
    const drawer = drawers.get(id);
    if (drawer) {
        // Must re-set the Map entry to trigger reactivity
        drawers.set(id, { ...drawer, element });
    }
}

/**
 * Set focus to a drawer by ID
 * @param {string} id - Drawer ID
 */
export function setFocus(id) {
    const drawer = drawers.get(id);
    if (!drawer) {
        console.warn(`Attempted to focus non-existent drawer: ${id}`);
        return;
    }

    if (!isVisible(id, drawers)) {
        console.warn(`Attempted to focus hidden drawer: ${id}`);
        return;
    }

    ui.focusedId = id;
}

/**
 * Set state for a drawer by ID
 * @param {string} id - Drawer ID
 * @param {string} newState - New state value
 */
export function setState(id, newState) {
    const drawer = drawers.get(id);
    if (!drawer) {
        console.warn(`Attempted to set state for non-existent drawer: ${id}`);
        return;
    }

    // Must re-set the Map entry to trigger reactivity
    drawers.set(id, { ...drawer, state: newState });

    // If focused drawer becomes hidden, refocus to the drawer that took over
    if (ui.focusedId === id || !isVisible(ui.focusedId, drawers)) {
        // Find first visible drawer, preferring same depth
        const currentDepth = getDepth(ui.focusedId);
        const visibleDrawers = Array.from(drawers.values())
            .filter(d => isVisible(d.id, drawers))
            .sort((a, b) => {
                const depthA = Math.abs(getDepth(a.id) - currentDepth);
                const depthB = Math.abs(getDepth(b.id) - currentDepth);
                return depthA - depthB;
            });

        if (visibleDrawers.length > 0) {
            ui.focusedId = visibleDrawers[0].id;
        } else {
            ui.focusedId = 'root.main';
        }
    }
}

/**
 * Cycle focused drawer state forward
 */
export function cycleStateForward() {
    const drawer = drawers.get(ui.focusedId);
    if (!drawer) return;

    const newState = cycleForward(drawer.id, drawer.state);
    setState(drawer.id, newState);
}

/**
 * Cycle focused drawer state backward
 */
export function cycleStateBackward() {
    const drawer = drawers.get(ui.focusedId);
    if (!drawer) return;

    const newState = cycleBackward(drawer.id, drawer.state);
    setState(drawer.id, newState);
}

/**
 * Navigate in a direction using vim keys
 * @param {'h'|'j'|'k'|'l'} vimKey - Vim navigation key
 */
export function navigate(vimKey) {
    const current = drawers.get(ui.focusedId);
    if (!current) {
        console.warn('Navigate called with invalid focused drawer');
        ui.focusedId = 'root.main';
        return;
    }

    if (!isVisible(ui.focusedId, drawers)) {
        console.warn('Navigate called with hidden focused drawer');
        // Find first visible drawer
        const firstVisible = Array.from(drawers.values()).find(d => isVisible(d.id, drawers));
        if (firstVisible) {
            ui.focusedId = firstVisible.id;
        }
        return;
    }

    if (!current.element) {
        console.warn('Navigate called without element reference');
        return;
    }

    const direction = vimKeyToDirection(vimKey);
    const currentDepth = getDepth(current.id);
    const candidates = getVisibleDrawersAtDepth(currentDepth, drawers);
    const currentBounds = current.element.getBoundingClientRect();

    const target = findClosestInDirection(currentBounds, candidates, direction);

    if (target) {
        setFocus(target.id);
    }
}

/**
 * Descend into focused drawer's first child
 */
export function descend() {
    const current = drawers.get(ui.focusedId);
    if (!current) {
        console.warn('Descend called with invalid focused drawer');
        return;
    }

    const childId = getFirstVisibleChild(ui.focusedId, drawers);
    if (childId) {
        // Set current drawer to takeover before descending
        setState(ui.focusedId, 'takeover');
        setFocus(childId);
    }
}

/**
 * Ascend to parent drawer
 */
export function ascend() {
    const current = drawers.get(ui.focusedId);
    if (!current) {
        console.warn('Ascend called with invalid focused drawer');
        return;
    }

    if (!current.parentId) {
        // Already at root
        return;
    }

    const parent = drawers.get(current.parentId);
    if (!parent || !isVisible(current.parentId, drawers)) {
        console.warn('Ascend found hidden or missing parent');
        return;
    }

    setFocus(current.parentId);
}

/**
 * Flash the focus ring
 */
let ringFadeTimeout;
export function flashFocusRing() {
    if (ringFadeTimeout) clearTimeout(ringFadeTimeout);

    ui.showFocusRing = true;

    ringFadeTimeout = setTimeout(() => {
        ui.showFocusRing = false;
    }, 2000);
}
