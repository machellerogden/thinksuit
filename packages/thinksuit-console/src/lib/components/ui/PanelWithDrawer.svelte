<script>
    import { onMount } from 'svelte';

    let {
        orientation = 'horizontal', // 'horizontal' | 'vertical'
        position = 'right',          // 'right' | 'bottom' (where secondary pane appears)
        defaultSize = 400,
        minSize = 200,
        maxSize = 600,
        collapsible = true,
        collapsed = $bindable(false),
        size = $bindable(defaultSize),
        persistKey = null,           // localStorage key for size persistence
        dividerSize = 4,            // px width/height of divider
        primary,                     // primary content snippet
        secondary,                   // secondary content snippet
        class: className = '',
        onResize = null              // callback for size changes
    } = $props();

    let containerEl = $state(null);
    let isDragging = $state(false);
    let dragStartPos = $state(0);
    let dragStartSize = $state(0);

    // Computed layout properties
    const isHorizontal = $derived(orientation === 'horizontal');
    const isVertical = $derived(orientation === 'vertical');
    const isRightPosition = $derived(position === 'right' && isHorizontal);
    const isBottomPosition = $derived(position === 'bottom' && isVertical);

    // Load persisted size on mount
    onMount(() => {
        if (persistKey) {
            const saved = localStorage.getItem(`panelwithdrawer-${persistKey}`);
            if (saved) {
                const parsed = JSON.parse(saved);
                size = parsed.size || defaultSize;
                collapsed = parsed.collapsed || false;
            }
        }
    });

    // Persist size changes
    $effect(() => {
        if (persistKey && containerEl) {
            localStorage.setItem(`panelwithdrawer-${persistKey}`, JSON.stringify({
                size,
                collapsed
            }));
        }
    });

    function handleMouseDown(e) {
        isDragging = true;
        dragStartPos = isHorizontal ? e.clientX : e.clientY;
        dragStartSize = size;
        e.preventDefault();
    }

    function handleMouseMove(e) {
        if (!isDragging) return;

        const currentPos = isHorizontal ? e.clientX : e.clientY;
        let delta = currentPos - dragStartPos;

        // Reverse delta based on position
        if (isRightPosition || isBottomPosition) {
            delta = -delta;
        }

        let newSize = dragStartSize + delta;

        // Constrain to min/max
        newSize = Math.max(minSize, Math.min(maxSize, newSize));

        size = newSize;

        if (onResize) {
            onResize(newSize);
        }
    }

    function handleMouseUp() {
        if (!isDragging) return;
        isDragging = false;
    }

    function handleSelectStart(e) {
        if (isDragging) {
            e.preventDefault();
        }
    }


    function toggleCollapsed() {
        collapsed = !collapsed;
    }

    // Calculate actual sizes
    const primarySize = $derived(
        collapsed ? '100%' :
            isHorizontal ? `calc(100% - ${size}px - ${dividerSize}px)` :
                `calc(100% - ${size}px - ${dividerSize}px)`
    );

    const secondarySize = $derived(
        collapsed ? '0' : `${size}px`
    );

    // Build container styles
    const containerStyles = $derived(
        isHorizontal ?
            'display: flex; flex-direction: row; height: 100%; width: 100%;' :
                'display: flex; flex-direction: column; height: 100%; width: 100%;'
    );

    // Build pane styles
    const primaryStyles = $derived(
        isHorizontal ?
            `width: ${primarySize}; height: 100%; overflow: auto;` :
                `height: ${primarySize}; width: 100%; overflow: auto;`
    );

    const secondaryStyles = $derived(
        collapsed ? 'display: none;' :
            isHorizontal ?
                `width: ${secondarySize}; height: 100%; overflow: auto;` :
                `height: ${secondarySize}; width: 100%; overflow: auto;`
    );

    // Build divider styles
    const dividerStyles = $derived(
        collapsed ? 'display: none;' :
            isHorizontal ?
                `width: ${dividerSize}px; height: 100%; cursor: col-resize; flex-shrink: 0;` :
                `height: ${dividerSize}px; width: 100%; cursor: row-resize; flex-shrink: 0;`
    );
