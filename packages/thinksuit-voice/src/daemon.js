// Voice daemon: owns the mic and drives the hands-free loop.
//
//   mic -> wake -> capture -> STT -> broker.run -> session.response -> TTS
//
// The loop is closed and keyless: wake and STT are local, the response is spoken
// via macOS `say`.

import { run as brokerRun, tail as brokerTail, interrupt as brokerInterrupt } from 'thinksuit-broker';
import { buildConfig } from 'thinksuit';
import { createPipeline } from './wake/pipeline.js';
import { createDetector } from './wake/detector.js';
import { createCapture, listInputDevices } from './audio/capture.js';
import { createEndpointer } from './audio/endpoint.js';
import { createCuePlayer, probeDurationMs } from './audio/cues.js';
import { SAMPLE_RATE } from './audio/constants.js';
import { createSTT } from './stt/index.js';
import { createTTS } from './tts/index.js';
import { loadVoiceConfig } from './config.js';
import {
    resolveMelModelPath,
    resolveEmbeddingModelPath,
    resolveClassifierPath
} from './paths.js';

// Resolve the configured input device. Prefer deviceName (stable across CoreAudio
// index shuffles): match it case-insensitively against the live input devices and
// use whatever id it currently has. Fail loudly if absent rather than silently
// binding the wrong mic.
function resolveInputDevice(wake) {
    if (!wake.deviceName) return { id: wake.deviceId, name: null };
    const needle = wake.deviceName.toLowerCase();
    const devices = listInputDevices();
    const match = devices.find((d) => d.name.toLowerCase().includes(needle));
    if (!match) {
        const list = devices.map((d) => `  - ${d.name} (id ${d.id})`).join('\n');
        throw new Error(
            `no input device matching name "${wake.deviceName}". Available input devices:\n${list}`
        );
    }
    return match;
}

