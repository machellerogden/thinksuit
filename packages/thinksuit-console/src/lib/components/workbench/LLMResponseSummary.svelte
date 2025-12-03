<script>
    import { Badge } from '$lib/components/ui/index.js';
    import DrilldownModal from './DrilldownModal.svelte';

    let { event } = $props();

    // Modal state
    let showDetail = $state(false);
    let detailStack = $state([]);

    const usage = $derived(event.data?.usage);
    const promptTokens = $derived(usage?.prompt || usage?.input_tokens || 0);
    const completionTokens = $derived(usage?.completion || usage?.output_tokens || 0);
    const duration = $derived(event.data?.duration);
    const finishReason = $derived(event.data?.finishReason || event.data?.finish_reason || 'unknown');
    const output = $derived(event.data?.output || '');
    const toolCalls = $derived(event.data?.toolCalls || []);

    const finishVariant = $derived(
        finishReason === 'complete' || finishReason === 'end_turn' || finishReason === 'stop'
            ? 'success'
            : finishReason === 'tool_use'
                ? 'warning'
                : 'secondary'
    );

    // Current view from stack
    const currentView = $derived(detailStack[detailStack.length - 1] || null);

    function truncate(text, len = 200) {
        if (!text || typeof text !== 'string') return '';
        return text.length > len ? text.slice(0, len) + '...' : text;
    }

    function isTruncated(text, len) {
        return text && typeof text === 'string' && text.length > len;
    }

    function openDetail() {
        detailStack = [{ title: 'LLM Response', type: 'overview', data: null }];
        showDetail = true;
    }

    function drillToOutput() {
        detailStack = [...detailStack, { title: 'Output', type: 'output', data: output }];
    }

    function drillToToolCall(call, index) {
        const name = call.function?.name || call.name || `Tool ${index + 1}`;
        detailStack = [...detailStack, { title: name, type: 'toolCall', data: call }];
    }
</script>

<div class="text-sm">
    <div class="flex items-center justify-between">
        <div class="flex items-center gap-2 flex-wrap">
            <span class="text-gray-500">{promptTokens}→{completionTokens}</span>
            {#if duration}
                <span class="text-gray-400">{duration}ms</span>
            {/if}
            <Badge variant={finishVariant} size="xs">{finishReason}</Badge>
            {#if toolCalls.length > 0}
                <span class="text-gray-400">{toolCalls.length} tool calls</span>
            {/if}
        </div>
        <!-- Eye icon to open detail view -->
        <button
            type="button"
            class="text-gray-400 hover:text-gray-600 cursor-pointer px-1"
            onclick={openDetail}
            aria-label="View response details"
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
    {#if currentView?.type === 'overview'}
        <!-- Response overview -->
        <div class="space-y-4">
            <!-- Stats -->
            <div class="flex items-center gap-4 text-sm">
                <span class="text-gray-600">Tokens: {promptTokens} → {completionTokens}</span>
                {#if duration}
                    <span class="text-gray-600">Duration: {duration}ms</span>
                {/if}
                <Badge variant={finishVariant} size="sm">{finishReason}</Badge>
            </div>

            <!-- Output section -->
            {#if output}
                <div class="border-l-2 border-teal-200 pl-3 py-1">
                    <div class="font-medium text-teal-600 mb-1">Output</div>
                    {#if isTruncated(output, 300)}
                        <p
                            class="text-sm text-gray-600 cursor-pointer hover:text-teal-600 transition-colors"
                            onclick={drillToOutput}
                        >
                            {truncate(output, 300)}
                        </p>
                    {:else}
                        <p class="text-sm text-gray-600">{output}</p>
                    {/if}
                </div>
            {/if}

            <!-- Tool calls section -->
            {#if toolCalls.length > 0}
                <div>
                    <div class="font-medium text-teal-600 mb-2">Tool Calls ({toolCalls.length})</div>
                    <div class="space-y-2">
                        {#each toolCalls as call, i}
                            {@const callName = call.function?.name || call.name || 'unknown'}
                            {@const callArgs = call.function?.arguments || ''}
                            <div class="border-l-2 border-teal-200 pl-3 py-1">
                                <code class="text-sm text-gray-700 bg-gray-100 px-1 rounded">{callName}</code>
                                {#if callArgs}
                                    {#if isTruncated(callArgs, 100)}
                                        <p
                                            class="text-xs text-gray-500 mt-1 font-mono cursor-pointer hover:text-teal-600 transition-colors"
                                            onclick={() => drillToToolCall(call, i)}
                                        >
                                            {truncate(callArgs, 100)}
                                        </p>
                                    {:else}
                                        <p class="text-xs text-gray-500 mt-1 font-mono">{callArgs}</p>
                                    {/if}
                                {/if}
                            </div>
                        {/each}
                    </div>
                </div>
            {/if}

            {#if !output && toolCalls.length === 0}
                <div class="text-sm text-gray-400">No output or tool calls</div>
            {/if}
        </div>
    {:else if currentView?.type === 'output'}
        <!-- Full output content -->
        <pre class="whitespace-pre-wrap text-sm text-gray-700 font-mono bg-gray-50 p-4 rounded-lg overflow-x-auto">{currentView.data}</pre>
    {:else if currentView?.type === 'toolCall'}
        <!-- Full tool call content -->
        <div class="space-y-4">
            <div>
                <div class="text-sm font-medium text-gray-600 mb-2">Tool Name:</div>
                <code class="text-sm text-gray-700 bg-gray-100 px-2 py-1 rounded">{currentView.data.function?.name || currentView.data.name || 'unknown'}</code>
            </div>
            {#if currentView.data.function?.arguments || currentView.data.arguments}
                <div>
                    <div class="text-sm font-medium text-gray-600 mb-2">Arguments:</div>
                    <pre class="whitespace-pre-wrap text-sm text-gray-700 font-mono bg-gray-50 p-4 rounded-lg overflow-x-auto">{currentView.data.function?.arguments || currentView.data.arguments}</pre>
                </div>
            {/if}
        </div>
    {/if}
</DrilldownModal>
