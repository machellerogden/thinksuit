<script>
    let {
        open = $bindable(false),
        title = '',
        onClose = () => {},
        children
    } = $props();

    function handleClose() {
        open = false;
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
            <!-- Header -->
            <div class="flex items-center justify-between p-4 border-b border-gray-200">
                <h2 class="text-lg font-semibold text-gray-900">{title}</h2>
                <button
                    onclick={handleClose}
                    class="text-gray-400 hover:text-gray-600 transition-colors"
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
