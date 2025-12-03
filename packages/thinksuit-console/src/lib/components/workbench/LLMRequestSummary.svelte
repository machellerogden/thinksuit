<script>
    import { Badge } from '$lib/components/ui/index.js';
    import DrilldownModal from './DrilldownModal.svelte';

    let { event } = $props();

    // Modal state
    let showDetail = $state(false);
    let detailStack = $state([]);

    // Derived data
    const role = $derived(event.data?.role || 'unknown');
    const model = $derived(event.data?.model || 'unknown');
    const thread = $derived(event.data?.thread || []);
    const tools = $derived(event.data?.tools || []);

    // Current view from stack
    const currentView = $derived(detailStack[detailStack.length - 1] || null);

    function truncate(text, len = 100) {
        if (!text || typeof text !== 'string') return '';
        return text.length > len ? text.slice(0, len) + '...' : text;
    }

    function isTruncated(text, len) {
        return text && typeof text === 'string' && text.length > len;
    }

    function getThreadItemType(item) {
        if (item.type === 'reasoning') return 'reasoning';
        if (item.type === 'function_call') return 'function_call';
        if (item.type === 'function_call_output') return 'function_output';
        if (item.role) return 'message';
        return 'unknown';
    }

    function openDetail() {
        detailStack = [{ title: 'LLM Request', type: 'thread', data: null }];
        showDetail = true;
    }

    function drillToMessage(item, index) {
        const title = item.role || item.type || `Item ${index + 1}`;
        detailStack = [...detailStack, { title, type: 'message', data: item }];
    }
</script>

<div class="text-sm">
    <div class="flex items-center justify-between">
        <div class="flex items-center gap-2 flex-wrap">
            <Badge variant="info" size="xs">{role}</Badge>
            <span class="text-gray-500">{model}</span>
            <span class="text-gray-400">{thread.length} items</span>
            {#if tools.length > 0}
                <span class="text-gray-400">{tools.length} tools</span>
            {/if}
        </div>
        <!-- Eye icon to open detail view -->
        <button
            type="button"
            class="text-gray-400 hover:text-gray-600 cursor-pointer px-1"
            onclick={openDetail}
            aria-label="View thread details"
        >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path>
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path>
            </svg>
        </button>
    </div>
</div>

<!-- Detail Drilldown Modal -->
<DrilldownModal bind:open={showDetail} bind:stack={detailStack}>
    {#if currentView?.type === 'thread'}
        <!-- Thread overview -->
        <div class="space-y-3">
            {#each thread as item, i}
                {@const itemType = getThreadItemType(item)}
                <div class="border-l-2 border-indigo-200 pl-3 py-1">
                    {#if itemType === 'message'}
                        <div class="flex items-center gap-2 mb-1">
                            <span class="font-medium text-indigo-600">{item.role}</span>
                            {#if item.semantic}
                                <span class="text-xs text-gray-400">({item.semantic})</span>
                            {/if}
                        </div>
                        {#if isTruncated(item.content, 150)}
                            <p
                                class="text-sm text-gray-600 cursor-pointer hover:text-indigo-600 transition-colors"
                                onclick={() => drillToMessage(item, i)}
                            >
                                {truncate(item.content, 150)}
                            </p>
                        {:else}
                            <p class="text-sm text-gray-600">{item.content || ''}</p>
                        {/if}
                    {:else if itemType === 'reasoning'}
                        <span class="font-medium text-purple-600">Reasoning</span>
                        {#if item.summary?.length}
                            <p class="text-sm text-gray-500 mt-1">{item.summary.join(', ')}</p>
                        {/if}
                    {:else if itemType === 'function_call'}
                        <div class="flex items-center gap-2">
                            <span class="font-medium text-teal-600">Call:</span>
                            <code class="text-sm text-gray-700 bg-gray-100 px-1 rounded">{item.name}</code>
                        </div>
                        {#if item.arguments}
                            {#if isTruncated(item.arguments, 100)}
                                <p
                                    class="text-xs text-gray-500 mt-1 font-mono cursor-pointer hover:text-teal-600 transition-colors"
                                    onclick={() => drillToMessage(item, i)}
                                >
                                    {truncate(item.arguments, 100)}
                                </p>
                            {:else}
                                <p class="text-xs text-gray-500 mt-1 font-mono">{item.arguments}</p>
                            {/if}
                        {/if}
                    {:else if itemType === 'function_output'}
                        <span class="font-medium text-gray-500">Output:</span>
                        {#if isTruncated(item.output, 100)}
                            <span
                                class="text-sm text-gray-600 ml-1 cursor-pointer hover:text-teal-600 transition-colors"
                                onclick={() => drillToMessage(item, i)}
                            >
                                {truncate(item.output, 100)}
                            </span>
                        {:else}
                            <span class="text-sm text-gray-600 ml-1">{item.output || ''}</span>
                        {/if}
                    {:else}
                        <span class="text-gray-400">Unknown item type</span>
                    {/if}
                </div>
            {/each}
        </div>
    {:else if currentView?.type === 'message'}
        <!-- Full message content -->
        <div class="space-y-4">
            {#if currentView.data.role}
                <div class="flex items-center gap-2">
                    <Badge variant="info" size="sm">{currentView.data.role}</Badge>
                    {#if currentView.data.semantic}
                        <span class="text-sm text-gray-400">({currentView.data.semantic})</span>
                    {/if}
                </div>
            {/if}
            {#if currentView.data.content}
                <pre class="whitespace-pre-wrap text-sm text-gray-700 font-mono bg-gray-50 p-4 rounded-lg overflow-x-auto">{currentView.data.content}</pre>
            {:else if currentView.data.arguments}
                <div>
                    <div class="text-sm font-medium text-gray-600 mb-2">Arguments:</div>
                    <pre class="whitespace-pre-wrap text-sm text-gray-700 font-mono bg-gray-50 p-4 rounded-lg overflow-x-auto">{currentView.data.arguments}</pre>
                </div>
            {:else if currentView.data.output}
                <div>
                    <div class="text-sm font-medium text-gray-600 mb-2">Output:</div>
                    <pre class="whitespace-pre-wrap text-sm text-gray-700 font-mono bg-gray-50 p-4 rounded-lg overflow-x-auto">{currentView.data.output}</pre>
                </div>
            {/if}
        </div>
    {/if}
</DrilldownModal>
