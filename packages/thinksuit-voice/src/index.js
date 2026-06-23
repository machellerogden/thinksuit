// thinksuit-voice — hands-free voice front door for ThinkSuit.
// Public API: the daemon factory and the building blocks it composes.

export { createVoiceDaemon } from './daemon.js';
export { createPipeline } from './wake/pipeline.js';
export { createDetector } from './wake/detector.js';
export { createCapture, listInputDevices } from './audio/capture.js';
export { loadVoiceConfig } from './config.js';
