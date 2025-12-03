<script>
    /**
     * DrilldownModal - A modal with stack-based breadcrumb navigation
     *
     * Usage:
     * <DrilldownModal bind:open={showDetail} bind:stack={viewStack}>
     *     {#if viewStack.length > 0}
     *         <!-- render based on viewStack[viewStack.length - 1] -->
     *     {/if}
     * </DrilldownModal>
     */

    let {
        open = $bindable(false),
        stack = $bindable([]),  // Array of { title, type, data }
        onClose = () => {},
        children
    } = $props();

    function handleClose() {
        open = false;
        stack = [];
        onClose();
    }

    function handleBackdropClick(e) {
        if (e.target === e.currentTarget) {
            handleClose();
        }
    }

    function handleKeydown(e) {
        if (e.key === 'Escape' && open) {
            handleClose();
        }
    }

    function navigateTo(index) {
        stack = stack.slice(0, index + 1);
    }

    function goBack() {
        if (stack.length > 1) {
            stack = stack.slice(0, -1);
        }
    }
</script>

<svelte:window onkeydown={handleKeydown} />

{#if open}
    <div
        class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-white/50 backdrop-blur-sm"
        onclick={handleBackdropClick}
        role="dialog"
        aria-modal="true"
    >
        <div class="bg-white rounded-lg shadow-xl/10 border border-gray-400 max-w-4xl w-full max-h-[90vh] flex flex-col">
            <!-- Header with back button and breadcrumbs -->
            <div class="flex items-center justify-between p-4 border-b border-gray-200">
                {#if stack.length > 1}
                    <button
                        onclick={goBack}
                        class="text-gray-400 hover:text-gray-600 transition-colors flex-shrink-0 mr-2"
                        aria-label="Go back"
                    >
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path>
                        </svg>
                    </button>
                {/if}
                <nav class="flex items-center gap-1 text-sm min-w-0 flex-1 mr-4">
                    {#each stack as crumb, i}
                        {#if i > 0}
                            <span class="text-gray-300 flex-shrink-0">/</span>
                        {/if}
                        {#if i === stack.length - 1}
                            <span class="text-gray-900 font-medium truncate">{crumb.title}</span>
                        {:else}
                            <button
                                class="text-gray-500 hover:text-indigo-600 transition-colors truncate"
                                onclick={() => navigateTo(i)}
                            >
                                {crumb.title}
                            </button>
                        {/if}
                    {/each}
                </nav>
                <button
                    onclick={handleClose}
                    class="text-gray-400 hover:text-gray-600 transition-colors flex-shrink-0"
                    aria-label="Close"
                >
                    <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                    </svg>
                </button>
            </div>

            <!-- Content -->
            <div class="overflow-y-auto flex-1 p-6">
                {@render children()}
            </div>
        </div>
    </div>
{/if}
