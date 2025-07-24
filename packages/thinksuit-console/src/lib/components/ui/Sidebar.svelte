<script>
    let {
        collapsed = $bindable(false),
        width = 'w-80',
        collapsedWidth = 'w-8',
        side = 'left',
        onToggle = () => {},
        class: className = '',
        children,
        collapsedContent = null
    } = $props();

    function handleToggle() {
        collapsed = !collapsed;
        onToggle(collapsed);
    }

    // Position button and arrow based on side
    let buttonPosition = $derived(side === 'left' ? '-right-3.5' : '-left-3.5');
    let borderClass = $derived(side === 'left' ? 'border-r' : 'border-l');
    let arrowRotation = $derived(side === 'left'
        ? (collapsed ? 'rotate-180' : '')
        : (collapsed ? '' : 'rotate-180')
    );
</script>

<div class="{collapsed ? collapsedWidth : width} bg-gray-100 {borderClass} border-gray-300 flex flex-col relative {className}">
    <button
        onclick={handleToggle}
        class="absolute {buttonPosition} bottom-5 z-20 w-7 h-7 bg-white border border-gray-300 rounded-full flex items-center justify-center hover:bg-gray-50 transition-colors"
        title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
    >
        <svg class="w-3 h-3 text-gray-600 transition-transform {arrowRotation}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path>
        </svg>
    </button>

    {#if collapsed && collapsedContent}
        {@render collapsedContent()}
    {:else if !collapsed && children}
        {@render children()}
    {/if}
</div>
