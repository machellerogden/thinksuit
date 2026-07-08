# Service Management Guide (macOS)

ThinkSuit's core — the engine, broker, and modules — is platform-agnostic. The long-lived
processes can be supervised by whatever your operating system provides. This guide covers
one such path: running them as **macOS LaunchAgents**, driven by **`thinkctl`**, ThinkSuit's
operations control plane. They start at login, survive reboots, and log to a predictable
location. Everything here is local-only; nothing listens beyond your machine.

> **Platform note.** `thinkctl`'s verbs and each package's `service.js` definition are
> platform-neutral; only the service *backend* (launchd plists + `launchctl`) is
> macOS-specific. launchd is the only backend today — Linux (systemd) and Windows are
> intended and would slot in behind the same commands without changing the interface.

## The services

ThinkSuit runs as four cooperating processes:

| Service | Role | Endpoint | Depends on |
|---|---|---|---|
| `thinksuit-broker` | Executes turns out-of-process (one worker per turn) over a unix socket. The hub every client talks to. | `~/.thinksuit/broker.sock` | — |
| `thinksuit-voice` | Hands-free loop: wake word → speech → turn → spoken response. Owns the microphone. | (none; client of broker) | broker |
| `thinksuit-tty` | Terminal WebSocket server. | `localhost:60662` | — |
| `thinksuit-console` | Web debugging/development UI. | `localhost:60660` | tty, broker |

The console embeds a terminal, so it needs the tty service; both share a
`THINKSUIT_TTY_AUTH_TOKEN`. The voice service and the CLI/console all reach execution
through the broker.

## The control plane: `thinkctl`

`thinkctl` (package `thinksuit-control`) is the single front door for service ops. It
discovers the four services from its own dependencies, generates each launchd plist **in
code** from a self-describing definition every service package exports
(`packages/thinksuit-<name>/service.js`), and owns the `launchctl` mechanics so you never
touch them directly.

Run `thinkctl help` for the full verb list. Address a service by short name (`broker`) or full
name (`thinksuit-broker`), or use `-a`/`--all` for every service.

## Installation

Bring everything up from the monorepo root:

```bash
thinkctl up -a
```

`up` is `install` + `load`. Install is idempotent and re-runnable; for each service it:

- generates `~/Library/LaunchAgents/thinksuit-<name>.service.plist` from the service
  definition (machine paths, ports, and the shared TTY token filled in), validated with
  `plutil -lint`;
