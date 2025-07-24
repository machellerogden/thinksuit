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

### Setup

The service plist is already installed at `~/Library/LaunchAgents/thinksuit-tty.service.plist`.

### Service Commands

All service management is handled through npm scripts:

```bash
# Initialize service (reset logs, bootstrap, start, and tail)
npm run thinksuit-tty-service-init

# Load service into launchd
npm run thinksuit-tty-service-load

# Unload service from launchd
npm run thinksuit-tty-service-unload

# Start/restart service
npm run thinksuit-tty-service-start

# Stop service gracefully (SIGTERM)
npm run thinksuit-tty-service-stop

# Force kill service (SIGKILL)
npm run thinksuit-tty-service-kill

# Tail service logs
npm run thinksuit-tty-service-logs

# Show service info
npm run thinksuit-tty-service-info
```

### Configuration

The service can be configured via environment variables in the plist file (`~/Library/LaunchAgents/thinksuit-tty.service.plist`):

- `TTW_PORT` - Port number (default: 60662)
- `TTW_SSL_KEY` - Path to SSL key file
- `TTW_SSL_CERT` - Path to SSL certificate file

After editing the plist, reload the service:

```bash
npm run thinksuit-tty-service-unload
npm run thinksuit-tty-service-load
npm run thinksuit-tty-service-start
```

### Logs

Service logs are written to:
- stdout: `~/Library/Logs/thinksuit-tty.service.stdout.log`
- stderr: `~/Library/Logs/thinksuit-tty.service.stderr.log`

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
