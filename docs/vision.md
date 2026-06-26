# Vision: ThinkSuit as a Personal Operating System

> **Status: north star, not current state.** This document describes where
> ThinkSuit is *headed*. The project is a long way from it — the UI is primitive
> and most of what's described here as "affordances" does not exist yet. What
> exists today is documented in [architecture-overview.md](./architecture-overview.md);
> the gap is tracked in [roadmap.md](./roadmap.md). The OS metaphor below is an
> organizing lens, not a claim of completion.

## What it is aiming to be

ThinkSuit is aimed at being a **personal operating system**: a durable, self-aware
computing environment for **one person**. Not a product, not a multi-tenant
service — a single-owner system that hosts that person's automations, knowledge,
and interfaces, and in which the agent can not only *act* but *observe and operate
on itself* on their behalf.

Earlier framings described ThinkSuit more narrowly as an AI orchestration engine.
That engine is real and remains the core, but it is the **kernel** of something
larger — this document supersedes the narrower framing.

## The OS metaphor (organizing lens)

| OS concept | ThinkSuit |
|---|---|
| Kernel | the engine (`thinksuit`): cognition pipeline + `schedule()`, config registry, secrets keyring, session routing |
| Process host / scheduler | the broker: a worker per turn, control channel, queue, per-session workspaces |
| Processes / threads | sessions; the **home thread** (`mainSessionId`) is the persistent login session |
| Installed programs / behaviors | modules (e.g. `mu`) |
| Syscalls / devices | MCP tools (introspection, self-invocation, custom tools) and integrations |
| Shells / terminals | the cli, console, voice, and tty front-ends |
| Registry | `~/.thinksuit.json` (all config in config) |
| Scripting / automation language | ASL-like state machines (the same substrate the engine runs internally) |

## Hosted affordances (the "app layer" — aspirational)

The point of the OS is to host the automations a person wants for their life.
Illustrative, not exhaustive:

- Calendar management
- List management
- Note-taking with intelligent filing / cataloging
- Home-automation integration
- …and generally **any** personal life automation

These are the apps/services of the personal OS. None are built yet; they are the
target the substrate is being shaped to support.

## The intent cascade (tiered dispatch)

A single spoken utterance should land on the cheapest rung that can serve it — a
cost/altitude ladder from deterministic reflex to full reasoning:

1. **Wakeword level.** The classifier detects a wake/command phrase.
   *(Exists: multi-head wake detection.)*
2. **Command-like intent at the classifier level.** Certain phrases map directly to
   **automations defined in ASL**, dispatched deterministically — **no LLM in the
   loop**. This generalizes today's "commands-as-wakewords" groundwork and reuses
   the fact that the engine already executes an ASL-like state machine
   (`machine.json` via Trajectory): ASL becomes the OS's automation language, not
   just the engine's internal pipeline. *(Mostly aspirational: wakeword→action
   bindings exist (`converse`/`new`); classifier→ASL-automation dispatch does not.)*
3. **Agent level.** When intent needs reasoning rather than a fixed automation, the
   agent reasons, self-operates, and dispatches. *(Aspirational; builds on the
   [self-operation](./self-operation.md) north star.)*

Deciding *which rung* an utterance belongs to is the arbitration problem —
distinguishing content from command, with altitude precedence — tracked as a
self-operation spec.

## What exists today (honest baseline)

- An end-to-end engine cognition pipeline (signals → rules → plans → compose →
  execute) behind `schedule()`.
- Config-as-registry (`~/.thinksuit.json` with `readUserConfig`/`patchUserConfig`,
  validated by `schemas/config.v1.json`) and a secrets keyring (`engine/secrets`).
- The broker process-host (worker-per-turn, control channel, queue, workspaces).
- A working voice loop (wake → capture → STT → turn → TTS) with a wakeword studio.
- MCP tools exposing self-introspection and self-invocation
  (`thinksuit`/`inspect`/`session`/`signals`).
- The home thread (`mainSessionId`) as a persistent session *seat*.

Everything in *Hosted affordances* and most of *The intent cascade* and
*self-operation* is still ahead. See [roadmap.md](./roadmap.md).

## See also

- [architecture-overview.md](./architecture-overview.md) — what exists, and what goes where.
- [self-operation.md](./self-operation.md) — the self-aware / self-configuring chapter.
- [roadmap.md](./roadmap.md) — the path from here to there.
