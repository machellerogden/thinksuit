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

        expect(result.facts).toHaveLength(1);
        expect(result.facts[0].confidence).toBe(0.9);
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

        expect(result.facts).toHaveLength(3);
        const dimensions = [...new Set(result.facts.map((f) => f.dimension))];
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

        // Should have claim (no policy) but not support (below threshold) or calibration (disabled)
        expect(result.facts).toHaveLength(1);
        expect(result.facts[0].dimension).toBe('claim');
    });

    it('should handle empty input gracefully', async () => {
        const input = {
            signals: [],
            context: { traceId: 'test-004' }
        };

        const result = await aggregateFactsCore(input, defaultMachineContext);

        expect(result.facts).toEqual([]);
    });

    it('should handle null input gracefully', async () => {
        const result = await aggregateFactsCore(null, defaultMachineContext);

        expect(result.facts).toEqual([]);
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

        expect(result.facts).toHaveLength(1);
        expect(result.facts[0].confidence).toBe(0.9);
    });
});
