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

        // Mock fs to prevent loading config files but allow schema loading
        const actualFs = await import('fs');
        vi.doMock('fs', () => ({
            ...actualFs,
            existsSync: vi.fn((path) => {
                // Allow schema files, block config files
                if (path.includes('.thinksuit.json')) return false;
                return actualFs.existsSync(path);
            }),
            readFileSync: vi.fn((path, encoding) => {
                // Allow schema files, block config files
                if (path.includes('.thinksuit.json')) throw new Error('File not found');
                return actualFs.readFileSync(path, encoding);
            })
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
            provider: 'openai',
            model: 'llama2',
            maxDepth: 7,
            verbose: true
        };

        const actualFs = await import('fs');
        vi.doMock('fs', () => ({
            ...actualFs,
            existsSync: vi.fn((path) => {
                if (path === '/path/to/config.json') return true;
                if (path.includes('.thinksuit.json')) return false;
                return actualFs.existsSync(path);
            }),
            readFileSync: vi.fn((path, encoding) => {
                if (path === '/path/to/config.json') return JSON.stringify(mockConfig);
                if (path.includes('.thinksuit.json')) throw new Error('File not found');
                return actualFs.readFileSync(path, encoding);
            })
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
        expect(config.provider).toBe('openai');
        expect(config.model).toBe('llama2');
        expect(config.policy.maxDepth).toBe(7);
        expect(config.logging.verbose).toBe(true);
    });

    it('should prioritize CLI flags over config file', async () => {
        const mockConfig = {
            module: 'file/module',
            model: 'file-model'
        };

        const actualFs = await import('fs');
        vi.doMock('fs', () => ({
            ...actualFs,
            existsSync: vi.fn((path) => {
                if (path === '/path/to/config.json') return true;
                if (path.includes('.thinksuit.json')) return false;
                return actualFs.existsSync(path);
            }),
            readFileSync: vi.fn((path, encoding) => {
                if (path === '/path/to/config.json') return JSON.stringify(mockConfig);
                if (path.includes('.thinksuit.json')) throw new Error('File not found');
                return actualFs.readFileSync(path, encoding);
            })
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
        const actualFs = await import('fs');
        vi.doMock('fs', () => ({
            ...actualFs,
            existsSync: vi.fn((path) => {
                if (path === '/path/to/invalid.json') return true;
                if (path.includes('.thinksuit.json')) return false;
                return actualFs.existsSync(path);
            }),
            readFileSync: vi.fn((path, encoding) => {
                if (path === '/path/to/invalid.json') return 'invalid json';
                if (path.includes('.thinksuit.json')) throw new Error('File not found');
                return actualFs.readFileSync(path, encoding);
            })
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

        const { buildConfig } = await import('../../engine/config.js');

        // Should throw an error instead of calling process.exit
        expect(() => buildConfig()).toThrow(/Error parsing config file/);
    });

    it('should handle missing config file gracefully', async () => {
        const actualFs = await import('fs');
        vi.doMock('fs', () => ({
            ...actualFs,
            existsSync: vi.fn((path) => {
                // All config files return false
                if (path.includes('.thinksuit.json') || path === '/path/to/missing.json') return false;
                return actualFs.existsSync(path);
            }),
            readFileSync: vi.fn((path, encoding) => {
                if (path.includes('.thinksuit.json') || path === '/path/to/missing.json') {
                    throw new Error('File not found');
                }
                return actualFs.readFileSync(path, encoding);
            })
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

        // Suppress console.warn for this test
        const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

        const { buildConfig } = await import('../../engine/config.js');
        const config = buildConfig();

        // Should use defaults
        expect(config.module).toBe('thinksuit/mu');
        expect(config.provider).toBe('openai');

        consoleWarnSpy.mockRestore();
    });
});
