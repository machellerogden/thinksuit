# ThinkSuit Execution Strategies

## Overview

ThinkSuit supports multiple execution strategies that determine how the system orchestrates responses. The strategy is selected by the rules engine based on signals detected in the conversation, then potentially overridden by system policy.

## Strategy Types

### Direct Execution

Single-pass execution with a specific role. The simplest strategy for straightforward responses.

```mermaid
sequenceDiagram
    participant Handler as Direct Handler
    participant Module
    participant LLM

    Handler->>Module: Get prompts for role
    Module-->>Handler: System + Primary prompts
    Handler->>LLM: callLLM(prompts, thread)
    LLM-->>Handler: Response
    Handler-->>Handler: Return response
```

**When Used:**
- Simple questions with clear intent
- No tool execution needed (can detect tool requests but not execute them)
- Single perspective sufficient

**Resource Usage:**
- 1 LLM call
- No recursion
- Minimal overhead

### Sequential Execution

Multi-step execution where roles execute in order, optionally building a conversation thread between steps.

```mermaid
sequenceDiagram
    participant Handler as Sequential Handler
    participant Module
    participant LLM
    participant Thread

    loop For each role in sequence
        Handler->>Module: Get prompts for role[i]
        Module-->>Handler: Prompts

        alt buildThread = true
            Handler->>Thread: Add previous responses
        end

        Handler->>LLM: callLLM(prompts, thread)
        LLM-->>Handler: Response
        Handler->>Handler: Store response
    end

    Handler->>Handler: Apply resultStrategy
    Note over Handler: last | concat | label | formatted
    Handler-->>Handler: Return final result
```

**When Used:**
- Complex reasoning requiring multiple perspectives
- Analysis followed by synthesis
- Exploration followed by critique

**Configuration Options:**
- `buildThread`: Whether to accumulate responses
- `resultStrategy`: How to combine results
  - `last`: Return only final response
  - `concat`: Concatenate all responses
  - `label`: Label each response with role
  - `formatted`: Use module-specific formatter

### Parallel Execution

Multiple roles execute simultaneously and results are combined.

```mermaid
sequenceDiagram
    participant Handler as Parallel Handler
    participant Module
    participant LLM

    Handler->>Handler: Create promises array

    par Role 1
        Handler->>Module: Get prompts for role1
        Module-->>Handler: Prompts
        Handler->>LLM: callLLM(prompts, thread)
        LLM-->>Handler: Response1
    and Role 2
        Handler->>Module: Get prompts for role2
        Module-->>Handler: Prompts
        Handler->>LLM: callLLM(prompts, thread)
        LLM-->>Handler: Response2
    and Role N
        Handler->>Module: Get prompts for roleN
        Module-->>Handler: Prompts
        Handler->>LLM: callLLM(prompts, thread)
        LLM-->>Handler: ResponseN
    end

    Handler->>Handler: Await all promises
    Handler->>Handler: Apply resultStrategy
    Handler-->>Handler: Return combined result
```

**When Used:**
- Need diverse perspectives simultaneously
- Time-sensitive responses
- Independent analyses that can be parallelized

**Benefits:**
- Lower latency than sequential
- Efficient for independent operations

### Task Execution (Meta-Orchestration)

Multi-cycle execution with tool usage and intelligent convergence. The most sophisticated strategy.

```mermaid
stateDiagram-v2
    [*] --> Initialize

    Initialize --> CheckLimits

    CheckLimits --> ExecuteCycle: Resources available
    CheckLimits --> Synthesis: Limits reached

    ExecuteCycle --> ProcessResponse

    ProcessResponse --> ToolRequest: Response needs tools
    ProcessResponse --> Complete: Response complete

    ToolRequest --> ApprovalCheck
    ApprovalCheck --> ExecuteTools: Approved
    ApprovalCheck --> UpdateContext: Denied

    ExecuteTools --> UpdateContext
    UpdateContext --> CheckLimits

    Complete --> [*]
    Synthesis --> [*]
```

**Detailed Task Execution Flow:**

```mermaid
sequenceDiagram
    participant Task as Task Executor
    participant Cycle as RunCycle
    participant SM as State Machine
    participant LLM
    participant Tools
    participant Context

    Task->>Task: Initialize resource budgets
    Note over Task: maxCycles: 10<br/>maxTokens: 20000<br/>maxToolCalls: 25

    loop While not complete AND resources available
        Task->>Context: Build progress context
        Note over Context: - Budget status<br/>- Recent discoveries<br/>- Tool results

        Task->>Cycle: runCycle(selectedPlan, context)
        Note over Cycle: Execute selected plan<br/>(deterministic execution)

        Cycle->>SM: Execute with plan
        SM->>LLM: Execute with context

        alt LLM requests tools
            LLM-->>SM: Tool request
            SM->>Task: Tool approval needed
            Task->>Tools: Execute approved tools
            Tools-->>Task: Results
            Task->>Context: Add tool results
            Task->>Task: Continue cycle
        else LLM provides synthesis
            LLM-->>SM: Final response
            SM-->>Task: Complete
            Task-->>Task: Return response
        end

        Task->>Task: Update resource usage
        Task->>Task: Check convergence signals
    end

    alt Resources exhausted
        Task->>Task: Do Synthesis
        Task->>LLM: Final synthesis with context
        LLM-->>Task: Best-effort response
    end
```

