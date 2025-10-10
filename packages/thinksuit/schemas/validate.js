import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

import { Validator } from 'jsonschema';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load schemas
const factsSchema = JSON.parse(readFileSync(join(__dirname, 'facts.v1.json'), 'utf-8'));

const planSchema = JSON.parse(readFileSync(join(__dirname, 'plan.v1.json'), 'utf-8'));

const configSchema = JSON.parse(readFileSync(join(__dirname, 'config.v1.json'), 'utf-8'));

// Create validator instance
const validator = new Validator();

/**
 * Validates a fact or array of facts against the facts.v1 schema
 * @param {Object|Array} facts - Single fact object or array of facts
 * @returns {Object} Validation result with { valid: boolean, errors?: Array }
 */
export function validateFacts(facts) {
    // Handle array of facts
    if (Array.isArray(facts)) {
        const errors = [];

        for (let i = 0; i < facts.length; i++) {
            const result = validator.validate(facts[i], factsSchema);
            if (!result.valid) {
                errors.push({
                    index: i,
                    fact: facts[i],
                    message: result.errors[0].message,
                    property: result.errors[0].property,
                    stack: result.errors[0].stack
                });
            }
        }

        if (errors.length > 0) {
            return { valid: false, errors };
        }

        return { valid: true };
    }

    // Handle single fact
    const result = validator.validate(facts, factsSchema);

    if (result.valid) {
        return { valid: true };
    }

    return {
        valid: false,
        errors: result.errors.map((err) => ({
            message: err.message,
            property: err.property,
            stack: err.stack,
            schema: err.schema,
            instance: err.instance
        }))
    };
}

/**
 * Validates a plan against the plan.v1 schema
 * @param {Object} plan - Plan object to validate
 * @returns {Object} Validation result with { valid: boolean, errors?: Array }
 */
export function validatePlan(plan) {
    const result = validator.validate(plan, planSchema);

    if (result.valid) {
        return { valid: true };
    }

    return {
        valid: false,
        errors: result.errors.map((err) => ({
            message: err.message,
            property: err.property,
            stack: err.stack,
            schema: err.schema,
            instance: err.instance
        }))
    };
}

/**
 * Helper to format validation errors for logging
 * @param {Object} validationResult - Result from validateFacts or validatePlan
 * @returns {string} Formatted error message
 */
export function formatValidationErrors(validationResult) {
    if (validationResult.valid) {
        return 'Valid';
    }

    const errors = validationResult.errors;
    const lines = ['Validation failed:'];

    for (const error of errors) {
        if (error.index !== undefined) {
            lines.push(`  [${error.index}] ${error.message}`);
        } else {
            lines.push(`  ${error.stack || error.message}`);
        }
    }

    return lines.join('\n');
}

/**
 * Strict validation that throws on invalid data
 * @param {Object|Array} facts - Facts to validate
 * @throws {Error} If validation fails
 */
export function assertValidFacts(facts) {
    const result = validateFacts(facts);
    if (!result.valid) {
        throw new Error(`Invalid facts: ${formatValidationErrors(result)}`);
    }
    return facts;
}

/**
 * Strict validation that throws on invalid data
 * @param {Object} plan - Plan to validate
 * @throws {Error} If validation fails
 */
export function assertValidPlan(plan) {
    const result = validatePlan(plan);
    if (!result.valid) {
        throw new Error(`Invalid plan: ${formatValidationErrors(result)}`);
    }
    return plan;
}

/**
 * Validates a user config object against the config.v1 schema
 * @param {Object} config - User config object to validate
 * @returns {Object} Validation result with { valid: boolean, errors?: Array }
 */
export function validateConfig(config) {
    const result = validator.validate(config, configSchema);

    if (result.valid) {
        return { valid: true };
    }

    return {
        valid: false,
        errors: result.errors.map((err) => ({
            message: err.message,
            property: err.property,
            stack: err.stack,
            schema: err.schema,
            instance: err.instance
        }))
    };
}

/**
 * Strict validation that throws on invalid data
 * @param {Object} config - Config to validate
 * @throws {Error} If validation fails
 */
export function assertValidConfig(config) {
    const result = validateConfig(config);
    if (!result.valid) {
        throw new Error(`Invalid config: ${formatValidationErrors(result)}`);
    }
    return config;
}
