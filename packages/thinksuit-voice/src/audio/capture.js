// Microphone capture via naudiodon2 (PortAudio). The daemon owns the mic; this
// is the single source of the live PCM stream. Emits Int16Array frames (mono,
// 16 kHz) to onFrames.

import naudiodon from 'naudiodon2';
import { SAMPLE_RATE } from './constants.js';

export { listInputDevices } from './devices.js';

const DEFAULT_DEVICE_ID = -1; // system default input

export function createCapture({ deviceId = DEFAULT_DEVICE_ID, onFrames, onError } = {}) {
    const ai = new naudiodon.AudioIO({
        inOptions: {
            channelCount: 1,
            sampleFormat: naudiodon.SampleFormat16Bit,
            sampleRate: SAMPLE_RATE,
            deviceId,
            closeOnError: false
        }
    });

    ai.on('data', (buf) => {
        const frames = new Int16Array(buf.buffer, buf.byteOffset, buf.byteLength / 2);
        if (onFrames) onFrames(frames);
    });
    if (onError) ai.on('error', onError);

    return {
        start: () => ai.start(),
        stop: () => ai.quit()
    };
}
