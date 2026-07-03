# Module Authoring Guide

This guide explains how to create custom ThinkSuit modules that define cognitive behaviors for the orchestration engine.

## Overview

ThinkSuit modules provide the cognitive capabilities that the orchestration engine executes. Each module defines:

- **Cognitive Roles**: specialized thinking modes (with temperature/token settings)
- **Prompts**: system, primary, adaptation, and length prompts for those roles
- **`composeInstructions`**: builds the instruction thread the agent loop runs for a plan node
- **Plan library** + **`defaultPlan`**: the plans the module ships and the one used when none is selected
- **Optional**: `modalities` (per-channel instruction text), built-in frames, `toolDependencies`, `orchestration`

Modules do **not** define control flow. There is no signal detection, no rules engine, and no
facts. What runs is an authored plan (a `task`/`sequence`/`parallel` node tree); the module only
shapes how each `task` node is instructed.

## Module Structure

```javascript
export default {
    // ─── Required Properties ───────────────────────────────────────────────
    namespace: 'thinksuit',        // Module namespace (required)
    name: 'mu',                    // Module name (required)
    version: '0.2.0',              // Semantic version (required)

    // Named reference into the plan library, used when no plan is explicitly selected.
    defaultPlan: 'chat',

    // ─── Cognitive roles with configuration ────────────────────────────────
    roles: [
        {
            name: 'analyze',
            isDefault: true,
            temperature: 0.5,
            baseTokens: 800,
            prompts: {
                system: 'system.analyze',
                primary: 'primary.analyze'
            }
        }
        // ... more roles
    ],

    // ─── Instruction composition ───────────────────────────────────────────
    // Called by the composer per task node. Receives the node as `plan`.
    // Signature: ({ plan, thread, input, frame, modality, cwd, workdir }, module)
    // Returns a composed instruction `thread` (+ maxTokens, metadata, etc.).
    composeInstructions: async function({ plan, thread, input }, module) {
        // ...
    },

    // ─── Prompts (Convention-Based Naming) ─────────────────────────────────
    // All prompts MUST follow these naming conventions:
    // - system.*  : System prompts for roles
    // - primary.* : Primary instruction prompts for roles
    // - adapt.*   : Behavioral modifications (named in a plan's params.adaptations)
    // - length.*  : Response length guidance prompts
    prompts: {
        'system.analyze': 'You parse, reason about, and validate structure...',
        'primary.analyze': 'Parse the input and identify patterns...',
        'adapt.tools-available': 'Use tools to verify...',
        'length.brief': 'Commit-message length...',
        'length.standard': 'Review-note length...',
        'length.comprehensive': 'ADR length...'
    },

    // Length guidance (derived from prompts)
    lengthGuidance: {
        brief: prompts['length.brief'],
        standard: prompts['length.standard'],
        comprehensive: prompts['length.comprehensive']
    },

    // ─── Optional Components ───────────────────────────────────────────────

    // Locates this module's on-disk artifacts. The engine's artifact store reads
    // `<dir>/plans/*.json` (+ optional `<dir>/plans.json` for ordering) and
    // `<dir>/frames/*.md`, so module and user spaces share one reader.
    dir: import.meta.dirname,

    // Per-modality instruction text, keyed by modality name. A caller asserts a
    // modality (e.g. the voice daemon asserts 'voice'); the engine composes the
    // matching text into the prelude.
    modalities: {
        voice: 'This is a spoken conversation. Speak, do not format...',
        text: 'This is a written conversation. Markdown is welcome...'
    },

    // Tool dependencies (validated at startup against discovered MCP tools)
    toolDependencies: [
        { name: 'read_text_file', description: 'Read text file contents' },
        { name: 'write_file', description: 'Create or overwrite files' }
    ],

    // Orchestration helpers (e.g. how parallel branch results are formatted)
    orchestration: {
        formatResponse: (results) => { /* custom formatting */ }
    },

    // Metadata
    description: 'Module description',
    author: 'Author Name',
    license: 'MIT'
}
```

## Prompt Naming Conventions

ThinkSuit enforces standardized prompt naming to enable reflection and proper usage. All prompt keys must use one of these prefixes:

### `system.*` - Role Identity
Defines the foundational identity and behavioral stance of a cognitive role. This sets the "who" - the personality, expertise domain, and core approach the role embodies.

**Example**: `system.analyze` - "You parse, reason about, and validate structure. Identify patterns, dependencies, and inconsistencies."

### `primary.*` - Role Instructions
Defines the primary task instructions for a role - what the role should do with user input. This sets the "what" - the core cognitive operation to perform.

**Example**: `primary.analyze` - "Parse the input structure and identify patterns. Separate facts from assumptions and make implicit logic explicit."

### `adapt.*` - Behavioral Modifications

Prompt fragments that modify role behavior. A plan node names the adaptations it wants in its
`params.adaptations` array (e.g. `["tools-available", "task-execution"]`); `composeInstructions`
resolves those keys and composes the fragments into the instructions. Multiple adaptations apply
together.

**Example**: `adapt.source-cited` - "Since sources are cited, verify claims against the cited sources and note any discrepancies."

### `length.*` - Response Length Guidance
Controls the expected response length/detail level. Standard levels are `brief`, `standard`, and `comprehensive`, but modules can define additional levels. A plan node selects one via `params.lengthLevel`.

**Example**: `length.brief` - "Respond in 1-2 sentences, commit-message length."

---

**Validation**: The engine validates these conventions at module load time and will warn about non-standard prompt names.

## Example: Simple Custom Module

```javascript
// Define prompts first (with required naming conventions)
const prompts = {
    'system.responder': 'You are a helpful, concise assistant.',
    'primary.responder': 'Respond helpfully to the user input.',
    'adapt.tools-available': 'Use available tools when helpful.',
    'length.brief': 'One paragraph maximum.',
    'length.standard': '2-3 paragraphs with clear structure.',
    'length.comprehensive': 'Detailed response with sections.'
};

