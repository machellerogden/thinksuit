// Voice configuration: backend selection only, never secrets. Layered
// defaults < thinksuit config (`voice` namespace) < explicit overrides.

const DEFAULTS = {
    designation: 'voice', // which kernel designation the daemon follows (resume/repoint)
    input: {
        deviceName: undefined, // case-insensitive substring; resolved to an id at startup
        deviceId: -1 // -1 = system default
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
    tts: { provider: 'say' },
    // Endpointing speech/silence detector. `rms` threshold falls back to
    // capture.rmsThreshold (see daemon wiring) during the config migration.
    detector: { provider: 'silero', rms: {}, silero: { threshold: 0.5 } }
};

function mergeSection(name, ...sources) {
    return Object.assign({}, DEFAULTS[name], ...sources.map((s) => s?.[name] || {}));
}

export function loadVoiceConfig(fileVoice = {}, overrides = {}) {
    return {
        designation: overrides.designation ?? fileVoice.designation ?? DEFAULTS.designation,
        input: mergeSection('input', fileVoice, overrides),
        capture: mergeSection('capture', fileVoice, overrides),
        cues: mergeSection('cues', fileVoice, overrides),
        stt: mergeSection('stt', fileVoice, overrides),
        tts: mergeSection('tts', fileVoice, overrides),
        detector: mergeSection('detector', fileVoice, overrides)
    };
}
