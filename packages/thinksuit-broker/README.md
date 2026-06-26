# ThinkSuit Broker

A resident daemon that hosts ThinkSuit executions out-of-process, plus a thin
client library and CLI surface. The broker lets any client (CLI, REPL, console)
observe, control, and attach to **any** session regardless of which client
started it.

## Why

Without the broker, every entry point hosts its own executions: the console runs
them detached in its own process, the REPL runs them in-process and loses them on
exit, and `thinksuit-exec` runs one-shot. Observation is already cross-process
(the JSONL event log plus `subscribeToSession` file-watching), but **control** is
process-bound: interrupt is an in-memory `AbortController` and tool approvals live
in an in-memory map. The broker makes hosting and control cross-process too.

## Architecture

- **Subprocess-per-turn.** The broker `fork()`s a worker Node process for each
  turn and never runs the engine in-process. A crashed run cannot destabilize the
  daemon, and each worker owns its own module-globals (tool-approval map, MCP
  clients).
- **Managed unit = session.** Everything is keyed by `sessionId`. One in-flight
  turn per session, enforced by the engine's `acquireSession` lock.
- **Transport = HTTP over a unix domain socket** at `~/.thinksuit/broker.sock`
  (override with `THINKSUIT_BROKER_SOCK`). JSON for verbs; Server-Sent Events for
  the live event stream.
- **Observation = the JSONL event log.** Tailing/attaching is driven entirely by
  `subscribeToSession` file-watch events — the broker never polls.

```
client ──HTTP/JSON+SSE──▶ broker (daemon) ──fork()──▶ worker (one per turn)
                              │                            │
                              └── registry of live turns   └── writes session JSONL
```

## Command surface

The existing `thinksuit` binary is a subcommand dispatcher (bare `thinksuit`
still launches the REPL):

| Command | Description |
| --- | --- |
| `thinksuit run "<input>" [--workdir <path>] [--require-approval] [--json]` | Start a broker-hosted turn; prints the `sessionId` immediately (detached). `--workdir` binds the session to an existing directory (else a fresh workspace is provisioned). |
| `thinksuit ps [-a/--all] [--json]` | List **active** sessions; `-a` also includes on-disk history. (Docker-style view verb over the `/sessions` resource.) |
| `thinksuit queue [--json]` | List sessions blocked awaiting a tool approval (the HITL queue). |
| `thinksuit status <id> [--json]` | Current status of a session. |
| `thinksuit log <id> [--tail]` | Print recorded events; `--tail` streams live. |
| `thinksuit attach <id>` | Interactively observe + approve/interrupt + submit the next turn. |
| `thinksuit interrupt <id> \| --all/-a [--json]` | Interrupt the in-flight turn; `--all`/`-a` interrupts **every** live turn at once (the broker stays up). |
| `thinksuit approve <id> [approvalId] [--deny]` | Resolve a pending tool approval (id derived from the log if omitted). |

When the broker is not running, clients **refuse with a clear error** — there is
no auto-start and no in-process fallback.

`interrupt --all` stops in-flight *work* but leaves the daemon running; taking the
*daemon* itself down is the separate service concern below
(`thinksuit-broker-service-stop` / SIGTERM, which cascade-kills its workers).

## Service management (macOS LaunchAgent)

The broker is intended to be resident (RunAtLoad). Scaffolding mirrors the other
ThinkSuit services:

```bash
thinksuit-broker-service-init    # bootstrap + start + tail logs (first run)
thinksuit-broker-service-start   # (re)start
thinksuit-broker-service-stop    # stop
thinksuit-broker-service-logs    # tail logs
thinksuit-broker-service-info    # launchctl print
```

On macOS, run `npm run install:macos` from the monorepo root to render
`etc/thinksuit-broker.service.plist.template` (filling in machine-specific paths)
into `~/Library/LaunchAgents/` and load it. To do it by hand, substitute the
`{{…}}` placeholders in the template yourself and copy it there before
`…-service-init`.

## Configuration & secrets

Provider/model selection lives in `~/.thinksuit.json` (and can be overridden
per run). **Secrets never live in `~/.thinksuit.json`.** thinksuit resolves each
secret *by name* at startup: from the **environment** first, then from a
vendor-neutral **`~/.thinksuit/secrets.env`** (`KEY=value`, override the path with
`THINKSUIT_SECRETS_FILE`). Resolution is per-name, so a service only ever loads
the keys it actually uses — the voice and tty agents never see `OPENAI_API_KEY`.

