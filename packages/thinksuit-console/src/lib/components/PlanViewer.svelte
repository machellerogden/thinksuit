<script>
    let { plan } = $props();

    const parsedPlan = $derived.by(() => {
        if (!plan) return null;
        try {
            return typeof plan === 'string' ? JSON.parse(plan) : plan;
        } catch {
            return null;
        }
    });
</script>

{#if parsedPlan}
    <div class="space-y-4 p-4 bg-white border border-gray-200 rounded-lg">
        <!-- Header -->
        <div class="flex items-center gap-3 pb-3 border-b border-gray-200">
            <div class="px-3 py-1 bg-indigo-600 text-white text-xs font-bold rounded">
                {parsedPlan.strategy.toUpperCase()}
            </div>
            <div class="text-sm font-semibold text-gray-900">
                {parsedPlan.name}
            </div>
        </div>

        <!-- Direct/Task Strategy -->
        {#if parsedPlan.strategy === 'direct' || parsedPlan.strategy === 'task'}
            <div class="space-y-3">
                {#if parsedPlan.role}
                    <div>
                        <div class="text-xs font-medium text-gray-500 mb-1">Role</div>
                        <div class="text-sm font-mono bg-gray-50 px-3 py-2 rounded border border-gray-200">
                            {parsedPlan.role}
                        </div>
                    </div>
                {/if}

                {#if parsedPlan.adaptations && parsedPlan.adaptations.length > 0}
                    <div>
                        <div class="text-xs font-medium text-gray-500 mb-1">Adaptations</div>
                        <div class="flex flex-wrap gap-1">
                            {#each parsedPlan.adaptations as adaptation}
                                <span class="px-2 py-1 bg-indigo-100 text-indigo-800 text-xs rounded">
                                    {adaptation}
                                </span>
                            {/each}
                        </div>
                    </div>
                {/if}

                {#if parsedPlan.tools && parsedPlan.tools.length > 0}
                    <div>
                        <div class="text-xs font-medium text-gray-500 mb-1">Tools</div>
                        <div class="flex flex-wrap gap-1">
                            {#each parsedPlan.tools as tool}
                                <span class="px-2 py-1 bg-green-100 text-green-800 text-xs font-mono rounded">
                                    {tool}
                                </span>
                            {/each}
                        </div>
                    </div>
                {/if}

                {#if parsedPlan.resolution && Object.keys(parsedPlan.resolution).length > 0}
                    <div>
                        <div class="text-xs font-medium text-gray-500 mb-1">Resolution Contract</div>
                        <div class="grid grid-cols-2 gap-2 text-xs">
                            {#if parsedPlan.resolution.maxCycles}
                                <div class="bg-gray-50 px-3 py-2 rounded border border-gray-200">
                                    <div class="text-gray-500">Max Cycles</div>
                                    <div class="font-mono font-semibold">{parsedPlan.resolution.maxCycles}</div>
                                </div>
                            {/if}
                            {#if parsedPlan.resolution.maxTokens}
                                <div class="bg-gray-50 px-3 py-2 rounded border border-gray-200">
                                    <div class="text-gray-500">Max Tokens</div>
                                    <div class="font-mono font-semibold">{parsedPlan.resolution.maxTokens}</div>
                                </div>
                            {/if}
                            {#if parsedPlan.resolution.maxToolCalls}
                                <div class="bg-gray-50 px-3 py-2 rounded border border-gray-200">
                                    <div class="text-gray-500">Max Tool Calls</div>
                                    <div class="font-mono font-semibold">{parsedPlan.resolution.maxToolCalls}</div>
                                </div>
                            {/if}
                            {#if parsedPlan.resolution.timeoutMs}
                                <div class="bg-gray-50 px-3 py-2 rounded border border-gray-200">
                                    <div class="text-gray-500">Timeout</div>
                                    <div class="font-mono font-semibold">{parsedPlan.resolution.timeoutMs}ms</div>
                                </div>
                            {/if}
                        </div>
                    </div>
                {/if}
            </div>
        {/if}

        <!-- Sequential Strategy -->
        {#if parsedPlan.strategy === 'sequential' && parsedPlan.sequence}
            <div class="space-y-3">
                <div class="text-xs font-medium text-gray-500">Sequence ({parsedPlan.sequence.length} steps)</div>
                <div class="space-y-2">
                    {#each parsedPlan.sequence as step, index}
                        <div class="bg-gray-50 p-3 rounded border border-gray-200">
                            <div class="flex items-center gap-2 mb-2">
                                <span class="text-xs font-mono text-gray-500">{index + 1}.</span>
                                <span class="text-sm font-mono font-semibold">{typeof step === 'string' ? step : step.role}</span>
                                {#if typeof step === 'object' && step.strategy}
                                    <span class="px-2 py-0.5 bg-blue-100 text-blue-800 text-xs rounded">{step.strategy}</span>
                                {/if}
                            </div>
                            {#if typeof step === 'object'}
                                {#if step.adaptations && step.adaptations.length > 0}
                                    <div class="ml-5 mb-2">
                                        <div class="flex flex-wrap gap-1">
                                            {#each step.adaptations as adaptation}
                                                <span class="px-2 py-0.5 bg-indigo-100 text-indigo-800 text-[10px] rounded">
                                                    {adaptation}
                                                </span>
                                            {/each}
                                        </div>
                                    </div>
                                {/if}
                                {#if step.tools && step.tools.length > 0}
                                    <div class="ml-5">
                                        <div class="flex flex-wrap gap-1">
                                            {#each step.tools as tool}
                                                <span class="px-2 py-0.5 bg-green-100 text-green-800 text-[10px] font-mono rounded">
                                                    {tool}
                                                </span>
                                            {/each}
                                        </div>
                                    </div>
                                {/if}
                            {/if}
                        </div>
                    {/each}
                </div>

                {#if parsedPlan.resultStrategy || parsedPlan.buildThread}
                    <div class="pt-2 border-t border-gray-200 flex gap-3 text-xs">
                        {#if parsedPlan.resultStrategy}
                            <div>
                                <span class="text-gray-500">Result Strategy:</span>
                                <span class="font-mono ml-1">{parsedPlan.resultStrategy}</span>
                            </div>
                        {/if}
                        {#if parsedPlan.buildThread}
                            <div>
                                <span class="px-2 py-0.5 bg-amber-100 text-amber-800 rounded">Build Thread</span>
                            </div>
                        {/if}
                    </div>
                {/if}
            </div>
        {/if}

        <!-- Parallel Strategy -->
        {#if parsedPlan.strategy === 'parallel' && parsedPlan.roles}
            <div class="space-y-3">
                <div class="text-xs font-medium text-gray-500">Parallel Branches ({parsedPlan.roles.length})</div>
                <div class="grid grid-cols-1 gap-2">
                    {#each parsedPlan.roles as branch}
                        <div class="bg-gray-50 p-3 rounded border border-gray-200">
                            <div class="flex items-center gap-2 mb-2">
                                <span class="text-sm font-mono font-semibold">{typeof branch === 'string' ? branch : branch.role}</span>
                                {#if typeof branch === 'object' && branch.strategy}
                                    <span class="px-2 py-0.5 bg-purple-100 text-purple-800 text-xs rounded">{branch.strategy}</span>
                                {/if}
                            </div>
                            {#if typeof branch === 'object'}
                                {#if branch.adaptations && branch.adaptations.length > 0}
                                    <div class="mb-2">
                                        <div class="flex flex-wrap gap-1">
                                            {#each branch.adaptations as adaptation}
                                                <span class="px-2 py-0.5 bg-indigo-100 text-indigo-800 text-[10px] rounded">
                                                    {adaptation}
                                                </span>
                                            {/each}
                                        </div>
                                    </div>
                                {/if}
                                {#if branch.tools && branch.tools.length > 0}
                                    <div>
                                        <div class="flex flex-wrap gap-1">
                                            {#each branch.tools as tool}
                                                <span class="px-2 py-0.5 bg-green-100 text-green-800 text-[10px] font-mono rounded">
                                                    {tool}
                                                </span>
                                            {/each}
                                        </div>
                                    </div>
                                {/if}
                            {/if}
                        </div>
                    {/each}
                </div>

                {#if parsedPlan.resultStrategy}
                    <div class="pt-2 border-t border-gray-200 text-xs">
                        <span class="text-gray-500">Result Strategy:</span>
                        <span class="font-mono ml-1">{parsedPlan.resultStrategy}</span>
                    </div>
                {/if}
            </div>
        {/if}

        <!-- Rationale -->
        {#if parsedPlan.rationale}
            <div class="pt-3 border-t border-gray-200">
                <div class="text-xs font-medium text-gray-500 mb-1">Rationale</div>
                <div class="text-xs text-gray-700 italic">
                    {parsedPlan.rationale}
                </div>
            </div>
        {/if}
    </div>
{:else}
    <div class="text-xs text-gray-500 italic p-4 bg-gray-50 rounded border border-gray-200">
        No plan to display
    </div>
{/if}
