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

## End-state shape (the eventual loop)

```
mic ──▶ wake detect ──▶ capture/endpoint ──▶ STT ──▶ broker.run({input, sessionId})
                                                            │
                              speak ◀── TTS ◀── session.response (via tail)
```

Session routing (first iteration intent): wake reconnects the last session; if
none, start new. A distinct trigger/command switches sessions. Details TBD.

## Decided

- **Package**: `thinksuit-voice`, a broker client (like console), not a second
  broker.
- **Wake engine**: `livekit-wakeword` — local, ONNX, trainable, Apache-2.0.
  Replaces the old Porcupine approach (which needed a cloud access key + `.ppn`).
- **Training is offline Python/uv, quarantined to `training/`.** The pipeline
  (synthetic TTS data → augment → train → export) produces a `.onnx` classifier.
  Python exists only as a build-time tool; it does not define the runtime.
- **STT is local and keyless.** Target: Whisper `base` via a local runtime
  (e.g. whisper.cpp on Apple Silicon). Bar is known-reachable (matches the
  user's existing local setup).
- **TTS is pluggable; default starts keyless.** Ship macOS `say` first (zero
  deps, local). ElevenLabs is the eventual upgrade — cloud, keyed.
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
  appears only with cloud TTS (ElevenLabs). Keyed and keyless providers coexist.
- **Personal voice enrollment is required.** Synthetic-only training does not
  generalize to a real human voice (Iteration-1 finding: natural speech scored
  ~0.3–0.4 vs ~0.97 for the synthetic `say` voice; the user had to over-enunciate
  to trigger). Each user must record their own positives, which are mixed
  (oversampled) into the synthetic positive set and the model retrained. This
  makes guided voice enrollment a first-class workflow, not a one-off chore.

## Open (deliberately deferred — decide at the relevant iteration)

- **Runtime detection: (A) Python subprocess** running livekit-wakeword's own
  inference **vs (B) all-Node** via `onnxruntime-node` reimplementing the ONNX
  frontend + feature extraction in JS. Training is identical either way, so this
  is deferred until we have a model to serve. Decider: whether the JS feature
  extraction can be made faithful enough that a trained classifier still fires.
- **Mic capture method.** botplot's `rec`/sox subprocess approach is old and was
  slow; not committed. Evaluate node-native / portaudio / modern options when we
  build capture.
- **Wake phrase(s).** Including any session-switch trigger.
- **STT engine specifics** (which local Whisper runtime/binding).
- **TTS beyond `say`** and the ElevenLabs key path.
- **Config surface details** for backend selection.

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

**Iteration 1 — Training footing + prove detection (current).**
- Scaffold `packages/thinksuit-voice/` (package skeleton + `training/` uv
  project). Python quarantined to `training/`.
- Install only what training needs: `espeak-ng` (+ `ffmpeg`, present).
- PoC-0: prove detection works end-to-end with the pretrained `hey_livekit`
  model (audio → wake event reaches Node).
- PoC-1: train a custom wake phrase and detect on it.
- PoC-2: real-voice enrollment — record natural positives, mix (oversampled)
  into the positive set, retrain; confirm live recall on the user's own voice.
- Out of scope: runtime service, mic capture method, broker routing.

**Iteration 2 — Capture + wake into the broker.**
- Pick runtime fork A/B and mic capture method.
- Wake → capture an utterance → emit a wake/utterance event into Node →
  `broker.run`. Establish the stable stdout/event contract.

**Iteration 3 — Local STT.** Whisper `base` provider; utterance → text → `run`.

**Iteration 4 — Response + TTS.** `session.response` (via `tail`) → `say`. Full
hands-free loop closed, keyless.

**Iteration 5 — Provider abstraction + config + ElevenLabs.** STT/TTS provider
interface, console-editable backend selection in thinksuit config, ElevenLabs
TTS + its key path. Eventually: the LaunchAgent service scaffolding (bin/ +
etc/plist) once the runtime is settled.

**Iteration 6 — Wake-word training studio in console.** A guided record → train
→ test UI hosted by thinksuit-console but **served by thinksuit-voice**: console
stays thin (records mic audio in-browser, calls a thinksuit-voice training API,
streams progress/metrics, live-tests the model); thinksuit-voice owns the
training orchestration + voice-sample ingestion (it must not leak into console's
SDK/no-filesystem boundary). Subsumes Iteration-5's console-editable backend
selection. Built only **after** the manual real-voice loop (PoC-2) is proven, so
the UI automates a workflow we know works.

## Definition of done — Iteration 1

Say the wake word into the mic and observe a wake event in Node's output, using
a model we trained for our own phrase. Training is reproducible from the
checked-in `training/` config.
