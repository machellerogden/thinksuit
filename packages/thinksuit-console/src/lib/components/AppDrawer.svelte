<script>
    import { ui } from '$lib/stores/ui.svelte.js';
    import { registerHotkey } from '$lib/stores/hotkeys.svelte.js';
    import { location } from '$lib/components/HashRouter.svelte';
    import Terminal from 'thinksuit-tty';
    import 'thinksuit-tty/style.css';
    import { onMount, tick } from 'svelte';

    // Constants
    const COLLAPSED_SIZE = 48;
    const MIN_SIZE = 100;
    const MAX_SIZE = 800;
    const DRAWER_Z_INDEX = 30;

    let terminalComponent = $state();
    // eslint-disable-next-line svelte/valid-compile
    let terminalActive = false;
    let ttyPort = $state(60662);
    let ttyToken = $state('');
    let ttyCwd = $state('');
    let stateBeforeFullscreen = $state({ open: false, position: 'bottom' });

    // State transition functions
    function collapseTerminal() {
        ui.terminalOpen = false;
        ui.terminalFullscreen = false;
    }

    function expandTerminal() {
        ui.terminalOpen = true;
        ui.terminalFullscreen = false;
    }

    function enterFullscreen() {
        // Save current state before going fullscreen
        stateBeforeFullscreen = {
            open: ui.terminalOpen,
            position: ui.terminalPosition
        };
        ui.terminalOpen = true;
        ui.terminalFullscreen = true;
    }

    function exitFullscreen() {
        // Restore to pre-fullscreen state
        ui.terminalFullscreen = false;
        ui.terminalOpen = stateBeforeFullscreen.open;
    }

    async function focusTerminal() {
        await tick();
        if (terminalComponent) {
            terminalComponent.focus();
        }
    }

    // Helper function for directional hotkeys
    async function handleDirectionalHotkey(targetPosition) {
        if (ui.terminalPosition === targetPosition) {
            // Already in target position
            if (!ui.terminalOpen) {
                // Closed -> open and focus
                expandTerminal();
                await focusTerminal();
            } else if (!terminalActive) {
                // Open but not focused -> just focus
                await focusTerminal();
            } else {
                // Open and focused -> close
                collapseTerminal();
            }
        } else {
            // Move to target position, open, and focus
            ui.terminalPosition = targetPosition;
            expandTerminal();
            await focusTerminal();
        }
    }

    // Register hotkeys and fetch config on mount
    onMount(async () => {
        // Fetch TTY config (port, auth token, and cwd)
        try {
            const response = await fetch('/api/config');
            if (response.ok) {
                const config = await response.json();
                ttyPort = config.ttyPort || 60662;
                ttyToken = config.ttyToken || '';
                ttyCwd = config.ttyCwd || '';
            }
        } catch (error) {
            console.error('Failed to fetch TTY config:', error);
        }

        // Register toggle hotkey (ctrl+alt+o)
        const toggleCleanup = registerHotkey('ctrl+alt+o', async () => {
            if (!ui.terminalOpen) {
                expandTerminal();
                await focusTerminal();
            } else if (!terminalActive) {
                await focusTerminal();
            } else {
                collapseTerminal();
            }
        }, {
            description: 'Toggle/focus terminal',
            preventDefault: true,
            allowInInput: true
        });

        // Register dark mode toggle (ctrl+alt+d)
        const darkModeCleanup = registerHotkey('ctrl+alt+d', () => {
            ui.darkMode = !ui.darkMode;
        }, {
            description: 'Toggle dark mode',
            preventDefault: true,
            allowInInput: true
        });

        // Register new session hotkey (ctrl+alt+n)
        const newSessionCleanup = registerHotkey('ctrl+alt+n', () => {
            location.assign('/run');
            // Signal that input should be focused
            window.dispatchEvent(new CustomEvent('focus-session-input'));
        }, {
            description: 'New session',
            preventDefault: true,
            allowInInput: true
        });

        // Register focus session list hotkey (ctrl+alt+g)
        const focusSessionListCleanup = registerHotkey('ctrl+alt+g', () => {
            window.dispatchEvent(new CustomEvent('focus-session-list'));
        }, {
            description: 'Focus session list',
            preventDefault: true,
            allowInInput: true
        });

        // Register directional mounting hotkeys
        const directionalCleanups = [
            registerHotkey('ctrl+alt+h', () => handleDirectionalHotkey('left'), {
                description: 'Mount terminal to left / toggle if already left',
                preventDefault: true,
                allowInInput: true
            }),
            registerHotkey('ctrl+alt+j', () => handleDirectionalHotkey('bottom'), {
                description: 'Mount terminal to bottom / toggle if already bottom',
                preventDefault: true,
                allowInInput: true
            }),
            registerHotkey('ctrl+alt+k', () => handleDirectionalHotkey('top'), {
                description: 'Mount terminal to top / toggle if already top',
                preventDefault: true,
                allowInInput: true
            }),
            registerHotkey('ctrl+alt+l', () => handleDirectionalHotkey('right'), {
                description: 'Mount terminal to right / toggle if already right',
                preventDefault: true,
                allowInInput: true
            })
        ];

        // Register fullscreen toggle hotkey (ctrl+alt+f)
        const fullscreenCleanup = registerHotkey('ctrl+alt+f', async () => {
            if (ui.terminalFullscreen) {
                exitFullscreen();
            } else {
                enterFullscreen();
                await focusTerminal();
            }
        }, {
            description: 'Toggle terminal fullscreen',
            preventDefault: true,
            allowInInput: true
        });

        // Register resize hotkeys
        const RESIZE_STEP = 50;
        const resizeCleanups = [
            // Decrease width (left/right positions)
            registerHotkey('ctrl+alt+shift+l', () => {
                if (!ui.terminalOpen) return;
                const isHorizontal = ui.terminalPosition === 'left' || ui.terminalPosition === 'right';
                if (isHorizontal) {
                    ui.terminalSizeHorizontal = Math.max(MIN_SIZE, ui.terminalSizeHorizontal - RESIZE_STEP);
                }
            }, {
                description: 'Decrease terminal width (when left/right)',
                preventDefault: true,
                allowInInput: true
            }),
            // Increase height (top/bottom positions)
            registerHotkey('ctrl+alt+shift+k', () => {
                if (!ui.terminalOpen) return;
                const isHorizontal = ui.terminalPosition === 'left' || ui.terminalPosition === 'right';
                if (!isHorizontal) {
                    ui.terminalSizeVertical = Math.min(MAX_SIZE, ui.terminalSizeVertical + RESIZE_STEP);
                }
            }, {
                description: 'Increase terminal height (when top/bottom)',
                preventDefault: true,
                allowInInput: true
            }),
            // Decrease height (top/bottom positions)
            registerHotkey('ctrl+alt+shift+j', () => {
                if (!ui.terminalOpen) return;
                const isHorizontal = ui.terminalPosition === 'left' || ui.terminalPosition === 'right';
                if (!isHorizontal) {
                    ui.terminalSizeVertical = Math.max(MIN_SIZE, ui.terminalSizeVertical - RESIZE_STEP);
                }
            }, {
                description: 'Decrease terminal height (when top/bottom)',
                preventDefault: true,
                allowInInput: true
            }),
            // Increase width (left/right positions)
            registerHotkey('ctrl+alt+shift+h', () => {
                if (!ui.terminalOpen) return;
                const isHorizontal = ui.terminalPosition === 'left' || ui.terminalPosition === 'right';
                if (isHorizontal) {
                    ui.terminalSizeHorizontal = Math.min(MAX_SIZE, ui.terminalSizeHorizontal + RESIZE_STEP);
                }
            }, {
                description: 'Increase terminal width (when left/right)',
                preventDefault: true,
                allowInInput: true
            })
        ];

        return () => {
            if (toggleCleanup) toggleCleanup();
            if (darkModeCleanup) darkModeCleanup();
            if (newSessionCleanup) newSessionCleanup();
            if (focusSessionListCleanup) focusSessionListCleanup();
            if (fullscreenCleanup) fullscreenCleanup();
            directionalCleanups.forEach(cleanup => cleanup && cleanup());
            resizeCleanups.forEach(cleanup => cleanup && cleanup());
        };
    });

    // Derived properties based on position
    let isHorizontal = $derived(ui.terminalPosition === 'left' || ui.terminalPosition === 'right');

    // Get appropriate size based on orientation
    let currentSize = $derived(isHorizontal ? ui.terminalSizeHorizontal : ui.terminalSizeVertical);

    // Fixed positioning styles
    let positionStyle = $derived.by(() => {
        const pos = ui.terminalPosition;
        const actualSize = ui.terminalOpen ? currentSize : COLLAPSED_SIZE;

        // Fullscreen mode takes over entire viewport
        if (ui.terminalFullscreen && ui.terminalOpen) {
            return `position: fixed; top: 0; left: 0; right: 0; bottom: 0; z-index: ${DRAWER_Z_INDEX + 10};`;
        }

        if (pos === 'top') {
            return `position: fixed; top: 0; left: 0; right: 0; height: ${actualSize}px; z-index: ${DRAWER_Z_INDEX};`;
        } else if (pos === 'bottom') {
            return `position: fixed; bottom: 0; left: 0; right: 0; height: ${actualSize}px; z-index: ${DRAWER_Z_INDEX};`;
        } else if (pos === 'left') {
            return `position: fixed; top: 0; left: 0; bottom: 0; width: ${actualSize}px; z-index: ${DRAWER_Z_INDEX};`;
        } else { // right
            return `position: fixed; top: 0; right: 0; bottom: 0; width: ${actualSize}px; z-index: ${DRAWER_Z_INDEX};`;
        }
    });

    // Border classes
    let borderClass = $derived({
        left: 'border-r',
        right: 'border-l',
        top: 'border-b',
        bottom: 'border-t'
    }[ui.terminalPosition]);

    // Toggle button positioning
    let buttonPosition = $derived({
        left: '-right-3.5 bottom-5',
        right: '-left-3.5 bottom-5',
        top: '-bottom-3 left-1/2 -translate-x-1/2',
        bottom: '-top-3 left-1/2 -translate-x-1/2'
    }[ui.terminalPosition]);

    // Arrow rotation and path
    let arrowRotation = $derived.by(() => {
        const pos = ui.terminalPosition;
        const open = ui.terminalOpen;
        if (pos === 'left') return open ? '' : 'rotate-180';
        if (pos === 'right') return open ? 'rotate-180' : '';
        if (pos === 'top') return open ? 'rotate-180' : '';
        if (pos === 'bottom') return open ? '' : 'rotate-180';
        return '';
    });

    let arrowPath = $derived(
        isHorizontal
            ? 'M15 19l-7-7 7-7'  // left/right arrow
            : 'M5 15l7-7 7 7'    // up/down arrow
    );

    // Resize handling
    let isDragging = $state(false);
    let startPos = $state(0);
    let startSize = $state(0);

    function handleResizeStart(event) {
        if (!ui.terminalOpen) return;
        isDragging = true;
        startPos = isHorizontal ? event.clientX : event.clientY;
        startSize = currentSize;
        event.preventDefault();
    }

    function handleResizeMove(event) {
        if (!isDragging) return;

        const currentPos = isHorizontal ? event.clientX : event.clientY;
        let delta;

        if (ui.terminalPosition === 'bottom') {
            delta = startPos - currentPos;
        } else if (ui.terminalPosition === 'top') {
            delta = currentPos - startPos;
        } else if (ui.terminalPosition === 'right') {
            delta = startPos - currentPos;
        } else { // left
            delta = currentPos - startPos;
        }

        const newSize = startSize + delta;
        const clampedSize = Math.max(MIN_SIZE, Math.min(MAX_SIZE, newSize));

        if (isHorizontal) {
            ui.terminalSizeHorizontal = clampedSize;
        } else {
            ui.terminalSizeVertical = clampedSize;
        }
    }

    function handleResizeEnd() {
        isDragging = false;
    }

    $effect(() => {
        if (isDragging) {
            window.addEventListener('mousemove', handleResizeMove);
            window.addEventListener('mouseup', handleResizeEnd);
            return () => {
                window.removeEventListener('mousemove', handleResizeMove);
                window.removeEventListener('mouseup', handleResizeEnd);
            };
        }
    });

    // Resize handle class based on orientation
    let resizeHandleClass = $derived.by(() => {
        const base = 'group bg-gray-100 hover:bg-gray-200 border-gray-300 flex items-center justify-center select-none';
        if (isHorizontal) {
            // Left/Right: 4px wide, full height
            return `${base} cursor-ew-resize w-4 h-full ${ui.terminalPosition === 'left' ? 'border-r' : 'border-l'}`;
        } else {
            // Top/Bottom: full width, 4px tall
            return `${base} cursor-ns-resize h-4 w-full ${ui.terminalPosition === 'top' ? 'border-b' : 'border-t'}`;
        }
    });

    let resizeHandleBar = $derived(
        isHorizontal
            ? 'h-12 w-1 bg-gray-400 group-hover:bg-gray-600 rounded'
            : 'w-12 h-1 bg-gray-400 group-hover:bg-gray-600 rounded'
    );

    // Padding to make room for toggle button
    let buttonPadding = $derived.by(() => {
        if (!ui.terminalOpen) return '';
        const pos = ui.terminalPosition;
        if (pos === 'bottom') return 'pt-7';
        if (pos === 'top') return 'pb-7';
        if (pos === 'left') return 'pr-7';
        if (pos === 'right') return 'pl-7';
        return '';
    });
