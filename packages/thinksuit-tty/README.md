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

The TTY service runs on port 60662 (configurable via `THINKSUIT_TTY_PORT` env var).

## Security

The TTY service requires authentication via the `THINKSUIT_TTY_AUTH_TOKEN` environment variable. Generate a secure token:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Set this token in your LaunchAgent plist configuration before starting the service.

## Service Management

ThinkSuit TTY includes LaunchAgent integration for automatic startup on macOS.

For complete installation instructions and service management reference, see the **[Service Management Guide](../../docs/SERVICE_MANAGEMENT.md)**.

### Quick Reference

All services are managed through `thinkctl`, the operations control plane:

```bash
thinkctl up tty        # generate the plist + load (bring up)
thinkctl start tty     # start / restart
thinkctl stop tty      # stop gracefully (SIGTERM)
thinkctl status tty    # launchd state + PID
thinkctl logs tty      # tail logs
thinkctl down tty      # unload + uninstall
```

The daemon also stays runnable directly for debugging: `node bin/service.mjs`.

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
└── bin/
    └── service.mjs        # Service entry point (managed by thinkctl; plist generated in code)
```

The LaunchAgent plist is generated in code by `thinkctl` from `service.js`; see the
[Service Management Guide](../../docs/SERVICE_MANAGEMENT.md).

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
  sslKeyPath: './ssl/thinksuit-tty.key',
  sslCertPath: './ssl/thinksuit-tty.crt',
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
