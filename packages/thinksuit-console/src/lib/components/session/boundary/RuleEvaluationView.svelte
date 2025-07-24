<script>
    import { Badge } from '$lib/components/ui/index.js';

    let { node } = $props();

    const metadata = node.metadata || {};
    const completion = metadata.completion || {};

    // Format duration
    function formatDuration(ms) {
        if (!ms) return '--';
        if (ms < 1000) return `${ms}ms`;
        return `${(ms / 1000).toFixed(2)}s`;
    }

    // Count facts by type from factMap
    const factCounts = $derived.by(() => {
        const factMap = completion.factMap || {};
        const counts = {};
        for (const [type, facts] of Object.entries(factMap)) {
            if (Array.isArray(facts) && facts.length > 0) {
                counts[type] = facts.length;
            }
        }
        return counts;
    });
</script>

<div class="space-y-3">
    <!-- Header with summary stats -->
    <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
            <span class="text-xs font-semibold text-gray-700">Rule Evaluation</span>
            {#if completion.loopDetected}
                <Badge variant="danger" size="sm">
                    Loop Detected
                </Badge>
            {:else if completion.hasError}
                <Badge variant="danger" size="sm">
                    Error
                </Badge>
            {/if}
        </div>
        {#if completion.metrics?.duration}
            <span class="text-xs text-gray-500 font-mono">
                {formatDuration(completion.metrics.duration)}
            </span>
        {/if}
    </div>

    <!-- Summary line -->
    {#if completion.finalFactCount !== undefined && completion.ruleCount !== undefined}
        <div class="text-xs text-gray-600">
            <span class="font-semibold">{completion.finalFactCount}</span> facts produced from
            <span class="font-semibold">{completion.ruleCount}</span> rules
        </div>
    {/if}

    <!-- Rules Applied -->
    {#if completion.moduleRuleCount !== undefined || completion.policyRuleCount !== undefined || completion.systemRuleCount !== undefined}
        <div class="space-y-1.5">
            <div class="text-xs font-medium text-gray-600">Rules Applied</div>
            <div class="space-y-0.5 ml-2 text-xs text-gray-700">
                {#if completion.moduleRuleCount !== undefined}
                    <div class="flex items-center gap-2">
                        <span class="font-mono text-gray-600">•</span>
                        <span>Module rules:</span>
                        <span class="font-mono font-semibold">{completion.moduleRuleCount}</span>
                    </div>
                {/if}
                {#if completion.policyRuleCount !== undefined}
                    <div class="flex items-center gap-2">
                        <span class="font-mono text-gray-600">•</span>
                        <span>Policy rules:</span>
                        <span class="font-mono font-semibold">{completion.policyRuleCount}</span>
                    </div>
                {/if}
                {#if completion.systemRuleCount !== undefined}
                    <div class="flex items-center gap-2">
                        <span class="font-mono text-gray-600">•</span>
                        <span>System rules:</span>
                        <span class="font-mono font-semibold">{completion.systemRuleCount}</span>
                    </div>
                {/if}
            </div>
        </div>
    {/if}

    <!-- Facts Produced -->
    {#if Object.keys(factCounts).length > 0}
        <div class="space-y-1.5">
            <div class="text-xs font-medium text-gray-600">Facts Produced</div>
            <div class="space-y-0.5 ml-2 text-xs text-gray-700">
                {#each Object.entries(factCounts) as [type, count]}
                    <div class="flex items-center gap-2">
                        <span class="font-mono text-gray-600">•</span>
                        <span>{type}</span>
                        <span class="font-mono text-gray-500">({count})</span>
                    </div>
                {/each}
            </div>
        </div>
    {/if}

    <!-- Error message if present -->
    {#if completion.metrics?.error}
        <div class="text-xs text-red-600 bg-red-50 px-2 py-1 rounded">
            {completion.metrics.error}
        </div>
    {/if}
</div>