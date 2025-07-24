# ThinkSuit Architecture Overview

## System Purpose

ThinkSuit is an AI orchestration engine that converts conversation context into execution plans via a deterministic state machine, then executes those plans through LLM orchestration using pluggable behavioral modules.

## Core Architectural Principles

1. **Trust Boundaries**: System enforces user policy between untrusted modules and execution
2. **Two-Plane Architecture**: Pure decision plane, effectful execution plane
3. **Module-First Design**: Cognitive behavior defined by pluggable modules
4. **Policy Enforcement**: User constraints flow through system to bound module behavior

## High-Level Execution Flow

```mermaid
sequenceDiagram
    participant User
    participant CLI
    participant Schedule
    participant RunCycle
    participant StateMachine
    participant Module
    participant Handlers
    participant LLM

    User->>CLI: Input message
    CLI->>Schedule: schedule(config, input)
    Schedule->>RunCycle: runCycle(params)

    Note over RunCycle,Module: Decision Plane (Pure)
    RunCycle->>StateMachine: Execute ASL
    StateMachine->>Handlers: detectSignals
    Handlers->>Module: Use classifiers
    Module-->>Handlers: Return signals
    StateMachine->>Handlers: evaluateRules
    Handlers->>Module: Use rules
    Module-->>Handlers: Return plans
    StateMachine->>Handlers: selectPlan
    Note over Handlers: System enforces policy
    Handlers-->>StateMachine: Selected plan

    Note over RunCycle,LLM: Execution Plane (Effectful)
    StateMachine->>Handlers: execTask/Direct/Sequential
    Handlers->>Module: Get prompts
    Module-->>Handlers: Return prompts
    Handlers->>LLM: callLLM(params)
    LLM-->>Handlers: Response
    Handlers-->>User: Final response
```

## Trust Boundaries and Component Architecture

```mermaid
graph TB
    subgraph "User Space"
        User[User]
        Policy[Policy Configuration]
        Sessions[Session Storage]
    end

    subgraph "System Space (Trusted)"
        CLI[CLI Interface]
        Schedule[Schedule API]
        SM[State Machine<br/>ASL/Trajectory]

        subgraph "Policy Enforcement Layer"
            PS[Plan Selection]
            RE[Resource Enforcement]
            TA[Tool Access Control]
        end

        subgraph "Execution Control"
            Task[Task Executor]
            Direct[Direct Executor]
            Seq[Sequential Executor]
            Para[Parallel Executor]
        end
    end

    subgraph "Module Space (Untrusted)"
        Module[Behavioral Module]
        Class[Classifiers]
        Rules[Rules Engine]
        Prompts[Role Prompts]
    end

    subgraph "External Services"
        LLM[LLM Provider]
        Tools[MCP Tools]
    end

    User -->|sets| Policy
    User -->|input| CLI
    Policy -->|constrains| RE
    Policy -->|filters| TA

    CLI --> Schedule
    Schedule --> SM
    SM -->|queries| Module
    Module --> Class
    Module --> Rules
    Module --> Prompts

    SM -->|enforces| PS
    PS -->|selects| Task
    PS -->|selects| Direct
    PS -->|selects| Seq
    PS -->|selects| Para

    Task -->|bounded by| RE
    Task -->|filtered by| TA
    Task --> LLM
    Task --> Tools

    Direct --> LLM
    Seq --> LLM
    Para --> LLM

    style Module fill:#ffe6e6
    style Class fill:#ffe6e6
    style Rules fill:#ffe6e6
    style Prompts fill:#ffe6e6
    style PS fill:#e6f3ff
    style RE fill:#e6f3ff
    style TA fill:#e6f3ff
```

## State Machine Flow

