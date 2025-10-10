# ThinkSuit API Reference

Complete API documentation for the ThinkSuit AI orchestration system.

## Table of Contents

- [Execution API](#execution-api)
- [Session Query API](#session-query-api)
- [Session Fork API](#session-fork-api)
- [Trace API](#trace-api)
- [Subscription API](#subscription-api)
- [Utility API](#utility-api)
- [Types and Constants](#types-and-constants)

## Execution API

### `schedule(config)`

Primary entry point for executing ThinkSuit. Handles session creation, resumption, and forking automatically.

#### Parameters

| Parameter                               | Type      | Required | Description                                                         |
| --------------------------------------- | --------- | -------- | ------------------------------------------------------------------- |
| `config`                                | `Object`  | Yes      | Configuration object                                                |
| `config.input`                          | `string`  | Yes      | User input to process                                               |
| `config.apiKey`                         | `string`  | Yes\*    | API key for LLM provider (\*unless in env)                          |
| `config.model`                          | `string`  | No       | Model name (default: 'gpt-4o-mini')                                 |
| `config.provider`                       | `string`  | No       | Provider name (default: 'openai')                                   |
| `config.sessionId`                      | `string`  | No       | Existing session to resume                                          |
| `config.sourceSessionId`                | `string`  | No       | Session to fork from                                                |
| `config.forkFromIndex`                  | `number`  | No       | Event index to fork at                                              |
| `config.module`                         | `string`  | No       | Module name (default: 'thinksuit/mu')                       |
| `config.trace`                          | `boolean` | No       | Enable tracing (default: false)                                     |
| `config.policy`                         | `Object`  | No       | Execution policy constraints                                        |
| `config.policy.maxDepth`                | `number`  | No       | Max recursion depth (default: 5)                                    |
| `config.policy.maxFanout`               | `number`  | No       | Max parallel branches (default: 3)                                  |
| `config.policy.maxChildren`             | `number`  | No       | Max child executions (default: 5)                                   |
| `config.policy.perception`              | `Object`  | No       | Signal detection policy                                             |
| `config.policy.perception.profile`      | `string`  | No       | Detection profile: 'fast', 'balanced', 'thorough' (default: 'fast') |
| `config.policy.perception.budgetMs`     | `number`  | No       | Time budget for signal detection in ms (default: 150)               |
| `config.policy.perception.dimensions`   | `Object`  | No       | Per-dimension filtering configuration                               |
| `config.policy.selection`               | `Object`  | No       | Plan selection policy                                               |
| `config.policy.selection.preferLowCost` | `boolean` | No       | Prefer simpler plans (default: false)                               |
| `config.policy.selection.riskTolerance` | `string`  | No       | Risk tolerance: 'low', 'medium', 'high' (default: 'medium')         |

#### Returns

```typescript
Promise<{
    sessionId: string; // Session identifier
    scheduled: boolean; // Whether execution was scheduled
    isNew: boolean; // Whether this is a new session
    isForked: boolean; // Whether this session was forked
    execution: Promise<Result>; // Promise for execution completion
    reason?: string; // Error reason if scheduling failed
}>;
```

#### Examples

**Basic Usage**

```javascript
import { schedule } from 'thinksuit';

const { sessionId, execution } = await schedule({
    input: 'What is quantum computing?',
    apiKey: process.env.OPENAI_API_KEY
});

const result = await execution;
console.log(result.response);
```

**Resume Session**

```javascript
const { sessionId, execution } = await schedule({
    input: 'Tell me more about that',
    sessionId: '20250821T164513435Z-xXKTbcJ2'
});
```

**Fork Session**

```javascript
const { sessionId, execution } = await schedule({
    input: 'What if we tried a different approach?',
    sourceSessionId: '20250821T164513435Z-xXKTbcJ2',
    forkFromIndex: 5 // Fork after the 5th event
});
```

**With Custom Policy**

```javascript
const { sessionId, execution } = await schedule({
    input: 'Analyze this complex claim',
    apiKey: process.env.OPENAI_API_KEY,
    policy: {
        perception: {
            profile: 'thorough', // More detailed analysis
            budgetMs: 500, // Allow more time
            dimensions: {
                claim: { minConfidence: 0.7 }, // Higher confidence threshold
                support: { minConfidence: 0.8 }
            }
        },
        selection: {
            riskTolerance: 'low' // Prefer simpler, safer plans
        }
    }
});
```

## Session Query API

### `listSessions(options)`

Query available sessions with filtering and sorting capabilities.

#### Parameters

| Parameter             | Type              | Required | Description                          |
| --------------------- | ----------------- | -------- | ------------------------------------ |
| `options`             | `Object`          | No       | Query options                        |
| `options.fromTime`    | `string`          | No       | ISO timestamp for start range        |
| `options.toTime`      | `string`          | No       | ISO timestamp for end range          |
| `options.sortOrder`   | `'asc' \| 'desc'` | No       | Sort order (default: 'desc')         |
| `options.concurrency` | `number`          | No       | Parallel read limit (default: 24)    |
| `options.limit`       | `number`          | No       | Maximum number of sessions to return |

#### Returns

```typescript
Promise<
    Array<{
        id: string; // Session identifier
        status: SessionStatus; // Current status
        firstEvent: Object | null; // Initial event
        secondEvent: Object | null; // Second event (usually user input)
        lastEvent: Object | null; // Most recent event
    }>
>;
```

#### Performance

- **List operations**: O(log n) via hierarchical directory traversal
- **Per-session preview**: O(1) via `readFirstSecondAndLastLines()`
- **Concurrent reads**: Configurable parallelism

### `getSession(sessionId)`

Retrieve complete session data including all events.

#### Parameters

| Parameter   | Type     | Required | Description        |
| ----------- | -------- | -------- | ------------------ |
| `sessionId` | `string` | Yes      | Session identifier |

#### Returns

```typescript
Promise<{
    id: string; // Session identifier
    status: SessionStatus; // Current status
    entries: Array<Object>; // All session events
    thread: Array<Message>; // Conversation thread
    metadata: {
        traceId: string | null; // Associated trace ID
        hasTrace: boolean; // Whether trace exists
        entryCount: number; // Total event count
    };
} | null>;
```

### `getSessionMetadata(sessionId)`

Get session preview efficiently without loading entire session.

#### Parameters

| Parameter   | Type     | Required | Description        |
| ----------- | -------- | -------- | ------------------ |
| `sessionId` | `string` | Yes      | Session identifier |

#### Returns

```typescript
Promise<{
    id: string;
    status: SessionStatus;
    firstEvent: Object | null;
    secondEvent: Object | null;
    lastEvent: Object | null;
} | null>;
```

#### Performance

- **Complexity**: O(1) - reads exactly 3 lines regardless of session size
- **Use case**: Efficient session listing and preview

### `readSessionLinesFrom(sessionId, fromIndex)`

Read session lines starting from a specific index. Useful for incremental updates.

#### Parameters

| Parameter   | Type     | Required | Description                   |
| ----------- | -------- | -------- | ----------------------------- |
| `sessionId` | `string` | Yes      | Session identifier            |
| `fromIndex` | `number` | Yes      | Starting line index (0-based) |

#### Returns

```typescript
Promise<{
    id: string; // Session identifier
    entries: Array<Object>; // Events from specified index
    fromIndex: number; // Starting index used
    entryCount: number; // Number of entries returned
} | null>;
```

#### Example

```javascript
// Read new events since line 10
const updates = await readSessionLinesFrom('20250821T164513435Z-xXKTbcJ2', 10);
if (updates) {
    console.log(`Got ${updates.entryCount} new events`);
    updates.entries.forEach((event) => {
        console.log(event.type, event.timestamp);
    });
}
```

### `getSessionStatus(sessionId)`

Get the current status of a session.

#### Parameters

| Parameter   | Type     | Required | Description        |
| ----------- | -------- | -------- | ------------------ |
| `sessionId` | `string` | Yes      | Session identifier |

#### Returns

```typescript
Promise<SessionStatus>;
// Where SessionStatus is:
// 'not_found' | 'empty' | 'initialized' | 'busy' | 'ready' | 'malformed'
```

### `getSessionsDir()`

Get the path to the sessions directory.

#### Returns

```typescript
string; // Path to sessions directory
```

#### Example

```javascript
const dir = getSessionsDir();
// Returns: '/Users/username/.thinksuit/sessions/streams'
```

## Session Fork API

### `forkSession(sourceSessionId, forkPoint)`

Create a new session branching from an existing session at a specific point.

#### Parameters

| Parameter         | Type     | Required | Description            |
| ----------------- | -------- | -------- | ---------------------- |
| `sourceSessionId` | `string` | Yes      | Session to fork from   |
| `forkPoint`       | `number` | Yes      | Event index to fork at |

#### Returns

```typescript
Promise<{
    sessionId: string; // New session ID if successful
    success: boolean; // Whether fork succeeded
    error?: string; // Error message if failed
}>;
```

#### Example

```javascript
const { sessionId, success, error } = await forkSession(
    '20250821T164513435Z-xXKTbcJ2',
    10 // Fork after event 10
);

if (success) {
    console.log(`Created fork: ${sessionId}`);
} else {
    console.error(`Fork failed: ${error}`);
}
```

### `getSessionForks(sessionId)`

Get navigation structure for moving between forked sessions at specific fork points.

#### Parameters

| Parameter   | Type     | Required | Description        |
| ----------- | -------- | -------- | ------------------ |
| `sessionId` | `string` | Yes      | Session identifier |

#### Returns

```typescript
Promise<{
    [eventId: string]: {
        forkCount: number; // Total siblings at this point
        forkIndex: number; // Current position (0-based)
        left: {
            // Previous sibling
            sessionId: string;
            forkIndex: number;
            eventId: string;
        } | null;
        right: {
            // Next sibling
            sessionId: string;
            forkIndex: number;
            eventId: string;
        } | null;
    };
}>;
```

## Trace API

### `getTrace(traceId)`

Get full trace data for debugging execution flow.

#### Parameters

| Parameter | Type     | Required | Description      |
| --------- | -------- | -------- | ---------------- |
| `traceId` | `string` | Yes      | Trace identifier |

#### Returns

```typescript
Promise<{
    id: string; // Trace identifier
    entries: Array<Object>; // All trace events
    metadata: {
        entryCount: number; // Total event count
        filePath: string; // Path to trace file
    };
} | null>;
```

#### Example

```javascript
const trace = await getTrace('20250821T164513435Z-r0_fjBjY');
if (trace) {
    console.log(`Trace has ${trace.metadata.entryCount} events`);
    trace.entries.forEach((event) => {
        console.log(event.spanId, event.event, event.duration);
    });
}
```

## Subscription API

### `subscribeToSession(sessionId, onEvent, onError)`

Subscribe to real-time events from a session as they occur.

#### Parameters

| Parameter   | Type       | Required | Description             |
| ----------- | ---------- | -------- | ----------------------- |
| `sessionId` | `string`   | Yes      | Session to subscribe to |
| `onEvent`   | `Function` | Yes      | Event handler callback  |
| `onError`   | `Function` | No       | Error handler callback  |

#### Returns

```typescript
{
    unsubscribe: Function,    // Async function to stop subscription
    subscriber: SessionSubscriber  // The underlying subscriber instance
}
```

#### Event Format

The onEvent callback receives:

```javascript
{
    sessionId: "20251010T181607143Z-wDH290W0",
    type: "change",
    msg: "Session changed."
}
```

Note: This API emits change notifications only. To get actual event data, use `readSessionLinesFrom()` to fetch new events.

#### Example

```javascript
let lastIndex = 0;
const { unsubscribe } = subscribeToSession(
    '20250821T164513435Z-xXKTbcJ2',
    async (event) => {
        if (event.sessionId && event.type == "change") {
            // Fetch new events since last read
            const updates = await readSessionLinesFrom(event.sessionId, lastIndex);
            if (updates) {
                lastIndex += updates.entryCount;
                updates.entries.forEach((entry) => {
                    console.log(`[${entry.event}]`, entry);
                });
            }
        }
    },
    (error) => {
        console.error('Subscription error:', error);
    }
);

// Later: clean up
await unsubscribe();
```

### `createSessionSubscriber()`

Create a session subscriber that can watch multiple sessions.

#### Returns

```typescript
SessionSubscriber; // EventEmitter-based subscription manager
```

#### Methods

| Method                    | Description                         |
| ------------------------- | ----------------------------------- |
| `subscribe(sessionId)`    | Start watching a session            |
| `unsubscribe(sessionId)`  | Stop watching a session (async)     |
| `unsubscribeAll()`        | Stop watching all sessions (async)  |
| `getSubscriptions()`      | Get array of subscribed session IDs |
| `isSubscribed(sessionId)` | Check if watching a session         |

#### Events

| Event          | Description                               |
| -------------- | ----------------------------------------- |
| `event`        | Fired when any subscribed session changes |
| `session:{id}` | Fired when specific session changes       |
| `subscribed`   | Fired when subscription starts            |
| `unsubscribed` | Fired when subscription ends              |
| `error`        | Fired on subscription errors              |

#### Example

```javascript
const subscriber = createSessionSubscriber();

// Subscribe to a session
subscriber.subscribe('20250821T164513435Z-xXKTbcJ2');

// Listen for changes
subscriber.on('session:20250821T164513435Z-xXKTbcJ2', async (event) => {
    console.log('Session changed:', event);
    // Fetch new data as needed
});

// Handle errors
subscriber.on('error', ({ sessionId, error }) => {
    console.error(`Error in ${sessionId}:`, error);
});

// Check subscriptions
const active = subscriber.getSubscriptions();
console.log('Watching sessions:', active);

// Cleanup
await subscriber.unsubscribeAll();
```

## Utility API

### `createLogger(options)`

Create a structured logger instance with Pino.

#### Parameters

| Parameter           | Type      | Required | Description                 |
| ------------------- | --------- | -------- | --------------------------- |
| `options`           | `Object`  | No       | Logger configuration        |
| `options.level`     | `string`  | No       | Log level (default: 'info') |
| `options.sessionId` | `string`  | No       | Bind session ID to all logs |
| `options.traceId`   | `string`  | No       | Bind trace ID to all logs   |
| `options.silent`    | `boolean` | No       | Suppress all output         |

#### Returns

```typescript
Logger; // Pino logger instance
```

#### Example

```javascript
const logger = createLogger({
    level: 'debug',
    sessionId: '20250821T164513435Z-xXKTbcJ2',
    traceId: '20250821T164513435Z-abc123'
});

logger.info('Processing input', { input: 'Hello' });
logger.debug('Signal detected', { signal: 'greeting' });
logger.error('Failed to process', { error: err });
```

### `deriveSessionStatus(events)`

Calculate session status from an array of events.

#### Parameters

| Parameter | Type            | Required | Description    |
| --------- | --------------- | -------- | -------------- |
| `events`  | `Array<Object>` | Yes      | Session events |

#### Returns

```typescript
SessionStatus; // Derived status
```

## Types and Constants

### SessionStatus

```typescript
type SessionStatus =
    | 'not_found' // Session file doesn't exist
    | 'empty' // File exists but has no content
    | 'initialized' // Only session.pending event
    | 'busy' // Processing, not ready for input
    | 'ready' // Ready for new input
    | 'malformed'; // JSON parsing failed
```

### Message

```typescript
interface Message {
    role: 'system' | 'user' | 'assistant';
    content: string;
    timestamp?: string;
}
```

### Signal

```typescript
interface Signal {
    dimension: 'claim' | 'support' | 'calibration' | 'temporal' | 'contract';
    signal: string;
    confidence: number;
    evidence?: string;
}
```

### ExecutionStrategy

```typescript
type ExecutionStrategy = 'direct' | 'sequential' | 'parallel' | 'single';
```

## Performance Characteristics

### File Operations

| Operation          | Complexity | Description                                          |
| ------------------ | ---------- | ---------------------------------------------------- |
| Session preview    | O(1)       | Read 3 lines max via `readFirstSecondAndLastLines()` |
| Session listing    | O(log n)   | Hierarchical directory traversal                     |
| Event subscription | O(k)       | Where k = new events since last read                 |
| Session write      | O(1)       | Append-only to JSONL file                            |
| Fork creation      | O(m)       | Where m = events up to fork point                    |
| Path construction  | O(1)       | Direct path from ID timestamp                        |

### Memory Usage

- **Session preview**: ~4KB regardless of session size
- **Session listing**: ~200 bytes per session metadata
- **Full session load**: Proportional to session size
- **Subscription**: Only change notifications in memory

## Storage Architecture

Sessions and traces are stored in a hierarchical directory structure:

```
~/.thinksuit/
├── sessions/
│   ├── streams/
│   │   └── YYYY/MM/DD/HH/         # Hour-based partitioning
│   │       └── {timestamp}-{id}.jsonl
│   └── metadata/
│       └── YYYY/MM/DD/HH/
│           └── {timestamp}-{id}.json
└── traces/
    └── YYYY/MM/DD/HH/
        └── {timestamp}-{id}.jsonl
```

This structure enables:

- O(1) path construction from IDs
- Efficient date range queries
- Natural chronological ordering
- No need for database indexes

## Error Handling

All async functions may throw errors. Common error types:

```javascript
try {
    const session = await getSession('invalid-id');
} catch (error) {
    if (error.code === 'ENOENT') {
        // Session not found
    } else if (error.name === 'SyntaxError') {
        // Malformed JSON in session file
    } else {
        // Other errors
    }
}
```

## Best Practices

1. **Use `getSessionMetadata()` for previews** - Don't load full sessions unnecessarily
2. **Clean up subscriptions** - Always call unsubscribe functions
3. **Handle session status** - Check status before sending input
4. **Use `readSessionLinesFrom()` for incremental updates** - Don't reload entire sessions
5. **Enable tracing for debugging** - Use `trace: true` during development
6. **Batch file operations** - Use appropriate concurrency for `listSessions()`

## Migration Notes

### Session ID Format Change

Sessions now use a cleaner timestamp format without prefixes:

- **Old**: `session-2025-08-21T16_45_13_435Z-xXKTbcJ2`
- **New**: `20250821T164513435Z-xXKTbcJ2`

Benefits:

- Shorter IDs
- Direct timestamp extraction for path construction
- Enables hierarchical storage optimization
