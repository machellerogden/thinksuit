# Signal Handling in ThinkSuit CLI

This document explains how the CLI handles special input signals like Ctrl-C and ESC.

## Overview

The CLI uses a layered approach to handle terminal signals while preserving normal input flow:

```
stdin (raw mode) → BracketedPasteFilter → readline → ControlDock
```

## Ctrl-C Handling

### Goals

1. **Prevent accidental exits** - Require double Ctrl-C to exit
2. **Confirmation pattern** - Show hint after first Ctrl-C
3. **Cancellable** - Any other key cancels the exit confirmation
4. **Non-blocking** - Don't interfere with normal input after cancellation

### Implementation

**Step 1: Filter Ctrl-C from the input stream**

`BracketedPasteFilter._transform()` (bracketed-paste-filter.js:32-93):
- Detects `\x03` (Ctrl-C byte) in the input stream
- Emits a `'ctrl-c'` event
- **Removes** `\x03` from the stream so readline never sees it
- This prevents readline from pausing or entering a blocked state

**Step 2: Handle the Ctrl-C event**

`main.js:213-215`:
```javascript
pasteFilter.on('ctrl-c', () => {
    process.kill(process.pid, 'SIGINT');
});
```

Converts the filtered `\x03` into a proper SIGINT signal.

**Step 3: Track confirmation state**

`main.js:136-168` - Process-level SIGINT handler:
- First Ctrl-C: Show hint "Press Ctrl-C again to exit", start 3-second timeout
- Second Ctrl-C: Exit gracefully
- Third Ctrl-C: Force exit immediately
- Timeout: Auto-reset confirmation state after 3 seconds

**Step 4: Cancel on other input**

`main.js:217-228`:
```javascript
pasteFilter.on('data', (chunk) => {
    if (exitState.sigintCount > 0) {
        // Any input cancels the Ctrl-C confirmation state
        exitState.sigintCount = 0;
        if (exitState.resetTimer) {
            clearTimeout(exitState.resetTimer);
            exitState.resetTimer = null;
        }
        controlDock.clearTemporaryHint();
    }
});
```

Any keypress that produces data (i.e., not Ctrl-C since it's filtered) will cancel the confirmation state.

### Why This Works

The critical insight: **Ctrl-C must be removed from the stream before reaching readline**.

When readline receives `\x03` in raw mode, it can enter a state that blocks further input. By filtering it at the transform stream level and emitting an event instead, we:

1. Maintain full control over SIGINT handling
2. Prevent readline from blocking
3. Keep normal input flow working after Ctrl-C is pressed and cancelled

## ESC Handling

### Goals

1. **Interrupt execution** - ESC cancels running ThinkSuit operations
2. **Clear input** - Double ESC clears the current input line
3. **Show hints** - Visual feedback for ESC actions

### Implementation

`main.js:230-258` - Keypress handler on pasteFilter:

**When busy (ThinkSuit executing)**:
- First ESC: Interrupt execution via `executionState.interrupt()`

**When idle**:
- First ESC: Show hint "Press ESC again to clear input" (if input exists)
- Second ESC: Clear the input line
- Any other key: Cancel ESC state and clear hint

ESC doesn't need the same stream filtering as Ctrl-C because it doesn't cause readline to block.

## State Management

### Exit State
```javascript
const exitState = {
    sigintCount: 0,      // How many Ctrl-C pressed
    resetTimer: null     // Timeout to auto-reset count
};
```

### Execution State
```javascript
const executionState = {
    busy: false,         // Is ThinkSuit executing?
    interrupt: null      // Function to call to interrupt
};
```

### ESC State
```javascript
let lastKeyWasEsc = false;  // Track ESC sequences
```

## Key Principles

1. **Filter, don't block** - Remove problematic input from stream rather than trying to handle it downstream
2. **Events over state** - Use stream events to communicate between layers
3. **Separate concerns** - Transform stream handles filtering, main handles state, ControlDock handles UI
4. **Preserve scrollback** - Never use alternate screen buffer or clear in ways that lose history
5. **Explicit cancellation** - User actions should have clear, immediate feedback

## Debugging

To verify Ctrl-C handling:
1. Start the CLI: `npm run start`
2. Press Ctrl-C once - should see hint
3. Type any character - hint should clear, input should work normally
4. Press Ctrl-C twice quickly - should exit

To verify ESC handling:
1. Start the CLI
2. Type some text
3. Press ESC once - should see hint
4. Press ESC again - input should clear
