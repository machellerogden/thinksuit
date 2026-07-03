import { describe, it, expect } from 'vitest';

import { validatePlan } from '../../schemas/validate.js';

describe('validatePlan', () => {
    it('should validate a task node (inline root)', () => {
        const plan = {
            name: 'Chat',
            description: 'Direct response',
            type: 'task',
            role: 'chat',
            maxRounds: 1,
            params: { lengthLevel: 'brief' }
        };
        const result = validatePlan(plan);
        expect(result.valid).toBe(true);
        expect(result.errors).toBeUndefined();
    });

    it('should validate a task node with tools + input template', () => {
        const plan = {
            type: 'task',
            role: 'investigate',
            tools: ['list_directory', 'read_text_file'],
            input: 'Investigate $input',
            id: 'step1',
            maxRounds: 5,
            timeoutMs: 60000,
            params: { lengthLevel: 'standard', adaptations: ['inner_voice'], maxTokens: 8000 }
        };
        const result = validatePlan(plan);
        expect(result.valid).toBe(true);
        expect(result.errors).toBeUndefined();
    });

    it('should validate a sequence node of task children', () => {
        const plan = {
            name: 'Deep Analysis',
            type: 'sequence',
            resultStrategy: 'last',
            children: [
                { type: 'task', role: 'investigate', tools: ['list_directory'], maxRounds: 5 },
                { type: 'task', role: 'analyze', maxRounds: 3 },
                { type: 'task', role: 'synthesize', maxRounds: 1 }
            ]
        };
        const result = validatePlan(plan);
        expect(result.valid).toBe(true);
        expect(result.errors).toBeUndefined();
    });

    it('should validate a parallel node of task children', () => {
        const plan = {
            type: 'parallel',
            resultStrategy: 'concat',
            children: [
                { type: 'task', role: 'critic' },
                { type: 'task', role: 'analyze' }
            ]
        };
        const result = validatePlan(plan);
        expect(result.valid).toBe(true);
        expect(result.errors).toBeUndefined();
    });

    it('should validate nested composites', () => {
        const plan = {
            type: 'sequence',
            children: [
                { type: 'task', role: 'investigate' },
                {
                    type: 'parallel',
                    children: [
                        { type: 'task', role: 'analyze' },
                        { type: 'task', role: 'critic' }
                    ]
                }
            ]
        };
        const result = validatePlan(plan);
        expect(result.valid).toBe(true);
        expect(result.errors).toBeUndefined();
    });

    it('should reject a node missing type', () => {
        const plan = { role: 'chat', maxRounds: 1 };
        const result = validatePlan(plan);
        expect(result.valid).toBe(false);
        expect(result.errors).toBeDefined();
    });

    it('should reject an unknown type', () => {
        const plan = { type: 'wizard', role: 'chat' };
        const result = validatePlan(plan);
        expect(result.valid).toBe(false);
        expect(result.errors).toBeDefined();
    });

    it('should reject a task node missing role', () => {
        const plan = { type: 'task', maxRounds: 1 };
        const result = validatePlan(plan);
        expect(result.valid).toBe(false);
        expect(result.errors).toBeDefined();
    });

    it('should reject legacy v1 shape (strategy/sequence)', () => {
        const plan = { name: 'legacy', strategy: 'sequential', sequence: ['a', 'b'] };
        const result = validatePlan(plan);
        expect(result.valid).toBe(false);
        expect(result.errors).toBeDefined();
    });

    it('should reject unknown structural properties on a task', () => {
        const plan = { type: 'task', role: 'chat', bogus: true };
        const result = validatePlan(plan);
        expect(result.valid).toBe(false);
        expect(result.errors).toBeDefined();
    });

    it('should allow arbitrary keys inside params', () => {
        const plan = { type: 'task', role: 'chat', params: { lengthLevel: 'brief', custom: 'ok' } };
        const result = validatePlan(plan);
        expect(result.valid).toBe(true);
        expect(result.errors).toBeUndefined();
    });

    it('should reject non-number maxRounds', () => {
        const plan = { type: 'task', role: 'chat', maxRounds: '1' };
        const result = validatePlan(plan);
        expect(result.valid).toBe(false);
        expect(result.errors).toBeDefined();
    });
});
