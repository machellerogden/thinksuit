# thinksuit-voice — Groundwork

Status: **snapshot** — evidence, not intent, not contract. Re-verify, don't trust.

Captured 2026-07-07 against branch `20260619` @ `127a610`.

## How to read this

- This is the **evidence pole** for [intent.md](intent.md): what is *actually
  here* right now — current code-state, prior-art observations, and probed facts.
- It is **not** intent (that's `intent.md`) and **not** a behavior contract (those
  are the specs beside this file).
- It is a **dated snapshot**. Code-state drifts. Every claim cites `file:line` or a
  command so a future reader can spot-check it in minutes. If a claim and the code
  disagree, the **code wins** and this file is stale — fix it, don't trust it.

---

## Current code-state (as built)

Paths relative to `packages/thinksuit-voice/`.

### Daemon / pipeline — `src/daemon.js`
- `createVoiceDaemon` (`:50`) owns the mic and runs the loop:
  `mic → wake → capture → STT → broker.run → session.response → TTS`.
- Single frame handler `onFrames` (`:258`) with two modes: `listening` → wake
  detector; `capturing` → endpointer.
- `onWake` (`:231`) flips `listening→capturing` **synchronously** (no deaf
  window); capture is continuous, the start beep is removed by the endpointer's
  cue floor, not by gating frames.
- `runTurn` (`:119`) builds the turn with `modality: 'voice'` and **sends no
  `providerConfig`** (`:126` comment) — the broker's per-turn worker resolves
  secrets; the long-lived daemon carries none.
- Designation: seeded from `getDesignation` at boot (`:110`), repointed after each
  turn via `brokerSetDesignation` (`:157`, broker is the single writer).
- Response path: `brokerTail` → `session.response` → `tts.speak` (`:163`–`:186`).
- Barge-in: `interruptTurn` (`:218`) = `tts.stop()` + `brokerInterrupt`.
- Soft mic toggle: `micOn`/`micOff` (`:301`–`:316`) release/re-acquire the device
  while the daemon stays warm (control server, models, broker conn all live).

### Wake detection — `src/wake/pipeline.js`, `src/wake/detector.js`
- **Multi-head is live.** `createPipeline({melPath, embeddingPath, heads})` loads
  the shared mel→embedding frontend once and one small classifier head per
  wakeword; `score(window) → {name: score}` (`pipeline.js`).
- `WINDOW_SAMPLES = 32000` (2 s → exactly 16 embeddings).
- `detector.js`: 80 ms hop (`HOP_SAMPLES = 1280`), debounce 2000 ms; `winner()`
  = highest head at/above its own threshold.
- **Phantom-wake fix**: on fire, the ring buffer is zeroed (`ring.fill(0)`, ~`:73`)
  so frozen wake audio can't re-fire during capture.

### Endpointing — `src/audio/endpoint.js` + `src/detect/`
> Updated 2026-07-07 (this line supersedes the pre-change snapshot): the speech/
> silence decision is now a **pluggable detector seam**. See `capture-substrate.md`.
- The endpointer keeps only the windowing (cue floor, guard lead `guardLeadMs` 180,
  onset refinement, trailing silence ≥ `silenceMs` default **700 ms**) and delegates
  the speech decision to an injected detector. `push(frame)` is now **async**,
  returns `{done, aborted}`, and consumes the detector's per-chunk `Decision[]`.
- **Detector registry** `src/detect/` (mirrors STT/TTS): `createSpeechDetector` →
  `{ rms, silero }`; default **silero** (neural VAD, ONNX via `onnxruntime-node`,
  model at `models/silero_vad.onnx`), `rms` the energy-threshold fallback. Decisions
  at 512-sample (32 ms) granularity; detector owns the chunk accumulator + state.
- Measured (`tools/endpoint-file.mjs`): in background noise (int16 RMS 700) `rms`
  never ends a turn (reads speech everywhere → runs to `maxMs`); `silero` ends
  correctly. Clean audio: both agree.

### STT / TTS — `src/stt/`, `src/tts/`
- Provider registries, one entry each: `stt/index.js` → `{ whisper }`,
  `tts/index.js` → `{ say }`. Selected by `config.stt.provider` / `config.tts.provider`.
- `stt/whisper.js`: transformers.js `Xenova/whisper-base.en` (ONNX, in-process,
  keyless); `transcribe(Int16Array) → string`; lazy-loads, warmed at daemon start.
- `tts/say.js`: macOS `say`, text via stdin; `stop()` cancels for barge-in.

### Session routing — `src/session.js`, `src/config.js`
- `session.js`: `ACTIONS = ['converse', 'new']` (`:13`); `sessionForAction` (`:20`)
  — `new → null` (fresh), else continue current.
