// Browser-side enrollment capture. Owns getUserMedia + an AudioWorklet, exposes
// start()/stop() around a clip, and reports a live level for a meter. stop()
// returns 16 kHz mono Int16 PCM — the exact format the wakeword store + model
// expect — resampling from the actual context rate if the browser ignored our
// 16 kHz request (Safari).
//
// Browser-only: import this lazily (inside a handler/onMount), never at module
// top level, so SSR doesn't touch AudioContext.

const TARGET_RATE = 16000;

export async function createEnrollRecorder({ onLevel } = {}) {
    const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
            channelCount: 1,
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false
        }
    });

    const ctx = new AudioContext({ sampleRate: TARGET_RATE });
    await ctx.audioWorklet.addModule('/audio/enroll-worklet.js');

    const source = ctx.createMediaStreamSource(stream);
    const node = new AudioWorkletNode(ctx, 'enroll-processor');

    let recording = false;
    let chunks = [];

    node.port.onmessage = (e) => {
        const frame = e.data; // Float32Array, one render block
        if (onLevel) {
            let peak = 0;
            for (let i = 0; i < frame.length; i++) {
                const v = Math.abs(frame[i]);
                if (v > peak) peak = v;
            }
            onLevel(peak);
        }
        if (recording) chunks.push(frame);
    };

    // Pull the graph through a muted sink so the worklet runs without echoing the
    // mic to the speakers.
    const sink = ctx.createGain();
    sink.gain.value = 0;
    source.connect(node);
    node.connect(sink);
    sink.connect(ctx.destination);

    return {
        async resume() {
            if (ctx.state !== 'running') await ctx.resume();
        },
        start() {
            chunks = [];
            recording = true;
        },
        stop() {
            recording = false;
            const float = concatFloat(chunks);
            chunks = [];
            const at16k = resampleLinear(float, ctx.sampleRate, TARGET_RATE);
            return floatToInt16(at16k);
        },
        // Play back a captured Int16 clip through the same context. Web Audio
        // resamples the 16 kHz buffer to the context rate on playback. Returns the
        // source node so the caller can react to `onended`.
        play(int16) {
            const buffer = ctx.createBuffer(1, int16.length, TARGET_RATE);
            const ch = buffer.getChannelData(0);
            for (let i = 0; i < int16.length; i++) ch[i] = int16[i] / 32768;
            const src = ctx.createBufferSource();
            src.buffer = buffer;
            src.connect(ctx.destination);
            src.start();
            return src;
        },
        close() {
            recording = false;
            stream.getTracks().forEach((t) => t.stop());
            ctx.close();
        }
    };
}

function concatFloat(chunks) {
    let n = 0;
    for (const c of chunks) n += c.length;
    const out = new Float32Array(n);
    let off = 0;
    for (const c of chunks) {
        out.set(c, off);
        off += c.length;
    }
    return out;
}

function resampleLinear(input, fromRate, toRate) {
    if (fromRate === toRate || input.length === 0) return input;
    const ratio = fromRate / toRate;
    const outLen = Math.round(input.length / ratio);
    const out = new Float32Array(outLen);
    for (let i = 0; i < outLen; i++) {
        const pos = i * ratio;
        const i0 = Math.floor(pos);
        const i1 = Math.min(i0 + 1, input.length - 1);
        const t = pos - i0;
        out[i] = input[i0] * (1 - t) + input[i1] * t;
    }
    return out;
}

function floatToInt16(float) {
    const out = new Int16Array(float.length);
    for (let i = 0; i < float.length; i++) {
        const s = Math.max(-1, Math.min(1, float[i]));
        out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return out;
}
