<script>
    import { onMount } from 'svelte';
    import {
        drawers,
        ui,
        registerDrawer,
        unregisterDrawer,
        updateElement,
        setFocus,
        setState,
        isVisible,
        isAncestor
    } from './index.js';

    let {
        variant = 'wide', // 'wide' or 'tall'
        parentDrawerId = 'root.main',
        showTop = false,
        showLeft = true,
        showRight = true,
        showBottom = true,
        topContent = null,
        leftContent = null,
        rightContent = null,
        bottomContent = null,
        mainContent = null
    } = $props();

    // Build hierarchical IDs
    const topDrawerId = `${parentDrawerId}.top`;
    const leftDrawerId = `${parentDrawerId}.left`;
    const rightDrawerId = `${parentDrawerId}.right`;
    const bottomDrawerId = `${parentDrawerId}.bottom`;
    const mainDrawerId = `${parentDrawerId}.main`;

    // Element references
    let topRef;
    let leftRef;
    let rightRef;
    let bottomRef;
    let mainRef;

    // Get drawer data from reactive store
    let topDrawer = $derived(drawers.get(topDrawerId));
    let leftDrawer = $derived(drawers.get(leftDrawerId));
    let rightDrawer = $derived(drawers.get(rightDrawerId));
    let bottomDrawer = $derived(drawers.get(bottomDrawerId));
    let mainDrawer = $derived(drawers.get(mainDrawerId));

    // Visibility - default to true to allow initial render/registration
    let topVisible = $derived(showTop && (topDrawer ? isVisible(topDrawerId, drawers) : true));
    let leftVisible = $derived(showLeft && (leftDrawer ? isVisible(leftDrawerId, drawers) : true));
    let rightVisible = $derived(showRight && (rightDrawer ? isVisible(rightDrawerId, drawers) : true));
    let bottomVisible = $derived(showBottom && (bottomDrawer ? isVisible(bottomDrawerId, drawers) : true));
    let mainVisible = $derived(mainDrawer ? isVisible(mainDrawerId, drawers) : true);

    // Focus indicators
    let topFocused = $derived(showTop && ui.focusedId === topDrawerId);
    let leftFocused = $derived(showLeft && ui.focusedId === leftDrawerId);
    let rightFocused = $derived(showRight && ui.focusedId === rightDrawerId);
    let bottomFocused = $derived(showBottom && ui.focusedId === bottomDrawerId);
    let mainFocused = $derived(ui.focusedId === mainDrawerId);

    // Parent indicators
    let topIsParent = $derived(showTop && isAncestor(topDrawerId, ui.focusedId));
    let leftIsParent = $derived(showLeft && isAncestor(leftDrawerId, ui.focusedId));
    let rightIsParent = $derived(showRight && isAncestor(rightDrawerId, ui.focusedId));
    let bottomIsParent = $derived(showBottom && isAncestor(bottomDrawerId, ui.focusedId));
    let mainIsParent = $derived(isAncestor(mainDrawerId, ui.focusedId));

    // Drawer sizing
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
    let mainClass = $derived(mainDrawer?.state === 'collapsed' ? 'w-12' : 'flex-1');

    // Toggle functions
    function toggleTop() {
        const newState = topDrawer?.state === 'collapsed' ? 'expanded' : 'collapsed';
        setState(topDrawerId, newState);
    }

    function toggleLeft() {
        const newState = leftDrawer?.state === 'collapsed' ? 'expanded' : 'collapsed';
        setState(leftDrawerId, newState);
    }

    function toggleRight() {
        const newState = rightDrawer?.state === 'collapsed' ? 'expanded' : 'collapsed';
        setState(rightDrawerId, newState);
    }

    function toggleBottom() {
        const newState = bottomDrawer?.state === 'collapsed' ? 'expanded' : 'collapsed';
        setState(bottomDrawerId, newState);
    }

    onMount(() => {
        // Register drawers
        if (showTop && topRef) {
            registerDrawer(topDrawerId, {
                position: 'top',
                parentId: parentDrawerId,
                state: 'collapsed',
                element: topRef
            });
        }

        if (showLeft && leftRef) {
            registerDrawer(leftDrawerId, {
                position: 'left',
                parentId: parentDrawerId,
                state: 'collapsed',
                element: leftRef
            });
        }

        if (showRight && rightRef) {
            registerDrawer(rightDrawerId, {
                position: 'right',
                parentId: parentDrawerId,
                state: 'collapsed',
                element: rightRef
            });
        }

        if (showBottom && bottomRef) {
            registerDrawer(bottomDrawerId, {
                position: 'bottom',
                parentId: parentDrawerId,
                state: 'collapsed',
                element: bottomRef
            });
        }

        if (mainRef) {
            registerDrawer(mainDrawerId, {
                position: 'main',
                parentId: parentDrawerId,
                state: 'expanded',
                element: mainRef
            });
        }

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

        if (showTop) observeDrawer(topDrawerId, topRef);
        if (showLeft) observeDrawer(leftDrawerId, leftRef);
        if (showRight) observeDrawer(rightDrawerId, rightRef);
        if (showBottom) observeDrawer(bottomDrawerId, bottomRef);
        observeDrawer(mainDrawerId, mainRef);

        return () => {
            observers.forEach(o => o.disconnect());
            if (showTop) unregisterDrawer(topDrawerId);
            if (showLeft) unregisterDrawer(leftDrawerId);
            if (showRight) unregisterDrawer(rightDrawerId);
            if (showBottom) unregisterDrawer(bottomDrawerId);
            unregisterDrawer(mainDrawerId);
        };
    });
