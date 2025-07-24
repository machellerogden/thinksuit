import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { join } from 'node:path';
import { mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';

describe('CLI module loading', () => {
    let tempDir;
    let originalCwd;

    beforeEach(() => {
        // Save original cwd
        originalCwd = process.cwd();

        // Create temp directory for test modules
        tempDir = join(tmpdir(), `thinksuit-modules-${Date.now()}`);
        mkdirSync(tempDir, { recursive: true });

        vi.resetModules();
    });

    afterEach(() => {
        // Restore original cwd
        process.chdir(originalCwd);

        // Clean up temp files
        rmSync(tempDir, { recursive: true, force: true });

        vi.restoreAllMocks();
    });


    it('should load workspace module from default', async () => {
        const { loadModule } = await import('../engine/run.js');
        const module = await loadModule('thinksuit/mu');

        expect(module).toBeDefined();
        expect(module.namespace).toBe('thinksuit');
        expect(module.name).toBe('mu');
        expect(module.version).toBe('0.0.0');
    });

    it('should load module from custom modules object', async () => {
        const { loadModule } = await import('../engine/run.js');

        const customModules = {
            'test/custom': {
                namespace: 'test',
                name: 'custom',
                version: '1.0.0',
                roles: [],
                prompts: {},
                rules: []
            }
        };

        const module = await loadModule('test/custom', customModules);
        expect(module).toBeDefined();
        expect(module.namespace).toBe('test');
        expect(module.name).toBe('custom');
        expect(module.version).toBe('1.0.0');
    });


    it('should throw when module not found', async () => {
        const { loadModule } = await import('../engine/run.js');

        await expect(loadModule('non.existent/module')).rejects.toThrow(
            'Module \'non.existent/module\' not found in modules object'
        );
    });


    it('should load module with default modules', async () => {
        const { loadModule } = await import('../engine/run.js');

        const module = await loadModule('thinksuit/mu');
        expect(module.namespace).toBe('thinksuit');
    });
});
