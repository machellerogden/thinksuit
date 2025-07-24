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
    fontFamily = '"Noto Sans Mono", Lekton, Menlo, Monaco, "Courier New", monospace',
    theme = { background: "#0A0B0D" },
    active = $bindable(false)
} = $props();

let terminalElement = $state();
let terminal;
let ttySocket;
let fitAddon;
let ptyResizeHandler;

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

    ttySocket = new WebSocket(`wss://localhost:${port}`);

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
    });

    ttySocket.addEventListener('error', event => {
        console.error('WebSocket error:', event);
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

<div class="w-full h-full" style="filter:" bind:this={terminalElement}></div>
