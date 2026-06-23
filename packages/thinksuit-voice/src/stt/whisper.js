// Local Whisper STT via transformers.js (ONNX, keyless). transcribe(audio) ->
// Promise<string>, where audio is an Int16Array (mono, 16 kHz) from the
// endpointer. The model loads lazily on first use and is reused after that.

import { pipeline } from '@huggingface/transformers';

const DEFAULT_MODEL = 'Xenova/whisper-base.en';

function toFloat32(audio) {
    if (audio instanceof Float32Array) return audio;
    const f = new Float32Array(audio.length);
    for (let i = 0; i < audio.length; i++) f[i] = audio[i] / 32768.0;
    return f;
}

export function createWhisperProvider({ model = DEFAULT_MODEL } = {}) {
    let asr = null;

    async function ensure() {
        if (!asr) asr = await pipeline('automatic-speech-recognition', model);
        return asr;
    }

    async function transcribe(audio) {
        const transcriber = await ensure();
        const { text } = await transcriber(toFloat32(audio));
        return text.trim();
    }

    return { transcribe, warmup: ensure };
}