</script>

<!-- Global event listeners for drag handling -->
<svelte:document
    onmousemove={handleMouseMove}
    onmouseup={handleMouseUp}
    onselectstart={handleSelectStart}
/>

<div
    bind:this={containerEl}
    class="relative {className}"
    class:select-none={isDragging}
    style={containerStyles}
>
    {#if isRightPosition || isBottomPosition}
        <!-- Primary first when secondary is right/bottom -->
        <div style={primaryStyles}>
            {#if primary}
                {@render primary()}
            {/if}
        </div>

        {#if !collapsed}
            <div
                class="relative select-none bg-gray-300 hover:bg-gray-400 transition-colors {isDragging ? 'bg-blue-400' : ''}"
                style={dividerStyles}
                onmousedown={handleMouseDown}
                role="separator"
                aria-orientation={orientation}
                aria-label="Resize pane"
                tabindex="0"
            >
                {#if collapsible}
                    <button
                        onclick={toggleCollapsed}
                        class="absolute {isHorizontal ? 'top-2 left-1/2 -translate-x-1/2' : 'left-2 top-1/2 -translate-y-1/2'}
                            p-1 bg-white rounded transition-shadow z-10"
                        title={collapsed ? 'Expand panel' : 'Collapse panel'}
                    >
                        <svg class="w-3 h-3 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            {#if isHorizontal}
                                {#if isRightPosition}
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                        d={collapsed ? 'M15 19l-7-7 7-7' : 'M9 5l7 7-7 7'}></path>
                                {:else}
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                        d={collapsed ? 'M9 5l7 7-7 7' : 'M15 19l-7-7 7-7'}></path>
                                {/if}
                            {:else}
                                {#if isBottomPosition}
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                        d={collapsed ? 'M5 15l7-7 7 7' : 'M19 9l-7 7-7-7'}></path>
                                {:else}
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                        d={collapsed ? 'M19 9l-7 7-7-7' : 'M5 15l7-7 7 7'}></path>
                                {/if}
                            {/if}
                        </svg>
                    </button>
                {/if}
            </div>
        {/if}

        <div style={secondaryStyles}>
            {#if secondary && !collapsed}
                {@render secondary()}
            {/if}
        </div>
    {:else}
        <!-- Secondary first when it's left/top -->
        <div style={secondaryStyles}>
            {#if secondary && !collapsed}
                {@render secondary()}
            {/if}
        </div>

        {#if !collapsed}
            <div
                class="relative select-none bg-gray-300 hover:bg-gray-400 transition-colors {isDragging ? 'bg-blue-400' : ''}"
                style={dividerStyles}
                onmousedown={handleMouseDown}
                role="separator"
                aria-orientation={orientation}
                aria-label="Resize pane"
                tabindex="0"
            >
                {#if collapsible}
                    <button
                        onclick={toggleCollapsed}
                        class="absolute {isHorizontal ? 'top-2 left-1/2 -translate-x-1/2' : 'left-2 top-1/2 -translate-y-1/2'}
                            p-1 bg-white rounded transition-shadow z-10"
                        title={collapsed ? 'Expand panel' : 'Collapse panel'}
                    >
                        <svg class="w-3 h-3 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            {#if isHorizontal}
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                    d={collapsed ? 'M9 5l7 7-7 7' : 'M15 19l-7-7 7-7'}></path>
                            {:else}
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                    d={collapsed ? 'M19 9l-7 7-7-7' : 'M5 15l7-7 7 7'}></path>
                            {/if}
                        </svg>
                    </button>
                {/if}
            </div>
        {/if}

        <div style={primaryStyles}>
            {#if primary}
                {@render primary()}
            {/if}
        </div>
    {/if}
</div>

<style>
    :global(body.panel-drawer-dragging) {
        cursor: col-resize !important;
        user-select: none !important;
    }

    :global(body.panel-drawer-dragging-vertical) {
        cursor: row-resize !important;
    }
</style>
