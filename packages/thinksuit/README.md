# ThinkSuit

> An AI orchestration engine that converts conversation context into execution plans via a deterministic state machine, then executes those plans through LLM orchestration using pluggable modules.

```txt
• • • • • • • • • • • • • • • • • • • • •
• • • • • • • • • • • • • • • • • • • • •
• •    ╤    • • • • • • • • • • • • • • •
• •  ╭─┴─╮  • ╺┳╸╻ ╻╻┏┓╻╻┏ ┏━┓╻ ╻╻╺┳  • •
• • ╭│◐ ◐│╯ •  ┃ ┣━┫┃┃┗┫┣┻┓┗━┓┃ ┃┃ ┃  • •
• •  ╰┬─┬╯  •  ╹ ╹ ╹╹╹ ╹╹ ┗┗━┛┗━┛╹ ╹  • •
• •   ╯ ╰   • • • • • • • • • • • • • • •
• • • • • • • • • • • • • • • • • • • • •
• • • • • • • • • • • • • • • • • • • • •
```

## Overview

ThinkSuit is an orchestration engine that:

- Executes behavioral modules through a deterministic state machine
- Detects conversation signals and evaluates rules defined by modules
- Manages sessions with conversation continuity
- Provides provider abstraction for LLMs and tools
- Executes via Trajectory runtime with ASL state machine definition

## Quick Start

```bash
# Install dependencies
npm install

# Set up API key for OpenAI (if using OpenAI provider)
export OPENAI_API_KEY="your-key"

# OR set up Google Cloud for Vertex AI (if using Vertex AI provider)
gcloud auth application-default login
export GOOGLE_CLOUD_PROJECT="your-project-id"
# Optional: export GOOGLE_CLOUD_LOCATION="us-central1"  # Defaults to us-central1

# Run the CLI
npm run cli "What is quantum computing?"                                  # Basic usage (creates new session)
npm run cli "Tell me more" -- --session-id 20250821T164513435Z-xXKTbcJ2  # Resume session
npm run cli "Analyze this claim" --model gpt-4                            # Specify model (OpenAI)
npm run cli "Analyze this claim" --provider vertex-ai --model gemini-2.5-pro  # Use Vertex AI
npm run cli "Debug this" --trace                                          # Enable detailed tracing
npm run cli --help                                                        # Show help

# Programmatic usage
import { schedule } from 'thinksuit';

// OpenAI example
const { sessionId, scheduled, execution, interrupt } = await schedule({
    input: 'What is quantum computing?',
    provider: 'openai',
    model: 'gpt-4o-mini',
    providerConfig: {
        openai: {
            apiKey: process.env.OPENAI_API_KEY
        }
    },
    sessionId: '20250821T164513435Z-xXKTbcJ2',  // Optional: resume existing session
    trace: true,                   // Optional: enable detailed tracing
});

// Vertex AI example
const { sessionId, scheduled, execution } = await schedule({
    input: 'What is quantum computing?',
    provider: 'vertex-ai',
    model: 'gemini-2.5-pro',
    providerConfig: {
        vertexAi: {
            projectId: process.env.GOOGLE_CLOUD_PROJECT,
            location: 'us-central1'  // Optional, defaults to us-central1
        }
    },
    trace: true
});

// Option 1: Wait for execution to complete
const result = await execution;
console.log(result.response);    // The LLM output
console.log(result.usage);       // Token usage stats

// Option 2: Interrupt execution (e.g., on user request)
// await interrupt('User cancelled');  // Gracefully stops execution

# Run tests
npm test                                           # Run all tests with vitest (watch mode)
npm test -- --run                                  # Run tests once without watch
TEST_INTEGRATION=true npm test                    # Run with real API calls
```

## Session Management

### Query Sessions

```javascript
import { listSessions, getSession, subscribeToSession } from 'thinksuit';

// List sessions with filtering
const sessions = await listSessions({
    fromTime: '2025-08-20T00:00:00Z',
    toTime: '2025-08-21T00:00:00Z',
    sortOrder: 'desc'
});

// Get full session data
const session = await getSession('20250821T164513435Z-xXKTbcJ2');

// Subscribe to real-time session events
const unsubscribe = subscribeToSession('20250821T164513435Z-xXKTbcJ2', (event) => {
    console.log('Session event:', event.type, event.data);
});

// Later: stop listening
unsubscribe();
```

