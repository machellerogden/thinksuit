<script>
    import { JSONView } from '$lib/components/ui/index.js';

    let { node, depth = 0, toggleRawData, showRawData, sessionId = null } = $props();

    const eventKey = `event-${node.eventId || node.eventType}-${depth}`;
    const showData = $derived(showRawData.has(eventKey));
    const isTurnComplete = $derived(node.eventType === 'session.turn.complete');
</script>

<div class="max-w-6xl mx-auto mb-1">
    <div class="flex items-stretch group">
        <div class="flex-1 px-2 py-1 bg-gray-200 hover:bg-gray-300 text-gray-600 rounded text-xs">
            <span class="font-mono opacity-70">
                {node.eventType}
            </span>
            {#if node.msg}
                <span class="ml-2 opacity-60">
                    {node.msg}
                </span>
            {/if}
        </div>
        <div class="flex items-stretch gap-1 transition-all w-0 opacity-0 overflow-hidden group-hover:w-auto group-hover:opacity-100 group-hover:ml-1 pointer-events-none group-hover:pointer-events-auto">
            {#if isTurnComplete && node.index !== undefined && sessionId}
                <button
                    onclick={async () => {
                        const response = await fetch(`/api/sessions/${sessionId}/fork`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ forkPoint: node.index })
                        });
                        const result = await response.json();
                        if (result.success) {
                            window.location.hash = `#/run/sessions/${result.sessionId}/thread`;
                        }
                    }}
                    class="px-2 py-1 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded text-xs transition-colors"
                    title="Fork conversation from here"
                >
                    <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                    </svg>
                </button>
            {/if}
            <button
                onclick={() => toggleRawData(eventKey)}
                class="px-2 py-1 bg-gray-200 hover:bg-gray-300 text-gray-600 rounded text-xs"
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
    </div>
    {#if showData}
        <div class="mt-1">
            <JSONView data={node} />
        </div>
    {/if}
</div>
