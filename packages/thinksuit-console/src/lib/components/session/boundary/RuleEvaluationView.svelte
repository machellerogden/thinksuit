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

    // Local state for expandable fact types
    let expandedTypes = $state(new Set());

    function toggleType(type) {
        if (expandedTypes.has(type)) {
            expandedTypes.delete(type);
        } else {
            expandedTypes.add(type);
        }
        expandedTypes = new Set(expandedTypes); // Trigger reactivity
    }
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

    <!-- Facts Produced (Summary) -->
    {#if Object.keys(factCounts).length > 0}
        <div class="space-y-1.5">
            <div class="text-xs font-medium text-gray-600">Facts Produced</div>
            <div class="space-y-0.5 ml-2 text-xs text-gray-700">
                {#each Object.entries(factCounts) as [type, count] (type)}
                    <div class="flex items-center gap-2">
                        <span class="font-mono text-gray-600">•</span>
                        <span>{type}</span>
                        <span class="font-mono text-gray-500">({count})</span>
                    </div>
                {/each}
            </div>
        </div>
    {/if}

    <!-- Detailed Facts by Type -->
    {#if completion.factMap && Object.keys(completion.factMap).length > 0}
        <div class="space-y-2 pt-2 border-t border-gray-200">
            <div class="text-xs font-semibold text-gray-700">Fact Details</div>

            {#each Object.entries(completion.factMap) as [type, facts] (type)}
                {#if Array.isArray(facts) && facts.length > 0}
                    <div class="space-y-1">
                        <button
                            onclick={() => toggleType(type)}
                            class="flex items-center gap-2 text-xs text-gray-600 hover:text-gray-800 transition-colors w-full"
                        >
                            <svg class="w-3 h-3 transition-transform {expandedTypes.has(type) ? 'rotate-90' : ''}" fill="currentColor" viewBox="0 0 20 20">
                                <path d="M6 6L14 10L6 14V6Z" />
                            </svg>
                            <span class="font-medium">{type} ({facts.length})</span>
                        </button>

                        {#if expandedTypes.has(type)}
                            <div class="ml-5 space-y-2">
                                {#if type === 'ExecutionPlan'}
                                    {#each facts as plan, i (i)}
                                        <div class="bg-gray-50 rounded p-2 text-xs border border-gray-200">
                                            <div class="font-semibold text-gray-800">{plan.name || 'Unnamed Plan'}</div>
                                            <div class="flex flex-wrap gap-2 mt-1">
                                                <span class="text-gray-600">Strategy: <span class="font-mono">{plan.strategy}</span></span>
                                                {#if plan.role}
                                                    <span class="text-gray-600">Role: <span class="font-mono">{plan.role}</span></span>
                                                {/if}
                                                {#if plan.tools && plan.tools.length > 0}
                                                    <span class="text-gray-600">Tools: <span class="font-mono">{plan.tools.length}</span></span>
                                                {/if}
                                            </div>
                                        </div>
                                    {/each}
                                {:else if type === 'RoleSelection'}
                                    {#each facts as role, i (i)}
                                        <div class="flex items-center gap-2 text-xs">
                                            <span class="font-mono text-gray-700">{role.role}</span>
                                            {#if role.confidence}
                                                <span class="text-gray-500">({role.confidence.toFixed(2)})</span>
                                            {/if}
                                            {#if role.reason}
                                                <span class="text-gray-600 italic text-[10px]">- {role.reason}</span>
                                            {/if}
                                        </div>
                                    {/each}
                                {:else if type === 'Adaptation'}
                                    {#each facts as adaptation, i (i)}
                                        <div class="bg-purple-50 rounded px-2 py-1 text-xs border border-purple-200">
                                            <span class="font-mono text-purple-800">{adaptation.key}</span>
                                            {#if adaptation.template}
                                                <div class="text-purple-600 text-[10px] mt-0.5 italic">{adaptation.template}</div>
                                            {/if}
                                        </div>
                                    {/each}
                                {:else if type === 'TokenMultiplier'}
                                    {#each facts as multiplier, i (i)}
                                        <div class="flex items-center gap-2 text-xs">
                                            <span class="font-mono text-gray-700">{multiplier.multiplier}×</span>
                                            {#if multiplier.reason}
                                                <span class="text-gray-600">- {multiplier.reason}</span>
                                            {/if}
                                        </div>
                                    {/each}
                                {:else if type === 'SelectedPlan'}
                                    {#each facts as selected, i (i)}
                                        <div class="bg-blue-50 rounded p-2 text-xs border border-blue-200">
                                            <div class="font-semibold text-blue-800">{selected.plan?.name || 'Selected Plan'}</div>
                                            {#if selected.plan?.rationale}
                                                <div class="text-blue-700 mt-1 italic">"{selected.plan.rationale}"</div>
                                            {/if}
                                        </div>
                                    {/each}
                                {:else if type === 'Signal'}
                                    {#each facts as signal, i (i)}
                                        <div class="flex items-center gap-2 text-xs">
                                            <span class="font-mono text-gray-500">{signal.dimension}:</span>
                                            <span class="font-medium text-gray-800">{signal.signal}</span>
                                            <span class="font-mono text-gray-500">({signal.confidence?.toFixed(2) || '--'})</span>
                                        </div>
                                    {/each}
                                {:else}
                                    <!-- Generic fact display -->
                                    {#each facts as fact, i (i)}
                                        <div class="bg-gray-50 rounded p-2 text-xs border border-gray-200">
                                            <pre class="text-[10px] text-gray-700 whitespace-pre-wrap">{JSON.stringify(fact, null, 2)}</pre>
                                        </div>
                                    {/each}
                                {/if}
                            </div>
                        {/if}
                    </div>
                {/if}
            {/each}
        </div>
    {/if}

    <!-- Error message if present -->
    {#if completion.metrics?.error}
        <div class="text-xs text-red-600 bg-red-50 px-2 py-1 rounded">
            {completion.metrics.error}
        </div>
    {/if}
</div>
