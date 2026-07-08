# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Overview

**ThinkSuit** - A modular AI orchestration system, and the kernel of a longer-term
personal operating system (vision: `docs/vision.md`; what-goes-where:
`docs/architecture-overview.md`). Packages:
- **`packages/thinksuit/`** - Core orchestration engine (the kernel): plan composer + agent loop, `schedule()` API, config registry, session routing
- **`packages/thinksuit-genai/`** - Resident generative-model service: provider library (openai/anthropic/google/hugging-face/onnx), env keyring (`~/.thinksuit/.env`), daemon over `~/.thinksuit/genai.sock` holding credentials + warm models, socket client. **Runtime callers require it** — turns fail fast with a `thinkctl start genai` hint when it's down
- **`packages/thinksuit-modules/`** - Behavioral modules including the mu module (roles, prompts, `composeInstructions`, and a plan library; owns `modalities`/`frames`)
- **`packages/thinksuit-broker/`** - Resident execution broker: forks a worker per turn, control channel, queue, per-session workspaces
- **`packages/thinksuit-cli/`** - Interactive REPL + one-shot runner
- **`packages/thinksuit-console/`** - Web-based debugging/development UI (session inspection, wakeword studio, services control)
- **`packages/thinksuit-voice/`** - Hands-free voice front door: wake → speech → turn → spoken response
- **`packages/thinksuit-tty/`** - Terminal component + TTY WebSocket server
- **`packages/thinksuit-mcp-server/`** - Exposes ThinkSuit *outward* as MCP tools to external clients
- **`packages/thinksuit-mcp-tools/`** - Custom MCP tools consumed *inward* by ThinkSuit
- **`packages/thinksuit-control/`** - Operations control plane (`thinkctl`): manages the LaunchAgent services (broker/genai/console/tty/voice), generating each plist in code from the package's `service.js`

**Service ops go through `thinkctl`** (`up`/`down`/`start`/`stop`/`status`/`ls`/`logs`) — never raw `launchctl`.

**These packages are one product**, not separate scopes. Package boundaries are
implementation structure; a feature is planned and delivered across *every* surface it
touches as one unit — engine, config schema, console/CLI, status, and docs — never
engine-first with the UI or observability treated as a separate follow-up.

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
# See the plan node boundaries that executed (task / sequence / parallel starts)
find ~/.thinksuit -name '{traceId}.jsonl' | xargs cat | jq 'select(.event | test("^execution\\.(task|sequential|parallel)\\.start$")) | {event, role: .data.role, depth: .data.depth}'

# Inspect each LLM exchange (role, finish reason, output)
find ~/.thinksuit -name '{traceId}.jsonl' | xargs cat | jq 'select(.event == "processing.llm.response") | {role: .data.role, finishReason: .data.finishReason, output: .data.output}'

# See tool calls the loop made
find ~/.thinksuit -name '{traceId}.jsonl' | xargs cat | jq 'select(.event | startswith("execution.tool.")) | {event, tool: .data.request.tool}'

# Check for a policy block (E_DEPTH / E_FANOUT / E_CHILDREN)
find ~/.thinksuit -name '{traceId}.jsonl' | xargs cat | jq 'select(.event == "session.response") | select(.data.success == false) | .data'

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

## Current Status

✅ **Fully Working**: Authored-plan orchestration — the agent loop (`executeTask`) composed by `executePlan` (task/sequence/parallel), the module system, and policy enforcement.

📝 **Documentation**:
- Package-specific README.md and CLAUDE.md files in each package directory
- Design documents in `docs/` directory
- Detailed implementation docs in `packages/thinksuit/docs/`
- Use `find ~/.thinksuit -name '*my-session-or-trace-id.jsonl'` to easily find session data or trace data.
