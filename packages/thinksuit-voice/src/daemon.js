// Voice daemon: owns the mic and drives the hands-free loop.
//
//   mic -> wake -> capture -> STT -> broker.run -> session.response -> TTS
//
// The loop is closed and keyless: wake and STT are local, the response is spoken
// via macOS `say`. A control socket (control/server.js) lets the CLI and console
// steer a running daemon (mic on/off, interrupt) and read its status.

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
import { startControlServer } from './control/server.js';
import { resolveMelModelPath, resolveEmbeddingModelPath } from './paths.js';
import { resolveActiveTriggers } from './wakewords/store.js';
import { sessionForAction } from './session.js';

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

    // Select the active triggers from the library: an explicit config name pins
    // one, else every enabled trigger. Each trigger owns its model + threshold,
    // and the daemon listens for all of them at once.
    const triggers = resolveActiveTriggers(config.wake);
    console.log(
        `wake triggers: ${triggers
            .map((t) => `${t.name}→${t.binding} (threshold ${t.threshold})`)
            .join(', ')}`
    );

    const pipeline = await createPipeline({
        melPath: resolveMelModelPath(),
        embeddingPath: resolveEmbeddingModelPath(),
        heads: triggers.map((t) => ({ name: t.name, classifierPath: t.classifierPath }))
    });
    const thresholds = Object.fromEntries(triggers.map((t) => [t.name, t.threshold]));
    // name → session action; what each fired trigger does (converse/new/prior).
    const bindings = Object.fromEntries(triggers.map((t) => [t.name, t.binding]));

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

    // Mutable daemon state — also the source for the control API's /status.
    // 'listening' = wake detection; 'capturing' = recording an utterance. Capture
    // is continuous from wake (no deaf window); the beep is removed by the
    // endpointer's cue floor, not by dropping frames.
    const state = {
        micOn: false,
        mode: 'listening',
        turnActive: false, // a broker turn is in flight (for re-wake interrupt)
        lastSessionId: null, // the current session pointer
        pendingAction: 'converse', // action of the trigger that woke us, applied at turn time
        device: null,
        lastWake: null, // { confidence, at }
        lastError: null, // { message, at }
        startedAt: null
    };
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
            sessionId: state.lastSessionId || undefined
        };
        state.turnActive = true;
        cues.startLoop('working'); // gentle "agent is working" loop until response
        let sessionId, from;
        try {
            ({ sessionId, from } = await brokerRun(turn));
        } catch (err) {
            state.turnActive = false;
            cues.stopLoop();
            throw err;
        }
        state.lastSessionId = sessionId;

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
                    state.turnActive = false;
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

            // Apply the woken trigger's action at the turn boundary (not at wake),
            // so an aborted/silent capture doesn't consume a `new`. This repoints
            // the session the turn targets; runTurn reads lastSessionId.
            const action = state.pendingAction || 'converse';
            state.pendingAction = 'converse';
            state.lastSessionId = sessionForAction(action, state.lastSessionId);
            if (action !== 'converse') console.log(`session action: ${action}`);

            await runTurn(input);
        } catch (err) {
            cues.stopLoop();
            state.lastError = { message: err.message, at: Date.now() };
            console.error(`turn failed: ${err.message}`);
            cues.play('error');
        }
    }

    // Halt current activity: stop any spoken response and the working-cue loop,
    // and cancel the in-flight broker turn (same path as the CLI's :interrupt).
    // No-op-safe: returns { interrupted:false } when nothing is in flight. Called
    // both by re-wake (onWake) and the control API.
    async function interruptTurn() {
        tts.stop?.();
        cues.stopLoop();
        if (!state.turnActive || !state.lastSessionId) return { interrupted: false };
        try {
            await brokerInterrupt(state.lastSessionId);
        } catch (err) {
            console.error(`interrupt failed: ${err.message}`);
        }
        state.turnActive = false;
        return { interrupted: true };
    }

    async function onWake({ name, confidence }) {
        if (state.mode !== 'listening') return;
        // Flip to 'capturing' synchronously so capture is continuous from this
        // instant (no deaf window) and no re-entrant wake fires.
        state.mode = 'capturing';
        // Stash which action this trigger fires; it's applied at the turn boundary.
        const action = bindings[name] || 'converse';
        state.pendingAction = action;
        state.lastWake = { name, action, confidence, at: Date.now() };
        console.log(`wake: ${name}→${action} (confidence=${confidence.toFixed(3)})`);

        // Begin recording now; the start cue plays concurrently and is removed by
        // the endpointer's cue floor (cue duration + margin), not by gating frames.
        endpointer = createEndpointer({ ...config.capture, cueMs: startCueMs });
        cues.play('start');

        // Stop a spoken response still playing and interrupt any in-flight turn;
        // the next utterance continues the same session. Capture proceeds regardless.
        await interruptTurn();
    }

    const detector = createDetector({
        pipeline,
        thresholds,
        onWake
    });

    function onFrames(frames) {
        if (state.mode === 'capturing') {
            const { done, aborted } = endpointer.push(frames);
            if (!done) return;
            const audio = aborted ? null : endpointer.result();
            const s = endpointer.stats();
            endpointer = null;
            state.mode = 'listening';
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
    state.device = { id: device.id, name: device.name || config.wake.deviceName || null };
    if (device.name) {
        console.log(`input device "${config.wake.deviceName}" resolved to ${device.name} (id ${device.id})`);
    }

    // capture.stop() destroys the PortAudio stream (ai.quit), so re-arming after a
    // mic-off must build a fresh capture rather than re-start the dead instance.
    let capture = null;
    function buildCapture() {
        return createCapture({
            deviceId: device.id,
            onFrames,
            onError: (err) => console.error('audio error:', err)
        });
    }

    // Soft mic toggle: the daemon stays warm (control server, models, broker
    // connection all live); only the audio device is released / re-acquired. A
    // mic-off mid-capture drops the partial utterance — a mic-off always wins.
    function micOn() {
        if (state.micOn) return;
        capture = buildCapture();
        capture.start();
        state.micOn = true;
        console.log('mic on (device acquired)');
    }
    function micOff() {
        if (!state.micOn) return;
        capture?.stop();
        capture = null;
        endpointer = null;
        state.mode = 'listening';
        state.micOn = false;
        console.log('mic off (device released)');
    }

    function getStatus() {
        return {
            micOn: state.micOn,
            mode: state.mode,
            turnActive: state.turnActive,
            lastSessionId: state.lastSessionId,
            device: state.device,
            lastWake: state.lastWake,
            lastError: state.lastError,
            uptimeMs: state.startedAt ? Date.now() - state.startedAt : 0,
            capture: config.capture,
            cues: config.cues
        };
    }

    let control = null;

    return {
        config,
        async start() {
            // Load the STT model in the background so the first utterance is fast.
            stt.warmup?.().catch((e) => console.error(`stt warmup failed: ${e.message}`));
            state.startedAt = Date.now();
            micOn();
            control = await startControlServer({
                getStatus,
                micOn,
                micOff,
                interrupt: interruptTurn
            });
        },
        async stop() {
            micOff();
            await control?.close();
            control = null;
        }
    };
}
