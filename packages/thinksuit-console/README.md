# ThinkSuit Console

A web-based development and debugging interface for the ThinkSuit AI orchestration system.

## Overview

ThinkSuit Console provides visual tools for inspecting and debugging ThinkSuit execution sessions, including:
- Session timeline visualization
- Trace data inspection
- Raw JSONL data viewing
- Real-time session monitoring

## Prerequisites

ThinkSuit Console requires the ThinkSuit TTY service to be running.

## Development

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

The development server runs on http://localhost:5173 (or next available port).

## Running as a Background Service

To run the console as a persistent LaunchAgent service, see the **[Service Management Guide](../../docs/SERVICE_MANAGEMENT.md)**.

## Architecture

### Tech Stack
- **SvelteKit** - Web application framework
- **Svelte 5** - Component framework with runes
- **Tailwind CSS v4** - Utility-first CSS
- **Custom Hash Router** - Client-side routing

### Component Library

The UI uses a standardized component library (`src/lib/components/ui/`) for consistency:

- **Badge** - Status indicators and labels
- **Button** - Interactive buttons with variants
- **Card** - Content containers
- **CodeBlock** - JSON/code display
- **EmptyState** - Loading/error/empty states
- **Sidebar** - Collapsible navigation
- **Tabs** - Tab navigation

See [docs/UI_COMPONENTS.md](docs/UI_COMPONENTS.md) for detailed component documentation.

### Project Structure

```
thinksuit-console/
├── src/
│   ├── routes/              # SvelteKit routes
│   │   ├── +layout.svelte   # Root layout
│   │   ├── +page.svelte     # Home page
│   │   └── api/             # Server endpoints
│   │       └── sessions/    # Session data APIs
│   └── lib/
│       ├── components/
│       │   ├── ui/          # Reusable UI components
│       │   ├── HashRouter.svelte
│       │   ├── Navigation.svelte
│       │   ├── SessionInspector.svelte
│       │   └── ...
│       └── routes.js        # Route definitions
├── docs/
│   └── UI_COMPONENTS.md    # Component documentation
└── static/                  # Static assets
```

## Features

### Session Inspector
- Lists all sessions from `~/.thinksuit/sessions/`
- Three view modes:
  - **Timeline**: Visual conversation flow
  - **Raw**: JSONL data view
  - **Trace**: Detailed execution traces
- URL-based routing for deep linking
- Collapsible sidebar with search

### Data Visualization
- Color-coded data types (Signals, Roles, Plans, etc.)
- Expandable detail views
- Two-column trace inspection
- Conversation thread visualization

## Development

### Adding New Components

1. Create component in `src/lib/components/ui/`
2. Follow existing prop patterns
3. Export from `ui/index.js`
4. Document in `docs/UI_COMPONENTS.md`

### API Endpoints

- `GET /api/sessions` - List all sessions
- `GET /api/sessions/[id]` - Get session data
- `GET /api/sessions/trace/[id]` - Get trace data

## Related Documentation

- [CLAUDE.md](CLAUDE.md) - Detailed project guidance
- [UI_COMPONENTS.md](docs/UI_COMPONENTS.md) - Component library docs
- [Parent Project](../README.md) - ThinkSuit core system

## License

Apache 2.0
