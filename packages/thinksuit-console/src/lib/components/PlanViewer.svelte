<script>
    // Renders a plan.v1 node ({ type, ... }). Accepts either the raw string (JSON) at
    // the top level or a node object (used when recursing into children).
    import Self from './PlanViewer.svelte';

    let { plan, node = null } = $props();

    const current = $derived.by(() => {
        if (node) return node;
        if (!plan) return null;
        try {
            return typeof plan === 'string' ? JSON.parse(plan) : plan;
        } catch {
            return null;
        }
    });

    function typeColor(type) {
        if (type === 'sequence') return 'bg-blue-600';
        if (type === 'parallel') return 'bg-purple-600';
        return 'bg-indigo-600'; // task
    }
</script>

{#if current}
    <div class="space-y-3 p-4 bg-white border border-gray-200 rounded-lg">
        <!-- Header -->
        <div class="flex items-center gap-3 pb-3 border-b border-gray-200">
            <div class="px-3 py-1 {typeColor(current.type)} text-white text-xs font-bold rounded">
                {(current.type || 'task').toUpperCase()}
            </div>
            {#if current.name}
                <div class="text-sm font-semibold text-gray-900">{current.name}</div>
            {:else if current.role}
                <div class="text-sm font-mono text-gray-700">{current.role}</div>
            {/if}
        </div>

        {#if current.description}
            <div class="text-xs text-gray-600 italic">{current.description}</div>
        {/if}

        <!-- Task node -->
        {#if current.type === 'task' || !current.type}
            <div class="space-y-3">
                {#if current.role}
                    <div>
                        <div class="text-xs font-medium text-gray-500 mb-1">Role</div>
                        <div class="text-sm font-mono bg-gray-50 px-3 py-2 rounded border border-gray-200">
                            {current.role}
                        </div>
                    </div>
                {/if}

                {#if current.params?.adaptations && current.params.adaptations.length > 0}
                    <div>
                        <div class="text-xs font-medium text-gray-500 mb-1">Adaptations</div>
                        <div class="flex flex-wrap gap-1">
                            {#each current.params.adaptations as adaptation (adaptation)}
                                <span class="px-2 py-1 bg-indigo-100 text-indigo-800 text-xs rounded">
                                    {adaptation}
                                </span>
                            {/each}
                        </div>
                    </div>
                {/if}

                {#if current.tools && current.tools.length > 0}
                    <div>
                        <div class="text-xs font-medium text-gray-500 mb-1">Tools</div>
                        <div class="flex flex-wrap gap-1">
                            {#each current.tools as tool (tool)}
                                <span class="px-2 py-1 bg-green-100 text-green-800 text-xs font-mono rounded">
                                    {tool}
                                </span>
                            {/each}
                        </div>
                    </div>
                {/if}

                {#if current.input}
                    <div>
                        <div class="text-xs font-medium text-gray-500 mb-1">Input Template</div>
                        <div class="text-xs font-mono bg-gray-50 px-3 py-2 rounded border border-gray-200 whitespace-pre-wrap">{current.input}</div>
                    </div>
                {/if}

                <div class="grid grid-cols-3 gap-2 text-xs">
                    {#if current.maxRounds != null}
                        <div class="bg-gray-50 px-3 py-2 rounded border border-gray-200">
                            <div class="text-gray-500">Max Rounds</div>
                            <div class="font-mono font-semibold">{current.maxRounds}</div>
                        </div>
                    {/if}
                    {#if current.timeoutMs != null}
                        <div class="bg-gray-50 px-3 py-2 rounded border border-gray-200">
                            <div class="text-gray-500">Timeout</div>
                            <div class="font-mono font-semibold">{current.timeoutMs}ms</div>
                        </div>
                    {/if}
                    {#if current.params?.maxTokens != null}
                        <div class="bg-gray-50 px-3 py-2 rounded border border-gray-200">
                            <div class="text-gray-500">Max Tokens</div>
                            <div class="font-mono font-semibold">{current.params.maxTokens}</div>
                        </div>
                    {/if}
                </div>
            </div>
        {/if}

        <!-- Composite node (sequence | parallel) -->
        {#if current.type === 'sequence' || current.type === 'parallel'}
            <div class="space-y-2">
                <div class="flex items-center justify-between">
                    <div class="text-xs font-medium text-gray-500">
                        {current.type === 'sequence' ? 'Sequence' : 'Parallel'}
                        ({(current.children || []).length})
                    </div>
                    {#if current.resultStrategy}
                        <div class="text-xs">
                            <span class="text-gray-500">Result:</span>
                            <span class="font-mono ml-1">{current.resultStrategy}</span>
                        </div>
                    {/if}
                </div>
                <div class="space-y-2 ml-2 border-l-2 border-gray-200 pl-3">
                    {#each current.children || [] as child, index (index)}
                        <div>
                            <div class="text-xs font-mono text-gray-400 mb-1">{index + 1}.</div>
                            <Self node={child} />
                        </div>
                    {/each}
                </div>
            </div>
        {/if}
    </div>
{:else}
    <div class="text-xs text-gray-500 italic p-4 bg-gray-50 rounded border border-gray-200">
        No plan to display
    </div>
{/if}
