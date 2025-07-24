# ThinkSuit MCP Server

MCP server that exposes ThinkSuit functionality to external MCP clients like Claude Desktop.

## Overview

This package provides a Model Context Protocol (MCP) server that makes ThinkSuit's AI orchestration capabilities available to external tools and applications. It's designed to be consumed by MCP clients, not to consume other MCP tools.

**Important distinction:**
- **`thinksuit-mcp-server`** (this package) - Exposes ThinkSuit TO external clients
- **`thinksuit-mcp-tools`** - Custom tools consumed BY ThinkSuit

## Available Tools

### `thinksuit`

Execute ThinkSuit AI orchestration with full configuration options.

**Parameters:**
- `input` (required): The message to process
- `options` (optional):
  - `sessionId`: Resume an existing session
  - `module`: Module to use (default: `thinksuit/mu`)
  - `model`: LLM model (default: `gpt-4o-mini`)
  - `provider`: LLM provider (default: `openai`)
  - `maxDepth`: Maximum recursion depth
  - `maxFanout`: Maximum parallel branches
  - `temperature`: LLM temperature
  - `maxTokens`: Maximum tokens for response
  - `trace`: Enable execution tracing
  - `cwd`: Working directory for tool operations
  - `tools`: Array of tool names to enable
  - `autoApproveTools`: Auto-approve tool usage

**Example:**
```json
{
  "input": "Explain quantum computing",
  "options": {
    "trace": true,
    "model": "gpt-4o"
  }
}
```

### `thinksuit-signals`

Analyze conversation threads to detect cognitive signals.

**Parameters:**
- `conversation` (required): Array of message objects with `role` and `content`
- `options` (optional):
  - `module`: Module to use for detection
  - `profile`: Detection profile (`fast`, `balanced`, `thorough`)
  - `budgetMs`: Time budget in milliseconds

**Example:**
```json
{
  "conversation": [
    {"role": "user", "content": "All swans are white"},
    {"role": "assistant", "content": "That's not quite accurate..."}
  ],
  "options": {
    "profile": "thorough"
  }
}
```

### `thinksuit-session`

Query and inspect ThinkSuit sessions.

**Parameters:**
- `action` (required): `list`, `get`, `status`, or `metadata`
- `sessionId` (required for get/status/metadata): Session ID
- `options` (optional):
  - `fromTime`: Start time for listing (ISO 8601)
  - `toTime`: End time for listing (ISO 8601)
  - `sortOrder`: `asc` or `desc`
  - `limit`: Maximum number of sessions

**Examples:**
```json
{"action": "list", "options": {"limit": 10}}
{"action": "get", "sessionId": "20250924T155819461Z-8LtZ_xlY"}
{"action": "status", "sessionId": "20250924T155819461Z-8LtZ_xlY"}
```

### `thinksuit-inspect`

Deep inspection of sessions and execution traces.

**Parameters:**
- `action` (required): `session`, `trace`, or `list-traces`
- `id` (required for session/trace): Session or trace ID
- `options` (optional):
  - `entryIndex`: Specific entry index in session
  - `showRaw`: Show raw JSON data
  - `limit`: Limit results

**Examples:**
```json
{"action": "list-traces", "options": {"limit": 5}}
{"action": "trace", "id": "20250924T155819520Z-fMpbmCpG"}
{"action": "session", "id": "20250924T155819461Z-8LtZ_xlY", "options": {"entryIndex": 0}}
```

## Usage

### Running the Server

From the monorepo root:

```bash
npm run mcp
```

Or directly:

```bash
cd packages/thinksuit-mcp-server
npm start
```

### Configuring Claude Desktop

Add to your Claude Desktop MCP configuration (`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

```json
{
  "mcpServers": {
    "thinksuit": {
      "command": "node",
      "args": ["/path/to/thinksuit/packages/thinksuit-mcp-server/bin/mcp-server.js"],
      "env": {
        "OPENAI_API_KEY": "your-api-key-here"
      }
    }
  }
}
```

### Testing

```bash
# Using npx (from any directory)
echo '{"method":"tools/list"}' | npx -y @modelcontextprotocol/inspector node packages/thinksuit-mcp-server/bin/mcp-server.js
```

## Environment Variables

- `OPENAI_API_KEY`: Required for OpenAI provider (used by the `thinksuit` tool)

## Architecture

This server acts as a bridge between external MCP clients and the ThinkSuit engine:

```
External MCP Client (e.g., Claude Desktop)
    ↓
thinksuit-mcp-server (this package)
    ↓
thinksuit (core engine)
    ↓
thinksuit-modules (behavioral modules)
```

The server imports `thinksuit` as a dependency and exposes its functionality through MCP tools.

## Development

```bash
# Install dependencies (from monorepo root)
npm install

# Test the server
npm run mcp

# The server runs on stdio transport and communicates via JSON-RPC
```

## Claude Code Slash Commands

This package includes slash commands for Claude Code integration. Commands are located in `support/claude-code/commands/thinksuit/`:

- **`/thinksuit`** - Process input through ThinkSuit's AI orchestration
- **`/signals`** - Analyze conversation patterns with signal detection
- **`/session`** - Query and manage ThinkSuit sessions
- **`/inspect`** - Deep inspection of sessions and execution traces

### Setup

1. **Create symlink for slash commands:**

   ```bash
   ln -sf /absolute/path/to/packages/thinksuit-mcp-server/support/claude-code/commands/thinksuit ~/.claude/commands/thinksuit
   ```

2. **Configure MCP server in `.claude.json`:**

   ```json
   {
     "mcpServers": {
       "thinksuit": {
         "command": "node",
         "args": ["/absolute/path/to/packages/thinksuit-mcp-server/bin/mcp-server.js"],
         "env": {
           "OPENAI_API_KEY": "${OPENAI_API_KEY}"
         }
       }
     }
   }
   ```

3. **Restart Claude Code** to load the commands.

### Usage

Once configured, slash commands are available:

- `/thinksuit [input]` - Process through orchestrated AI
- `/signals [conversation]` - Analyze patterns
- `/session [action]` - Query sessions
- `/inspect [action]` - Deep inspection

See individual command files for detailed usage instructions.

## License

Apache 2.0
