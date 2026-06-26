# Self-Operation

**Status:** design goal / north star. Foundations exist (see *Current State*); the
self-configuration layer proper is not yet built. This document is the source of
truth for the intent — task stubs (#92–96) track the decomposition.

This is the self-aware / self-configuring chapter of the broader
[vision](./vision.md) (ThinkSuit as a personal operating system); the path is
tracked in [roadmap.md](./roadmap.md).

## Why

ThinkSuit is heading toward being a personal-OS kernel: not just an agent you
invoke, but a system that can observe and operate on *itself* — its sessions, its
configuration, its wakewords, its modules, its own composition — from within a
turn, on behalf of the person it serves. The aim is a durable, self-aware seat of
operation that can reconfigure itself rather than only being configured from
outside.

## Core concepts

- **The main thread as a self-aware vantage.** One durable "home" session is the
  privileged seat of operation — aware that it *is* the main thread, distinct from
  transient `new` threads it spawns. It is the natural place for self-operation to
  originate and for global (vs session-local) effects to be reasoned about.
- **Self-operation (read and write).** The agent can introspect itself (sessions,
  traces, signals, current config, available affordances) and *act on* itself
  (change config, manage wakewords, enable/disable modules, adjust its own
  composition). Read-side largely exists; write-side does not.
- **Frame decomposition into named aspects.** Today the frame is a single injected
  prelude. The goal is to break it into addressable, composable *aspects* (modality
  is the first such axis) so self-operation can target one aspect without rewriting
  the whole frame.
- **Dispatch / arbitration.** A turn may carry *content* (talk to me) or a
  *command* (operate on yourself), and the two must be told apart, with an
  **altitude precedence** ordering when they conflict (a command from the main
  thread outranks in-content suggestions).

## Current state (foundations already in place)

| Capability | Where | Notes |
|---|---|---|
| Durable home/main session | `thinksuit-voice/src/daemon.js` (`mainSessionId`), commit `ac9f03c` | Pinned in config via `patchUserConfig`, resumed across restarts; a `new` thread never overwrites it. The *seat* exists; elevated self-affordances do not. |
| Self-introspection as tools | `thinksuit-mcp-server/lib/tools/{inspect,session,signals}.js` | Agent can read its own sessions, traces, and signal facts. |
| Self-invocation as a tool | `thinksuit-mcp-server/lib/tools/thinksuit.js` | Agent can re-invoke ThinkSuit. |
| Config read/patch primitives | `thinksuit/engine/config.js` (`readUserConfig`, `patchUserConfig`) | All-config-in-config; deep-merge write. The *mechanism* for self-config — **not yet exposed as an agent tool**. |
| Act without HITL | `autoApproveTools` (engine + voice daemon) | Lets self-ops execute unattended when appropriate. |
| Modality as a composition axis | engine `internals/runCycle/composeInstructions`, mu `modalities` | First addressable composition aspect (sibling to frame); caller asserts it, config is the default. |
| Session host + control channel | `thinksuit-broker` (worker-per-turn; interrupt/approve/status/tail), `engine/transports/session-router.js` | Process host + control surface — substrate for hosting transient self-ops. |

## The work ahead (decomposition)

- **#93 — Self-op scope & effect-timing.** Define session-local vs global self-ops
  and *when* each takes effect (this turn / next turn / persisted). Likely builds
  on `patchUserConfig` exposed as a guarded affordance.
- **#94 — Self-model / affordance catalog.** A first-class catalog of what the
  agent can know and do to itself; the write-side counterpart to the existing
  introspection tools.
- **#95 — Host / control-channel for transient self-ops.** Where ephemeral
  self-operations run and how they report back; leans on the broker host.
- **#96 — Dispatch / arbitration.** Distinguish content from command; define
  altitude precedence when they conflict.
- **Frame → aspects.** Generalize the modality precedent: decompose the frame into
  named, individually addressable aspects.
- **Elevate the main thread.** Give the home session actual self-aware
  affordances/privileges beyond merely being a persisted pointer.

## Open questions / risks

- **Safety of write-side self-ops.** Mutating own config/modules mid-turn needs
  guard rails and clear effect-timing so the agent can't brick itself.
- **Altitude model.** How precedence is expressed and enforced is unspecified.
- **Persistence vs ephemerality.** Which self-ops persist to `~/.thinksuit.json`
  vs apply only to the live session.
- **Recursion.** Self-invocation (the `thinksuit` tool) plus self-config opens
  reentrancy/loop concerns that need bounds.
