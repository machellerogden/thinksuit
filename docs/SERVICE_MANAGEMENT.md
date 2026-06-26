# Service Management Guide (macOS)

ThinkSuit's core — the engine, broker, and modules — is platform-agnostic. The long-lived
processes can be supervised by whatever your operating system provides. This guide covers
one such path: running them as **macOS LaunchAgents**, which start at login, survive
reboots, and log to a predictable location. Everything here is local-only; nothing listens
beyond your machine.

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

## Installation

Run the macOS setup from the monorepo root:

```bash
npm run install:macos
```

It is idempotent and re-runnable. For each service it:

- detects machine-specific values (home, repo path, node binary) and renders the
  `etc/*.service.plist.template` files into `~/Library/LaunchAgents/`;
- builds the voice `.app` bundle — the microphone-permission shim (see
  [Microphone permission](#microphone-permission));
- provisions the default `hey_thinksuit` wakeword if none is present;
- seeds the keys ThinkSuit needs in `~/.thinksuit.json` (the local custom-tools MCP server,
  and — on first setup — `provider`/`model`/`allowedDirectories`) without overwriting
  values you already have;
- loads and starts all four LaunchAgents.

Flags: `--yes` runs non-interactively (keeps existing config, fills defaults only where
absent); `--no-load` does everything except start the services.

**Prerequisites:** macOS, Node ≥ 22, and the monorepo cloned with `npm install` already
run (the [root README](../README.md#installation) covers cloning and global command
links).

Two things the installer deliberately does **not** do — complete them afterward:
[Secrets](#secrets) and [Microphone permission](#microphone-permission).

### Manual setup (without the installer)

The installer is the supported path; this is the equivalent by hand, useful for
understanding or adapting it. Per service `<name>` ∈ {`broker`, `voice`, `console`, `tty`}:

1. Render `packages/thinksuit-<name>/etc/thinksuit-<name>.service.plist.template`,
   substituting the `{{HOME}}`, `{{REPO}}`, `{{NODE_BIN}}`, `{{NODE_DIR}}` placeholders
   (and, for console/tty, `{{CONSOLE_PORT}}`/`{{TTY_PORT}}`/`{{TTY_AUTH_TOKEN}}` — use the
   same token for both; for voice, `{{VOICE_APP_EXE}}`). Write the result to
   `~/Library/LaunchAgents/thinksuit-<name>.service.plist` and validate with
   `plutil -lint`.
2. Load and start it:
   ```bash
   launchctl bootstrap gui/$UID ~/Library/LaunchAgents/thinksuit-<name>.service.plist
   launchctl kickstart -k gui/$UID/thinksuit-<name>.service
   ```

Voice has two extra requirements the installer handles for you: the `.app` bundle
(`packages/thinksuit-voice/bin/service.appbundle.sh`) and at least one enabled wakeword
(`node packages/thinksuit-voice/bin/ctl.mjs wakeword import hey_thinksuit --phrase "Hey ThinkSuit" --model packages/thinksuit-voice/defaults/hey_thinksuit/model.onnx`).

## Secrets

Secrets are **never** stored in `~/.thinksuit.json`, and the installer does not provision
them — this step is always manual. ThinkSuit resolves each secret *by name* at startup:
from the **environment** first, then from a vendor-neutral **`~/.thinksuit/secrets.env`**
(`KEY=value` per line; override the path with `THINKSUIT_SECRETS_FILE`). Resolution is
per-name, so each service loads only the keys it uses — the voice and tty agents never see
`OPENAI_API_KEY`.

```bash
printf 'ANTHROPIC_API_KEY=sk-ant-...\nOPENAI_API_KEY=sk-...\n' > ~/.thinksuit/secrets.env
chmod 600 ~/.thinksuit/secrets.env
launchctl kickstart -k gui/$UID/thinksuit-broker.service   # reload so the worker sees them
```

How you populate the file is your concern — e.g. a 1Password `op inject` template. If the
selected provider has no credential anywhere, the broker worker fails fast with an
actionable error rather than starting a half-session.

## Microphone permission

macOS grants microphone access per code-signed bundle. A bare LaunchAgent pointed at
`node` has no bundle identity and is silently denied the mic (CoreAudio hands it
all-zero buffers and wake detection never fires). The voice service therefore runs through
a small ad-hoc-signed `.app` bundle built by `service.appbundle.sh` (a private copy of
`node` plus an `Info.plist` carrying the mic-usage string).

On the first voice run macOS should prompt for access; if it doesn't, enable
**"ThinkSuit Voice"** under **System Settings → Privacy & Security → Microphone**. The
grant is keyed to the bundle's cdhash, so it is per-machine and must be granted again on
each machine. The bundle is never committed — it's a ~112MB architecture-specific copy of
`node` and is always built locally.

## Managing a service

Each package exposes the same set of management commands, globally available after
`npm link -ws` (run from the root as part of the [main install](../README.md#installation)).
Substitute `<name>` ∈ {`broker`, `voice`, `console`, `tty`}:

| Command | Action |
|---|---|
| `thinksuit-<name>-service-init` | Reset logs, bootstrap, start, then tail logs (Ctrl-C to stop tailing; the service keeps running). Use for first run or troubleshooting. |
| `thinksuit-<name>-service-load` | Register with launchd (bootstrap) without starting. |
| `thinksuit-<name>-service-unload` | Unregister from launchd (bootout). |
| `thinksuit-<name>-service-start` | Start or restart (kickstart). |
| `thinksuit-<name>-service-stop` | Graceful stop (SIGTERM). |
| `thinksuit-<name>-service-kill` | Force kill (SIGKILL); use only when stop fails. |
| `thinksuit-<name>-service-logs` | Tail stdout + stderr (Ctrl-C to stop). |
| `thinksuit-<name>-service-info` | `launchctl print` — state, PID, configuration. |

If you didn't link the commands globally, the same operations are plain `launchctl`:

```bash
launchctl bootstrap gui/$UID ~/Library/LaunchAgents/thinksuit-<name>.service.plist  # load
launchctl kickstart -k gui/$UID/thinksuit-<name>.service                            # (re)start
launchctl bootout   gui/$UID/thinksuit-<name>.service                               # unload
launchctl print     gui/$UID/thinksuit-<name>.service                               # status
```

Logs are always at `~/Library/Logs/thinksuit-<name>.service.{stdout,stderr}.log`.

## Operations

**Editing a plist.** Re-running `npm run install:macos` re-renders every plist (reusing the
existing auth token) and reloads the services. To edit by hand, change the template, render
it into `~/Library/LaunchAgents/`, then `…-service-unload` and `…-service-load` so launchd
picks up the change — editing the loaded file alone has no effect.

**After pulling new code.** `npm install`, then restart the affected services
(`thinksuit-<name>-service-start`). The broker forks a fresh worker per turn, so most
engine changes take effect on the next turn without a restart.

## Troubleshooting

**Service won't start / `spawn scheduled` with no PID.** launchd can't exec the program.
Check `~/Library/Logs/thinksuit-<name>.service.stderr.log`, and confirm the plist's
`ProgramArguments` path exists — a node version that isn't installed, or (for voice) a
missing `.app` bundle, are the usual causes.

**Service keeps crashing.** Run it in the foreground to see the error directly:
`cd packages/thinksuit-<name> && node bin/service.mjs`. Confirm dependencies
(`npm install`) and that the plist's node path matches an installed version (`which node`).

**Voice: "no enabled wakewords".** Import the default:
`node packages/thinksuit-voice/bin/ctl.mjs wakeword import hey_thinksuit --phrase "Hey ThinkSuit" --model packages/thinksuit-voice/defaults/hey_thinksuit/model.onnx`,
then restart voice. Confirm with `… wakeword ls` (a `*` marks enabled).

**Voice: silent / never wakes.** Almost always the microphone grant — see
[Microphone permission](#microphone-permission).

**"Module requires tools not provided by MCP servers" (e.g. `roll_dice`).** The
`customTools` MCP server is missing from `~/.thinksuit.json`. Re-run `npm run install:macos`
(it seeds it), then restart the broker.

**Console can't reach the terminal.** Verify the tty service is running
(`thinksuit-tty-service-info`) and that console and tty share the same
`THINKSUIT_TTY_AUTH_TOKEN`. A clean re-render via the installer keeps them in sync.

**Port already in use.** `lsof -i :60660` (console) / `lsof -i :60662` (tty).

## Service lifecycle

```
plist in ~/Library/LaunchAgents/
        ↓  bootstrap (load)
        ↓  kickstart (start)
   service running
        ↓  SIGTERM (stop) / SIGKILL (kill)
        ↓  bootout (unload)
   unregistered
```

## License

Apache 2.0