</script>

{#if variant === 'wide'}
    <!-- Wide variant: Top and bottom full width, sides inset -->
    <div class="h-full flex flex-col">
        {#if topVisible}
            <div
                bind:this={topRef}
                onclick={() => setFocus(topDrawerId)}
                class="relative {topClass} bg-gray-100 border-b border-gray-300 transition-all duration-300 {ui.showFocusRing && topFocused ? 'ring-2 ring-inset ring-indigo-500' : ui.showFocusRing && topIsParent ? 'ring-2 ring-inset ring-amber-400' : ''}"
            >
                <div class="h-full overflow-auto">
                    {#if topContent}
                        {@render topContent({ state: topDrawer?.state })}
                    {:else}
                        <div class="p-4">Top Drawer</div>
                    {/if}
                </div>

                <button
                    onclick={toggleTop}
                    class="absolute -bottom-3 left-1/2 -translate-x-1/2 z-50 w-7 h-7 bg-white border border-gray-300 rounded-full flex items-center justify-center hover:bg-gray-50 transition-colors"
                >
                    <svg class="w-3 h-3 text-gray-600 transition-transform {topDrawer?.state === 'collapsed' ? '' : 'rotate-180'}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path>
                    </svg>
                </button>
            </div>
        {/if}

        <div class="flex-1 flex overflow-hidden">
            {#if leftVisible}
                <div
                    bind:this={leftRef}
                    onclick={() => setFocus(leftDrawerId)}
                    class="relative {leftClass} bg-white border-r border-gray-300 transition-all duration-300 {ui.showFocusRing && leftFocused ? 'ring-2 ring-inset ring-indigo-500' : ui.showFocusRing && leftIsParent ? 'ring-2 ring-inset ring-amber-400' : ''}"
                >
                    <div class="h-full overflow-auto">
                        {#if leftContent}
                            {@render leftContent({ state: leftDrawer?.state })}
                        {:else}
                            <div class="p-4">Left</div>
                        {/if}
                    </div>

                    <button
                        onclick={toggleLeft}
                        class="absolute -right-3.5 bottom-5 z-50 w-7 h-7 bg-white border border-gray-300 rounded-full flex items-center justify-center hover:bg-gray-50 transition-colors"
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
                    onclick={() => setFocus(mainDrawerId)}
                    class="{mainClass} bg-white overflow-auto transition-all duration-300 {ui.showFocusRing && mainFocused ? 'ring-2 ring-inset ring-indigo-500' : ui.showFocusRing && mainIsParent ? 'ring-2 ring-inset ring-amber-400' : ''}"
                >
                    {#if mainContent}
                        {@render mainContent()}
                    {:else}
                        <div class="p-8">Nested Main Content</div>
                    {/if}
                </div>
            {/if}

            {#if rightVisible}
                <div
                    bind:this={rightRef}
                    onclick={() => setFocus(rightDrawerId)}
                    class="relative {rightClass} bg-white border-l border-gray-300 transition-all duration-300 {ui.showFocusRing && rightFocused ? 'ring-2 ring-inset ring-indigo-500' : ui.showFocusRing && rightIsParent ? 'ring-2 ring-inset ring-amber-400' : ''}"
                >
                    <div class="h-full overflow-auto">
                        {#if rightContent}
                            {@render rightContent({ state: rightDrawer?.state })}
                        {:else}
                            <div class="p-4">Right</div>
                        {/if}
                    </div>

                    <button
                        onclick={toggleRight}
                        class="absolute -left-3.5 bottom-5 z-50 w-7 h-7 bg-white border border-gray-300 rounded-full flex items-center justify-center hover:bg-gray-50 transition-colors"
                    >
                        <svg class="w-3 h-3 text-gray-600 transition-transform {rightDrawer?.state === 'collapsed' ? '' : 'rotate-180'}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path>
                        </svg>
                    </button>
                </div>
            {/if}
        </div>

        {#if bottomVisible}
            <div
                bind:this={bottomRef}
                onclick={() => setFocus(bottomDrawerId)}
                class="relative {bottomClass} bg-gray-100 border-t border-gray-300 transition-all duration-300 {ui.showFocusRing && bottomFocused ? 'ring-2 ring-inset ring-indigo-500' : ui.showFocusRing && bottomIsParent ? 'ring-2 ring-inset ring-amber-400' : ''}"
            >
                <div class="h-full overflow-auto">
                    {#if bottomContent}
                        {@render bottomContent({ state: bottomDrawer?.state })}
                    {:else}
                        <div class="p-4">Bottom</div>
                    {/if}
                </div>

                <button
                    onclick={toggleBottom}
                    class="absolute -top-3 left-1/2 -translate-x-1/2 z-50 w-7 h-7 bg-white border border-gray-300 rounded-full flex items-center justify-center hover:bg-gray-50 transition-colors"
                >
                    <svg class="w-3 h-3 text-gray-600 transition-transform {bottomDrawer?.state === 'collapsed' ? '' : 'rotate-180'}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 15l7-7 7 7"></path>
                    </svg>
                </button>
            </div>
        {/if}
    </div>

{:else}
    <!-- Tall variant: Left and right full height, top and bottom inset -->
    <div class="h-full flex">
        {#if leftVisible}
            <div
                bind:this={leftRef}
                onclick={() => setFocus(leftDrawerId)}
                class="relative {leftClass} bg-white border-r border-gray-300 transition-all duration-300 {ui.showFocusRing && leftFocused ? 'ring-2 ring-inset ring-indigo-500' : ui.showFocusRing && leftIsParent ? 'ring-2 ring-inset ring-amber-400' : ''}"
            >
                <div class="h-full overflow-auto">
                    {#if leftContent}
                        {@render leftContent({ state: leftDrawer?.state })}
                    {:else}
                        <div class="p-4">Left</div>
                    {/if}
                </div>

                <button
                    onclick={toggleLeft}
                    class="absolute -right-3.5 bottom-5 z-50 w-7 h-7 bg-white border border-gray-300 rounded-full flex items-center justify-center hover:bg-gray-50 transition-colors"
                >
                    <svg class="w-3 h-3 text-gray-600 transition-transform {leftDrawer?.state === 'collapsed' ? 'rotate-180' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path>
                    </svg>
                </button>
            </div>
        {/if}

        <div class="flex-1 flex flex-col overflow-hidden">
            {#if topVisible}
                <div
                    bind:this={topRef}
                    onclick={() => setFocus(topDrawerId)}
                    class="relative {topClass} bg-gray-100 border-b border-gray-300 transition-all duration-300 {ui.showFocusRing && topFocused ? 'ring-2 ring-inset ring-indigo-500' : ui.showFocusRing && topIsParent ? 'ring-2 ring-inset ring-amber-400' : ''}"
                >
                    <div class="h-full overflow-auto">
                        {#if topContent}
                            {@render topContent({ state: topDrawer?.state })}
                        {:else}
                            <div class="p-4">Top</div>
                        {/if}
                    </div>

                    <button
                        onclick={toggleTop}
                        class="absolute -bottom-3 left-1/2 -translate-x-1/2 z-50 w-7 h-7 bg-white border border-gray-300 rounded-full flex items-center justify-center hover:bg-gray-50 transition-colors"
                    >
                        <svg class="w-3 h-3 text-gray-600 transition-transform {topDrawer?.state === 'collapsed' ? '' : 'rotate-180'}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path>
                        </svg>
                    </button>
                </div>
            {/if}

            {#if mainVisible}
                <div
                    bind:this={mainRef}
                    onclick={() => setFocus(mainDrawerId)}
                    class="{mainClass} bg-white overflow-auto transition-all duration-300 {ui.showFocusRing && mainFocused ? 'ring-2 ring-inset ring-indigo-500' : ui.showFocusRing && mainIsParent ? 'ring-2 ring-inset ring-amber-400' : ''}"
                >
                    {#if mainContent}
                        {@render mainContent()}
                    {:else}
                        <div class="p-8">Nested Main Content</div>
                    {/if}
                </div>
            {/if}

            {#if bottomVisible}
                <div
                    bind:this={bottomRef}
                    onclick={() => setFocus(bottomDrawerId)}
                    class="relative {bottomClass} bg-gray-100 border-t border-gray-300 transition-all duration-300 {ui.showFocusRing && bottomFocused ? 'ring-2 ring-inset ring-indigo-500' : ui.showFocusRing && bottomIsParent ? 'ring-2 ring-inset ring-amber-400' : ''}"
                >
                    <div class="h-full overflow-auto">
                        {#if bottomContent}
                            {@render bottomContent({ state: bottomDrawer?.state })}
                        {:else}
                            <div class="p-4">Bottom</div>
                        {/if}
                    </div>

                    <button
                        onclick={toggleBottom}
                        class="absolute -top-3 left-1/2 -translate-x-1/2 z-50 w-7 h-7 bg-white border border-gray-300 rounded-full flex items-center justify-center hover:bg-gray-50 transition-colors"
                    >
                        <svg class="w-3 h-3 text-gray-600 transition-transform {bottomDrawer?.state === 'collapsed' ? '' : 'rotate-180'}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 15l7-7 7 7"></path>
                        </svg>
                    </button>
                </div>
            {/if}
        </div>

        {#if rightVisible}
            <div
                bind:this={rightRef}
                onclick={() => setFocus(rightDrawerId)}
                class="relative {rightClass} bg-white border-l border-gray-300 transition-all duration-300 {ui.showFocusRing && rightFocused ? 'ring-2 ring-inset ring-indigo-500' : ui.showFocusRing && rightIsParent ? 'ring-2 ring-inset ring-amber-400' : ''}"
            >
                <div class="h-full overflow-auto">
                    {#if rightContent}
                        {@render rightContent({ state: rightDrawer?.state })}
                    {:else}
                        <div class="p-4">Right</div>
                    {/if}
                </div>

                <button
                    onclick={toggleRight}
                    class="absolute -left-3.5 bottom-5 z-50 w-7 h-7 bg-white border border-gray-300 rounded-full flex items-center justify-center hover:bg-gray-50 transition-colors"
                >
                    <svg class="w-3 h-3 text-gray-600 transition-transform {rightDrawer?.state === 'collapsed' ? '' : 'rotate-180'}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path>
                    </svg>
                </button>
            </div>
        {/if}
    </div>
{/if}
