# A2A Protocol Support for ThinkSuit

## Status

Proposed

## Context

ThinkSuit is a modular AI orchestration system that can evolve its own architectures and reasoning flows. While internal flexibility and evolution are core design principles, ThinkSuit should also be a productive member of the broader AI agent ecosystem.

Currently, ThinkSuit exposes capabilities through:
- **CLI**: One-shot invocations
- **MCP (Model Context Protocol)**: Integration with Claude Code and other MCP clients
- **thinksuit-console**: Web UI for interactive sessions and trace inspection

The Agent-to-Agent (A2A) protocol (developed by Google, released April 2025) provides a standardized way for AI agents to discover and interact with each other across different frameworks and platforms. A2A is:
- **Opacity-preserving**: Agents expose capabilities without revealing internal state
- **JSON-RPC 2.0 based**: Standard request/response over HTTP(S)
- **Discovery-oriented**: Agent Cards declare capabilities, skills, and security requirements
- **Framework-agnostic**: Works across different agent implementations

### The Challenge

ThinkSuit is not a single, static agent—it's an orchestration engine that becomes agent-like based on:
- Selected module (e.g., `thinksuit/mu`)
- User configuration (tools, recursion limits, temperature, etc.)

A2A's Agent Card model assumes relatively static capabilities per endpoint. How do we expose ThinkSuit's configurability through A2A without:
1. Requiring external agents to understand ThinkSuit internals
2. Forcing metadata conventions that violate A2A's opacity principles
3. Creating a single monolithic agent that doesn't reflect actual capability differences

### Research Context

Recent multi-agent systems research (Cognition 2025, Anthropic Claude Research 2025, FlowReasoner 2025) highlights challenges in:
- Cross-agent context passing
- Shared decision semantics
- Information transfer and semantic compression

A2A addresses these at the protocol level, but successful integration requires clear capability boundaries and predictable behavior per agent endpoint.

## Decision

We will implement A2A protocol support for ThinkSuit with the following design:

### 1. User-Defined Agent Configurations

Users define static agent configurations in `~/.thinksuit.json`:

```json
{
  "agents": [
    {
      "id": "thinksuit-default",
      "name": "ThinkSuit (Default)",
      "description": "General-purpose orchestration",
      "module": "thinksuit/mu",
      "config": {
        "maxDepth": 2,
        "temperature": 0.7,
        "tools": []
      },
      "skills": [
        {
          "id": "general-reasoning",
          "name": "General Reasoning",
          "description": "Multi-step reasoning and problem solving",
          "tags": ["reasoning", "planning"],
          "examples": [
            "Help me think through this architecture decision"
          ]
        }
      ]
    },
    {
      "id": "thinksuit-code-analyzer",
      "name": "ThinkSuit Code Analyzer",
      "description": "Specialized for codebase exploration and analysis",
      "module": "thinksuit/mu",
      "config": {
        "maxDepth": 3,
        "temperature": 0.3,
        "tools": ["filesystem", "grep", "ast_parse"]
      },
      "skills": [
        {
          "id": "code-analysis",
          "name": "Code Analysis",
          "description": "Analyze codebases, explore file structures, search patterns",
          "tags": ["code", "analysis", "filesystem"],
          "examples": [
            "Explore and analyze the current working directory"
          ]
        }
      ]
    }
  ]
}
```

### 2. Separate A2A Server Package

Create `packages/thinksuit-a2a-server/` as an independent protocol adapter, following the pattern of `mcp-server.js`.

**Responsibilities:**
- Read agent definitions from `~/.thinksuit.json`
- Generate and serve Agent Cards per defined agent
- Expose HTTP endpoints: `POST /a2a/{agent-id}` and `GET /.well-known/agent/{agent-id}`
- Handle JSON-RPC 2.0 message routing
- Transform A2A Messages → ThinkSuit invocations
- Transform ThinkSuit responses → A2A Task/Message responses

