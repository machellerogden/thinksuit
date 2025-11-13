# Frame Implementation Plan

## Overview

Implement **frame** as a first-class concept in ThinkSuit to provide persistent, session-scoped context that influences instruction composition.

### What is Frame?

Frame is user-defined context that shapes how the system operates. It persists with the session and is injected into prompts at execution time.

**Current Implementation:** Frame as object with `text` field
```js
{
  text: string  // freeform context
}
```

**Future Evolution Path:** Additional structured fields can be added without breaking changes
```js
{
  text: string,
  // Future: identity, domain, goal, rules, preferences, etc.
}
```

### Why Frame?

Frame addresses the gap between:
- **Session state** (conversation history, tools, config)
- **User intent** (who they are, what they're doing, constraints they want)

It enables the disciplined interaction framework where context is explicit, editable, and persistent.

---

## Design Decisions

### 1. Frame Storage: Session Metadata

Frame is **session-scoped**, stored in session metadata, not global config.

**Rationale:**
- Different sessions may have different contexts
- Frame evolves with the work
- Clean separation: config = system settings, frame = user context

### 2. Frame Structure: Object with Text Field

Frame starts as `{ text: string }` rather than raw string.

**Rationale:**
- Enables future expansion without breaking changes
- Consistent type (always object, just more fields later)
- Clean migration path

### 3. Frame in Instruction Composition

Frame passed to `composeInstructions(plan, facts, frame)` as third parameter.

**Mu Module Implementation:**
- Injects `frame.text` into primary instructions template
- Frame appears once in initial user message (position [1] in thread)
- Does not repeat in task cycles or buildThread sequences

**Rationale:**
- Primary prompt is set once at thread start, persists through cycles
- Avoids repetition in multi-turn task strategy
- Maintains context weight even in long conversations

### 4. Frame Persistence

Frame is mutable session metadata:
- Loads with session
- Editable during session
- Persists back to session metadata on change

---

## Implementation Plan

### Phase 1: Engine/Core (packages/thinksuit)

#### 1.1 Session Metadata Schema

**File:** `packages/thinksuit/engine/session.js` (or wherever session metadata is defined)

Add frame to session metadata:
```js
{
  sessionId: string,
  created: timestamp,
  updated: timestamp,
  frame: { text: string } | null,
  // ... existing fields
}
```

#### 1.2 Schedule & Execution Pipeline

**File:** `packages/thinksuit/engine/schedule.js`

Update `schedule()` signature to accept frame:
```js
async function schedule({
  input,
  module,
  provider,
  model,
  // ... existing params
  frame,  // NEW: { text: string } | null
  sessionId,
  logger
}) {
  // Pass frame through execution context
}
```

**File:** Instruction composition handlers (wherever `composeInstructions` is called)

Pass frame to `composeInstructions`:
```js
const instructions = module.composeInstructions(plan, facts, frame);
```

#### 1.3 Module Contract Documentation

**File:** `packages/thinksuit/docs/MODULE_INTERFACE.md` (or similar)

Document updated `composeInstructions` signature:
```js
/**
 * @param {object} plan - Execution plan
 * @param {object} facts - Signal/rule facts
 * @param {object|null} frame - User context { text: string }
 * @returns {object} Instructions for LLM
 */
composeInstructions(plan, facts, frame)
```

---

### Phase 2: Mu Module (packages/thinksuit-modules/mu)

#### 2.1 Update composeInstructions

**File:** `packages/thinksuit-modules/mu/composeInstructions.js`

Update signature:
```js
export function composeInstructions(plan, facts, frame = null) {
  // ... existing logic
}
```

Inject frame into primary instructions:
```js
const primaryPrompt = prompts[role.prompts.primary];

// Build user message with frame
const userMessage = frame?.text
  ? `[Frame]\n${frame.text}\n\n${primaryPrompt}\n\n${input}`
  : `${primaryPrompt}\n\n${input}`;
```

**Note:** Exact template format can be refined. Key point: frame appears once in primary instructions.

---

### Phase 3: Console UI (packages/thinksuit-console)

#### 3.1 Frame Editor Component

**New File:** `packages/thinksuit-console/src/lib/components/FrameEditor.svelte`

Component features:
- Textarea for `frame.text` input
- Save/Cancel buttons
- Character count (optional)
- Markdown preview (future enhancement)

```svelte
<script>
  let { frame = $bindable({ text: '' }), onSave, onCancel } = $props();
  let editText = $state(frame.text || '');
</script>

<div class="frame-editor">
  <label>Frame (Session Context)</label>
  <textarea bind:value={editText} rows={8} placeholder="Define context, constraints, identity..."></textarea>
  <div class="actions">
    <button onclick={() => onSave({ text: editText })}>Save</button>
    <button onclick={onCancel}>Cancel</button>
  </div>
</div>
```

#### 3.2 Integrate into Session Controls

**File:** `packages/thinksuit-console/src/lib/components/SessionControls.svelte`

Add frame display/edit:
- Collapsible section "Frame" (similar to plan builder)
- Show frame.text preview when collapsed
- Expand to edit

**File:** `packages/thinksuit-console/src/lib/components/RunInterface.svelte`

Pass frame from session state to SessionControls.

#### 3.3 API Integration

**File:** `packages/thinksuit-console/src/routes/api/run/+server.js`

Accept frame in request body:
```js
const { input, trace, cwd, selectedPlan, frame } = await request.json();

const result = await schedule({
  input,
  module,
  provider,
  model,
  frame,  // Pass through
  // ... other params
});
```

**File:** `packages/thinksuit-console/src/routes/api/sessions/[id]/+server.js`

Include frame in session response (already in metadata, just ensure it's exposed).

#### 3.4 Session State Management

**File:** `packages/thinksuit-console/src/lib/stores/session.svelte.js`

Add frame to session store:
```js
let frame = $state({ text: '' });

// Load from session metadata
function loadSession(sessionData) {
  frame = sessionData?.metadata?.frame || { text: '' };
}

// Update frame
function updateFrame(newFrame) {
  frame = newFrame;
  // Persist to session metadata
}
```

---

### Phase 4: CLI (packages/thinksuit-cli)

#### 4.1 Frame Commands

**File:** `packages/thinksuit-cli/src/repl/commands.js`

Add frame commands:

```js
/**
 * :frame show - Display current frame
 */
export async function* frameShowCommand(args, session) {
  const frameText = session.thinkSuit.frame?.text || '(no frame set)';
  yield fx('output', chalk.bold.cyan('Frame:'));
  yield fx('output', frameText);
  yield fx('output', '');
  return true;
}

/**
 * :frame edit - Edit frame (multiline input)
 */
export async function* frameEditCommand(args, session) {
  // TODO: Implement multiline editor
  // For now, simple prompt:
  yield fx('output', chalk.yellow('Frame editing: Enter text, then type :save or :cancel'));
  // ... multiline input logic
  return true;
}

/**
 * :frame clear - Clear frame
 */
export async function* frameClearCommand(args, session) {
  const confirmed = yield fx('confirm', 'Clear frame?');
  if (confirmed) {
    session.thinkSuit.frame = { text: '' };
    yield fx('output', chalk.green('Frame cleared'));
  }
  return true;
}
```

**Update command registry:**
```js
export const defaultCommands = {
  // ... existing
  'frame': frameShowCommand,  // :frame defaults to show
  // Add subcommand routing if needed
};
```

#### 4.2 Update Status Command

**File:** `packages/thinksuit-cli/src/repl/commands.js`

Add frame to `:status` output:
```js
export async function* statusCommand(args, session) {
  // ... existing status output

  if (session.thinkSuit.frame?.text) {
    const preview = session.thinkSuit.frame.text.length > 100
      ? session.thinkSuit.frame.text.substring(0, 97) + '...'
      : session.thinkSuit.frame.text;
    yield fx('output', `  ${chalk.bold('Frame:')} ${preview}`);
  }

  // ...
}
```

#### 4.3 Execution Integration

**File:** `packages/thinksuit-cli/src/repl/commands.js` (executeCommand)

Include frame in scheduleConfig:
```js
const scheduleConfig = {
  input,
  module: thinkSuit.config.module,
  provider: thinkSuit.config.provider,
  model: thinkSuit.config.model,
  frame: thinkSuit.frame,  // NEW
  // ... existing config
};
```

#### 4.4 Session State

**File:** `packages/thinksuit-cli/src/main.js`

Add frame to session:
```js
const session = {
  commands: defaultCommands,
  rl,
  controlDock,
  executionState,
  thinkSuit: {
    sessionId: null,
    frame: { text: '' },  // NEW
    config: { /* ... */ }
  }
};
```

---

### Phase 5: Migration & Compatibility

**Existing Sessions:**
- Sessions without `frame` in metadata → treat as `null` or `{ text: '' }`
- No breaking changes to existing sessions

**Graceful Handling:**
- `composeInstructions` handles `frame = null`
- Console/CLI display "(no frame)" when empty

---

### Phase 6: Testing

**Test Cases:**

1. **Frame persistence:**
   - Create session with frame
   - Close and reload session
   - Verify frame loads correctly

2. **Frame in instructions:**
   - Set frame, send message
   - Check trace logs: verify frame appears in primary prompt
   - Verify frame does not repeat in task cycles

3. **Frame editing:**
   - Console: edit frame in UI, verify persistence
   - CLI: use `:frame edit`, verify changes

4. **Empty frame:**
   - No frame set → system works normally
   - Instructions composed without frame section

5. **Sequential buildThread:**
   - Set frame, run sequential plan with buildThread=true
   - Verify frame appears in first step, not repeated

---

## Files to Modify (Summary)

### Engine (packages/thinksuit)
- `engine/session.js` - Add frame to metadata schema
- `engine/schedule.js` - Accept frame parameter
- Instruction handlers - Pass frame to composeInstructions
- `docs/MODULE_INTERFACE.md` - Document frame contract

### Mu Module (packages/thinksuit-modules/mu)
- `mu/composeInstructions.js` - Accept and inject frame

### Console (packages/thinksuit-console)
- **NEW:** `src/lib/components/FrameEditor.svelte`
- `src/lib/components/SessionControls.svelte` - Integrate editor
- `src/lib/stores/session.svelte.js` - Add frame state
- `src/routes/api/run/+server.js` - Accept frame in request
- `src/routes/api/sessions/[id]/+server.js` - Include frame in response

### CLI (packages/thinksuit-cli)
- `src/repl/commands.js` - Add frame commands, update status, update execute
- `src/main.js` - Add frame to session state

---

## Next Steps

1. Start with engine/core changes (session metadata, schedule, composeInstructions)
2. Update mu module
3. Add Console UI
4. Add CLI commands
5. Test across all layers
6. Document in CONTRIBUTING.md

---

## Notes

- Frame structure allows future expansion without breaking changes
- Frame is session-scoped, not global
- Modules decide how to use frame (contract flexibility)
- Primary prompt injection avoids repetition in multi-turn cycles
