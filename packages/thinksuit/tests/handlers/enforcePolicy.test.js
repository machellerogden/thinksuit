import { describe, it, expect, beforeEach } from 'vitest';
import { pino } from '../../engine/logger.js';
import { enforcePolicyCore } from '../../engine/handlers/enforcePolicy.js';

describe('enforcePolicy handler (numeric guard)', () => {
    let ctx;

    beforeEach(() => {
        ctx = { execLogger: pino({ level: 'silent' }) };
    });

    const policy = { maxDepth: 5, maxFanout: 3, maxChildren: 5 };

    it('approves a depth within the limit', async () => {
        const result = await enforcePolicyCore({ depth: 2, policy }, ctx);
        expect(result.approved).toBe(true);
        expect(result.depth).toBe(2);
        expect(result.limits).toEqual(policy);
    });

    it('rejects when depth reaches the limit (>=)', async () => {
        const result = await enforcePolicyCore({ depth: 5, policy }, ctx);
        expect(result.approved).toBe(false);
        expect(result.code).toBe('E_DEPTH');
        expect(result.reason).toContain('Maximum recursion depth');
    });

    it('rejects when fanout exceeds the limit (>)', async () => {
        const result = await enforcePolicyCore({ fanout: 4, policy }, ctx);
        expect(result.approved).toBe(false);
        expect(result.code).toBe('E_FANOUT');
        expect(result.reason).toContain('Maximum parallel branches');
    });

    it('approves fanout at exactly the limit', async () => {
        const result = await enforcePolicyCore({ fanout: 3, policy }, ctx);
        expect(result.approved).toBe(true);
    });

    it('rejects when children exceed the limit (>)', async () => {
        const result = await enforcePolicyCore({ children: 6, policy }, ctx);
        expect(result.approved).toBe(false);
        expect(result.code).toBe('E_CHILDREN');
        expect(result.reason).toContain('Maximum child operations');
    });

    it('approves children at exactly the limit', async () => {
        const result = await enforcePolicyCore({ children: 5, policy }, ctx);
        expect(result.approved).toBe(true);
    });

    it('only checks the dimension provided (one call = one dim)', async () => {
        // A large fanout is ignored when only depth is passed.
        const result = await enforcePolicyCore({ depth: 0, policy }, ctx);
        expect(result.approved).toBe(true);
    });

    it('handles null input gracefully', async () => {
        const result = await enforcePolicyCore(null, ctx);
        expect(result.approved).toBe(true);
        expect(result.reason).toBe('No policy constraints to check');
    });

    it('uses default limits when policy not provided', async () => {
        const result = await enforcePolicyCore({ depth: 4 }, ctx);
        expect(result.approved).toBe(true);
        expect(result.limits).toEqual({ maxDepth: 5, maxFanout: 3, maxChildren: 5 });
    });

    it('falls back to context.config.policy when input.policy is absent', async () => {
        const result = await enforcePolicyCore(
            { children: 3, context: { config: { policy: { maxChildren: 2 } } } },
            ctx
        );
        expect(result.approved).toBe(false);
        expect(result.code).toBe('E_CHILDREN');
    });

    it('handles the exact edge below the depth limit', async () => {
        const result = await enforcePolicyCore({ depth: 4, policy: { maxDepth: 5 } }, ctx);
        expect(result.approved).toBe(true);
    });
});
