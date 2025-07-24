// Drawer system state - clean Svelte 5 reactive model
import { SvelteMap } from 'svelte/reactivity';

/**
 * Core drawer registry - single source of truth
 * Map<string, DrawerData>
 *
 * DrawerData shape:
 * {
 *   id: string,           // Hierarchical ID (e.g., 'root.main.left')
 *   state: string,        // 'collapsed' | 'expanded' | 'takeover' | 'fullscreen'
 *   position: string,     // 'top' | 'left' | 'right' | 'bottom' | 'main'
 *   parentId: string|null,// Parent drawer ID or null for root
 *   element: HTMLElement|null // DOM reference for bounds
 * }
 */
export const drawers = new SvelteMap();

/**
 * UI state
 */
export const ui = $state({
    focusedId: 'root.main',
    showFocusRing: true
});
