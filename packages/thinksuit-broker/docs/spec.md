# ThinkSuit Execution Broker — Natural Language Specification

**Status:** Implemented — this design has shipped as the `thinksuit-broker` package.
Retained as design rationale; for current behavior see
[`../README.md`](../README.md) and
[`../../../docs/architecture-overview.md`](../../../docs/architecture-overview.md).
**Date:** 2026-06-18 (spec)
**Scope:** The execution/process *backbone* of ThinkSuit. Not its control-flow
orchestration (ASL/rules), not its module/cognition layer.

> **Historical note.** This spec is accurate for what the broker shipped, but it
> repeatedly frames "keep ThinkSuit's ASL state machine + rules engine" as a
> deliberate non-goal. That core was **later removed** by the de-pipelining: there is
> no state machine or rules engine anymore — a turn resolves an authored plan.v1 node
> tree via `executePlan`/`executeTask`. The broker's own design (subprocess-per-turn,
> socket API, workspaces) is unchanged and still current.

---

## 1. Background (grounded in current code)

ThinkSuit is a resident, multi-interface agentic harness. Relevant facts about
the system as it exists today:

- The core engine is a **per-invocation library** driven by `schedule()` →
  `run()`. There is no central process that owns execution.
- **Sessions are the primitive**: each has an id, a status model
  (`ready`/`busy`/…), an atomic `acquireSession` lock, append-only JSONL
  event-sourced persistence, `fork`, and a file-watch `subscribe`.
- The **resident processes today are UI services** (`thinksuit-console`,
  `thinksuit-tty`, run as LaunchAgents). Execution itself runs in whatever
  process calls `schedule()`.
- The **console server is already a de-facto, single-process execution host**:
  `api/run/+server.js` schedules, registers the interrupt in an in-memory
  `activeExecutions` map, runs the execution **in the background (not awaited)**,
  and returns the session id immediately. A console-started execution therefore
  survives the browser disconnecting.
- **Observation is already cross-process**: the event-sourced JSONL stream plus
  `subscribe` (file watching) let any process read/tail any session.
- **Control is process-bound**: `activeExecutions` (interrupt handles) and
  `pendingApprovals` (`approval/async.js`) are in-memory maps. An approval
  *request* is written to the event log (visible everywhere), but
  `resolveApproval` and `interrupt` only work **inside the process that started
  the execution**.

**Reference point:** the sibling project *attractor* implements a standalone
daemon (`attractor-service`) that owns run lifecycle and a queue, addressed by a
thin Docker-like CLI over a unix domain socket, with UIs riding on top as
clients. Attractor has no interactive agentic REPL; ThinkSuit does
(`thinksuit-cli`).

### 1.1 Verified current-state constraints (read from the code; shape the plan)

- **All execution is in-process today.** `schedule()` → `run()` runs in the
  caller's process. The one-shot `thinksuit-exec` (`execute.js`) runs in-process
  and sets `autoApproveTools: true` — it never uses the interactive approval flow.
- **The console is a de-facto detached host.** `api/run/+server.js` runs the
  execution in the background (not awaited) inside the resident server, tracks it
  in an in-memory `activeExecutions` map, and resolves approvals via the
  directly-imported `resolveApproval` (`api/approvals/[id]`).
- **The REPL is fully in-process and observes differently from the console.**
  `commands.js` `executeCommand` imports `schedule` directly and builds a Pino
  logger with two streams — an in-process `LoggerStream` tap (how it *sees*
  events) **and** the session-router transport (how it *writes* JSONL); it detects
  `execution.tool.approval-requested` from the in-process tap and calls the
  imported `resolveApproval` in-process. Interrupt is an in-process closure in
  `executionState.interrupt`. Migrating the REPL therefore touches observe,
  approve, and interrupt — all in-process.
- **The task loop holds all state in memory.** `execTask.js` keeps
  `cycleCount`/`totalTokens`/`taskThread`/`lastResponse`/… as locals, requests
  tool approval mid-loop via the in-process `pendingApprovals`, and throws
  `InterruptError` carrying partial state *for reporting only*. There is **no
  checkpoint/resume** — a process/broker death mid-loop loses the run; only the
  event log persists, as a record.
