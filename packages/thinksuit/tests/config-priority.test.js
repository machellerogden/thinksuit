import { describe, it, expect, vi } from 'vitest';
import { join } from 'node:path';
import { writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';
import { DEFAULT_MODULE } from '../engine/constants/defaults.js';

// Helper to create isolated test context
function createTestContext() {
    const uniqueId = randomBytes(8).toString('hex');
    const tempDir = join(tmpdir(), `thinksuit-test-${uniqueId}`);
    const tempHomeDir = join(tmpdir(), `thinksuit-home-test-${uniqueId}`);
    const tempConfigFile = join(tempDir, 'config.json');

    mkdirSync(tempDir, { recursive: true });
    mkdirSync(tempHomeDir, { recursive: true });

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

    return { tempDir, tempHomeDir, tempConfigFile };
}

// Helper to cleanup test context
function cleanupTestContext(context) {
    vi.unstubAllEnvs();
    rmSync(context.tempDir, { recursive: true, force: true });
    rmSync(context.tempHomeDir, { recursive: true, force: true });
    vi.restoreAllMocks();
    vi.doUnmock('node:os');
    vi.resetModules();
}

describe('Config priority without CLI parsing', () => {
    it('should use config file when provided', async () => {
        const ctx = createTestContext();
        try {
            writeFileSync(ctx.tempConfigFile, JSON.stringify({ module: 'file-module' }));

            const { buildConfig } = await import('../engine/config.js');
            const config = buildConfig({
                argv: ['node', 'test.js', '--config', ctx.tempConfigFile]
            });

            expect(config.module).toBe('file-module');
        } finally {
            cleanupTestContext(ctx);
        }
    });

    it('should prioritize CLI args over config file', async () => {
        const ctx = createTestContext();
        try {
            writeFileSync(ctx.tempConfigFile, JSON.stringify({ module: 'file-module' }));

            const { buildConfig } = await import('../engine/config.js');
            const config = buildConfig({
                argv: ['node', 'test.js', '--config', ctx.tempConfigFile, '--module', 'cli-module']
            });

            expect(config.module).toBe('cli-module');
        } finally {
            cleanupTestContext(ctx);
        }
    });

    it('should use defaults when no env var or config file', async () => {
        const ctx = createTestContext();
        try {
            vi.stubEnv('THINKSUIT_MODULE', '');
            vi.stubEnv('THINKSUIT_CONFIG', '');

            const { buildConfig } = await import('../engine/config.js');
            const config = buildConfig({ argv: ['node', 'test.js'] });

            expect(config.module).toBe(DEFAULT_MODULE);
        } finally {
            cleanupTestContext(ctx);
        }
    });

    it('should handle all config sources correctly', async () => {
        const ctx = createTestContext();
        try {
            // Test priority: CLI > file > defaults
            const configContent = {
                module: 'from-file',
                provider: 'anthropic',
                model: 'claude-3',
                maxDepth: 10
            };
            writeFileSync(ctx.tempConfigFile, JSON.stringify(configContent));

            const { buildConfig } = await import('../engine/config.js');
            const config = buildConfig({ argv: ['node', 'test.js', '--config', ctx.tempConfigFile] });

            // File config should be used for module (no CLI arg)
            expect(config.module).toBe('from-file');

            // File config should be used for provider
            expect(config.provider).toBe('anthropic');
            expect(config.model).toBe('claude-3');

            // File config should work for policy
            expect(config.policy.maxDepth).toBe(10);
        } finally {
            cleanupTestContext(ctx);
        }
    });
});