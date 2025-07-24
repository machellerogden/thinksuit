import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { join } from 'node:path';
import { writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { DEFAULT_MODULE } from '../engine/constants/defaults.js';

describe('Config module loading', () => {
    let tempDir;
    let tempConfigFile;
    let tempHomeDir;

    beforeEach(async () => {
        // Create temp directories
        tempDir = join(tmpdir(), `thinksuit-test-${Date.now()}`);
        tempHomeDir = join(tmpdir(), `thinksuit-home-test-${Date.now()}`);
        mkdirSync(tempDir, { recursive: true });
        mkdirSync(tempHomeDir, { recursive: true });
        tempConfigFile = join(tempDir, 'config.json');

        // Mock homedir to return our temp home (isolate from user's ~/.thinksuit.json)
        vi.doMock('node:os', async () => {
            const actual = await vi.importActual('node:os');
            return {
                ...actual,
                homedir: () => tempHomeDir
            };
        });

        // Clear module cache to ensure fresh imports with mocked homedir
        vi.resetModules();
    });

    afterEach(() => {
        // Clean up any env vars we set
        vi.unstubAllEnvs();

        // Clean up temp files
        rmSync(tempDir, { recursive: true, force: true });
        rmSync(tempHomeDir, { recursive: true, force: true });

        vi.restoreAllMocks();
        vi.doUnmock('node:os');
        vi.resetModules();
    });

    it('should use default module when no override provided', async () => {
        // Stub env vars to ensure they're not set
        vi.stubEnv('THINKSUIT_MODULE', '');

        // Import buildConfig after mocks are set up
        const { buildConfig } = await import('../engine/config.js');
        const config = buildConfig({ argv: ['node', 'cli.js', 'test'] });

        expect(config.module).toBe(DEFAULT_MODULE);
    });

    it('should prioritize CLI flag over config file', async () => {
        // Set conflicting value in config file
        writeFileSync(tempConfigFile, JSON.stringify({ module: 'file-module' }));
        vi.stubEnv('THINKSUIT_CONFIG', tempConfigFile);

        const { buildConfig } = await import('../engine/config.js');
        const config = buildConfig({
            argv: ['node', 'cli.js', '--module', 'cli-module', 'test']
        });

        expect(config.module).toBe('cli-module');
    });

    it('should use config file when no CLI flag provided', async () => {
        vi.stubEnv('THINKSUIT_MODULE', '');
        writeFileSync(tempConfigFile, JSON.stringify({ module: 'file-module' }));

        const { buildConfig } = await import('../engine/config.js');
        const config = buildConfig({
            argv: ['node', 'cli.js', '--config', tempConfigFile, 'test']
        });

        expect(config.module).toBe('file-module');
    });

    it('should support short flag -m for module', async () => {
        const { buildConfig } = await import('../engine/config.js');
        const config = buildConfig({
            argv: ['node', 'cli.js', '-m', 'short-flag-module', 'test']
        });

        expect(config.module).toBe('short-flag-module');
    });

    it('should handle complex module paths', async () => {
        const { buildConfig } = await import('../engine/config.js');

        const testCases = [
            './local-module.js',
            '../parent-module.js',
            '/absolute/path/to/module.js',
            'namespace/module.v1',
            'simple-name'
        ];

        for (const modulePath of testCases) {
            const config = buildConfig({
                argv: ['node', 'cli.js', '--module', modulePath, 'test']
            });

            expect(config.module).toBe(modulePath);
        }
    });
});