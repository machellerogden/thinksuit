# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with the ThinkSuit engine package.

## Package Overview

**ThinkSuit Engine** - The core orchestration engine that executes behavioral modules through a deterministic state machine, converting conversation context into execution plans.

**Status**: Fully functional with complete orchestration pipeline. Module system, signal detection, and all execution strategies working.

## For Development Details

See **../../CONTRIBUTING.md** for:
- Quick reference commands
- Architecture overview
- Handler contracts
- Development workflow
- Testing strategies
- Debugging and trace analysis
- Code style guidelines

## Package-Specific Notes

### Core Design Tenets

- **Decision Plane is pure; Execution Plane is effectful**
- **Everything explicit**: inputs, facts, plans, policies, events
- **Data over code**: schemas, rules, declarative plans
- **Provider-agnostic**: strict abstraction over model/tool backends

### Session Status Model

```javascript
SESSION_STATUS = {
    NOT_FOUND: 'not_found', // No file exists
    EMPTY: 'empty', // File exists but no content
    INITIALIZED: 'initialized', // Only session.pending event
    BUSY: 'busy', // Processing, not ready for input
    MALFORMED: 'malformed', // JSON not parseable
    READY: 'ready' // Ready for input
};
```

### State Machine Flow (ASL-like)

```
CheckSelectedPlan (choice: deterministic execution path)
→ DetectSignals (pure, policy-driven)
→ AggregateFacts (pure, deduplication & filtering)
→ EvaluateRules (pure, returns multiple plans)
→ SelectPlan (pure, deterministic selection)
→ ComposeInstructions (pure)
→ Route (choice)
→ Execute (effectful: DoDirect/DoSequential/DoParallel/DoTask)
→ Response
```

The state machine definition lives in `engine/machine.json` and is executed via Trajectory library.

**Policy limits are enforced in the execution plane, not the machine.** `runCycle`
bounds recursion depth via `enforcePolicyCore` before the machine runs (depth is a
runtime value that grows across nested exec calls, so the once-per-turn decision
plane can't see it); `execParallel`/`execSequential` bound fanout/children where
branches are spawned; `applyToolPolicy` filters tools against `config.allowedTools`
at MCP discovery. There is no rules-based enforcement step — the old no-op
enforcement rules were removed.

### Primary API

```javascript
import { schedule } from 'thinksuit';

// Schedule execution and get session ID immediately
const { sessionId, scheduled, execution } = await schedule({
    input: 'Your question here',
    apiKey: 'your-api-key',
    model: 'gpt-4o-mini',
    trace: false
});

// Option 1: Fire and forget (get session ID only)
console.log(`Session ${sessionId} started`);

// Option 2: Wait for completion
const result = await execution;
console.log(result.response);
```

**Note**: `run()` is an internal function, use `schedule()` as the primary API

### Turn contract (in / out)

The turn boundary is a declared, schema-validated contract — the source of truth is
the schemas, not prose:

- **`turnRequest`** (`schemas/turnRequest.v1.json`) — what a caller sends. Validated
  at the two entry doors (`engine/execute.js` for in-process `thinksuit-exec`, and
  `thinksuit-broker/src/worker.js` for everything that runs through the broker:
  console, MCP, `thinksuit run`, REPL, voice) via `assertValidTurnRequest`. Only
  surface fields — no secrets or runtime handles.
- **`turnResult`** (`schemas/turnResult.v1.json`) — what a caller gets back
  (`formatFinalResult`). Locked by a conformance test, not a per-turn runtime gate.
- **`userConfig`** (`schemas/userConfig.v1.json`) — the durable `~/.thinksuit.json`
  file. Distinct from the turn; validated on load.

**Directories.** `workdir` is **session state, fixed at creation** — a session gets
one home-base directory for its lifetime; to work somewhere else, start a new
session (the `provisionWorkspace` reject-on-mismatch enforces "set once"). It rides
in `turnRequest` only because sessions are created lazily on the first turn. Default:
the directory the command was summoned in (same rule for `thinksuit-exec`,
`thinksuit run`, REPL); a fresh workspace is provisioned only when there's no summon
location. `cwd` is the per-turn, caller-owned working directory (input + output),
defaulting to `workdir` and seeding the MCP spawn cwd + the prompt. `allowedDirectories`
is the fence (filesystem roots), defaulting to `[workdir]`; `workdir` itself is owned
space, not a fence.

### Session Query API

See `engine/sessions.js` for:
- `listSessions(options)` - Query available sessions
- `getSession(sessionId)` - Get full session data
- `getSessionMetadata(sessionId)` - Get session preview (efficient)
- `getSessionStatus(sessionId)` - Get current status
- `subscribeToSession(sessionId, onEvent)` - Real-time events

### Important Implementation Notes

- **No Singletons**: Logger and config explicitly passed through `runCycle()`
- **Module-First**: Modules passed through `machineContext` to all handlers
- **Pure Functions**: Decision plane is side-effect free, execution uses `callLLM()` pure functions
- **Explicit Dependencies**: All dependencies passed explicitly for testability
- **Session Continuity**: Conversations stored in `~/.thinksuit/sessions/`
- **Span-Based Tracing**: Parent/child relationships tracked through execution
