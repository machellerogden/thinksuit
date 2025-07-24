// Pure state computation functions - no Svelte dependencies
// All functions work with plain drawer registry Map

/**
 * Get depth of a drawer based on its ID
 * @param {string} id - Drawer ID (e.g., 'root.main.left')
 * @returns {number} Depth (0 for root level)
 */
export function getDepth(id) {
    return id.split('.').length - 2;
}

/**
 * Get sibling drawer IDs for a given drawer
 * @param {string} drawerId - Drawer ID
 * @param {Map} drawers - Drawer registry
 * @returns {string[]} Array of sibling IDs
 */
export function getSiblings(drawerId, drawers) {
    const drawer = drawers.get(drawerId);
    if (!drawer) return [];

    return Array.from(drawers.values())
        .filter(d => d.parentId === drawer.parentId && d.id !== drawerId)
        .map(d => d.id);
}

/**
 * Get child drawer IDs for a given drawer
 * @param {string} drawerId - Drawer ID
 * @param {Map} drawers - Drawer registry
 * @returns {string[]} Array of child IDs
 */
export function getChildren(drawerId, drawers) {
    return Array.from(drawers.values())
        .filter(d => d.parentId === drawerId)
        .map(d => d.id);
}

/**
 * Check if a drawer is visible (not hidden by sibling takeover)
 * @param {string} drawerId - Drawer ID
 * @param {Map} drawers - Drawer registry
 * @returns {boolean} True if visible
 */
export function isVisible(drawerId, drawers) {
    const drawer = drawers.get(drawerId);
    if (!drawer) return false;

    // Check if any sibling is in takeover or fullscreen
    const siblings = getSiblings(drawerId, drawers);
    const siblingTakeover = siblings.some(sibId => {
        const sib = drawers.get(sibId);
        return sib && (sib.state === 'takeover' || sib.state === 'fullscreen');
    });

    if (siblingTakeover) return false;

    // If this drawer is in fullscreen, check parent's siblings
    if (drawer.state === 'fullscreen' && drawer.parentId) {
        const parentSiblings = getSiblings(drawer.parentId, drawers);
        return !parentSiblings.some(sibId => {
            const sib = drawers.get(sibId);
            return sib && (sib.state === 'takeover' || sib.state === 'fullscreen');
        });
    }

    return true;
}

/**
 * Get allowed states for a drawer based on its ID
 * @param {string} drawerId - Drawer ID
 * @returns {string[]} Array of allowed state values
 */
export function getAllowedStates(drawerId) {
    // Main drawers don't collapse
    if (drawerId.endsWith('.main')) {
        return ['expanded', 'takeover', 'fullscreen'];
    }

    // root.top doesn't need fullscreen (same as takeover at root level)
    if (drawerId === 'root.top') {
        return ['collapsed', 'expanded', 'takeover'];
    }

    // All other drawers support full state set
    return ['collapsed', 'expanded', 'takeover', 'fullscreen'];
}

/**
 * Cycle state forward through allowed states
 * @param {string} drawerId - Drawer ID
 * @param {string} currentState - Current state value
 * @returns {string} Next state value
 */
export function cycleStateForward(drawerId, currentState) {
    const states = getAllowedStates(drawerId);
    const currentIndex = states.indexOf(currentState);
    const nextIndex = (currentIndex + 1) % states.length;
    return states[nextIndex];
}

/**
 * Cycle state backward through allowed states
 * @param {string} drawerId - Drawer ID
 * @param {string} currentState - Current state value
 * @returns {string} Previous state value
 */
export function cycleStateBackward(drawerId, currentState) {
    const states = getAllowedStates(drawerId);
    const currentIndex = states.indexOf(currentState);
    const prevIndex = (currentIndex - 1 + states.length) % states.length;
    return states[prevIndex];
}

/**
 * Get visible drawers at a specific depth
 * @param {number} depth - Target depth
 * @param {Map} drawers - Drawer registry
 * @returns {Array<{id: string, bounds: DOMRect}>} Visible drawers with bounds at depth
 */
export function getVisibleDrawersAtDepth(depth, drawers) {
    return Array.from(drawers.values())
        .filter(d => {
            if (!d.element) return false;
            if (getDepth(d.id) !== depth) return false;
            return isVisible(d.id, drawers);
        })
        .map(d => ({
            id: d.id,
            bounds: d.element.getBoundingClientRect()
        }));
}

/**
 * Find first visible child of a drawer
 * @param {string} drawerId - Parent drawer ID
 * @param {Map} drawers - Drawer registry
 * @returns {string|null} First visible child ID or null
 */
export function getFirstVisibleChild(drawerId, drawers) {
    const children = getChildren(drawerId, drawers);
    return children.find(childId => isVisible(childId, drawers)) ?? null;
}

/**
 * Check if drawer ID is ancestor of another drawer
 * @param {string} ancestorId - Potential ancestor ID
 * @param {string} descendantId - Potential descendant ID
 * @returns {boolean} True if ancestorId is ancestor of descendantId
 */
export function isAncestor(ancestorId, descendantId) {
    return descendantId.startsWith(ancestorId + '.');
}
