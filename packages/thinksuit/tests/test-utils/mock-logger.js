import { vi } from 'vitest';

// Create a mock logger instance
export const createMockLogger = () => ({
    trace: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(() => createMockLogger()),
    bindings: vi.fn(() => ({}))
});

// Mock logger module
export const mockLoggerModule = () => ({
    createLogger: vi.fn(() => createMockLogger()),
    createExecutionLogger: vi.fn(() => createMockLogger()),
    createSpanLogger: vi.fn(() => createMockLogger()),
    generateSpanId: vi.fn(() => 'test-span-id'),
    logStateEvent: vi.fn()
});
