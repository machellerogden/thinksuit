// Filesystem locations. Two model kinds, two homes: the frozen frontend (mel +
// embedding) ships as committed package assets under models/ (same files training
// uses, so runtime features match training); the trained classifier is personal,
// so it lives in user data and never in the repo.

import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const PACKAGE_ROOT = join(__dirname, '..');
const MODELS_DIR = join(PACKAGE_ROOT, 'models');

export function resolveVoiceHome() {
    return process.env.THINKSUIT_VOICE_HOME || join(homedir(), '.thinksuit', 'voice');
}

// Unix socket the running daemon listens on for control/status (mic on/off,
// interrupt, status). Mirrors the broker's socket convention so the CLI and the
// console connect the same way.
export function resolveControlSocketPath() {
    return process.env.THINKSUIT_VOICE_SOCK || join(homedir(), '.thinksuit', 'voice.sock');
}

export function resolveMelModelPath() {
    return join(MODELS_DIR, 'melspectrogram.onnx');
}

export function resolveEmbeddingModelPath() {
    return join(MODELS_DIR, 'embedding_model.onnx');
}

export function resolveSileroVadModelPath() {
    return join(MODELS_DIR, 'silero_vad.onnx');
}

// The wakeword library lives under the voice home. Each wakeword is a
// self-contained bundle (manifest + samples + model versions + run logs).
export function resolveWakewordsDir() {
    return join(resolveVoiceHome(), 'wakewords');
}

export function resolveWakewordPaths(name) {
    const dir = join(resolveWakewordsDir(), name);
    return {
        dir,
        manifest: join(dir, 'manifest.json'),
        samples: join(dir, 'samples'),
        positiveSamples: join(dir, 'samples', 'positive'),
        negativeSamples: join(dir, 'samples', 'negative'),
        models: join(dir, 'models'),
        runs: join(dir, 'runs')
    };
}
