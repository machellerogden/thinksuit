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
</div>