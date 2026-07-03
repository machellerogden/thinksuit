import { describe, it, expect } from 'vitest';
import { expandTemplate } from '../../../engine/plan/template.js';

describe('expandTemplate', () => {
    it('expands $input from the bag', () => {
        expect(expandTemplate('Answer: $input', { input: 'hello' })).toBe('Answer: hello');
    });

    it('expands $last_response', () => {
        expect(expandTemplate('Prior said $last_response', { last_response: 'done' })).toBe(
            'Prior said done'
        );
    });

    it('expands $<id>_response by node id', () => {
        const bag = { input: 'x', step1_response: 'FINDINGS' };
        expect(expandTemplate('Based on $step1_response, continue', bag)).toBe(
            'Based on FINDINGS, continue'
        );
    });

    it('expands multiple tokens in one template', () => {
        const bag = { input: 'Q', last_response: 'A' };
        expect(expandTemplate('$input -> $last_response', bag)).toBe('Q -> A');
    });

    it('expands a missing key to empty string', () => {
        expect(expandTemplate('value=[$missing]', { input: 'x' })).toBe('value=[]');
    });

    it('leaves a lone $ (not an identifier) verbatim', () => {
        expect(expandTemplate('cost is $ 5', {})).toBe('cost is $ 5');
    });

    it('coerces non-string bag values', () => {
        expect(expandTemplate('n=$count', { count: 3 })).toBe('n=3');
    });

    it('returns empty string for a non-string template', () => {
        expect(expandTemplate(null, { input: 'x' })).toBe('');
        expect(expandTemplate(undefined, {})).toBe('');
    });

    it('tolerates an absent bag', () => {
        expect(expandTemplate('hi $input')).toBe('hi ');
    });
});
