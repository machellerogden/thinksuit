// Voice configuration: backend selection only, never secrets. Layered
// defaults < thinksuit config (`voice` namespace) < explicit overrides.

const DEFAULTS = {
    wake: {
        phrase: 'hey_thinksuit',
        threshold: 0.7,
        deviceId: -1
    },
    capture: {
        rmsThreshold: 400,
        silenceMs: 700,
        startTimeoutMs: 3000,
        maxMs: 300000, // 5 min — generous; the old 10s hardcoded cap cut people off
        cueTrimMarginMs: 120, // added to the cue's measured duration when trimming the beep
        guardLeadMs: 180 // silence kept before the detected onset so the attack isn't clipped
    },
    cues: {
        enabled: true,
        start: '/System/Library/Sounds/Tink.aiff',
        end: '/System/Library/Sounds/Pop.aiff',
        error: '/System/Library/Sounds/Funk.aiff',
        working: '/System/Library/Sounds/Purr.aiff' // gentle loop while the turn runs
    },
    stt: { provider: 'whisper' },
    tts: { provider: 'say' }
};

function mergeSection(name, ...sources) {
    return Object.assign({}, DEFAULTS[name], ...sources.map((s) => s?.[name] || {}));
}

export function loadVoiceConfig(fileVoice = {}, overrides = {}) {
    return {
        wake: mergeSection('wake', fileVoice, overrides),
        capture: mergeSection('capture', fileVoice, overrides),
        cues: mergeSection('cues', fileVoice, overrides),
        stt: mergeSection('stt', fileVoice, overrides),
        tts: mergeSection('tts', fileVoice, overrides)
    };
}
