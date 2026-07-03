# ThinkSuit

> An AI orchestration engine that runs authored plans — composing an agent loop into sequences and parallels — through LLM orchestration using pluggable modules.

```txt
• • • • • • • • • • • • • • • • • • • • •
• • • • • • • • • • • • • • • • • • • • •
• •    ┯    • • • • • • • • • • • • • • •
• •  ╭─┴─╮  • ╺┳╸╻ ╻╻┏┓╻╻┏ ┏━┓╻ ╻╻╺┳  • •
• • ╭┤◐ ◐├╯ •  ┃ ┣━┫┃┃┗┫┣┻┓┗━┓┃ ┃┃ ┃  • •
• •  ╰┬─┬╯  •  ╹ ╹ ╹╹╹ ╹╹ ┗┗━┛┗━┛╹ ╹  • •
• •   ╯ ╰   • • • • • • • • • • • • • • •
• • • • • • • • • • • • • • • • • • • • •
• • • • • • • • • • • • • • • • • • • • •
```

## Overview

ThinkSuit is an orchestration engine that:

- Resolves an authored plan (a `task`/`sequence`/`parallel` node tree) and runs it
- Executes each `task` node as a round-bounded agent loop, composing loops into sequences and parallels
- Applies pluggable behavioral modules (roles, prompts, plan library) to shape responses
- Manages sessions with conversation continuity
- Provides provider abstraction for LLMs and tools

## Installation

```bash
# Install globally
npm install -g thinksuit

# Or install in your project
npm install thinksuit
```

## Quick Start

### One-Shot Command Line Usage

```bash
# Set up API key for OpenAI (if using OpenAI provider)
export OPENAI_API_KEY="your-key"

# OR set up Google Cloud for Vertex AI (if using Vertex AI provider)
gcloud auth application-default login
export GOOGLE_CLOUD_PROJECT="your-project-id"
# Optional: export GOOGLE_CLOUD_LOCATION="us-central1"  # Defaults to us-central1

# If installed globally or in node_modules/.bin
thinksuit-exec "What is quantum computing?"                                  # Basic usage (creates new session)
thinksuit-exec "Tell me more" --session-id 20250821T164513435Z-xXKTbcJ2     # Resume session
thinksuit-exec "Analyze this claim" --model gpt-4                            # Specify model (OpenAI)
thinksuit-exec "Analyze this claim" --provider vertex-ai --model gemini-2.5-pro  # Use Vertex AI
thinksuit-exec "Debug this" --trace                                          # Enable detailed tracing
thinksuit-exec --help                                                        # Show help

# For local development in this repository
npm run exec "What is quantum computing?"                                  # Basic usage (creates new session)
npm run exec "Tell me more" -- --session-id 20250821T164513435Z-xXKTbcJ2  # Resume session
npm run exec "Analyze this claim" -- --model gpt-4                         # Specify model (OpenAI)
npm run exec "Analyze this claim" -- --provider vertex-ai --model gemini-2.5-pro  # Use Vertex AI
npm run exec "Debug this" -- --trace                                       # Enable detailed tracing
npm run exec -- --help                                                     # Show help

# For interactive REPL, see the thinksuit-cli package

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

### Turn Flow

```
schedule() → run() → executeOnce()          # resolve plan: selectedPlan ?? module.defaultPlan
    → executePlan(rootNode, ctx)            # composer: dispatch by node.type, enforce policy
        → executeTask (task node)           # the agent loop: callLLM (+ tools) until done
        → recurse (sequence / parallel)     # compose loops; thread results via a context bag
```

There is no state machine. The composer (`executePlan`) dispatches a plan node by `type`,
recurses into composites, and threads each child's result to the next; `executeTask` is the
single effectful primitive. Modules are passed as first-class context, providing roles,
prompts, `composeInstructions`, and a plan library.

### Project Structure

```
engine/
  run.js                # Programmatic entry point (run())
  run/internals.js      # executeOnce(): resolves the plan, drives the composer
  execute.js            # One-shot CLI entry point (thinksuit-exec bin)
  config.js             # Configuration management with meow
  logger.js             # Structured logging with pino
  constants/
    defaults.js         # System defaults (DEFAULT_ROLE, token limits, DEFAULT_POLICY)
  handlers/
    executePlan.js      # The plan composer (task / sequence / parallel)
    executeTask.js      # The agent loop (one round-bounded task node)
    enforcePolicy.js    # Numeric policy guard (depth / fanout / children)
  plan/
    template.js         # $-template input expansion
  providers/            # LLM provider abstraction
    openai.js           # OpenAI-specific implementation
    index.js            # Provider factory
    io.js               # Pure functions for effectful operations
schemas/
  plan.v1.json          # Plan (node-tree) schema
  validate.js           # Schema validation functions
tests/                  # Comprehensive test suite
docs/
  API.md                # Complete API documentation
