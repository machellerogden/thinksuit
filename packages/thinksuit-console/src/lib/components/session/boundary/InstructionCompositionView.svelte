<script>
    import { Badge } from '$lib/components/ui/index.js';

    let { node } = $props();

    const metadata = node.metadata || {};
    const completion = metadata.completion || {};

    // Get length level badge variant
    function getLengthVariant(level) {
        if (level === 'brief') return 'success';
        if (level === 'standard') return 'secondary';
        if (level === 'comprehensive') return 'warning';
        return 'default';
    }
</script>

<div class="space-y-3">
    <!-- Header -->
    <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
            <span class="text-xs font-semibold text-gray-700">Instruction Composition</span>
            {#if completion.role}
                <Badge variant="info" size="sm">
                    {completion.role}
                </Badge>
            {/if}
        </div>
        {#if completion.lengthLevel}
            <Badge variant={getLengthVariant(completion.lengthLevel)} size="sm">
                {completion.lengthLevel}
            </Badge>
        {/if}
    </div>

    <!-- Token Budget Calculation Flow -->
    {#if completion.baseTokens !== undefined && completion.maxTokens !== undefined}
        <div class="space-y-2 text-xs">
            <div class="text-xs font-medium text-gray-600">Token Budget</div>

            <!-- Base tokens -->
            <div class="flex items-center gap-2">
                <span class="text-gray-600 w-24">Base</span>
                <span class="font-mono font-semibold text-gray-800">
                    {completion.baseTokens} tokens
                </span>
            </div>

            <!-- Multiplier -->
            {#if completion.tokenMultiplier !== undefined && completion.tokenMultiplier !== 1}
                <div class="ml-2 flex items-center gap-2">
                    <span class="text-gray-400">×</span>
                    <span class="text-gray-500 text-[10px]">multiplier</span>
                </div>
                <div class="flex items-center gap-2">
                    <span class="text-gray-600 w-24">Adjusted by</span>
                    <span class="font-mono text-gray-700">
                        {completion.tokenMultiplier}×
                    </span>
                </div>
            {/if}

            <!-- Final budget -->
            <div class="flex items-center gap-2 pt-1 border-t border-gray-200">
                <span class="text-gray-600 w-24 font-semibold">Final Budget</span>
                <span class="font-mono font-bold text-gray-900">
                    {completion.maxTokens} tokens
                </span>
            </div>
        </div>
    {/if}

    <!-- Adaptations Applied -->
    {#if completion.adaptationKeys && completion.adaptationKeys.length > 0}
        <div class="space-y-1.5">
            <div class="text-xs font-medium text-gray-600">Prompt Customization</div>
            <div class="space-y-1 ml-2">
                <div class="flex items-center gap-2 text-xs text-gray-700">
                    <span class="font-mono font-semibold">{completion.adaptationKeys.length}</span>
                    {completion.adaptationKeys.length === 1 ? 'adaptation' : 'adaptations'} applied
                </div>
                <div class="flex flex-wrap gap-1 ml-2">
                    {#each completion.adaptationKeys as key}
                        <span class="font-mono text-[10px] px-1.5 py-0.5 bg-purple-50 text-purple-700 rounded">
                            {key}
                        </span>
                    {/each}
                </div>
            </div>
        </div>
    {:else if completion.adaptationCount !== undefined}
        <div class="space-y-1.5">
            <div class="text-xs font-medium text-gray-600">Prompt Customization</div>
            <div class="flex items-center gap-2 ml-2 text-xs">
                <span class="font-mono text-gray-600">•</span>
                <span class="text-gray-700">
                    <span class="font-mono font-semibold">{completion.adaptationCount}</span>
                    {completion.adaptationCount === 1 ? 'adaptation' : 'adaptations'} applied
                </span>
            </div>
        </div>
    {/if}

    <!-- Tools Available -->
    {#if completion.toolsAvailable && completion.toolsAvailable.length > 0}
        <div class="space-y-1.5">
            <div class="text-xs font-medium text-gray-600">Tools Available</div>
            <div class="flex flex-wrap gap-1 ml-2">
                {#each completion.toolsAvailable as tool}
                    <span class="font-mono text-[10px] px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded">
                        {tool}
                    </span>
                {/each}
            </div>
        </div>
    {/if}
</div>