Sessions are stored as JSONL files in `~/.thinksuit/sessions/streams/` with metadata in `~/.thinksuit/sessions/metadata/`. The timestamp-prefixed naming enables efficient chronological sorting and range queries.

## Architecture

### State Machine Flow

```
CheckStaticPlan (optimization) → DetectSignals → AggregateFacts → EvaluateRules → SelectPlan
    → ComposeInstructions → Guards → Route → Execute (Direct/Sequential/Parallel/Single)
```

The state machine is defined in `engine/machine.json` using Amazon States Language (ASL) syntax and executed via the Trajectory library. Modules are passed as first-class context through the state machine, providing classifiers, rules, prompts, and configuration to all handlers.

### Signal Detection

ThinkSuit provides a signal detection framework that modules use to analyze conversation context. Modules define their own signal taxonomies and classification strategies. The engine orchestrates the detection process and makes detected signals available to the rules evaluation system.

For details on the default module's signal taxonomy and classification approach, see the [thinksuit-modules documentation](../thinksuit-modules/README.md).

### Project Structure

```
engine/
  machine.json          # State machine definition
  runCycle.js           # Pure function for executing ThinkSuit cycles
  run.js                # Programmatic entry point
  cli.js                # CLI entry point (delegates to run.js)
  config.js             # Configuration management with meow
  logger.js             # Structured logging with pino
  constants/
    defaults.js         # System defaults (DEFAULT_ROLE, DEFAULT_INSTRUCTIONS)
  handlers/
    detectSignals.js    # Signal detection orchestrator (policy-driven)
    aggregateFacts.js   # Fact deduplication and filtering
    evaluateRules.js    # Rules evaluation (returns multiple plans)
    selectPlan.js       # Plan selection from candidates
  providers/            # LLM provider abstraction
    openai.js           # OpenAI-specific implementation
    index.js            # Provider factory
    io.js               # Pure functions for effectful operations
schemas/
  facts.v1.json         # Fact type definitions
  plan.v1.json          # Execution plan schema
  validate.js           # Schema validation functions
tests/                  # Comprehensive test suite
docs/
  API.md                # Complete API documentation
config.example.json     # Example configuration file
```

## Module System

Modules define the behavior executed by the engine. Each module provides:

- **Classifiers**: Signal detection logic for analyzing conversation context
- **Rules**: Forward-chaining rules that map signals to execution plans
- **Prompts**: System and primary prompts for cognitive roles
- **Configuration**: Temperature settings, token limits, and other parameters

Modules are passed through the state machine context, making them available to all handlers for consistent behavior configuration.

### Default Module

The system uses the `thinksuit/mu` module by default, which provides a structured cognitive architecture for conversational AI. For details on `mu`'s signal taxonomy, rules, and cognitive roles, see the [thinksuit-modules package](../thinksuit-modules/README.md).

### Using Custom Modules

To use custom modules, create a thin CLI wrapper that imports both `thinksuit` and your modules, then passes the modules object to `schedule()`:

```javascript
#!/usr/bin/env node
import { schedule } from 'thinksuit';
import { modules } from 'my-custom-modules';

async function main() {
    const input = process.argv.slice(2).join(' ');

    const { sessionId, execution } = await schedule({
        input,
        module: 'my/custom',
        modules,  // Pass pre-loaded modules object
        provider: 'openai',
        model: 'gpt-4o-mini',
        providerConfig: {
            openai: { apiKey: process.env.OPENAI_API_KEY }
        }
    });

    console.log(`[SESSION] ${sessionId}`);
    const result = await execution;
    console.log(result.response);
}

await main();
```

This approach provides:
- Direct static imports with clear dependency chains
- No dynamic package resolution
- Full control over module loading and configuration

For information on creating custom modules, see the [thinksuit-modules documentation](../thinksuit-modules/README.md).

## Execution Strategies

ThinkSuit supports multiple execution strategies that determine how the system orchestrates responses:

### Direct
Single-pass execution with a specific role. The simplest strategy for straightforward responses.

### Sequential
Multi-step execution where roles execute in order, optionally building a conversation thread between steps. Useful for complex reasoning that requires multiple perspectives in sequence.

### Parallel
Multiple roles execute simultaneously and results are combined. Efficient for gathering diverse perspectives on the same input.

### Single
Executes a single role without the full pipeline. Lightweight execution for simple tasks.

