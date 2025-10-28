# Module Authoring Guide

This guide explains how to create custom ThinkSuit modules that define cognitive behaviors for the orchestration engine.

## Overview

ThinkSuit modules provide the cognitive capabilities that the orchestration engine executes. Each module defines:

- **Cognitive Roles**: Specialized thinking modes for different types of reasoning
- **Signal Classifiers**: Detection logic for conversation patterns
- **Rules**: Forward-chaining rules that map signals to execution plans
- **Prompts**: System and primary prompts for each cognitive role
- **Configuration**: Temperature settings, token limits, and tool integrations

## Module Structure

```javascript
export default {
    // ─── Required Properties ───────────────────────────────────────────────
    namespace: 'thinksuit',        // Module namespace (required)
    name: 'mu',                    // Module name (required)
    version: '0.2.0',              // Semantic version (required)

    // ─── Core Components ───────────────────────────────────────────────────

    // Cognitive roles with configuration
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
        },
        // ... more roles
    ],

    // Signal detection classifiers
    classifiers: {
        intent: async (thread) => { /* returns intent signals */ },
        // ... more classifiers
    },

    // Forward-chaining rules that emit ExecutionPlan facts
    rules: [
        {
            name: 'rule-name',
            conditions: { /* rule conditions */ },
            action: (facts, engine) => {
                engine.addFact(createFact.executionPlan('direct', {
                    name: 'plan-name',
                    role: 'analyze'
                }));
            }
        }
    ],

    // Instruction composition function
    composeInstructions: async function({ plan, factMap }, module) {
        // Returns { system, primary, adaptations, lengthGuidance, toolInstructions, maxTokens }
    },

    // ─── Prompts (Convention-Based Naming) ─────────────────────────────────
    // All prompts MUST follow these naming conventions:
    // - system.*     : System prompts for roles
    // - primary.*    : Primary instruction prompts for roles
    // - adapt.*      : Behavioral modifications (plan-specified or dynamically included)
    // - length.*     : Response length guidance prompts

    prompts: {
        // Role system prompts
        'system.analyze': 'You parse, reason about, and validate structure...',
        'system.investigate': 'You gather context through available tools...',

        // Role primary prompts
        'primary.analyze': 'Parse the input and identify patterns...',
        'primary.investigate': 'Use available tools to gather context...',

        // Adaptation prompts (all adaptations)
        'adapt.tools-available': 'Use tools to verify...',
        'adapt.task-execution': 'Prefer small loops...',
        'adapt.high-certainty': 'Qualify strong confidence...',
        'adapt.explore': 'Prioritize breadth...',

        // Length guidance
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

    // Tool dependencies (validated at startup)
    toolDependencies: [
        { name: 'read_file', description: 'Read file contents' },
        { name: 'write_file', description: 'Create or overwrite files' }
    ],

    // Orchestration helpers
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

Prompt fragments that modify role behavior. Adaptations can be:
- **Explicitly specified in execution plans** - Rules emit plans with `plan.adaptations` array
- **Dynamically included by composeInstructions** - Based on detected signals/facts
- **Composable** - Multiple adaptations apply together to fine-tune behavior

Use this for responses to detected patterns (e.g., `adapt.high-certainty`), adjustments to available capabilities (e.g., `adapt.tools-available`), or module-specific behavioral tweaks.

**Example**: `adapt.source-cited` - "Since sources are cited, verify claims against the cited sources and note any discrepancies."

### `length.*` - Response Length Guidance
Controls the expected response length/detail level. Standard levels are `brief`, `standard`, and `comprehensive`, but modules can define additional levels.

**Example**: `length.brief` - "Respond in 1-2 sentences, commit-message length."

---

**Validation**: The engine validates these conventions at module load time and will warn about non-standard prompt names.

## Example: Simple Custom Module

```javascript
import { createFact } from './facts.js';

// Define prompts first (with required naming conventions)
const prompts = {
    // System prompts define role identity
    'system.responder': 'You are a helpful, concise assistant.',

    // Primary prompts define task execution
    'primary.responder': 'Respond helpfully to the user input.',

    // Adaptation prompts for contextual adjustments
    'adapt.tools-available': 'Use available tools when helpful.',
    'adapt.brief': 'Keep response concise and focused.',

    // Length guidance
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

    // Signal classifiers (optional - can return empty results)
    classifiers: {
        intent: async (thread) => {
            // Simple classifier that doesn't detect signals
            return [];
        }
    },

    // Rules that emit ExecutionPlan facts
    rules: [
        {
            name: 'default-responder',
            conditions: {
                test: (facts) => !facts.some(f => f.type === 'ExecutionPlan')
            },
            action: (facts, engine) => {
                engine.addFact(createFact.executionPlan('direct', {
                    name: 'simple-response',
                    role: 'responder'
                }));
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

    // Instruction composition function (required)
    composeInstructions: async function({ plan, factMap }, module) {
        // Get role configuration
        const role = module.roles.find(r => r.name === plan.role) || module.roles[0];

        // Build instructions by resolving prompt keys from module.prompts
        return {
            system: module.prompts[role.prompts.system],
            primary: module.prompts[role.prompts.primary],
            adaptations: '',  // Can add adaptation logic here
            lengthGuidance: module.lengthGuidance.standard,
            toolInstructions: '',
            maxTokens: role.baseTokens,
            metadata: {
                role: role.name,
                baseTokens: role.baseTokens,
                lengthLevel: 'standard',
                adaptations: []
            }
        };
    }
}
```

## Key Module Design Guidelines

### 1. Prompt Naming is Enforced
- All prompts MUST use standard prefixes: `system.*`, `primary.*`, `adapt.*`, `length.*`
- The engine validates these conventions and warns about non-standard names
- This enables reflection and automatic discovery of adaptations

### 2. Rules Emit ExecutionPlan Facts Only
- Rules should emit `ExecutionPlan` facts, not `RoleSelection` or `TokenMultiplier`
- The plan should include the role, strategy, and any configuration
- Example: `createFact.executionPlan('direct', { name: 'plan-name', role: 'assistant' })`

### 3. composeInstructions is Required
- Must accept `{ plan, factMap }` and module as parameters
- Must return structured instructions with system, primary, adaptations, etc.
- See the mu module's implementation for a complete example

### 4. Roles Reference Prompt Keys, Not Text
- Role configuration stores prompt *keys*, not the actual text
- Example: `prompts: { system: 'system.responder', primary: 'primary.responder' }`
- `composeInstructions` resolves keys to actual text via `module.prompts[key]`
- This ensures single source of truth and eliminates duplication

### 5. Optional Components
- `classifiers` - Optional, can be minimal or omitted
- `toolDependencies` - Optional, declares required MCP tools
- `orchestration` - Optional, custom result formatting

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
- 6 roles enabling intentional selection of cognitive instruments (capture, readback, analyze, investigate, synthesize, execute)
- Simple intent classification with keyword pattern matching
- Intent-based routing rules (6 rules mapping intents to roles)
- Plan-driven composeInstructions implementation
- Two-mode operation (explicit plans and signal-driven routing)
- MCP tool integration

## Contributing

When contributing modules or modifications:

1. Maintain backward compatibility when possible
2. Document all roles, signals, and rules clearly
3. Include tests for classifiers and rules
4. Follow the existing module structure
5. Ensure prompt naming conventions are followed
