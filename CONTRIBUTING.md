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
npm run exec -- --allow-tool read_file --allow-tool write_file "Input"  # Restrict tools
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

**Core Flow**: Signal Detection → Rules Evaluation → Execution Planning → Instruction Composition → LLM Orchestration

**Key Components**:
- **State Machine**: `engine/machine.json` - ASL-like definition executed via Trajectory library
- **Signal Detection**: 16 signals across 5 dimensions using two-stage classifiers (regex + optional LLM)
- **Rules Engine**: Forward-chaining rules for role selection and adaptation
- **Handler Pattern**: Pure decision plane, effectful execution plane with explicit dependencies
- **Module System**: First-class modules provide classifiers, rules, prompts, and configuration

**Entry Points**:
- `engine/cli.js` - CLI interface
- `engine/schedule.js` - Primary programmatic API (`schedule()` function)
- `engine/sessions.js` - Session query API (`listSessions`, `getSession`, etc.)
- `engine/runCycle.js` - Pure function for executing cycles (internal)

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
find ~/.thinksuit -name '{traceId}.jsonl' | xargs cat | jq 'select(.event == "processing.output.generated" and .data.handler == "detectSignals") | .data.facts'  # Signals detected
find ~/.thinksuit -name '{traceId}.jsonl' | xargs cat | jq 'select(.event == "pipeline.rule_evaluation.trace") | .data.executionTrace[] | {rule: .ruleName, added: .factsAdded[].type}'  # Rules fired
find ~/.thinksuit -name '{traceId}.jsonl' | xargs cat | jq 'select(.event == "pipeline.plan_selection.complete") | .data.plan'  # Selected plan

# Additional useful queries
find ~/.thinksuit -name '{traceId}.jsonl' | xargs cat | jq 'select(.event | startswith("execution.sequential.step")) | {step: .data.step, role: .data.role}'  # Track sequential steps
find ~/.thinksuit -name '{traceId}.jsonl' | xargs cat | jq 'select(.event == "pipeline.rule_evaluation.trace") | .data.executionTrace[] | .ruleName' | sort | uniq -c  # Count rule firings
find ~/.thinksuit -name '{traceId}.jsonl' | xargs cat | jq 'select(.event == "processing.output.generated") | .data.facts[] | {type, confidence: .confidence?}'  # All facts with confidence
```

### Understanding Trace Data

ThinkSuit's trace files provide detailed execution insights. Key events to examine:

1. **Signal Detection**:
   - Event: `processing.output.generated` (handler: detectSignals)
   - Contains: Detected signals with confidence scores

2. **Rule Evaluation**:
   - Event: `pipeline.rule_evaluation.trace`
   - Contains: Complete rule execution history, facts added by each rule

3. **Plan Selection**:
   - Event: `pipeline.plan_selection.complete`
   - Contains: The selected execution plan

4. **Execution Details**:
   - Events: `execution.{strategy}.start/complete`
   - Contains: Role assignments, token usage, LLM responses

### Important Trace Patterns

- **Data is usually in `.data` field**, not at top level
- **Facts are logged at trace level** in `processing.output.generated` events
- **Rules fire even if not selected** - check which plan actually gets chosen
- **Tool enrichment happens late** - after initial plan creation
- **Cross-reference with code** when event structure is unclear
- **Signal competition** - When multiple signals in same dimension detected, highest confidence wins
- **Rule duplication** - Rules may fire multiple times in one execution
- **Hidden sequential steps** - `resultStrategy: 'last'` hides intermediate dialogue steps
- **System rules** - Look for `system:` prefixed rules that manage internal selection logic
- **All plans get enriched** - Tool enrichment applies to all created plans, not just selected one

## Development Workflow

### When Adding New Handlers (ThinkSuit)

1. Create handler core function in `engine/handlers/yourHandler.js`
2. Export as `yourHandlerCore` with signature `(input, machineContext)`
3. Add middleware wrapping in `engine/handlers/index.js`
4. Update state machine in `engine/machine.json` if needed

### When Working with Console UI

1. Use existing UI components from `src/lib/components/ui/`
2. Follow Svelte 5 patterns with runes (`$state`, `$derived`, `$props`)
3. Use `SvelteSet`/`SvelteMap` for reactive collections
4. Maintain module-agnostic design (no assumptions about specific signal values)

## Handler Contracts

### Pure Decision-Plane Handlers
```javascript
async function handlerCore(input, machineContext) {
    // input: { thread, context, facts? }
    // machineContext: { handlers, config, module, execLogger }
    const { module, config, execLogger } = machineContext;
    // Use module.classifiers, module.rules, module.prompts
    return { facts: Fact[] };
}
```

### Effectful Execution-Plane Handlers
```javascript
import { callLLM } from '../providers/io.js';

async function execHandlerCore(input, machineContext) {
    // input: { plan, instructions, thread, context, policy }
    const response = await callLLM(machineContext.config, {
        model, system, user, maxTokens, temperature
    });
    return { response: Response };
}
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
    "allowedTools": ["read_file", "write_file", "list_directory"]
}
```

## Testing Strategy

Three-tier testing architecture:
1. **Module Integration Tests**: Tests for module behavior with real components
2. **Pipeline Data Flow Tests**: `tests/integration/pipeline.test.js`
3. **Handler Unit Tests**: `tests/handlers/*.test.js`

## Code Style

- **Formatting**: 4 spaces, single quotes, semicolons required
- **ESLint**: Config in `eslint.config.js` (ESM format)
- **Vitest**: Test globals available (`describe`, `it`, `expect`, `vi`)
- **No comments**: Unless explicitly needed for clarity

## Key Architectural Principles

- **No Singletons**: Logger and config explicitly passed through `runCycle()`
- **Module-First**: Modules passed through `machineContext` to all handlers
- **Pure Functions**: Decision plane is side-effect free, execution uses `callLLM()` pure functions
- **Explicit Dependencies**: All dependencies passed explicitly for testability and parallel execution
- **Session Continuity**: Conversations stored in `~/.thinksuit/sessions/`
- **Span-Based Tracing**: Parent/child relationships tracked through execution

## Important Files

- `engine/machine.json` - State machine definition
- `engine/constants/defaults.js` - System defaults (DEFAULT_ROLE, token limits)
- `schemas/facts.v1.json` - Fact type definitions
- `schemas/plan.v1.json` - Execution plan schema
