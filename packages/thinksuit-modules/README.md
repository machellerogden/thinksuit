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

The default module shipped with ThinkSuit provides 7 roles that enable intentional selection of cognitive instruments for software engineering workflows.

### Roles

The mu module implements 7 roles, each representing a distinct mode of engagement:

- **chat** (temperature: 0.7, default) - Engages in natural conversation. Responds to greetings, questions, and casual interaction.
- **capture** (temperature: 0.3) - Records information without interpretation. Preserves exact content, structure, and intent.
- **readback** (temperature: 0.3) - Retrieves and restates information. Mirrors syntax and structure without analysis.
- **analyze** (temperature: 0.5) - Parses, reasons about, and validates structure. Identifies patterns and inconsistencies.
- **investigate** (temperature: 0.6) - Gathers context through available tools. Queries, reads, and searches as needed.
- **synthesize** (temperature: 0.8) - Combines prior artifacts into coherent output. Integrates findings and resolves conflicts.
- **execute** (temperature: 0.1) - Performs work by calling available tools. Chains operations and handles errors.

### Two-Mode Operation

The mu module supports two ways to select roles:

**1. Explicit Mode** - Directly specify which role to engage by sending an ExecutionPlan:
```javascript
{
    strategy: 'direct',
    role: 'investigate',
    tools: ['read_text_file', 'read_media_file', 'read_multiple_files', 'search'],
    lengthLevel: 'standard'
}
```

**2. Signal-Driven Mode** - Use natural language keywords that route to the appropriate role:

| Keywords | Role |
| -------- | ---------- |
| (no keywords - casual conversation, greetings) | `chat` |
| save, record, remember, note, store, capture, keep | `capture` |
| readback, repeat, show me, retrieve, recall, what did, display | `readback` |
| why, how does, explain, break down, examine, understand | `analyze` |
| find, search, look for, locate, where is, show, list | `investigate` |
| combine, integrate, summarize, summary, merge, consolidate, overall | `synthesize` |
| create, build, fix, implement, make, change, update, add, write | `execute` |

Signal-driven mode provides convenience for interactive use, while explicit mode gives full control for programmatic workflows.

### Tool Integration

The mu module includes MCP (Model Context Protocol) tool support:

- File system operations (read, write, edit, search)
- Directory navigation and tree visualization
- Custom tools via MCP servers

See [TOOLS.md](TOOLS.md) for detailed tool documentation.

## Module Internals

The mu module uses convention-based prompt naming for reflection and validation. All prompts use one of these prefixes:
- `system.*` - Role identity prompts
- `primary.*` - Role instruction prompts
- `adapt.*` - Behavioral modification prompts
- `length.*` - Response length guidance

For a complete reference implementation, see the mu module source code in this package.

## Creating Your Own Modules

To create custom ThinkSuit modules with your own cognitive roles, signals, and rules, see the **[Module Authoring Guide](../../thinksuit/docs/module-authoring.md)** in the engine documentation.

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
