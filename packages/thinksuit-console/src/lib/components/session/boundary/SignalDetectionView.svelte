<script>
    import { Badge } from '$lib/components/ui/index.js';

    let { node } = $props();

    const metadata = node.metadata || {};
    const completion = metadata.completion || {};
    const signals = completion.signals || [];

    // Group signals by dimension
    const signalsByDimension = $derived.by(() => {
        const groups = {};
        for (const signal of signals) {
            if (!groups[signal.dimension]) {
                groups[signal.dimension] = [];
            }
            groups[signal.dimension].push(signal);
        }
        // Sort signals within each dimension by confidence (descending)
        for (const dimension in groups) {
            groups[dimension].sort((a, b) => (b.confidence || 0) - (a.confidence || 0));
        }
        return groups;
    });

    // Format duration
    function formatDuration(ms) {
        if (!ms) return '--';
        if (ms < 1000) return `${ms}ms`;
        return `${(ms / 1000).toFixed(2)}s`;
    }

    // Get mode badge variant
    function getModeVariant(mode) {
        if (mode === 'llm-enhanced') return 'info';
        if (mode === 'regex-only') return 'secondary';
        return 'default';
    }

    // Get profile badge variant
    function getProfileVariant(profile) {
        if (profile === 'fast') return 'success';
        if (profile === 'balanced') return 'warning';
        if (profile === 'thorough') return 'danger';
        return 'default';
    }
</script>

<div class="space-y-3">
    <!-- Header with summary stats -->
    <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
            <span class="text-xs font-semibold text-gray-700">Signal Detection</span>
            {#if completion.factCount !== undefined}
                <Badge variant="info" size="sm">
                    {completion.factCount} signal{completion.factCount !== 1 ? 's' : ''}
                </Badge>
            {/if}
        </div>
        {#if completion.duration}
            <span class="text-xs text-gray-500 font-mono">
                {formatDuration(completion.duration)}
            </span>
        {/if}
    </div>

    <!-- Configuration details -->
    <div class="flex flex-wrap gap-2 items-center">
        {#if metadata.mode}
            <div class="flex items-center gap-1.5">
                <span class="text-xs text-gray-500">Mode:</span>
                <Badge variant={getModeVariant(metadata.mode)} size="sm">
                    {metadata.mode}
                </Badge>
            </div>
        {/if}
        {#if metadata.profile}
            <div class="flex items-center gap-1.5">
                <span class="text-xs text-gray-500">Profile:</span>
                <Badge variant={getProfileVariant(metadata.profile)} size="sm">
                    {metadata.profile}
                </Badge>
            </div>
        {/if}
        {#if metadata.budgetMs !== undefined}
            <div class="flex items-center gap-1.5">
                <span class="text-xs text-gray-500">Budget:</span>
                <span class="text-xs font-mono text-gray-700">
                    {formatDuration(metadata.budgetMs)}
                </span>
            </div>
        {/if}
    </div>

    <!-- Signals grouped by dimension -->
    {#if Object.keys(signalsByDimension).length > 0}
        <div class="space-y-3">
            {#each Object.entries(signalsByDimension) as [dimension, dimensionSignals] (dimension)}
                <div class="space-y-1.5">
                    <div class="text-xs font-semibold text-gray-700">{dimension}</div>
                    <div class="space-y-1 ml-2">
                        {#each dimensionSignals as signal, i (i)}
                            <div class="flex items-center gap-2 text-xs">
                                <span class="font-mono text-gray-600">•</span>
                                <span class="font-medium text-gray-800">{signal.signal}</span>
                                <span class="font-mono text-gray-500">({signal.confidence.toFixed(2)})</span>
                                {#if signal.provenance?.durationMs}
                                    <span class="text-gray-400 font-mono text-[10px]">
                                        {formatDuration(signal.provenance.durationMs)}
                                    </span>
                                {/if}
                            </div>
                        {/each}
                    </div>
                </div>
            {/each}
        </div>
    {/if}
</div>