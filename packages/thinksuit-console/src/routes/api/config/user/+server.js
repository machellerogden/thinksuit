import { json } from '@sveltejs/kit';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { validateConfig } from 'thinksuit/schemas/validate';

const CONFIG_FILE = '.thinksuit.json';
const getUserConfigPath = () => join(homedir(), CONFIG_FILE);

export async function GET() {
    const configPath = getUserConfigPath();

    try {
        if (!existsSync(configPath)) {
            // Return empty config if file doesn't exist (valid state - will create on save)
            return json({
                exists: false,
                path: configPath,
                config: {},
                valid: true,
                validationErrors: []
            });
        }

        const content = readFileSync(configPath, 'utf-8');
        const config = JSON.parse(content);

        // Validate config against schema
        const validation = validateConfig(config);

        return json({
            exists: true,
            path: configPath,
            config,
            valid: validation.valid,
            validationErrors: validation.errors || []
        });
    } catch (error) {
        console.error('Error reading user config:', error);

        // Handle JSON parse errors as validation errors
        if (error instanceof SyntaxError) {
            return json({
                exists: true,
                path: configPath,
                config: {},
                valid: false,
                validationErrors: [{
                    message: `JSON parse error: ${error.message}`,
                    property: 'file',
                    stack: error.message
                }]
            });
        }

        return json({
            error: 'Failed to read user configuration',
            message: error.message
        }, { status: 500 });
    }
}

export async function PUT({ request }) {
    try {
        const { config } = await request.json();

        if (!config || typeof config !== 'object') {
            return json({
                error: 'Invalid configuration data',
                validationErrors: [{
                    message: 'Configuration must be an object',
                    property: 'config'
                }]
            }, { status: 400 });
        }

        // Validate config against schema BEFORE saving
        const validation = validateConfig(config);

        if (!validation.valid) {
            return json({
                error: 'Invalid configuration',
                validationErrors: validation.errors
            }, { status: 400 });
        }

        const configPath = getUserConfigPath();

        // Validate JSON can be stringified
        const jsonString = JSON.stringify(config, null, 4);

        // Write to file
        writeFileSync(configPath, jsonString, 'utf-8');

        return json({
            success: true,
            path: configPath,
            message: 'Configuration saved successfully'
        });
    } catch (error) {
        console.error('Error saving user config:', error);
        return json({
            error: 'Failed to save user configuration',
            message: error.message
        }, { status: 500 });
    }
}
