import planSchema from './plan.v1.json' with { type: 'json' };
import userConfigSchema from './userConfig.v1.json' with { type: 'json' };
import turnRequestSchema from './turnRequest.v1.json' with { type: 'json' };
import turnResultSchema from './turnResult.v1.json' with { type: 'json' };

import { Validator } from 'jsonschema';

// Create validator instance
const validator = new Validator();

// Map a jsonschema result into our { valid, errors } shape.
function toValidationResult(result) {
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
 * @param {Object} validationResult - Result from validatePlan or another validator
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
 * Validates a user config file object against the userConfig.v1 schema
 * @param {Object} config - User config object to validate
 * @returns {Object} Validation result with { valid: boolean, errors?: Array }
 */
export function validateUserConfig(config) {
    return toValidationResult(validator.validate(config, userConfigSchema));
}

/**
 * Strict validation that throws on invalid data
 * @param {Object} config - User config to validate
 * @throws {Error} If validation fails
 */
export function assertValidUserConfig(config) {
    const result = validateUserConfig(config);
    if (!result.valid) {
        throw new Error(`Invalid user config: ${formatValidationErrors(result)}`);
    }
    return config;
}

/**
 * Validates a turn request (the IN contract) against the turnRequest.v1 schema
 * @param {Object} request - Turn request to validate
 * @returns {Object} Validation result with { valid: boolean, errors?: Array }
 */
export function validateTurnRequest(request) {
    return toValidationResult(validator.validate(request, turnRequestSchema));
}

/**
 * Strict validation that throws on an invalid turn request
 * @param {Object} request - Turn request to validate
 * @throws {Error} If validation fails
 */
export function assertValidTurnRequest(request) {
    const result = validateTurnRequest(request);
    if (!result.valid) {
        throw new Error(`Invalid turn request: ${formatValidationErrors(result)}`);
    }
    return request;
}

/**
 * Validates a turn result (the OUT contract) against the turnResult.v1 schema
 * @param {Object} result - Turn result to validate
 * @returns {Object} Validation result with { valid: boolean, errors?: Array }
 */
export function validateTurnResult(result) {
    return toValidationResult(validator.validate(result, turnResultSchema));
}

/**
 * Strict validation that throws on an invalid turn result
 * @param {Object} result - Turn result to validate
 * @throws {Error} If validation fails
 */
export function assertValidTurnResult(result) {
    const validation = validateTurnResult(result);
    if (!validation.valid) {
        throw new Error(`Invalid turn result: ${formatValidationErrors(validation)}`);
    }
    return result;
}
