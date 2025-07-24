<script>
    import { Badge } from '$lib/components/ui/index.js';

    let { node } = $props();

    const metadata = node.metadata || {};
    const completion = metadata.completion || {};

    // Extract tool info from start event
    const tool = metadata.tool || 'unknown';
    const args = metadata.args || '';

    // Extract result and status from completion
    const success = completion.success;
    const denied = completion.denied;
    const error = completion.error;

    // Find child events for additional context
    const children = node.children || [];
    const executedEvent = children.find(child => child.eventType === 'execution.tool.executed');
    const approvedEvent = children.find(child => child.eventType === 'execution.tool.approved');
    const deniedEvent = children.find(child => child.eventType === 'execution.tool.denied');

    const result = executedEvent?.data?.result?.result || '';
    const autoApproved = !approvedEvent && !deniedEvent && success; // Infer auto-approval

    // Calculate duration
    const duration = node.startTime && node.endTime
        ? new Date(node.endTime) - new Date(node.startTime)
        : null;

    function formatDuration(ms) {
        if (!ms) return '--';
        if (ms < 1000) return `${ms}ms`;
        return `${(ms / 1000).toFixed(2)}s`;
    }

    // Local state for result expansion
    let resultExpanded = $state(false);
</script>

<div class="space-y-3">
    <!-- Header with tool name and status -->
    <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
            <span class="text-xs font-semibold text-gray-700">Tool Execution</span>
            {#if denied}
                <Badge variant="danger" size="sm">Denied</Badge>
            {:else if error}
                <Badge variant="danger" size="sm">Error</Badge>
            {:else if success}
                <Badge variant="success" size="sm">Success</Badge>
            {/if}
        </div>
        {#if duration}
            <span class="text-xs text-gray-500 font-mono">
                {formatDuration(duration)}
            </span>
        {/if}
    </div>

    <!-- Tool name -->
    <div class="space-y-1">
        <div class="text-sm font-mono font-semibold text-gray-800">
            {tool}
        </div>
    </div>

    <!-- Arguments -->
    {#if args}
        <div class="space-y-1.5">
            <div class="text-xs font-medium text-gray-600">Arguments</div>
            <div class="ml-2 px-2 py-1.5 bg-gray-50 rounded border border-gray-200">
                <pre class="text-xs font-mono text-gray-700 whitespace-pre-wrap">{args}</pre>
            </div>
        </div>
    {/if}

    <!-- Approval Status -->
    <div class="space-y-1.5">
        <div class="text-xs font-medium text-gray-600">Approval</div>
        <div class="ml-2 text-xs text-gray-700">
            {#if denied}
                <span class="text-red-600">Denied by user</span>
            {:else if autoApproved}
                <span class="text-gray-500">Auto-approved</span>
            {:else if approvedEvent}
                <span class="text-green-600">Approved by user</span>
            {:else}
                <span class="text-gray-500">Unknown</span>
            {/if}
        </div>
    </div>

    <!-- Error Message -->
    {#if error}
        <div class="space-y-1.5">
            <div class="text-xs font-medium text-red-600">Error</div>
            <div class="ml-2 px-2 py-1.5 bg-red-50 rounded border border-red-200">
                <pre class="text-xs font-mono text-red-700 whitespace-pre-wrap">{error}</pre>
            </div>
        </div>
    {/if}

    <!-- Result (collapsed by default) -->
    {#if result && !denied}
        <div class="space-y-1.5">
            <button
                onclick={() => resultExpanded = !resultExpanded}
                class="flex items-center gap-2 text-xs font-medium text-gray-600 hover:text-gray-800 transition-colors"
            >
                <svg class="w-3 h-3 transition-transform {resultExpanded ? 'rotate-90' : ''}" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M6 6L14 10L6 14V6Z" />
                </svg>
                Result ({result.length} chars)
            </button>
            {#if resultExpanded}
                <div class="ml-2 px-2 py-1.5 bg-gray-50 rounded border border-gray-200 max-h-96 overflow-y-auto">
                    <pre class="text-xs font-mono text-gray-700 whitespace-pre-wrap">{result}</pre>
                </div>
            {/if}
        </div>
    {/if}
</div>
