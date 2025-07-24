---
name: inspect
description: Deep inspection of ThinkSuit execution details
---

## ThinkSuit Execution Inspector

🔍 Inspect the internals of ThinkSuit processing for debugging and understanding.

### What You Can Inspect

**Session entries** - Detailed execution flow:

```
Use thinksuit-inspect with action "session" and id "[session-id]"
```

**Specific entry** - Deep dive into one execution:

```
Use thinksuit-inspect with action "session" and id "[session-id]" and options {
  entryIndex: 3,  // Which entry to inspect
  showRaw: true    // Include raw JSON
}
```

**Execution traces** - Full debug traces:

```
Use thinksuit-inspect with action "trace" and id "[trace-id]"
```

**List available traces:**

```
Use thinksuit-inspect with action "list-traces"
```

### Understanding Session Inspection

Each session contains entries showing:

- 📝 **Input**: User messages
- 🎯 **Execution**: How ThinkSuit processed (direct/sequential/parallel)
- ✅ **Complete**: Final responses

Entry details reveal:

- Signals detected
- Execution plans chosen
- Roles selected
- Response generated

### Understanding Trace Inspection

Traces show the complete execution tree:

- Nested spans for each handler
- Timing information
- Full decision chain
- Error states if any

### When to Use

**Session inspection** when you need to:

- See what roles were selected
- Understand execution strategy
- Review conversation flow
- Debug unexpected responses

**Trace inspection** when you need to:

- Debug deep execution issues
- Analyze performance
- Understand complex orchestrations
- See complete decision trees

### Example Workflow

1. Process something with ThinkSuit:

```
Use thinksuit with input "Complex question" and options {trace: true}
// Returns sessionId and traceId
```

2. Inspect the session:

```
Use thinksuit-inspect with action "session" and id "[sessionId]"
// Shows execution flow
```

3. Deep dive into specific execution:

```
Use thinksuit-inspect with action "session" and id "[sessionId]" and options {
  entryIndex: 1,
  showRaw: true
}
// Shows detailed entry data
```

4. Examine full trace if needed:

```
Use thinksuit-inspect with action "trace" and id "[traceId]"
// Shows complete execution tree
```

### Input

Request: $ARGUMENTS