How `~/.thinksuit/secrets.env` gets populated is **your** concern, not
thinksuit's: a secrets manager, a Keychain reader, hand-editing — anything that
writes the file. Because it persists on disk, services read it at startup with
**no per-reboot step** and no shared-environment leakage; the only tradeoff is a
`600` file at rest.

`etc/secrets-pull.sh` is an **example** (not an installed command) that
materializes the file from 1Password via `op inject` — copy and adapt it, or
replace it with whatever your setup uses:

```bash
# with your 1Password app unlocked (approve once), from the broker package:
./etc/secrets-pull.sh
```

If a selected provider's key is set nowhere, the worker fails fast before
acquiring a session with a clear *"No credential for provider …"* message —
never a silent half-session.

For a foreground instance during development:

```bash
npm -w thinksuit-broker run dev
```

## Workspaces

Because the broker runs detached from any client shell, each **session gets its
own filesystem home** rather than landing in whatever directory a client happened
to be in:

- **Default:** a fresh per-session workspace is provisioned at
  `~/.thinksuit/workspaces/<sessionId>` (override the base with
  `THINKSUIT_WORKSPACE_DIR`).
- **`--workdir <path>`:** binds the session to an existing directory — the
  workspace path becomes a symlink to it. Uniform: a session's home is always
  `~/.thinksuit/workspaces/<sessionId>`, resolved.
- The resolved workspace is the session's working directory for **every turn**
  (stable across turns, clients, and broker restarts — the directory's existence
  on disk is the record). It scopes filesystem tools: it becomes the engine
  `cwd`, which defaults `allowedDirectories` and the filesystem MCP server's roots.
- `thinksuit status <id>` shows it as `Workdir: …`.

This is distinct from `cwd` (the client's *invocation* directory, still used to
resolve relative inputs like a relative `--modules-package`): `workdir` is the
session's home; `cwd` is where you called from.

## Socket API

All responses are JSON `{ ok, ... }`. Streaming endpoints use SSE.

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/health` | Liveness: `{ ok, pid, version, uptimeMs, sessions }`. |
| `POST` | `/run` | Body `{ config }` (serializable run config). Returns `{ sessionId, isNew, status, from }`. 409 if the session already has an in-flight turn. |
| `GET` | `/sessions[?all=1]` | Active sessions; `all=1` includes on-disk history. |
| `GET` | `/queue` | Live sessions awaiting a tool approval: `[{ sessionId, approvalId, tool }]`. |
| `GET` | `/status/:id` | `{ sessionId, status, live }`. |
| `GET` | `/log/:id[?tail=1][&from=N]` | Recorded events; `tail=1` streams via SSE; `from=N` starts at entry index N. |
| `POST` | `/interrupt/:id` | Interrupt the in-flight turn. |
| `POST` | `/interrupt?all=1` | Interrupt every live turn; returns `{ interrupted: [id], count }`. |
| `POST` | `/approve/:id` | Body `{ approved, approvalId? }`. Resolves a pending approval (latest pending derived from the log if `approvalId` omitted). |

A bad request never crashes the daemon — handler errors become 4xx/5xx
responses at the request boundary.

## Client library

```js
import * as broker from 'thinksuit-broker';

const { sessionId } = await broker.run(config);
const active = await broker.sessions();          // { all: true } for history
const handle = broker.tail(sessionId, (e) => …); // SSE; handle.close()
await broker.interrupt(sessionId);
await broker.interruptAll();                      // stop every live turn; broker stays up
await broker.approve(sessionId, { approved: true });

// Await a single turn — the one place the turn terminal contract lives.
const { outcome } = await broker.awaitTurn(sessionId, { from, onEvent });
// outcome ∈ 'completed' | 'interrupted' | 'failed' | 'exited'
```

## Limitations (v1)

- **No restart durability.** A broker restart tears down its worker children and
  abandons in-flight runs; the JSONL trace persists but cannot resume.
- **No queue.** Run-now only; a second turn for a running session is refused.
- `thinksuit-exec` (one-shot) stays standalone and broker-independent.

## License

Apache-2.0
