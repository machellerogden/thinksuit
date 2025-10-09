<script>
    import { Badge, JSONView } from '$lib/components/ui/index.js';

    let { node } = $props();

    const metadata = node.metadata || {};
    const completion = metadata.completion || {};

    const usage = completion.usage || {};
    const totalTokens = (usage.prompt || 0) + (usage.completion || 0);

    // Format duration
    function formatDuration(ms) {
        if (!ms) return '--';
        if (ms < 1000) return `${ms}ms`;
        return `${(ms / 1000).toFixed(2)}s`;
    }

    // Calculate tokens per second
    function calculateTokensPerSec(tokens, durationMs) {
        if (!tokens || !durationMs) return null;
        return Math.round((tokens / durationMs) * 1000);
    }

    const tokensPerSec = calculateTokensPerSec(totalTokens, completion.duration);

    // Get finish reason badge variant
    function getFinishReasonVariant(reason) {
        if (reason === 'complete') return 'success';
        if (reason === 'length' || reason === 'max_tokens') return 'warning';
        if (reason === 'stop') return 'secondary';
        return 'danger';
    }

    // Message count
    const messageCount = metadata.thread?.length || 0;
    const responseLength = completion.output?.length || 0;

    // Expandable state
    let showPrompt = $state(false);
    let showResponse = $state(false);
</script>

