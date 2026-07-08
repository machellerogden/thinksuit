# thinksuit-voice — Capture substrate: the speech/silence detector seam

Status: living. Authored 2026-07-07.

Accountable to [intent.md](intent.md). This specifies the **shared front-half
substrate** — capture → utterance → text — that serves every action (conversation
today, dictation later). This document covers the **endpointing** stage: deciding
where the utterance starts and ends.

## Why this exists (the ergonomic case)

Endpointing was a single hardcoded energy rule (`RMS > 400`) in `endpoint.js`. It is
transparent (a threshold you can reason about) but unreliable in noise. Measured
this session with the real endpointer (`tools/endpoint-file.mjs`), a real 16 kHz
clip, and injected background noise at int16 RMS 700:

- **Clean:** rms and silero agree — onset ~160–190 ms, end ~1.8 s.
- **Noisy:** rms reads speech *everywhere* (meanProb 1.0) and **end-of-turn never
  fires** — it would run to `maxMs` on a live mic. Silero ignores the noise and ends
  correctly (~1.9 s).

Per the intent's reliability↔transparency trade, we keep both and let config choose;
the default favors reliability.

## The seam

A **detector registry** mirroring `stt/` and `tts/`. One module per backend, chosen
by config. `src/detect/`:

- `index.js` — `createSpeechDetector(config) → Promise<detector>` (async: a neural
  detector loads an ONNX model). Dispatches on `config.provider`, passes the
  per-provider sub-config.
- `rms.js` — energy threshold (the old logic, lifted out; **a peer plugin, not a
  privileged default**). Zero dependencies. The fallback.
- `silero.js` — Silero VAD (neural, local, keyless; ONNX via `onnxruntime-node`).
  The default.
- `chunker.js` — shared 512-sample accumulator (variable capture frames → exact
  chunks; tracks absolute sample offsets).

Distinct from `wake/detector.js` (`createDetector`), which scores wakewords — a
different concept.

### Detector contract

```
detector = {
  reset(),                    // clear accumulator + any neural state; per utterance
  async push(int16Frame)      // -> Decision[]  (0..N, one per completed 512-sample chunk)
}
Decision = { speech: boolean, prob: number, sample: number, len: number }
```

- The detector **owns the 512-sample accumulator**: `push` appends a variable-length
  frame, drains full 512-sample (32 ms) chunks, emits one `Decision` each, holds the
  `<512` remainder. Uniform granularity for both providers, so one windowing path
  serves both.
- `sample` is an absolute offset (detector tracks it; `reset()` zeroes it). All
  endpointer window math keys off `sample`/`len`, not input frame sizes.
- Contract is **async** so a trivial RMS (resolves immediately) and a neural model
  (real inference) satisfy one shape.

## Endpointer / detector division of labor

`endpoint.js` keeps **all** windowing — cue floor, guard lead, onset refinement,
trailing-silence timing — and only *delegates the speech decision*:

- `push` is now async: it appends the frame, `await detector.push(frame)`, runs the
  trailing-silence / onset state machine over the returned `Decision[]`, and records
  each decision in `perChunk[]`.
- `preciseOnset` no longer re-scans the audio buffer (a stateful neural model can't
  be cheaply re-run mid-buffer). It reuses `perChunk` — the first of two consecutive
  speech chunks past the cue floor.

**Consequence — 32 ms granularity:** onset/end resolve at 512-sample chunk
boundaries rather than the old 20 ms scan. Practically, end-of-turn can fire up to
~one chunk (32 ms) later, and a speech→silence boundary chunk reads as speech (it
straddles both). Negligible against a 700 ms silence gap; noted because it shifts
some exact-boundary test expectations by ±512 samples.

## Config

`voice.detector` (schema: `packages/thinksuit/schemas/userConfig.v1.json`; the
`voice` object is closed, so the block is explicit):

```
voice.detector = {
  provider: 'silero',            // default; 'rms' is the fallback
  rms:    { threshold: 400 },    // migrated from voice.capture.rmsThreshold
  silero: { threshold: 0.5 }
}
```

**Migration:** `voice.capture.rmsThreshold` is deprecated but still read as the
`rms` detector's fallback threshold (wired in `daemon.js` when constructing the
detector), so a previously tuned value isn't silently lost.

## Lifecycle (daemon)

Created **once** at daemon start (`createSpeechDetector`, paying any model load up
front), `reset()` per utterance in `onWake`, injected into `createEndpointer`. The
capture frame path is serialized through a promise chain (`capturePump`) because
`push` is async — ordered, never dropped.

## Verification (mic-free)

`tools/endpoint-file.mjs` drives a 16 kHz wav through the real endpointer + a chosen
detector, with optional injected noise:

```
node tools/endpoint-file.mjs --wav clip.wav --detector silero
node tools/endpoint-file.mjs --wav clip.wav --detector rms --noise 700
```

Unit tests: `tests/detect.rms.test.js`, `tests/detect.silero.test.js` (skips if the
model asset is absent), and the refactored `tests/endpoint.test.js` (async, injected
detector).

## Not yet here

- **TEN-VAD** as a second neural provider — drops in behind the identical
  `createSpeechDetector` contract; then benchmark it head-to-head against Silero for
  real (the seam exists precisely so we're not betting on one VAD).
- Silero's several-hundred-ms transition delay (end-of-turn can feel slightly laggy)
  is the ergonomic watch-item to measure when TEN lands.
