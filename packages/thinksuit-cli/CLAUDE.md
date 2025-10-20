# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with the ThinkSuit CLI package.

## Package Overview

**ThinkSuit CLI** - Interactive REPL for ThinkSuit AI orchestration with rich terminal features and natural scrollback.

**Status**: MVP functional with ControlDock UI using ScreenManager (ported from Inquirer.js). Core input/output working, session management operational, scrollback preserved. Multi-line input wrapping works correctly with borders and status updates.

## Architecture

### Core Design Principles

1. **Preserve Terminal Scrollback** - Users must be able to scroll back through conversation history
2. **Rich Input Features** - Command history, navigation, custom key bindings
3. **Inline Status Updates** - Progress indicators that update in-place without disrupting output
4. **Generator-Based Commands** - Commands yield effects, separating orchestration from I/O
5. **Primitive Effects** - Effect handlers are simple I/O operations only, business logic lives in commands
6. **Ephemeral Dock Pattern** - Each input cycle creates a new dock, previous becomes scrollback

### Critical Technical Constraints

- **ScreenManager Pattern**: Uses Inquirer.js architecture (Node.js readline + MuteStream + ScreenManager)
- **wordWrap: false**: Must use hard character breaks in wrap-ansi to match readline's cursor position calculation
- **No Alternate Screen Buffer**: Would break scrollback - never use this
- **Muted Output**: ScreenManager has full rendering control, readline echo is muted
- **Cursor Sync**: checkCursorPos() listener on keypress keeps cursor position accurate

## File Structure

```
src/
├── main.js                      # Entry point, input loop, key handling, routing
├── lib/
│   ├── ansi.js                  # ANSI escape sequences
│   ├── screen-manager.js        # ScreenManager (ported from Inquirer.js)
│   └── utils.js                 # Text wrapping with wrap-ansi
├── repl/
│   ├── effects.js               # Effect runner utilities
│   ├── cli-effects.js           # Effect handlers: output, error, clear, status, clear-dock
│   ├── commands.js              # Command generators: session, status, config, help, execute
│   └── tui-logger-stream.js     # Pino stream capturing ThinkSuit events
└── tui/
    └── control-dock.js          # ControlDock - dock UI using ScreenManager
```

## Key Components

### ControlDock (`tui/control-dock.js`)

**Purpose**: Manages the dock UI with status, input prompt, hints, and tool approval requests.

**Input Mode Structure**:
```
[Status line - reserved space]
────────────────────────────────  (dim gray border)
> [input prompt]
────────────────────────────────  (dim gray border)
[Hint line - reserved space]
```

**Approval Mode Structure**:
```
⚠ Tool Approval Required
────────────────────────────────
Tool: [tool_name]
Arguments:
[formatted args]
────────────────────────────────
y = Approve | n = Deny | ESC = Deny
```

**Key Methods**:
- `getInput(options)` - Get user input with history support
- `getApproval({ tool, args, approvalId })` - Display tool approval UI and wait for user decision
- `commitInput(inputValue)` - Commit input to scrollback (clears dock, writes input line only)
- `updateStatus(message)` / `clearStatus()` - Manage status line
- `commitStatus()` - Write status to scrollback before clearing
- `showHint(message)` / `clearHint()` - Manage hint line
- `clearDock()` - Clear dock rendering (use before writing output)

**Important**:
- Status/hint lines use `\u200D` (zero-width joiner) when empty to reserve space
- `commitInput()` only writes the prompt + input to scrollback (no borders/hints)
- Always call `clearDock()` before writing command output to prevent overlay
- `getApproval()` takes over the dock area and returns a Promise<boolean> for the approval decision

### Effect System (`cli-effects.js`)

Primitive I/O operations only:
- `output` - Write to stdout
- `error` - Write error in red
- `clear` - Clear screen
- `status-show` / `status-clear` - Manage status line
- `clear-dock` - Clear dock rendering
- `confirm` - Yes/no prompt
- `approval-request` - Interactive tool approval UI (returns { approved, approvalId })

### Command System (`commands.js`)

All commands are async generators that yield effects:
- `:session [id]` - Manage session (no args: clear, with ID: set)
- `:status` - Show current session and configuration
- `:config [key] [value]` - Get/set configuration
- `:clear` - Clear screen
- `:help` - Show help
- `:quit, :exit, :q` - Exit REPL
- `execute` - Execute input through ThinkSuit (for non-command input)

