# thinksuit-voice — Intent

Status: living. Authored 2026-07-07.

This is the durable record of **intent** for the voice package — the "why" and the
yardstick I hold designs to. It is the single center of the `spec/` set; every
software specification beside it is accountable to this. (The legacy `../SPEC.md`
is an unmaintained **archive** — raw material to mine, never the workspace.)

## What I'm building

**thinksuit-voice is an ergonomic voice harness for ThinkSuit** — and, held more
loosely, the capability layer for voice control of my digital life.

That wider surface is an **open door, not a roadmap.** Most of the richness I want
arrives *through ThinkSuit engagement itself*, not through a proliferation of
voice features — so the action set stays shallow. Beyond conversing, `dictate` is
the main near-term affordance I expect; there may not be much else soon. The
design should be able to **grow** into a wider control surface without being
re-cut — but I am not committing to build that surface.

Whisper apps (OpenWhispr, SuperWhisper, …) are **prior art and inspiration** — a
demonstrated working strategy and food for design thinking. They are never the
target. I learn and borrow freely; I hold a design-level intent of my own.

## Ergonomic — the measures (the yardstick)

"Ergonomic" is load-bearing and structural to everything here. It means holding
**human comfort at the center** and holding the design to a set of *measures* —
the measures one weighs when designing surfaces of human interaction. For this
harness:

- **Reliable to my expectations** of how it operates.
- **Rules obvious and transparent** to me — no opaque behavior.
- **Supportive cues** (earcons and the like) that aid the above — and kept
  **optional**, because forcing a cue is itself un-ergonomic.

The center these share: **comfort comes from fit** — my model of what the harness
will do and what it actually does stay in sync, and it is always possible to see
why. Reliability and transparency are the two halves of that fit; cues serve it;
optionality keeps a cue from becoming a cost I didn't choose.

**Held tension (a property to keep in view, not a defect to fix):** reliability
and transparency can trade against each other. A plain rule (e.g. "end capture
after a fixed quiet interval") is transparent — I can run it forward in my head —
but less reliable in noise. A smarter detector is more reliable, yet its rule is
harder to see. Which measure wins is a judgment, made case by case. **When a
specification makes such a trade, it must say so.**

## The conceptual model

- A **wakeword fires an action.** This is the core abstraction.
- Every action shares a **front half**: wake → capture → utterance → text.
- Actions diverge in the **back half — the sink**: where the utterance goes.
  - **Session actions** (`converse`, `new`) route the text into a ThinkSuit
    session — continue the voice-designated thread, or mint a fresh one.
  - **Non-session actions** (e.g. `dictate`) route it elsewhere — clipboard, or
    injected into the frontmost app — and never touch a session.
- An action's identity is largely *its sink*. The shared front half (capture →
  clean utterance → text) is **substrate beneath all actions**, not a session
  feature — it serves dictation exactly as it serves conversation.

## Working stance for this spec set

- **Intent is the single center; code is evidence for it.** Where intent and code
  disagree, that is a conversation, not a silent reconciliation.
- Specifications are held **provisionally** and pruned freely until clear of
  confusion — and that is *not* license to stall: when there is agreed work, do it.
- This `spec/` set **replaces** the legacy `../SPEC.md`.

## Deliberately not now

- **`interrupt` / `switch` as bound actions** — earlier exploratory ideas, parked.
  Not being designed now; to be revisited only after separate thinksuit work.
- **Endpointing / detection substrate** — a live design thread (neural VAD vs.
  energy-based quiescence; where the detector/windower seam lives). Squarely an
  ergonomics question by the measures above, and it belongs to a forthcoming
  capture-substrate specification, not here.
