# ThinkSuit Modules

Modules that define the behavior executed by the ThinkSuit orchestration engine.

## Overview

ThinkSuit modules provide the cognitive capabilities that the orchestration engine executes. Each module defines:

- **Cognitive Roles**: Specialized thinking modes for different types of reasoning
- **Prompts**: system, primary, adaptation, and length prompts for each role
- **`composeInstructions`**: builds the instruction thread for a plan node
- **Plan library** + **`defaultPlan`**: the plans the module ships and the one used by default
- **Optional**: modalities, built-in frames, tool dependencies, result formatting

## Core Module (mu)

The default module shipped with ThinkSuit provides 7 roles that enable intentional selection of cognitive instruments for software engineering workflows.

### Roles

The mu module implements 7 roles, each representing a distinct mode of engagement:

- **chat** (temperature: 0.7, default) - Engages in natural conversation. Responds to greetings, questions, and casual interaction.
- **capture** (temperature: 0.3) - Records information without interpretation. Preserves exact content, structure, and intent.
- **readback** (temperature: 0.3) - Retrieves and restates information. Mirrors syntax and structure without analysis.
- **analyze** (temperature: 0.5) - Parses, reasons about, and validates structure. Identifies patterns and inconsistencies.
- **investigate** (temperature: 0.4) - Gathers context through available tools. Queries, reads, and searches as needed.
- **synthesize** (temperature: 0.6) - Combines prior artifacts into coherent output. Integrates findings and resolves conflicts.
- **execute** (temperature: 0.4) - Performs work by calling available tools. Chains operations and handles errors.

### Plans

Roles are engaged by **plans**, not by keyword routing. A plan is an authored node tree
(`task`/`sequence`/`parallel`); each `task` node names the `role` to run. The mu module ships a
plan library and names one as its default:

- `defaultPlan: 'chat'` — used when the caller doesn't select a plan
- Shipped plans include `chat`, `analyze`, `investigate`, `synthesize`, `execute`, `capture`,
  `readback`, and `deep-analysis` (a `sequence` of investigate → analyze → synthesize)

Callers pick a plan explicitly (e.g. `--plan investigate`, or `selectedPlan` programmatically);
otherwise the module's `defaultPlan` runs. See the engine README for the plan.v1 node shape and
the plan library on disk (`~/.thinksuit/plans/` + module-shipped `plans/`).

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

To create custom ThinkSuit modules with your own cognitive roles, prompts, and plan library, see the **[Module Authoring Guide](../../thinksuit/docs/module-authoring.md)** in the engine documentation.

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
2. Document all roles and prompts clearly
3. Include tests for `composeInstructions` and any shipped plans
4. Follow the existing module structure
5. Update this README if adding new capabilities

## License

Apache 2.0
