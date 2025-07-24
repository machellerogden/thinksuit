# Interface Evolution

This document captures the intended evolution of ThinkSuit's user-facing interfaces and how module loading concerns are handled at different layers.

## Current State

### Built-in CLI (`packages/thinksuit/engine/cli.js`)
- **Purpose**: One-shot testing tool for core engine development
- **Module Support**: Uses default `thinksuit/mu` module only
- **Usage**: `npm run cli "your input here"`
- **Intended Audience**: ThinkSuit engine developers

### Custom CLI Wrappers
For custom modules, users create thin wrapper CLIs that handle module loading:

```javascript
#!/usr/bin/env node
import { schedule } from 'thinksuit';
import { modules } from 'my-custom-modules';

async function main() {
    const input = process.argv.slice(2).join(' ');

    const { sessionId, execution } = await schedule({
        input,
        module: 'my/custom',
        modules,  // Pass pre-loaded modules object
        provider: 'openai',
        model: 'gpt-4o-mini',
        providerConfig: {
            openai: { apiKey: process.env.OPENAI_API_KEY }
        }
    });

    const result = await execution;
    console.log(result.response);
}

await main();
```

**Example**: `agent-cli` in the Gateless engineering project uses this pattern.

## Future State

### Rich Terminal REPL (`packages/thinksuit-repl`)
A full-featured interactive terminal experience (similar to Claude Code or Gemini's terminal interface) that will:

- Provide session continuity and conversation history
- Support module selection without requiring code
- Handle module loading at the interface/config layer
- Enable runtime module switching (e.g., `/use agent/engineering`)
- Maintain module registry or config-based module mapping

### Module Loading Separation of Concerns

The architecture maintains clean separation:

**Engine Layer** (`schedule()` API):
- Receives modules as pre-loaded objects
- No knowledge of how modules were discovered/loaded
- Pure execution concern

**Interface Layer** (REPL, web UI, custom CLIs):
- Handles module discovery and loading
- Manages configuration mapping module identifiers to packages
- Provides user-facing module selection mechanisms
- Passes loaded modules to engine

This pattern ensures:
- The engine stays focused on execution
- Module loading intelligence lives where user configuration happens
- Different interfaces can implement module loading differently based on their needs
- The one-shot CLI remains minimal for testing purposes

## Design Philosophy

The built-in one-shot CLI is intentionally minimal - it's a development tool, not the primary user interface. Rich interactive experiences will be built as separate packages that handle their own module loading concerns at the appropriate layer.

This follows the principle: **Interface concerns belong in interface packages, not in the engine.**
