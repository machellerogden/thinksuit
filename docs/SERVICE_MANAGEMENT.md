# Service Management Guide

This guide covers the LaunchAgent-based service management system used by ThinkSuit Console and ThinkSuit TTY packages.

## Overview

Both `thinksuit-console` and `thinksuit-tty` provide macOS LaunchAgent services for persistent background operation. These services:
- Run automatically on system startup
- Survive reboots
- Provide consistent logging
- Support standard service management operations

These are **local-only tools** that run as background services on your development machine. The service management interface is identical across both packages, differing only in service names and configuration.

## Service Command Reference

Each package exposes 9 commands through npm bin links. After running `npm link` on a package, these commands become globally available.

### Core Service Commands

#### `thinksuit-{name}-service`
The actual service executable - the Node process that runs the server.

**Usage:**
```bash
thinksuit-console-service
thinksuit-tty-service
```

This is typically invoked by launchd, not run directly.

#### `thinksuit-{name}-service-init`
**Complete reset, bootstrap, start, and tail logs.**

**What it does:**
1. Kills any existing service process (SIGKILL)
2. Unloads service from launchd (bootout)
3. Deletes existing log files
4. Creates fresh log files
5. Bootstraps service from plist
6. Prints service info
7. Starts service (kickstart)
8. Tails logs in follow mode

**Important:** This command tails logs indefinitely. Press **Ctrl+C** after verifying the service started successfully. The service continues running after you exit the tail.

**Usage:**
```bash
thinksuit-console-service-init
thinksuit-tty-service-init
```

**Use when:**
- First-time setup
- Need to reset logs
- Troubleshooting startup issues
- Want to verify service starts correctly

#### `thinksuit-{name}-service-load`
**Register service with launchd.**

Bootstraps the service from the plist without starting it or showing logs.

**Usage:**
```bash
thinksuit-console-service-load
thinksuit-tty-service-load
```

**Use when:**
- Want to register service without starting it
- Reloading after plist modifications

#### `thinksuit-{name}-service-unload`
**Unregister service from launchd.**

Removes the service from launchd's control. The service will not restart automatically.

**Usage:**
```bash
thinksuit-console-service-unload
thinksuit-tty-service-unload
```

**Use when:**
- Removing the service
- Before editing plist files
- Troubleshooting service issues

### Runtime Control

#### `thinksuit-{name}-service-start`
**Start or restart the service.**

Uses `launchctl kickstart` to start/restart the service process.

**Usage:**
```bash
thinksuit-console-service-start
thinksuit-tty-service-start
```

**Use when:**
- Starting service after stop
- Restarting after code changes
- Forcing service restart

#### `thinksuit-{name}-service-stop`
**Gracefully stop the service.**

Sends SIGTERM to allow clean shutdown.

**Usage:**
```bash
thinksuit-console-service-stop
thinksuit-tty-service-stop
```

**Use when:**
- Temporarily stopping service
- Before system maintenance
- Testing service restart behavior

#### `thinksuit-{name}-service-kill`
**Force kill the service.**

Sends SIGKILL for immediate termination. Use only when graceful stop fails.

**Usage:**
```bash
thinksuit-console-service-kill
thinksuit-tty-service-kill
```

**Use when:**
- Service is unresponsive
- Graceful stop failed
- Emergency shutdown needed

### Inspection Commands

#### `thinksuit-{name}-service-logs`
**Tail service logs.**

Follows both stdout and stderr log files.

**Usage:**
```bash
thinksuit-console-service-logs
thinksuit-tty-service-logs
```

**Use when:**
- Monitoring service activity
- Debugging issues
- Watching startup sequence

Press **Ctrl+C** to stop tailing.

#### `thinksuit-{name}-service-info`
**Show service status and information.**

Displays output from `launchctl print` showing service state, PID, and configuration.

**Usage:**
```bash
thinksuit-console-service-info
thinksuit-tty-service-info
```

