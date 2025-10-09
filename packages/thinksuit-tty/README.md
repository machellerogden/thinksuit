# ThinkSuit TTY

Terminal component and TTY WebSocket server for ThinkSuit.

## Overview

ThinkSuit TTY provides terminal emulation and WebSocket connectivity for the ThinkSuit Console, including:
- Terminal emulator component (xterm.js based)
- WebSocket server for terminal streaming
- PTY (pseudo-terminal) integration
- SSL/TLS support for secure connections

## Quick Start

```bash
# Install dependencies
npm install

# Build the library
npm run build

# Start the TTY service directly
node bin/service.mjs
```

The TTY service runs on port 60662 (configurable via `TTW_PORT` env var).

## Service Management

ThinkSuit TTY includes LaunchAgent integration for automatic startup on macOS.

For complete installation instructions and service management reference, see the **[Service Management Guide](../../docs/SERVICE_MANAGEMENT.md)**.

### Quick Reference

```bash
# Initialize service (reset logs, bootstrap, start, and tail)
thinksuit-tty-service-init

# Other commands
thinksuit-tty-service-load      # Register with launchd
thinksuit-tty-service-unload    # Unregister from launchd
thinksuit-tty-service-start     # Start/restart service
thinksuit-tty-service-stop      # Stop gracefully (SIGTERM)
thinksuit-tty-service-kill      # Force kill (SIGKILL)
thinksuit-tty-service-logs      # Tail logs
thinksuit-tty-service-info      # Show service status
```

**Note:** Commands are available globally after running `npm -w thinksuit-tty link` from the monorepo root.

## Architecture

### Tech Stack
- **xterm.js** - Terminal emulator
- **node-pty** - Pseudo-terminal integration
- **Express** - HTTP server
- **ws** - WebSocket server
- **Svelte 5** - Terminal component

### Project Structure

```
thinksuit-tty/
├── lib/
│   ├── index.js           # Main export
│   ├── Terminal.svelte    # Terminal component
│   └── index.css          # Styles
├── server/
│   └── index.mjs          # WebSocket server
├── bin/
│   ├── service.mjs        # Service entry point
│   └── service.*.sh       # Service control scripts
└── etc/
    └── thinksuit-tty.service.plist  # LaunchAgent example
```

## Exports

### Terminal Component

```javascript
import Terminal from 'thinksuit-tty/Terminal.svelte';
```

Svelte component that renders an xterm.js terminal with WebSocket connectivity.

### Server

```javascript
import { startServer } from 'thinksuit-tty/server';

startServer({
  port: 60662,
  sslKeyPath: './ssl/ttw.key',
  sslCertPath: './ssl/ttw.crt',
  onReady: (address) => {
    console.log(`TTY server ready at wss://localhost:${address.port}`);
  }
});
```

### Styles

```javascript
import 'thinksuit-tty/style.css';
```

## Development

```bash
# Build library
npm run build

# Watch mode for development
npm run dev

# Run tests
npm run test
```

## Related Documentation

- [CLAUDE.md](CLAUDE.md) - Project-specific guidance
- [Parent Project](../../README.md) - ThinkSuit core system
