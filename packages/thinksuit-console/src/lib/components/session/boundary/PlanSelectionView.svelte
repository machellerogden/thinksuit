<script>
    import { Badge } from '$lib/components/ui/index.js';

    let { node } = $props();

    const metadata = node.metadata || {};
    const completion = metadata.completion || {};
    const plan = completion.selectedPlan || {};

    // Get strategy variant for badges
    function getStrategyVariant(strategy) {
        if (strategy === 'sequential') return 'primary';
        if (strategy === 'parallel') return 'warning';
        if (strategy === 'task') return 'warning';
        if (strategy === 'direct') return 'success';
        return 'default';
    }

    // Get latency/cost badge variants
    function getMetricVariant(value) {
        if (value === 'low') return 'success';
        if (value === 'medium') return 'warning';
        if (value === 'high') return 'danger';
        return 'secondary';
    }
</script>

<div class="space-y-3">
    <!-- Header with plan name and strategy -->
    <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
            <span class="text-xs font-semibold text-gray-700">Plan Selection</span>
            {#if plan.name}
                <Badge variant="info" size="sm">
                    {plan.name}
                </Badge>
            {/if}
        </div>
        {#if plan.strategy}
            <Badge variant={getStrategyVariant(plan.strategy)} size="sm">
                {plan.strategy}
            </Badge>
        {/if}
    </div>

    <!-- Rationale - most important for understanding the decision -->
    {#if plan.rationale}
        <div class="space-y-1">
            <div class="text-xs font-medium text-gray-600">Rationale</div>
            <div class="text-xs text-gray-700 italic px-2 py-1 bg-gray-50 rounded">
                "{plan.rationale}"
            </div>
        </div>
    {/if}

    <!-- Execution Sequence -->
    {#if plan.sequence && plan.sequence.length > 0}
        <div class="space-y-1.5">
            <div class="text-xs font-medium text-gray-600">Execution Sequence</div>
            <div class="space-y-2 ml-2">
                {#each plan.sequence as step, index (index)}
                    <div class="flex items-start gap-2 text-xs">
                        <span class="font-mono text-gray-500 mt-0.5">{index + 1}.</span>
                        <div class="flex-1">
                            <div class="flex items-center gap-2">
                                <span class="font-semibold text-gray-800">{step.role}</span>
                                <Badge variant={getStrategyVariant(step.strategy)} size="sm">
                                    {step.strategy}
                                </Badge>
                            </div>
                            {#if step.tools && step.tools.length > 0}
                                <div class="mt-1 flex flex-wrap gap-1">
                                    {#each step.tools as tool (tool)}
                                        <span class="font-mono text-[10px] px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded">
                                            {tool}
                                        </span>
                                    {/each}
                                </div>
                            {/if}
                        </div>
                    </div>
                {/each}
            </div>
        </div>
    {/if}

    <!-- Coverage -->
    {#if (plan.coverage || plan.data?.coverage)?.length > 0}
        {@const coverage = plan.coverage || plan.data?.coverage}
        <div class="space-y-1">
            <div class="text-xs font-medium text-gray-600">Coverage</div>
            <div class="flex flex-wrap gap-1 ml-2">
                {#each coverage as item (item)}
                    <span class="text-xs font-mono px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded">
                        {item}
                    </span>
                {/each}
            </div>
        </div>
    {/if}

    <!-- Trade-offs: Latency, Cost, Risks -->
    <div class="flex flex-wrap gap-3 text-xs">
        {#if plan.latency || plan.data?.latency}
            {@const latency = plan.latency || plan.data?.latency}
            <div class="flex items-center gap-1.5">
                <span class="text-gray-600">Latency:</span>
                <Badge variant={getMetricVariant(latency)} size="sm">
                    {latency}
                </Badge>
            </div>
        {/if}
        {#if plan.cost || plan.data?.cost}
            {@const cost = plan.cost || plan.data?.cost}
            <div class="flex items-center gap-1.5">
                <span class="text-gray-600">Cost:</span>
                <Badge variant={getMetricVariant(cost)} size="sm">
                    {cost}
                </Badge>
            </div>
        {/if}
        {#if (plan.risks || plan.data?.risks)?.length > 0}
            {@const risks = plan.risks || plan.data?.risks}
            <div class="flex items-center gap-1.5">
                <span class="text-gray-600">Risks:</span>
                {#each risks as risk (risk)}
                    <Badge variant="danger" size="sm">
                        {risk}
                    </Badge>
                {/each}
            </div>
        {/if}
    </div>

    <!-- Assumptions (if present) -->
    {#if (plan.assumptions || plan.data?.assumptions)?.length > 0}
        {@const assumptions = plan.assumptions || plan.data?.assumptions}
        <div class="space-y-1">
            <div class="text-xs font-medium text-gray-600">Assumptions</div>
            <div class="space-y-0.5 ml-2 text-xs text-gray-600">
                {#each assumptions as assumption (assumption)}
                    <div class="flex items-start gap-1.5">
                        <span class="text-gray-400 mt-0.5">•</span>
                        <span>{assumption}</span>
                    </div>
                {/each}
            </div>
        </div>
    {/if}
</div>