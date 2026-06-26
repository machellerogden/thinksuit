# thinksuit-voice — Goal Specification

Status: draft. This is the durable reference for the package. It records the
shared framing, what is **decided**, what is **deliberately deferred**, and the
staged path to building it. Update it as decisions land; don't re-litigate
settled items without changing this file.

## Purpose

Give ThinkSuit a hands-free voice front door: a spoken wake word starts (or
resumes) a turn, speech becomes the turn input, and the turn's response is
spoken back.

## Core framing

- **The broker is the sole session authority.** Its contract is text-in /
  event-out: `run(config)` with an optional `sessionId` creates or continues a
  turn; responses arrive as `session.response` events over `tail()`.
- **Voice is a transducer at the broker's edge, not a new kind of session.**
  Inbound: audio → text → `run`. Outbound: response events → audio. The session
  model never needs to know voice exists.
- **The service boundary is microphone ownership.** The persistent daemon is
  "the thing that owns the mic." Wake detection and (later) utterance capture
  both need the live audio stream, so they belong to one owner — handing a mic
  between processes is the thing to avoid.
- **Wake word is a capability inside the daemon, not its own service.** The
  package is `thinksuit-voice`; "wakeword" names a feature, not a boundary.

## Terminology

- **Wakeword** — a trained spoken phrase plus its detection model. The managed unit
  in the **wakeword library**. Action-neutral (replaces the overloaded "wakeword"
  as the user-facing noun; `wake/` remains the internal name of the detection
  subsystem).
- **Action** — what the daemon does when a wakeword fires: `converse` (capture an
  utterance → continue the current session), `new` (start a fresh session), or
  `interrupt`. (`switch` is deliberately omitted — no good voice target-selection
  model yet.)
- **Binding** — the map from a wakeword → an action. Any wakeword can bind to any
  action. In iteration 1 the binding is reserved (always `converse`); authoring
  bindings + routing the non-`converse` actions is a later iteration.

## End-state shape (the eventual loop)

```
mic ─▶ wake ─▶ capture/endpoint ─▶ STT ─▶ [post-process?] ─▶ broker.run({input, sessionId})
                                                                      │
                                    speak ◀── TTS ◀── session.response (via tail)
```

Session routing: see **Session routing (current behavior)** under Decided — one
in-memory session per daemon lifetime; the wake-word command layer starts or
switches sessions.

## Decided

- **Package**: `thinksuit-voice`, a broker client (like console), not a second
  broker.
- **Wake engine**: `livekit-wakeword` — local, ONNX, trainable, Apache-2.0.
  Replaces the old Porcupine approach (which needed a cloud access key + `.ppn`).
- **Training is offline Python/uv, quarantined to `training/`.** The pipeline
  (synthetic TTS data → augment → train → export) produces a `.onnx` classifier.
  Python exists only as a build-time tool; it does not define the runtime.
- **STT is local and keyless via transformers.js Whisper (ONNX).** Default
  `Xenova/whisper-base.en`, run in-process through `@huggingface/transformers`
  (already a repo dependency) — no external binary, no key, all-Node. whisper.cpp
  was the original target but isn't installed on the dev machine; it stays a
  later faster-runtime swap behind the same `stt/` interface.
- **TTS is pluggable; `say` is a stepping stone.** Ship macOS `say` first (zero
  deps, local, keyless) to close the loop — but it is explicitly temporary. A
  cloud TTS provider will replace it as the default; which backend is undecided.
- **STT and TTS are providers behind a stable interface**, mirroring
  `packages/thinksuit/engine/providers/`. One module per backend, selected by
  config. Plurality assumed from day one; "expand" = add a module.
- **Backend selection lives in the thinksuit config**, alongside everything
  else. Console (a thin client) edits it; the voice daemon reads it. Config
  holds *selection*, never secrets.
- **Credential contract = "provider key is in the service's env at runtime."**
  The architecture expresses no opinion on secret *storage*. How the key reaches
  the env is a deployment choice (env export, plist, setenv, an `op run` /
  Keychain wrapper). Secure sourcing is opt-in hardening, never forced on users.
- **Keyless until it isn't.** Wake + STT are fully local/keyless. The first key
  appears only with the cloud TTS provider (backend undecided). Keyed and
  keyless providers coexist.
