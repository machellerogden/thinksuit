import { describe, it, expect } from 'vitest';
import { findClosestInDirection, vimKeyToDirection } from '../../src/lib/drawer/navigation.js';

describe('Spatial Navigation', () => {
    describe('findClosestInDirection', () => {
        it('finds closest drawer above', () => {
            const current = { top: 100, bottom: 200, left: 0, right: 100 };
            const candidates = [
                { id: 'a', bounds: { top: 0, bottom: 90, left: 0, right: 100 } },
                { id: 'b', bounds: { top: 0, bottom: 50, left: 0, right: 100 } }
            ];

            const result = findClosestInDirection(current, candidates, 'up');
            expect(result.id).toBe('a'); // Closest has bottom: 90
        });

        it('finds closest drawer below', () => {
            const current = { top: 100, bottom: 200, left: 0, right: 100 };
            const candidates = [
                { id: 'a', bounds: { top: 210, bottom: 300, left: 0, right: 100 } },
                { id: 'b', bounds: { top: 250, bottom: 350, left: 0, right: 100 } }
            ];

            const result = findClosestInDirection(current, candidates, 'down');
            expect(result.id).toBe('a'); // Closest has top: 210
        });

        it('finds closest drawer to the left', () => {
            const current = { top: 0, bottom: 100, left: 100, right: 200 };
            const candidates = [
                { id: 'a', bounds: { top: 0, bottom: 100, left: 0, right: 90 } },
                { id: 'b', bounds: { top: 0, bottom: 100, left: 0, right: 50 } }
            ];

            const result = findClosestInDirection(current, candidates, 'left');
            expect(result.id).toBe('a'); // Closest has right: 90
        });

        it('finds closest drawer to the right', () => {
            const current = { top: 0, bottom: 100, left: 100, right: 200 };
            const candidates = [
                { id: 'a', bounds: { top: 0, bottom: 100, left: 210, right: 300 } },
                { id: 'b', bounds: { top: 0, bottom: 100, left: 250, right: 350 } }
            ];

            const result = findClosestInDirection(current, candidates, 'right');
            expect(result.id).toBe('a'); // Closest has left: 210
        });

        it('returns undefined when no candidates exist in direction', () => {
            const current = { top: 100, bottom: 200, left: 0, right: 100 };
            const candidates = [
                { id: 'a', bounds: { top: 210, bottom: 300, left: 0, right: 100 } }
            ];

            const result = findClosestInDirection(current, candidates, 'up');
            expect(result).toBeUndefined();
        });

        it('returns undefined when candidates array is empty', () => {
            const current = { top: 100, bottom: 200, left: 0, right: 100 };
            const result = findClosestInDirection(current, [], 'up');
            expect(result).toBeUndefined();
        });
    });

    describe('vimKeyToDirection', () => {
        it('maps h to left', () => {
            expect(vimKeyToDirection('h')).toBe('left');
        });

        it('maps j to down', () => {
            expect(vimKeyToDirection('j')).toBe('down');
        });

        it('maps k to up', () => {
            expect(vimKeyToDirection('k')).toBe('up');
        });

        it('maps l to right', () => {
            expect(vimKeyToDirection('l')).toBe('right');
        });
    });
});
