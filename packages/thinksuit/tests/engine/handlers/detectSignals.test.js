import { describe, it, expect, beforeEach } from 'vitest';
import { pino } from '../../../engine/logger.js';

import { detectSignalsCore as detectSignals } from '../../../engine/handlers/detectSignals.js';
import { validateFacts } from '../../../schemas/validate.js';

// Test classifiers that return predictable results based on input
const createTestClassifiers = () => ({
    claim: async (thread) => {
        const content = thread[0]?.content || '';
        if (content.match(/everyone|all|definitely/i)) {
            return [{ signal: 'universal', confidence: 0.9 }];
        }
        return [];
    },
    support: async (thread) => {
        const content = thread[0]?.content || '';
        if (content.match(/according to|research|study/i)) {
            return [{ signal: 'source-cited', confidence: 0.8 }];
        }
        return [{ signal: 'none', confidence: 0.8 }];
    },
    calibration: async (thread) => {
        const content = thread[0]?.content || '';
        if (content.match(/might|perhaps|possibly/i)) {
            return [{ signal: 'hedged', confidence: 0.7 }];
        }
        return [];
    },
    temporal: async (thread) => {
        const content = thread[0]?.content || '';
        if (content.match(/\d{4}|january|february|monday/i)) {
            return [{ signal: 'time-specified', confidence: 0.8 }];
        }
        return [{ signal: 'no-date', confidence: 0.9 }];
    },
    contract: async (thread) => {
        const content = thread[0]?.content || '';
        if (content.match(/explore/i)) {
            return [{ signal: 'explore', confidence: 0.75 }];
        }
        if (content.match(/analyze/i)) {
            return [{ signal: 'analyze', confidence: 0.8 }];
        }
        return [];
    }
});

describe('detectSignals handler', () => {
    let logger;
    let defaultMachineContext;

    beforeEach(() => {
        logger = pino({ level: 'silent' });
        // Default machine context with test classifiers
        defaultMachineContext = {
            module: { classifiers: createTestClassifiers() },
            execLogger: logger
        };
    });

    it('should return facts array with Signal type', async () => {
        const input = {
            thread: [{ role: 'user', content: 'Everyone should definitely understand this.' }],
            context: { traceId: 'test-123' }
        };

        const result = await detectSignals(input, defaultMachineContext);

        expect(result).toHaveProperty('facts');
        expect(Array.isArray(result.facts)).toBe(true);

        // Should have detected signals
        expect(result.facts.length).toBeGreaterThan(0);

        // All facts should be of type Signal
        result.facts.forEach((fact) => {
            expect(fact.type).toBe('Signal');
        });
    });

    it('should detect multiple dimensions from complex input', async () => {
        const input = {
            thread: [
                {
                    role: 'user',
                    content:
                        'According to research from 2023, we should definitely explore what options might work.'
                }
            ],
            context: { traceId: 'test-124' }
        };

        const result = await detectSignals(input, defaultMachineContext);
        const dimensions = [...new Set(result.facts.map((f) => f.dimension))];

        // Should detect signals from multiple dimensions
        expect(dimensions.length).toBeGreaterThanOrEqual(3);
        expect(dimensions).toContain('support'); // "According to research"
        expect(dimensions).toContain('temporal'); // "2023"
        expect(dimensions).toContain('contract'); // "explore"
    });

    it('should filter signals below confidence threshold', async () => {
        const input = {
            thread: [{ role: 'user', content: 'This is a simple statement.' }],
            context: { traceId: 'test-125' }
        };

        const result = await detectSignals(input, defaultMachineContext);

        // All returned signals should have confidence >= 0.6
        result.facts.forEach((fact) => {
            expect(fact.confidence).toBeGreaterThanOrEqual(0.6);
        });
    });

    it('should handle empty thread gracefully', async () => {
        const input = {
            thread: [],
            context: { traceId: 'test-126' }
        };

        const result = await detectSignals(input, defaultMachineContext);
        delete result.metrics;

        expect(result).toEqual({ facts: [] });
    });

    it('should handle missing thread gracefully', async () => {
        const input = {
            context: { traceId: 'test-127' }
        };

        const result = await detectSignals(input, defaultMachineContext);
        delete result.metrics;

        expect(result).toEqual({ facts: [] });
    });

    it('should validate all facts against schema', async () => {
        const input = {
            thread: [
                {
                    role: 'user',
                    content:
                        'Everyone must analyze this data from yesterday according to the study.'
                }
            ],
            context: { traceId: 'test-128' }
        };

        const result = await detectSignals(input, defaultMachineContext);

        // Validate all facts against the schema
        const validation = validateFacts(result.facts);
        expect(validation.valid).toBe(true);
    });

    it('should run all classifiers in parallel', async () => {
        const input = {
            thread: [{ role: 'user', content: 'Test message for parallel execution.' }],
            context: { traceId: 'test-129' }
        };

        const startTime = Date.now();
        await detectSignals(input, defaultMachineContext);
        const duration = Date.now() - startTime;

        // Should complete quickly (all classifiers run in parallel)
        // Even with 5 classifiers, should complete in under 500ms
        expect(duration).toBeLessThan(500);
    });

    it('should include all required fact properties', async () => {
        const input = {
            thread: [{ role: 'user', content: 'We should explore this.' }],
            context: { traceId: 'test-130' }
        };

        const result = await detectSignals(input, defaultMachineContext);

        result.facts.forEach((fact) => {
            expect(fact).toHaveProperty('type', 'Signal');
            expect(fact).toHaveProperty('dimension');
            expect(fact).toHaveProperty('signal');
            expect(fact).toHaveProperty('confidence');
            expect(typeof fact.dimension).toBe('string');
            expect(typeof fact.signal).toBe('string');
            expect(typeof fact.confidence).toBe('number');
        });
    });
});