### Task
**Multi-cycle execution with tool usage and intelligent convergence.** This strategy enables the system to:
- Execute multiple cycles to complete complex tasks
- Use tools (file reading, searches, etc.) with results incorporated into context
- Automatically manage resource budgets (cycles, tokens, tool calls)
- Provide structured progress reports between cycles
- Naturally converge from exploration to synthesis as resources diminish

The task strategy uses a built-in thread reducer that provides:
- **Budget Status**: Clear indicators of remaining cycles, tokens, and tool calls
- **Recent Discoveries**: Summarized findings from tool usage
- **Detailed Results**: Full tool outputs for context
- **Philosophy-based guidance**: Module-defined principles for task execution rather than scripted warnings

This approach enables emergent convergence behavior where the LLM naturally transitions from investigation to conclusion based on context and remaining resources.

## Configuration

ThinkSuit supports multiple configuration sources with the following precedence:

1. **CLI arguments** (highest priority)
2. **Environment variables**
3. **Configuration file**
4. **Defaults** (lowest priority)

### CLI Options

```bash
--module, -m      Module to load (default: thinksuit/mu)
--provider, -p    LLM provider: openai, vertex-ai (default: openai)
--model           Model name (default: gpt-4o-mini for OpenAI, gemini-2.5-pro for Vertex AI)
--max-depth       Max recursion depth (default: 5)
--max-fanout      Max parallel branches (default: 3)
--max-children    Max child operations (default: 5)
--session-id      Session ID to resume or validate
--trace           Enable execution tracing
--silent          Suppress all logging
--verbose, -v     Verbose logging
--config, -c      Path to config file
--help            Show help
--version         Show version
```

### Environment Variables

```bash
# OpenAI Provider
OPENAI_API_KEY           # OpenAI API key (required for OpenAI provider)

# Vertex AI Provider
GOOGLE_CLOUD_PROJECT     # Google Cloud project ID (required for Vertex AI provider)
GOOGLE_CLOUD_LOCATION    # Google Cloud location (default: us-central1)

# General
ANTHROPIC_API_KEY        # Anthropic API key (for future Anthropic provider)
LOG_SILENT               # Suppress logging (same as --silent)
THINKSUIT_TRACE          # Enable tracing (same as --trace)
THINKSUIT_CONFIG         # Default config file path
```

### Configuration File

Create a JSON config file (default: `~/.thinksuit.json`):

**For OpenAI:**
```json
{
    "module": "thinksuit/mu",
    "provider": "openai",
    "model": "gpt-4o-mini",
    "maxDepth": 5,
    "maxFanout": 3,
    "maxChildren": 5,
    "verbose": false,
    "silent": false,
    "trace": false
}
```

**For Vertex AI:**
```json
{
    "module": "thinksuit/mu",
    "provider": "vertex-ai",
    "model": "gemini-2.5-pro",
    "maxDepth": 5,
    "maxFanout": 3,
    "maxChildren": 5,
    "verbose": false,
    "silent": false,
    "trace": false
}
```

**Note:** For Vertex AI, ensure you've authenticated with `gcloud auth application-default login` and set `GOOGLE_CLOUD_PROJECT` environment variable.

See `config.example.json` for a complete example.

## Development

### Testing

```bash
# Run all tests (vitest watch mode)
npm test

# Run tests once without watch
npm test -- --run

# Run with coverage
npm run test:coverage

# Run specific test files
npm test engine/handlers/detectSignals

# Run integration tests (requires API key)
TEST_INTEGRATION=true npm test
```

### Code Quality

```bash
# Linting
npm run lint
npm run lint:fix

# Formatting
npm run format
npm run format:check
```

### Development Tools

#### ThinkSuit Console

A separate web-based development tool for inspecting session and trace data:

```bash
# From monorepo root:
npm run console  # Runs on http://localhost:5173

# Or from the package directly:
cd packages/thinksuit-console
npm run dev
```

The UI provides:

- Session inspection with timeline visualization
- Trace data exploration
- Raw JSONL data viewing

Note: This is an exploratory tool in active development. Future planned web-based interfaces.

## API Reference

ThinkSuit provides a comprehensive API for execution, session management, and real-time monitoring.

### Execution API

#### `schedule(config)`

Primary entry point for executing ThinkSuit.

