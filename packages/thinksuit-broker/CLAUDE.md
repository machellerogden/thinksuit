# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with the
ThinkSuit Broker package.

## Package Overview

**ThinkSuit Broker** - A resident daemon that hosts ThinkSuit executions
out-of-process over a unix domain socket, plus a thin client library and the
`thinksuit` subcommand surface. Turns the CLI/REPL/console into thin clients so
any of them can observe, control, and attach to any session.

**Status**: v1 functional. Data-plane (run/observe/interrupt/approve/attach)
verified end-to-end; restart durability and queueing are intentionally out of
scope.

## For Development Details

See **../../CONTRIBUTING.md** for repo-wide commands, architecture, and style.

## Package-Specific Notes

### Core design tenets

- **Subprocess-per-turn.** `broker.js` `fork()`s `worker.js` for each turn; the
  engine never runs in the daemon. Crash isolation is structural, and each worker
  owns its own module-globals (`engine/approval/async.js` map, `engine/mcp/client`
  `activeClients`). Do not move execution in-process.
- **Session is the unit.** Everything keys on `sessionId`; one in-flight turn per
  session (the engine's `acquireSession` lock is authoritative).
- **Refuse when down.** No auto-start, no in-process fallback. The client throws
  an actionable "broker not running" error.
- **Observation is filesystem-driven.** Tailing rides `subscribeToSession`
  (chokidar) + `readSessionLinesFrom`. Never poll for changes.

### File map

- `src/broker.js` — the daemon: socket HTTP server, in-memory registry of live
  turns, verb handlers, request-boundary error handling, worker-exit failsafe.
- `src/worker.js` — one turn per process. Receives a serializable config via
  fork IPC (`{type:'start', config}`), loads modules itself from `modulesPackage`,
  runs `schedule()`, handles `interrupt`/`resolve-approval` messages, flushes
  session streams, reports `started`/`done`/`error`/`failed`.
- `src/client.js` — client library over the socket (`run`, `sessions`, `status`,
  `log`, `tail`, `interrupt`, `interruptAll`, `approve`, `health`, plus `awaitTurn`
  and the pure `classifyTurnOutcome`). `awaitTurn` is the single home for the turn
  terminal contract (terminal set `turn.complete` / `session.interrupted` /
  `broker.worker.exited`; outcomes `completed | interrupted | failed | exited`).
- `src/approvals.js` — `derivePendingApproval(entries)` (latest unresolved
  approvalId) and `derivePendingApprovalDetail(entries)` (`{approvalId, tool,
  args}`). Both pure. `queue` aggregates the latter across live sessions.
- `src/paths.js` — socket path resolution (`THINKSUIT_BROKER_SOCK` or default).
- `bin/service.mjs` — daemon entry (also runnable directly for debugging).
- `service.js` — the service definition `thinkctl` (`thinksuit-control`) consumes to
  generate the LaunchAgent plist in code; `etc/secrets-pull.sh` — example secret puller.

### Workspaces

Each session has a filesystem home, provisioned by the worker **before**
`schedule()` (so the engine `cwd` is set correctly): `~/.thinksuit/workspaces/
<sessionId>` — a real dir by default, or a symlink when `workdir` binds an
existing directory. Provisioning is idempotent (`provisionWorkspace` in
`engine/sessions/index.js`); subsequent turns reuse it. The resolved workspace
becomes the engine `cwd` (→ allowedDirectories → filesystem MCP roots). `workdir`
(session home) is distinct from `cwd` (client invocation dir, used to resolve
relative inputs). `status`/`sessions` surface it via `getSessionWorkspace`.

### Gotchas

- **Config must be serializable.** The worker loads `modules` itself from the
  `modulesPackage` string — never send loaded module code over the socket.
- **`from` offset.** `run` returns the pre-run entry count; tail from it to
  observe only a new turn instead of replaying history (the REPL relies on this).
- **Completion signals.** `formatFinalResult` always emits `session.response` +
  `session.turn.complete` (success, failure, and interrupt). The broker also
  pushes a synthetic `broker.worker.exited` event to tail streams if a worker dies
  before emitting `turn.complete`, so clients never hang.
- **A bad request must not crash the daemon.** All handlers run behind a request
  boundary that converts throws into responses; keep it that way.
- **Credentials are resolved by name, never stored in `~/.thinksuit.json`.** The
  worker (`mergeProviderConfig`) fills any provider credential the client omitted
  via `resolveSecret(name)` (exported from `thinksuit`), which reads the
  environment first, then the vendor-neutral `~/.thinksuit/secrets.env`. Resolution
  is per-name, so a service only loads the keys it uses. If the selected provider
  has no credential anywhere, the worker **fails fast before acquiring a session**
  (sends `error` → 409) with an actionable message — never a silent half-session.
  How `secrets.env` is populated is the operator's concern (see
  `etc/secrets-pull.sh` for a 1Password example); thinksuit knows of no vendor.

### Testing (coding agents)

You cannot run the interactive REPL or a browser. Use the foreground broker plus
the one-shot client over a temp socket:

```bash
NODE=$(mise which node)
SOCK=/tmp/ts-broker-dev.sock
THINKSUIT_BROKER_SOCK="$SOCK" "$NODE" packages/thinksuit-broker/bin/service.mjs &  # daemon
curl -s --unix-socket "$SOCK" http://localhost/health
THINKSUIT_BROKER_SOCK="$SOCK" "$NODE" packages/thinksuit-cli/index.js run "hello"
```

Always use an isolated `THINKSUIT_BROKER_SOCK` for tests; never assume the default
socket is free. Unit tests live in `tests/broker.test.js` (run via the root
`vitest`).
