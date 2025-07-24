<script>
    import { JSONView } from '$lib/components/ui/index.js';

    let { node, depth = 0, toggleRawData, showRawData } = $props();

    const eventKey = `event-${node.eventId || node.eventType}-${depth}`;
    const showData = $derived(showRawData.has(eventKey));
</script>

<div class="max-w-6xl mx-auto mb-1">
    <div class="flex items-stretch gap-1">
        <div class="flex-1 px-2 py-1 bg-gray-50 text-gray-600 rounded text-xs">
            <span class="font-mono opacity-70">
                {node.eventType}
            </span>
            {#if node.msg}
                <span class="ml-2 opacity-60">
                    {node.msg}
                </span>
            {/if}
        </div>
        <button
            onclick={() => toggleRawData(eventKey)}
            class="px-2 py-1 bg-gray-50 hover:bg-gray-100 text-gray-600 rounded text-xs transition-colors"
            title={showData ? 'Show normal view' : 'Show raw data'}
        >
            {#if showData}
                <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
            {:else}
                <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                </svg>
            {/if}
        </button>
    </div>
    {#if showData}
        <div class="mt-1">
            <JSONView data={node} />
        </div>
    {/if}
</div>
