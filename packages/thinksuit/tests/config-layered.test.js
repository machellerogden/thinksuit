import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { join } from 'node:path';
import { writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { DEFAULT_MODULE, DEFAULT_PROVIDER, DEFAULT_MODEL } from '../engine/constants/defaults.js';

describe('Layered Config Loading', () => {
    let tempHomeDir;
    let tempProjectDir;
    let originalCwd;
    /* eslint-disable no-unused-vars */
    let originalHome;

    beforeEach(async () => {
        // Save original values
        originalCwd = process.cwd();
        originalHome = homedir();

        // Create temp directories
        tempHomeDir = join(tmpdir(), `thinksuit-home-${Date.now()}`);
        tempProjectDir = join(tmpdir(), `thinksuit-project-${Date.now()}`);
        mkdirSync(tempHomeDir, { recursive: true });
        mkdirSync(tempProjectDir, { recursive: true });

        // Mock homedir to return our temp home
        vi.doMock('node:os', async () => {
            const actual = await vi.importActual('node:os');
            return {
                ...actual,
                homedir: () => tempHomeDir
            };
        });

        // Clear module cache
        vi.resetModules();
        vi.doUnmock('../engine/config.js');
    });

    afterEach(() => {
        // Restore original cwd
        process.chdir(originalCwd);

        // Clean up
        vi.unstubAllEnvs();
        rmSync(tempHomeDir, { recursive: true, force: true });
        rmSync(tempProjectDir, { recursive: true, force: true });
        vi.restoreAllMocks();
        vi.resetModules();
    });

    it('should load only defaults when no config files exist', async () => {
        const { buildConfig } = await import('../engine/config.js');
        const config = buildConfig({ argv: ['node', 'test.js'] });

        expect(config.module).toBe(DEFAULT_MODULE);
        expect(config.provider).toBe(DEFAULT_PROVIDER);
        expect(config.model).toBe(DEFAULT_MODEL);
        expect(config._sources.files).toHaveLength(0);
    });

    it('should load global config from home directory', async () => {
        const globalConfig = {
            module: 'global-module',
            provider: 'anthropic'
        };
        writeFileSync(join(tempHomeDir, '.thinksuit.json'), JSON.stringify(globalConfig));

        const { buildConfig } = await import('../engine/config.js');
        const config = buildConfig({ argv: ['node', 'test.js'] });

        expect(config.module).toBe('global-module');
        expect(config.provider).toBe('anthropic');
        expect(config._sources.files).toHaveLength(1);
        expect(config._sources.files[0].type).toBe('global');
    });

    it('should layer project config over global config', async () => {
        const globalConfig = {
            module: 'global-module',
            provider: 'vertex-ai',
            model: 'global-model'
        };
        const projectConfig = {
            module: 'project-module',  // Override global
            model: 'project-model'     // Override global
            // provider not specified, should use global
        };

        writeFileSync(join(tempHomeDir, '.thinksuit.json'), JSON.stringify(globalConfig));
        writeFileSync(join(tempProjectDir, '.thinksuit.json'), JSON.stringify(projectConfig));

        const { buildConfig } = await import('../engine/config.js');
        const config = buildConfig({
            argv: ['node', 'test.js', '--cwd', tempProjectDir]
        });

        expect(config.module).toBe('project-module');  // Project wins
        expect(config.provider).toBe('vertex-ai'); // Global preserved
        expect(config.model).toBe('project-model');    // Project wins
        expect(config._sources.files).toHaveLength(2);
        expect(config._sources.files[0].type).toBe('global');
        expect(config._sources.files[1].type).toBe('project');
    });

    it('should respect cwd from global config when no CLI flag', async () => {
        const globalConfig = {
            module: 'global-module',
            cwd: tempProjectDir  // Points to project directory
        };
        const projectConfig = {
            module: 'project-module'
        };

        writeFileSync(join(tempHomeDir, '.thinksuit.json'), JSON.stringify(globalConfig));
        writeFileSync(join(tempProjectDir, '.thinksuit.json'), JSON.stringify(projectConfig));

        const { buildConfig } = await import('../engine/config.js');
        const config = buildConfig({ argv: ['node', 'test.js'] });

        expect(config.module).toBe('project-module');  // Should find project config via cwd
        expect(config._sources.workingDirectory).toBe(tempProjectDir);
        expect(config._sources.files).toHaveLength(2);
    });

    it('should use only explicit config when --config flag provided', async () => {
        const globalConfig = { module: 'global-module' };
        const projectConfig = { module: 'project-module' };
        const explicitConfig = { module: 'explicit-module' };

        const explicitPath = join(tempHomeDir, 'custom.json');

        writeFileSync(join(tempHomeDir, '.thinksuit.json'), JSON.stringify(globalConfig));
        writeFileSync(join(tempProjectDir, '.thinksuit.json'), JSON.stringify(projectConfig));
        writeFileSync(explicitPath, JSON.stringify(explicitConfig));

        const { buildConfig } = await import('../engine/config.js');
        const config = buildConfig({
            argv: ['node', 'test.js', '--config', explicitPath, '--cwd', tempProjectDir]
        });

        expect(config.module).toBe('explicit-module');
        expect(config._sources.files).toHaveLength(1);
        expect(config._sources.files[0].type).toBe('explicit');
        expect(config._sources.files[0].path).toBe(explicitPath);
    });

    it('should prioritize CLI flags over all config files', async () => {
        const globalConfig = {
            module: 'global-module',
            provider: 'openai'
        };
        const projectConfig = {
            module: 'project-module',
            provider: 'anthropic'
        };

        writeFileSync(join(tempHomeDir, '.thinksuit.json'), JSON.stringify(globalConfig));
        writeFileSync(join(tempProjectDir, '.thinksuit.json'), JSON.stringify(projectConfig));

        const { buildConfig } = await import('../engine/config.js');
        const config = buildConfig({
            argv: ['node', 'test.js', '--cwd', tempProjectDir, '--module', 'cli-module']
        });

        expect(config.module).toBe('cli-module');        // CLI wins
        expect(config.provider).toBe('anthropic'); // Project config used
        expect(config._sources.cli).toBe(true);
    });

    it('should handle invalid JSON gracefully', async () => {
        writeFileSync(join(tempHomeDir, '.thinksuit.json'), 'invalid json');

        const { buildConfig } = await import('../engine/config.js');

        // Should throw an error instead of calling process.exit
        expect(() => buildConfig({ argv: ['node', 'test.js'] })).toThrow(/Error parsing config file/);
    });

    it('should not duplicate global and project when they are the same path', async () => {
        const config = { module: 'home-module' };
        writeFileSync(join(tempHomeDir, '.thinksuit.json'), JSON.stringify(config));

        const { buildConfig } = await import('../engine/config.js');
        // When cwd is explicitly set to home directory, should only load once
        const result = buildConfig({ argv: ['node', 'test.js', '--cwd', tempHomeDir] });

        expect(result.module).toBe('home-module');
        expect(result._sources.files).toHaveLength(1);
        expect(result._sources.files[0].type).toBe('global');
    });

    it('should track environment variables in sources', async () => {
        // Clear any existing env vars first
        vi.stubEnv('ANTHROPIC_API_KEY', '');
        vi.stubEnv('OPENAI_API_KEY', 'test-key');
        vi.stubEnv('DEBUG', 'true');
        vi.stubEnv('THINKSUIT_TRACE', '');
        vi.stubEnv('LOG_SILENT', '');

        const { buildConfig } = await import('../engine/config.js');
        const config = buildConfig({ argv: ['node', 'test.js'] });

        expect(config._sources.environment.openai).toBe(true);
        expect(config._sources.environment.debug).toBe(true);
        expect(config._sources.environment.anthropic).toBe(false);
    });

    it('should merge policy settings correctly', async () => {
        const globalConfig = {
            maxDepth: 10,
            maxFanout: 5
        };
        const projectConfig = {
            maxDepth: 15  // Override
            // maxFanout not specified, should use global
        };

        writeFileSync(join(tempHomeDir, '.thinksuit.json'), JSON.stringify(globalConfig));
        writeFileSync(join(tempProjectDir, '.thinksuit.json'), JSON.stringify(projectConfig));

        const { buildConfig } = await import('../engine/config.js');
        const config = buildConfig({
            argv: ['node', 'test.js', '--cwd', tempProjectDir]
        });

        expect(config.policy.maxDepth).toBe(15); // Project override
        expect(config.policy.maxFanout).toBe(5); // Global preserved
        expect(config.policy.maxChildren).toBe(5); // Default
    });
});
