// Voice configuration: backend selection only, never secrets. Returns defaults
// for now; loading from the thinksuit config comes later.

const DEFAULTS = {
    wake: {
        phrase: 'hey_thinksuit',
        threshold: 0.7,
        deviceId: -1
    },
    stt: { provider: 'whisper' },
    tts: { provider: 'say' }
};

export function loadVoiceConfig(overrides = {}) {
    // Provisional dev override until config loading lands; device belongs in config.
    const envDevice = process.env.THINKSUIT_VOICE_DEVICE;
    const wake = { ...DEFAULTS.wake, ...(overrides.wake || {}) };
    if (envDevice !== undefined && overrides.wake?.deviceId === undefined) {
        wake.deviceId = parseInt(envDevice, 10);
    }
    return {
        ...DEFAULTS,
        ...overrides,
        wake,
        stt: { ...DEFAULTS.stt, ...(overrides.stt || {}) },
        tts: { ...DEFAULTS.tts, ...(overrides.tts || {}) }
    };
}
