<script>
import { onMount, onDestroy } from 'svelte';
import { Terminal } from '@xterm/xterm';
import { AttachAddon } from '@xterm/addon-attach';
import { FitAddon } from '@xterm/addon-fit';
import { WebglAddon } from '@xterm/addon-webgl';
import { Unicode11Addon } from '@xterm/addon-unicode11';
import '@xterm/xterm/css/xterm.css';

let {
    port = 60662, // default thinksuit-tty port
    token = '', // auth token for WebSocket connection
    cwd = '', // initial working directory
    fontFamily = '"Noto Sans Mono", Lekton, Menlo, Monaco, "Courier New", monospace',
    theme = { background: "#0A0B0D" },
    active = $bindable(false)
} = $props();

let terminalElement = $state();
let terminal;
let ttySocket;
let fitAddon;
let ptyResizeHandler;
let connectionError = $state(null); // null = no error, 'cert' = certificate issue, 'unavailable' = service not running

// Expose focus method for parent components
export function focus() {
    if (terminal) {
        terminal.focus();
    }
}

const resizeTty = (size) => {
    if (ttySocket && ttySocket.readyState === WebSocket.OPEN) {
        ttySocket.send(JSON.stringify({ event: 'resize', size }));
    }
};

// Track focus state - define outside onMount so onDestroy can access
const handleFocus = () => {
    active = true;
};
const handleBlur = () => {
    active = false;
};

const handleResize = () => {
    if (fitAddon) {
        fitAddon.fit();
    }
};

onMount(() => {
    terminal = new Terminal({
        allowProposedApi: true,
        allowTransparency: false,
        fontFamily,
        theme
    });

    // Pass token as WebSocket subprotocol for authentication
    // Pass cwd as query parameter for initial working directory
    const protocols = token ? [token] : [];
    const cwdParam = cwd ? `?cwd=${encodeURIComponent(cwd)}` : '';
    ttySocket = new WebSocket(`wss://localhost:${port}${cwdParam}`, protocols);

    const attachAddon = new AttachAddon(ttySocket);
    fitAddon = new FitAddon();
    const webglAddon = new WebglAddon();
    const unicode11Addon = new Unicode11Addon();

    terminal.loadAddon(attachAddon);
    terminal.loadAddon(fitAddon);
    terminal.loadAddon(unicode11Addon);
    terminal.unicode.activeVersion = '11';

    terminal.open(terminalElement);
    terminal.loadAddon(webglAddon);
    webglAddon.onContextLoss(e => webglAddon.dispose());
    fitAddon.fit();

    // Focus the terminal when it's opened
    terminal.focus();

    // Terminal uses a textarea internally for input - listen to that for focus
    terminal.textarea?.addEventListener('focus', handleFocus);
    terminal.textarea?.addEventListener('blur', handleBlur);

    window.addEventListener('resize', handleResize);

    // Watch for container size changes (e.g., from drag resize)
    const resizeObserver = new ResizeObserver(() => {
        if (fitAddon) {
            fitAddon.fit();
        }
    });
    resizeObserver.observe(terminalElement);

    ttySocket.addEventListener('open', event => {
        resizeTty({ cols: terminal.cols, rows: terminal.rows });
        ptyResizeHandler = terminal.onResize(resizeTty);
    });

    ttySocket.addEventListener('close', event => {
        ptyResizeHandler?.dispose();

        // Detect error type based on close code and whether connection was ever established
        // If close happens immediately after error, it's likely a connection failure
        if (connectionError === null && event.code !== 1000 && event.code !== 1001) {
            // Code 1006 = abnormal closure (usually means couldn't connect at all)
            if (event.code === 1006) {
                connectionError = 'unavailable';
            } else {
                connectionError = 'cert';
            }
        }
    });

    ttySocket.addEventListener('error', event => {
        console.error('WebSocket error:', event);
        // Mark that an error occurred, but wait for close event to determine type
        if (connectionError === null) {
            connectionError = 'cert'; // Default to cert issue
        }
    });

    return () => {
        resizeObserver.disconnect();
    };
});

onDestroy(() => {
    window.removeEventListener('resize', handleResize);
    if (terminal?.textarea) {
        terminal.textarea.removeEventListener('focus', handleFocus);
        terminal.textarea.removeEventListener('blur', handleBlur);
    }
    if (ptyResizeHandler) {
        ptyResizeHandler.dispose();
    }
    if (ttySocket) {
        ttySocket.close();
    }
    if (terminal) {
        terminal.dispose();
    }
});
</script>

{#if connectionError === 'cert'}
    <div class="w-full h-full flex items-center justify-center p-8">
        <div class="max-w-2xl text-center space-y-4">
            <div class="text-orange-600 text-lg font-semibold">
                Certificate Not Trusted
            </div>
            <div class="text-gray-300 space-y-2">
                <p>
                    Your browser hasn't accepted the self-signed SSL certificate for the TTY service yet.
                </p>
                <p>
                    To fix this:
                </p>
                <ol class="text-left list-decimal list-inside space-y-1 mt-2">
                    <li>
                        Click the link below to open the TTY service URL in a new tab
                    </li>
                    <li>
                        Accept the browser security warning for the self-signed certificate
                    </li>
                    <li>
                        Return here and reload the page
                    </li>
                </ol>
            </div>
            <div class="pt-4">
                <a
                    href="https://localhost:{port}/"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="inline-block px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                >
                    Open https://localhost:{port}/ in New Tab
                </a>
            </div>
        </div>
    </div>
{:else if connectionError === 'unavailable'}
    <div class="w-full h-full flex items-center justify-center p-8">
        <div class="max-w-2xl text-center space-y-4">
            <div class="text-red-400 text-lg font-semibold">
                TTY Service Not Running
            </div>
            <div class="text-gray-300 space-y-2">
                <p>
                    The terminal could not connect to the TTY service at <code class="bg-gray-800 px-2 py-1 rounded">localhost:{port}</code>.
                </p>
                <p>
                    Make sure the ThinkSuit TTY service is running:
                </p>
                <pre class="text-left bg-gray-800 p-4 rounded-lg mt-2 text-sm overflow-x-auto">
# Check service status
thinksuit-tty-service-info

# Start the service
thinksuit-tty-service-start

# Or start manually
node packages/thinksuit-tty/bin/service.mjs</pre>
            </div>
        </div>
    </div>
{:else}
    <div class="w-full h-full" style="filter:" bind:this={terminalElement}></div>
{/if}
