# Plan: Add Presets Feature

## Overview
Add presets as a user-facing concept that references plans. Modules export both `plans` and `presets`. The console uses presets for the UI, which reference plans by key.

## Key Distinctions
- **Plans**: Execution strategies with `rationale` (technical explanation of the strategy)
- **Presets**: User-facing configurations with `description` (what it does for users), reference plans by key

## Data Structure Changes

### Module Exports
Modules will export:
- `plans` - execution strategies (plans.json)
- `presets` - preset configurations (presets.json) - NEW

### presets.json (NEW FILE)
Location: `packages/thinksuit-modules/mu/presets.json`

Create one preset for each plan:
```json
{
  "chat": {
    "id": "chat",
    "name": "Chat",
    "description": "Natural conversation and direct responses",
    "plan": "chat"
  },
  "capture": {
    "id": "capture",
    "name": "Capture",
    "description": "Record information verbatim without commentary",
    "plan": "capture"
  },
  "investigate": {
    "id": "investigate",
    "name": "Investigate",
    "description": "Gather information using available tools",
    "plan": "investigate"
  },
  "analyze": {
    "id": "analyze",
    "name": "Analyze",
    "description": "Examine structure, identify patterns, and reason about information",
    "plan": "analyze"
  },
  "synthesize": {
    "id": "synthesize",
    "name": "Synthesize",
    "description": "Combine and integrate information into coherent output",
    "plan": "synthesize"
  },
  "execute": {
    "id": "execute",
    "name": "Execute",
    "description": "Perform work by calling tools to make changes",
    "plan": "execute"
  },
  "deep-analysis": {
    "id": "deep-analysis",
    "name": "Deep Analysis",
    "description": "Multi-stage investigation, analysis, and synthesis",
    "plan": "investigate-analyze-synthesize-fs"
  }
}
```

### plans.json Changes
Remove all `description` fields from plans. Keep only `rationale`.

Example before:
```json
{
  "chat": {
    "name": "chat",
    "description": "Natural conversation and direct responses",
    "rationale": "Single turn direct response for conversational interaction",
    "strategy": "direct",
    "role": "chat",
    "lengthLevel": "brief"
  }
}
```

Example after:
```json
{
  "chat": {
    "name": "chat",
    "rationale": "Single turn direct response for conversational interaction",
    "strategy": "direct",
    "role": "chat",
    "lengthLevel": "brief"
  }
}
```

### settings.json Structure (per module)
Location: `~/.thinksuit/console/settings.json`

Change from:
```json
{
  "customPresets": []
}
```

To:
```json
{
  "thinksuit/mu": {
    "customPlans": {
      "plan-20250107-abc123": {
        "name": "plan-20250107-abc123",
        "rationale": "Custom investigation with specific tools",
        "strategy": "task",
        "role": "investigate",
        "tools": ["list_directory", "read_file"]
      }
    },
    "customPresets": [
      {
        "id": "preset-20250107-xyz789",
        "name": "My Quick Check",
        "description": "Quick filesystem check with my custom settings",
        "plan": "plan-20250107-abc123"
      }
    ]
  }
}
```

## Backend Changes

### 1. Create presets.json
File: `packages/thinksuit-modules/mu/presets.json`
- Create preset for each plan
- Move `description` from plans to presets
- Each preset references plan by key

### 2. Update plans.json
File: `packages/thinksuit-modules/mu/plans.json`
- Remove all `description` fields
- Keep `rationale` fields

### 3. Update mu/index.js
File: `packages/thinksuit-modules/mu/index.js`
```javascript
import plans from './plans.json' with { type: 'json' };
import presets from './presets.json' with { type: 'json' };

export default {
    // ... existing exports
    plans,
    presets  // NEW
};
```

### 4. Update Module Metadata API
File: `packages/thinksuit-console/src/routes/api/module/metadata/+server.js`

