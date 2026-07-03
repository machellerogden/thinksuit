# Roadmap

The gap between what exists today ([architecture-overview.md](./architecture-overview.md))
and the [vision](./vision.md) of ThinkSuit as a personal operating system. This is
a living document of intent, not a commitment or a schedule. Grouped by theme,
roughly nearer-term first within each.

## Engineering hygiene (in reach)

- **Config test-isolation.** `buildConfig()` reads the real `~/.thinksuit.json`
  from the home dir (`engine/config.js`), so the test suite is coupled to the
  developer's personal config. Route the global layer through the existing
  `THINKSUIT_CONFIG` override and add a vitest setup so the suite is hermetic.
- **Standardize voice logging to JSONL** so progress/phase events are
  machine-readable and surfaceable in the UI (today some phases log to stdout only,
  which is why long training phases look "silent").

## Voice / audio

- **Full-duplex barge-in via acoustic echo cancellation (AEC).** Today the daemon
  is half-duplex-free but cannot cleanly hear you over its own TTS. Real AEC (e.g.
  macOS VoiceProcessingIO / AVAudioEngine, which subtracts the known playback
  signal) would allow interrupting a spoken reply by voice. This is an audio-stack
  change (PortAudio/naudiodon2 → AVAudioEngine). See `thinksuit-voice/SPEC.md`.
- **A `stop`/`interrupt` wakeword binding** — a command-type binding that aborts the
  current turn without starting a new one. (Note: until AEC lands, it can only
  interrupt the *thinking* phase, not a spoken reply.)
- **Hotkey to toggle voice listening** on/off.
- **Training UX as a confusability advocate** — surface winner-margin between heads,
  a warm window, and earcons so enrolled wakewords don't collide.
- **Session recall** — voice-addressable navigation of conversation history.

## Self-operation (see [self-operation.md](./self-operation.md))

The agent observing and operating on itself is the heart of the personal-OS idea.
Read-side introspection exists (the mcp-server tools); the write side does not.

- **Write-side self-configuration tools** — expose `patchUserConfig` (and wakeword /
  module management) as guarded affordances the agent can use mid-turn.
- **Self-op scope & effect-timing** — session-local vs global; this-turn / next-turn
  / persisted.
- **Self-model / affordance catalog** — a first-class catalog of what the agent can
  know and do to itself.
- **Host / control-channel for transient self-ops** — where ephemeral self-operations
  run and report back (leans on the broker).
- **Dispatch / arbitration** — distinguish content from command, with altitude
  precedence (this is "which rung of the intent cascade does an utterance land on").
- **Elevate the home thread** — give `mainSessionId` real self-aware privileges, not
  just persistence.

## Tiered dispatch & automation language

- **Command-like dispatch** — distinguish command-like wakewords that should run a
  deterministic automation (no LLM in the loop) from utterances that warrant a full
  agent turn. See [vision.md](./vision.md) for the north-star framing.
- **Automation language (undecided)** — a deterministic automation substrate is still a
  goal, but the engine's former ASL state machine (`machine.json` via Trajectory) was
  removed by de-pipelining, so the language/runtime for authored automations is an open
  design question rather than a reuse of existing machinery.

## Hosted affordances (the "app layer")

Aspirational services the OS is meant to host — none built yet:

- Calendar management
- List management
- Note-taking with intelligent filing / cataloging
- Home-automation integration
- …and generally any personal life automation

## Interfaces / UI

- **The console is primitive.** A real personal-OS shell needs far more than the
  current debugging UI — surfacing/managing the affordances above, the home thread,
  self-operation, and automations. Largely undesigned.
- **Reflect a session's modality in the UI** — modality is applied per turn but not
  recorded/displayed; deferred pending a decision on how it should read.