- **MCP lifecycle is global, not per-execution.** `withMcpLifecycle` starts
  servers per run and its cleanup calls **`stopAllMCPServers()` (global)** — fine
  for one-execution-per-process, but a **concurrency hazard** under a shared host:
  a finishing run would tear down servers other in-flight runs depend on.
  Per-session MCP isolation or pooled/ref-counted servers is required for
  concurrent hosting.
- **Observation is cross-process at the data layer** (JSONL event log + chokidar
  `subscribe`) and is used by the console — but **not by the REPL** (in-process
  tap). A broker should unify clients onto the cross-process stream.
- **A concurrency primitive exists:** `acquireSession` is an atomic status check
  (`busy`/`ready`) the broker can build on (see Q7).

---

## 2. Problem

1. **No single canonical host.** Each entry point hosts its own executions: the
   console server hosts its sessions; the REPL hosts in-process and loses them on
   exit. There is no shared host.
2. **Control is not cross-process.** A client cannot cancel, answer approvals
   for, or interactively attach to an execution it did not itself start.
3. **No uniform, client-agnostic lifecycle management** — no Docker-like
   `ps`/`attach`/`cancel` that works across all clients and all sessions.

---

## 3. Goal

Introduce a single resident **execution broker** (daemon) that owns
session/execution lifecycle independent of any client, exposed over a local IPC
API, such that:

- executions are **hosted by the broker and survive client exit, uniformly**;
- **all clients** — a new Docker-like CLI, the existing REPL, the console, the
  tty — operate as **thin clients** of the broker rather than each embedding or
  hosting execution;
- lifecycle and control verbs (run, ps, status, log, attach, detach, cancel,
  approve) work **from any client against any session**, regardless of which
  client started it;
- ThinkSuit's distinctive interactive agentic **REPL is preserved** as a
  first-class client and gains **detach / re-attach**.

In one line: give ThinkSuit attractor's daemon-backbone-with-thin-clients shape,
while keeping the conversational REPL attractor lacks.

---

## 4. Non-Goals

- **Not** adopting attractor's DOT pipeline model or otherwise changing
  ThinkSuit's control-flow representation (ASL state machine + rules). This spec
  concerns the execution backbone only.
- **Not** a networked / multi-user / remote service. Local, single-user, IPC
  (unix domain socket) only.
- **Not** a rewrite of the engine, module system, or session/event model. The
  broker **wraps and hosts** the existing `schedule()`/`run()` engine.
- **Not** a change to the observability storage model. Event-sourced JSONL
  remains the system of record.

---

## 5. Definitions

- **Broker / daemon** — the resident process that hosts and supervises
  executions and exposes the control API.
- **Session** — the existing ThinkSuit primitive (identified, persisted,
  resumable, forkable conversation). The unit the broker manages. (See Q1.)
- **Execution** — a single `schedule()`/`run()` cycle (a turn) within a session.
- **Client** — any process talking to the broker (CLI, REPL, console, tty).
- **Attach (observe)** — subscribe to a session's live event stream. Already
  possible cross-process today.
- **Attach (interactive)** — additionally provide input and resolve tool
  approvals for the session.
- **Detach** — disconnect a client while the execution continues in the broker.

---

## 6. Requirements

### 6.1 Broker / hosting
- **R1** A single resident broker process hosts all executions; an execution's
  lifetime is bound to the broker, not to the requesting client.
- **R2** The broker exposes a local IPC API (unix domain socket) for clients.
- **R3** The broker maintains the registry of active executions
  (session id → execution handle + metadata), replacing the per-process
  in-memory `activeExecutions`.
- **R4** Clients may connect and disconnect freely without affecting running
  executions.

### 6.2 Control (cross-process)
- **R5** Any client can request a new execution against a new or existing
  session.
- **R6** Any client can cancel/interrupt a running execution by session id,
  regardless of which client started it. (Lifts `interrupt` from an in-process
  closure to broker-mediated.)
- **R7** Any client can resolve a pending tool approval for any session. (Lifts
  `resolveApproval` from an in-process map to broker-mediated; requests already
  surface via the event log.)
- **R8** Any client can interactively attach to a running session: receive live
  events and provide input/approvals.
- **R9** A client can detach without terminating the execution.

### 6.3 Observation
- **R10** Any client can list sessions/executions (`ps`) with status and summary
  metadata.
- **R11** Any client can read a session's status and event log, including
  follow/`--tail`.
- **R12** Observation continues to work via the existing event-sourced stream;
  the broker need not be the sole source of read data.

