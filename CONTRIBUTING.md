# CONTRIBUTING.md

This guide is for developers contributing to ThinkSuit. For AI assistant guidance, see CLAUDE.md.

## Getting Started

### Quick Reference Commands

```bash
# Install all dependencies (from root)
npm install

# Run ThinkSuit (Interactive REPL - Recommended for Development)
npm run start                                     # Start interactive session with commands

# Run ThinkSuit (One-Shot CLI - For Scripting and Trace Analysis)
npm run exec -- "Your input here"                  # Basic usage (creates new session)
npm run exec -- --session-id 20250821T164513435Z-xXKTbcJ2 "Follow-up"   # Resume
npm run exec -- --trace "Input" 2>&1 | tail -20    # Enable detailed tracing (shows sessionId/traceId)
npm run exec -- --allow-tool read_text_file --allow-tool read_media_file --allow-tool read_multiple_files --allow-tool write_file "Input"  # Restrict tools
npm run exec -- --allow-dir /path/to/project "Input"  # Restrict filesystem access
npm run exec -- --help                             # Show help

# Run Console UI
npm run console                                   # Development server on http://localhost:5173

# Testing
npm test                                          # Run ThinkSuit tests (watch mode)
npm test -- --run                                 # Run tests once
npm test -- --reporter=verbose                    # Verbose output
npm test -- engine/run/internals.test.js          # Test specific file
TEST_INTEGRATION=true npm test                    # Run with real API calls

# Code Quality
npm run lint                                      # Check linting issues
npm run lint:fix                                  # Auto-fix linting issues
npm run format                                    # Format with Prettier
npm run format:check                              # Check formatting
```

### Working with the Monorepo

```bash
# Run commands in specific packages
npm -w thinksuit run test
npm -w thinksuit-console run dev

# Add dependencies to specific packages
npm -w thinksuit install some-package
npm -w thinksuit-console install some-package
```

## Architecture Overview

### ThinkSuit Engine (`packages/thinksuit/`)

**Core Flow**: Resolve the plan (explicit `selectedPlan` override, else the module's
`defaultPlan`) → `executePlan` composes it → `executeTask` runs each `task` node (the agent
loop) → response.

**Key Components**:
- **Composer**: `engine/handlers/executePlan.js` - dispatches a plan.v1 node by `type`
  (`task`/`sequence`/`parallel`), recurses into composites, and threads results between
  siblings via a shared context bag
- **Agent loop**: `engine/handlers/executeTask.js` - the one effectful primitive; a
  round-bounded loop over `callLLM`/`callMCPTool`/`requestToolApproval`
- **Policy**: `engine/handlers/enforcePolicy.js` - a numeric guard checked at three composer
  points (depth at `executePlan` entry, fanout in parallel, children in sequence);
  `applyToolPolicy` filters tools at MCP discovery
- **Module System**: first-class modules provide roles, prompts, `composeInstructions`,
  `modalities`/`frames`, and a plan library — no classifiers/rules/facts

**Entry Points**:
- `engine/cli.js` - CLI interface
- `engine/schedule.js` - Primary programmatic API (`schedule()` function)
- `engine/sessions.js` - Session query API (`listSessions`, `getSession`, etc.)
- `engine/run/internals.js` - `executeOnce()` resolves the plan and drives `executePlan` (internal)

**Turn contract**: the turn boundary is schema-declared and validated at the entry
doors — `schemas/turnRequest.v1.json` (what a caller sends, validated via
`assertValidTurnRequest`) and `schemas/turnResult.v1.json` (what a caller gets).
The durable user file is the separate `schemas/userConfig.v1.json`. `workdir` is
session state fixed at session creation (default: the directory the command was run
from); `cwd` is the per-turn working dir defaulting to `workdir`; `allowedDirectories`
is the fence, defaulting to `[workdir]`.

### ThinkSuit Console (`packages/thinksuit-console/`)

**Tech Stack**: SvelteKit, Svelte 5 (with runes), Tailwind CSS v4

