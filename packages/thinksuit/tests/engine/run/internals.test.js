import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
    normalizeConfig,
    formatFinalResult,
    withMcpLifecycle,
    selectModule
} from '../../../engine/run/internals.js';

import {
    DEFAULT_MODULE,
    DEFAULT_PROVIDER,
    DEFAULT_MODEL,
    DEFAULT_POLICY,
    DEFAULT_LOGGING
} from '../../../engine/constants/defaults.js';

// The turn seam (executeOnce) drives these; mock at top level so interception is reliable.
vi.mock('../../../engine/handlers/executePlan.js', () => ({ executePlan: vi.fn() }));
vi.mock('../../../plans.js', () => ({ getPlan: vi.fn() }));

describe('run/internals', () => {
    describe('normalizeConfig', () => {
        it('should apply defaults for all missing fields', () => {
            const config = {
                input: 'test input',
                provider: 'openai',
                providerConfig: { openai: { apiKey: 'test-key' } },
                sessionId: 'test-session'
            };

            const result = normalizeConfig(config);

            // Test that defaults are applied (without hard-coding what they are)
            expect(result.module).toBe(DEFAULT_MODULE);
            expect(result.provider).toBe(DEFAULT_PROVIDER);
            expect(result.model).toBe(DEFAULT_MODEL);
            expect(result.policy.maxDepth).toBe(DEFAULT_POLICY.maxDepth);
            expect(result.policy.maxFanout).toBe(DEFAULT_POLICY.maxFanout);
            expect(result.logging.level).toBe(DEFAULT_LOGGING.level);

            // Test that provided values are preserved
            expect(result.input).toBe('test input');
            expect(result.providerConfig.openai.apiKey).toBe('test-key');
            expect(result.sessionId).toBe('test-session');
        });

        it('should preserve all provided values', () => {
            const providedConfig = {
                input: 'custom input',
                sessionId: 'custom-session',
                module: 'custom/module.v1',
                provider: 'anthropic',
                providerConfig: { anthropic: { apiKey: 'test-key' } },
                model: 'claude-3',
                policy: {
                    maxDepth: 10,
                    maxFanout: 7
                },
                trace: true,
                cwd: '/custom/dir',
                tools: ['tool1', 'tool2'],
                autoApproveTools: true
            };

            const result = normalizeConfig(providedConfig);

            // Every provided value should be preserved exactly
            expect(result.input).toBe(providedConfig.input);
            expect(result.module).toBe(providedConfig.module);
            expect(result.provider).toBe(providedConfig.provider);
            expect(result.model).toBe(providedConfig.model);
            expect(result.policy.maxDepth).toBe(providedConfig.policy.maxDepth);
            expect(result.policy.maxFanout).toBe(providedConfig.policy.maxFanout);
            expect(result.trace).toBe(providedConfig.trace);
            expect(result.cwd).toBe(providedConfig.cwd);
            expect(result.tools).toBe(providedConfig.tools);
            expect(result.autoApproveTools).toBe(providedConfig.autoApproveTools);
        });

        it('should apply defaults for nested fields when parent is partially provided', () => {
            const config = {
                input: 'test',
                provider: 'openai',
                providerConfig: { openai: { apiKey: 'key' } },
                sessionId: 'session',
                policy: {
                    maxDepth: 10
                    // maxFanout should get a default
                }
            };

            const result = normalizeConfig(config);

            expect(result.policy.maxDepth).toBe(10); // provided
            expect(result.policy.maxFanout).toBe(DEFAULT_POLICY.maxFanout); // default
        });

        it('should throw error when input is missing', () => {
            const config = {
                apiKey: 'test-key',
                sessionId: 'test-session'
            };

            expect(() => normalizeConfig(config)).toThrow('Input is required');
        });

        it('should throw error when apiKey is missing for OpenAI provider', () => {
            const config = {
                input: 'test',
                sessionId: 'test-session',
                provider: 'openai',
                providerConfig: { openai: {} }
            };

            expect(() => normalizeConfig(config)).toThrow('OpenAI API key is required');
        });

        it('should throw error when Google Cloud project is missing for Google provider', () => {
            const config = {
                input: 'test',
                sessionId: 'test-session',
                provider: 'google',
                providerConfig: { google: {} }
            };

            expect(() => normalizeConfig(config)).toThrow('Google Cloud project ID is required');
        });

        it('should throw error when sessionId is missing', () => {
            const config = {
                input: 'test',
                provider: 'openai',
                providerConfig: { openai: { apiKey: 'test-key' } }
            };

            expect(() => normalizeConfig(config)).toThrow('sessionId is required');
        });

        it('should handle tools and autoApproveTools configuration', () => {
            const config = {
                input: 'test',
                provider: 'openai',
                providerConfig: { openai: { apiKey: 'test-key' } },
                sessionId: 'test-session',
                tools: ['tool1', 'tool2'],
                autoApproveTools: true,
                cwd: '/test/dir'
            };

            const result = normalizeConfig(config);

            expect(result.tools).toEqual(['tool1', 'tool2']);
            expect(result.autoApproveTools).toBe(true);
            expect(result.cwd).toBe('/test/dir');
        });

        it('preserves allowedTools so the allowlist can bite (A5)', () => {
            const config = {
                input: 'test',
                provider: 'openai',
                providerConfig: { openai: { apiKey: 'test-key' } },
                sessionId: 'test-session',
                allowedTools: ['roll_dice'],
                cwd: '/test/dir'
            };

            const result = normalizeConfig(config);

            // Dropping this is what made applyToolPolicy always see undefined and
            // never restrict — the --allow-tool flag was a no-op.
            expect(result.allowedTools).toEqual(['roll_dice']);
        });
    });

    describe('buildLogger', () => {
        beforeEach(() => {
            vi.resetModules();
            vi.mock('../../../engine/utils/id.js', () => ({
                generateId: vi.fn().mockReturnValue('test-trace-id')
            }));
        });

        it('should create a new logger when none provided', async () => {
            const { buildLogger } = await import('../../../engine/run/internals.js');

            const config = {
                sessionId: 'test-session',
                logging: { level: 'info' },
                trace: false
            };

            const logger = buildLogger(config);

            expect(logger).toBeDefined();
            expect(logger.bindings()).toMatchObject({
                sessionId: 'test-session',
                traceId: 'test-trace-id',
                hasTrace: false
            });
        });

        it('should use provided logger and add session/trace context', async () => {
            const { buildLogger } = await import('../../../engine/run/internals.js');

            const mockLogger = {
                child: vi.fn().mockReturnValue({
                    bindings: () => ({
                        sessionId: 'test-session',
                        traceId: 'test-trace-id',
                        hasTrace: true
                    })
                })
            };

            const config = {
                sessionId: 'test-session',
                trace: true
            };

            buildLogger(config, mockLogger);

            expect(mockLogger.child).toHaveBeenCalledWith({
                sessionId: 'test-session',
                traceId: 'test-trace-id',
                hasTrace: true
            });
        });
    });

    describe('formatFinalResult', () => {
        let mockLogger;

        beforeEach(() => {
            mockLogger = {
                info: vi.fn()
            };
        });

        it('should format successful execution result', () => {
            const result = {
                handlerResult: {
                    response: {
                        output: 'Test output',
                        usage: { tokens: 100 }
                    }
                }
            };

            const formatted = formatFinalResult('SUCCEEDED', result, 'test-session', mockLogger);

            expect(formatted).toEqual({
                success: true,
                response: 'Test output',
                sessionId: 'test-session',
                usage: { tokens: 100 },
                error: undefined
            });

            expect(mockLogger.info).toHaveBeenCalledWith(
                expect.objectContaining({
                    event: 'session.response',
                    data: {
                        response: 'Test output',
                        usage: { tokens: 100 },
                        success: true
                    }
                }),
                'Assistant response generated'
            );
        });

        it('should format failed execution result', () => {
            const result = {
                name: 'TestError'
            };

            const formatted = formatFinalResult('FAILED', result, 'test-session', mockLogger);

            expect(formatted).toEqual({
                success: false,
                response: 'Execution failed',
                sessionId: 'test-session',
                error: 'TestError'
            });
        });

        it('should emit session.interrupted (not session.response) for an interrupt', () => {
            const result = {
                interrupted: true,
                message: 'Task interrupted by user',
                partialData: { foo: 'bar' }
            };

            const formatted = formatFinalResult(
                'interrupted',
                result,
                'test-session',
                mockLogger,
                'turn-1',
                'session-1'
            );

            expect(formatted).toMatchObject({
                success: false,
                interrupted: true,
                response: 'Task interrupted by user'
            });

            const events = mockLogger.info.mock.calls.map(([entry]) => entry.event);
            expect(events).toContain('session.interrupted');
            expect(events).toContain('session.turn.complete');
            expect(events).not.toContain('session.response');

            expect(mockLogger.info).toHaveBeenCalledWith(
                expect.objectContaining({
                    event: 'session.interrupted',
                    parentBoundaryId: 'turn-1',
                    data: { reason: 'Task interrupted by user', partialData: { foo: 'bar' } }
                }),
                'Turn interrupted by user'
            );
        });

        it('should use fallback output when main output is missing', () => {
            const result = {
                fallback: {
                    output: 'Fallback output'
                }
            };

            const formatted = formatFinalResult('SUCCEEDED', result, 'test-session', mockLogger);

            expect(formatted.response).toBe('Fallback output');
            expect(formatted.success).toBe(true);
        });

        it('should handle missing output gracefully', () => {
            const result = {};

            const formatted = formatFinalResult('SUCCEEDED', result, 'test-session', mockLogger);

            expect(formatted).toEqual({
                success: false,
                response: 'No response generated',
                sessionId: 'test-session',
                usage: undefined,
                error: undefined
            });
        });
    });

    describe('withMcpLifecycle', () => {
        let mockLogger;

        beforeEach(() => {
            mockLogger = {
                info: vi.fn(),
                error: vi.fn()
            };

            vi.mock('../../../engine/mcp/client.js', () => ({
                startMCPServers: vi.fn(),
                stopAllMCPServers: vi.fn()
            }));

            vi.mock('../../../engine/mcp/discovery.js', () => ({
                discoverTools: vi.fn()
            }));

            vi.mock('../../../engine/mcp/policy.js', () => ({
                applyToolPolicy: vi.fn(),
                getFilteredToolNames: vi.fn()
            }));
        });

        it('should return empty clients and tools when config has no allowedDirectories or cwd', async () => {
            const module = { toolDependencies: [] };
            const config = {}; // No allowedDirectories or cwd

            const result = await withMcpLifecycle(module, config, mockLogger);

            expect(result.mcpClients).toBeInstanceOf(Map);
            expect(result.mcpClients.size).toBe(0);
            expect(result.discoveredTools).toEqual({});
            expect(result.cleanup).toBeUndefined();
        });

        it('should start servers, discover tools, and apply policy', async () => {
            const { withMcpLifecycle } = await import('../../../engine/run/internals.js');
            const { startMCPServers, stopAllMCPServers } = await import('../../../engine/mcp/client.js');
            const { discoverTools } = await import('../../../engine/mcp/discovery.js');
            const { applyToolPolicy, getFilteredToolNames } = await import('../../../engine/mcp/policy.js');

            const mockClients = new Map([['server1', {}]]);
            startMCPServers.mockResolvedValue(mockClients);

            const allTools = { tool1: {}, tool2: {}, tool3: {} };
            discoverTools.mockResolvedValue(allTools);

            const filteredTools = { tool1: {}, tool3: {} };
            applyToolPolicy.mockReturnValue(filteredTools);
            getFilteredToolNames.mockReturnValue(['tool2']);

            const module = {
                toolDependencies: [
                    { name: 'tool1', description: 'First tool' },
                    { name: 'tool3', description: 'Third tool' }
                ]
            };
            const config = {
                allowedTools: ['tool1', 'tool3'],
                cwd: '/test/dir',
                allowedDirectories: ['/test/dir']
            };

            const result = await withMcpLifecycle(module, config, mockLogger);

            expect(result.mcpClients).toBe(mockClients);
            expect(result.discoveredTools).toBe(filteredTools);
            expect(result.cleanup).toBeDefined();

            expect(mockLogger.info).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: {
                        totalTools: 3,
                        allowedTools: 2
                    }
                }),
                expect.stringContaining('Discovered 3 tools, allowed 2 after policy')
            );

            // Test cleanup function
            await result.cleanup();
            expect(stopAllMCPServers).toHaveBeenCalled();
        });

        it('should handle MCP initialization errors and throw', async () => {
            const { withMcpLifecycle } = await import('../../../engine/run/internals.js');
            const { startMCPServers } = await import('../../../engine/mcp/client.js');

            startMCPServers.mockRejectedValue(new Error('MCP startup failed'));

            const module = {
                toolDependencies: [
                    { name: 'tool1', description: 'First tool' }
                ]
            };
            const config = {
                cwd: '/test/dir',
                allowedDirectories: ['/test/dir']
            };

            await expect(withMcpLifecycle(module, config, mockLogger)).rejects.toThrow('MCP startup failed');

            expect(mockLogger.error).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: { error: 'MCP startup failed' }
                }),
                'Failed to initialize MCP servers: MCP startup failed'
            );
        });

        it('should validate tool dependencies and throw if missing', async () => {
            const { withMcpLifecycle } = await import('../../../engine/run/internals.js');
            const { startMCPServers } = await import('../../../engine/mcp/client.js');
            const { discoverTools } = await import('../../../engine/mcp/discovery.js');
            const { applyToolPolicy, getFilteredToolNames } = await import('../../../engine/mcp/policy.js');

            const mockClients = new Map([['server1', {}]]);
            startMCPServers.mockResolvedValue(mockClients);

            const allTools = { tool1: {}, tool2: {} };
            discoverTools.mockResolvedValue(allTools);

            const filteredTools = { tool1: {}, tool2: {} };
            applyToolPolicy.mockReturnValue(filteredTools);
            getFilteredToolNames.mockReturnValue([]);

            const module = {
                toolDependencies: [
                    { name: 'tool1', description: 'First tool' },
                    { name: 'missing_tool', description: 'This tool is not available' }
                ]
            };
            const config = {
                cwd: '/test/dir',
                allowedDirectories: ['/test/dir']
            };

            await expect(withMcpLifecycle(module, config, mockLogger)).rejects.toThrow('Module requires tools not provided');

            expect(mockLogger.error).toHaveBeenCalledWith(
                expect.objectContaining({
                    event: 'system.mcp.validation_error'
                }),
                expect.stringContaining('Tool validation failed')
            );
        });
    });

    describe('executeOnce', () => {
        beforeEach(() => {
            vi.clearAllMocks();
        });

        const makeLogger = () => {
            const logger = {
                bindings: () => ({ traceId: 'test-trace-id' }),
                error: vi.fn()
            };
            logger.child = vi.fn(() => logger);
            return logger;
        };

        it('uses an explicit selectedPlan node and drives executePlan', async () => {
            const { executeOnce } = await import('../../../engine/run/internals.js');
            const { executePlan } = await import('../../../engine/handlers/executePlan.js');
            const { getPlan } = await import('../../../plans.js');

            executePlan.mockResolvedValue({ response: { output: 'hi', usage: { prompt: 1, completion: 1 } } });

            const explicitPlan = { type: 'task', role: 'chat', maxRounds: 1, params: { lengthLevel: 'brief' } };
            const logger = makeLogger();
            const params = {
                finalConfig: {
                    sessionId: 'test-session',
                    module: 'thinksuit/mu',
                    selectedPlan: explicitPlan,
                    frame: null,
                    modality: null
                },
                logger,
                module: { name: 'mu', defaultPlan: 'chat' },
                discoveredTools: { tool1: {} },
                thread: [{ role: 'user', content: 'prev' }],
                input: 'hello',
                turnBoundaryId: 'turn-1'
            };

            const result = await executeOnce(params);

            // Explicit plan means the library is not consulted.
            expect(getPlan).not.toHaveBeenCalled();

            const [node, ctx] = executePlan.mock.calls[0];
            // The node is passed straight through — no adapter.
            expect(node).toBe(explicitPlan);
            expect(ctx.bag).toEqual({ input: 'hello' });
            expect(ctx.thread).toBe(params.thread);
            expect(ctx.context).toMatchObject({ sessionId: 'test-session', depth: 0, branch: 'root', parentBoundaryId: 'turn-1' });
            expect(ctx.machineContext.discoveredTools).toBe(params.discoveredTools);

            expect(result).toEqual(['SUCCEEDED', { handlerResult: { response: { output: 'hi', usage: { prompt: 1, completion: 1 } } } }]);
        });

        it('falls back to the module default plan when none is selected', async () => {
            const { executeOnce } = await import('../../../engine/run/internals.js');
            const { executePlan } = await import('../../../engine/handlers/executePlan.js');
            const { getPlan } = await import('../../../plans.js');

            getPlan.mockResolvedValue({ id: 'chat', name: 'Chat', type: 'task', role: 'chat', maxRounds: 1 });
            executePlan.mockResolvedValue({ response: { output: 'ok', usage: {} } });

            const params = {
                finalConfig: { sessionId: 's', module: 'thinksuit/mu' },
                logger: makeLogger(),
                module: { name: 'mu', defaultPlan: 'chat' },
                discoveredTools: {},
                thread: [],
                input: 'hi',
                turnBoundaryId: 'turn-1'
            };

            await executeOnce(params);

            expect(getPlan).toHaveBeenCalledWith('chat', 'thinksuit/mu', params.module);
            // The resolved library entry (inline node + metadata) is passed straight through.
            expect(executePlan.mock.calls[0][0]).toEqual({ id: 'chat', name: 'Chat', type: 'task', role: 'chat', maxRounds: 1 });
        });

        it('translates an InterruptError into the interrupted status', async () => {
            const { executeOnce } = await import('../../../engine/run/internals.js');
            const { executePlan } = await import('../../../engine/handlers/executePlan.js');
            const { InterruptError } = await import('../../../engine/errors/InterruptError.js');

            const err = new InterruptError('stopped', { stage: 'test' });
            err.gatheredData = { foo: 'bar' };
            executePlan.mockRejectedValue(err);

            const params = {
                finalConfig: { sessionId: 's', module: 'thinksuit/mu', selectedPlan: { strategy: 'direct', role: 'chat' } },
                logger: makeLogger(),
                module: { name: 'mu', defaultPlan: 'chat' },
                discoveredTools: {},
                thread: [],
                input: 'hi',
                turnBoundaryId: 'turn-1'
            };

            const [status, result] = await executeOnce(params);
            expect(status).toBe('interrupted');
            expect(result).toMatchObject({ interrupted: true, message: 'stopped', partialData: { foo: 'bar' } });
        });

        it('logs and re-throws a non-interrupt error', async () => {
            const { executeOnce } = await import('../../../engine/run/internals.js');
            const { executePlan } = await import('../../../engine/handlers/executePlan.js');

            const error = new Error('Execution failed');
            error.stack = 'test stack';
            executePlan.mockRejectedValue(error);

            const logger = makeLogger();
            const params = {
                finalConfig: { sessionId: 's', module: 'thinksuit/mu', selectedPlan: { strategy: 'direct', role: 'chat' } },
                logger,
                module: { name: 'mu', defaultPlan: 'chat' },
                discoveredTools: {},
                thread: [],
                input: 'hi',
                turnBoundaryId: 'turn-1'
            };

            await expect(executeOnce(params)).rejects.toThrow('Execution failed');
            expect(logger.error).toHaveBeenCalledWith(
                { data: { error: 'Execution failed', stack: 'test stack' } },
                'Turn execution error'
            );
        });
    });

    describe('selectModule', () => {
        it('should throw when modules is not provided', () => {
            expect(() => selectModule(null, 'test/module')).toThrow('modules is required');
            expect(() => selectModule(undefined, 'test/module')).toThrow('modules is required');
        });

        it('should select module from provided modules object', () => {
            const mockModule = {
                namespace: 'test',
                name: 'example',
                version: '1.0.0',
                roles: [],
                prompts: {},
                rules: []
            };

            const modules = {
                'test/example': mockModule
            };

            const module = selectModule(modules, 'test/example');

            expect(module).toBe(mockModule);
            expect(module.namespace).toBe('test');
            expect(module.name).toBe('example');
            expect(module.version).toBe('1.0.0');
        });

        it('should throw when module not found in modules object', () => {
            const modules = {
                'test/other': { namespace: 'test', name: 'other', version: '1.0.0' }
            };

            expect(() => selectModule(modules, 'test/missing')).toThrow(
                'Module \'test/missing\' not found in modules object'
            );
        });

        it('should validate module structure - missing namespace', () => {
            const modules = {
                'test/invalid': {
                    name: 'invalid',
                    version: '1.0.0'
                }
            };

            expect(() => selectModule(modules, 'test/invalid')).toThrow(
                'Module \'test/invalid\' missing required property: namespace'
            );
        });

        it('should validate module structure - missing name', () => {
            const modules = {
                'test/invalid': {
                    namespace: 'test',
                    version: '1.0.0'
                }
            };

            expect(() => selectModule(modules, 'test/invalid')).toThrow(
                'Module \'test/invalid\' missing required property: name'
            );
        });

        it('should validate module structure - missing version', () => {
            const modules = {
                'test/invalid': {
                    namespace: 'test',
                    name: 'invalid'
                }
            };

            expect(() => selectModule(modules, 'test/invalid')).toThrow(
                'Module \'test/invalid\' missing required property: version'
            );
        });

        it('should select from modules with multiple entries', () => {
            const module1 = {
                namespace: 'test',
                name: 'first',
                version: '1.0.0'
            };

            const module2 = {
                namespace: 'test',
                name: 'second',
                version: '2.0.0'
            };

            const modules = {
                'test/first': module1,
                'test/second': module2
            };

            const selected = selectModule(modules, 'test/second');

            expect(selected).toBe(module2);
            expect(selected.name).toBe('second');
        });
    });
});
