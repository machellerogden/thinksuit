// Speech/silence detector selection (endpointing). One module per backend, chosen
// by config — mirrors stt/ and tts/. Async because a neural detector (silero) loads
// an ONNX model. Distinct from wake/detector.js, which scores wakewords — a
// different concept. Config shape is per-provider: { provider, rms:{...}, silero:{...} }.

import { createRmsDetector } from './rms.js';
import { createSileroDetector } from './silero.js';

const PROVIDERS = {
    rms: createRmsDetector,
    silero: createSileroDetector
};

export async function createSpeechDetector(config = {}) {
    const { provider = 'silero' } = config;
    const factory = PROVIDERS[provider];
    if (!factory) throw new Error(`unknown detector provider: ${provider}`);
    return factory(config[provider] || {});
}