</script>

<div class="relative bg-gray-100 {borderClass} border-gray-300 flex {isHorizontal ? 'flex-row' : 'flex-col'} {buttonPadding}" style={positionStyle}>
    <!-- Toggle Button - hidden in fullscreen -->
    {#if !ui.terminalFullscreen}
        <button
            onclick={async () => {
                if (!ui.terminalOpen) {
                    ui.terminalOpen = true;
                    await tick();
                    if (terminalComponent) {
                        terminalComponent.focus();
                    }
                } else {
                    ui.terminalOpen = false;
                }
            }}
            class="absolute {buttonPosition} z-20 w-7 h-7 bg-white border border-gray-300 rounded-full flex items-center justify-center hover:bg-gray-50 transition-colors"
            title={ui.terminalOpen ? 'Hide terminal' : 'Show terminal'}
            aria-label={ui.terminalOpen ? 'Hide terminal' : 'Show terminal'}
        >
            <svg class="w-3 h-3 text-gray-600 transition-transform {arrowRotation}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d={arrowPath}></path>
            </svg>
        </button>
    {/if}

    <!-- Resize Handle - positioned first for bottom/right, hidden in fullscreen -->
    {#if ui.terminalOpen && !ui.terminalFullscreen && (ui.terminalPosition === 'bottom' || ui.terminalPosition === 'right')}
        <!-- Keyboard resize available via ctrl+alt+shift+hjkl hotkeys -->
        <!-- eslint-disable-next-line svelte/valid-compile -->
        <div
            class={resizeHandleClass}
            onmousedown={handleResizeStart}
            role="separator"
            aria-label="Resize terminal"
        >
            <div class={resizeHandleBar}></div>
        </div>
    {/if}

    <!-- Terminal Container - Only mount when we have required config -->
    <div
        class="flex-1 p-4 invert hue-rotate-180 overflow-hidden {ui.terminalOpen ? '' : 'hidden'}"
        style="background-color:#0A0B0D"
    >
        {#if ttyToken}
            <Terminal bind:this={terminalComponent} bind:active={terminalActive} port={ttyPort} token={ttyToken} cwd={ttyCwd} />
        {/if}
    </div>

    <!-- Resize Handle - positioned after for top/left, hidden in fullscreen -->
    {#if ui.terminalOpen && !ui.terminalFullscreen && (ui.terminalPosition === 'top' || ui.terminalPosition === 'left')}
        <!-- Keyboard resize available via ctrl+alt+shift+hjkl hotkeys -->
        <!-- eslint-disable-next-line svelte/valid-compile -->
        <div
            class={resizeHandleClass}
            onmousedown={handleResizeStart}
            role="separator"
            aria-label="Resize terminal"
        >
            <div class={resizeHandleBar}></div>
        </div>
    {/if}

    <!-- Collapsed Content -->
    {#if !ui.terminalOpen}
        <div class="h-full w-full flex items-center justify-center pt-2">
            <svg class="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path>
            </svg>
        </div>
    {/if}
</div>
