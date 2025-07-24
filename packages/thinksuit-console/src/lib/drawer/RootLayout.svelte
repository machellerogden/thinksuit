<script>
    import { onMount } from 'svelte';
    import { registerHotkey } from '$lib/stores/hotkeys.svelte.js';
    import {
        drawers,
        ui,
        registerDrawer,
        unregisterDrawer,
        updateElement,
        setFocus,
        setState,
        cycleStateForward,
        cycleStateBackward,
        navigate,
        descend,
        ascend,
        flashFocusRing,
        isVisible,
        isAncestor
    } from './index.js';

    let {
        topNav = null,
        leftContent = null,
        rightContent = null,
        bottomContent = null,
        mainContent = null
    } = $props();

    // Element references
    let topRef;
    let leftRef;
    let rightRef;
    let bottomRef;
    let mainRef;

    // Get drawer data from reactive store
    let topDrawer = $derived(drawers.get('root.top'));
    let leftDrawer = $derived(drawers.get('root.left'));
    let rightDrawer = $derived(drawers.get('root.right'));
    let bottomDrawer = $derived(drawers.get('root.bottom'));
    let mainDrawer = $derived(drawers.get('root.main'));

    // Visibility (computed from state) - default to true to allow initial render/registration
    let topVisible = $derived(topDrawer ? isVisible('root.top', drawers) : true);
    let leftVisible = $derived(leftDrawer ? isVisible('root.left', drawers) : true);
    let rightVisible = $derived(rightDrawer ? isVisible('root.right', drawers) : true);
    let bottomVisible = $derived(bottomDrawer ? isVisible('root.bottom', drawers) : true);
    let mainVisible = $derived(mainDrawer ? isVisible('root.main', drawers) : true);

    // Focus indicators
    let topFocused = $derived(ui.focusedId === 'root.top');
    let leftFocused = $derived(ui.focusedId === 'root.left');
    let rightFocused = $derived(ui.focusedId === 'root.right');
    let bottomFocused = $derived(ui.focusedId === 'root.bottom');
    let mainFocused = $derived(ui.focusedId === 'root.main');

    // Parent indicators
    let topIsParent = $derived(isAncestor('root.top', ui.focusedId));
    let leftIsParent = $derived(isAncestor('root.left', ui.focusedId));
    let rightIsParent = $derived(isAncestor('root.right', ui.focusedId));
    let bottomIsParent = $derived(isAncestor('root.bottom', ui.focusedId));
    let mainIsParent = $derived(isAncestor('root.main', ui.focusedId));

    // Drawer sizing classes
    function getDrawerClass(state, axis) {
        if (!state) return axis === 'vertical' ? 'h-12' : 'w-12';
        if (state === 'takeover' || state === 'fullscreen') {
            return axis === 'vertical' ? 'h-full' : 'w-full';
        }
        if (state === 'expanded') {
            return axis === 'vertical' ? 'h-48' : 'w-80';
        }
        return axis === 'vertical' ? 'h-12' : 'w-12';
    }

    let topClass = $derived(getDrawerClass(topDrawer?.state, 'vertical'));
    let leftClass = $derived(getDrawerClass(leftDrawer?.state, 'horizontal'));
    let rightClass = $derived(getDrawerClass(rightDrawer?.state, 'horizontal'));
    let bottomClass = $derived(getDrawerClass(bottomDrawer?.state, 'vertical'));
    let mainClass = $derived(mainDrawer?.state === 'takeover' || mainDrawer?.state === 'fullscreen' ? 'w-full' : 'flex-1');

    // Toggle functions
    function toggleTop() {
        const newState = topDrawer?.state === 'collapsed' ? 'expanded' : 'collapsed';
        setState('root.top', newState);
    }

    function toggleLeft() {
        const newState = leftDrawer?.state === 'collapsed' ? 'expanded' : 'collapsed';
        setState('root.left', newState);
    }

    function toggleRight() {
        const newState = rightDrawer?.state === 'collapsed' ? 'expanded' : 'collapsed';
        setState('root.right', newState);
    }

    function toggleBottom() {
        const newState = bottomDrawer?.state === 'collapsed' ? 'expanded' : 'collapsed';
        setState('root.bottom', newState);
    }

    onMount(() => {
        // Register drawers
        registerDrawer('root.top', {
            position: 'top',
            parentId: null,
            state: 'collapsed',
            element: topRef
        });

        registerDrawer('root.left', {
            position: 'left',
            parentId: null,
            state: 'collapsed',
            element: leftRef
        });

        registerDrawer('root.right', {
            position: 'right',
            parentId: null,
            state: 'collapsed',
            element: rightRef
        });

        registerDrawer('root.bottom', {
            position: 'bottom',
            parentId: null,
            state: 'collapsed',
            element: bottomRef
        });

        registerDrawer('root.main', {
            position: 'main',
            parentId: null,
            state: 'expanded',
            element: mainRef
        });

        // Setup ResizeObservers
        const observers = [];

        const observeDrawer = (id, element) => {
            if (!element) return;
            const observer = new ResizeObserver(() => {
                updateElement(id, element);
            });
            observer.observe(element);
            observers.push(observer);
        };

        observeDrawer('root.top', topRef);
        observeDrawer('root.left', leftRef);
        observeDrawer('root.right', rightRef);
        observeDrawer('root.bottom', bottomRef);
        observeDrawer('root.main', mainRef);

        // Register hotkeys
        const hotkeyCleanups = [
            registerHotkey('ctrl+alt+h', () => navigate('h'), { preventDefault: true, allowInInput: true }),
            registerHotkey('ctrl+alt+j', () => navigate('j'), { preventDefault: true, allowInInput: true }),
            registerHotkey('ctrl+alt+k', () => navigate('k'), { preventDefault: true, allowInInput: true }),
            registerHotkey('ctrl+alt+l', () => navigate('l'), { preventDefault: true, allowInInput: true }),
            registerHotkey('ctrl+alt+i', () => descend(), { preventDefault: true, allowInInput: true }),
            registerHotkey('ctrl+alt+o', () => ascend(), { preventDefault: true, allowInInput: true }),
            registerHotkey('ctrl+alt+,', () => cycleStateBackward(), { preventDefault: true, allowInInput: true }),
            registerHotkey('ctrl+alt+.', () => cycleStateForward(), { preventDefault: true, allowInInput: true }),
            registerHotkey('ctrl+alt+w', () => flashFocusRing(), { preventDefault: true, allowInInput: true })
        ];

        // Flash focus ring on focus changes
        const unsubFocus = $effect.root(() => {
            $effect(() => {
                ui.focusedId; // Track dependency
                flashFocusRing();
            });
        });

        return () => {
            observers.forEach(o => o.disconnect());
            hotkeyCleanups.forEach(cleanup => cleanup());
            unsubFocus();
            unregisterDrawer('root.top');
            unregisterDrawer('root.left');
            unregisterDrawer('root.right');
            unregisterDrawer('root.bottom');
            unregisterDrawer('root.main');
        };
    });