export async function createVoiceDaemon(overrides = {}) {
    // Run config defaults come from the shared thinksuit config; the broker fills
    // provider credentials from its own env, so the daemon carries no secrets.
    const base = buildConfig();
    const config = loadVoiceConfig(base.voice, overrides);
    console.log(
        `capture: startTimeout=${config.capture.startTimeoutMs}ms silence=${config.capture.silenceMs}ms ` +
            `max=${config.capture.maxMs}ms rmsThreshold=${config.capture.rmsThreshold}; ` +
            `cues ${config.cues.enabled ? 'on' : 'off'}`
    );

    const pipeline = await createPipeline({
        melPath: resolveMelModelPath(),
        embeddingPath: resolveEmbeddingModelPath(),
        classifierPath: config.wake.classifierPath || resolveClassifierPath(config.wake.phrase)
    });

    const stt = createSTT(config.stt);
    const tts = createTTS(config.tts);
    const cues = createCuePlayer(config.cues);

    // Probe the start cue's real length once so capture trims exactly the beep
    // (cue duration + a small latency margin) instead of guessing.
    const cueMarginMs = config.capture.cueTrimMarginMs;
    let startCueMs = 0;
    if (config.cues.enabled && config.cues.start) {
        const d = await probeDurationMs(config.cues.start);
        startCueMs = (d ?? 600) + cueMarginMs;
        console.log(
            `start cue ${config.cues.start}: duration=${d ?? 'unknown→600'}ms, trim floor=${startCueMs}ms (margin ${cueMarginMs}ms)`
        );
    }

    let lastSessionId = null;
    let turnActive = false; // a broker turn is in flight (for re-wake interrupt)

    // 'listening' = wake detection; 'capturing' = recording an utterance. Capture
    // is continuous from wake (no deaf window); the beep is removed by the
    // endpointer's cue floor, not by dropping frames.
    let mode = 'listening';
    let endpointer = null;

    async function runTurn(input) {
        const turn = {
            modulesPackage: base.modulesPackage,
            provider: base.provider,
            model: base.model,
            providerConfig: base.providerConfig,
            cwd: base.cwd,
            mcpServers: base.mcpServers,
            allowedTools: base.allowedTools,
            allowedDirectories: base.allowedDirectories,
            policy: base.policy,
            autoApproveTools: true,
            input,
            sessionId: lastSessionId || undefined
        };
        turnActive = true;
        cues.startLoop('working'); // gentle "agent is working" loop until response
        let sessionId, from;
        try {
            ({ sessionId, from } = await brokerRun(turn));
        } catch (err) {
            turnActive = false;
            cues.stopLoop();
            throw err;
        }
        lastSessionId = sessionId;

        let closed = false;
        const stream = brokerTail(
            sessionId,
            (ev) => {
                const name = ev.event || ev.type;
                if (name === 'session.response') {
                    cues.stopLoop();
                    const text = ev.data?.response;
                    console.log(`response: ${text}`);
                    if (text) tts.speak(text).catch((e) => console.error(`tts failed: ${e.message}`));
                }
                if (
                    name === 'session.turn.complete' ||
                    name === 'session.interrupted' ||
                    name === 'broker.worker.exited'
                ) {
                    closed = true;
                    turnActive = false;
                    cues.stopLoop();
                    stream.close();
                }
            },
            { from, onError: (e) => !closed && console.error('tail error:', e.message) }
        );
    }

    async function onUtterance(audio) {
        try {
            const input = (await stt.transcribe(audio)).trim();
            if (!input) {
                console.log('(no speech recognized)');
                return;
            }
            console.log(`heard: ${input}`);
            await runTurn(input);
        } catch (err) {
            cues.stopLoop();
            console.error(`turn failed: ${err.message}`);
            cues.play('error');
        }
    }

    async function onWake({ confidence }) {
        if (mode !== 'listening') return;
        // Flip to 'capturing' synchronously so capture is continuous from this
        // instant (no deaf window) and no re-entrant wake fires.
        mode = 'capturing';
        console.log(`wake (confidence=${confidence.toFixed(3)})`);

        // Begin recording now; the start cue plays concurrently and is removed by
        // the endpointer's cue floor (cue duration + margin), not by gating frames.
        endpointer = createEndpointer({ ...config.capture, cueMs: startCueMs });
        cues.play('start');

        // Stop any spoken response still playing; if a turn is in flight, interrupt
        // it via the broker (same path as the CLI's :interrupt). The next utterance
        // continues the same session. Capture proceeds regardless.
        tts.stop?.();
        cues.stopLoop();
        if (turnActive && lastSessionId) {
            try {
                await brokerInterrupt(lastSessionId);
            } catch (err) {
                console.error(`interrupt failed: ${err.message}`);
            }
            turnActive = false;
        }
    }

    const detector = createDetector({
        pipeline,
        threshold: config.wake.threshold,
        onWake
    });

    function onFrames(frames) {
        if (mode === 'capturing') {
            const { done, aborted } = endpointer.push(frames);
            if (!done) return;
            const audio = aborted ? null : endpointer.result();
            const s = endpointer.stats();
            endpointer = null;
            mode = 'listening';
            if (audio) {
                const keptMs = Math.round((audio.length / SAMPLE_RATE) * 1000);
                console.log(
                    `capture: cueFloor=${s.cueMs}ms onset=${s.onsetMs}ms windowStart=${s.windowStartMs}ms ` +
                        `captured=${s.capturedMs}ms kept=${keptMs}ms`
                );
                cues.play('end');
                onUtterance(audio);
            }
            return;
        }
        detector.push(frames);
    }

    const device = resolveInputDevice(config.wake);
    config.wake.deviceId = device.id;
    if (device.name) {
        console.log(`input device "${config.wake.deviceName}" resolved to ${device.name} (id ${device.id})`);
    }

    const capture = createCapture({
        deviceId: device.id,
        onFrames,
        onError: (err) => console.error('audio error:', err)
    });

    return {
        config,
        start() {
            // Load the STT model in the background so the first utterance is fast.
            stt.warmup?.().catch((e) => console.error(`stt warmup failed: ${e.message}`));
            capture.start();
        },
        stop() {
            capture.stop();
        }
    };
}
