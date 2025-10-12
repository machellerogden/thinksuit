<script>
    import { Badge } from '$lib/components/ui/index.js';

    let { node } = $props();

    const metadata = node.metadata || {};
    const completion = metadata.completion || {};
    const instructions = completion.instructions || {};

    // Get length level badge variant
    function getLengthVariant(level) {
        if (level === 'brief') return 'success';
        if (level === 'standard') return 'secondary';
        if (level === 'comprehensive') return 'warning';
        return 'default';
    }

    // Local state for expandable instruction sections
    let showSystem = $state(false);
    let showAdaptations = $state(false);
    let showLengthGuidance = $state(false);
    let showToolInstructions = $state(false);
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
                    {#each completion.adaptationKeys as key (key)}
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
                {#each completion.toolsAvailable as tool (tool)}
                    <span class="font-mono text-[10px] px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded">
                        {tool}
                    </span>
                {/each}
            </div>
        </div>
    {/if}

    <!-- Composed Instructions Detail -->
    {#if instructions && Object.keys(instructions).length > 0}
        <div class="space-y-2 pt-2 border-t border-gray-200">
            <div class="text-xs font-semibold text-gray-700">Composed Instructions</div>

            <!-- System Prompt -->
            {#if instructions.system}
                <div class="space-y-1">
                    <button
                        onclick={() => showSystem = !showSystem}
                        class="flex items-center gap-2 text-xs text-gray-600 hover:text-gray-800 transition-colors w-full"
                    >
                        <svg class="w-3 h-3 transition-transform {showSystem ? 'rotate-90' : ''}" fill="currentColor" viewBox="0 0 20 20">
                            <path d="M6 6L14 10L6 14V6Z" />
                        </svg>
                        <span class="font-medium">System Prompt</span>
                    </button>
                    {#if showSystem}
                        <div class="ml-5 bg-gray-50 rounded p-2 text-xs text-gray-700 max-h-64 overflow-y-auto border border-gray-200">
                            <pre class="whitespace-pre-wrap font-mono text-[10px]">{instructions.system}</pre>
                        </div>
                    {/if}
                </div>
            {/if}

            <!-- Primary Instruction -->
            {#if instructions.primary}
                <div class="ml-0 bg-blue-50 rounded p-2 text-xs text-blue-800 border border-blue-200">
                    <div class="font-medium text-blue-900 mb-1">Primary Instruction:</div>
                    <pre class="whitespace-pre-wrap font-mono text-[10px]">{instructions.primary}</pre>
                </div>
            {/if}

            <!-- Adaptations -->
            {#if instructions.adaptations}
                <div class="space-y-1">
                    <button
                        onclick={() => showAdaptations = !showAdaptations}
                        class="flex items-center gap-2 text-xs text-gray-600 hover:text-gray-800 transition-colors w-full"
                    >
                        <svg class="w-3 h-3 transition-transform {showAdaptations ? 'rotate-90' : ''}" fill="currentColor" viewBox="0 0 20 20">
                            <path d="M6 6L14 10L6 14V6Z" />
                        </svg>
                        <span class="font-medium">Adaptations</span>
                    </button>
                    {#if showAdaptations}
                        <div class="ml-5 bg-purple-50 rounded p-2 text-xs text-purple-800 max-h-64 overflow-y-auto border border-purple-200">
                            <pre class="whitespace-pre-wrap font-mono text-[10px]">{instructions.adaptations}</pre>
                        </div>
                    {/if}
                </div>
            {/if}

            <!-- Length Guidance -->
            {#if instructions.lengthGuidance}
                <div class="space-y-1">
                    <button
                        onclick={() => showLengthGuidance = !showLengthGuidance}
                        class="flex items-center gap-2 text-xs text-gray-600 hover:text-gray-800 transition-colors w-full"
                    >
                        <svg class="w-3 h-3 transition-transform {showLengthGuidance ? 'rotate-90' : ''}" fill="currentColor" viewBox="0 0 20 20">
                            <path d="M6 6L14 10L6 14V6Z" />
                        </svg>
                        <span class="font-medium">Length Guidance</span>
                    </button>
                    {#if showLengthGuidance}
                        <div class="ml-5 bg-amber-50 rounded p-2 text-xs text-amber-800 max-h-64 overflow-y-auto border border-amber-200">
                            <pre class="whitespace-pre-wrap font-mono text-[10px]">{instructions.lengthGuidance}</pre>
                        </div>
                    {/if}
                </div>
            {/if}

            <!-- Tool Instructions -->
            {#if instructions.toolInstructions}
                <div class="space-y-1">
                    <button
                        onclick={() => showToolInstructions = !showToolInstructions}
                        class="flex items-center gap-2 text-xs text-gray-600 hover:text-gray-800 transition-colors w-full"
                    >
                        <svg class="w-3 h-3 transition-transform {showToolInstructions ? 'rotate-90' : ''}" fill="currentColor" viewBox="0 0 20 20">
                            <path d="M6 6L14 10L6 14V6Z" />
                        </svg>
                        <span class="font-medium">Tool Instructions</span>
                    </button>
                    {#if showToolInstructions}
                        <div class="ml-5 bg-teal-50 rounded p-2 text-xs text-teal-800 max-h-64 overflow-y-auto border border-teal-200">
                            <pre class="whitespace-pre-wrap font-mono text-[10px]">{instructions.toolInstructions}</pre>
                        </div>
                    {/if}
                </div>
            {/if}
        </div>
    {/if}
</div>