**Use when:**
- Checking if service is running
- Verifying service configuration
- Getting process ID

### Log Files

Service logs are written to:
- **stdout**: `~/Library/Logs/thinksuit-{name}.service.stdout.log`
- **stderr**: `~/Library/Logs/thinksuit-{name}.service.stderr.log`

Where `{name}` is `console` or `tty`.

## Installation Guide

### Prerequisites

- macOS with launchd
- Node.js installed
- ThinkSuit monorepo cloned and dependencies installed (`npm install`)

**Note:** These services are designed for local use. An automated installer is planned for a future release to simplify this manual setup process.

### Step 1: Review Plist Files

Plist files are located in each package's `etc/` directory:
- `packages/thinksuit-console/etc/thinksuit-console.service.plist`
- `packages/thinksuit-tty/etc/thinksuit-tty.service.plist`

### Step 2: Customize Configuration

Edit the plist files to match your environment. Key fields to customize:

#### Paths
Update paths to match your system:
```xml
<key>StandardErrorPath</key>
<string>/Users/YOUR_USERNAME/Library/Logs/thinksuit-console.service.stderr.log</string>

<key>StandardOutPath</key>
<string>/Users/YOUR_USERNAME/Library/Logs/thinksuit-console.service.stdout.log</string>

<key>WorkingDirectory</key>
<string>/path/to/your/thinksuit/packages/thinksuit-console</string>

<key>ProgramArguments</key>
<array>
  <string>/path/to/your/node</string>
  <string>bin/service.mjs</string>
</array>
```

#### Environment Variables

**For thinksuit-console:**
```xml
<key>EnvironmentVariables</key>
<dict>
  <key>PATH</key>
  <string><![CDATA[/your/node/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin]]></string>
  <key>THINKSUIT_CONSOLE_PORT</key>
  <string>60660</string>
  <key>THINKSUIT_CONSOLE_HOST</key>
  <string>localhost</string>
</dict>
```

**For thinksuit-tty:**
```xml
<key>EnvironmentVariables</key>
<dict>
  <key>PATH</key>
  <string><![CDATA[/your/node/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin]]></string>
  <key>TTW_PORT</key>
  <string>60662</string>
</dict>
```

### Step 3: Copy Plists to LaunchAgents

Copy the edited plist files to your LaunchAgents directory:

```bash
cp packages/thinksuit-console/etc/thinksuit-console.service.plist ~/Library/LaunchAgents/
cp packages/thinksuit-tty/etc/thinksuit-tty.service.plist ~/Library/LaunchAgents/
```

### Step 4: Create Global Bin Links

Make the service management commands globally available:

```bash
# From monorepo root
npm -w thinksuit-console -w thinksuit-tty link
```

This creates symlinks in your global npm bin directory, making the `thinksuit-*-service-*` commands available from anywhere.

### Step 5: Initialize Services

**Important:** Start TTY service first, as the console depends on it.

```bash
# Initialize TTY service
thinksuit-tty-service-init
```

Watch the logs until you see successful startup messages, then press **Ctrl+C**. The service continues running.

```bash
# Initialize console service
thinksuit-console-service-init
```

Again, watch for successful startup, then press **Ctrl+C**.

### Step 6: Verify Services

Check that both services are running:

```bash
thinksuit-tty-service-info
thinksuit-console-service-info
```

You should see active service information with PIDs.

### Step 7: Access Console

