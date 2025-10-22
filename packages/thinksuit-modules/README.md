# ThinkSuit Modules

Modules that define the behavior executed by the ThinkSuit orchestration engine.

## Overview

ThinkSuit modules provide the cognitive capabilities that the orchestration engine executes. Each module defines:

- **Cognitive Roles**: Specialized thinking modes for different types of reasoning
- **Signal Classifiers**: Detection logic for conversation patterns
- **Rules**: Forward-chaining rules that map signals to execution plans
- **Prompts**: System and primary prompts for each cognitive role
- **Configuration**: Temperature settings, token limits, and tool integrations

## Core Module (mu)

The default module shipped with ThinkSuit provides a comprehensive cognitive system.

### Cognitive Roles

The mu module implements 9 cognitive roles:

- **assistant**: General thinking companion for balanced responses
- **analyzer**: Decomposes complexity into understandable components
- **synthesizer**: Combines disparate elements into cohesive wholes
- **critic**: Identifies weaknesses and provides constructive feedback
- **planner**: Transforms goals into actionable sequences
- **reflector**: Examines thinking processes and meta-cognition
- **explorer**: Generates possibilities and creative alternatives
- **optimizer**: Refines solutions for efficiency and elegance
- **integrator**: Maintains system coherence across perspectives

### Signal Detection

Detects 16 distinct signals across 5 dimensions:

| Dimension       | Signals                                            |
| --------------- | -------------------------------------------------- |
| **Claim**       | universal, high-quantifier, forecast, normative    |
| **Support**     | source-cited, tool-result-attached, anecdote, none |
| **Calibration** | high-certainty, hedged                             |
| **Temporal**    | time-specified, no-date                            |
| **Contract**    | ack-only, capture-only, explore, analyze           |

### Tool Integration

The mu module includes MCP (Model Context Protocol) tool support:

- File system operations (read, write, edit, search)
- Directory navigation and tree visualization
- Custom tools via MCP servers

See [TOOLS.md](TOOLS.md) for detailed tool documentation.

## Module Structure

```javascript
export default {
    namespace: 'thinksuit',
    name: 'mu',
    version: '0.1.1',

    // Cognitive roles available
    roles: ['assistant', 'analyzer', ...],

    // Default role for fallback
    defaultRole: 'assistant',

    // Role for planning multi-step execution
    plannerRole: 'assistant',

    // Signal detection classifiers
    classifiers: {
        claim: { /* classifier implementation */ },
        support: { /* classifier implementation */ },
        // ...
    },

    // Forward-chaining rules for role selection
    rules: [
        {
            name: 'rule-name',
            conditions: { /* rule conditions */ },
            action: (facts, engine) => { /* emit facts */ }
        }
    ],

    // Prompts for each role
    prompts: {
        system: { /* role -> system prompt */ },
        primary: { /* role -> primary prompt template */ }
    },

    // Execution configuration
    instructionSchema: {
        temperature: { /* role -> temperature */ },
        tokens: { /* defaults and multipliers */ }
    },

    // MCP server configurations
    mcpServers: {
        filesystem: { /* server config */ }
    },

    // Available tools
    tools: ['read_file', 'write_file', ...]
}
```

## Creating Custom Modules

To create a custom module:

1. **Define your module structure** following the interface above
2. **Implement classifiers** for signal detection (or reuse existing ones)
3. **Write rules** that map signals to execution plans
4. **Provide prompts** for your cognitive roles
5. **Configure execution** parameters (temperature, tokens, etc.)

### Example: Simple Custom Module

```javascript
export default {
    namespace: 'custom',
    name: 'simple',
    version: 'v1',

    roles: ['responder'],
    defaultRole: 'responder',

    // Minimal classifier that always returns empty signals
    classifiers: {
        detectAll: async (thread) => ({
            claim: [],
            support: [],
            calibration: [],
            temporal: [],
            contract: []
        })
    },

    // Simple rule that always uses responder role
    rules: [
        {
            name: 'always-respond',
            conditions: { all: [] }, // Always matches
            action: (facts, engine) => {
                engine.addFact({
                    type: 'ExecutionPlan',
                    strategy: 'direct',
                    role: 'responder',
                    confidence: 1.0
                });
            }
        }
    ],

    prompts: {
        system: {
            responder: 'You are a helpful assistant.'
        },
        primary: {
            responder: 'Please respond to: {{INPUT}}'
        }
    },

    instructionSchema: {
        temperature: { responder: 0.7 },
        tokens: { default: 1000 }
    }
}
```

## Using Modules

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

The module package includes comprehensive tests:

```bash
# Run module tests
npm test

# Run with coverage
npm run test:coverage

# Test specific module
npm test mu
```

## Contributing

When contributing modules or modifications:

1. Maintain backward compatibility when possible
2. Document all roles, signals, and rules clearly
3. Include tests for classifiers and rules
4. Follow the existing module structure
5. Update this README if adding new capabilities

## License

Apache 2.0
