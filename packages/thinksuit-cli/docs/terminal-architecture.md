# Terminal Architecture

This document explains the terminal rendering architecture in ThinkSuit CLI - all the stream manipulation, readline tricks, and rendering patterns needed to build a rich terminal UI that preserves scrollback.

## The Core Challenge

We want:
1. **Rich interactive UI** - Status lines, borders, hints that update in-place
2. **Preserved scrollback** - Users can scroll back through conversation history
3. **Normal readline behavior** - History navigation, editing, cursor movement
4. **Custom input handling** - Paste detection, signal filtering, mode detection

Standard Node.js readline can't do all this. We need to build on top of it.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│  stdin (raw mode)                                           │
│    ↓                                                        │
│  BracketedPasteFilter (Transform stream)                   │
│    - Detects bracketed paste sequences                     │
│    - Filters out Ctrl-C (\x03) to prevent readline pause   │
│    - Emits keypress events                                 │
│    ↓                                                        │
│  readline interface                                        │
│    - input: pasteFilter                                    │
│    - output: MuteStream (muted!)                           │
│    - Handles: line editing, history, cursor position       │
│    ↓                                                        │
│  ControlDock                                               │
│    - Wraps readline with UI (status, borders, hints)       │
│    - Uses ScreenManager for rendering                      │
│    ↓                                                        │
│  ScreenManager                                             │
│    - Unmutes output only when writing                      │
│    - Manages cursor positioning and line tracking          │
│    ↓                                                        │
│  stdout                                                    │
└─────────────────────────────────────────────────────────────┘
```

## Key Components

### 1. Raw Mode + Bracketed Paste

**main.js:73-77**
```javascript
if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
    process.stdout.write('\x1b[?2004h');  // Enable bracketed paste
}
```

**Why raw mode?**
- Normal "cooked" mode processes input line-by-line
- We need character-by-character input for real-time UI updates
- Allows us to intercept special keys (Ctrl-C, ESC) before they become signals

**Why bracketed paste?**
- Modern terminals wrap pasted content in `\x1b[200~` ... `\x1b[201~`
- Lets us detect large pastes and tokenize them
- Prevents 1000-line pastes from flooding scrollback

### 2. BracketedPasteFilter - The Input Gatekeeper

**bracketed-paste-filter.js**

A Transform stream that sits between stdin and readline:

**What it does:**
1. **Detects bracketed paste sequences** - Looks for `\x1b[200~` and `\x1b[201~`
2. **Tokenizes large pastes** - Replaces 100+ line pastes with `[Pasted text #N +L lines]`
3. **Filters Ctrl-C** - Removes `\x03` from stream and emits 'ctrl-c' event instead
4. **Emits keypress events** - Via `readline.emitKeypressEvents(pasteFilter, rl)`

**Critical insight: Filtering Ctrl-C**

bracketed-paste-filter.js:36-39:
```javascript
if (data.includes('\x03')) {
    this.emit('ctrl-c');
    this.#buffer += data.replace(/\x03/g, '');  // Remove \x03
}
```

**Why?** When readline receives `\x03` in raw mode, it can pause or block. By filtering it here and emitting an event, we:
- Maintain full control over Ctrl-C handling
- Prevent readline from entering a blocked state
- Keep input flowing normally after Ctrl-C is cancelled

### 3. MuteStream - Taking Control of Output

**main.js:50-54**
```javascript
const output = new MuteStream();
output.pipe(process.stdout);
output.mute();  // Mute immediately
```

**Why mute readline's output?**
- Readline normally echoes input automatically
- We need full control over rendering (status lines, borders, hints)
- ScreenManager will unmute only when we explicitly write

**The flow:**
```
ScreenManager.write() → unmute → write to output → re-mute
```

This prevents readline from interfering with our carefully positioned UI elements.

### 4. ScreenManager - The Rendering Engine

**screen-manager.js** (ported from Inquirer.js)

Manages cursor positioning and in-place updates without losing scrollback.

**Core pattern:**
```javascript
render(content, bottomContent) {
    // 1. Set readline prompt to control backspace behavior
    this.#rl.setPrompt(promptWithoutInput);

    // 2. Break lines at terminal width
    content = breakLines(content, width);
    bottomContent = breakLines(bottomContent, width);

    // 3. Calculate cursor position
    // 4. Erase old content
    // 5. Write new content
    // 6. Move cursor back to input position
}
```

**Key tricks:**

**a) Tracking render height**
```javascript
this.#height = height(output);
this.#extraLinesUnderPrompt = bottomContentHeight;
```

Remembers how many lines were rendered so next render can erase them.

**b) Cursor synchronization**
```javascript
checkCursorPos() {
    const cursorPos = this.#rl.getCursorPos();
    if (cursorPos.cols !== this.#cursorPos.cols) {
        this.write(cursorTo(cursorPos.cols));
        this.#cursorPos = cursorPos;
    }
}
```

Called on every keypress to keep cursor position in sync with readline's internal state.

**c) Unmute/write/mute pattern**
```javascript
write(content) {
    this.#rl.output.unmute();
    this.#rl.output.write(content);
    this.#rl.output.mute();
}
```

Only unmutes for the duration of our write, preventing readline echo.

### 5. Line Breaking - The Critical Detail

**utils.js:16-25**
```javascript
export function breakLines(content, width) {
    return content
        .split('\n')
        .flatMap((line) =>
            wrapAnsi(line, width, { trim: false, hard: true, wordWrap: false })
                .split('\n')
                .map((str) => str.trimEnd())
        )
        .join('\n');
}
```

**Critical parameter: `wordWrap: false`**

This uses **hard character breaks** instead of word wrapping. Why?

Readline calculates cursor position by counting characters. If we word-wrap text, readline's cursor position calculation becomes incorrect. We must break at exact character boundaries to match readline's expectations.

Example:
```
# With wordWrap: true (WRONG)
> This is a very long
  line that wraps
  ^cursor here - but readline thinks it's 2 chars further!

# With wordWrap: false (CORRECT)
> This is a very long l
ine that wraps
^cursor position matches readline's calculation
```

### 6. ControlDock - The Ephemeral Dock Pattern

**control-dock.js**

Wraps readline with a "dock" UI that renders in-place:

```
[Status line - reserved space]
────────────────────────────────
> [input prompt with readline managing cursor]
────────────────────────────────
[Hint line - reserved space]
```

**Key methods:**

**getInput()** - Sets up Promise that resolves on 'line' event
- Registers keypress listeners for history navigation
- Re-renders on every keystroke
- Cleans up listeners when done

**commitInput()** - Transitions dock to scrollback
```javascript
commitInput(inputValue) {
    this.#screen.clear();  // Erase the dock
    this.#screen.write(coloredPrompt + inputValue + '\n\n');  // Write just the input line
}
```

Only the input line gets committed to scrollback - borders and hints disappear.

**Reserved space with zero-width joiner**
```javascript
const statusLine = this.#currentStatus || '\u200D';
const hintLine = this.#currentHint || '\u200D';
```

**Why `\u200D`?**
- Empty strings collapse to zero height
- We need to reserve the line even when empty
- Zero-width joiner renders as invisible but maintains line height

### 7. The Rendering Cycle

**On each keystroke:**

1. **Keypress event fires** (pasteFilter)
2. **ControlDock's onKeypress handler** updates mode/history
3. **ControlDock calls render()** with current input
4. **ScreenManager.render()** does:
   - Erase old content (using tracked height)
   - Build new content (status + border + prompt + input + border + hint)
   - Calculate cursor position
   - Write content
   - Move cursor back to input position
5. **checkCursorPos() fires** (separate keypress listener)
6. **ScreenManager syncs cursor** if position changed

**Two separate keypress listeners:**
```javascript
// control-dock.js:111-113
this.#rl.input.on('keypress', onKeypress);      // Render first
this.#rl.input.on('keypress', checkCursor);     // Sync cursor after
```

Order matters! Render must complete before cursor sync.

## Common Patterns

### Writing Output Without Losing Dock

```javascript
controlDock.clearDock();              // Erase the dock UI
console.log('Your output here');       // Write to scrollback
// Dock will re-render on next input cycle
```

### Committing Status to Scrollback

```javascript
controlDock.updateStatus('Processing...');
// ... work happens ...
controlDock.commitStatus();           // Write status to scrollback
controlDock.clearDock();              // Clear for output
```

### Handling Approval/Confirmation

```javascript
const approved = await controlDock.getApproval({ tool, args, approvalId });
// Takes over the dock area
// Shows approval UI
// Waits for Enter/ESC
// Writes decision to scrollback
// Returns boolean
```

## Why This Complexity?

Each piece solves a specific problem:

| Component | Problem Solved |
|-----------|----------------|
| Raw mode | Need character-level input for real-time UI |
| BracketedPasteFilter | Large pastes flood scrollback; Ctrl-C blocks readline |
| MuteStream | Readline echo conflicts with custom rendering |
| ScreenManager | Need in-place updates without losing scrollback |
| Hard line breaks | Cursor position must match readline's calculations |
| Zero-width joiner | Reserve space for empty status/hint lines |
| Dual keypress listeners | Render must complete before cursor sync |
| Unmute/write/mute | Temporary output control around each write |

## Gotchas and Footguns

### 1. Never use alternate screen buffer
`\x1b[?1049h` - Would break scrollback entirely

### 2. Always break lines before rendering
Readline needs accurate character counts for cursor positioning

### 3. checkCursorPos() must be separate listener
Registering it after onKeypress ensures render completes first

### 4. Empty lines need \u200D
Empty strings collapse; use zero-width joiner for reserved space

### 5. Don't let readline see \x03
Filter it in transform stream before it reaches readline

### 6. Prompt must exclude rl.line
```javascript
let prompt = rawPromptLine;
if (this.#rl.line.length > 0) {
    prompt = prompt.slice(0, -this.#rl.line.length);
}
this.#rl.setPrompt(prompt);
```

Readline adds rl.line after the prompt; we must account for it.

## Debugging

### Check if readline is muted
```javascript
console.log(rl.output.muted);  // Should be true
```

### See raw keypress events
```javascript
pasteFilter.on('keypress', (char, key) => {
    console.error('KEY:', { char, key });  // Use stderr to not interfere
});
```

### Verify cursor position
```javascript
console.error('Cursor:', rl.getCursorPos());
```

### Check screen state
```javascript
console.error('Height:', screenManager.#height);  // Private - need to expose
```

## References

This architecture is based on:
- **@inquirer/core** - ScreenManager pattern
- **Node.js readline** - Built-in line editing
- **MuteStream** - Output control
- **wrap-ansi** - ANSI-aware line breaking

The key insight: Build a rendering layer on TOP of readline rather than trying to replace it.