Add presets to response:
```javascript
plans: module.plans || {},
presets: module.presets || {}  // NEW
```

### 5. Update Settings API
File: `packages/thinksuit-console/src/routes/api/console/settings/+server.js`

Changes:
- Structure settings by module key
- Support both `customPlans` and `customPresets` per module
- Provide module-aware get/set operations

## Frontend Changes

### SessionControls.svelte

#### Data Loading
```javascript
// Load module metadata
const metadata = await fetch('/api/module/metadata').json();
const modulePlans = metadata.plans;
const modulePresets = metadata.presets;

// Load settings for current module
const settings = await fetch('/api/console/settings').json();
const currentModule = metadata.module; // e.g., 'thinksuit/mu'
const customPlans = settings[currentModule]?.customPlans || {};
const customPresets = settings[currentModule]?.customPresets || [];

// All presets for UI
const allPresets = [
  ...Object.values(modulePresets).map(p => ({ ...p, source: 'module' })),
  ...customPresets.map(p => ({ ...p, source: 'custom' }))
];
```

#### Plan Resolution
```javascript
function resolvePlan(preset) {
  // Try module plans first, then custom plans
  return modulePlans[preset.plan] || customPlans[preset.plan];
}
```

#### UI Changes - Two Save Flows

**Flow 1: Save Preset (simplified)**

When user clicks "Save Preset":
1. Show dialog with:
   - Preset name input
   - Preset description input
   - Plan selection dropdown (shows all available plans: module + custom)
2. Save preset referencing selected plan key
3. No plan ID generation needed if using existing plan

**Flow 2: Save Custom Plan (NEW)**

When user modifies plan JSON and wants to save it:
1. Show dialog with:
   - Plan will be auto-named (e.g., `plan-20250107-abc123`)
   - Optional: Let user see/edit the plan name
2. Save to `customPlans`
3. Plan becomes available in preset creation dropdown

**UI Structure:**
```
┌─────────────────────────────┐
│ Preset Buttons (grid)       │
├─────────────────────────────┤
│ Plan Builder (JSON editor)  │
│                             │
│ [Generate Plan] [Save Plan] │ ← NEW: separate "Save Plan" button
└─────────────────────────────┘

Preset Button Actions:
- Click: Select/load preset
- Hover: Show × to delete (custom only)

Bottom Actions:
- [Generate Plan]: LLM generates plan
- [Save Plan]: Saves current JSON as custom plan
- [Save Preset]: Creates preset referencing a plan (opens dialog)
```

#### Saving Logic

**Save Plan:**
```javascript
async function savePlan() {
  const plan = JSON.parse(selectedPlan);
  const planId = `plan-${Date.now()}-${randomId()}`;

  // Add to custom plans
  customPlans[planId] = {
    ...plan,
    name: planId  // or let user provide name
  };

  // Save to settings
  await saveSettings();

  return planId;
}
```

**Save Preset:**
```javascript
async function savePreset() {
  // Show dialog with:
  // - Name input
  // - Description input
  // - Plan dropdown (module plans + custom plans)

  const preset = {
    id: `preset-${Date.now()}-${randomId()}`,
    name: presetName,
    description: presetDescription,
    plan: selectedPlanKey  // Key to plans, not full object
  };

  customPresets.push(preset);
  await saveSettings();
}
```

## Migration Path

1. Backend first (module changes)
2. API updates
3. Frontend changes
4. Existing `customPresets` in settings.json will need migration:
   - Extract plan from each preset
   - Save to `customPlans` with generated ID
   - Update preset to reference plan ID

## Benefits

1. **Separation of concerns**: Plans are technical, presets are user-facing
2. **Reusability**: Multiple presets can reference same plan
3. **Module-scoped**: Custom data tied to specific modules
4. **Extensible**: Future preset properties (tool overrides, cwd, model) fit naturally
5. **Clear UX**: Separate "Save Plan" and "Save Preset" actions
