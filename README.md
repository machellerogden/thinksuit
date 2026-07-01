# ThinkSuit

> An AI orchestration system that detects signals from conversation context and orchestrates AI responses through behavioral modules.

```txt
• • • • • • • • • • • • • • • • • • • • •
• • • • • • • • • • • • • • • • • • • • •
• •    ┯    • • • • • • • • • • • • • • •
• •  ╭─┴─╮  • ╺┳╸╻ ╻╻┏┓╻╻┏ ┏━┓╻ ╻╻╺┳  • •
• • ╭┤◐ ◐├╯ •  ┃ ┣━┫┃┃┗┫┣┻┓┗━┓┃ ┃┃ ┃  • •
• •  ╰┬─┬╯  •  ╹ ╹ ╹╹╹ ╹╹ ┗┗━┛┗━┛╹ ╹  • •
• •   ╯ ╰   • • • • • • • • • • • • • • •
• • • • • • • • • • • • • • • • • • • • •
• • • • • • • • • • • • • • • • • • • • •
```

[![Status: Alpha](https://img.shields.io/badge/status-alpha-orange.svg)](https://github.com/machellerogden/thinksuit)
[![API Stability: Experimental](https://img.shields.io/badge/stability-experimental-red.svg)](https://github.com/machellerogden/thinksuit)

> **Note**: ThinkSuit is alpha software under active development. APIs and behaviors may change without notice.

## Overview

ThinkSuit is a modular AI orchestration system that processes conversation context through a deterministic state machine pipeline. The system combines an orchestration engine with pluggable cognitive modules to enable adaptive AI responses based on detected conversation signals.

That engine is the kernel of a longer-term goal: ThinkSuit as a **personal operating system**. See [`docs/vision.md`](docs/vision.md) for the north star, [`docs/architecture-overview.md`](docs/architecture-overview.md) for what exists and what-goes-where, and [`docs/roadmap.md`](docs/roadmap.md) for the path between.

## Packages

This monorepo contains:

- **[`packages/thinksuit`](packages/thinksuit/)** - Core orchestration engine
  - State machine execution via Trajectory (ASL)
  - Session management with JSONL persistence
  - Provider abstraction for LLMs
  - Signal detection and rules evaluation pipeline
  - Real-time event subscriptions

- **[`packages/thinksuit-modules`](packages/thinksuit-modules/)** - Behavioral modules
  - Ships with `mu` module
  - Defines cognitive roles and behaviors
  - Provides classifiers, rules, and prompts
  - Extensible module system

- **[`packages/thinksuit-broker`](packages/thinksuit-broker/)** - Resident execution broker
  - Hosts sessions across processes; forks a worker per turn
  - Control channel: interrupt / approve / status / tail
  - Queue for HITL discovery; per-session workspace provisioning

- **[`packages/thinksuit-console`](packages/thinksuit-console/)** - Web-based debugging UI
  - Session inspection and timeline visualization
  - Trace data exploration
  - Real-time monitoring
  - Built with SvelteKit and Tailwind CSS v4

- **[`packages/thinksuit-cli`](packages/thinksuit-cli/)** - Interactive REPL
  - Rich terminal interface with commands
  - Session management and command history
  - Interactive tool approval workflow
  - Context-aware interrupt handling
  - Preserves terminal scrollback

- **[`packages/thinksuit-voice`](packages/thinksuit-voice/)** - Hands-free voice front door
  - Wake word → capture → speech-to-text → turn → spoken response
  - Multi-head wake detection + in-console wakeword studio (enroll/train)
  - Wakeword→action bindings; audio cues; turn interrupt

- **[`packages/thinksuit-tty`](packages/thinksuit-tty/)** - Terminal component + TTY server
  - Svelte `Terminal` component and a TTY WebSocket server

- **[`packages/thinksuit-mcp-tools`](packages/thinksuit-mcp-tools/)** - MCP tool integrations
  - Custom tools consumed BY ThinkSuit
  - Extensible tool system

- **[`packages/thinksuit-mcp-server`](packages/thinksuit-mcp-server/)** - MCP server
  - Exposes ThinkSuit TO external MCP clients (Claude Desktop, etc.)
  - Provides thinksuit, signals, session, and inspect tools

## Installation

```bash
# Clone and install dependencies
git clone https://github.com/machellerogden/thinksuit.git
cd thinksuit
npm install

# Link the thinksuit commands globally (`thinksuit`, `thinksuit-exec`)
npm link -ws

# Link the thinksuit command globally
npm -w thinksuit-cli link
```

## Quick Start

```bash
# Set your API key
export OPENAI_API_KEY="your-key"

# Start the interactive REPL
thinksuit

# Or from the monorepo
npm run start
```

### Other Interfaces

```bash
# Run the web console (development)
npm run tty       # First, start the tty service
npm run console   # Then, the console

# Run one-shot executor
npm run exec "Your input here" # or use the glboal: `thinksuit-exec "Your input here"`

# Run tests
npm run test

# Lint and format
npm run lint
npm run format
```


### Some useful examples...

```
thinksuit-exec --provider onnx --model ibm-granite/granite-4.0-h-1b "What is 6+7?"
thinksuit-exec --provider onnx --model Qwen/Qwen2.5-0.5B-Instruct "What is 6+7?"
thinksuit-exec --provider hugging-face --model moonshotai/Kimi-K2-Thinking:novita "What is 6+7?"
thinksuit-exec --provider hugging-face --model meta-llama/Llama-3.3-70B-Instruct "What is 6+7?"
```

### Running as Background Services (macOS)

ThinkSuit's core (engine, broker, modules) is platform-agnostic — the processes can be
supervised however your OS prefers. On macOS, you can run them as LaunchAgents: **broker**
(turn execution), **voice** (hands-free wake → speech), **console** (web UI), and **tty**
(terminal WebSocket). All four are managed by `thinkctl`, the operations control plane. Bring
them up with:

```bash
thinkctl up -a
```

`thinkctl` generates each LaunchAgent plist in code, builds the voice `.app` bundle (the macOS
microphone-permission shim), provisions the default `hey_thinksuit` wakeword, and — on
first setup — seeds the required keys in `~/.thinksuit.json` without overwriting your
existing values. Re-runnable and idempotent; pass `--yes` for non-interactive onboarding.
Run `thinkctl help` for the full verb list (`up`/`down`/`start`/`stop`/`status`/`ls`/`logs`).

**Two manual steps remain afterward:**

1. **Secrets** — create `~/.thinksuit/secrets.env` with your provider keys, then
   restart the broker:
   ```bash
   printf 'ANTHROPIC_API_KEY=sk-ant-...\nOPENAI_API_KEY=sk-...\n' > ~/.thinksuit/secrets.env
   chmod 600 ~/.thinksuit/secrets.env
   thinkctl start broker
   ```
2. **Microphone** — on first voice run macOS prompts for mic access; if not, grant
   "ThinkSuit Voice" under System Settings → Privacy & Security → Microphone.

See the **[Service Management Guide](docs/SERVICE_MANAGEMENT.md)** for per-service
operation, the restart policy, and troubleshooting.

## Development

This monorepo uses npm workspaces for package management. All dependencies are installed at the root level and automatically linked between packages.

### Working with packages

```bash
# Run commands in specific packages
npm -w thinksuit run test
npm -w thinksuit-console run dev
npm -w thinksuit-cli run start

# Or use the shortcuts in root package.json
npm run start           # runs interactive REPL
npm run exec "input"    # runs one-shot executor
npm run console         # runs console dev server
npm run test            # runs thinksuit tests
```

### Adding dependencies

```bash
# Add to specific package
npm install -w thinksuit some-package
npm install -w thinksuit-console some-package

# Add to root (for build tools, etc)
npm install -D some-dev-tool
```

## Documentation

- See [`packages/thinksuit-cli/README.md`](packages/thinksuit-cli/README.md) for interactive REPL documentation
- See [`packages/thinksuit/README.md`](packages/thinksuit/README.md) for ThinkSuit engine documentation
- See [`packages/thinksuit-console/README.md`](packages/thinksuit-console/README.md) for Console UI documentation

## License

Apache 2.0