**Key Features**:
- Session inspection from `~/.thinksuit/sessions/`
- Timeline visualization of execution flow
- Trace data exploration
- Custom hash-based client-side routing

**Component Library**: Standardized UI components in `src/lib/components/ui/`

## Debugging & Trace Analysis

### Session Inspection

Sessions are stored in: `~/.thinksuit/sessions/streams/YYYY/MM/DD/HH/`

```bash
# Example: ~/.thinksuit/sessions/streams/2025/09/10/17/20250910T175117501Z-mbhklqnh.jsonl
cat ~/.thinksuit/sessions/streams/2025/09/10/17/*.jsonl | jq 'select(.event | startswith("session.")) | { event, msg }'
cat ~/.thinksuit/sessions/streams/2025/09/10/17/*.jsonl | jq 'select(.event == "session.created")'
```

### Trace Analysis (for debugging execution)

```bash
# Run with tracing and capture the traceId from output
npm run exec -- --trace "Your input" 2>&1 | tail -20  # Look for traceId in output

# Find and analyze the trace file
find ~/.thinksuit -name '20250923T203121308Z-IiQUmQ5_.jsonl' | xargs cat | jq '.event' | sort -u  # List all events
find ~/.thinksuit -name '{traceId}.jsonl' | xargs cat | jq 'select(.event | test("^execution\\.(task|sequential|parallel)\\.start$")) | {event, role: .data.role, depth: .data.depth}'  # Plan nodes executed
find ~/.thinksuit -name '{traceId}.jsonl' | xargs cat | jq 'select(.event == "processing.llm.response") | {role: .data.role, finishReason: .data.finishReason}'  # LLM exchanges
find ~/.thinksuit -name '{traceId}.jsonl' | xargs cat | jq 'select(.event | startswith("execution.tool.")) | {event, tool: .data.request.tool}'  # Tool calls

# Additional useful queries
find ~/.thinksuit -name '{traceId}.jsonl' | xargs cat | jq 'select(.event == "execution.task.complete") | {role: .data.role, rounds: .data.rounds, finishReason: .data.finishReason}'  # Per-task loop summary
find ~/.thinksuit -name '{traceId}.jsonl' | xargs cat | jq 'select(.event == "session.response") | select(.data.success == false) | .data'  # Failed/policy-blocked turn
```

### Understanding Trace Data

ThinkSuit's trace files provide detailed execution insights. Key events to examine:

1. **Plan node boundaries**:
   - Events: `execution.task.start/complete`, `execution.sequential.start/complete`,
     `execution.parallel.start/complete`
   - Contains: `role`, `depth`, step/branch counts, aggregated usage

2. **LLM exchanges**:
   - Events: `processing.llm.request` / `processing.llm.response`
   - Contains: role, thread, tools offered, output, `finishReason`

3. **Tool execution**:
   - Events: `execution.tool.start/requested/approved/executed/complete`
   - Contains: the tool request and its result

4. **Turn result**:
   - Event: `session.response`
   - Contains: final output, usage, `success` (false when a node errored or a policy
     limit blocked execution)

### Important Trace Patterns

- **Data is usually in `.data` field**, not at top level
- **Boundaries nest** - `parentBoundaryId` links task/tool/LLM spans to their composite
- **Cross-reference with code** when event structure is unclear
- **Hidden sequence steps** - `resultStrategy: 'last'` returns only the final step's output
- **Policy blocks** surface as a `session.response` with `success:false` and an error code
  (`E_DEPTH`/`E_FANOUT`/`E_CHILDREN`), not a crash
- **Each task owns its history** - siblings exchange results (final text) via the context bag,
  not transcripts

## Development Workflow

### When Extending Execution (ThinkSuit)

The execution path is two functions, not a handler registry:
1. `engine/handlers/executePlan.js` - the composer; add/adjust node-type dispatch here
   (`task`/`sequence`/`parallel`) and result-strategy handling