### 6.4 CLI
- **R13** A Docker-like CLI provides at minimum: `run`, `ps`, `status`,
  `log [--tail]`, `attach`, `cancel`.
- **R14** CLI commands support machine-readable output (`--json`).

### 6.5 Clients riding on top
- **R15** The REPL operates as a broker client: a REPL session can be detached,
  survives REPL exit, and can be re-attached later (from the REPL or another
  client).
- **R16** The console operates as a broker client rather than hosting executions
  in its own process.
- **R17** Engine, module, session, and event semantics are unchanged from a
  client's perspective except for *where* execution is hosted.

---

## 7. Definition of Done

The goal is met when all of the following are observably true:

1. A **broker process runs as a resident service** (LaunchAgent), start/stoppable
   via the existing service-management pattern, and reports health
   (`daemon status` equivalent).
2. **Starting an execution via the CLI** returns a session id immediately and the
   execution runs inside the broker.
3. **`ps` lists active sessions across all clients**; `status <id>` and
   `log <id> --tail` work for any session from any client.
4. **Cross-client control works both directions:** an execution started by one
   client (e.g. the REPL) can be observed, interactively attached, have a tool
   approval answered, and be cancelled from a *different* client (e.g. the CLI),
   and vice versa.
5. **Detach / re-attach works:** a REPL session can be detached, the execution
   continues in the broker, the REPL process can exit, and the session can be
   re-attached later (by the REPL or another client) with full live event
   visibility and interactive control.
6. **The console runs through the broker**, not via its own in-process
   `activeExecutions` registry.
7. **Cancel is reliable:** cancelling a session from any client interrupts the
   in-flight execution.
8. **Approvals are universal:** tool-approval requests are visible to all clients
   and resolvable by any client, and resolution reliably unblocks the hosted
   execution.
9. **No regression:** the one-shot path (`thinksuit-exec`), session/fork/trace
   semantics, and the test suite (at or above the current pass watermark) remain
   intact.
10. **All Section 8 open questions are resolved** and reflected in the
    implementation.

---

## 8. Open Questions / Decisions to Resolve

All resolved by the `thinksuit-broker` implementation (v1).

- **Q1 — Managed unit.** *Resolved: session only.* The `sessionId` is the managed,
  listable, attachable unit; all verbs key on it. No separate turn handle.
- **Q2 — Queue.** *Resolved: run-now only.* No scheduling/pending queue. A turn for
  a session already running is refused (409).
- **Q3 — One-shot path.** *Resolved: standalone.* `thinksuit-exec`
  (`engine/execute.js`) stays in-process and broker-independent, preserving
  zero-dependency scripting/CI. (Verified untouched.)
- **Q4 — Broker-down behavior.** *Resolved: refuse with a clear, actionable error.*
  No auto-start, no in-process fallback. The broker is a RunAtLoad LaunchAgent,
  so it is resident in practice. One code path.
- **Q5 — IPC contract.** *Resolved: HTTP over a unix domain socket* at
  `~/.thinksuit/broker.sock` (env override `THINKSUIT_BROKER_SOCK`) — JSON verbs
  (`run`, `sessions`, `status`, `log`, `interrupt`, `approve`, `health`) plus SSE
  for the `log --tail`/`attach` event stream.
- **Q6 — Multi-attach arbitration.** *Resolved: all observe; any may
  approve/interrupt; first resolution wins.* `resolveApproval` is idempotent;
  pending approvals are derived from the JSONL so any client can answer.
- **Q7 — Lock relationship.** *Resolved: the broker respects `acquireSession`.* The
  worker holds the session's busy lock for the turn; `sessions`/`status` reflect
  busy/ready via `getSessionStatus`.
- **Q8 — Broker-restart durability.** *Resolved: out of scope for v1.* A broker
  restart tears down its worker children and abandons in-flight runs; the JSONL
  trace persists as a record but cannot resume. No checkpoint/resume work.

### Hosting model (settled)

Hosting is **subprocess-per-turn**: the broker `fork()`s a worker Node process
per turn and never runs the engine in-process. This makes "a crashed run cannot
destabilize the daemon" structurally true and gives each worker its own
module-globals (`pendingApprovals`, MCP `activeClients`), so the previously-flagged
shared-state hazards do not apply.

### Workspace model (settled — absorbed from attractor)

