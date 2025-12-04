# ThinkSuit CLI

> Interactive REPL for ThinkSuit AI orchestration

The ThinkSuit CLI is the primary terminal-based interface for working with ThinkSuit. It provides a rich interactive REPL with command history, session management, tool approval workflow, and clean scrollback preservation.

## Installation

From the monorepo root:

```bash
# Install dependencies
npm install

# Link the thinksuit command globally
npm -w thinksuit-cli link
```

This makes the `thinksuit` command available system-wide.

## Quick Start

```bash
# Start the REPL
thinksuit

# Or from the monorepo
npm run start
```

Once in the REPL, just type naturally to interact with ThinkSuit:

```
> What is quantum computing?
```

## Configuration

### API Keys

Set your API key before running:

```bash
# For OpenAI (default provider)
export OPENAI_API_KEY="your-key"

# For Vertex AI
gcloud auth application-default login
export GOOGLE_CLOUD_PROJECT="your-project-id"
```

### Configuration File

Create `~/.thinksuit.json`:

```json
{
    "module": "thinksuit/mu",
    "provider": "openai",
    "model": "gpt-4o-mini",
    "maxDepth": 5,
    "maxFanout": 3
}
```

You can also configure via environment variables or CLI flags. See the [thinksuit engine documentation](../thinksuit/README.md) for complete configuration options.

## REPL Commands

The CLI supports several built-in commands:

### Session Management

```
:session              # Clear current session (start fresh)
:session <id>         # Resume or set specific session
:status               # Show current session and config
```

### Configuration

```
:config               # Show all configuration
:config <key>         # Show specific config value
:config <key> <value> # Set config value for this session
```

**Available config keys:** `module`, `provider`, `model`, `tools`, `maxdepth`, `maxfanout`

### Utilities

```
:help                 # Show available commands
:clear                # Clear screen
:quit, :exit, :q      # Exit REPL
```

## Key Features

### Interactive Tool Approval

When ThinkSuit needs to use tools (file operations, etc.), the CLI presents an interactive approval UI:

```
⚠ Tool Approval Required
────────────────────────────────
Tool: read_text_file
Arguments:
  path: /path/to/file.txt
────────────────────────────────
y = Approve | n = Deny | ESC = Deny
```

### Paste Handling

The CLI intelligently handles large pasted content (100+ lines or 2000+ characters) by tokenizing it:

```
> Here's my code: [Pasted text #1 +1000 lines]
```

You can edit around the token before submitting. The full content is expanded when sent to ThinkSuit.

**Requirements:** Terminal with bracketed paste support (iTerm2, Terminal.app, Alacritty, xterm.js, etc.)

### Session Continuity

Sessions are automatically managed and persisted to `~/.thinksuit/sessions/`. You can:
- Start fresh with `:session`
- Resume any previous session with `:session <id>`
- View current session status with `:status`

### Command History

Use `↑` and `↓` arrow keys to navigate through command history.

### Scrollback Preservation

The CLI is designed to respect your terminal. All conversation history remains in scrollback for easy review and copy/paste.

## Keyboard Shortcuts

- `↑` / `↓` - Navigate command history
- `CTRL+C` (twice) - Exit REPL (first press shows hint, 3-second timeout)
- `ESC` - Interrupt ThinkSuit execution when busy
- `Enter` - Submit input

## Examples

### Basic Conversation

```
> What is the difference between a compiler and an interpreter?

Response: A compiler translates source code into machine code...

> Can you give me an example in C?

Response: Here's a simple C program that demonstrates...
```

### Session Management

```
> :status
Session: 20250924T155819461Z-8LtZ_xlY
Provider: openai
Model: gpt-4o-mini
Module: thinksuit/mu

> :session
Session cleared

> :session 20250924T155819461Z-8LtZ_xlY
Session set to: 20250924T155819461Z-8LtZ_xlY
```

### Configuration

```
> :config model
gpt-4o-mini

> :config model gpt-4o
Configuration updated: model = gpt-4o

> :config
module: thinksuit/mu
provider: openai
model: gpt-4o
maxdepth: 5
maxfanout: 3
```

## Architecture

The CLI uses a generator-based command system with primitive effects, separating orchestration from I/O. Key components:

- **ControlDock**: Manages dock UI with status, input prompt, and hints
- **Effect System**: Primitive I/O operations (output, error, status updates)
- **Command System**: Async generators that yield effects
- **ScreenManager**: Handles terminal rendering (ported from Inquirer.js)

For architectural details and development guidance, see [CLAUDE.md](CLAUDE.md).

## Development

See the monorepo [CONTRIBUTING.md](../../CONTRIBUTING.md) for development workflow, testing, and code style guidelines.

## License

Apache 2.0