2. `engine/handlers/executeTask.js` - the agent loop; adjust round/tool/timeout behavior here
3. New plan-node shapes go in `schemas/plan.v1.json` (+ `schemas/validate.js`)

### When Working with Console UI

1. Use existing UI components from `src/lib/components/ui/`
2. Follow Svelte 5 patterns with runes (`$state`, `$derived`, `$props`)
3. Use `SvelteSet`/`SvelteMap` for reactive collections
4. Maintain module-agnostic design (no assumptions about specific role/plan values)

## Execution Contracts

### The composer — `executePlan(node, ctx)`
```javascript
// node: a plan.v1 node { type:'task'|'sequence'|'parallel', ... }
// ctx:  { machineContext, bag, thread, context, frame?, modality? }
// returns: { response: { output, usage, model, error?, ... } }
```

### The agent loop — `executeTask(input, machineContext)`
```javascript
import { callLLM } from '../providers/io.js';

// input: { node, thread, userInput, context }
// machineContext: { config, module, execLogger, abortSignal, discoveredTools }
// Loops callLLM (+ callMCPTool/requestToolApproval for tool rounds) until the model
// stops requesting tools or a bound (maxRounds/timeoutMs) is hit.
// returns: { response: { output, usage, model, finishReason, metadata } }
```

## Configuration

Multi-source configuration with precedence: CLI args > env vars > config file > defaults

**Environment Variables**:
```bash
OPENAI_API_KEY="your-key"    # Required for OpenAI provider
LOG_SILENT=true               # Suppress logging
THINKSUIT_TRACE=true         # Enable tracing
THINKSUIT_CONFIG="~/config.json"  # Custom config path
```

**Config File** (`~/.thinksuit.json`):
```json
{
    "module": "thinksuit/mu",
    "provider": "openai",
    "model": "gpt-4o-mini",
    "maxDepth": 5,
    "maxFanout": 3,
    "trace": false,
    "cwd": "/path/to/working/directory",
    "allowedDirectories": ["/path/to/working/directory", "/another/allowed/path"],
    "allowedTools": ["read_text_file", "read_media_file", "read_multiple_files", "write_file", "list_directory"]
}
```

## Testing Strategy

- **Composer/loop unit tests**: `tests/handlers/executePlan.test.js`,
  `tests/handlers/executeTask.test.js`, `tests/handlers/enforcePolicy.test.js`
- **Turn seam / contract (the bright line)**: `tests/engine/turn-execution.test.js`,
  `tests/schemas/turn-contract.test.js`, `tests/engine/schedule.test.js`
- **Module behavior**: `packages/thinksuit-modules/mu/tests/*`
- Run with real API calls via `TEST_INTEGRATION=true npm test`

## Code Style

- **Formatting**: 4 spaces, single quotes, semicolons required
- **ESLint**: Config in `eslint.config.js` (ESM format)
- **Vitest**: Test globals available (`describe`, `it`, `expect`, `vi`)
- **No comments**: Unless explicitly needed for clarity

## Key Architectural Principles

- **No Singletons**: Logger and config explicitly threaded through `executeOnce`/`executePlan`
- **Module-First**: Modules passed through `machineContext` to the composer + loop
- **Composition is structural**: the loop is the one effectful primitive; sequence/parallel
  compose it
- **Explicit Dependencies**: All dependencies passed explicitly for testability and parallel execution
- **Session Continuity**: Conversations stored in `~/.thinksuit/sessions/`
- **Span-Based Tracing**: Parent/child relationships tracked through execution

## Important Files

- `engine/handlers/executePlan.js` - the plan composer (task/sequence/parallel)
- `engine/handlers/executeTask.js` - the agent loop
- `engine/handlers/enforcePolicy.js` - the numeric policy guard
- `engine/constants/defaults.js` - System defaults (DEFAULT_ROLE, token limits, DEFAULT_POLICY)
- `schemas/plan.v1.json` - Plan (node-tree) schema
