# Vision: ThinkSuit

> **Status: north star, not current state.** This describes where ThinkSuit is
> *headed* and the character it's being shaped toward. Much of it does not exist yet;
> the console is primitive and most "affordances" below are aspirational. What exists
> today is in [architecture-overview.md](./architecture-overview.md); the gap is
> tracked in [roadmap.md](./roadmap.md). This document is grounded in the owner's
> stated intent, not a claim of completion.

## What it is

ThinkSuit is a **personal automation platform** for **one person** — a durable,
single-owner system that hosts that person's automations, knowledge, and interfaces.
Not a product, not a multi-tenant service.

The defining idea: **agents are one kind of step, not the whole game.** You *command*
the system, and a command may or may not involve an agent. You author **plans** and
fire them with inputs, like programs: some steps reason (an agent loop), and some are
direct, declared actions. So ThinkSuit affords everything a coding agent like Claude
Code affords — and more, because the agent is one capability *inside* a broader
command surface, not the surface itself.

The orchestration engine (`thinksuit`) is the **kernel** of this — real and central,
but the seed of something larger.

## Organizing lens: a personal OS

A metaphor for how the pieces relate — not a claim that all of it is built.

| OS concept | ThinkSuit |
|---|---|
| Kernel | the engine (`thinksuit`): the turn — agent loop + plan composition — plus `schedule()`, config registry, secrets keyring, session routing |
| Process host / scheduler | the broker: a worker per turn, control channel, queue, per-session workspaces |
| Processes / threads | sessions; the **home thread** (`mainSessionId`) is the persistent login session |
| Installed programs / behaviors | modules (e.g. `mu`): roles, prompts, plans |
| Syscalls / devices | MCP tools (introspection, self-invocation, custom tools) and integrations |
| Shells / terminals | the cli, console, voice, and tty front-ends |
| Registry | `~/.thinksuit.json` (all config in config) |
| Automations | **plans** — authored compositions you fire with inputs; agent steps and (aspirationally) direct declared actions |

## How you command it (the surfaces)

- **Console.** The place to command and observe the system — the envisioned control
  center for your automation platform. Primitive today (a debugging/inspection UI);
  a real personal-OS shell is largely undesigned.
- **Voice.** "Hey ThinkSuit" works today via the voice harness. The destination is an
  **always-on assistant** with a **deterministic command surface** — enough
  determinism that many things resolve with *no agent in the loop at all*.
- **CLI / MCP / TTY.** One-shot and interactive runners, ThinkSuit exposed outward as
  MCP tools, and a terminal surface.

## The cost ladder (deterministic reflex → full reasoning)

An instruction should land on the **cheapest rung that can serve it**:

1. A **known command** resolves to a fixed automation — no model in the loop.
2. When it needs reasoning rather than a fixed response, an **agent** reasons and
   acts.

The deterministic-command mechanism (matching an utterance/command straight to a plan
+ inputs) is **not yet built, and its form is undecided** — notably it is *not* ASL.
The regex-classifier groundwork that once pointed this direction was removed with
the classification pipeline (see [plans/de-pipelining.md](./plans/de-pipelining.md));
its replacement is future work, deliberately deferred.

## Self-operation (the north-star milestone)

The acceptance bar is **ThinkSuit operating on itself** — a system that can not only
*act* but *observe and operate on itself* (its sessions, config, wakewords, modules,
its own composition) from within a turn, on the owner's behalf. Read-side
introspection exists; the write side does not. This is the self-aware chapter — see
[self-operation.md](./self-operation.md).

## Hosted affordances (the "app layer" — aspirational)

The point of the platform is to host the automations a person wants for their life.
Illustrative, not exhaustive, none built yet:

- Calendar management
- List management
- Note-taking with intelligent filing / cataloging
- Home-automation integration
- …and generally **any** personal life automation

## What exists today (honest baseline)

- An end-to-end engine turn behind `schedule()`. *(A turn now resolves an authored plan
  and runs it via an agent loop + plan composition — `executePlan`/`executeTask`. This
  replaced the earlier classification pipeline; see
  [plans/de-pipelining.md](./plans/de-pipelining.md).)*
- Config-as-registry (`~/.thinksuit.json`, validated by `schemas/userConfig.v1.json`)
  and a secrets keyring (`thinksuit-genai/secrets`, re-exported by the kernel as
  `resolveSecret`).
- The broker process-host (worker-per-turn, control channel, queue, workspaces).
- A working voice loop (wake → capture → STT → turn → TTS) with a wakeword studio.
- MCP tools exposing self-introspection and self-invocation.
- The home thread (`mainSessionId`) as a persistent session *seat*.
- A console for session inspection and service control (debugging-grade, not yet the
  command center above).

Everything in *Hosted affordances*, the deterministic rung of *The cost ladder*, and
most of *self-operation* is still ahead. See [roadmap.md](./roadmap.md).

## See also

- [architecture-overview.md](./architecture-overview.md) — what exists, and what goes where.
- [self-operation.md](./self-operation.md) — the self-aware / self-configuring chapter.
- [roadmap.md](./roadmap.md) — the path from here to there.
- [plans/de-pipelining.md](./plans/de-pipelining.md) — removing the classification pipeline for a simple agent-oriented turn.
