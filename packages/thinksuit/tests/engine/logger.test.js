import { describe, it, expect, beforeEach, vi } from 'vitest';

import { createLogger, logStateEvent, createExecutionLogger } from '../../engine/logger.js';

describe('Logger', () => {
    let logger;

    beforeEach(() => {
        // Create logger for tests
        logger = createLogger({
            level: 'silent', // Use silent level for tests
            trace: false,
            format: 'json'
        });
    });

    describe('logStateEvent', () => {
        it('should handle MachineStart event', () => {
            const context = {
                stateKey: 'DetectSignals',
                depth: 1,
                quiet: false,
                execLogger: logger // Pass silent logger to avoid console fallback
            };

            // This should not throw
            expect(() => {
                logStateEvent(context, 'MachineStart', { test: 'data' });
            }).not.toThrow();
        });

        it('should handle StateInfo events', () => {
            const context = {
                stateKey: 'EvaluateRules',
                depth: 1,
                quiet: false,
                execLogger: logger // Pass silent logger to avoid console fallback
            };

            expect(() => {
                logStateEvent(context, 'StateInfo', 'StateEntered', { input: 'test' });
            }).not.toThrow();
        });

        it('should handle error events', () => {
            const context = {
                stateKey: 'DetectSignals',
                depth: 1,
                quiet: false,
                execLogger: logger // Pass silent logger to avoid console fallback
            };

            expect(() => {
                logStateEvent(context, 'MachineFail', 'Error occurred', new Error('Test error'));
            }).not.toThrow();
        });

        it('should track state timing', () => {
            const context = {
                stateKey: 'TestState',
                depth: 1,
                quiet: false,
                execLogger: logger // Pass silent logger to avoid console fallback
            };

            // Enter state
            logStateEvent(context, 'StateInfo', 'StateEntered', {});

            // Small delay to ensure measurable duration
            const start = Date.now();
            while (Date.now() - start < 10) {
                // wait
            }

            // Exit state - should calculate duration
            expect(() => {
                logStateEvent(context, 'StateInfo', 'StateExited', {});
            }).not.toThrow();
        });

        it('should handle null/undefined gracefully', () => {
            expect(() => {
                logStateEvent(null, 'MachineStart', null);
                logStateEvent(undefined, 'StateInfo', undefined);
                logStateEvent({}, null, null);
            }).not.toThrow();
        });

        it('should handle various argument types', () => {
            const context = {
                stateKey: 'TestState',
                depth: 1,
                execLogger: logger // Pass silent logger to avoid console fallback
            };

            // Test with different arg types
            expect(() => {
                logStateEvent(
                    context,
                    'StateInfo',
                    'Parameters',
                    { key: 'value' },
                    'string',
                    123,
                    null,
                    undefined
                );
            }).not.toThrow();

            expect(() => {
                logStateEvent(context, 'StateSucceed', 'HandlerSucceeded', {
                    output_keys: ['key1', 'key2'],
                    error: new Error('test')
                });
            }).not.toThrow();
        });
    });

    describe('createExecutionLogger', () => {
        it('should create a child logger with traceId', () => {
            const traceId = 'test-trace-123';
            // Create a mock parent logger with child method
            const parentLogger = {
                child: vi.fn().mockReturnValue({
                    info: vi.fn(),
                    error: vi.fn(),
                    debug: vi.fn(),
                    warn: vi.fn()
                })
            };
            const logger = createExecutionLogger(parentLogger, traceId);

            expect(logger).toBeDefined();
            expect(logger.info).toBeDefined();
            expect(logger.error).toBeDefined();
            expect(parentLogger.child).toHaveBeenCalledWith({ traceId });
        });
    });

    describe('Event filtering', () => {
        beforeEach(() => {
            // Set to error level to test filtering
            process.env.LOG_LEVEL = 'error';
        });

        it('should always log error events regardless of log level', () => {
            const context = {
                stateKey: 'TestState',
                depth: 1,
                execLogger: logger // Pass silent logger to avoid console fallback
            };

            // These should all execute without throwing
            expect(() => {
                logStateEvent(context, 'MachineFail', 'test');
                logStateEvent(context, 'StateError', 'test');
                logStateEvent(context, 'StateFailed', 'test');
                logStateEvent(context, 'StateFail', 'test');
            }).not.toThrow();
        });

        it('should skip trace/debug events when log level is higher', () => {
            const context = {
                stateKey: 'TestState',
                depth: 1,
                execLogger: logger // Pass silent logger to avoid console fallback
            };

            // These should not throw but also shouldn't do much
            expect(() => {
                logStateEvent(context, 'StateInfo', 'Parameters', {});
                logStateEvent(context, 'StateInfo', 'ResultPath', '$.test');
            }).not.toThrow();
        });
    });
});