- runs any per-service hooks — for voice, builds the `.app` bundle (the mic-permission
  shim, see [Microphone permission](#microphone-permission)) and provisions the default
  `hey_thinksuit` wakeword if none is present;
- on first setup, **onboards** `~/.thinksuit.json` — seeds the local custom-tools MCP
  server and, *only where a value is missing*, prompts for `provider`/`model`/
  `allowedDirectories`. A fully-configured machine is asked nothing, and nothing you've
  already set is overwritten.

`--yes` runs onboarding non-interactively (fills defaults only where absent). To stage
without starting, use `thinkctl install -a` then `thinkctl load -a`.

**Prerequisites:** macOS, Node ≥ 22, and the monorepo cloned with `npm install` already run.

Two things `thinkctl` deliberately does **not** do — complete them afterward:
[Environment](#environment-credentials--provider-settings) and
[Microphone permission](#microphone-permission).

## Environment (credentials & provider settings)

Credentials are **never** stored in `~/.thinksuit.json`, and `thinkctl` does not provision
them — this step is always manual. The **genai service** resolves each value *by name* at
boot: from the **environment** first, then from ThinkSuit's env file **`~/.thinksuit/.env`**
(`KEY=value` per line; override the path with `THINKSUIT_ENV_FILE`). The file is ThinkSuit's
environment, not just a secrets store — credentials and plain provider settings
(`GOOGLE_CLOUD_PROJECT`, `ONNX_DTYPE`, ...) alike. Only the genai daemon reads it for
provider credentials; the broker, workers, console, and voice never see a key.

```bash
printf 'ANTHROPIC_API_KEY=sk-ant-...\nOPENAI_API_KEY=sk-...\n' > ~/.thinksuit/.env
chmod 600 ~/.thinksuit/.env
thinkctl restart genai   # values are read once at boot
```

How you populate the file is your concern — e.g. a 1Password `op inject` template (see
`packages/thinksuit-genai/etc/env-pull.sh`). If the genai service is down, or the selected
provider has no credential anywhere, turns fail fast with an actionable error rather than
starting a half-session.

## Microphone permission

macOS grants microphone access per code-signed bundle. A bare LaunchAgent pointed at
`node` has no bundle identity and is silently denied the mic (CoreAudio hands it
all-zero buffers and wake detection never fires). The voice service therefore runs through
a small ad-hoc-signed `.app` bundle built by `service.appbundle.sh` (a private copy of
`node` plus an `Info.plist` carrying the mic-usage string). `thinkctl install voice` builds
it via the voice service's `preInstall` hook.

On the first voice run macOS should prompt for access; if it doesn't, enable
**"ThinkSuit Voice"** under **System Settings → Privacy & Security → Microphone**. The
grant is keyed to the bundle's cdhash, so it is per-machine and must be granted again on
each machine. The bundle is never committed — it's a ~112MB architecture-specific copy of
`node` and is always built locally.

## Managing a service

All ops go through `thinkctl` — never raw `launchctl`. Substitute `<svc>` with a name
(`broker`) or `-a`/`--all`:

| Command | Action |
|---|---|
| `thinkctl up <svc>` | install + load (bring up) |
| `thinkctl down <svc>` | unload + uninstall (tear down) |
| `thinkctl start <svc>` | start or restart (kickstart) |
| `thinkctl stop <svc>` | graceful stop (SIGTERM) |
| `thinkctl status [<svc>]` | launchd state + PID |
| `thinkctl ls` | list all services and their state |
| `thinkctl logs <svc>` | tail stdout + stderr (Ctrl-C to stop) |
| `thinkctl clear-logs <svc>` | delete the log files |
| `thinkctl install` / `uninstall` / `load` / `unload` | the primitives `up` / `down` compose |

Logs are always at `~/Library/Logs/thinksuit-<name>.service.{stdout,stderr}.log`.

### Restart policy

Only the **broker** auto-restarts on a crash — `KeepAlive={Crashed:true}`, throttled to
30s. It's the execution hub and safe to relaunch. `console`/`tty`/`voice` do **not**
auto-restart; a crash leaves them down until `thinkctl start <svc>`. A `thinkctl stop` is always
respected (SIGTERM is not a crash), so a stopped service stays stopped. There is no
"give up after N crashes" — a persistently-crashing broker re-launches every 30s until you
`thinkctl stop` it.

## Operations

**Editing a service.** Definitions live in code — `packages/thinksuit-<name>/service.js`
plus the generic plist generator in `thinksuit-control` — so there's nothing to hand-edit
in `~/Library/LaunchAgents/`. Change the definition, then `thinkctl up <name>` to regenerate
and reload.

**After pulling new code.** `npm install`, then `thinkctl start <svc>` for the affected
services. The broker forks a fresh worker per turn, so most engine changes take effect on
the next turn without a restart.

## Troubleshooting

**Service won't start / `spawn scheduled` with no PID.** launchd can't exec the program.
Check `~/Library/Logs/thinksuit-<name>.service.stderr.log`, and confirm the plist's
`ProgramArguments` path exists — a node version that isn't installed, or (for voice) a
missing `.app` bundle, are the usual causes. `thinkctl up <name>` regenerates the plist.

**Service keeps crashing.** Run it in the foreground to see the error directly:
`cd packages/thinksuit-<name> && node bin/service.mjs`. Confirm dependencies
(`npm install`) and that the plist's node path matches an installed version (`which node`).

**Voice: "no enabled wakewords".** Import the default:
`node packages/thinksuit-voice/bin/ctl.mjs wakeword import hey_thinksuit --phrase "Hey ThinkSuit" --model packages/thinksuit-voice/defaults/hey_thinksuit/model.onnx`,
then `thinkctl start voice`. Confirm with `… wakeword ls` (a `*` marks enabled).

**Voice: silent / never wakes.** Almost always the microphone grant — see
[Microphone permission](#microphone-permission).

**"Module requires tools not provided by MCP servers."** A module declares tool
dependencies the running MCP servers don't provide. The filesystem server is auto-provided
by the engine; the local custom-tools server comes from `mcpServers.customTools` in
`~/.thinksuit.json` (seeded by `thinkctl` onboarding). Fix the config, then `thinkctl start broker`.

**Console can't reach the terminal.** Verify the tty service is running (`thinkctl status tty`)
and that console and tty share the same `THINKSUIT_TTY_AUTH_TOKEN` — `thinkctl up -a` mints
the token once and reuses it across both, keeping them in sync.

**Port already in use.** `lsof -i :60660` (console) / `lsof -i :60662` (tty).

## Service lifecycle

```
thinkctl install  → plist in ~/Library/LaunchAgents/
thinkctl load     → bootstrap (register with launchd)
     RunAtLoad → service running
thinkctl stop     → SIGTERM (graceful)
thinkctl start    → kickstart (start / restart)
thinkctl unload   → bootout (unregister)
thinkctl uninstall→ remove plist

thinkctl up   = install + load        thinkctl down = unload + uninstall
```

## License

Apache 2.0
