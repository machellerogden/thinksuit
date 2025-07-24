# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.0.1-alpha.0] - 2025-01-09

### Added

- Initial alpha release of ThinkSuit
- Core orchestration engine (`thinksuit`)
  - State machine-based execution pipeline via Trajectory (ASL)
  - Signal detection and rules evaluation system
  - Session management with JSONL persistence to `~/.thinksuit/`
  - Provider abstraction supporting OpenAI and Vertex AI
  - Real-time event subscriptions
  - CLI interface for testing and development
- Behavioral modules system (`thinksuit-modules`)
  - Core.v0 module with cognitive roles and behaviors
  - Signal classifiers for contract, intent, calibration, claim, support, and temporal dimensions
  - Extensible rules engine
  - Prompt composition system
- Web console (`thinksuit-console`)
  - Session inspection and timeline visualization
  - Trace data exploration
  - Real-time monitoring via event subscriptions
  - Built with SvelteKit and Tailwind CSS v4
- MCP server (`thinksuit-mcp-server`)
  - Exposes ThinkSuit functionality to external MCP clients
  - Tools: thinksuit, signals, session, inspect
  - Compatible with Claude Desktop and other MCP clients
- MCP tools (`thinksuit-mcp-tools`)
  - Custom tool integrations consumed by ThinkSuit
- TTY package (`thinksuit-tty`)
  - Terminal component and WebSocket server
  - XTerm-based terminal emulator
- Comprehensive test suite
  - 411 passing tests across all packages
  - Integration tests for providers and handlers
- Apache 2.0 license

### Known Issues

- 7 dependency vulnerabilities (6 low, 1 high) - to be addressed in future release
- No CI/CD pipeline yet - planned for future release

[unreleased]: https://github.com/machellerogden/thinksuit/compare/v0.0.1-alpha.0...HEAD
[0.0.1-alpha.0]: https://github.com/machellerogden/thinksuit/releases/tag/v0.0.1-alpha.0