export default {
    // Required metadata
    namespace: 'custom',
    name: 'simple',
    version: '1.0.0',
    description: 'A simple example module',

    // The plan used when the caller doesn't select one (resolved from the plan library)
    defaultPlan: 'respond',

    // Role configuration
    roles: [
        {
            name: 'responder',
            isDefault: true,
            temperature: 0.7,
            baseTokens: 500,
            prompts: {
                system: 'system.responder',
                primary: 'primary.responder'
            }
        }
    ],

    // Prompts (required - following naming conventions)
    prompts,

    // Length guidance (derived from prompts)
    lengthGuidance: {
        brief: prompts['length.brief'],
        standard: prompts['length.standard'],
        comprehensive: prompts['length.comprehensive']
    },

    // Locates <dir>/plans/*.json so `defaultPlan: 'respond'` resolves
    dir: import.meta.dirname,

    // Instruction composition (required). The engine runs the returned `thread`;
    // see the mu module for the full return shape (indices, adaptations, etc.).
    composeInstructions: async function({ plan, thread = [], input }, module) {
        const role = module.roles.find(r => r.name === plan.role) || module.roles[0];
        const composed = [
            { role: 'system', content: module.prompts[role.prompts.system] },
            ...thread,
            { role: 'system', content: module.prompts[role.prompts.primary] },
            { role: 'user', content: input }
        ];
        return {
            thread: composed,
            maxTokens: plan.params?.maxTokens ?? role.baseTokens,
            metadata: { role: role.name, baseTokens: role.baseTokens, lengthLevel: 'standard', adaptations: [] }
        };
    }
}
```

Ship at least one plan so `defaultPlan` resolves — e.g. `<dir>/plans/respond.json`:

```json
{ "name": "Respond", "description": "Direct response", "type": "task", "role": "responder", "maxRounds": 1, "params": { "lengthLevel": "brief" } }
```

## Key Module Design Guidelines

### 1. Prompt Naming is Enforced
- All prompts MUST use standard prefixes: `system.*`, `primary.*`, `adapt.*`, `length.*`
- The engine validates these conventions and warns about non-standard names
- This enables reflection and automatic discovery of adaptations

### 2. Behavior lives in prompts + plans, not control flow
- Roles carry the prompts; plans (the node tree) carry the structure and knobs
  (`params.adaptations`, `params.lengthLevel`, `params.maxTokens`, `tools`, `maxRounds`)
- A module ships a plan library and names one as `defaultPlan`

### 3. composeInstructions is Required
- Signature `({ plan, thread, input, frame, modality, cwd, workdir }, module)`; `plan` is the task node
- Must return a composed instruction `thread` (the engine's agent loop runs it), plus `maxTokens`/`metadata`
- See the mu module's implementation for the complete return shape

### 4. Roles Reference Prompt Keys, Not Text
- Role configuration stores prompt *keys*, not the actual text
- Example: `prompts: { system: 'system.responder', primary: 'primary.responder' }`
- `composeInstructions` resolves keys to actual text via `module.prompts[key]`
- This ensures single source of truth and eliminates duplication

### 5. Optional Components
- `modalities` - per-channel instruction text (voice/text/…)
- `dir` + a `plans/` directory - the module's plan library (required if `defaultPlan` names a file)
- `toolDependencies` - declares required MCP tools (validated at startup)
- `orchestration` - custom result formatting (e.g. for parallel branches)

## Using Custom Modules

### Via CLI

```bash
# Use default mu module
npm run exec -- "Your input"

# Use a specific module
npm run exec -- --module custom/simple.v1 "Your input"

# Use a module from a different package
npm run exec -- --modulesPackage my-modules --module my/module.v1 "Your input"
```

### Programmatically

```javascript
import { schedule } from 'thinksuit';

const result = await schedule({
    input: 'Your input',
    module: 'custom/simple.v1',
    apiKey: process.env.OPENAI_API_KEY
});
```

## Module Discovery

Modules are discovered from npm packages. The default package is `thinksuit-modules`, but you can specify a different package:

- Via CLI: `--modulesPackage your-package`
- Via config: `{ "modulesPackage": "your-package" }`
- Via environment: `THINKSUIT_MODULES_PACKAGE=your-package`

The module name follows the pattern: `namespace/name.version`

## Testing Modules

When developing modules, include comprehensive tests:

```bash
# Run module tests
npm test

# Run with coverage
npm run test:coverage

# Test specific module
npm test my-module
```

## Reference Implementation

See the `mu` module in the `thinksuit-modules` package for a complete, production-ready reference implementation with:
- 7 roles enabling intentional selection of cognitive instruments (chat, capture, readback, analyze, investigate, synthesize, execute)
- A plan library (chat, analyze, investigate, synthesize, execute, capture, readback, deep-analysis) with `defaultPlan: 'chat'`
- Plan-driven `composeInstructions` (roles, adaptations, length levels, modalities/frames)
- MCP tool integration

## Contributing

When contributing modules or modifications:

1. Maintain backward compatibility when possible
2. Document all roles and prompts clearly
3. Include tests for `composeInstructions` and any shipped plans
4. Follow the existing module structure
5. Ensure prompt naming conventions are followed
