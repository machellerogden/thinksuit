<script>
    import { Badge } from '$lib/components/ui/index.js';

    let { node } = $props();

    const metadata = node.metadata || {};
    const completion = metadata.completion || {};

    // Calculate derived values
    const filteredOut = $derived((completion.inputCount || 0) - (completion.filteredCount || 0));
    const duplicatesRemoved = $derived((completion.filteredCount || 0) - (completion.deduplicatedCount || 0));
    const toolFactCount = $derived(
        (completion.totalFactCount || 0) -
        (completion.deduplicatedCount || 0) -
        (completion.configFactCount || 0)
    );

    // Group aggregated facts by type
    const factsByType = $derived.by(() => {
        const facts = completion.aggregatedFacts || [];
        const groups = {
            Signal: [],
            Config: [],
            ToolAvailability: [],
            Capability: [],
            Other: []
        };

        for (const fact of facts) {
            const type = fact.type || 'Other';
            if (groups[type]) {
                groups[type].push(fact);
            } else {
                groups.Other.push(fact);
            }
        }

        return groups;
    });

    // Local state for expandable sections
    let showSignals = $state(false);
    let showConfig = $state(false);
    let showTools = $state(false);
    let showCapabilities = $state(false);
</script>

<div class="space-y-3">
    <!-- Header -->
    <div class="flex items-center justify-between">
        <span class="text-xs font-semibold text-gray-700">Fact Aggregation</span>
        {#if completion.totalFactCount !== undefined}
            <Badge variant="info" size="sm">
                {completion.totalFactCount} facts
            </Badge>
        {/if}
    </div>

    <!-- Pipeline flow -->
    <div class="space-y-2 text-xs">
        <!-- Input -->
        <div class="flex items-center gap-2">
            <span class="text-gray-600 w-24">Input</span>
            <span class="font-mono font-semibold text-gray-800">
                {completion.inputCount || 0} signals
            </span>
        </div>

        <!-- Filter step -->
        <div class="ml-2 flex items-center gap-2">
            <span class="text-gray-400">↓</span>
            <span class="text-gray-500 text-[10px]">dimension policy</span>
        </div>
        <div class="flex items-center gap-2">
            <span class="text-gray-600 w-24">Filtered</span>
            <span class="font-mono font-semibold text-gray-800">
                {completion.filteredCount || 0} signals
            </span>
            {#if filteredOut > 0}
                <span class="text-gray-500">({filteredOut} filtered out)</span>
            {/if}
        </div>

        <!-- Dedup step -->
        <div class="ml-2 flex items-center gap-2">
            <span class="text-gray-400">↓</span>
            <span class="text-gray-500 text-[10px]">deduplication</span>
        </div>
        <div class="flex items-center gap-2">
            <span class="text-gray-600 w-24">Deduplicated</span>
            <span class="font-mono font-semibold text-gray-800">
                {completion.deduplicatedCount || 0} signals
            </span>
            {#if duplicatesRemoved > 0}
                <span class="text-gray-500">({duplicatesRemoved} duplicates removed)</span>
            {/if}
        </div>

        <!-- Enrichment step -->
        <div class="ml-2 flex items-center gap-2">
            <span class="text-gray-400">↓</span>
            <span class="text-gray-500 text-[10px]">enrichment</span>
        </div>
        <div class="space-y-1 ml-4">
            {#if completion.configFactCount > 0}
                <div class="flex items-center gap-2">
                    <span class="text-gray-500">+</span>
                    <span class="text-gray-600">Config facts</span>
                    <span class="font-mono text-gray-700">{completion.configFactCount}</span>
                </div>
            {/if}
            {#if toolFactCount > 0}
                <div class="flex items-center gap-2">
                    <span class="text-gray-500">+</span>
                    <span class="text-gray-600">Tool availability</span>
                    <span class="font-mono text-gray-700">{toolFactCount}</span>
                </div>
            {/if}
        </div>

        <!-- Total output -->
        <div class="flex items-center gap-2 pt-1 border-t border-gray-200">
            <span class="text-gray-600 w-24 font-semibold">Total Output</span>
            <span class="font-mono font-bold text-gray-900">
                {completion.totalFactCount || 0} facts
            </span>
        </div>
    </div>

    <!-- Aggregated Facts Detail -->
    {#if completion.aggregatedFacts && completion.aggregatedFacts.length > 0}
        <div class="space-y-2 pt-2 border-t border-gray-200">
            <div class="text-xs font-semibold text-gray-700">Aggregated Facts</div>

            <!-- Signals -->
            {#if factsByType.Signal.length > 0}
                <div class="space-y-1">
                    <button
                        onclick={() => showSignals = !showSignals}
                        class="flex items-center gap-2 text-xs text-gray-600 hover:text-gray-800 transition-colors w-full"
                    >
                        <svg class="w-3 h-3 transition-transform {showSignals ? 'rotate-90' : ''}" fill="currentColor" viewBox="0 0 20 20">
                            <path d="M6 6L14 10L6 14V6Z" />
                        </svg>
                        <span class="font-medium">Signals ({factsByType.Signal.length})</span>
                    </button>
                    {#if showSignals}
                        <div class="ml-5 space-y-1">
                            {#each factsByType.Signal as signal, i (i)}
                                <div class="flex items-center gap-2 text-xs">
                                    <span class="font-mono text-gray-500">{signal.dimension}:</span>
                                    <span class="font-medium text-gray-800">{signal.signal}</span>
                                    <span class="font-mono text-gray-500">({signal.confidence?.toFixed(2) || '--'})</span>
                                </div>
                            {/each}
                        </div>
                    {/if}
                </div>
            {/if}

            <!-- Tool Availability -->
            {#if factsByType.ToolAvailability.length > 0}
                <div class="space-y-1">
                    <button
                        onclick={() => showTools = !showTools}
                        class="flex items-center gap-2 text-xs text-gray-600 hover:text-gray-800 transition-colors w-full"
                    >
                        <svg class="w-3 h-3 transition-transform {showTools ? 'rotate-90' : ''}" fill="currentColor" viewBox="0 0 20 20">
                            <path d="M6 6L14 10L6 14V6Z" />
                        </svg>
                        <span class="font-medium">Available Tools</span>
                    </button>
                    {#if showTools}
                        <div class="ml-5 flex flex-wrap gap-1">
                            {#each factsByType.ToolAvailability[0]?.data?.tools || [] as tool (tool)}
                                <span class="text-xs font-mono px-1.5 py-0.5 bg-teal-50 text-teal-700 rounded">
                                    {tool}
                                </span>
                            {/each}
                        </div>
                    {/if}
                </div>
            {/if}

            <!-- Capabilities -->
            {#if factsByType.Capability.length > 0}
                <div class="space-y-1">
                    <button
                        onclick={() => showCapabilities = !showCapabilities}
                        class="flex items-center gap-2 text-xs text-gray-600 hover:text-gray-800 transition-colors w-full"
                    >
                        <svg class="w-3 h-3 transition-transform {showCapabilities ? 'rotate-90' : ''}" fill="currentColor" viewBox="0 0 20 20">
                            <path d="M6 6L14 10L6 14V6Z" />
                        </svg>
                        <span class="font-medium">Provider Capabilities ({factsByType.Capability.length})</span>
                    </button>
                    {#if showCapabilities}
                        <div class="ml-5 space-y-0.5">
                            {#each factsByType.Capability as capability, i (i)}
                                <div class="flex items-center gap-2 text-xs">
                                    <span class="font-mono text-gray-600">{capability.name}:</span>
                                    <span class="text-gray-800">{capability.data?.value ? '✓' : '✗'}</span>
                                </div>
                            {/each}
                        </div>
                    {/if}
                </div>
            {/if}

            <!-- Config Facts -->
            {#if factsByType.Config.length > 0}
                <div class="space-y-1">
                    <button
                        onclick={() => showConfig = !showConfig}
                        class="flex items-center gap-2 text-xs text-gray-600 hover:text-gray-800 transition-colors w-full"
                    >
                        <svg class="w-3 h-3 transition-transform {showConfig ? 'rotate-90' : ''}" fill="currentColor" viewBox="0 0 20 20">
                            <path d="M6 6L14 10L6 14V6Z" />
                        </svg>
                        <span class="font-medium">Config Facts ({factsByType.Config.length})</span>
                    </button>
                    {#if showConfig}
                        <div class="ml-5 space-y-0.5 max-h-48 overflow-y-auto">
                            {#each factsByType.Config as config, i (i)}
                                <div class="flex items-start gap-2 text-xs">
                                    <span class="font-mono text-gray-500 text-[10px]">{config.name}:</span>
                                    <span class="text-gray-700 text-[10px] break-all">
                                        {JSON.stringify(config.data?.value)}
                                    </span>
                                </div>
                            {/each}
                        </div>
                    {/if}
                </div>
            {/if}
        </div>
    {/if}
</div>
