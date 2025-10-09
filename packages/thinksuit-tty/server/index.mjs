#!/usr/bin/env node

import fs from 'node:fs';
import https from 'node:https';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import pty from '@homebridge/node-pty-prebuilt-multiarch';
import WebSocket, { WebSocketServer } from 'ws';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Track active PTY processes for cleanup
const activePtys = new Set();

function printable(buf) {
    const pattern = /[\0-\x1F\x7F-\x9F]/g;
    const controlCodes = { '7': '\\a', '8': '\\b', '9': '\\t', 'a': '\\n', 'b': '\\v', 'c': '\\f', 'd': '\\r' };
    const pad0 = (str, pad = 0) => ('0'.repeat(pad - 1) + str).slice(-pad);

    return buf.toString().replace(pattern, matched => {
        const charCode = matched.charCodeAt(0);
        const charCode16 = charCode.toString(16);
        let prefix;
        if (charCode < 256) {
            let ctrlCode = controlCodes[charCode16];
            if (ctrlCode) {
                prefix = ctrlCode;
            } else {
                prefix = '\\x' + pad0(charCode16, 2);
            }
        } else {
            prefix = '\\u' + pad0(charCode16, 4);
        }
        return prefix;
    });
}

export function startServer(options = {}) {
    const {
        port = process.env.THINKSUIT_TTY_PORT || 0,
        sslKeyPath = process.env.THINKSUIT_TTY_SSL_KEY || path.join(__dirname, '../ssl/thinksuit-tty.key'),
        sslCertPath = process.env.THINKSUIT_TTY_SSL_CERT || path.join(__dirname, '../ssl/thinksuit-tty.crt'),
        onReady = null
    } = options;

    // Require auth token
    const AUTH_TOKEN = process.env.THINKSUIT_TTY_AUTH_TOKEN;
    if (!AUTH_TOKEN) {
        console.error('THINKSUIT_TTY_AUTH_TOKEN environment variable is required for security.');
        console.error('Generate a token with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"');
        console.error('Then set it in your LaunchAgent plist or environment.');
        process.exit(1);
    }

    // Check for SSL certificates
    if (!fs.existsSync(sslKeyPath) || !fs.existsSync(sslCertPath)) {
        console.error('SSL certificates not found. Please generate them first.');
        console.error(`Expected key: ${sslKeyPath}`);
        console.error(`Expected cert: ${sslCertPath}`);
        process.exit(1);
    }

    const key = fs.readFileSync(sslKeyPath);
    const cert = fs.readFileSync(sslCertPath);
    const app = express();
    const server = https.createServer({ key, cert }, app);
    const wss = new WebSocketServer({
        server,
        handleProtocols: (protocols, request) => {
            // Validate auth token via WebSocket subprotocol
            if (protocols.has(AUTH_TOKEN)) {
                return AUTH_TOKEN;
            }
            console.warn('Unauthorized WebSocket connection attempt');
            return false;
        }
    });

    wss.on('connection', (ws, request) => {
        // Parse cwd from query parameter
        const url = new URL(request.url, `https://${request.headers.host}`);
        const cwdParam = url.searchParams.get('cwd');
        const targetCwd = cwdParam || process.env.HOME;

        let ptyProcess;

        try {
            ptyProcess = pty.spawn('bash', ['--login'], {
                name: 'xterm-256color',
                encoding: 'utf8',
                cols: 80,
                rows: 24,
                cwd: targetCwd,
                env: {
                    ...process.env,
                    COLORTERM: 'truecolor',
                    // Ensure UTF-8 locale (use system default or fallback to en_US.UTF-8)
                    LANG: process.env.LANG || 'en_US.UTF-8',
                    LC_ALL: process.env.LC_ALL || process.env.LANG || 'en_US.UTF-8'
                }
            });

            activePtys.add(ptyProcess);

            ptyProcess.on('data', data => {
                if (ws.readyState === WebSocket.OPEN) {
                    ws.send(data);
                }
            });

            ptyProcess.on('error', err => {
                console.error('PTY error:', err);
                ws.close(1011, 'PTY process error');
            });

            ptyProcess.on('exit', (code, signal) => {
                console.log(`PTY exited: code=${code} signal=${signal}`);
                activePtys.delete(ptyProcess);
                ws.close(1000, 'Process exited');
            });

            ws.on('message', message => {
                const str = printable(message);
                console.log('received: %s', str);

                let payload = message;
                if (str.startsWith('{') && str.endsWith('}')) {
                    try {
                        let data = JSON.parse(message);
                        if (data.event === 'resize') payload = data;
                    } catch (e) {
                        // Not JSON, treat as raw input
                    }
                }

                if (payload?.event === 'resize') {
                    ptyProcess.resize(payload?.size?.cols, payload?.size?.rows);
                } else {
                    ptyProcess.write(payload);
                }
            });

            ws.on('error', err => {
                console.error('WebSocket error:', err);
                if (ptyProcess) {
                    ptyProcess.kill();
                    activePtys.delete(ptyProcess);
                }
            });

            ws.on('close', () => {
                console.log('WebSocket closed');
                if (ptyProcess) {
                    ptyProcess.kill();
                    activePtys.delete(ptyProcess);
                }
            });

        } catch (err) {
            console.error('Failed to spawn PTY:', err);
            ws.close(1011, 'Failed to spawn PTY');
        }
    });

    server.listen(port, '127.0.0.1', () => {
        const address = server.address();
        console.log(`TTY server started on port ${address.port}`);
        if (onReady) {
            onReady(address);
        }
    });

    // Cleanup on shutdown
    const cleanup = () => {
        console.log('Shutting down TTY server...');
        activePtys.forEach(pty => {
            try {
                pty.kill();
            } catch (err) {
                console.error('Error killing PTY:', err);
            }
        });
        activePtys.clear();
        server.close();
        process.exit(0);
    };

    process.on('SIGTERM', cleanup);
    process.on('SIGINT', cleanup);

    return { server, wss };
}
