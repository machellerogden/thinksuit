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

### SDK Boundary with ThinkSuit

**Critical Design Principle**: ThinkSuit Console uses ThinkSuit as an SDK and NEVER accesses the filesystem directly.

All session data is accessed through ThinkSuit's exported functions:
- `listSessions()` - Get available sessions with metadata
- `getSession(id)` - Retrieve full session data
- `getSessionMetadata(id)` - Get session preview (efficient)
- `subscribeToSession(id, callback)` - Real-time event stream

This boundary ensures:
- Console remains agnostic to storage implementation
- ThinkSuit can change storage without breaking console
- Clean testing boundaries
- Multiple UIs could use the same SDK

**File paths like `~/.thinksuit/sessions/` are managed entirely by ThinkSuit core.**

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
