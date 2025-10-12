import js from '@eslint/js';
import importPlugin from 'eslint-plugin-import';
import sveltePlugin from 'eslint-plugin-svelte';
import prettierConfig from 'eslint-config-prettier';
import globals from 'globals';

export default [
    js.configs.recommended,
    ...sveltePlugin.configs['flat/recommended'],
    prettierConfig,
    {
        plugins: {
            import: importPlugin
        },
        languageOptions: {
            ecmaVersion: 2024,
            sourceType: 'module',
            globals: {
                ...globals.browser,
                ...globals.node
            }
        },
        rules: {
            indent: ['error', 4, { SwitchCase: 1 }],
            'no-tabs': 'error',
            quotes: ['error', 'single'],
            semi: ['error', 'always'],
            'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
            'no-console': 'off',
            'import/order': 'off',
            'import/no-duplicates': 'error',
            'import/newline-after-import': 'error',
            'import/no-unresolved': 'off',
            'import/extensions': ['error', 'always', { ignorePackages: true }],
            // Disable navigation-without-resolve for custom routing
            'svelte/no-navigation-without-resolve': 'off'
        }
    },
    {
        files: ['**/*.svelte'],
        rules: {
            // Disable indent rule for Svelte files as it conflicts
            indent: 'off',
            'svelte/indent': ['error', {
                indent: 4,
                ignoredNodes: [],
                switchCase: 1
            }],
            // Svelte-specific rules
            'svelte/valid-compile': 'error',  // Guard against deprecated syntax
            'svelte/require-each-key': 'error',  // Important for performance
            'svelte/no-at-html-tags': 'off',  // {@html} is sometimes needed
            'svelte/no-at-debug-tags': 'error',
            'svelte/no-dupe-else-if-blocks': 'error',
            'svelte/no-dupe-style-properties': 'error',
            'svelte/no-inner-declarations': 'error',
            'svelte/no-trailing-spaces': 'error',  // Protect against trailing whitespace
            'svelte/no-unused-svelte-ignore': 'warn',
            'svelte/no-useless-children-snippet': 'warn',
            'svelte/prefer-svelte-reactivity': 'warn',  // Helpful but not critical
            'svelte/no-unnecessary-state-wrap': 'warn'  // Helpful but not critical
        }
    },
    {
        ignores: [
            '.svelte-kit/**',
            'build/**',
            'dist/**',
            'node_modules/**',
            '.DS_Store',
            '*.log'
        ]
    }
];