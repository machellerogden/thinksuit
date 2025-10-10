import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
    normalizeConfig,
    loadMachineDefinition,
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
            expect(result.policy.perception.profile).toBe(DEFAULT_POLICY.perception.profile);
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
                    maxFanout: 7,
                    perception: {
                        profile: 'thorough',
                        budgetMs: 500
                    }
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
            expect(result.policy.perception.profile).toBe(providedConfig.policy.perception.profile);
            expect(result.policy.perception.budgetMs).toBe(providedConfig.policy.perception.budgetMs);
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
                    // maxFanout and perception should get defaults
                }
            };

            const result = normalizeConfig(config);

            expect(result.policy.maxDepth).toBe(10); // provided
            expect(result.policy.maxFanout).toBe(DEFAULT_POLICY.maxFanout); // default
            expect(result.policy.perception.profile).toBe(DEFAULT_POLICY.perception.profile); // default
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

        it('should throw error when Google Cloud project is missing for Vertex AI provider', () => {
            const config = {
                input: 'test',
                sessionId: 'test-session',
                provider: 'vertex-ai',
                providerConfig: { vertexAi: {} }
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

    describe('loadMachineDefinition', () => {
        it('should load and parse machine.json', async () => {
            const machineDefinition = await loadMachineDefinition();

            expect(machineDefinition).toBeDefined();
            expect(machineDefinition.States).toBeDefined();
            expect(machineDefinition.StartAt).toBeDefined();
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
                responseResult: {
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
            vi.mock('../../../engine/handlers/index.js', () => ({
                initializeHandlers: vi.fn()
            }));

            vi.mock('../../../engine/runCycle.js', () => ({
                runCycle: vi.fn()
            }));
        });

        it('should initialize handlers and run cycle with correct parameters', async () => {
            const { executeOnce } = await import('../../../engine/run/internals.js');
            const { initializeHandlers } = await import('../../../engine/handlers/index.js');
            const { runCycle } = await import('../../../engine/runCycle.js');

            const mockHandlers = { detectSignals: vi.fn() };
            initializeHandlers.mockReturnValue(mockHandlers);

            runCycle.mockResolvedValue(['SUCCEEDED', { response: 'test' }]);

            const mockLogger = {
                bindings: () => ({ traceId: 'test-trace-id' }),
                error: vi.fn()
            };

            const params = {
                finalConfig: { sessionId: 'test-session', policy: {} },
                logger: mockLogger,
                module: { name: 'test-module' },
                machineDefinition: { States: {} },
                discoveredTools: { tool1: {} },
                thread: [{ role: 'user', content: 'test' }]
            };

            const result = await executeOnce(params);

            expect(initializeHandlers).toHaveBeenCalled();
            expect(runCycle).toHaveBeenCalledWith({
                abortSignal: undefined,
                logger: mockLogger,
                thread: params.thread,
                module: params.module,
                parentBoundaryId: undefined,
                sessionId: 'test-session',
                traceId: 'test-trace-id',
                machineDefinition: params.machineDefinition,
                handlers: mockHandlers,
                config: params.finalConfig,
                discoveredTools: params.discoveredTools
            });
            expect(result).toEqual(['SUCCEEDED', { response: 'test' }]);
        });

        it('should log and re-throw execution errors', async () => {
            const { executeOnce } = await import('../../../engine/run/internals.js');
            const { runCycle } = await import('../../../engine/runCycle.js');

            const error = new Error('Execution failed');
            error.stack = 'test stack';
            runCycle.mockRejectedValue(error);

            const mockLogger = {
                bindings: () => ({ traceId: 'test-trace-id' }),
                error: vi.fn()
            };

            const params = {
                finalConfig: { sessionId: 'test-session' },
                logger: mockLogger,
                module: {},
                machineDefinition: {},
                discoveredTools: {},
                thread: []
            };

            await expect(executeOnce(params)).rejects.toThrow('Execution failed');

            expect(mockLogger.error).toHaveBeenCalledWith(
                {
                    data: {
                        error: 'Execution failed',
                        stack: 'test stack'
                    }
                },
                'State machine execution error'
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
                'Module \'test/invalid\' has invalid structure'
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
                'Module \'test/invalid\' has invalid structure'
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
                'Module \'test/invalid\' has invalid structure'
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