```mermaid
stateDiagram-v2
    [*] --> CheckSelectedPlan

    CheckSelectedPlan --> UseSelectedPlan: Has selected plan<br/>(deterministic execution)
    CheckSelectedPlan --> DetectSignals: No selected plan

    UseSelectedPlan --> ComposeInstructions

    DetectSignals --> AggregateFacts
    AggregateFacts --> EvaluateRules
    EvaluateRules --> SelectPlan
    SelectPlan --> ComposeInstructions

    ComposeInstructions --> Route

    Route --> DoTask: strategy=task
    Route --> DoDirect: strategy=direct
    Route --> DoSequential: strategy=sequential
    Route --> DoParallel: strategy=parallel

    DoTask --> [*]: Success
    DoDirect --> [*]: Success
    DoSequential --> [*]: Success
    DoParallel --> [*]: Success

    DoTask --> Fallback: Error
    DoDirect --> Fallback: Error
    DoSequential --> Fallback: Error
    DoParallel --> Fallback: Error

    Fallback --> [*]
```

## Data Flow: Facts and Plans

```mermaid
graph LR
    subgraph "Signal Detection"
        Thread[Thread] --> Classifiers
        Classifiers --> Signals[Signal Facts]
    end

    subgraph "Rule Evaluation"
        Signals --> Rules[Rule Engine]
        Rules --> Plans[Execution Plans]
        Rules --> Adaptations[Adaptations]
        Rules --> Constraints[Constraints]
    end

    subgraph "Plan Selection"
        Plans --> Selector[System Selector]
        Constraints --> Selector
        Policy[User Policy] --> Selector
        Selector --> Selected[Selected Plan]
    end

    subgraph "Instruction Composition"
        Selected --> Composer[Composer]
        Adaptations --> Composer
        Prompts[Module Prompts] --> Composer
        Composer --> Instructions[Instructions]
    end

    subgraph "Execution"
        Instructions --> Executor
        Selected --> Executor
        Executor --> Response
    end
```

## Task Execution Strategy (Meta-Orchestration)

```mermaid
sequenceDiagram
    participant TaskExecutor
    participant RunCycle
    participant StateMachine
    participant LLM
    participant Tools
    participant User

    Note over TaskExecutor: Initialize with resource limits
    TaskExecutor->>TaskExecutor: Check limits<br/>(cycles, tokens, tools)

    loop Until complete or limits reached
        TaskExecutor->>RunCycle: runCycle(selectedPlan)
        Note over RunCycle: Skip signal detection<br/>(deterministic path)
        RunCycle->>StateMachine: Execute with plan
        StateMachine->>LLM: Execute role
        LLM-->>StateMachine: Response

        alt Response requests tools
            StateMachine->>User: Request approval
            User-->>StateMachine: Approve/Deny
            StateMachine->>Tools: Execute if approved
            Tools-->>StateMachine: Tool results
            TaskExecutor->>TaskExecutor: Update context
        else Response complete
            StateMachine-->>TaskExecutor: Final response
            TaskExecutor-->>User: Return response
        end

        TaskExecutor->>TaskExecutor: Update resource usage
    end
```

## Key Architectural Patterns

### 1. Two-Plane Architecture
- **Decision Plane**: Pure functions for signal detection, rule evaluation, plan selection
- **Execution Plane**: Effectful handlers for LLM calls and tool execution

### 2. Policy Enforcement Points
- Plan selection (system overrides module suggestions)
- Resource limits (tokens, cycles, tool calls)
- Tool access (filtering based on user allowlist)
- Timeout enforcement

### 3. Module Isolation
- Modules provide cognitive behavior but don't control execution
- System mediates all module interactions with external resources
- Module decisions are suggestions, not commands

### 4. Session Continuity
- JSONL event streams capture full execution history
- Hierarchical time-based storage for efficient queries
- Sessions can be resumed, forked, and analyzed

## Security Considerations

1. **Untrusted Modules**: Modules are treated as untrusted third-party code
2. **Resource Bounds**: All execution has hard limits on resources
3. **Tool Approval**: User approval required for tool execution (configurable)
4. **Policy Override**: System can override module decisions based on user policy
5. **Audit Trail**: Complete trace logging for security analysis
