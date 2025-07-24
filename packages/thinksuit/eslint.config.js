import js from '@eslint/js';
import importPlugin from 'eslint-plugin-import';
import prettierConfig from 'eslint-config-prettier';

export default [
    js.configs.recommended,
    prettierConfig,
    {
        ignores: ['poc/**']
    },
    {
        plugins: {
            import: importPlugin
        },
        languageOptions: {
            ecmaVersion: 2024,
            sourceType: 'module',
            globals: {
                console: 'readonly',
                process: 'readonly',
                Buffer: 'readonly',
                __dirname: 'readonly',
                __filename: 'readonly',
                URL: 'readonly',
                setTimeout: 'readonly',
                clearTimeout: 'readonly',
                describe: 'readonly',
                it: 'readonly',
                expect: 'readonly',
                beforeEach: 'readonly',
                afterEach: 'readonly',
                vi: 'readonly'
            }
        },
        rules: {
            indent: ['error', 4, { SwitchCase: 1 }],
            'no-tabs': 'error',
            quotes: ['error', 'single'],
            semi: ['error', 'always'],
            'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
            'no-console': 'off',
            'import/order': 'off', // Disabled - don't care about empty lines in imports
            'import/no-duplicates': 'error',
            'import/newline-after-import': 'error',
            'import/no-unresolved': 'off', // Turn off since it doesn't work well with ESM
            'import/extensions': ['error', 'always', { ignorePackages: true }]
        }
    },
    {
        files: ['**/*.test.js', '**/*.spec.js'],
        rules: {
            'no-unused-expressions': 'off'
        }
    }
];
