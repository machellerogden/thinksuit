// Drawer System - Clean Public API
// Import this module to access all drawer functionality

// State (reactive)
export { drawers, ui } from './drawerState.svelte.js';

// Actions (state mutations)
export {
    registerDrawer,
    unregisterDrawer,
    updateElement,
    setFocus,
    setState,
    cycleStateForward,
    cycleStateBackward,
    navigate,
    descend,
    ascend,
    flashFocusRing
} from './actions.js';

// Pure state functions (queries)
export {
    getDepth,
    getSiblings,
    getChildren,
    isVisible,
    getAllowedStates,
    getFirstVisibleChild,
    isAncestor,
    getVisibleDrawersAtDepth
} from './state.js';

// Pure navigation functions
export {
    findClosestInDirection,
    vimKeyToDirection
} from './navigation.js';
