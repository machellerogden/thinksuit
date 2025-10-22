# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Overview

**ThinkSuit** - A modular AI orchestration system containing:
- **`packages/thinksuit/`** - Core orchestration engine that executes modules
- **`packages/thinksuit-modules/`** - Behavioral modules including the mu module
- **`packages/thinksuit-cli/`** - Interactive REPL with commands and session management
- **`packages/thinksuit-console/`** - Web-based debugging and development UI
- **`packages/thinksuit-mcp-tools/`** - MCP tool integrations

## For Development Details

See **CONTRIBUTING.md** for:
- Quick reference commands
- Architecture overview
- Debugging and trace analysis
- Development workflow
- Testing strategies
- Handler contracts
- Configuration details
- Code style guidelines

## CRITICAL: How Coding Agents Should Explore ThinkSuit

**Note for Coding Agents**: You cannot use the interactive REPL (`npm run start`). Use the one-shot CLI pattern below for all execution and trace analysis.

**Note for Human Developers**: The interactive REPL (`npm run start`) is recommended for development. See [`packages/thinksuit-cli/CLAUDE.md`](packages/thinksuit-cli/CLAUDE.md) for full REPL documentation.

### One-Shot CLI (Required for Coding Agents)

For execution and trace analysis:

```bash
# ALWAYS use this pattern - run with trace and tail to see sessionId/traceId
npm run exec -- --trace "Your input here" 2>&1 | tail -20

# With tools enabled
npm run exec -- --trace --allow-tool roll_dice "Roll a d20" 2>&1 | tail -20

# The tail -20 shows you:
# - The sessionId and traceId for further exploration
# - How the session ended (success/failure)
# - The actual response
```

**WHY**: The last 20 lines contain the sessionId and traceId you need for analysis, plus show you if the execution succeeded.

### Step 2: Examine the Trace Data

After running, use the traceId from the output to explore what happened:

```bash
# Find and examine signals detected (replace with actual traceId)
find ~/.thinksuit -name '20250924T155819520Z-fMpbmCpG.jsonl' | xargs cat | jq 'select(.event == "processing.output.generated" and .data.handler == "detectSignals") | .data.facts'

# See which rules fired
find ~/.thinksuit -name '{traceId}.jsonl' | xargs cat | jq 'select(.event == "pipeline.rule_evaluation.trace") | .data.executionTrace[] | {rule: .ruleName, added: .factsAdded[].type}'

# Check the selected plan
find ~/.thinksuit -name '{traceId}.jsonl' | xargs cat | jq 'select(.event == "pipeline.plan_selection.complete") | .data.selectedPlan'

# View session events
find ~/.thinksuit -name '{traceId}.jsonl' | xargs cat | jq 'select(.event | startswith("session.")) | { event, msg, data }'
```

### Step 3: Examine Session Data

Sessions are stored separately from traces:

```bash
# Look at a specific session (use sessionId from output)
cat ~/.thinksuit/sessions/streams/2025/09/24/15/20250924T155819461Z-8LtZ_xlY.jsonl | jq '.'

# Or find sessions by partial ID
find ~/.thinksuit/sessions -name '*8LtZ_xlY*' -type f
```

### Key Patterns to Remember

1. **ALWAYS run with trace**: `npm run exec -- --trace "input" 2>&1 | tail -20`
2. **Use actual IDs**: Replace `{traceId}` with the actual ID from the output
3. **Data is in .data field**: Most interesting data is in `.data`, not at top level
4. **The -- is critical**: Always use `--` to pass arguments through npm workspace

### Common Analysis Queries

## Current Status

✅ **Fully Working**: Complete AI orchestration pipeline with module system, signal detection, and all execution strategies.

📝 **Documentation**:
- Package-specific README.md and CLAUDE.md files in each package directory
- Design documents in `docs/` directory
- Detailed implementation docs in `packages/thinksuit/docs/`
- Use `find ~/.thinksuit -name '*my-session-or-trace-id.jsonl'` to easily find session data or trace data.