</script>

<div class="h-screen flex flex-col">
    <!-- Top Drawer -->
    {#if topNav && topVisible}
        <div
            bind:this={topRef}
            onclick={() => setFocus('root.top')}
            class="relative {topClass} bg-gradient-to-t from-gray-100 to-white border-b border-gray-300 transition-all duration-300 {ui.showFocusRing && topFocused ? 'ring-2 ring-inset ring-indigo-500' : ui.showFocusRing && topIsParent ? 'ring-2 ring-inset ring-amber-400' : ''}"
        >
            <div class="h-full overflow-auto">
                {@render topNav({ state: topDrawer?.state })}
            </div>

            <button
                onclick={toggleTop}
                class="absolute -bottom-3 left-1/2 -translate-x-1/2 z-50 w-7 h-7 bg-white border border-gray-300 rounded-full flex items-center justify-center hover:bg-gray-50 transition-colors"
                title={topDrawer?.state === 'collapsed' ? 'Expand top' : 'Collapse top'}
            >
                <svg class="w-3 h-3 text-gray-600 transition-transform {topDrawer?.state === 'collapsed' ? '' : 'rotate-180'}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path>
                </svg>
            </button>
        </div>
    {/if}

    <!-- Main area: Left, Main, Right -->
    <div class="flex-1 flex overflow-hidden">
        {#if leftVisible}
            <div
                bind:this={leftRef}
                onclick={() => setFocus('root.left')}
                class="relative {leftClass} bg-white border-r border-gray-300 transition-all duration-300 {ui.showFocusRing && leftFocused ? 'ring-2 ring-inset ring-indigo-500' : ui.showFocusRing && leftIsParent ? 'ring-2 ring-inset ring-amber-400' : ''}"
            >
                <div class="h-full overflow-auto">
                    {#if leftContent}
                        {@render leftContent({ state: leftDrawer?.state })}
                    {:else}
                        <div class="p-4">
                            {#if leftDrawer?.state === 'collapsed'}
                                <svg class="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"></path>
                                </svg>
                            {:else}
                                Left Drawer
                            {/if}
                        </div>
                    {/if}
                </div>

                <button
                    onclick={toggleLeft}
                    class="absolute -right-3.5 bottom-5 z-50 w-7 h-7 bg-white border border-gray-300 rounded-full flex items-center justify-center hover:bg-gray-50 transition-colors"
                    title={leftDrawer?.state === 'collapsed' ? 'Expand left' : 'Collapse left'}
                >
                    <svg class="w-3 h-3 text-gray-600 transition-transform {leftDrawer?.state === 'collapsed' ? 'rotate-180' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path>
                    </svg>
                </button>
            </div>
        {/if}

        {#if mainVisible}
            <div
                bind:this={mainRef}
                onclick={() => setFocus('root.main')}
                class="relative {mainClass} bg-white transition-all duration-300"
            >
                {#if ui.showFocusRing && (mainFocused || mainIsParent)}
                    <div class="absolute inset-0 pointer-events-none z-50 {mainFocused ? 'ring-2 ring-inset ring-indigo-500' : 'ring-2 ring-inset ring-amber-400'}"></div>
                {/if}
                <div class="h-full w-full overflow-auto">
                    {#if mainContent}
                        {@render mainContent()}
                    {:else}
                        <div class="p-8">
                            <h1 class="text-2xl font-bold mb-4">Main Content</h1>
                            <p>Main content area</p>
                        </div>
                    {/if}
                </div>
            </div>
        {/if}

        {#if rightVisible}
            <div
                bind:this={rightRef}
                onclick={() => setFocus('root.right')}
                class="relative {rightClass} bg-white border-l border-gray-300 transition-all duration-300 {ui.showFocusRing && rightFocused ? 'ring-2 ring-inset ring-indigo-500' : ui.showFocusRing && rightIsParent ? 'ring-2 ring-inset ring-amber-400' : ''}"
            >
                <div class="h-full overflow-auto">
                    {#if rightContent}
                        {@render rightContent({ state: rightDrawer?.state })}
                    {:else}
                        <div class="p-4">
                            {#if rightDrawer?.state === 'collapsed'}
                                <svg class="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path>
                                </svg>
                            {:else}
                                Right Drawer
                            {/if}
                        </div>
                    {/if}
                </div>

                <button
                    onclick={toggleRight}
                    class="absolute -left-3.5 bottom-5 z-50 w-7 h-7 bg-white border border-gray-300 rounded-full flex items-center justify-center hover:bg-gray-50 transition-colors"
                    title={rightDrawer?.state === 'collapsed' ? 'Expand right' : 'Collapse right'}
                >
                    <svg class="w-3 h-3 text-gray-600 transition-transform {rightDrawer?.state === 'collapsed' ? '' : 'rotate-180'}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path>
                    </svg>
                </button>
            </div>
        {/if}
    </div>

    <!-- Bottom Drawer -->
    {#if bottomVisible}
        <div
            bind:this={bottomRef}
            onclick={() => setFocus('root.bottom')}
            class="relative {bottomClass} bg-gray-100 border-t border-gray-300 transition-all duration-300 {ui.showFocusRing && bottomFocused ? 'ring-2 ring-inset ring-indigo-500' : ui.showFocusRing && bottomIsParent ? 'ring-2 ring-inset ring-amber-400' : ''}"
        >
            <div class="h-full overflow-auto">
                {#if bottomContent}
                    {@render bottomContent({ state: bottomDrawer?.state })}
                {:else}
                    <div class="p-4">
                        {#if bottomDrawer?.state === 'collapsed'}
                            <svg class="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path>
                            </svg>
                        {:else}
                            Bottom Drawer
                        {/if}
                    </div>
                {/if}
            </div>

            <button
                onclick={toggleBottom}
                class="absolute -top-3 left-1/2 -translate-x-1/2 z-50 w-7 h-7 bg-white border border-gray-300 rounded-full flex items-center justify-center hover:bg-gray-50 transition-colors"
                title={bottomDrawer?.state === 'collapsed' ? 'Expand bottom' : 'Collapse bottom'}
            >
                <svg class="w-3 h-3 text-gray-600 transition-transform {bottomDrawer?.state === 'collapsed' ? '' : 'rotate-180'}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 15l7-7 7 7"></path>
                </svg>
            </button>
        </div>
    {/if}
</div>
