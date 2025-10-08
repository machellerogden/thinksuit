# ThinkSuit

> An AI orchestration system that detects signals from conversation context and orchestrates AI responses through behavioral modules.

```txt
• • • • • • • • • • • • • • • • • • • • •
• • • • • • • • • • • • • • • • • • • • •
• •    ╤    • • • • • • • • • • • • • • •
• •  ╭─┴─╮  • ╺┳╸╻ ╻╻┏┓╻╻┏ ┏━┓╻ ╻╻╺┳  • •
• • ╭│⚙·⚙│╯ •  ┃ ┣━┫┃┃┗┫┣┻┓┗━┓┃ ┃┃ ┃  • •
• •  ╰┬─┬╯  •  ╹ ╹ ╹╹╹ ╹╹ ┗┗━┛┗━┛╹ ╹  • •
• •   ╯ ╰   • • • • • • • • • • • • • • •
• • • • • • • • • • • • • • • • • • • • •
• • • • • • • • • • • • • • • • • • • • •
```

[![Status: Alpha](https://img.shields.io/badge/status-alpha-orange.svg)](https://github.com/machellerogden/thinksuit)
[![API Stability: Experimental](https://img.shields.io/badge/api%20stability-experimental-red.svg)](https://github.com/machellerogden/thinksuit)

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

- **[`packages/thinksuit-mcp-tools`](packages/thinksuit-mcp-tools/)** - MCP tool integrations
  - Custom tools consumed BY ThinkSuit
  - Extensible tool system

- **[`packages/thinksuit-mcp-server`](packages/thinksuit-mcp-server/)** - MCP server
  - Exposes ThinkSuit TO external MCP clients (Claude Desktop, etc.)
  - Provides thinksuit, signals, session, and inspect tools

## Quick Start

```bash
# Install all dependencies
npm install

# Run the CLI
npm run cli "Your input here"

# Run the web console
npm run console

# Run the MCP server
npm run mcp

# Run tests
npm run test

# Lint and format
npm run lint
npm run format
```

## Development

This monorepo uses npm workspaces for package management. All dependencies are installed at the root level and automatically linked between packages.

### Working with packages

```bash
# Run commands in specific packages
npm --workspace=thinksuit run test
npm --workspace=thinksuit-console run dev

# Or use the shortcuts in root package.json
npm run cli "input"     # runs thinksuit CLI
npm run console         # runs console dev server
npm run test           # runs thinksuit tests
```

### Adding dependencies

```bash
# Add to specific package
npm install --workspace=thinksuit some-package
npm install --workspace=thinksuit-console some-package

# Add to root (for build tools, etc)
npm install -D some-dev-tool
```

## Documentation

- See [`packages/thinksuit/README.md`](packages/thinksuit/README.md) for ThinkSuit engine documentation
- See [`packages/thinksuit-console/README.md`](packages/thinksuit-console/README.md) for Console UI documentation

## License

Apache 2.0
