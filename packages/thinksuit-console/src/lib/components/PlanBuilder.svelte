<script>
    import { Button, Input } from '$lib/components/ui/index.js';
    import { onMount } from 'svelte';

    let { onPlanChange, disabled = false } = $props();

    // Plan state
    let strategy = $state('direct');
    let name = $state('direct-plan');
    let role = $state('');
    let adaptationKey = $state('');
    let tools = $state([]);
    let toolsStr = $state('');
    let rationale = $state('Direct execution with single role');

    // Sequence for sequential strategy
    let sequenceItems = $state([]);

    // Roles for parallel strategy
    let parallelRoles = $state([]);

    // Module metadata
    let availableRoles = $state([]);
    let availableStrategies = $state(['direct', 'task', 'sequential', 'parallel']);
    let availableAdaptations = $state([]);

    // Fetch module metadata on mount
    onMount(async () => {
        try {
            const response = await fetch('/api/module/metadata');
            if (response.ok) {
                const metadata = await response.json();
                availableRoles = metadata.roles || [];
                availableStrategies = metadata.strategies || ['direct', 'task', 'sequential', 'parallel'];
                availableAdaptations = metadata.adaptations || [];
            }
        } catch (error) {
            console.error('Failed to load module metadata:', error);
        }
    });

    // Build plan object and notify parent
    function buildPlan() {
        const plan = {
            strategy,
            name: name.trim() || `${strategy}-plan`
        };

        // Add role for direct/task strategies
        if ((strategy === 'direct' || strategy === 'task') && role.trim()) {
            plan.role = role.trim();
        }

        // Add adaptationKey for direct/task strategies (top-level)
        if ((strategy === 'direct' || strategy === 'task') && adaptationKey.trim()) {
            plan.adaptationKey = adaptationKey.trim();
        }

        // Add tools for task strategy (top-level)
        if (strategy === 'task' && tools.length > 0) {
            plan.tools = tools.filter(t => t.trim()).map(t => t.trim());
        }

        // Add sequence for sequential strategy
        if (strategy === 'sequential' && sequenceItems.length > 0) {
            plan.sequence = sequenceItems
                .filter(item => item.role.trim())
                .map(item => {
                    const step = {
                        role: item.role.trim(),
                        strategy: item.strategy
                    };
                    if (item.adaptationKey?.trim()) {
                        step.adaptationKey = item.adaptationKey.trim();
                    }
                    if (item.tools?.length > 0) {
                        step.tools = item.tools.filter(t => t.trim()).map(t => t.trim());
                    }
                    return step;
                });
        }

        // Add roles for parallel strategy
        if (strategy === 'parallel' && parallelRoles.length > 0) {
            plan.roles = parallelRoles
                .filter(item => item.role.trim())
                .map(item => {
                    const step = {
                        role: item.role.trim(),
                        strategy: item.strategy
                    };
                    if (item.adaptationKey?.trim()) {
                        step.adaptationKey = item.adaptationKey.trim();
                    }
                    if (item.tools?.length > 0) {
                        step.tools = item.tools.filter(t => t.trim()).map(t => t.trim());
                    }
                    return step;
                });
        }

        // Add optional rationale
        if (rationale.trim()) {
            plan.rationale = rationale.trim();
        }

        onPlanChange?.(plan);
    }

    // Watch for changes and rebuild plan
    $effect(() => {
        // Trigger on any state change
        strategy;
        name;
        role;
        adaptationKey;
        tools.length;
        rationale;
        sequenceItems.length;
        parallelRoles.length;

        buildPlan();
    });

    function addSequenceItem() {
        sequenceItems = [...sequenceItems, { role: '', strategy: 'direct', adaptationKey: '', tools: [], toolsStr: '' }];
    }

    function removeSequenceItem(index) {
        sequenceItems = sequenceItems.filter((_, i) => i !== index);
    }

    function addParallelRole() {
        parallelRoles = [...parallelRoles, { role: '', strategy: 'direct', adaptationKey: '', tools: [], toolsStr: '' }];
    }

    function removeParallelRole(index) {
        parallelRoles = parallelRoles.filter((_, i) => i !== index);
    }

    // Update name and rationale when strategy changes
    function updateStrategyDefaults(newStrategy) {
        const defaults = {
            'direct': {
                name: 'direct-plan',
                rationale: 'Direct execution with single role'
            },
            'task': {
                name: 'task-plan',
                rationale: 'Task-based execution with tool usage and iterative refinement'
            },
            'sequential': {
                name: 'sequential-plan',
                rationale: 'Sequential execution through multiple roles'
            },
            'parallel': {
                name: 'parallel-plan',
                rationale: 'Parallel execution across multiple roles'
            }
        };

        const strategyDefaults = defaults[newStrategy];
        if (strategyDefaults) {
            name = strategyDefaults.name;
            rationale = strategyDefaults.rationale;
        }
    }
