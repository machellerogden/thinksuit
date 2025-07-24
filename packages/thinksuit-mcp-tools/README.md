# ThinkSuit MCP Tools

Custom MCP tools for ThinkSuit that provide fun and useful utilities during AI orchestration.

## Available Tools

### roll_dice

Roll dice for decision making! Supports standard dice notation.

**Parameters:**
- `notation` (optional): Dice notation like "2d6+3" or "d20". Defaults to "d20"
- `purpose` (optional): What decision or question the roll is for
- `advantage` (optional): Roll twice and take higher (for d20 only)
- `disadvantage` (optional): Roll twice and take lower (for d20 only)

**Examples:**
- "Should I refactor this code?" → rolls d20
- "How many unit tests to write?" → roll 2d6+3
- "Use recursion or iteration?" → roll d20 with purpose

## Usage

This MCP server is automatically registered in the mu module and the `roll_dice` tool is available during ThinkSuit execution.

```bash
# The assistant can use it during task execution:
npm run cli "I need to make a decision about whether to use TypeScript or JavaScript. Can you roll for it?"
```

## Adding New Tools

To add a new tool:

1. Create a new file in `tools/` directory
2. Export a `register{ToolName}` function that calls `server.tool()`
3. Import and call it in `index.js`
4. Add the tool name to the `tools` array in `packages/thinksuit-modules/index.js`

## Development

```bash
# Install dependencies
npm install

# The server runs via stdio when ThinkSuit starts
node server.js
```

## License

Apache 2.0
