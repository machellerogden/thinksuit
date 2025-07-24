// hotkeys.svelte.js  ← important: runes only work in .svelte / .svelte.js / .svelte.ts
import { SvelteMap, SvelteSet } from 'svelte/reactivity';

class HotkeyManager {
    // reactive fields
    enabled   = $state(true);
    hotkeys   = new SvelteMap();
    activeKeys = new SvelteSet();
    scopes     = new SvelteSet(['global']);

    constructor() {
        this.handleKeyDown = this.handleKeyDown.bind(this);
        this.handleKeyUp = this.handleKeyUp.bind(this);

        window.addEventListener('keydown', this.handleKeyDown);
        window.addEventListener('keyup', this.handleKeyUp);
        window.addEventListener('blur', () => this.activeKeys.clear());
    }

    register(key, callback, options = {}) {
        const config = {
            key: this.normalizeKey(key),
            callback,
            scope: options.scope || 'global',
            preventDefault: options.preventDefault !== false,
            allowInInput: !!options.allowInInput,
            description: options.description || ''
        };
        const id = `${config.key}_${config.scope}`;
        this.hotkeys.set(id, config);
        return () => this.unregister(key, config.scope);
    }

    unregister(key, scope = 'global') {
        const id = `${this.normalizeKey(key)}_${scope}`;
        this.hotkeys.delete(id);
    }

    setScope(scope, enabled) {
        if (enabled) this.scopes.add(scope);
        else this.scopes.delete(scope);
    }

    isKeyPressed(key) {
        return this.activeKeys.has(key.toLowerCase());
    }

    get modifiers() {
        return {
            ctrl: this.isKeyPressed('control'),
            alt: this.isKeyPressed('alt'),
            shift: this.isKeyPressed('shift'),
            meta: this.isKeyPressed('meta'),
            space: this.isKeyPressed(' ')
        };
    }

    normalizeKey(key) {
        return key
            .toLowerCase()
            .replace('cmd', 'meta')
            .replace('command', 'meta')
            .replace('opt', 'alt')
            .replace('option', 'alt')
            .replace('space', ' ')
            .split('+')
            .sort()
            .join('+');
    }

    handleKeyDown(event) {
        this.activeKeys.add(event.key.toLowerCase());
        if (!this.enabled) return;

        const target = event.target;
        const isInput = ['INPUT', 'TEXTAREA', 'SELECT'].includes(target?.tagName);
        const isContentEditable = target?.contentEditable === 'true';

        const parts = [];
        if (event.ctrlKey)  parts.push('ctrl');
        if (event.altKey)   parts.push('alt');
        if (event.shiftKey) parts.push('shift');
        if (event.metaKey)  parts.push('meta');

        const hasMods = event.ctrlKey || event.altKey || event.metaKey;
        let keyPart;
        if (hasMods && event.code.startsWith('Key')) keyPart = event.code.slice(3).toLowerCase();
        else if (hasMods && event.code === 'Comma')  keyPart = ',';
        else if (hasMods && event.code === 'Period') keyPart = '.';
        else keyPart = event.key.toLowerCase();

        parts.push(keyPart);
        const currentCombo = parts.sort().join('+');

        for (const [, config] of this.hotkeys) {
            if (!this.scopes.has(config.scope)) continue;
            if ((isInput || isContentEditable) && !config.allowInInput) continue;

            if (config.key === currentCombo || config.key === event.key.toLowerCase()) {
                if (config.preventDefault) event.preventDefault();
                config.callback(event);
            }
        }
    }

    handleKeyUp(event) {
        this.activeKeys.delete(event.key.toLowerCase());
    }

    destroy() {
        window.removeEventListener('keydown', this.handleKeyDown);
        window.removeEventListener('keyup', this.handleKeyUp);
        this.hotkeys.clear();
        this.activeKeys.clear();
    }
}

// Singleton + exports (unchanged API)
const hotkeyManager = new HotkeyManager();

export function registerHotkey(key, callback, options) { return hotkeyManager.register(key, callback, options); }
export function unregisterHotkey(key, scope) { hotkeyManager.unregister(key, scope); }
export function isKeyPressed(key) { return hotkeyManager.isKeyPressed(key); }
export function getModifiers() { return hotkeyManager.modifiers; }
export function setHotkeyScope(scope, enabled) { hotkeyManager.setScope(scope, enabled); }
export { hotkeyManager };
