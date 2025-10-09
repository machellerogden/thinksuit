<script>
    let {
        collapsed = $bindable(false),
        height = $bindable(300),
        collapsedHeight = 'h-12',
        position = 'bottom',
        minHeight = 100,
        maxHeight = 600,
        onToggle = () => {},
        class: className = '',
        children,
        collapsedContent = null
    } = $props();

    let isDragging = $state(false);
    let startY = $state(0);
    let startHeight = $state(0);

    function handleToggle() {
        collapsed = !collapsed;
        onToggle(collapsed);
    }

    function handleResizeStart(event) {
        isDragging = true;
        startY = event.clientY;
        startHeight = height;
        event.preventDefault();
    }

    function handleResizeMove(event) {
        if (!isDragging) return;

        const deltaY = position === 'bottom'
            ? startY - event.clientY  // Positive when dragging up
            : event.clientY - startY; // Positive when dragging down

        const newHeight = startHeight + deltaY;
        height = Math.max(minHeight, Math.min(maxHeight, newHeight));
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

    // Position toggle button based on position
    let buttonVerticalPosition = $derived(position === 'bottom' ? '-top-3' : '-bottom-3');
    let borderClass = $derived(position === 'bottom' ? 'border-t' : 'border-b');
    let arrowRotation = $derived(position === 'bottom'
        ? (collapsed ? '' : 'rotate-180')
        : (collapsed ? 'rotate-180' : '')
    );

    // Resize handle positioning
    let resizeHandleBorder = $derived(position === 'bottom' ? 'border-t' : 'border-b');
</script>

<div class="relative {collapsed ? collapsedHeight : 'pt-7'} bg-gray-100 {borderClass} border-gray-300 transition-all duration-300 {className}">
    <!-- Toggle Button -->
    <button
        onclick={handleToggle}
        class="absolute {buttonVerticalPosition} left-1/2 -translate-x-1/2 z-20 w-7 h-7 bg-white border border-gray-300 rounded-full flex items-center justify-center hover:bg-gray-50 transition-colors"
        title={collapsed ? 'Show drawer' : 'Hide drawer'}
        aria-label={collapsed ? 'Show drawer' : 'Hide drawer'}
    >
        <svg class="w-3 h-3 text-gray-600 transition-transform {arrowRotation}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 15l7-7 7 7"></path>
        </svg>
    </button>

    {#if !collapsed}
        <!-- Resize Handle -->
        <div
            class="resize-handle group bg-gray-100 hover:bg-gray-200 {resizeHandleBorder} border-gray-300 cursor-ns-resize flex items-center justify-center h-4 select-none"
            onmousedown={handleResizeStart}
            role="separator"
            aria-label="Resize drawer"
        >
            <div class="w-12 h-1 bg-gray-400 group-hover:bg-gray-600 rounded"></div>
        </div>
    {/if}

    <!-- Drawer Content -->
    <div class="overflow-hidden {collapsed ? 'hidden' : ''}">
        {#if !collapsed && children}
            {@render children({ height })}
        {/if}
    </div>

    {#if collapsed && collapsedContent}
        {@render collapsedContent()}
    {/if}
</div>