Because execution is detached from any client shell, each **session has a
provisioned filesystem home** (attractor's per-run workspace, adapted to our
session unit):
- Default: a fresh workspace at `~/.thinksuit/workspaces/<sessionId>`
  (`THINKSUIT_WORKSPACE_DIR` override). `workdir <path>` instead binds the session
  to an existing directory via a symlink at the same path (attractor's
  `linkWorkspaceDir` shape). The directory's on-disk existence is the record —
  stable across turns/clients/restarts; no metadata bookkeeping.
- The resolved workspace is the engine `cwd` each turn, which already drives
  `allowedDirectories` and the baked-in filesystem MCP server's roots, so tool
  access is scoped to it.
- **`workdir` (session home) is distinct from `cwd` (client invocation dir).**
  They coexist: `workdir` anchors execution; `cwd` resolves relative inputs (e.g.
  a relative `--modules-package`). Surfaced as `Workdir:` in `status`.
- The one-shot `thinksuit-exec` is unchanged (no provisioning); child/sub-session
  workspace inheritance is deferred.

---

## 9. Out of Scope / Future

- Remote, networked, or multi-user operation.
- Any change to control-flow orchestration (ASL/rules) or adoption of attractor's
  pipeline/DAG model.
- Workflow-level / multi-stage authored graphs.

---

## 10. Relationship to Attractor

Attractor (sibling project) is the reference that motivated this spec. What we
adopt vs. reject is deliberate.

### Take directly (the backbone and operations model)
- **Daemon + thin-CLI over a unix domain socket** — attractor's
  `attractor-service` / `attractor-cli` split is the backbone shape this spec
  targets. Likely reuse the transport approach (Fastify over a unix socket).
- **The Docker-like verb set and feel** — `run`, `ps`, `status`, `log --tail`,
  `cancel`, plus `--json` for scripting.
- **Service-management scaffolding** — the LaunchAgent plist +
  `service.{init,load,start,stop,kill,logs,info}` scripts (already shared lineage
  with `thinksuit-tty`/`thinksuit-console`); reuse for the broker.
- **Human-in-the-loop as a daemon-mediated queue** (`queue` / `answer`) — the
  concrete model for cross-process tool-approval resolution (R7/R8), replacing
  the in-memory `pendingApprovals` map.

### Learn from / adapt (take the idea, build it ThinkSuit-native, decide timing)
- **Checkpoint/resume** — attractor has it; ThinkSuit does not. It is the gap
  behind broker-restart durability (a restart currently loses in-flight work;
  only the event log persists, as a record, not resumable state). Adopt the
  necessity; timing and scope are an open decision, not yet resolved in this spec.
- **Clean layer separation** — the broker should be its own package with a
  defined contract, not logic embedded in the console server (where the de-facto
  host lives today).
- **Run composition / parent-child supervision** (attractor's `swarm`) — relevant
  to recursive / sub-orchestration; learn now, defer adoption.

### Leave behind (deliberately)
- **DOT/Graphviz as the control-flow representation** — ThinkSuit keeps its ASL
  state machine + rules engine (restates §4).
- **The `.dot` template system.**
- **Run-as-primitive / goal→exit batch framing** — ThinkSuit's primitive remains
  the **session** (resumable, forkable, multi-turn). The Docker-like management
  UX is applied *to sessions*; ThinkSuit is not converted into a job-runner.
- **The absence of an interactive harness** — ThinkSuit's REPL is preserved and
  made a first-class broker client; attractor's fire-and-watch-only model is not
  copied.

### Through-line
Take attractor's **backbone and operations model**; leave its **control-flow
paradigm and job-unit framing**. Graft the former onto ThinkSuit's existing
session + ASL + rules core rather than replacing that core. The highest-value
lift is the **daemon + HITL-queue** pattern, because it directly resolves the
cross-process control gap.

---

## 11. References (grounding)

- Sibling project: *attractor* — `attractor-service` (daemon), `attractor-cli`
  (Docker-like CLI over unix socket).
- ThinkSuit code examined for current-state facts:
  - `packages/thinksuit/engine/schedule.js`, `engine/run.js`
  - `packages/thinksuit/engine/subscribe.js`,
    `engine/transports/session-router.js`
  - `packages/thinksuit/engine/approval/async.js`
  - `packages/thinksuit-console/src/routes/api/run/+server.js`
  - `packages/thinksuit-console/src/lib/server/activeExecutions.js`
