import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
    root: __dirname,
    test: {
        globals: true,
        environment: 'node',
        coverage: {
            provider: 'v8',
            reporter: ['text', 'json', 'html'],
            exclude: ['node_modules/', 'tests/', '*.config.js', 'coverage/']
        },
        include: [
            'packages/*/tests/**/*.test.js',
            'packages/*/tests/**/*.spec.js',
            'packages/*/**/tests/**/*.test.js',
            'packages/*/**/tests/**/*.spec.js'
        ],
        testTimeout: 10000,
        hookTimeout: 10000
    }
});
