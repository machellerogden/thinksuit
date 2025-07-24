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
→ Guards & Approval (pure)
→ Route (choice)
→ Execute (effectful: DoDirect/DoSequential/DoParallel/DoSingle)
→ Response
```

The state machine definition lives in `engine/machine.json` and is executed via Trajectory library.

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
