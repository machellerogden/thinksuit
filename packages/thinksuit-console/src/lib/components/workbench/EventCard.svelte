<script>
    import { Card, Badge } from '$lib/components/ui/index.js';
    import Modal from '$lib/components/ui/Modal.svelte';
    import JSONView from '$lib/components/ui/JSONView.svelte';
    import { formatDateTime } from '$lib/utils/time.js';

    let { event, children } = $props();
    let showInspector = $state(false);
</script>

<Card variant="default">
    <div class="flex items-center justify-between text-xs text-gray-500 mb-2">
        <div class="flex items-center gap-2">
            {#if event.event}
                <Badge variant="primary" size="xs">{event.event}</Badge>
            {/if}
            <span>{event.time ? formatDateTime(event.time) : 'No timestamp'}</span>
        </div>
        <!-- Raw JSON (curly braces icon) -->
        <button
            type="button"
            class="text-gray-400 hover:text-gray-600 cursor-pointer px-1"
            onclick={() => showInspector = true}
            aria-label="View raw data"
        >
            <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M7 8c-1.5 0-2.5 1-2.5 2v0c0 1-1 2-2 2v0c1 0 2 1 2 2v0c0 1 1 2 2.5 2M17 8c1.5 0 2.5 1 2.5 2v0c0 1 1 2 2 2v0c-1 0-2 1-2 2v0c0 1-1 2-2.5 2" />
            </svg>
        </button>
    </div>

    {@render children?.()}
</Card>

<!-- Raw JSON Modal -->
<Modal bind:open={showInspector} title={event.event || 'Event Data'}>
    <JSONView data={event} />
</Modal>
