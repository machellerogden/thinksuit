import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadPlans, getPlan, savePlan, deletePlan } from '../../plans.js';
import { loadFrames, getFrame, saveFrame, deleteFrame } from '../../frames.js';

describe('plans.js / frames.js delegation', () => {
    let userDir;
    let moduleDir;
    let prevEnv;
    let module;

    beforeEach(() => {
        userDir = mkdtempSync(join(tmpdir(), 'ts-user-'));
        moduleDir = mkdtempSync(join(tmpdir(), 'ts-module-'));
        prevEnv = process.env.THINKSUIT_ARTIFACTS_DIR;
        process.env.THINKSUIT_ARTIFACTS_DIR = userDir;
        module = { dir: moduleDir };
    });

    afterEach(() => {
        if (prevEnv === undefined) delete process.env.THINKSUIT_ARTIFACTS_DIR;
        else process.env.THINKSUIT_ARTIFACTS_DIR = prevEnv;
        rmSync(userDir, { recursive: true, force: true });
        rmSync(moduleDir, { recursive: true, force: true });
    });

    function seedModulePlan(name, body) {
        mkdirSync(join(moduleDir, 'plans'), { recursive: true });
        writeFileSync(join(moduleDir, 'plans', `${name}.json`), JSON.stringify(body), 'utf-8');
    }

    it('loads module plans tagged source=module, with id = filename and inner plan intact', async () => {
        seedModulePlan('chat', {
            name: 'Chat',
            description: 'd',
            plan: { name: 'chat', strategy: 'direct', role: 'chat' }
        });
        const plans = await loadPlans('thinksuit/mu', module);
        expect(plans).toHaveLength(1);
        expect(plans[0]).toMatchObject({ id: 'chat', name: 'Chat', source: 'module' });
        expect(plans[0].plan.name).toBe('chat');
    });

    it('save → load → delete round-trips a user plan and tags it source=user', async () => {
        const res = await savePlan({
            id: 'mine',
            name: 'Mine',
            description: 'my plan',
            plan: { name: 'mine', strategy: 'direct', role: 'chat' }
        });
        expect(res.success).toBe(true);

        const found = await getPlan('mine', 'thinksuit/mu', module);
        expect(found).toMatchObject({ id: 'mine', name: 'Mine', source: 'user' });
        expect(found.plan.strategy).toBe('direct');

        const del = await deletePlan('mine');
        expect(del.success).toBe(true);
        expect(await getPlan('mine', 'thinksuit/mu', module)).toBeNull();
    });

    it('user plan wins over a module plan of the same id', async () => {
        seedModulePlan('chat', { name: 'Module Chat', plan: { name: 'chat' } });
        await savePlan({ id: 'chat', name: 'User Chat', plan: { name: 'chat' } });
        const plans = await loadPlans('thinksuit/mu', module);
        const chat = plans.filter((p) => p.id === 'chat');
        expect(chat).toHaveLength(1);
        expect(chat[0]).toMatchObject({ name: 'User Chat', source: 'user' });
    });

    it('deleting a missing plan reports not found', async () => {
        const del = await deletePlan('nope');
        expect(del).toEqual({ success: false, error: 'Plan not found' });
    });

    it('frames round-trip through markdown frontmatter (gray-matter)', async () => {
        const res = await saveFrame({
            id: 'code-review',
            name: 'Code Review',
            description: 'review context',
            text: 'Focus on type safety and error handling.'
        });
        expect(res.success).toBe(true);

        const found = await getFrame('code-review', 'thinksuit/mu', module);
        expect(found).toMatchObject({
            id: 'code-review',
            name: 'Code Review',
            description: 'review context',
            source: 'user'
        });
        expect(found.text.trim()).toBe('Focus on type safety and error handling.');

        const all = await loadFrames('thinksuit/mu', module);
        expect(all.map((f) => f.id)).toContain('code-review');

        await deleteFrame('code-review');
        expect(await getFrame('code-review', 'thinksuit/mu', module)).toBeNull();
    });
});
