// TTS provider selection, one module per backend (mirrors
// thinksuit/engine/providers). `say` is the keyless stepping stone; a cloud
// provider will be added as its own module.

import { createSayProvider } from './say.js';

const PROVIDERS = {
    say: createSayProvider
};

export function createTTS({ provider = 'say', ...config } = {}) {
    const factory = PROVIDERS[provider];
    if (!factory) throw new Error(`unknown TTS provider: ${provider}`);
    return factory(config);
}