- **Runtime detection is all-Node (fork B).** The wake daemon runs the three
  ONNX models (`melspectrogram.onnx`, `embedding_model.onnx`, our classifier)
  directly via `onnxruntime-node` — no Python at runtime. The feared risk ("can
  JS feature extraction be faithful enough") does not exist: there is no DSP to
  reimplement, because the mel/FFT math is frozen inside `melspectrogram.onnx`.
  The only non-ONNX glue is int16→float32, the `x/10 + 2` mel post-proc, the
  76-wide/stride-8 sliding window, and "take last 16 embeddings." Proven by a
  byte-identical parity test (`tools/parity_ref.py` ↔ `tests/parity.test.js`):
  Node matched Python's `predict()` to six decimals on both a positive
  (0.915209) and a negative (0.258381) clip. Consequence: training stays Python
  (build-time tool) but the runtime — and the console studio's live-test path —
  is Node, with no train/runtime drift since both load the identical frozen
  frontend ONNX.
- **Personal voice enrollment is required.** Synthetic-only training does not
  generalize to a real human voice (Iteration-1 finding: natural speech scored
  ~0.3–0.4 vs ~0.97 for the synthetic `say` voice; the user had to over-enunciate
  to wakeword). Each user must record their own positives, which are mixed
  (oversampled) into the synthetic positive set and the model retrained. This
  makes guided voice enrollment a first-class workflow, not a one-off chore.
- **Mic capture is `naudiodon2`** (PortAudio, in-process PCM). The daemon owns
  the mic and emits int16 frames to the detector; capture-after-wake uses
  energy-based record-until-silence endpointing (`audio/endpoint.js`).
- **Multiple wake words are first-class and cheap.** The mel→embedding frontend
  is computed once per window and shared; each wake word is a small classifier
  head scored on that shared embedding sequence (mirrors livekit-wakeword's
  `predict()` returning `{name: score}`). The detector reports *which* word fired
  by name. Adding a word ≈ adding a tiny head, not a second pipeline. (The Node
  `wake/pipeline.js` currently loads a single head; multi-head is a small
  contained refactor, staged below.)
- **The voice command layer is built from wake words.** Control actions (new
  session, switch, …) are their own trained wake words; the daemon routes on the
  fired name — conversation word → capture→turn, command word → local control.
  This is the voice analog of the REPL's `:`-prefixed commands and resolves the
  session-switch wakeword that was previously TBD.
- **Session routing (current behavior).** Each wakeword carries an action binding —
  `converse` continues the current session (context accumulates); `new` starts a
  fresh one. A durable **home thread** is pinned in config (`mainSessionId`) and
  resumed across restarts, so "hey thinksuit" returns to the same seat; a `new`
  thread never overwrites it. The voice session is an ordinary broker session,
  observable and attachable from the CLI (`ps`) and console.
- **Voice config lives in the thinksuit config under a `voice` namespace**
  (`voice.input` / `voice.wakewords` / `voice.capture` / `voice.cues` / `voice.stt`
  / `voice.tts`), validated by `config.v1.json` and surfaced through
  `buildConfig().voice`. The daemon reads it via `loadVoiceConfig(base.voice,
  overrides)` — layered defaults < file < overrides. Per-wakeword settings live
  under `voice.wakewords.<name>` (the retired `voice.wake` section is gone). Device
  selection is by name — `voice.input.deviceName` (with `deviceId` fallback), and an
  absent device falls back to the system default; the old `THINKSUIT_VOICE_DEVICE`
  env override is removed. The durable home thread is the top-level `mainSessionId`.
- **Transcription post-processing is an optional stage** between STT and the
  turn. The raw transcript may be passed through an LLM with custom instructions
  to clean/reformat it before it becomes the turn input (the author's habit:
  OpenAI `gpt-5-mini` with custom instructions). It is:
  - optional (off by default; user opts in);
  - independently configured — its **own provider + model selection**, drawn from
    any of the user's configured providers/models (not tied to the conversation
    model), plus a custom instruction prompt;
  - selection + instructions live in config (never secrets).
  Open: whether the post-process LLM call routes **through the broker** (keeping
  the daemon keyless, consistent with the credential model) or via thinksuit's
  provider abstraction directly — decide when built. Modeled as a distinct stage,
  not baked into the STT provider, so it works regardless of STT backend.

## Known limitations

- **No acoustic echo cancellation (AEC) — limited voice barge-in.** The mic and
  speakers share a room, so if a wake fires *while the agent is speaking*, the
  capture window can pick up the tail of the agent's own TTS. The deployment-grade
  fix is real AEC — e.g. macOS VoiceProcessingIO (AudioUnit/AVAudioEngine), which
  subtracts the known playback signal — giving clean full-duplex barge-in. That's
  a real audio-stack change (PortAudio/naudiodon2 → AVAudioEngine) and is deferred.
  Until then, interrupting a *spoken* reply is best done via the control API /
  `:interrupt` (or the console). Note: the earlier "agent answered itself" bug was
  **not** this — it was a detector buffer that re-fired a phantom wake on its own
  frozen audio (fixed by clearing the ring on wake in `wake/detector.js`).

## Open (deliberately deferred — decide at the relevant iteration)