### Main Loop (`main.js`)

1. Get input from ControlDock
2. Skip if empty
3. Commit input to scrollback
4. Route to command based on prefix (`:` for system commands)
5. Execute command through effect system
6. Loop

**Key Handling**:
- `CTRL_C` - Double-press to exit (shows hint on first press, 3-second timeout)
- `ESC` - Interrupt ThinkSuit execution when busy
- `UP/DOWN` - Command history (built into readline)

## Configuration

Loaded via `buildConfig()` from ThinkSuit engine. In-memory config managed via `:config` command.

**Key settings**: module, provider, model, tools, maxdepth, maxfanout

## Session Integration

- First execution creates sessionId
- `:session` clears or sets sessionId
- Session data stored in `~/.thinksuit/sessions/*.jsonl`
- Event streaming through Pino with TuiLoggerStream

## Common Patterns

**Adding a new effect**:
1. Add handler to `createCliEffects()` in cli-effects.js
2. Handler signature: `async (session, ...args) => result`

**Adding a new command**:
1. Create async generator in commands.js
2. Yield effects: `yield fx('effect-name', ...args)`
3. Return true to continue REPL
4. Add to `defaultCommands` export

**Updating dock during execution**:
```javascript
controlDock.updateStatus('Processing...');
// ... do work ...
controlDock.updateStatus('Completed');
controlDock.commitStatus();  // Write to scrollback
controlDock.clearDock();     // Clear before output
```

## Tool Approval System

**Status**: ✅ Implemented

The CLI now supports interactive tool approval:

1. **Automatic Detection**: Tool approval requests are detected via `execution.tool.approval-requested` events
2. **Queue Processing**: Approvals are processed sequentially in FIFO order via background processor
3. **Interactive UI**: ControlDock switches to approval mode, displays tool details, and waits for y/n/ESC
4. **Integration**: Uses ThinkSuit's `resolveApproval()` to communicate decision back to execution engine
5. **Configuration**: `autoApproveTools: false` in executeCommand enables the approval flow

**Event Flow**:
- ThinkSuit emits `execution.tool.approval-requested` event →
- TuiLoggerStream forwards to handleEvent →
- Event added to approval queue →
- Background processor detects queued approval →
- ControlDock.getApproval() shows UI and waits →
- User decision resolves approval →
- ThinkSuit continues execution

## Paste Handling

**Status**: ✅ Implemented

The CLI uses bracketed paste mode to cleanly handle large pasted content:

1. **Detection**: Terminal wraps pastes in `\x1b[200~` ... `\x1b[201~` escape sequences
2. **Threshold**: Pastes with **100+ lines OR 2000+ characters** are tokenized
3. **Token Format**: `[Pasted text #N +L lines]` (Claude Code style)
4. **Registry**: Tokens map to content, scoped per input cycle
5. **User Control**: Users can edit/delete tokens before submit
6. **Expansion**: Tokens expanded to full content only when input submitted to ThinkSuit

**Example workflow:**
```
User pastes 1000 lines of code
> Here's my code: [Pasted text #1 +1000 lines]
                   ↑ user can edit this, delete it, add context around it
<Enter>
→ ThinkSuit receives full 1000 lines with user's context
```

**Scrollback shows:**
```
> Here's my code: [Pasted text #1 +1000 lines]

Response:
...
```

Clean and compact! Preserves scrollback readability while maintaining full paste content.

**Requirements**: Modern terminal with bracketed paste support (xterm.js, iTerm2, Terminal.app, Alacritty, etc.)

**Implementation Details**:
- Bracketed paste mode enabled via `\x1b[?2004h` on startup
- Raw data listener in `ControlDock.getInput()` detects paste markers
- Multi-chunk paste accumulation supported
- Small pastes (<100 lines AND <2000 chars) flow through normally
- Registry cleared after each input cycle (no state leaks)

## Future Enhancements

### Priority: Input Queueing
User cannot type next message while ThinkSuit is processing. Should allow typing ahead while execution continues.

### Other Enhancements
- Auto-completion for commands and session IDs
- Multi-line input mode
- Trace inspection commands
- Config option to control autoApproveTools behavior
- Approval timeout display in UI
- Manual `:paste` command for terminals without bracketed paste support

## Philosophy

This CLI respects the terminal. Users should be able to scroll back, copy/paste history, and work naturally within terminal multiplexers. Every feature must pass the scrollback test.