**Not responsible for:**
- Session management UI (that's thinksuit-console)
- MCP protocol (that's thinksuit-mcp-server)
- Core orchestration (that's packages/thinksuit)

### 3. One Endpoint Per Configured Agent

Each agent definition maps to:
- A unique endpoint URL: `http://localhost:3000/a2a/{agent-id}`
- A unique Agent Card: `http://localhost:3000/.well-known/agent/{agent-id}`

**Discovery model:**
External agents discover available ThinkSuit agents via:
- Local registry file: `~/.thinksuit/registry.json` (written on server startup)
- Agent Card retrieval from well-known endpoints
- Tags, examples, and skills guide agent selection

**No metadata required in messages:**
The endpoint URL selection implicitly determines the ThinkSuit configuration. External agents don't need to understand ThinkSuit internals—they just choose the right endpoint based on discovered capabilities.

### 4. Local-Only Deployment

A2A server runs locally only (not hosted):
- Default: `http://localhost:3000` (configurable)
- No authentication by default (localhost trust boundary)
- Optional API key support for multi-user systems
- Integration point for local agent ecosystems

## Consequences

### Positive

**Well-Defined Boundaries** (Gateless Principle #4):
- Clear separation: one package per protocol adapter
- Each agent endpoint has explicit, static capabilities
- No hidden coupling between A2A protocol and ThinkSuit internals

**Legibility** (Gateless Principle #1):
- User-defined agents in config file are explicit and readable
- Agent Cards surface capabilities clearly for external discovery
- No magic: endpoint selection = config binding

**Respect Human Time** (Gateless Principle #6):
- Optional: users enable A2A only if needed
- Independent lifecycle: restart A2A server without affecting other interfaces
- Follows existing architectural pattern (consistency reduces cognitive load)

**Build for Handoff** (Gateless Principle #8):
- Future maintainers see consistent pattern across protocol adapters
- Agent definitions in user config make deployment transparent
- Standard A2A protocol = external documentation available

**Ecosystem Integration**:
- ThinkSuit joins broader A2A agent ecosystem
- External agents can discover and use ThinkSuit capabilities
- Preserves ThinkSuit's internal flexibility while exposing stable interfaces

### Negative

**Configuration Overhead**:
- Users must define agents upfront in config
- Each capability profile requires a separate agent definition
- Cannot dynamically generate agents per request

**Duplication**:
- Multiple agent definitions may have similar configs (e.g., same module, slightly different tools)
- Mitigation: Future enhancement could support config inheritance/templates

**Local-Only Limitation**:
- A2A server is not network-accessible by default
- Multi-machine agent orchestration requires additional work
- Mitigation: This aligns with ThinkSuit's local-first design; hosting is a future concern

**Protocol Surface Area**:
- Another protocol to maintain alongside MCP
- Must track A2A spec evolution
- Mitigation: Separate package limits blast radius of changes

### Open Questions

1. **Task State Persistence**: Where do A2A Tasks persist? In `~/.thinksuit/sessions`? New `~/.thinksuit/a2a-tasks`?
2. **Streaming Support**: Should we implement `message/stream` (SSE) initially or start with `message/send` only?
3. **Push Notifications**: A2A supports async push notifications—do we need this for local-only deployment?
4. **History Length**: How do we map A2A's `historyLength` parameter to ThinkSuit sessions?
5. **Artifacts**: How do ThinkSuit execution traces map to A2A Artifacts?

## Alternatives Considered

### Alternative 1: Single Agent Card with Metadata-Based Config

Expose one ThinkSuit agent, require external agents to pass config via message metadata:

```json
"message": {
  "metadata": {
    "thinksuit": {
      "module": "thinksuit/mu",
      "tools": ["filesystem"],
      "maxDepth": 3
    }
  }
}
```

**Rejected because:**
- Violates A2A's opacity principle (external agents shouldn't know ThinkSuit internals)
- Poor discovery: external agents can't understand capability differences
- Metadata conventions are extension territory per A2A spec, but this feels like core functionality

### Alternative 2: Bundle A2A Server into thinksuit-console

Add A2A routes to the existing thinksuit-console daemon.

**Rejected because:**
- Breaks architectural consistency (mcp-server is separate)
- Couples protocol adapter to UI concerns
- Forces users to run console even if they only want A2A
- Reduces modularity and independent lifecycle management

### Alternative 3: Dynamic Agent Card Generation

Generate Agent Cards on-the-fly based on request parameters or query strings.

**Rejected because:**
- A2A discovery model assumes static capabilities per endpoint
- Complicates caching and discovery
- External agents expect stable, predictable agent identities

## Related

- A2A Protocol Specification: https://github.com/a2aproject/A2A
- MCP Server Implementation: `mcp-server.js` (to be moved to `packages/thinksuit-mcp-server`)
- ThinkSuit Console: `packages/thinksuit-console/`
- Gateless Engineering Principles: `CLAUDE.md`

## Implementation Notes

**Phase 1: Core A2A Server**
1. Create `packages/thinksuit-a2a-server/` package
2. Implement Agent Card generation from config
3. Implement `message/send` endpoint (sync request/response)
4. Basic Task object structure
5. Registry file generation

**Phase 2: Enhanced Capabilities**
1. `message/stream` support (SSE)
2. Task history integration with ThinkSuit sessions
3. Artifact mapping for traces
4. Enhanced discovery mechanisms

**Phase 3: Ecosystem Integration**
1. Example agent definitions for common use cases
2. Documentation for external agent integration
3. Testing with other A2A-compatible agents
