import { resolveEnv } from './env.js';

/**
 * Assemble the full providerConfig from ThinkSuit's environment. This is the
 * single provider-configuration table for every ThinkSuit process — it
 * replaces the per-process copies that used to live in the engine's config
 * assembly and the broker worker.
 *
 * Every value resolves by name via resolveEnv (process environment first,
 * then ~/.thinksuit/.env) — credentials and plain settings alike, so the env
 * file honors everything the error messages name. Read-once semantics: a
 * long-lived process picks up changes on restart.
 */
export function buildProviderConfig() {
    return {
        openai: {
            apiKey: resolveEnv('OPENAI_API_KEY')
        },
        anthropic: {
            apiKey: resolveEnv('ANTHROPIC_API_KEY')
        },
        google: {
            projectId: resolveEnv('GOOGLE_CLOUD_PROJECT'),
            location: resolveEnv('GOOGLE_CLOUD_LOCATION') || 'global'
        },
        huggingFace: {
            apiKey: resolveEnv('HF_TOKEN')
        },
        onnx: {
            dtype: resolveEnv('ONNX_DTYPE') || 'q4'
        }
    };
}
