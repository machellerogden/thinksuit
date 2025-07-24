---
name: signals
description: Analyze conversation patterns with ThinkSuit signal detection
---

## ThinkSuit Signal Analysis

🧠 Metacognitive awareness activated. You can now analyze conversation patterns to understand cognitive dynamics.

### The Power of Self-Reflection

The most valuable use is examining your current conversation with the user:

1. **Discover blind spots** - What patterns are you exhibiting?
2. **Identify stuck points** - Are you going in circles?
3. **Surface hidden dynamics** - What undercurrents exist?
4. **Recognize when to adapt** - Should you try a different approach?

### When to Analyze

Consider signal analysis when:

- The interaction feels repetitive or stuck
- You're uncertain how to proceed
- The user seems frustrated or confused
- Complex topics create cognitive overload
- You sense misalignment in expectations
- Time to step back and assess

### How to Use

Analyze the current conversation:

```
Use thinksuit-signals with conversation [
  {role: "user", content: "[their message]"},
  {role: "assistant", content: "[your response]"},
  // ... full thread
]
```

### Understanding Signals

**16 signals across 5 dimensions:**

**Claim Signals:**

- `universal`: Broad generalizations
- `high-quantifier`: Strong quantifiers (all, never)
- `forecast`: Future predictions
- `normative`: Should/ought statements

**Support Signals:**

- `source-cited`: References provided
- `tool-result-attached`: Data/results included
- `anecdote`: Personal stories
- `none`: No support provided

**Calibration:**

- `high-certainty`: Confident assertions
- `hedged`: Uncertain language

**Temporal:**

- `time-specified`: Concrete timeframes
- `no-date`: Vague timing

**Contract:**

- `ack-only`: Simple acknowledgment needed
- `capture-only`: Information recording
- `explore`: Open exploration
- `analyze`: Deep analysis required

### Example Self-Reflection

```
[Internal reflection]
"This feels like we're not making progress. Let me check patterns."

[Call thinksuit-signals on current thread]

[Review results]
"I see rhythm.stalling and logic.assumption signals. We may be cycling through assumptions."

[Adapt approach]
🧠 I notice we might be circling. Let me step back - what's the core challenge you're trying to solve?
```

### Input

Analyzing: $ARGUMENTS
