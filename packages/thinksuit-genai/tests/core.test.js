import { describe, it, expect } from 'vitest';
import { cleanThreadForProvider } from '../src/core.js';

describe('cleanThreadForProvider', () => {
    it('extracts the last system message as systemInstructions and drops it from the thread', () => {
        const { systemInstructions, thread } = cleanThreadForProvider([
            { role: 'system', content: 'be nice' },
            { role: 'user', content: 'hi' }
        ]);
        expect(systemInstructions).toBe('be nice');
        expect(thread).toEqual([{ role: 'user', content: 'hi' }]);
    });

    it('merges adjacent same-role plain-text messages', () => {
        const { thread } = cleanThreadForProvider([
            { role: 'user', content: 'one' },
            { role: 'user', content: 'two' }
        ]);
        expect(thread).toEqual([{ role: 'user', content: 'one\n\ntwo' }]);
    });

    it('strips the semantic property', () => {
        const { thread } = cleanThreadForProvider([
            { role: 'user', content: 'hi', semantic: 'input' }
        ]);
        expect(thread).toEqual([{ role: 'user', content: 'hi' }]);
    });

    it('keeps parallel tool results distinct — never merges them', () => {
        // The bug: adjacent tool messages were concatenated, dropping all but the first
        // tool_call_id and orphaning the other tool_use blocks.
        const { thread } = cleanThreadForProvider([
            { role: 'assistant', content: '', tool_calls: [{ id: 'a' }, { id: 'b' }] },
            { role: 'tool', tool_call_id: 'a', content: 'result a' },
            { role: 'tool', tool_call_id: 'b', content: 'result b' }
        ]);
        expect(thread).toEqual([
            { role: 'assistant', content: '', tool_calls: [{ id: 'a' }, { id: 'b' }] },
            { role: 'tool', tool_call_id: 'a', content: 'result a' },
            { role: 'tool', tool_call_id: 'b', content: 'result b' }
        ]);
    });

    it('does not merge an assistant tool-call carrier into adjacent assistant text', () => {
        const { thread } = cleanThreadForProvider([
            { role: 'assistant', content: 'thinking' },
            { role: 'assistant', content: '', tool_calls: [{ id: 'x' }] }
        ]);
        expect(thread).toEqual([
            { role: 'assistant', content: 'thinking' },
            { role: 'assistant', content: '', tool_calls: [{ id: 'x' }] }
        ]);
    });
});