config.example.json     # Example configuration file
```

## Module System

Modules define the behavior executed by the engine. Each module provides:

- **Roles**: cognitive roles with temperature/token settings
- **Prompts**: system, primary, adaptation, and length prompts for those roles
- **`composeInstructions`**: builds the instruction thread for a plan node
- **Plan library**: the plans the module ships (including its `defaultPlan`)
- **Modalities / frames** (optional): per-modality instruction text and built-in frames

Modules are passed through `machineContext`, making them available to the composer and loop.

### Default Module

The system uses the `thinksuit/mu` module by default, which provides a structured cognitive architecture for conversational AI. For details on `mu`'s roles, prompts, and plan library, see the [thinksuit-modules package](../thinksuit-modules/README.md).

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

## Plan Node Types

A plan is a tree of three node types, executed by the composer:

### `task`
The one execution primitive: a round-bounded **agent loop**. Submits the composed thread to
the LLM; if the model requests tools, they are approved (unless `autoApproveTools`), executed
against the node's `tools` allowlist, and fed back; repeat until the model stops requesting
tools or a bound (`maxRounds` / `timeoutMs`) is hit. A single-pass response is just a `task`
with `maxRounds: 1`.

### `sequence`
Runs its `children` in order, threading each child's result into the next (via the shared
context bag and `$`-templates). Stops on a child error. `resultStrategy` selects what the
sequence returns (`last` by default).

### `parallel`
Runs its `children` concurrently, each with an isolated (cloned) context bag, then combines
results via `resultStrategy` (`label`/`formatted`/`concat`). Tolerates failed branches; errors
only if no branch succeeds.

Composites nest arbitrarily. Policy bounds them: `maxDepth` (recursion), `maxFanout` (parallel
branches), `maxChildren` (sequence steps).

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
--plan            Plan name to use (from the plans library)
--frame           Frame name to use (persistent context)
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

### Plans

A plan is a named execution plan in the **plans library**. Each plan is a
self-describing file under `~/.thinksuit/plans/<name>.json`, where the filename is
its address:

```json
// ~/.thinksuit/plans/my-custom-plan.json
// The file IS the root node — name/description inline, node fields at the root.
{
    "name": "My Custom Plan",
    "description": "A plan for common tasks with specific tools",
    "type": "task",
    "role": "execute",
    "tools": ["read_text_file", "read_media_file", "read_multiple_files", "write_file", "edit_file"],
    "maxRounds": 8,
    "timeoutMs": 60000,
    "params": { "lengthLevel": "standard", "maxTokens": 12000 }
}
```

A composite plan nests children:

```json
// ~/.thinksuit/plans/deep-analysis.json
{
    "name": "Deep Analysis",
    "description": "Investigate, then analyze, then synthesize",
    "type": "sequence",
    "resultStrategy": "last",
    "children": [
        { "type": "task", "role": "investigate", "tools": ["list_directory", "read_text_file"], "maxRounds": 5 },
        { "type": "task", "role": "analyze", "maxRounds": 3 },
        { "type": "task", "role": "synthesize", "maxRounds": 1 }
    ]
}
```

An optional `~/.thinksuit/plans.json` is an ordered array of names that sets
display order (it only orders; every file in the directory is available).

**Using plans:**

```bash
# Use a plan from the command line
thinksuit-exec --plan my-custom-plan "Analyze this code"

# The library merges module-shipped plans with your user plans
# Module plans ship inside the module; user plans live in ~/.thinksuit/plans/
```

**Creating plans:**

- Use the ThinkSuit Console UI to create and save plans interactively
- Or drop a `<name>.json` file into `~/.thinksuit/plans/`

### Frames

Frames provide persistent context that applies to all interactions within a session. Unlike plans (which define execution plans), frames inject contextual information into the system instructions.

Each frame is a Markdown file under `~/.thinksuit/frames/<name>.md` — YAML
frontmatter for metadata, body for the frame text:

```markdown
<!-- ~/.thinksuit/frames/code-review.md -->
---
name: Code Review Context
description: Context for reviewing pull requests
---
You are reviewing code in a TypeScript monorepo. Focus on type safety, error handling, and maintainability.
```

**Using frames:**

```bash
# Use a frame from the command line
thinksuit-exec --frame code-review "Review this function"

# Frames can be combined with plans
thinksuit-exec --frame docs-writer --plan analyze "Document this module"
```

**Creating frames:**

- Use the ThinkSuit Console UI to create and save frames interactively
- Or manually edit `~/.thinksuit.json` and add frames to the `frames` array

Modules can also define built-in frames which are merged with user frames at runtime.

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
npm test tests/handlers/executePlan.test.js

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

- Authored-plan orchestration end-to-end (composer + agent loop)
- Module system with pluggable behaviors
- Plan node types (task/sequence/parallel) with result strategies
- Policy enforcement (depth/fanout/children) and tool policy
- Session support with conversation continuity
- Span-based tracing for debugging
- Provider abstraction for LLMs
- Comprehensive test suite with vitest

## Documentation

- [API Reference](docs/API.md) - Complete API documentation
- [CLAUDE.md](CLAUDE.md) - Development guide for Claude Code

## Architecture Notes

- **Composer**: `executePlan` dispatches nodes by `type`, recurses into composites, threads results
- **Agent loop**: `executeTask` is the one effectful primitive (LLM calls + tool execution)
- **Policy**: numeric `enforcePolicyCore` at three composer points; `applyToolPolicy` at MCP discovery
- **Providers**: Pure functions with config as data
- **Sessions**: JSONL streams in `~/.thinksuit/sessions/streams/`, metadata in `/metadata/`
- **Tracing**: Span-based tracing with parent/child boundary relationships
- **Logger**: No singleton - explicitly threaded through `executeOnce`/`executePlan`
- **Config**: Direct passing (no nested ioConfig)
- **Modules**: Passed through `machineContext` to the composer + loop

## License

Apache 2.0