- `config.js`: `voice` namespace, layered defaults < file < overrides
  (`loadVoiceConfig`, `:33`). Defaults: `rmsThreshold 400`, `silenceMs 700`,
  `startTimeoutMs 3000`, `maxMs 300000`, `designation 'voice'`, `stt: whisper`,
  `tts: say`.

### Control plane — `src/control/server.js`, `src/control/client.js`
- HTTP over a unix socket (`~/.thinksuit/voice.sock`): `GET /health`, `GET /status`,
  `POST /mic/on`, `POST /mic/off`, `POST /interrupt`.
- CLI: `bin/ctl.mjs` (`status`/`mic on|off`/`interrupt`).

### Wakeword library + CLI — `src/wakewords/store.js`, `src/wakewords/cli.js`
- Settings in user config under `voice.wakewords.<name>`; artifacts (samples,
  `.onnx` versions, run logs) on disk under the voice home.
- Lifecycle: `new` → enroll/record → train → `promote` → `enable`; `enable` is
  multi-active.
- `bind <name> <converse|new>` verb exists (`cli.js:40, 291`) — accepts **only**
  converse/new.

### Audio — `src/audio/capture.js`, `src/audio/cues.js`, `src/audio/constants.js`
- Capture: `naudiodon2` (PortAudio), Int16Array mono, `SAMPLE_RATE = 16000`.
- Cues: `afplay` one-shots + a "working" loop; `probeDurationMs` via `afinfo`.
  **No acoustic echo cancellation** — the daemon awaits the start cue before
  arming capture precisely because there is no AEC.

---

## Prior art observed — OpenWhispr (`/Applications/OpenWhispr.app`, 2026-07-07)

Snapshot of a running install; re-check with `ps` and `ls` of the bundle.

### Live process stack (only these three were running)
- `sherpa-onnx-ws-darwin-arm64` — ASR websocket server on **:6006**, model
  **Parakeet TDT 0.6b v3** (int8 encoder/decoder/joiner, from
  `~/.cache/openwhispr/parakeet-models/`).
- `qdrant-darwin-arm64` — vector store.
- `macos-globe-listener` — Globe/Fn hotkey (the live **push-to-talk** trigger).

### Bundled affordances (`Contents/Resources/bin/`, present, mostly not running)
- ASR: `sherpa-onnx-ws`, plus a `whisper-server` (ggml/metal libs) — ships both.
- `sherpa-onnx-diarize` + `llama-server` (libllama/libmtmd) + macOS helpers
  (`mic-listener`, `audio-tap`, `meeting-aec-helper`, `text-monitor`,
  `media-remote`, `fast-paste`).

### Detection models — present, **not operationalized as a standing layer**
In `bin/diarization-models/`: `silero_vad.onnx` (644 KB), pyannote
`sherpa-onnx-pyannote-segmentation-3-0/model.onnx`, `3dspeaker` CAM++ speaker
embedding. Consumed by the on-demand `sherpa-onnx-diarize` binary (not running).
Live speech boundaries come from the **Globe keypress**, not VAD.

---

## Silero VAD — probed contract (candidate for endpointing, not adopted)

Probed via our own `onnxruntime-node` against
`.../bin/diarization-models/silero_vad.onnx` (2026-07-07):
- Inputs `x`, `h`, `c`; outputs `prob`, `new_h`, `new_c` (classic stateful LSTM).
- `x` = float32 `[1, 512]` — **exactly 512 samples @ 16 kHz (32 ms)**, range [-1,1].
- `h`, `c` = `[2,1,64]` LSTM state, **carried across chunks**.
- `prob` = `[1,1]` speech probability; a silence chunk returned ~0.04.
- **Loads under `onnxruntime-node` with `['cpu']`** — the same runtime as
  `wake/pipeline.js`; no new dependency, no external process.

---

## Audit findings — legacy `../SPEC.md` vs code (2026-07-07)

Recorded as evidence; the legacy file is an unmaintained archive.

- **Verified matches:** broker-as-session-authority, mic-ownership boundary,
  whisper STT, `say` TTS, provider registries, "config holds selection never
  secrets," designation routing, no-AEC limitation, phantom-wake fix, `naudiodon2`
  capture, RMS endpointing.
- **Drifted from code (legacy claims now false):** "single head / multi-head is
  staged" (multi-head is live); "binding reserved to converse, routing is a later
  iteration" (`bind` verb + converse/new routing are built); Iteration 6 listed
  as future though substantially built.
- **Unverified (do not assert):** parity negative-clip figure `0.258381`;
  location of `userConfig.v1.json` (schema not found by name this pass).
