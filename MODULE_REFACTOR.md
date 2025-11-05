# Mu Module Refactoring

## Current: v0.4 - Chat Role & Multi-Turn Signals (2025-11-05)

### Major Changes

**New Chat Role**
- **Added**: `chat` role (temp: 0.7, tokens: 400, default) for natural conversation
- **Default changed**: From `analyze` to `chat` - reduces premature problem-solving
- **Philosophy**: System now defaults to conversational mode, only escalating to specialized instruments when explicitly signaled

**Multi-Turn Signal Architecture**
- **Turn-aware signals**: All signals now carry `turnIndex` metadata
- **Historical signal preservation**: `aggregateFacts` maintains signals across conversation turns
- **Cross-turn pattern detection**: Rules can now detect patterns spanning multiple turns (infrastructure in place, not yet utilized)
- **TurnContext fact**: New fact type injected by `aggregateFacts` for routing rules

**Intent Classification Enhancement**
- **Two-phase detection**: Pattern matching followed by optional LLM validation
- **Validation prompts**: Each instrument has a specific validation prompt for ambiguous cases
- **Multiple matches**: System now handles overlapping intent patterns with LLM disambiguation
- **Plan precedence**: Deterministic priority when multiple intents detected: execute → investigate → analyze → synthesize → capture → readback → chat

**Updated Roles** (now 7 total):
  - `chat` (temp: 0.7, tokens: 400, default) - Natural conversation and casual interaction
  - `capture` (temp: 0.3, tokens: 400) - Record information without interpretation
  - `readback` (temp: 0.3, tokens: 400) - Retrieve and restate information
  - `analyze` (temp: 0.5, tokens: 800) - Parse and validate structure
  - `investigate` (temp: 0.6, tokens: 1000) - Gather context with tools
  - `synthesize` (temp: 0.8, tokens: 1000) - Combine artifacts into output
  - `execute` (temp: 0.1, tokens: 1200) - Perform work with tools

### Implementation Details

**Rule Changes**
- All routing rules now check TurnContext to only fire for current turn signals
- This prevents historical signals from re-triggering routing rules
- Enables future cross-turn pattern detection without interfering with normal operation

**Test Updates**
- Intent classifier tests updated for new confidence values and chat default
- Rules tests now provide TurnContext fact for routing
- aggregateFacts tests account for always-present TurnContext fact

**Documentation Updates**
- README.md updated to reflect 7 roles and chat as default
- Keyword table updated with refined patterns and chat role

---

## Previous: v0.3 - Simplified Role Architecture (2025-10-28)

### Major Changes

**Module Schema Refactor**
- **Roles now reference prompt keys instead of duplicating text**: Roles store keys like `'system.capture'` which are resolved from `module.prompts` map
- **Single source of truth**: All prompt text lives only in `module.prompts`, eliminating duplication
- **Convention-based naming enforced**: All prompts must use one of four prefixes:
  - `system.*` - Role identity prompts
  - `primary.*` - Role instruction prompts
  - `adapt.*` - Behavioral modification prompts
  - `length.*` - Response length guidance

**Simplified to 6 Roles**
- **Removed**: Complex 14-role cognitive system with multiple classifiers
- **Added**: 6 roles enabling intentional selection of cognitive instruments, each representing a distinct mode of engagement:
  - `capture` (temp: 0.3, tokens: 400) - Record information without interpretation
  - `readback` (temp: 0.3, tokens: 400) - Retrieve and restate information
  - `analyze` (temp: 0.5, tokens: 800, default) - Parse and validate structure
  - `investigate` (temp: 0.4, tokens: 1000) - Gather context with tools
  - `synthesize` (temp: 0.6, tokens: 1000) - Combine artifacts into output
  - `execute` (temp: 0.4, tokens: 1200) - Perform work with tools

**Signal Detection Simplified**
- **Removed**: 16 signals across 5 dimensions (claim, support, calibration, temporal, contract)
- **Added**: Single intent classifier with keyword patterns for 6 roles
- Simple pattern matching routes natural language to appropriate role

**Two-Mode Operation**
- **Explicit Mode**: Send ExecutionPlan directly, bypass classification entirely
- **Signal-Driven Mode**: Keyword detection routes to roles (convenience layer)

### Bug Fixes
- **Task orchestration**: Fixed primary prompt being prepended on every cycle instead of just the first
  - Issue: `hasBuiltConversation` check didn't account for OpenAI Responses API structured items
  - Fix: Now detects both traditional assistant messages and provider-specific structured items

### Removed Keys
All previous role prompts removed:
- `debugger`, `tester`, `reviewer`, `refactorer`
- `assistant`, `analyzer`, `synthesizer`, `critic`, `planner`, `reflector`, `explorer`, `optimizer`, `integrator`
- `outer_voice`, `inner_voice`
- All associated artifact, debate, and iteration adaptations

---

## Previous: v0.2 - Engineering-Focused Roles (Historical)

- **Prompts**: Rewritten as operator-form for engineering workflows
- **Roles**: Added `debugger`, `tester`, `reviewer`, `refactorer`. Removed `outer_voice`, `inner_voice`
- **Signals**: Added artifact dimension (stack-trace, test-failure, diff-attached)
- **Rules**: Added high-salience routes for artifact signals

## Archived: Inner/Outer Debate Pattern (Historical Reference)

```json
{
  "name": "inner-outer-debate (example only)",
  "buildThread": true,
  "resultStrategy": "last",
  "sequence": [
    { "role": "constraints_lens", "prompt": "Boundary Conditions; Stress Test; Decision Risk; One Question." },
    { "role": "possibilities_lens", "prompt": "Options; Reframes; Absorb Failures; One Question." },
    { "role": "constraints_lens", "prompt": "Challenge top option; propose guardrail or acceptance criterion." },
    { "role": "integrator", "prompt": "Agreement/disagreement; decision boundary; next step + success criteria." }
  ],
  "notes": "Pattern illustrates dialectic exploration followed by convergence. Not wired into current version."
}
```
