import { describe, it, expect } from 'vitest';
import { sessionForAction, isAction, ACTIONS } from '../src/session.js';

describe('session action mapping', () => {
    it('converse continues the current session', () => {
        expect(sessionForAction('converse', 's1')).toBe('s1');
    });

    it('new opens a fresh session (null target)', () => {
        expect(sessionForAction('new', 's1')).toBeNull();
    });

    it('an unknown action behaves like converse (defensive default)', () => {
        expect(sessionForAction('bogus', 's1')).toBe('s1');
    });

    it('continues null when there is no current session', () => {
        expect(sessionForAction('converse')).toBeNull();
        expect(sessionForAction('new')).toBeNull();
    });

    it('exposes the action vocabulary', () => {
        expect(ACTIONS).toEqual(['converse', 'new']);
        expect(isAction('new')).toBe(true);
        expect(isAction('prior')).toBe(false);
    });
});