- **TTS beyond `say`** — which cloud provider, and its key path.
- **Config surface details (remaining)** — the base shape (`voice.input`,
  `voice.wakewords`, `voice.stt`, `voice.tts`) loads from the thinksuit config, and
  multi-wakeword selection is settled (`voice.wakewords.<name>` with per-word
  `enabled` / `binding` / `threshold` / `current`). Still open: the post-processing
  config block.
- **Command wake-word vocabulary + thresholds** — which control phrases, each
  trained as its own word, and per-word detection thresholds.

## Prior art (reference, not commitments)

- `talkpile/lib/wakeword.js` — the wake→capture loop *shape* (Porcupine +
  PvRecorder → record-until-silence). Engine is being replaced; structure
  transfers.
- `botplot/lib/mic.js` — capture + silence-based endpointing (spawns `rec`,
  16kHz S16LE mono, volume-threshold VAD, reset-on-silence timeout). Old/slow;
  reference for the capture stage.
- `packages/thinksuit/engine/providers/onnx.js`, `onnx-worker.js` — the repo
  already runs ONNX inference in a Node worker; basis for the all-Node runtime
  option (fork B) and the provider pattern.

## Staged plan

**Iteration 1 — Training footing + prove detection. [done]**
- Scaffolded `packages/thinksuit-voice/` (package skeleton + `training/` uv
  project), Python quarantined to `training/`.
- Trained a custom phrase ("Hey ThinkSuit") and proved live detection.
- PoC-2: real-voice enrollment (record → mix → retrain), confirmed live recall
  on the user's own voice; real-voice negatives fixed speaker overfit.

**Iteration 2 — Capture + wake into the broker. [done]**
- Runtime fork B (all-Node) and `naudiodon2` capture chosen and proven.
- Wake → energy-based record-until-silence capture → `broker.run`; session
  routing (one in-memory session, reconnect-last).

**Iteration 3 — Local STT. [done]** transformers.js Whisper provider; utterance
→ text → `run`, with model warmup at daemon start.

**Iteration 4 — Response + TTS. [done]** `session.response` (via `tail`) →
macOS `say`. Full hands-free loop closed, keyless.

**Iteration 5 — Wakeword library (CLI). [done]** Formalize the manual training
flow into a CLI that manages a *collection* of wakewords: define / train / test /
augment (record positive+negative samples and retrain) / promote / enable.
Architecture is layered with one-way deps — `src/wakewords/{store,recorder,
trainer,cli}.js` over the existing audio modules, with `training/train.py` as the
JSON-in / JSONL-out contract to `livekit-wakeword` (the only seam that knows the
engine). Each wakeword is a self-contained bundle under
`~/.thinksuit/voice/wakewords/<name>/` (manifest + samples + model versions);
"install" is a manifest write (promote + enable). The daemon loads the **enabled**
wakeword's current model + threshold from the store. Single active head; binding
fixed to `converse`. Exposed as `thinksuit-voice wakeword <verb>`.

**Iteration 6 — Multi-head runtime + binding execution.** Load multiple enabled
heads on the shared frontend (`wake/pipeline.js` → `{name: score}`;
`wake/detector.js` fires `onWake({name, confidence})`); daemon routes on the fired
name. Add the `wakeword binding` verb and execute the non-`converse` actions
(`new`, `interrupt`). Only here does `enable` go multi-active.

**Iteration 7 — Presets (STT + TTS).** Per-modality, switchable presets managed
the same way as wakewords (dir-per-preset under `~/.thinksuit/voice/{stt,tts}/`).
An **STT preset** = a transcription stage (provider/model) + an optional **cleanup**
stage (provider/model + an `instructions.md`; shipped default at
`presets/default-cleanup.md`, no templating). A **TTS preset** = a synthesis
backend (`say` now; ElevenLabs/OpenAI added here) + voice/model. `stt`/`tts` CLI
groups, the cleanup executor + `stt test`, daemon live application of the
post-processing stage, and the broker-vs-direct decision for the cleanup LLM call.
The composing "voice preset" bundle stays deferred. Also: LaunchAgent service
scaffolding once the runtime is settled.

**Iteration 8 — Console studio.** Mirror the wakeword (and preset) CLI surfaces in
thinksuit-console: console stays thin (records mic audio in-browser, calls a
thinksuit-voice HTTP API, streams progress/metrics, live-tests), and
thinksuit-voice owns the same `store`/`recorder`/`trainer`/preset library
server-side (it must not leak into console's SDK/no-filesystem boundary). Same
core, second face — built on the workflow the CLI already proves.

## Definition of done — Iteration 1

Say the wake word into the mic and observe a wake event in Node's output, using
a model we trained for our own phrase. Training is reproducible from the
checked-in `training/` config.
