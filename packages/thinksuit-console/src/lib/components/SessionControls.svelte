<script>
    import { Button, Input, Textarea, Checkbox, Badge } from '$lib/components/ui/index.js';
    import { getSession } from '$lib/stores/session.svelte.js';

    let {
        input = $bindable(''),
        trace = $bindable(false),
        cwd = $bindable(''),
        isSubmitting = $bindable(false),
        isCancelling = $bindable(false),
        onSubmit,
        onCancel
    } = $props();

    let textareaComponent = $state();

    const session = getSession();

    const latestMessage = $derived(
        session.entries.length > 0
            ? session.entries[session.entries.length - 1].msg || 'Processing'
            : 'Processing'
    );

    let isDisabled = $derived(
        !input.trim() ||
        isSubmitting ||
        session.isProcessing
    );

    function handleSubmit() {
        if (!input.trim() || isSubmitting) return;
        onSubmit?.();
    }

    function handleCancel() {
        onCancel?.();
    }

    // Expose focus method for parent components
    export function focus() {
        if (textareaComponent) {
            textareaComponent.focus();
        }
    }
</script>

<div class="border-t border-gray-200 bg-gradient-to-b from-white to-gray-50 p-4">
    {#if session.isProcessing}
        <div class="mb-4 max-w-6xl mx-auto">
            <div class="flex items-center justify-between gap-4 p-3 bg-amber-50 border border-amber-200 rounded-lg shadow-sm">
                <div class="flex items-center gap-3">
                    <div class="flex-shrink-0">
                        <svg class="w-5 h-5 text-amber-600 animate-spin" fill="none" viewBox="0 0 24 24">
                            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                    </div>
                    <div>
                        <p class="text-sm font-medium text-amber-900">Processing</p>
                        <p class="text-xs text-amber-700">{latestMessage}</p>
                    </div>
                </div>
                <Button
                    variant="danger"
                    size="sm"
                    onclick={handleCancel}
                    disabled={isCancelling}
                >
                    {isCancelling ? 'Cancelling...' : 'Cancel'}
                </Button>
            </div>
        </div>
    {/if}

    <form onsubmit={(e) => { e.preventDefault(); handleSubmit(); }} class="max-w-6xl mx-auto space-y-3">
        <!-- Working Directory Input -->
        <div class="flex items-center gap-3">
            <label for="cwd" class="text-sm font-medium text-gray-700 whitespace-nowrap min-w-fit">
                Working Directory
            </label>
            <Input
                id="cwd"
                bind:value={cwd}
                size="sm"
                placeholder="/path/to/project (optional)"
                disabled={isSubmitting}
            />
        </div>

        <!-- Message Input and Controls -->
        <div class="flex gap-3 items-start">
            <div class="flex-1">
                <Textarea
                    bind:this={textareaComponent}
                    id="input"
                    bind:value={input}
                    rows={3}
                    placeholder="Enter your message..."
                    disabled={isSubmitting}
                    onkeydown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            handleSubmit();
                        }
                    }}
                />
            </div>

            <div class="flex items-center gap-3">
                <Checkbox
                    bind:checked={trace}
                    label="Trace"
                    disabled={isSubmitting}
                />
                <Button
                    variant="primary"
                    size="md"
                    disabled={isDisabled}
                    onclick={handleSubmit}
                >
                    {#if isSubmitting}
                        <svg class="w-4 h-4 mr-2 animate-spin" fill="none" viewBox="0 0 24 24">
                            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Running...
                    {:else}
                        <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 3l9 18-9-6-9 6 9-18z"></path>
                        </svg>
                        Send
                    {/if}
                </Button>
            </div>
        </div>
    </form>
</div>