**When Used:**
- Complex tasks requiring investigation
- Tool usage needed for completion
- Multi-step workflows with approvals
- Default strategy for safety (handles all cases)

**Key Features:**
- Resource budget management
- Tool discovery and execution
- Progress tracking between cycles
- Natural convergence behavior
- Recursive orchestration with optimization

## Strategy Selection Process

```mermaid
graph TD
    Signals[Detected Signals] --> Rules[Module Rules]
    Rules --> Plans[Generated Plans]
    Plans --> System[System Selection]
    Policy[User Policy] --> System

    System --> Override{Override needed?}
    Override -->|Yes| SystemPlan[System-selected Plan]
    Override -->|No| ModulePlan[Module-selected Plan]

    SystemPlan --> Executor
    ModulePlan --> Executor

    Executor --> TaskEx[Task Executor]
    Executor --> DirectEx[Direct Executor]
    Executor --> SeqEx[Sequential Executor]
    Executor --> ParEx[Parallel Executor]
```

## Resource Management

Each strategy has different resource implications:

| Strategy | LLM Calls | Max Tokens | Tool Access | Recursion |
|----------|-----------|------------|-------------|-----------|
| Direct | 1 | Plan-defined | Can detect but not execute | No |
| Sequential | N (# of steps) | Plan-defined × N | Via task strategy steps | No |
| Parallel | N (# of roles) | Plan-defined × N | Via task strategy branches | No |
| Task | 1-maxCycles | maxTokens total | Full execution | Yes |

## Configuration Examples

### Direct Execution Plan
```json
{
  "strategy": "direct",
  "role": "assistant",
  "maxTokens": 1000
}
```

### Sequential Execution Plan
```json
{
  "strategy": "sequential",
  "sequence": [
    { "role": "explorer", "strategy": "task" },
    { "role": "analyzer", "strategy": "direct" },
    { "role": "synthesizer", "strategy": "direct" }
  ],
  "tools": ["list_directory", "read_text_file", "read_media_file", "read_multiple_files"],
  "buildThread": true,
  "resultStrategy": "last",
  "maxTokens": 3000
}
```

**Note:** If a step is specified as just a string (e.g., `"explorer"`), it defaults to using 'task' strategy. Tools defined at the plan level are only passed to steps that use 'task' strategy.

### Parallel Execution Plan
```json
{
  "strategy": "parallel",
  "roles": [
    { "role": "explorer", "strategy": "task" },
    { "role": "critic", "strategy": "direct" }
  ],
  "tools": ["search_files", "read_text_file", "read_media_file", "read_multiple_files"],
  "resultStrategy": "label",
  "maxTokens": 2000
}
```

**Note:** Similar to sequential, branches can be strings (defaulting to 'task' strategy) or objects with explicit strategies.

### Task Execution Plan
```json
{
  "strategy": "task",
  "role": "assistant",
  "resolution": {
    "maxCycles": 10,
    "maxTokens": 20000,
    "maxToolCalls": 25,
    "timeoutMs": 180000
  },
  "tools": ["read_text_file", "read_media_file", "read_multiple_files", "write_file", "search_files"]
}
```

## Embedded Tool Usage in Orchestration

Sequential and Parallel strategies can embed tool-using steps by specifying 'task' as the step strategy:

### Example: Sequential with Tool-Using Explorer
```json
{
  "strategy": "sequential",
  "sequence": [
    { "role": "explorer", "strategy": "task" },  // Can use tools
    { "role": "analyzer", "strategy": "direct" }  // Cannot use tools
  ],
  "tools": ["list_directory", "read_text_file", "read_media_file", "read_multiple_files"],
  "buildThread": true
}
```

### Key Points:
- **Only execTask handles tool execution** - It's the sole executor for multi-cycle tool usage
- **Tools are conditionally passed** - Only steps with `strategy: "task"` receive tools
- **Default strategy is 'task'** - If not specified, steps default to task strategy
- **discoveredTools always passed** - Required infrastructure for tool execution

## Best Practices

1. **Use Task as Default**: Handles all cases safely, even simple ones
2. **Be Explicit About Strategies**: Use object notation to clearly specify step strategies
3. **Set Appropriate Limits**: Tune resource limits based on use case
4. **Consider Latency**: Parallel for speed, sequential for depth
5. **Monitor Convergence**: Task execution naturally converges as resources diminish
6. **Trust the System**: Policy enforcement ensures safety regardless of strategy
