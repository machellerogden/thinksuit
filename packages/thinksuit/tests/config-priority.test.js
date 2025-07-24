import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { join } from 'node:path';
import { writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { DEFAULT_MODULE } from '../engine/constants/defaults.js';

describe('Config priority without CLI parsing', () => {
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
        // Clean up any env vars we stubbed
        vi.unstubAllEnvs();

        // Clean up temp files
        rmSync(tempDir, { recursive: true, force: true });
        rmSync(tempHomeDir, { recursive: true, force: true });

        vi.restoreAllMocks();
        vi.doUnmock('node:os');
        vi.resetModules();
    });

    it('should use config file when provided', async () => {
        writeFileSync(tempConfigFile, JSON.stringify({ module: 'file-module' }));

        const { buildConfig } = await import('../engine/config.js');
        const config = buildConfig({
            argv: ['node', 'test.js', '--config', tempConfigFile]
        });

        expect(config.module).toBe('file-module');
    });

    it('should prioritize CLI args over config file', async () => {
        writeFileSync(tempConfigFile, JSON.stringify({ module: 'file-module' }));

        const { buildConfig } = await import('../engine/config.js');
        const config = buildConfig({
            argv: ['node', 'test.js', '--config', tempConfigFile, '--module', 'cli-module']
        });

        expect(config.module).toBe('cli-module');
    });

    it('should use defaults when no env var or config file', async () => {
        vi.stubEnv('THINKSUIT_MODULE', '');
        vi.stubEnv('THINKSUIT_CONFIG', '');

        const { buildConfig } = await import('../engine/config.js');
        const config = buildConfig({ argv: ['node', 'test.js'] });

        expect(config.module).toBe(DEFAULT_MODULE);
    });

    it('should handle all config sources correctly', async () => {
        // Test priority: CLI > file > defaults
        const configContent = {
            module: 'from-file',
            provider: 'anthropic',
            model: 'claude-3',
            maxDepth: 10
        };
        writeFileSync(tempConfigFile, JSON.stringify(configContent));

        const { buildConfig } = await import('../engine/config.js');
        const config = buildConfig({ argv: ['node', 'test.js', '--config', tempConfigFile] });

        // File config should be used for module (no CLI arg)
        expect(config.module).toBe('from-file');

        // File config should be used for provider
        expect(config.provider).toBe('anthropic');
        expect(config.model).toBe('claude-3');

        // File config should work for policy
        expect(config.policy.maxDepth).toBe(10);
    });
});