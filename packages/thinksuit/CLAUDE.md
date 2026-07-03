# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with the ThinkSuit engine package.

## Package Overview

**ThinkSuit Engine** - The core orchestration engine that executes behavioral modules by resolving an authored plan (a plan.v1 node tree) and running it through the agent loop + composer.

**Status**: Fully functional. Module system, plan composition (task/sequence/parallel), and the agent loop all working.

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

- **Composition is structural; the loop is the one effectful primitive**
- **Everything explicit**: inputs, plans, policies, events
- **Data over code**: schemas, declarative plans
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

### Turn Flow (loop + composer)

A turn resolves a plan.v1 node tree and executes it — there is no state machine.

```
run() → executeOnce() (run/internals.js) → executePlan(rootNode, ctx)
```

- **`executePlan`** (`engine/handlers/executePlan.js`) is the composer: it dispatches a
  node by `type` — `task` (the agent loop), `sequence`, or `parallel`. Composites recurse
  into `executePlan` per child; a shared context bag threads results (final text) between
  siblings — sequence shares the bag, parallel clones it per branch.
- **`executeTask`** (`engine/handlers/executeTask.js`) is the one execution primitive: a
  round-bounded agent loop calling `callLLM`/`callMCPTool`/`requestToolApproval` directly.
- The plan node is either an explicit `config.selectedPlan` override or the module's
  `defaultPlan`, resolved in `executeOnce` and passed straight to `executePlan`.

**Policy limits are enforced at three composer points** via the single numeric
`enforcePolicyCore` (`engine/handlers/enforcePolicy.js`): depth at `executePlan` entry
(bounds recursion — depth grows per descent, so it's checked at every node), fanout in
`executeParallel` (branch count), children in `executeSequence` (step count). A block
returns a normal error response (`policyBlocked`, code `E_DEPTH`/`E_FANOUT`/`E_CHILDREN`).
`applyToolPolicy` filters tools against `config.allowedTools` at MCP discovery.

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

- **No Singletons**: Logger and config explicitly threaded through `executeOnce`/`executePlan`
- **Module-First**: Modules passed through `machineContext` to the composer + loop
- **Explicit Dependencies**: All dependencies passed explicitly for testability
- **Session Continuity**: Conversations stored in `~/.thinksuit/sessions/`
- **Span-Based Tracing**: Parent/child relationships tracked through execution
