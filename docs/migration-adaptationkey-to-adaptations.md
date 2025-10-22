# Migration Plan: adaptationKey → adaptations

## Overview

Migrate from single `adaptationKey` (string) to `adaptations` (array) to support multiple prompt adaptations per plan or step.

**Status**: Not started
**Breaking Change**: Yes
**Backward Compatibility**: None - clean break migration

---

## Changes Required

### 1. Schema Updates

**File**: `packages/thinksuit/schemas/plan.v1.json`

- Change top-level `adaptationKey` property from `string` to `array`
- Change `adaptationKey` in sequence items from `string` to `array`
- Change `adaptationKey` in parallel roles from `string` to `array`

```json
// Before
"adaptationKey": {
    "type": "string",
    "description": "Context-based prompt adaptation to apply"
}

// After
"adaptations": {
    "type": "array",
    "items": {
        "type": "string"
    },
    "description": "Context-based prompt adaptations to apply (in order)"
}
```

### 2. Core Engine Changes

**File**: `packages/thinksuit/engine/handlers/composeInstructions.js`

- Update to handle `adaptations` array instead of single `adaptationKey`
- Apply adaptations in order (first to last)
- Update validation logic
- Update logging to show `adaptations` instead of `adaptationKey`

**Files to Check**:
- Any handler that constructs plans with `adaptationKey`
- Any handler that passes through plan properties
- `packages/thinksuit/engine/handlers/execSequential.js`
- `packages/thinksuit/engine/handlers/execParallel.js`
- `packages/thinksuit/engine/handlers/execTask.js`

### 3. Module Changes

**File**: `packages/thinksuit-modules/mu/rules.js`

Search for any rules that generate plans with `adaptationKey` and convert to `adaptations: [...]`

Common patterns to find:
```javascript
// Before
{ role: 'reflector', adaptationKey: 'outer_voice_opening' }

// After
{ role: 'reflector', adaptations: ['outer_voice_opening'] }
```

**File**: `packages/thinksuit-modules/mu/index.js`

- Check if module composeInstructions references `adaptationKey`
- Update to use `adaptations` array

### 4. Test Updates

**Files to Update**:
- `packages/thinksuit/tests/integration/iteration-contracts.test.js`
- `packages/thinksuit/tests/integration/inner-outer-debate-handlers.test.js`
- `packages/thinksuit/tests/handlers/composeInstructions.test.js`
- Any other tests that assert on `adaptationKey` or `selectedPlan.adaptationKey`

Pattern to find and replace:
```javascript
// Before
expect(step1Input.selectedPlan.adaptationKey).toBe('outer_voice_opening');

// After
expect(step1Input.selectedPlan.adaptations).toEqual(['outer_voice_opening']);
```

### 5. Console UI Changes

**File**: `packages/thinksuit-console/src/lib/components/PlanBuilder.svelte`

- Change `adaptationKey` state variable to `adaptations` (array)
- Replace single dropdown with multi-select or tag input
- Update for direct/task strategies (top-level)
- Update for sequential strategy (per step)
- Update for parallel strategy (per role)

**UI Approach Options**:
1. Multi-select dropdown (Ctrl/Cmd + click to select multiple)
2. Tag-based input (click to add, X to remove)
3. Checkboxes with "Add Adaptation" button

**Recommended**: Tag-based input for better UX

**File**: `packages/thinksuit-console/src/routes/api/module/metadata/+server.js`

- No changes needed (already returns adaptations array)

### 6. Validation Updates

**File**: `packages/thinksuit/schemas/validate.js`

- Test that `validatePlan()` properly validates `adaptations` as array
- Ensure validation fails if `adaptations` contains non-string values

---

## Implementation Order

1. **Schema** - Update plan.v1.json first (foundation)
2. **Core Engine** - Update composeInstructions and related handlers
3. **Module Rules** - Update mu module rules that generate plans
4. **Tests** - Update all test assertions
5. **Console UI** - Update PlanBuilder last (depends on schema/engine)

---

## Testing Strategy

### Unit Tests
- Validate schema accepts `adaptations` array
- Test composeInstructions with 0, 1, and multiple adaptations
- Test that adaptations are applied in order

### Integration Tests
- Run existing integration tests after updates
- Verify inner-outer debate still works with adaptations array
- Verify iteration contracts with multiple adaptations

### Manual Testing
- Build plan with multiple adaptations in console
- Verify JSON output contains `adaptations: [...]`
- Execute plan and verify adaptations are applied

---

## Search Patterns

Use these patterns to find all occurrences:

```bash
# Find adaptationKey in code
rg "adaptationKey" packages/thinksuit packages/thinksuit-modules packages/thinksuit-console

# Find in test files specifically
rg "adaptationKey" packages/thinksuit/tests

# Find in schema
rg "adaptationKey" packages/thinksuit/schemas
```

---

## Rollback Plan

If issues arise:
1. Revert schema changes
2. Revert core engine changes
3. Restore original test assertions
4. Keep UI changes in a branch for future retry

---

## Success Criteria

- [ ] Schema validates plans with `adaptations` array
- [ ] All existing tests pass with updated assertions
- [ ] Console PlanBuilder supports multiple adaptations
- [ ] Plans execute correctly with 0, 1, or multiple adaptations
- [ ] Adaptations are applied in the specified order
- [ ] No references to `adaptationKey` remain in codebase
