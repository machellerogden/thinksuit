// Shared reactive state for the drawer system

// Drawer states by ID: { 'root.left': 'collapsed', 'root.main': 'expanded', ... }
export const drawerStates = $state({});

// Navigation metadata by ID: { 'root.left': { bounds, depth, position, parentId, isVisible, element }, ... }
export const drawerMetadata = $state({});

// Global UI state
export const drawerState = $state({
    focusedDrawerId: 'root.main',
    showFocusRing: true
});
