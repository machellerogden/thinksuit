import { describe, it, expect } from 'vitest';

import { validateFacts, validatePlan } from '../../schemas/validate.js';

describe('validateFacts', () => {
    it('should validate a valid Signal fact', () => {
        const fact = {
            type: 'Signal',
            dimension: 'contract',
            signal: 'explore',
            confidence: 0.8
        };
        const result = validateFacts(fact);
        expect(result.valid).toBe(true);
        expect(result.errors).toBeUndefined();
    });

    it('should validate a valid RoleSelection fact', () => {
        const fact = {
            type: 'RoleSelection',
            role: 'assistant',
            confidence: 0.95
        };
        const result = validateFacts(fact);
        expect(result.valid).toBe(true);
        expect(result.errors).toBeUndefined();
    });

    it('should validate a valid ExecutionPlan fact', () => {
        const fact = {
            type: 'ExecutionPlan',
            strategy: 'sequential',
            sequence: ['explorer', 'analyzer']
        };
        const result = validateFacts(fact);
        expect(result.valid).toBe(true);
        expect(result.errors).toBeUndefined();
    });

    it('should validate a valid TokenMultiplier fact', () => {
        const fact = {
            type: 'TokenMultiplier',
            value: 0.5
        };
        const result = validateFacts(fact);
        expect(result.valid).toBe(true);
        expect(result.errors).toBeUndefined();
    });

    it('should reject invalid fact type', () => {
        const fact = {
            type: 'InvalidType',
            data: {}
        };
        const result = validateFacts(fact);
        expect(result.valid).toBe(false);
        expect(result.errors).toBeDefined();
        expect(result.errors[0].message).toContain('is not one of enum values');
    });

    it('should reject confidence outside 0-1 range', () => {
        const fact = {
            type: 'Signal',
            dimension: 'claim',
            signal: 'universal',
            confidence: 1.5
        };
        const result = validateFacts(fact);
        expect(result.valid).toBe(false);
        expect(result.errors).toBeDefined();
        expect(result.errors[0].message).toContain('must be less than or equal to 1');
    });

    it('should reject additional properties not in schema', () => {
        const fact = {
            type: 'Signal',
            dimension: 'claim',
            signal: 'universal',
            confidence: 0.7,
            unknownProp: 'should fail'
        };
        const result = validateFacts(fact);
        expect(result.valid).toBe(false);
        expect(result.errors).toBeDefined();
        expect(result.errors[0].message).toContain('additional property "unknownProp"');
    });

    it('should reject invalid strategy enum', () => {
        const fact = {
            type: 'ExecutionPlan',
            strategy: 'invalid_strategy'
        };
        const result = validateFacts(fact);
        expect(result.valid).toBe(false);
        expect(result.errors).toBeDefined();
        expect(result.errors[0].message).toContain('is not one of enum values');
    });

    it('should validate array of facts', () => {
        const facts = [
            { type: 'Signal', dimension: 'contract', signal: 'explore', confidence: 0.8 },
            { type: 'RoleSelection', role: 'assistant', confidence: 0.95 },
            { type: 'ExecutionPlan', strategy: 'direct' }
        ];
        const result = validateFacts(facts);
        expect(result.valid).toBe(true);
        expect(result.errors).toBeUndefined();
    });

    it('should reject array with invalid facts', () => {
        const facts = [
            { type: 'Signal', dimension: 'contract', signal: 'explore', confidence: 0.8 },
            { type: 'InvalidType' }
        ];
        const result = validateFacts(facts);
        expect(result.valid).toBe(false);
        expect(result.errors).toBeDefined();
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0].index).toBe(1);
    });
});

describe('validatePlan', () => {
    it('should validate a valid direct plan', () => {
        const plan = {
            name: 'test-direct',
            strategy: 'direct',
            role: 'assistant',
            rationale: 'Default direct execution',
            maxTokens: 400
        };
        const result = validatePlan(plan);
        expect(result.valid).toBe(true);
        expect(result.errors).toBeUndefined();
    });

    it('should validate a valid sequential plan', () => {
        const plan = {
            name: 'test-sequential',
            strategy: 'sequential',
            sequence: ['explorer', 'analyzer'],
            rationale: 'Explore then analyze pattern'
        };
        const result = validatePlan(plan);
        expect(result.valid).toBe(true);
        expect(result.errors).toBeUndefined();
    });

    it('should validate a valid parallel plan', () => {
        const plan = {
            name: 'test-parallel',
            strategy: 'parallel',
            roles: ['critic', 'analyzer', 'synthesizer']
        };
        const result = validatePlan(plan);
        expect(result.valid).toBe(true);
        expect(result.errors).toBeUndefined();
    });

    it('should reject missing required strategy', () => {
        const plan = {
            role: 'assistant',
            maxTokens: 400
        };
        const result = validatePlan(plan);
        expect(result.valid).toBe(false);
        expect(result.errors).toBeDefined();
        expect(result.errors[0].message).toContain('requires property "strategy"');
    });

    it('should reject invalid strategy enum', () => {
        const plan = {
            name: 'test-invalid',
            strategy: 'invalid_strategy'
        };
        const result = validatePlan(plan);
        expect(result.valid).toBe(false);
        expect(result.errors).toBeDefined();
        expect(result.errors[0].message).toContain('is not one of enum values');
    });

    it('should allow additional properties', () => {
        const plan = {
            name: 'test-additional',
            strategy: 'direct',
            role: 'assistant',
            customField: 'allowed',
            anotherField: { nested: 'data' }
        };
        const result = validatePlan(plan);
        expect(result.valid).toBe(true);
        expect(result.errors).toBeUndefined();
    });

    it('should validate sequence as array of strings', () => {
        const plan = {
            name: 'test-sequence',
            strategy: 'sequential',
            sequence: ['role1', 'role2', 'role3']
        };
        const result = validatePlan(plan);
        expect(result.valid).toBe(true);
        expect(result.errors).toBeUndefined();
    });

    it('should reject invalid items in sequence', () => {
        const plan = {
            strategy: 'sequential',
            sequence: ['role1', 123, 'role3'] // 123 is not valid
        };
        const result = validatePlan(plan);
        expect(result.valid).toBe(false);
        expect(result.errors).toBeDefined();
        // The error will be about not matching either string or object schema
    });

    it('should accept objects with role and adaptationKey in sequence', () => {
        const plan = {
            name: 'test-sequence-objects',
            strategy: 'sequential',
            sequence: [
                'explorer',
                { role: 'reflector', adaptations: ['inner_voice'] },
                'synthesizer'
            ]
        };
        const result = validatePlan(plan);
        expect(result.valid).toBe(true);
        expect(result.errors).toBeUndefined();
    });

    it('should validate maxTokens as number', () => {
        const plan = {
            name: 'test-maxTokens',
            strategy: 'direct',
            maxTokens: 800
        };
        const result = validatePlan(plan);
        expect(result.valid).toBe(true);
        expect(result.errors).toBeUndefined();
    });

    it('should reject non-number maxTokens', () => {
        const plan = {
            name: 'test-invalid-maxTokens',
            strategy: 'direct',
            maxTokens: '800'
        };
        const result = validatePlan(plan);
        expect(result.valid).toBe(false);
        expect(result.errors).toBeDefined();
        expect(result.errors[0].message).toContain('is not of a type(s) number');
    });
});
