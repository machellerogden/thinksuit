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

### Running the Console as a Background Service

On macOS, the web console can run as a persistent LaunchAgent service. The console requires both the console and TTY services to be running.

See the **[Service Management Guide](docs/SERVICE_MANAGEMENT.md)** for complete installation and operation instructions.

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
