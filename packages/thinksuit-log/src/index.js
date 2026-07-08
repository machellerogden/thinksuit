// thinksuit-log — the ThinkSuit service logging contract, emit side only.
// What lines ARE is defined here; what readers do with them (jq, pino-pretty,
// a UI) is the reader's business. A leaf package so every service — including
// other leaves like thinksuit-genai — can depend on it.
export { createServiceLogger } from './logger.js';