<div class="space-y-3">
    <!-- Header with model and role -->
    <div class="flex items-center justify-between">
        <div class="flex items-center gap-2 flex-wrap">
            <span class="text-xs font-semibold text-gray-700">LLM Exchange</span>
            {#if completion.model || metadata.model}
                <Badge variant="info" size="sm">
                    {completion.model || metadata.model}
                </Badge>
            {/if}
            {#if metadata.role}
                <Badge variant="secondary" size="sm">
                    {metadata.role}
                </Badge>
            {/if}
            {#if metadata.temperature !== undefined}
                <span class="text-xs text-gray-500">
                    temp: {metadata.temperature}
                </span>
            {/if}
        </div>
        {#if completion.duration}
            <span class="text-xs text-gray-500 font-mono">
                {formatDuration(completion.duration)}
            </span>
        {/if}
    </div>

    <!-- Token Usage -->
    {#if usage.prompt !== undefined || usage.completion !== undefined}
        <div class="space-y-1.5">
            <div class="text-xs font-medium text-gray-600">Token Usage</div>
            <div class="space-y-1 ml-2 text-xs">
                <div class="flex items-center justify-between">
                    <div class="flex items-center gap-2">
                        <span class="text-gray-600">Prompt:</span>
                        <span class="font-mono font-semibold text-gray-800">{usage.prompt || 0}</span>
                    </div>
                </div>
                <div class="flex items-center justify-between">
                    <div class="flex items-center gap-2">
                        <span class="text-gray-600">Completion:</span>
                        <span class="font-mono font-semibold text-gray-800">{usage.completion || 0}</span>
                    </div>
                </div>
                <div class="flex items-center justify-between pt-1 border-t border-gray-200">
                    <div class="flex items-center gap-2">
                        <span class="text-gray-600 font-semibold">Total:</span>
                        <span class="font-mono font-bold text-gray-900">{totalTokens}</span>
                    </div>
                    {#if metadata.maxTokens}
                        <span class="text-gray-500">
                            / {metadata.maxTokens} budget
                        </span>
                    {/if}
                </div>
            </div>
        </div>
    {/if}

    <!-- Performance & Finish -->
    <div class="flex flex-wrap gap-3 text-xs">
        {#if tokensPerSec}
            <div class="flex items-center gap-1.5">
                <span class="text-gray-600">Speed:</span>
                <span class="font-mono text-gray-800">{tokensPerSec} tok/s</span>
            </div>
        {/if}
        {#if completion.finishReason}
            <div class="flex items-center gap-1.5">
                <span class="text-gray-600">Finish:</span>
                <Badge variant={getFinishReasonVariant(completion.finishReason)} size="sm">
                    {completion.finishReason}
                </Badge>
            </div>
        {/if}
    </div>

    <!-- Expandable Prompt -->
    {#if messageCount > 0}
        <div class="space-y-1">
            <button
                onclick={() => showPrompt = !showPrompt}
                class="flex items-center gap-2 text-xs text-gray-600 hover:text-gray-800 transition-colors"
            >
                <svg class="w-3 h-3 transition-transform {showPrompt ? 'rotate-90' : ''}" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M6 6L14 10L6 14V6Z" />
                </svg>
                <span class="font-medium">View Prompt ({messageCount} {messageCount === 1 ? 'message' : 'messages'})</span>
            </button>
            {#if showPrompt}
                <div class="ml-5 mt-2 space-y-2">
                    {#each metadata.thread || [] as message, i (i)}
                        <div class="text-xs bg-gray-50 rounded p-2 border border-gray-200">
                            {#if message.role}
                                <!-- Standard message with role -->
                                <div class="font-semibold text-gray-600 mb-1">{message.role}</div>
                                {#if message.content}
                                    <div class="text-gray-700 whitespace-pre-wrap font-mono text-[10px]">
                                        {message.content}
                                    </div>
                                {/if}
                            {:else if message.type === 'reasoning'}
                                <!-- Reasoning step -->
                                <div class="flex items-center gap-2 mb-1">
                                    <span class="font-semibold text-purple-600">reasoning</span>
                                    {#if message.id}
                                        <span class="text-gray-400 text-[9px] font-mono">{message.id.substring(0, 20)}...</span>
                                    {/if}
                                </div>
                                {#if message.summary && message.summary.length > 0}
                                    <div class="text-gray-700 text-[10px]">
                                        {message.summary.join(', ')}
                                    </div>
                                {/if}
                            {:else if message.type === 'function_call'}
                                <!-- Tool call -->
                                <div class="flex items-center gap-2 mb-1">
                                    <span class="font-semibold text-teal-600">tool call</span>
                                    <span class="font-mono text-teal-700">{message.name}</span>
                                    {#if message.status}
                                        <span class="text-xs px-1 py-0.5 rounded {message.status === 'completed' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}">
                                            {message.status}
                                        </span>
                                    {/if}
                                </div>
                                {#if message.arguments}
                                    <div class="text-gray-700 font-mono text-[10px] mt-1">
                                        {message.arguments}
                                    </div>
                                {/if}
                            {:else if message.type === 'function_call_output'}
                                <!-- Tool result -->
                                <div class="flex items-center gap-2 mb-1">
                                    <span class="font-semibold text-blue-600">tool result</span>
                                    {#if message.call_id}
                                        <span class="text-gray-400 text-[9px] font-mono">{message.call_id}</span>
                                    {/if}
                                </div>
                                {#if message.output}
                                    <div class="text-gray-700 whitespace-pre-wrap font-mono text-[10px] mt-1">
                                        {message.output}
                                    </div>
                                {/if}
                            {:else}
                                <!-- Unknown message type -->
                                <div class="font-semibold text-gray-500 mb-1">
                                    {message.type || 'unknown'}
                                </div>
                                <JSONView data={message} class="text-[9px]" />
                            {/if}
                        </div>
                    {/each}
                </div>
            {/if}
        </div>
    {/if}

    <!-- Expandable Response -->
    {#if responseLength > 0}
        <div class="space-y-1">
            <button
                onclick={() => showResponse = !showResponse}
                class="flex items-center gap-2 text-xs text-gray-600 hover:text-gray-800 transition-colors"
            >
                <svg class="w-3 h-3 transition-transform {showResponse ? 'rotate-90' : ''}" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M6 6L14 10L6 14V6Z" />
                </svg>
                <span class="font-medium">View Response ({responseLength.toLocaleString()} chars)</span>
            </button>
            {#if showResponse}
                <div class="ml-5 mt-2">
                    <div class="text-xs bg-gray-50 rounded p-2 border border-gray-200">
                        <div class="text-gray-700 whitespace-pre-wrap">
                            {completion.output}
                        </div>
                    </div>
                </div>
            {/if}
        </div>
    {/if}
</div>