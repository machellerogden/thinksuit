/**
 * Intent Classifier Tests
 * Tests keyword-based intent detection for role selection
 */

import { describe, it, expect } from 'vitest';
import classifyIntent from '../classifiers/intent.js';

describe('Intent Classifier', () => {
    describe('keyword detection', () => {
        it('should detect capture intent', async () => {
            const thread = [{ role: 'user', content: 'Please save this information for later' }];
            const signals = await classifyIntent(thread);

            expect(signals).toHaveLength(1);
            expect(signals[0].signal).toBe('capture');
            expect(signals[0].dimension).toBe('intent');
            expect(signals[0].confidence).toBeGreaterThan(0.5);
        });

        it('should detect readback intent', async () => {
            const thread = [{ role: 'user', content: 'What did we discuss earlier? Show me the readback' }];
            const signals = await classifyIntent(thread);

            expect(signals.some(s => s.signal === 'readback')).toBe(true);
        });

        it('should detect analyze intent', async () => {
            const thread = [{ role: 'user', content: 'Why does this code fail? Explain the issue' }];
            const signals = await classifyIntent(thread);

            expect(signals.some(s => s.signal === 'analyze')).toBe(true);
        });

        it('should detect investigate intent', async () => {
            const thread = [{ role: 'user', content: 'Find all test files in the project' }];
            const signals = await classifyIntent(thread);

            expect(signals.some(s => s.signal === 'investigate')).toBe(true);
        });

        it('should detect synthesize intent', async () => {
            const thread = [{ role: 'user', content: 'Combine these findings into a summary' }];
            const signals = await classifyIntent(thread);

            expect(signals.some(s => s.signal === 'synthesize')).toBe(true);
        });

        it('should detect execute intent', async () => {
            const thread = [{ role: 'user', content: 'Create a new function to handle this' }];
            const signals = await classifyIntent(thread);

            expect(signals.some(s => s.signal === 'execute')).toBe(true);
        });
    });

    describe('confidence scoring', () => {
        it('should give higher confidence for keywords early in text', async () => {
            const early = [{ role: 'user', content: 'Find the bug in this code please' }];
            const late = [{ role: 'user', content: 'There is something wrong with the implementation and I need you to find the issue' }];

            const earlySignals = await classifyIntent(early);
            const lateSignals = await classifyIntent(late);

            const earlyConfidence = earlySignals.find(s => s.signal === 'investigate')?.confidence || 0;
            const lateConfidence = lateSignals.find(s => s.signal === 'investigate')?.confidence || 0;

            expect(earlyConfidence).toBe(0.9); // Early match gets high confidence
            expect(lateConfidence).toBe(0.7); // Late match gets lower confidence
        });
    });

    describe('default behavior', () => {
        it('should default to analyze when no specific intent detected', async () => {
            const thread = [{ role: 'user', content: 'This is some random text without keywords' }];
            const signals = await classifyIntent(thread);

            expect(signals).toHaveLength(1);
            expect(signals[0].signal).toBe('analyze');
            expect(signals[0].confidence).toBe(0.5);
        });
    });

    describe('edge cases', () => {
        it('should return empty array for empty thread', async () => {
            const signals = await classifyIntent([]);
            expect(signals).toEqual([]);
        });

        it('should return empty array for message without content', async () => {
            const thread = [{ role: 'user' }];
            const signals = await classifyIntent(thread);
            expect(signals).toEqual([]);
        });

        it('should detect multiple intents in same message', async () => {
            const thread = [{ role: 'user', content: 'Find the files and then create a summary' }];
            const signals = await classifyIntent(thread);

            expect(signals.length).toBeGreaterThan(1);
            expect(signals.some(s => s.signal === 'investigate')).toBe(true);
            expect(signals.some(s => s.signal === 'execute')).toBe(true);
        });
    });
});
