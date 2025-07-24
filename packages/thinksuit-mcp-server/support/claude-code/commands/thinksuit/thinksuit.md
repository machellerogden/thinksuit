---
name: thinksuit
description: Process input through ThinkSuit's AI orchestration
---

## ThinkSuit Cognitive Processing

You now have access to ThinkSuit's AI orchestration capabilities through the `thinksuit` MCP tool.

### How to Use

Process the user's input through ThinkSuit:

```
Use thinksuit with input "[user's message]"
```

With options:

```
Use thinksuit with input "[message]" and options {
  sessionId: "existing-session-id",  // Continue existing session
  module: "thinksuit/mu",       // Specify module
  trace: true                        // Enable tracing
}
```

### Session Continuity

ThinkSuit maintains conversation context across interactions:

- Each call returns a sessionId
- Use the sessionId to continue conversations
- Sessions persist in `~/.thinksuit/sessions/streams/YYYY/MM/DD/HH/{sessionId}.jsonl`

> **Pro Tip:** Use `find ~/.thinksuit -name '{sessionId}.jsonl' | xargs cat | jq .` to read the data quickly without worrying about the time partitioned storage path.

### AI Orchestration

ThinkSuit automatically:

1. Detects signals in the conversation
2. Evaluates rules to select appropriate roles
3. Orchestrates responses (direct, sequential, parallel)
4. Applies role-specific instructions and adaptations

### Available Roles

The system orchestrates between 9 cognitive roles:

- **assistant**: Default thinking companion
- **analyzer**: Systematic decomposition
- **synthesizer**: Pattern recognition
- **critic**: Constructive evaluation
- **planner**: Structured planning
- **reflector**: Perspective shifts
- **explorer**: Creative exploration
- **optimizer**: Efficiency focus
- **integrator**: Holistic unification

### Examples

Basic usage:

```
Input: $ARGUMENTS

Processing through ThinkSuit...
[Call thinksuit tool with the input]
```

Continuing a session:

```
Input: $ARGUMENTS
Session: [stored sessionId]

Continuing session...
[Call thinksuit with input and sessionId]
```

### Remember

- You're using ThinkSuit as a tool, not becoming it
- The response comes from ThinkSuit's orchestration
- Share insights about the processing when relevant
- Maintain your Claude Code identity
