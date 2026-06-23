// Voice daemon: owns the mic and drives the hands-free loop.
//
//   mic -> wake -> capture -> STT -> broker.run -> session.response -> TTS
//
// The loop is closed and keyless: wake and STT are local, the response is spoken
// via macOS `say`.

import { run as brokerRun, tail as brokerTail } from 'thinksuit-broker';
import { buildConfig } from 'thinksuit';
import { createPipeline } from './wake/pipeline.js';
import { createDetector } from './wake/detector.js';
import { createCapture } from './audio/capture.js';
import { createEndpointer } from './audio/endpoint.js';
import { createSTT } from './stt/index.js';
import { createTTS } from './tts/index.js';
import { loadVoiceConfig } from './config.js';
import {
    resolveMelModelPath,
    resolveEmbeddingModelPath,
    resolveClassifierPath
} from './paths.js';

export async function createVoiceDaemon(overrides = {}) {
    const config = loadVoiceConfig(overrides);

    const pipeline = await createPipeline({
        melPath: resolveMelModelPath(),
        embeddingPath: resolveEmbeddingModelPath(),
        classifierPath: config.wake.classifierPath || resolveClassifierPath(config.wake.phrase)
    });

    const stt = createSTT(config.stt);
    const tts = createTTS(config.tts);

    // Run config defaults come from the shared thinksuit config; the broker fills
    // provider credentials from its own env, so the daemon carries no secrets.
    const base = buildConfig();
    let lastSessionId = null;

    // 'listening' = wake detection; 'capturing' = recording an utterance.
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
        const { sessionId, from } = await brokerRun(turn);
        lastSessionId = sessionId;

        let closed = false;
        const stream = brokerTail(
            sessionId,
            (ev) => {
                const name = ev.event || ev.type;
                if (name === 'session.response') {
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
            console.error(`turn failed: ${err.message}`);
        }
    }

    function onWake({ confidence }) {
        if (mode !== 'listening') return;
        console.log(`wake (confidence=${confidence.toFixed(3)})`);
        mode = 'capturing';
        endpointer = createEndpointer();
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
            endpointer = null;
            mode = 'listening';
            if (audio) onUtterance(audio);
            return;
        }
        detector.push(frames);
    }

    const capture = createCapture({
        deviceId: config.wake.deviceId,
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
