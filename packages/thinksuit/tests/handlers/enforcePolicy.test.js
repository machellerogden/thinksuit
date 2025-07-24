import { describe, it, expect, beforeEach } from 'vitest';
import { pino } from '../../engine/logger.js';
import { enforcePolicyCore } from '../../engine/handlers/enforcePolicy.js';

describe('enforcePolicy handler', () => {
    let logger;

    beforeEach(() => {
        logger = pino({ level: 'silent' });
    });
    it('should approve when within all limits', async () => {
        const input = {
            depth: 2,
            policy: {
                maxDepth: 5,
                maxFanout: 3,
                maxChildren: 5
            },
            plan: {
                strategy: 'direct',
                role: 'assistant'
            }
        };

        const result = await enforcePolicyCore(input, { execLogger: logger });

        expect(result.approved).toBe(true);
        expect(result.depth).toBe(2);
        expect(result.limits).toEqual({
            maxDepth: 5,
            maxFanout: 3,
            maxChildren: 5
        });
    });

    it('should reject when depth exceeds limit', async () => {
        const input = {
            depth: 5,
            policy: {
                maxDepth: 5,
                maxFanout: 3,
                maxChildren: 5
            },
            plan: {
                strategy: 'direct'
            }
        };

        const result = await enforcePolicyCore(input, { execLogger: logger });

        expect(result.approved).toBe(false);
        expect(result.code).toBe('E_DEPTH');
        expect(result.reason).toContain('Maximum recursion depth');
    });

    it('should reject when fanout exceeds limit for parallel execution', async () => {
        const input = {
            depth: 2,
            policy: {
                maxDepth: 5,
                maxFanout: 3,
                maxChildren: 5
            },
            plan: {
                strategy: 'parallel',
                roles: ['analyzer', 'critic', 'explorer', 'optimizer']
            }
        };

        const result = await enforcePolicyCore(input, { execLogger: logger });

        expect(result.approved).toBe(false);
        expect(result.code).toBe('E_FANOUT');
        expect(result.reason).toContain('Maximum parallel branches');
    });

    it('should reject when children exceed limit for sequential execution', async () => {
        const input = {
            depth: 2,
            policy: {
                maxDepth: 5,
                maxFanout: 3,
                maxChildren: 5
            },
            plan: {
                strategy: 'sequential',
                sequence: ['step1', 'step2', 'step3', 'step4', 'step5', 'step6']
            }
        };

        const result = await enforcePolicyCore(input, { execLogger: logger });

        expect(result.approved).toBe(false);
        expect(result.code).toBe('E_CHILDREN');
        expect(result.reason).toContain('Maximum child operations');
    });

    it('should handle null input gracefully', async () => {
        const result = await enforcePolicyCore(null, {});

        expect(result.approved).toBe(true);
        expect(result.reason).toBe('No policy constraints to check');
    });

    it('should use default limits when policy not provided', async () => {
        const input = {
            depth: 4,
            plan: {
                strategy: 'direct'
            }
        };

        const result = await enforcePolicyCore(input, { execLogger: logger });

        expect(result.approved).toBe(true);
        expect(result.limits).toEqual({
            maxDepth: 5,
            maxFanout: 3,
            maxChildren: 5
        });
    });

    it('should handle edge case at exact limit', async () => {
        const input = {
            depth: 4,
            policy: {
                maxDepth: 5
            },
            plan: {
                strategy: 'direct'
            }
        };

        const result = await enforcePolicyCore(input, { execLogger: logger });

        expect(result.approved).toBe(true); // depth 4 < maxDepth 5
    });
});
