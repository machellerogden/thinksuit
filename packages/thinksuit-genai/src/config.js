import { resolveSecret } from './secrets.js';

/**
 * Assemble the full providerConfig from the environment and the secrets
 * keyring. This is the single credential table for every ThinkSuit process —
 * it replaces the per-process copies that used to live in the engine's
 * config assembly and the broker worker.
 *
 * Secrets resolve by name via resolveSecret (environment first, then
 * ~/.thinksuit/secrets.env). Read-once semantics: a long-lived process picks
 * up rotated keys on restart.
 */
export function buildProviderConfig() {
    return {
        openai: {
            apiKey: resolveSecret('OPENAI_API_KEY')
        },
        anthropic: {
            apiKey: resolveSecret('ANTHROPIC_API_KEY')
        },
        google: {
            projectId: process.env.GOOGLE_CLOUD_PROJECT,
            location: process.env.GOOGLE_CLOUD_LOCATION || 'global'
        },
        huggingFace: {
            apiKey: resolveSecret('HF_TOKEN')
        },
        onnx: {
            dtype: process.env.ONNX_DTYPE || 'q4'
        }
    };
}
