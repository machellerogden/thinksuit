import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
    DEFAULT_MODULE,
    DEFAULT_PROVIDER,
    DEFAULT_MODEL,
    DEFAULT_POLICY
} from '../../engine/constants/defaults.js';

describe('Configuration', () => {
    beforeEach(() => {
        // Reset environment variables
        vi.unstubAllEnvs();
        // Reset module cache to ensure fresh imports
        vi.resetModules();
    });

    afterEach(() => {
        // Clean up mocks
        vi.doUnmock('meow');
        vi.doUnmock('fs');
        vi.resetModules();
    });

    it('should load defaults when no flags or env vars provided', async () => {
        // Explicitly stub environment variables to ensure they're not set
        vi.stubEnv('THINKSUIT_TRACE', '');
        vi.stubEnv('THINKSUIT_CONFIG', '');

        // Mock meow to return empty flags
        vi.doMock('meow', () => ({
            default: () => ({
                input: [],
                flags: {},
                help: false
            })
        }));

        // Mock fs to prevent loading real config files
        vi.doMock('fs', () => ({
            existsSync: vi.fn(() => false),
            readFileSync: vi.fn()
        }));

        const { buildConfig } = await import('../../engine/config.js');
        const config = buildConfig();

        expect(config.module).toBe(DEFAULT_MODULE);
        expect(config.provider).toBe(DEFAULT_PROVIDER);
        expect(config.model).toBe(DEFAULT_MODEL);
        expect(config.policy.maxDepth).toBe(DEFAULT_POLICY.maxDepth);
        expect(config.policy.maxFanout).toBe(DEFAULT_POLICY.maxFanout);
        expect(config.policy.maxChildren).toBe(DEFAULT_POLICY.maxChildren);
        expect(config.logging.silent).toBe(false);
        expect(config.logging.verbose).toBe(false);
        expect(config.trace).toBe(false);
    });

    it('should prioritize CLI flags over defaults', async () => {
        vi.doMock('meow', () => ({
            default: () => ({
                input: ['test input'],
                flags: {
                    module: 'custom/module',
                    provider: 'anthropic',
                    model: 'claude-3',
                    maxDepth: 10,
                    verbose: true,
                    trace: true
                },
                help: false
            })
        }));

        const { buildConfig } = await import('../../engine/config.js');
        const config = buildConfig();

        expect(config.module).toBe('custom/module');
        expect(config.provider).toBe('anthropic');
        expect(config.model).toBe('claude-3');
        expect(config.policy.maxDepth).toBe(10);
        expect(config.logging.verbose).toBe(true);
        expect(config.trace).toBe(true);
        expect(config.input).toBe('test input');
    });

    it('should load config from file when specified', async () => {
        const mockConfig = {
            module: 'file/module',
            provider: 'ollama',
            model: 'llama2',
            maxDepth: 7,
            verbose: true
        };

        vi.doMock('fs', () => ({
            existsSync: vi.fn(() => true),
            readFileSync: vi.fn(() => JSON.stringify(mockConfig))
        }));

        vi.doMock('meow', () => ({
            default: () => ({
                input: [],
                flags: {
                    config: '/path/to/config.json'
                },
                help: false
            })
        }));

        const { buildConfig } = await import('../../engine/config.js');
        const config = buildConfig();

        expect(config.module).toBe('file/module');
        expect(config.provider).toBe('ollama');
        expect(config.model).toBe('llama2');
        expect(config.policy.maxDepth).toBe(7);
        expect(config.logging.verbose).toBe(true);
    });

    it('should prioritize CLI flags over config file', async () => {
        const mockConfig = {
            module: 'file/module',
            model: 'file-model'
        };

        vi.doMock('fs', () => ({
            existsSync: vi.fn(() => true),
            readFileSync: vi.fn(() => JSON.stringify(mockConfig))
        }));

        vi.doMock('meow', () => ({
            default: () => ({
                input: [],
                flags: {
                    config: '/path/to/config.json',
                    module: 'cli/module' // CLI flag should win
                },
                help: false
            })
        }));

        const { buildConfig } = await import('../../engine/config.js');
        const config = buildConfig();

        expect(config.module).toBe('cli/module'); // CLI wins
        expect(config.model).toBe('file-model'); // File value used (no CLI override)
    });

    it('should handle invalid config file gracefully', async () => {
        vi.doMock('fs', () => ({
            existsSync: vi.fn(() => true),
            readFileSync: vi.fn(() => 'invalid json')
        }));

        vi.doMock('meow', () => ({
            default: () => ({
                input: [],
                flags: {
                    config: '/path/to/invalid.json'
                },
                help: false
            })
        }));

        // Suppress console.error for this test
        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

        const { buildConfig } = await import('../../engine/config.js');
        const config = buildConfig();

        // Should fall back to defaults
        expect(config.module).toBe('thinksuit/mu');
        expect(config.provider).toBe('openai');

        consoleSpy.mockRestore();
    });

    it('should handle missing config file gracefully', async () => {
        vi.doMock('fs', () => ({
            existsSync: vi.fn(() => false),
            readFileSync: vi.fn()
        }));

        vi.doMock('meow', () => ({
            default: () => ({
                input: [],
                flags: {
                    config: '/path/to/missing.json'
                },
                help: false
            })
        }));

        const { buildConfig } = await import('../../engine/config.js');
        const config = buildConfig();

        // Should use defaults
        expect(config.module).toBe('thinksuit/mu');
        expect(config.provider).toBe('openai');
    });
});
