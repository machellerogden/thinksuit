# CLAUDE.md - ThinkSuit Console

This file provides guidance to Claude Code when working with the ThinkSuit Console codebase.

## Package Overview

**ThinkSuit Console** - A web-based development and debugging interface for the ThinkSuit AI orchestration system. Provides session inspection, timeline visualization, and debugging capabilities.

**Purpose**: Enable developers to inspect, debug, and understand ThinkSuit's cognitive pipeline execution through visual tools.

**Status**: Initial implementation with session inspector functionality.

## For Development Details

See **../../CONTRIBUTING.md** for:
- Quick reference commands
- Architecture overview
- Development workflow
- Testing strategies
- Debugging and trace analysis
- Code style guidelines

## Package-Specific Notes

### SDK Boundaries

**Design principle**: the Console reaches ThinkSuit's *domain* data through package
SDKs, not raw filesystem access — so it stays agnostic to storage layout and
multiple UIs can share the same SDKs.

- **Session data** via `thinksuit`: `listSessions()`, `getSession(id)`,
  `getSessionMetadata(id)`, `subscribeToSession(id, callback)`.
- **Voice / wakeword data** via `thinksuit-voice` sub-exports (`./wakewords`,
  `./recorder`, `./session`, `./devices`, `./control`) — the wakeword store owns
  `~/.thinksuit/voice/` (manifests, samples, run-logs).
- **Turn execution** via `thinksuit-broker` (run/tail/interrupt/...).
- **Designations:** *reads* direct via `thinksuit` (`listDesignations()`);
  *writes* via `thinksuit-broker` (`setDesignation`). The broker is the single
  writer of `~/.thinksuit/state.json` — the console never writes it directly.

This keeps `~/.thinksuit/sessions/` and `~/.thinksuit/voice/` managed entirely by
ThinkSuit/voice core, not the Console.

**Exceptions (direct file I/O, by design):** a few endpoints own plain config files
rather than domain data — `api/config/user` reads/writes the user config
(`~/.thinksuit.json`) and `api/console/settings` manages the Console's own settings.
These touch the filesystem directly; domain data does not.

### Tech Stack
- **SvelteKit** - Framework for building the UI
- **Svelte 5** - Component framework with runes and reactive primitives
- **Tailwind CSS v4** - Utility-first CSS framework
- **Custom Hash Router** - Client-side routing with parameterized routes

### Development Guidelines

#### Working with Svelte 5
- Use runes (`$state`, `$derived`, `$props`) for reactivity
- Use `SvelteSet`/`SvelteMap` from `svelte/reactivity` for reactive collections
- Follow component prop patterns from existing UI library

#### Module-Agnostic Design
The UI is intentionally generic and not tied to specific ThinkSuit module implementations:
- Colors are based on data types (Signal, RoleSelection, etc.) not module-specific values
- No assumptions about specific signal dimensions or values
- Flexible enough to work with any ThinkSuit module

#### UI Component Library
Standardized components in `src/lib/components/ui/`:
- Consistent prop-based API with variants
- Semantic color system (success, warning, danger, etc.)
- See `docs/UI_COMPONENTS.md` for detailed documentation

### Important Implementation Notes

- **Session IDs**: Use timestamp-prefixed format: `20250821T164513435Z-xXKTbcJ2`
- **Event Types**: Expects `session.pending`, `session.input`, `session.response` events
- **UI Capabilities**: Read-only session viewing and inspection
- **Reactive Collections**: Require `SvelteSet`/`SvelteMap` from `svelte/reactivity`
