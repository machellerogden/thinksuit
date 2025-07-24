# CLAUDE.md - ThinkSuit MCP Server

This file provides guidance to Claude Code when working with the ThinkSuit MCP Server package.

## Package Overview

**ThinkSuit MCP Server** - An MCP server that exposes ThinkSuit functionality to external MCP clients (like Claude Desktop, IDEs, etc.).

**Purpose**: Make ThinkSuit's AI orchestration capabilities available as MCP tools for external consumption.

**Key Distinction**:
- This package is a **server** that exposes ThinkSuit TO external clients
- `thinksuit-mcp-tools` is a collection of custom tools consumed BY ThinkSuit
- `thinksuit/engine/mcp/` contains client code for ThinkSuit to consume external MCP servers

## For Development Details

See **../../CONTRIBUTING.md** for:
- Quick reference commands
- Architecture overview
- Development workflow
- Testing strategies
- Code style guidelines

## Package Structure

```
lib/
  index.js              # Server setup - registers all tools
  tools/
    thinksuit.js        # Main execution tool
    signals.js          # Signal detection tool
    session.js          # Session query tool
    inspect.js          # Deep inspection tool
bin/
  mcp-server.js         # Entry point for the server
support/
  claude-code/
    commands/
      thinksuit/        # Claude Code slash commands
        thinksuit.md    # /thinksuit command
        signals.md      # /signals command
        session.md      # /session command
        inspect.md      # /inspect command
```

## Important Implementation Notes

### Dependencies

This package uses `thinksuit` as a **dependency**, importing from it like any external consumer:

```javascript
import { schedule, detectSignalsCore, loadModule } from 'thinksuit';
```

**Never** use relative paths to access thinksuit internals. Always import via the package.

### Tool Implementation Pattern

All tools follow this pattern:

```javascript
export function registerToolName(server) {
    server.tool(
        'tool-name',
        { /* zod schema */ },
        async ({ param1, param2 }) => {
            try {
                // Tool implementation
                return {
                    content: [{
                        type: 'text',
                        text: 'Response'
                    }]
                };
            } catch (error) {
                return {
                    content: [{
                        type: 'text',
                        text: `❌ **Error**: ${error.message}`
                    }]
                };
            }
        }
    );
}
```

### Transport

The server uses **stdio transport** (stdin/stdout) for communication, which is the standard for MCP servers.

### Environment Variables

- `OPENAI_API_KEY`: Required for the main `thinksuit` tool execution

## Testing

```bash
# Start the server
npm run mcp

# From monorepo root
npm run mcp

# Test with MCP Inspector
echo '{"method":"tools/list"}' | npx @modelcontextprotocol/inspector node bin/mcp-server.js
```

## Adding New Tools

To add a new tool:

1. Create a new file in `lib/tools/`
2. Export a `register{ToolName}` function
3. Import and call it in `lib/index.js`
4. Update README.md with tool documentation

## Related Packages

- **thinksuit** - Core engine consumed by this server
- **thinksuit-modules** - Cognitive modules used during execution
- **thinksuit-mcp-tools** - Custom tools consumed BY ThinkSuit (opposite direction)
