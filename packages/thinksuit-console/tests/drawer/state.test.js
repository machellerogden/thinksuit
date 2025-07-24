import { describe, it, expect, beforeEach } from 'vitest';
import {
    getDepth,
    getSiblings,
    getChildren,
    isVisible,
    getAllowedStates,
    cycleStateForward,
    cycleStateBackward,
    getFirstVisibleChild,
    isAncestor
} from '../../src/lib/drawer/state.js';

describe('Drawer State Functions', () => {
    let drawers;

    beforeEach(() => {
        drawers = new Map();
    });

    describe('getDepth', () => {
        it('returns 0 for root level drawers', () => {
            expect(getDepth('root.main')).toBe(0);
            expect(getDepth('root.left')).toBe(0);
        });

        it('returns 1 for first level nested drawers', () => {
            expect(getDepth('root.main.left')).toBe(1);
            expect(getDepth('root.left.bottom')).toBe(1);
        });

        it('returns correct depth for deeply nested drawers', () => {
            expect(getDepth('root.main.left.bottom')).toBe(2);
            expect(getDepth('root.main.left.bottom.right')).toBe(3);
        });
    });

    describe('getSiblings', () => {
        beforeEach(() => {
            drawers.set('root.left', { id: 'root.left', parentId: null });
            drawers.set('root.right', { id: 'root.right', parentId: null });
            drawers.set('root.main', { id: 'root.main', parentId: null });
            drawers.set('root.left.top', { id: 'root.left.top', parentId: 'root.left' });
            drawers.set('root.left.bottom', { id: 'root.left.bottom', parentId: 'root.left' });
        });

        it('finds siblings at root level', () => {
            const siblings = getSiblings('root.left', drawers);
            expect(siblings).toContain('root.right');
            expect(siblings).toContain('root.main');
            expect(siblings).not.toContain('root.left');
        });

        it('finds siblings at nested level', () => {
            const siblings = getSiblings('root.left.top', drawers);
            expect(siblings).toEqual(['root.left.bottom']);
        });

        it('returns empty array when no siblings exist', () => {
            drawers.set('root.main.only', { id: 'root.main.only', parentId: 'root.main' });
            const siblings = getSiblings('root.main.only', drawers);
            expect(siblings).toEqual([]);
        });

        it('returns empty array for non-existent drawer', () => {
            const siblings = getSiblings('nonexistent', drawers);
            expect(siblings).toEqual([]);
        });
    });

    describe('getChildren', () => {
        beforeEach(() => {
            drawers.set('root.main', { id: 'root.main', parentId: null });
            drawers.set('root.main.left', { id: 'root.main.left', parentId: 'root.main' });
            drawers.set('root.main.right', { id: 'root.main.right', parentId: 'root.main' });
            drawers.set('root.main.left.bottom', { id: 'root.main.left.bottom', parentId: 'root.main.left' });
        });

        it('finds direct children', () => {
            const children = getChildren('root.main', drawers);
            expect(children).toContain('root.main.left');
            expect(children).toContain('root.main.right');
            expect(children).toHaveLength(2);
        });

        it('does not include grandchildren', () => {
            const children = getChildren('root.main', drawers);
            expect(children).not.toContain('root.main.left.bottom');
        });

        it('returns empty array when no children exist', () => {
            const children = getChildren('root.main.right', drawers);
            expect(children).toEqual([]);
        });
    });

    describe('isVisible', () => {
        beforeEach(() => {
            drawers.set('root.left', { id: 'root.left', state: 'expanded', parentId: null });
            drawers.set('root.right', { id: 'root.right', state: 'expanded', parentId: null });
            drawers.set('root.main', { id: 'root.main', state: 'expanded', parentId: null });
        });

        it('returns true when no siblings in takeover', () => {
            expect(isVisible('root.left', drawers)).toBe(true);
            expect(isVisible('root.right', drawers)).toBe(true);
        });

        it('returns false when sibling is in takeover', () => {
            drawers.get('root.right').state = 'takeover';
            expect(isVisible('root.left', drawers)).toBe(false);
            expect(isVisible('root.right', drawers)).toBe(true);
        });

        it('returns false when sibling is in fullscreen', () => {
            drawers.get('root.right').state = 'fullscreen';
            expect(isVisible('root.left', drawers)).toBe(false);
            expect(isVisible('root.right', drawers)).toBe(true);
        });

        it('returns false for non-existent drawer', () => {
            expect(isVisible('nonexistent', drawers)).toBe(false);
        });

        it('handles multiple siblings correctly', () => {
            drawers.set('root.bottom', { id: 'root.bottom', state: 'expanded', parentId: null });
            drawers.get('root.main').state = 'takeover';

            expect(isVisible('root.left', drawers)).toBe(false);
            expect(isVisible('root.right', drawers)).toBe(false);
            expect(isVisible('root.bottom', drawers)).toBe(false);
            expect(isVisible('root.main', drawers)).toBe(true);
        });
    });

    describe('getAllowedStates', () => {
        it('omits collapsed for main drawers', () => {
            const states = getAllowedStates('root.main');
            expect(states).toEqual(['expanded', 'takeover', 'fullscreen']);
        });

        it('omits collapsed for nested main drawers', () => {
            const states = getAllowedStates('root.left.main');
            expect(states).toEqual(['expanded', 'takeover', 'fullscreen']);
        });

        it('omits fullscreen for root.top', () => {
            const states = getAllowedStates('root.top');
            expect(states).toEqual(['collapsed', 'expanded', 'takeover']);
        });

        it('includes all states for regular drawers', () => {
            const states = getAllowedStates('root.left');
            expect(states).toEqual(['collapsed', 'expanded', 'takeover', 'fullscreen']);
        });

        it('includes all states for nested non-main drawers', () => {
            const states = getAllowedStates('root.main.left');
            expect(states).toEqual(['collapsed', 'expanded', 'takeover', 'fullscreen']);
        });
    });

    describe('cycleStateForward', () => {
        it('cycles through main drawer states', () => {
            expect(cycleStateForward('root.main', 'expanded')).toBe('takeover');
            expect(cycleStateForward('root.main', 'takeover')).toBe('fullscreen');
            expect(cycleStateForward('root.main', 'fullscreen')).toBe('expanded');
        });

        it('cycles through root.top states', () => {
            expect(cycleStateForward('root.top', 'collapsed')).toBe('expanded');
            expect(cycleStateForward('root.top', 'expanded')).toBe('takeover');
            expect(cycleStateForward('root.top', 'takeover')).toBe('collapsed');
        });

        it('cycles through regular drawer states', () => {
            expect(cycleStateForward('root.left', 'collapsed')).toBe('expanded');
            expect(cycleStateForward('root.left', 'expanded')).toBe('takeover');
            expect(cycleStateForward('root.left', 'takeover')).toBe('fullscreen');
            expect(cycleStateForward('root.left', 'fullscreen')).toBe('collapsed');
        });
    });

    describe('cycleStateBackward', () => {
        it('cycles backward through main drawer states', () => {
            expect(cycleStateBackward('root.main', 'expanded')).toBe('fullscreen');
            expect(cycleStateBackward('root.main', 'fullscreen')).toBe('takeover');
            expect(cycleStateBackward('root.main', 'takeover')).toBe('expanded');
        });

        it('cycles backward through root.top states', () => {
            expect(cycleStateBackward('root.top', 'collapsed')).toBe('takeover');
            expect(cycleStateBackward('root.top', 'takeover')).toBe('expanded');
            expect(cycleStateBackward('root.top', 'expanded')).toBe('collapsed');
        });

        it('cycles backward through regular drawer states', () => {
            expect(cycleStateBackward('root.left', 'collapsed')).toBe('fullscreen');
            expect(cycleStateBackward('root.left', 'fullscreen')).toBe('takeover');
            expect(cycleStateBackward('root.left', 'takeover')).toBe('expanded');
            expect(cycleStateBackward('root.left', 'expanded')).toBe('collapsed');
        });
    });

    describe('getFirstVisibleChild', () => {
        beforeEach(() => {
            drawers.set('root.main', { id: 'root.main', state: 'expanded', parentId: null });
            drawers.set('root.main.left', { id: 'root.main.left', state: 'expanded', parentId: 'root.main' });
            drawers.set('root.main.right', { id: 'root.main.right', state: 'expanded', parentId: 'root.main' });
        });

        it('returns first visible child', () => {
            const child = getFirstVisibleChild('root.main', drawers);
            expect(child).toBe('root.main.left');
        });

        it('skips hidden children', () => {
            drawers.get('root.main.right').state = 'takeover';
            const child = getFirstVisibleChild('root.main', drawers);
            expect(child).toBe('root.main.right'); // Only visible one
        });

        it('returns null when no children exist', () => {
            const child = getFirstVisibleChild('root.main.left', drawers);
            expect(child).toBeNull();
        });

        it('returns null when all children are hidden', () => {
            drawers.set('root.main.bottom', { id: 'root.main.bottom', state: 'takeover', parentId: 'root.main' });
            const child = getFirstVisibleChild('root.main', drawers);
            expect(child).toBe('root.main.bottom'); // The one in takeover is visible
        });
    });

    describe('isAncestor', () => {
        it('returns true for direct parent', () => {
            expect(isAncestor('root.main', 'root.main.left')).toBe(true);
        });

        it('returns true for grandparent', () => {
            expect(isAncestor('root.main', 'root.main.left.bottom')).toBe(true);
        });

        it('returns false for sibling', () => {
            expect(isAncestor('root.left', 'root.right')).toBe(false);
        });

        it('returns false for child checking parent', () => {
            expect(isAncestor('root.main.left', 'root.main')).toBe(false);
        });

        it('returns false for self', () => {
            expect(isAncestor('root.main', 'root.main')).toBe(false);
        });
    });
});
