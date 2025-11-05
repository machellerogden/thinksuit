import { describe, it, expect, beforeEach } from 'vitest';
import { pino } from '../../../engine/logger.js';
import { aggregateFactsCore } from '../../../engine/handlers/aggregateFacts.js';

describe('aggregateFacts handler', () => {
    let logger;
    let defaultMachineContext;

    beforeEach(() => {
        logger = pino({ level: 'silent' });
        defaultMachineContext = {
            execLogger: logger
        };
    });

    it('should deduplicate facts with same key, keeping highest confidence', async () => {
        const input = {
            signals: [
                { type: 'Signal', dimension: 'claim', signal: 'universal', confidence: 0.7 },
                { type: 'Signal', dimension: 'claim', signal: 'universal', confidence: 0.9 },
                { type: 'Signal', dimension: 'claim', signal: 'universal', confidence: 0.8 }
            ],
            context: { traceId: 'test-001' }
        };

        const result = await aggregateFactsCore(input, defaultMachineContext);

        // Expect 2 facts: 1 deduplicated Signal + 1 TurnContext
        expect(result.facts).toHaveLength(2);
        const signalFact = result.facts.find(f => f.type === 'Signal');
        expect(signalFact.confidence).toBe(0.9);
    });

    it('should preserve facts with different keys', async () => {
        const input = {
            signals: [
                { type: 'Signal', dimension: 'claim', signal: 'universal', confidence: 0.7 },
                { type: 'Signal', dimension: 'claim', signal: 'forecast', confidence: 0.8 },
                { type: 'Signal', dimension: 'support', signal: 'source-cited', confidence: 0.9 }
            ],
            context: { traceId: 'test-002' }
        };

        const result = await aggregateFactsCore(input, defaultMachineContext);

        // Expect 4 facts: 3 Signals + 1 TurnContext
        expect(result.facts).toHaveLength(4);
        const signalFacts = result.facts.filter(f => f.type === 'Signal');
        const dimensions = [...new Set(signalFacts.map((f) => f.dimension))];
        expect(dimensions).toContain('claim');
        expect(dimensions).toContain('support');
    });

    it('should filter facts based on dimension policy', async () => {
        const input = {
            signals: [
                { type: 'Signal', dimension: 'claim', signal: 'universal', confidence: 0.7 },
                { type: 'Signal', dimension: 'support', signal: 'source-cited', confidence: 0.4 },
                { type: 'Signal', dimension: 'calibration', signal: 'hedged', confidence: 0.8 }
            ],
            context: {
                traceId: 'test-003',
                config: {
                    policy: {
                        perception: {
                            dimensions: {
                                support: { enabled: true, minConfidence: 0.6 },
                                calibration: { enabled: false }
                            }
                        }
                    }
                }
            }
        };

        const result = await aggregateFactsCore(input, defaultMachineContext);

        // Should have claim (no policy) + TurnContext, but not support (below threshold) or calibration (disabled)
        expect(result.facts).toHaveLength(2);
        const signalFact = result.facts.find(f => f.type === 'Signal');
        expect(signalFact.dimension).toBe('claim');
    });

    it('should handle empty input gracefully', async () => {
        const input = {
            signals: [],
            context: { traceId: 'test-004' }
        };

        const result = await aggregateFactsCore(input, defaultMachineContext);

        // Should only have TurnContext fact
        expect(result.facts).toHaveLength(1);
        expect(result.facts[0].type).toBe('TurnContext');
    });

    it('should handle null input gracefully', async () => {
        const result = await aggregateFactsCore(null, defaultMachineContext);

        // Should only have TurnContext fact
        expect(result.facts).toHaveLength(1);
        expect(result.facts[0].type).toBe('TurnContext');
    });

    it('should use fact name for deduplication key when signal is absent', async () => {
        const input = {
            signals: [
                { type: 'Derived', dimension: 'meta', name: 'complexity', confidence: 0.7 },
                { type: 'Derived', dimension: 'meta', name: 'complexity', confidence: 0.9 }
            ],
            context: { traceId: 'test-005' }
        };

        const result = await aggregateFactsCore(input, defaultMachineContext);

        // Expect 2 facts: 1 deduplicated Derived + 1 TurnContext
        expect(result.facts).toHaveLength(2);
        const derivedFact = result.facts.find(f => f.type === 'Derived');
        expect(derivedFact.confidence).toBe(0.9);
    });
});