```javascript
// OpenAI example
const { sessionId, scheduled, execution } = await schedule({
    input: 'Your question here',
    provider: 'openai',
    model: 'gpt-4o-mini',
    providerConfig: {
        openai: {
            apiKey: 'your-api-key'
        }
    },
    sessionId: 'existing-session-id', // Optional: resume session
    trace: false // Optional: enable tracing
});

// Vertex AI example
const { sessionId, scheduled, execution } = await schedule({
    input: 'Your question here',
    provider: 'vertex-ai',
    model: 'gemini-2.5-pro',
    providerConfig: {
        vertexAi: {
            projectId: 'your-project-id',
            location: 'us-central1'  // Optional
        }
    },
    trace: false
});

// Immediate: get session ID
console.log(sessionId);

// Async: wait for completion
const result = await execution;
console.log(result.response);
```

### Session Query API

#### `listSessions(options)`

Query available sessions with filtering and sorting.

```javascript
const sessions = await listSessions({
    fromTime: '2025-08-20T00:00:00Z',
    toTime: '2025-08-21T00:00:00Z',
    sortOrder: 'desc' // or 'asc'
});
// Returns: Array of session metadata
```

#### `getSession(sessionId)`

Retrieve complete session data including all events.

```javascript
const session = await getSession('20250821T164513435Z-xXKTbcJ2');
// Returns: { id, status, entries, thread, metadata }
```

#### `getSessionMetadata(sessionId)`

Get session preview efficiently (O(1) operation).

```javascript
const metadata = await getSessionMetadata('session-...');
// Returns: { id, status, firstEvent, secondEvent, lastEvent }
```

#### `getSessionStatus(sessionId)`

Get current session status.

```javascript
const status = await getSessionStatus('session-...');
// Returns: 'ready' | 'busy' | 'empty' | 'not_found' | 'malformed'
```

### Session Fork API

#### `forkSession(sourceSessionId, forkPoint)`

Create a new session branching from an existing one.

```javascript
const { sessionId, success, error } = await forkSession(
    'source-session-id',
    5 // Fork at event index 5
);
```

#### `getSessionForks(sessionId)`

Get navigation structure for moving between forked sessions.

```javascript
const forks = await getSessionForks('session-...');
// Returns navigation structure with left/right siblings at fork points
```

### Subscription API

#### `subscribeToSession(sessionId, onEvent, onError)`

Subscribe to real-time session events.

```javascript
const unsubscribe = subscribeToSession(
    'session-...',
    (event) => console.log('Event:', event),
    (error) => console.error('Error:', error)
);

// Later: stop listening
unsubscribe();
```

### Utility API

#### `createLogger(options)`

Create a structured logger instance.

```javascript
const logger = createLogger({
    level: 'info',
    sessionId: 'session-...',
    traceId: 'trace-...'
});
```

#### `getSessionsDir()`

Get the sessions directory path.

```javascript
const dir = getSessionsDir();
// Returns: '~/.thinksuit/sessions/streams'
```

For complete API documentation with detailed examples, see [docs/API.md](docs/API.md).

## Implementation Status

✅ **Fully Working**

- Complete orchestration pipeline end-to-end
- Module system with pluggable behaviors
- Signal detection and rules evaluation
- All execution strategies (direct/sequential/parallel/single/task)
- Session support with conversation continuity
- Span-based tracing for debugging
- Provider abstraction for LLMs
- Comprehensive test suite with vitest

## Documentation

- [API Reference](docs/API.md) - Complete API documentation
- [CLAUDE.md](CLAUDE.md) - Development guide for Claude Code

## Architecture Notes

- **Runtime**: Trajectory library executing ASL state machine
- **Core Execution**: `runCycle()` pure function - no side effects, explicit dependencies
- **Handlers**: Pure decision plane, effectful execution plane
- **Signals**: Framework for signal detection (implementation defined by modules)
- **Rules**: The Rules Engine with forward-chaining inference
- **Providers**: Pure functions with config as data
- **Middleware**: Cross-cutting concerns (logging, metrics, budgets)
- **Sessions**: JSONL streams in `~/.thinksuit/sessions/streams/`, metadata in `/metadata/`
- **Tracing**: Span-based tracing with parent/child relationships
- **Logger**: No singleton - explicitly passed through runCycle
- **Config**: Direct passing to handlers (no nested ioConfig)
- **Modules**: Passed through machineContext to all handlers
- **Optimization**: CheckStaticPlan bypasses signal detection for recursive calls

## License

Apache 2.0
