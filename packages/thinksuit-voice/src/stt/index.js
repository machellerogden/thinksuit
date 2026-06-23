// STT provider selection. One module per backend, chosen by config — mirrors
// thinksuit/engine/providers. Add a backend = add a module here.

import { createWhisperProvider } from './whisper.js';

const PROVIDERS = {
    whisper: createWhisperProvider
};

export function createSTT({ provider = 'whisper', ...config } = {}) {
    const factory = PROVIDERS[provider];
    if (!factory) throw new Error(`unknown STT provider: ${provider}`);
    return factory(config);
}