Open your browser to the configured console address (default: http://localhost:60660).

## Operations Guide

### Daily Operations

#### Starting Services

If services are stopped:
```bash
thinksuit-tty-service-start
thinksuit-console-service-start
```

#### Stopping Services

For graceful shutdown:
```bash
thinksuit-console-service-stop
thinksuit-tty-service-stop
```

#### Viewing Logs

To monitor service activity:
```bash
# Separate terminals for each
thinksuit-console-service-logs
thinksuit-tty-service-logs

# Or view log files directly
tail -f ~/Library/Logs/thinksuit-console.service.stdout.log
tail -f ~/Library/Logs/thinksuit-tty.service.stdout.log
```

#### Checking Status

```bash
thinksuit-console-service-info
thinksuit-tty-service-info
```

### Configuration Changes

When modifying plist files:

1. **Unload service:**
   ```bash
   thinksuit-console-service-unload
   ```

2. **Edit plist:**
   ```bash
   vim ~/Library/LaunchAgents/thinksuit-console.service.plist
   ```

3. **Reload and start:**
   ```bash
   thinksuit-console-service-load
   thinksuit-console-service-start
   ```

### Troubleshooting

#### Service Won't Start

1. Check logs:
   ```bash
   thinksuit-console-service-logs
   ```

2. Look for errors in:
   ```bash
   cat ~/Library/Logs/thinksuit-console.service.stderr.log
   ```

3. Verify plist paths are correct:
   ```bash
   cat ~/Library/LaunchAgents/thinksuit-console.service.plist
   ```

4. Check if port is already in use:
   ```bash
   lsof -i :60660  # console
   lsof -i :60662  # tty
   ```

#### Service Keeps Crashing

1. Run service directly to see errors:
   ```bash
   cd packages/thinksuit-console
   node bin/service.mjs
   ```

2. Check dependencies are installed:
   ```bash
   npm install
   ```

3. Verify Node version in plist matches installed version:
   ```bash
   which node
   ```

#### Console Can't Connect to TTY

1. Verify TTY service is running:
   ```bash
   thinksuit-tty-service-info
   ```

2. Check TTY port configuration matches what console expects

3. Restart both services:
   ```bash
   thinksuit-tty-service-start
   thinksuit-console-service-start
   ```

#### Commands Not Found

If `thinksuit-*-service-*` commands aren't found:

1. Re-run npm link:
   ```bash
   npm -w thinksuit-console link
   npm -w thinksuit-tty link
   ```

2. Verify global bin is in PATH:
   ```bash
   npm config get prefix
   echo $PATH
   ```

### Common Tasks

#### Resetting Everything

Complete reset of both services:
```bash
thinksuit-console-service-init
thinksuit-tty-service-init
```

#### Checking Service Dependencies

Console requires TTY service. Always ensure TTY is running first:
```bash
# Check TTY
thinksuit-tty-service-info

# If not running
thinksuit-tty-service-start

# Then check console
thinksuit-console-service-info
```

#### Updating Code

After pulling new code:
```bash
# Rebuild if needed
npm install
npm run build

# Restart services
thinksuit-console-service-start
thinksuit-tty-service-start
```

## Reference

### Service Lifecycle

```
[plist in ~/Library/LaunchAgents/]
         ↓
   service-load (bootstrap)
         ↓
   service-start (kickstart)
         ↓
   [service running]
         ↓
   service-stop (SIGTERM) or service-kill (SIGKILL)
         ↓
   service-unload (bootout)
```

### Quick Command Matrix

| Task | Console Command | TTY Command |
|------|----------------|-------------|
| Complete setup | `thinksuit-console-service-init` | `thinksuit-tty-service-init` |
| Register | `thinksuit-console-service-load` | `thinksuit-tty-service-load` |
| Unregister | `thinksuit-console-service-unload` | `thinksuit-tty-service-unload` |
| Start/restart | `thinksuit-console-service-start` | `thinksuit-tty-service-start` |
| Stop (graceful) | `thinksuit-console-service-stop` | `thinksuit-tty-service-stop` |
| Kill (force) | `thinksuit-console-service-kill` | `thinksuit-tty-service-kill` |
| View logs | `thinksuit-console-service-logs` | `thinksuit-tty-service-logs` |
| Check status | `thinksuit-console-service-info` | `thinksuit-tty-service-info` |

## License

Apache 2.0
