---
name: session
description: Manage ThinkSuit sessions
---

## ThinkSuit Session Management

Manage and inspect ThinkSuit sessions.

### Available Actions

**List sessions:**

```
Use thinksuit-session with action "list"
```

**Get full session:**

```
Use thinksuit-session with action "get" and sessionId "[id]"
```

**Check session status:**

```
Use thinksuit-session with action "status" and sessionId "[id]"
```

**Get session metadata:**

```
Use thinksuit-session with action "metadata" and sessionId "[id]"
```

### Options

For listing sessions:

```
Use thinksuit-session with action "list" and options {
  fromTime: "2025-01-01T00:00:00Z",  // ISO 8601
  toTime: "2025-01-02T00:00:00Z",
  sortOrder: "desc",  // or "asc"
  limit: 10
}
```

### Session States

- `ready`: Ready for input
- `busy`: Processing
- `empty`: No content yet
- `initialized`: Just started
- `malformed`: Corrupted data
- `not_found`: Doesn't exist

### Session Storage

Sessions are stored in `~/.thinksuit/sessions/`:

- JSONL format (one JSON object per line)
- Named with timestamp prefix for natural sorting
- Efficient access patterns for large sessions

### Examples

View recent sessions:

```
Request: $ARGUMENTS

[If empty or "list":]
Listing recent sessions...
[Call thinksuit-session with action "list"]

[If contains session ID:]
Getting session details...
[Call thinksuit-session with action "get" and the sessionId]

[If "status" + ID:]
Checking session status...
[Call thinksuit-session with action "status" and the sessionId]
```

### Integration with ThinkSuit

Sessions created by the `thinksuit` tool can be:

- Resumed by providing the sessionId
- Inspected to see full conversation history
- Analyzed to understand decision chains

Use this tool to:

- Track ongoing conversations
- Review past interactions
- Debug unexpected behaviors
- Understand ThinkSuit's processing
