// Pure navigation functions - no Svelte dependencies
// All functions are testable without DOM

/**
 * Find the closest drawer in a given direction based on spatial positioning
 * @param {DOMRect} currentBounds - Bounding rectangle of current drawer
 * @param {Array<{id: string, bounds: DOMRect}>} candidates - Candidate drawers with bounds
 * @param {'up'|'down'|'left'|'right'} direction - Direction to search
 * @returns {{id: string, bounds: DOMRect}|undefined} Closest drawer or undefined
 */
export function findClosestInDirection(currentBounds, candidates, direction) {
    const filters = {
        up: (d) => d.bounds.bottom <= currentBounds.top,
        down: (d) => d.bounds.top >= currentBounds.bottom,
        left: (d) => d.bounds.right <= currentBounds.left,
        right: (d) => d.bounds.left >= currentBounds.right
    };

    const sorts = {
        up: (a, b) => b.bounds.bottom - a.bounds.bottom,    // Highest bottom
        down: (a, b) => a.bounds.top - b.bounds.top,         // Lowest top
        left: (a, b) => b.bounds.right - a.bounds.right,     // Rightmost right edge
        right: (a, b) => a.bounds.left - b.bounds.left       // Leftmost left edge
    };

    return candidates
        .filter(filters[direction])
        .sort(sorts[direction])[0];
}

/**
 * Map vim keys to directional strings
 * @param {'h'|'j'|'k'|'l'} vimKey - Vim navigation key
 * @returns {'left'|'down'|'up'|'right'} Direction
 */
export function vimKeyToDirection(vimKey) {
    const map = {
        h: 'left',
        j: 'down',
        k: 'up',
        l: 'right'
    };
    return map[vimKey];
}
