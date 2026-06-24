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

// Trained wake-word classifier for a given phrase slug (e.g. "hey_thinksuit").
export function resolveClassifierPath(phraseSlug) {
    return join(resolveVoiceHome(), 'models', `${phraseSlug}.onnx`);
}