</script>

<div class="space-y-4 my-4">
    <!-- Strategy Selection -->
    <div class="space-y-4">
        <label class="text-xs font-medium text-gray-700">Strategy *</label>
        <div class="grid grid-cols-4 gap-2">
            {#each availableStrategies as s}
                <button
                    type="button"
                    class="px-3 py-2 text-xs font-medium rounded border transition-colors
                        {strategy === s
                            ? 'bg-indigo-600 text-white border-indigo-600'
                            : 'bg-white text-gray-700 border-gray-300 hover:border-indigo-300'}"
                    onclick={() => {
                        strategy = s;
                        updateStrategyDefaults(s);
                    }}
                    {disabled}
                >
                    {s}
                </button>
            {/each}
        </div>
    </div>

    <!-- Plan Name -->
    <div class="space-y-4">
        <label for="plan-name" class="text-xs font-medium text-gray-700">
            Plan Name *
        </label>
        <Input
            id="plan-name"
            bind:value={name}
            size="sm"
            {disabled}
        />
    </div>

    <!-- Role (for direct/task strategies) -->
    {#if strategy === 'direct' || strategy === 'task'}
        <div class="space-y-4">
            <label for="plan-role" class="text-xs font-medium text-gray-700">
                Role {strategy === 'direct' ? '*' : ''}
            </label>
            <select
                id="plan-role"
                bind:value={role}
                class="text-xs border border-gray-300 rounded px-2 py-1 w-full"
                {disabled}
            >
                <option value="">Select role...</option>
                {#each availableRoles as r}
                    <option value={r}>{r}</option>
                {/each}
            </select>
        </div>
    {/if}

    <!-- Adaptation (for direct/task strategies) -->
    {#if strategy === 'direct' || strategy === 'task'}
        <div class="space-y-4">
            <label for="plan-adaptation" class="text-xs font-medium text-gray-700">
                Adaptation <span class="text-gray-500">(optional)</span>
            </label>
            <select
                id="plan-adaptation"
                bind:value={adaptationKey}
                class="text-xs border border-gray-300 rounded px-2 py-1 w-full"
                {disabled}
            >
                <option value="">No adaptation</option>
                {#each availableAdaptations as adaptation}
                    <option value={adaptation}>{adaptation}</option>
                {/each}
            </select>
        </div>
    {/if}

    <!-- Tools (for task strategy only) -->
    {#if strategy === 'task'}
        <div class="space-y-4">
            <label for="plan-tools" class="text-xs font-medium text-gray-700">
                Tools <span class="text-gray-500">(optional)</span>
            </label>
            <Input
                id="plan-tools"
                bind:value={toolsStr}
                size="sm"
                placeholder="comma-separated tool names"
                {disabled}
                class="font-mono text-xs"
                oninput={(e) => {
                    tools = e.target.value.split(',').map(t => t.trim()).filter(Boolean);
                }}
            />
            <div class="text-[10px] text-gray-500">
                Comma-separated list of tools available to this task
            </div>
        </div>
    {/if}

    <!-- Sequence (for sequential strategy) -->
    {#if strategy === 'sequential'}
        <div class="space-y-4">
            <div class="flex items-center justify-between">
                <label class="text-xs font-medium text-gray-700">Sequence Steps</label>
                <Button
                    size="xs"
                    variant="subtle"
                    onclick={addSequenceItem}
                    {disabled}
                >
                    + Add Step
                </Button>
            </div>
            {#if sequenceItems.length === 0}
                <div class="text-xs text-gray-500 italic p-2 bg-gray-100 rounded">
                    No steps defined. Click "Add Step" to create sequence.
                </div>
            {:else}
                <div class="space-y-3">
                    {#each sequenceItems as item, index}
                        <div class="bg-white p-3 rounded border border-gray-200 space-y-2">
                            <div class="flex gap-2 items-center">
                                <span class="text-xs font-mono text-gray-500 w-6">{index + 1}.</span>
                                <select
                                    bind:value={item.role}
                                    class="text-xs border border-gray-300 rounded px-2 py-1 flex-1"
                                    {disabled}
                                >
                                    <option value="">Select role...</option>
                                    {#each availableRoles as r}
                                        <option value={r}>{r}</option>
                                    {/each}
                                </select>
                                <select
                                    bind:value={item.strategy}
                                    class="text-xs border border-gray-300 rounded px-2 py-1"
                                    {disabled}
                                >
                                    <option value="direct">direct</option>
                                    <option value="task">task</option>
                                </select>
                                <button
                                    type="button"
                                    onclick={() => removeSequenceItem(index)}
                                    class="text-red-600 hover:text-red-800 text-xs px-2"
                                    {disabled}
                                >
                                    ×
                                </button>
                            </div>
                            <div class="ml-8 space-y-2">
                                <select
                                    bind:value={item.adaptationKey}
                                    class="text-xs border border-gray-300 rounded px-2 py-1 w-full"
                                    {disabled}
                                >
                                    <option value="">No adaptation</option>
                                    {#each availableAdaptations as adaptation}
                                        <option value={adaptation}>{adaptation}</option>
                                    {/each}
                                </select>
                                <Input
                                    bind:value={item.toolsStr}
                                    size="sm"
                                    placeholder="tools: comma-separated (optional)"
                                    {disabled}
                                    class="text-xs font-mono"
                                    oninput={(e) => {
                                        item.tools = e.target.value.split(',').map(t => t.trim()).filter(Boolean);
                                    }}
                                />
                            </div>
                        </div>
                    {/each}
                </div>
            {/if}
        </div>
    {/if}

    <!-- Parallel Roles (for parallel strategy) -->
    {#if strategy === 'parallel'}
        <div class="space-y-4">
            <div class="flex items-center justify-between">
                <label class="text-xs font-medium text-gray-700">Parallel Roles</label>
                <Button
                    size="xs"
                    variant="subtle"
                    onclick={addParallelRole}
                    {disabled}
                >
                    + Add Role
                </Button>
            </div>
            {#if parallelRoles.length === 0}
                <div class="text-xs text-gray-500 italic p-2 bg-gray-100 rounded">
                    No roles defined. Click "Add Role" to create parallel execution.
                </div>
            {:else}
                <div class="space-y-3">
                    {#each parallelRoles as item, index}
                        <div class="bg-white p-3 rounded border border-gray-200 space-y-2">
                            <div class="flex gap-2 items-center">
                                <select
                                    bind:value={item.role}
                                    class="text-xs border border-gray-300 rounded px-2 py-1 flex-1"
                                    {disabled}
                                >
                                    <option value="">Select role...</option>
                                    {#each availableRoles as r}
                                        <option value={r}>{r}</option>
                                    {/each}
                                </select>
                                <select
                                    bind:value={item.strategy}
                                    class="text-xs border border-gray-300 rounded px-2 py-1"
                                    {disabled}
                                >
                                    <option value="direct">direct</option>
                                    <option value="task">task</option>
                                </select>
                                <button
                                    type="button"
                                    onclick={() => removeParallelRole(index)}
                                    class="text-red-600 hover:text-red-800 text-xs px-2"
                                    {disabled}
                                >
                                    ×
                                </button>
                            </div>
                            <div class="ml-2 space-y-2">
                                <select
                                    bind:value={item.adaptationKey}
                                    class="text-xs border border-gray-300 rounded px-2 py-1 w-full"
                                    {disabled}
                                >
                                    <option value="">No adaptation</option>
                                    {#each availableAdaptations as adaptation}
                                        <option value={adaptation}>{adaptation}</option>
                                    {/each}
                                </select>
                                <Input
                                    bind:value={item.toolsStr}
                                    size="sm"
                                    placeholder="tools: comma-separated (optional)"
                                    {disabled}
                                    class="text-xs font-mono"
                                    oninput={(e) => {
                                        item.tools = e.target.value.split(',').map(t => t.trim()).filter(Boolean);
                                    }}
                                />
                            </div>
                        </div>
                    {/each}
                </div>
            {/if}
        </div>
    {/if}

    <!-- Rationale (optional) -->
    <div class="space-y-4">
        <label for="plan-rationale" class="text-xs font-medium text-gray-700">
            Rationale <span class="text-gray-500">(optional)</span>
        </label>
        <Input
            id="plan-rationale"
            bind:value={rationale}
            size="sm"
            placeholder="Why this plan..."
            {disabled}
        />
    </div>
</div>
