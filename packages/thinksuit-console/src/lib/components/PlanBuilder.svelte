<script>
    import { Button, Input } from '$lib/components/ui/index.js';
    import Modal from '$lib/components/ui/Modal.svelte';
    import { onMount } from 'svelte';
    import { flip } from 'svelte/animate';

    let { onPlanChange, disabled = false } = $props();

    // Preview state
    let showPreview = $state(false);
    let previewData = $state(null);
    let isLoadingPreview = $state(false);
    let previewError = $state(null);

    // Plan state
    let strategy = $state('direct');
    let name = $state('direct-plan');
    let role = $state('');
    let adaptations = $state([]); // Array of adaptation keys
    let tools = $state([]);
    let toolsStr = $state('');
    let rationale = $state('Direct execution with single role');
    let resultStrategy = $state('last');
    let buildThread = $state(false);

    // Resolution contract (for task strategy)
    let resolution = $state({
        maxCycles: '',
        maxTokens: '',
        maxToolCalls: '',
        timeoutMs: ''
    });

    // Sequence for sequential strategy
    let sequenceItems = $state([]);

    // Branches for parallel strategy
    let parallelBranches = $state([]);

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

        // Add adaptations for direct/task strategies (top-level)
        if ((strategy === 'direct' || strategy === 'task') && adaptations.length > 0) {
            plan.adaptations = adaptations;
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
                    if (item.adaptations && item.adaptations.length > 0) {
                        step.adaptations = item.adaptations;
                    }
                    if (item.tools?.length > 0) {
                        step.tools = item.tools.filter(t => t.trim()).map(t => t.trim());
                    }
                    // Add resolution if step strategy is task and any resolution fields are set
                    if (item.strategy === 'task' && item.resolution) {
                        const res = {};
                        if (item.resolution.maxCycles && !isNaN(parseInt(item.resolution.maxCycles))) {
                            res.maxCycles = parseInt(item.resolution.maxCycles);
                        }
                        if (item.resolution.maxTokens && !isNaN(parseInt(item.resolution.maxTokens))) {
                            res.maxTokens = parseInt(item.resolution.maxTokens);
                        }
                        if (item.resolution.maxToolCalls && !isNaN(parseInt(item.resolution.maxToolCalls))) {
                            res.maxToolCalls = parseInt(item.resolution.maxToolCalls);
                        }
                        if (item.resolution.timeoutMs && !isNaN(parseInt(item.resolution.timeoutMs))) {
                            res.timeoutMs = parseInt(item.resolution.timeoutMs);
                        }
                        if (Object.keys(res).length > 0) {
                            step.resolution = res;
                        }
                    }
                    return step;
                });
        }

        // Add branches for parallel strategy
        if (strategy === 'parallel' && parallelBranches.length > 0) {
            plan.roles = parallelBranches
                .filter(item => item.role.trim())
                .map(item => {
                    const step = {
                        role: item.role.trim(),
                        strategy: item.strategy
                    };
                    if (item.adaptations && item.adaptations.length > 0) {
                        step.adaptations = item.adaptations;
                    }
                    if (item.tools?.length > 0) {
                        step.tools = item.tools.filter(t => t.trim()).map(t => t.trim());
                    }
                    // Add resolution if branch strategy is task and any resolution fields are set
                    if (item.strategy === 'task' && item.resolution) {
                        const res = {};
                        if (item.resolution.maxCycles && !isNaN(parseInt(item.resolution.maxCycles))) {
                            res.maxCycles = parseInt(item.resolution.maxCycles);
                        }
                        if (item.resolution.maxTokens && !isNaN(parseInt(item.resolution.maxTokens))) {
                            res.maxTokens = parseInt(item.resolution.maxTokens);
                        }
                        if (item.resolution.maxToolCalls && !isNaN(parseInt(item.resolution.maxToolCalls))) {
                            res.maxToolCalls = parseInt(item.resolution.maxToolCalls);
                        }
                        if (item.resolution.timeoutMs && !isNaN(parseInt(item.resolution.timeoutMs))) {
                            res.timeoutMs = parseInt(item.resolution.timeoutMs);
                        }
                        if (Object.keys(res).length > 0) {
                            step.resolution = res;
                        }
                    }
                    return step;
                });
        }

        // Add optional rationale
        if (rationale.trim()) {
            plan.rationale = rationale.trim();
        }

        // Add resultStrategy for sequential/parallel strategies
        if (strategy === 'sequential' || strategy === 'parallel') {
            plan.resultStrategy = resultStrategy;
        }

        // Add buildThread for sequential strategy
        if (strategy === 'sequential' && buildThread) {
            plan.buildThread = buildThread;
        }

        // Add resolution for task strategy
        if (strategy === 'task') {
            const res = {};
            if (resolution.maxCycles && !isNaN(parseInt(resolution.maxCycles))) {
                res.maxCycles = parseInt(resolution.maxCycles);
            }
            if (resolution.maxTokens && !isNaN(parseInt(resolution.maxTokens))) {
                res.maxTokens = parseInt(resolution.maxTokens);
            }
            if (resolution.maxToolCalls && !isNaN(parseInt(resolution.maxToolCalls))) {
                res.maxToolCalls = parseInt(resolution.maxToolCalls);
            }
            if (resolution.timeoutMs && !isNaN(parseInt(resolution.timeoutMs))) {
                res.timeoutMs = parseInt(resolution.timeoutMs);
            }
            if (Object.keys(res).length > 0) {
                plan.resolution = res;
            }
        }

        onPlanChange?.(plan);
    }

    // Preview instructions
    async function previewInstructions() {
        isLoadingPreview = true;
        previewError = null;

        try {
            // Build the current plan
            const plan = {
                strategy,
                name: name.trim() || `${strategy}-plan`
            };

            // Add all plan fields (same logic as buildPlan)
            if ((strategy === 'direct' || strategy === 'task') && role.trim()) {
                plan.role = role.trim();
            }
            if ((strategy === 'direct' || strategy === 'task') && adaptations.length > 0) {
                plan.adaptations = adaptations;
            }
            if (strategy === 'task' && tools.length > 0) {
                plan.tools = tools.filter(t => t.trim()).map(t => t.trim());
            }
            if (strategy === 'sequential' && sequenceItems.length > 0) {
                plan.sequence = sequenceItems
                    .filter(item => item.role.trim())
                    .map(item => {
                        const step = {
                            role: item.role.trim(),
                            strategy: item.strategy
                        };
                        if (item.adaptations && item.adaptations.length > 0) {
                            step.adaptations = item.adaptations;
                        }
                        if (item.tools?.length > 0) {
                            step.tools = item.tools.filter(t => t.trim()).map(t => t.trim());
                        }
                        if (item.strategy === 'task' && item.resolution) {
                            const res = {};
                            if (item.resolution.maxCycles && !isNaN(parseInt(item.resolution.maxCycles))) {
                                res.maxCycles = parseInt(item.resolution.maxCycles);
                            }
                            if (item.resolution.maxTokens && !isNaN(parseInt(item.resolution.maxTokens))) {
                                res.maxTokens = parseInt(item.resolution.maxTokens);
                            }
                            if (item.resolution.maxToolCalls && !isNaN(parseInt(item.resolution.maxToolCalls))) {
                                res.maxToolCalls = parseInt(item.resolution.maxToolCalls);
                            }
                            if (item.resolution.timeoutMs && !isNaN(parseInt(item.resolution.timeoutMs))) {
                                res.timeoutMs = parseInt(item.resolution.timeoutMs);
                            }
                            if (Object.keys(res).length > 0) {
                                step.resolution = res;
                            }
                        }
                        return step;
                    });
            }
            if (strategy === 'parallel' && parallelBranches.length > 0) {
                plan.roles = parallelBranches
                    .filter(item => item.role.trim())
                    .map(item => {
                        const step = {
                            role: item.role.trim(),
                            strategy: item.strategy
                        };
                        if (item.adaptations && item.adaptations.length > 0) {
                            step.adaptations = item.adaptations;
                        }
                        if (item.tools?.length > 0) {
                            step.tools = item.tools.filter(t => t.trim()).map(t => t.trim());
                        }
                        if (item.strategy === 'task' && item.resolution) {
                            const res = {};
                            if (item.resolution.maxCycles && !isNaN(parseInt(item.resolution.maxCycles))) {
                                res.maxCycles = parseInt(item.resolution.maxCycles);
                            }
                            if (item.resolution.maxTokens && !isNaN(parseInt(item.resolution.maxTokens))) {
                                res.maxTokens = parseInt(item.resolution.maxTokens);
                            }
                            if (item.resolution.maxToolCalls && !isNaN(parseInt(item.resolution.maxToolCalls))) {
                                res.maxToolCalls = parseInt(item.resolution.maxToolCalls);
                            }
                            if (item.resolution.timeoutMs && !isNaN(parseInt(item.resolution.timeoutMs))) {
                                res.timeoutMs = parseInt(item.resolution.timeoutMs);
                            }
                            if (Object.keys(res).length > 0) {
                                step.resolution = res;
                            }
                        }
                        return step;
                    });
            }
            if (rationale.trim()) {
                plan.rationale = rationale.trim();
            }
            if (strategy === 'sequential' || strategy === 'parallel') {
                plan.resultStrategy = resultStrategy;
            }
            if (strategy === 'sequential' && buildThread) {
                plan.buildThread = buildThread;
            }
            if (strategy === 'task') {
                const res = {};
                if (resolution.maxCycles && !isNaN(parseInt(resolution.maxCycles))) {
                    res.maxCycles = parseInt(resolution.maxCycles);
                }
                if (resolution.maxTokens && !isNaN(parseInt(resolution.maxTokens))) {
                    res.maxTokens = parseInt(resolution.maxTokens);
                }
                if (resolution.maxToolCalls && !isNaN(parseInt(resolution.maxToolCalls))) {
                    res.maxToolCalls = parseInt(resolution.maxToolCalls);
                }
                if (resolution.timeoutMs && !isNaN(parseInt(resolution.timeoutMs))) {
                    res.timeoutMs = parseInt(resolution.timeoutMs);
                }
                if (Object.keys(res).length > 0) {
                    plan.resolution = res;
                }
            }

            const response = await fetch('/api/module/preview-instructions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ plan })
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Failed to preview instructions');
            }

            previewData = await response.json();
            showPreview = true;
        } catch (error) {
            previewError = error.message;
            console.error('Preview error:', error);
        } finally {
            isLoadingPreview = false;
        }
    }

    // Watch for changes and rebuild plan
    $effect(() => {
        // Trigger on any state change
        strategy;
        name;
        role;
        adaptations.length;
        tools.length;
        rationale;
        resultStrategy;
        buildThread;
        maxTokens;
        sequenceItems.length;
        parallelBranches.length;

        buildPlan();
    });

    function addSequenceItem() {
        sequenceItems = [...sequenceItems, {
            role: '',
            strategy: 'direct',
            adaptations: [],
            tools: [],
            toolsStr: '',
            resolution: { maxCycles: '', maxTokens: '', maxToolCalls: '', timeoutMs: '' }
        }];
    }

    function removeSequenceItem(index) {
        sequenceItems = sequenceItems.filter((_, i) => i !== index);
    }

    function addParallelBranch() {
        parallelBranches = [...parallelBranches, {
            role: '',
            strategy: 'direct',
            adaptations: [],
            tools: [],
            toolsStr: '',
            resolution: { maxCycles: '', maxTokens: '', maxToolCalls: '', timeoutMs: '' }
        }];
    }

    function removeParallelBranch(index) {
        parallelBranches = parallelBranches.filter((_, i) => i !== index);
    }

    // Drag and drop state
    let draggedIndex = $state(null);
    let draggedItemIndex = $state(null);

    function handleDragStart(index, event) {
        draggedIndex = index;
        event.dataTransfer.effectAllowed = 'move';
    }

    function handleDragOver(event) {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
    }

    function handleDrop(targetIndex, event) {
        event.preventDefault();
        if (draggedIndex === null || draggedIndex === targetIndex) return;

        const newAdaptations = [...adaptations];
        const [draggedItem] = newAdaptations.splice(draggedIndex, 1);
        newAdaptations.splice(targetIndex, 0, draggedItem);
        adaptations = newAdaptations;
        draggedIndex = null;
    }

    function handleItemDragStart(itemAdaptations, index, event) {
        draggedItemIndex = index;
        event.dataTransfer.effectAllowed = 'move';
    }

    function handleItemDrop(item, targetIndex, event) {
        event.preventDefault();
        if (draggedItemIndex === null || draggedItemIndex === targetIndex) return;

        const newAdaptations = [...item.adaptations];
        const [draggedItem] = newAdaptations.splice(draggedItemIndex, 1);
        newAdaptations.splice(targetIndex, 0, draggedItem);
        item.adaptations = newAdaptations;
        draggedItemIndex = null;
    }

    // Update name and rationale when strategy changes
    function updateStrategyDefaults(newStrategy) {
        const defaults = {
            'direct': {
                name: 'direct-plan',
                rationale: 'Direct execution with single role',
                resultStrategy: 'last',
                buildThread: false
            },
            'task': {
                name: 'task-plan',
                rationale: 'Task-based execution with tool usage and iterative refinement',
                resultStrategy: 'last',
                buildThread: false
            },
            'sequential': {
                name: 'sequential-plan',
                rationale: 'Sequential execution through multiple roles',
                resultStrategy: 'last',
                buildThread: false
            },
            'parallel': {
                name: 'parallel-plan',
                rationale: 'Parallel execution across multiple roles',
                resultStrategy: 'concat',
                buildThread: false
            }
        };

        const strategyDefaults = defaults[newStrategy];
        if (strategyDefaults) {
            name = strategyDefaults.name;
            rationale = strategyDefaults.rationale;
            resultStrategy = strategyDefaults.resultStrategy;
            buildThread = strategyDefaults.buildThread;
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

    <!-- Adaptations (for direct/task strategies) -->
    {#if strategy === 'direct' || strategy === 'task'}
        <div class="space-y-2">
            <label class="text-xs font-medium text-gray-700">
                Adaptations <span class="text-gray-500">(optional)</span>
            </label>
            <!-- Selected adaptations as tags (draggable) -->
            {#if adaptations.length > 0}
                <div class="flex flex-wrap gap-1 p-2 bg-gray-50 rounded border border-gray-200">
                    {#each adaptations as adaptation, index (adaptation)}
                        <span
                            draggable={!disabled}
                            ondragstart={(e) => handleDragStart(index, e)}
                            ondragover={handleDragOver}
                            ondrop={(e) => handleDrop(index, e)}
                            animate:flip={{ duration: 200 }}
                            class="inline-flex items-center gap-1 px-2 py-1 bg-indigo-100 text-indigo-800 rounded text-xs cursor-move hover:bg-indigo-200 transition-colors"
                            class:opacity-50={draggedIndex === index}
                        >
                            <span class="text-[10px] text-indigo-600">⋮⋮</span>
                            {adaptation}
                            <button
                                type="button"
                                onclick={() => adaptations = adaptations.filter((_, i) => i !== index)}
                                class="hover:text-indigo-900"
                                {disabled}
                            >×</button>
                        </span>
                    {/each}
                </div>
            {/if}
            <!-- Dropdown to add adaptations -->
            <select
                onchange={(e) => {
                    if (e.target.value && !adaptations.includes(e.target.value)) {
                        adaptations = [...adaptations, e.target.value];
                        e.target.value = '';
                    }
                }}
                class="text-xs border border-gray-300 rounded px-2 py-1 w-full"
                {disabled}
            >
                <option value="">+ Add adaptation...</option>
                {#each availableAdaptations.filter(a => !adaptations.includes(a)) as adaptation}
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
                                <!-- Adaptations for this step (draggable) -->
                                {#if item.adaptations && item.adaptations.length > 0}
                                    <div class="flex flex-wrap gap-1 p-1.5 bg-gray-50 rounded border border-gray-200">
                                        {#each item.adaptations as adaptation, adaptIndex (adaptation)}
                                            <span
                                                draggable={!disabled}
                                                ondragstart={(e) => handleItemDragStart(item.adaptations, adaptIndex, e)}
                                                ondragover={handleDragOver}
                                                ondrop={(e) => handleItemDrop(item, adaptIndex, e)}
                                                animate:flip={{ duration: 200 }}
                                                class="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-indigo-100 text-indigo-800 rounded text-[10px] cursor-move hover:bg-indigo-200 transition-colors"
                                                class:opacity-50={draggedItemIndex === adaptIndex}
                                            >
                                                <span class="text-[8px] text-indigo-600">⋮⋮</span>
                                                {adaptation}
                                                <button
                                                    type="button"
                                                    onclick={() => item.adaptations = item.adaptations.filter((_, i) => i !== adaptIndex)}
                                                    class="hover:text-indigo-900"
                                                    {disabled}
                                                >×</button>
                                            </span>
                                        {/each}
                                    </div>
                                {/if}
                                <select
                                    onchange={(e) => {
                                        if (e.target.value && !item.adaptations.includes(e.target.value)) {
                                            item.adaptations = [...item.adaptations, e.target.value];
                                            e.target.value = '';
                                        }
                                    }}
                                    class="text-xs border border-gray-300 rounded px-2 py-1 w-full"
                                    {disabled}
                                >
                                    <option value="">+ Add adaptation...</option>
                                    {#each availableAdaptations.filter(a => !item.adaptations.includes(a)) as adaptation}
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
                                <!-- Resolution Contract (only for task strategy steps) -->
                                {#if item.strategy === 'task'}
                                    <div class="pt-1 space-y-1">
                                        <div class="text-[10px] font-medium text-gray-600">Resolution (optional)</div>
                                        <div class="grid grid-cols-2 gap-1">
                                            <Input
                                                bind:value={item.resolution.maxCycles}
                                                size="sm"
                                                type="number"
                                                placeholder="Max cycles"
                                                {disabled}
                                                class="text-xs"
                                            />
                                            <Input
                                                bind:value={item.resolution.maxTokens}
                                                size="sm"
                                                type="number"
                                                placeholder="Max tokens"
                                                {disabled}
                                                class="text-xs"
                                            />
                                            <Input
                                                bind:value={item.resolution.maxToolCalls}
                                                size="sm"
                                                type="number"
                                                placeholder="Max tool calls"
                                                {disabled}
                                                class="text-xs"
                                            />
                                            <Input
                                                bind:value={item.resolution.timeoutMs}
                                                size="sm"
                                                type="number"
                                                step="1000"
                                                placeholder="Timeout (ms)"
                                                {disabled}
                                                class="text-xs"
                                            />
                                        </div>
                                    </div>
                                {/if}
                            </div>
                        </div>
                    {/each}
                </div>
            {/if}
        </div>
    {/if}

    <!-- Parallel Branches (for parallel strategy) -->
    {#if strategy === 'parallel'}
        <div class="space-y-4">
            <div class="flex items-center justify-between">
                <label class="text-xs font-medium text-gray-700">Parallel Branches</label>
                <Button
                    size="xs"
                    variant="subtle"
                    onclick={addParallelBranch}
                    {disabled}
                >
                    + Add Branch
                </Button>
            </div>
            {#if parallelBranches.length === 0}
                <div class="text-xs text-gray-500 italic p-2 bg-gray-100 rounded">
                    No branches defined. Click "Add Branch" to create parallel execution.
                </div>
            {:else}
                <div class="space-y-3">
                    {#each parallelBranches as item, index}
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
                                    onclick={() => removeParallelBranch(index)}
                                    class="text-red-600 hover:text-red-800 text-xs px-2"
                                    {disabled}
                                >
                                    ×
                                </button>
                            </div>
                            <div class="ml-2 space-y-2">
                                <!-- Adaptations for this branch (draggable) -->
                                {#if item.adaptations && item.adaptations.length > 0}
                                    <div class="flex flex-wrap gap-1 p-1.5 bg-gray-50 rounded border border-gray-200">
                                        {#each item.adaptations as adaptation, adaptIndex (adaptation)}
                                            <span
                                                draggable={!disabled}
                                                ondragstart={(e) => handleItemDragStart(item.adaptations, adaptIndex, e)}
                                                ondragover={handleDragOver}
                                                ondrop={(e) => handleItemDrop(item, adaptIndex, e)}
                                                animate:flip={{ duration: 200 }}
                                                class="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-indigo-100 text-indigo-800 rounded text-[10px] cursor-move hover:bg-indigo-200 transition-colors"
                                                class:opacity-50={draggedItemIndex === adaptIndex}
                                            >
                                                <span class="text-[8px] text-indigo-600">⋮⋮</span>
                                                {adaptation}
                                                <button
                                                    type="button"
                                                    onclick={() => item.adaptations = item.adaptations.filter((_, i) => i !== adaptIndex)}
                                                    class="hover:text-indigo-900"
                                                    {disabled}
                                                >×</button>
                                            </span>
                                        {/each}
                                    </div>
                                {/if}
                                <select
                                    onchange={(e) => {
                                        if (e.target.value && !item.adaptations.includes(e.target.value)) {
                                            item.adaptations = [...item.adaptations, e.target.value];
                                            e.target.value = '';
                                        }
                                    }}
                                    class="text-xs border border-gray-300 rounded px-2 py-1 w-full"
                                    {disabled}
                                >
                                    <option value="">+ Add adaptation...</option>
                                    {#each availableAdaptations.filter(a => !item.adaptations.includes(a)) as adaptation}
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
                                <!-- Resolution Contract (only for task strategy branches) -->
                                {#if item.strategy === 'task'}
                                    <div class="pt-1 space-y-1">
                                        <div class="text-[10px] font-medium text-gray-600">Resolution (optional)</div>
                                        <div class="grid grid-cols-2 gap-1">
                                            <Input
                                                bind:value={item.resolution.maxCycles}
                                                size="sm"
                                                type="number"
                                                placeholder="Max cycles"
                                                {disabled}
                                                class="text-xs"
                                            />
                                            <Input
                                                bind:value={item.resolution.maxTokens}
                                                size="sm"
                                                type="number"
                                                placeholder="Max tokens"
                                                {disabled}
                                                class="text-xs"
                                            />
                                            <Input
                                                bind:value={item.resolution.maxToolCalls}
                                                size="sm"
                                                type="number"
                                                placeholder="Max tool calls"
                                                {disabled}
                                                class="text-xs"
                                            />
                                            <Input
                                                bind:value={item.resolution.timeoutMs}
                                                size="sm"
                                                type="number"
                                                step="1000"
                                                placeholder="Timeout (ms)"
                                                {disabled}
                                                class="text-xs"
                                            />
                                        </div>
                                    </div>
                                {/if}
                            </div>
                        </div>
                    {/each}
                </div>
            {/if}
        </div>
    {/if}

    <!-- Result Strategy (for sequential/parallel) -->
    {#if strategy === 'sequential' || strategy === 'parallel'}
        <div class="space-y-2">
            <label for="result-strategy" class="text-xs font-medium text-gray-700">
                Result Strategy
            </label>
            <select
                id="result-strategy"
                bind:value={resultStrategy}
                class="text-xs border border-gray-300 rounded px-2 py-1 w-full"
                {disabled}
            >
                <option value="last">last - Return final output only</option>
                <option value="concat">concat - Merge all outputs</option>
                <option value="label">label - Include role labels</option>
                <option value="formatted">formatted - Use module formatter</option>
            </select>
            <div class="text-[10px] text-gray-500">
                How to combine results from multiple steps/roles
            </div>
        </div>
    {/if}

    <!-- Build Thread (for sequential only) -->
    {#if strategy === 'sequential'}
        <div class="space-y-2">
            <label class="flex items-center gap-2 text-xs font-medium text-gray-700 cursor-pointer">
                <input
                    type="checkbox"
                    bind:checked={buildThread}
                    class="rounded border-gray-300"
                    {disabled}
                />
                Build Thread
            </label>
            <div class="text-[10px] text-gray-500 ml-5">
                Pass conversation history between sequential steps
            </div>
        </div>
    {/if}

    <!-- Resolution Contract (for task strategy only) -->
    {#if strategy === 'task'}
        <div class="space-y-2">
            <label class="text-xs font-medium text-gray-700">
                Resolution Contract <span class="text-gray-500">(optional)</span>
            </label>
            <div class="grid grid-cols-2 gap-2">
                <div>
                    <Input
                        bind:value={resolution.maxCycles}
                        size="sm"
                        type="number"
                        placeholder="Max cycles (e.g., 3)"
                        {disabled}
                    />
                    <div class="text-[10px] text-gray-500 mt-0.5">Max execution cycles</div>
                </div>
                <div>
                    <Input
                        bind:value={resolution.maxTokens}
                        size="sm"
                        type="number"
                        placeholder="Max tokens (e.g., 8000)"
                        {disabled}
                    />
                    <div class="text-[10px] text-gray-500 mt-0.5">Token limit per cycle</div>
                </div>
                <div>
                    <Input
                        bind:value={resolution.maxToolCalls}
                        size="sm"
                        type="number"
                        placeholder="Max tool calls (e.g., 5)"
                        {disabled}
                    />
                    <div class="text-[10px] text-gray-500 mt-0.5">Tool calls per cycle</div>
                </div>
                <div>
                    <Input
                        bind:value={resolution.timeoutMs}
                        size="sm"
                        type="number"
                        step="1000"
                        placeholder="Timeout (e.g., 60000)"
                        {disabled}
                    />
                    <div class="text-[10px] text-gray-500 mt-0.5">Timeout in milliseconds</div>
                </div>
            </div>
        </div>
    {/if}

    <!-- Rationale (optional) -->
    <div class="space-y-2">
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

    <!-- Preview Instructions Button -->
    <div class="pt-4 border-t border-gray-200">
        <Button
            variant="outline"
            size="sm"
            onclick={previewInstructions}
            disabled={disabled || isLoadingPreview}
            class="w-full"
        >
            {isLoadingPreview ? 'Loading Preview...' : '🔍 Preview Instructions'}
        </Button>
        {#if previewError}
            <div class="mt-2 text-xs text-red-600 bg-red-50 p-2 rounded">
                {previewError}
            </div>
        {/if}
    </div>
</div>

<!-- Preview Modal -->
<Modal
    bind:open={showPreview}
    title={previewData ? `Instruction Preview: ${previewData.plan.name} (${previewData.plan.strategy})` : 'Instruction Preview'}
>
    {#snippet children()}
        {#if previewData}
            <div class="space-y-6">
                    {#each previewData.results as result, index}
                        <div class="border border-gray-200 rounded-lg p-4 bg-gray-50">
                            <div class="flex items-center gap-2 mb-3">
                                {#if result.type === 'step'}
                                    <span class="text-xs font-mono bg-blue-100 text-blue-800 px-2 py-1 rounded">
                                        Step {result.index}
                                    </span>
                                {:else if result.type === 'branch'}
                                    <span class="text-xs font-mono bg-purple-100 text-purple-800 px-2 py-1 rounded">
                                        Branch {result.index}
                                    </span>
                                {:else}
                                    <span class="text-xs font-mono bg-green-100 text-green-800 px-2 py-1 rounded">
                                        {result.type}
                                    </span>
                                {/if}
                                <span class="text-sm font-semibold text-gray-900">{result.role}</span>
                                <span class="text-xs text-gray-500">({result.strategy})</span>
                            </div>

                            <div class="space-y-3">
                                <!-- System Instructions -->
                                {#if result.instructions.systemInstructions}
                                    <div>
                                        <div class="text-xs font-semibold text-gray-700 mb-1">System Instructions</div>
                                        <div class="text-xs bg-blue-50 p-2 rounded border border-blue-200 font-mono whitespace-pre-wrap">
                                            {result.instructions.systemInstructions}
                                        </div>
                                    </div>
                                {/if}

                                <!-- Thread -->
                                {#if result.instructions.thread}
                                    <div>
                                        <div class="text-xs font-semibold text-gray-700 mb-1">Thread ({result.instructions.thread.length} messages)</div>
                                        <div class="space-y-2">
                                            {#each result.instructions.thread as msg, idx}
                                                <div class="text-xs bg-white p-2 rounded border border-gray-200">
                                                    <div class="flex items-center gap-2 mb-1">
                                                        <span class="text-gray-500 font-mono">[{idx}]</span>
                                                        <span class="font-semibold {msg.role === 'user' ? 'text-blue-600' : msg.role === 'assistant' ? 'text-green-600' : 'text-purple-600'}">
                                                            {msg.role || msg.type || 'unknown'}
                                                        </span>
                                                        {#if msg.semantic}
                                                            <span class="text-xs px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-mono">
                                                                {msg.semantic}
                                                            </span>
                                                        {/if}
                                                    </div>
                                                    {#if typeof msg.content === 'string'}
                                                        <div class="font-mono whitespace-pre-wrap">{msg.content}</div>
                                                    {:else if msg.content && typeof msg.content === 'object'}
                                                        <div class="font-mono text-xs text-gray-600">
                                                            <div class="font-semibold mb-1">Content (object):</div>
                                                            {#each Object.entries(msg.content) as [key, value]}
                                                                <div class="ml-2">
                                                                    <span class="text-gray-500">{key}:</span> {typeof value === 'string' ? value : JSON.stringify(value)}
                                                                </div>
                                                            {/each}
                                                        </div>
                                                    {:else}
                                                        <div class="font-mono text-xs text-gray-400">(no content)</div>
                                                    {/if}
                                                </div>
                                            {/each}
                                        </div>
                                    </div>
                                {/if}

                                <!-- Adaptations -->
                                {#if result.instructions.adaptations}
                                    <div>
                                        <div class="text-xs font-semibold text-gray-700 mb-1">Adaptations</div>
                                        <div class="text-xs bg-white p-2 rounded border border-gray-200 font-mono whitespace-pre-wrap">
                                            {result.instructions.adaptations}
                                        </div>
                                    </div>
                                {/if}

                                <!-- Length Guidance -->
                                {#if result.instructions.lengthGuidance}
                                    <div>
                                        <div class="text-xs font-semibold text-gray-700 mb-1">Length Guidance</div>
                                        <div class="text-xs bg-white p-2 rounded border border-gray-200 font-mono whitespace-pre-wrap">
                                            {result.instructions.lengthGuidance}
                                        </div>
                                    </div>
                                {/if}

                                <!-- Tool Instructions -->
                                {#if result.instructions.toolInstructions}
                                    <div>
                                        <div class="text-xs font-semibold text-gray-700 mb-1">Tool Instructions</div>
                                        <div class="text-xs bg-white p-2 rounded border border-gray-200 font-mono whitespace-pre-wrap">
                                            {result.instructions.toolInstructions}
                                        </div>
                                    </div>
                                {/if}

                                <!-- Metadata -->
                                <div>
                                    <div class="text-xs font-semibold text-gray-700 mb-1">Metadata</div>
                                    <div class="text-xs bg-white p-2 rounded border border-gray-200">
                                        <div class="grid grid-cols-2 gap-2">
                                            <div>
                                                <span class="text-gray-600">Max Tokens:</span>
                                                <span class="font-mono ml-1">{result.instructions.maxTokens}</span>
                                            </div>
                                            {#if result.instructions.metadata?.baseTokens}
                                                <div>
                                                    <span class="text-gray-600">Base Tokens:</span>
                                                    <span class="font-mono ml-1">{result.instructions.metadata.baseTokens}</span>
                                                </div>
                                            {/if}
                                            {#if result.instructions.metadata?.tokenMultiplier}
                                                <div>
                                                    <span class="text-gray-600">Token Multiplier:</span>
                                                    <span class="font-mono ml-1">{result.instructions.metadata.tokenMultiplier}</span>
                                                </div>
                                            {/if}
                                            {#if result.instructions.metadata?.lengthLevel}
                                                <div>
                                                    <span class="text-gray-600">Length Level:</span>
                                                    <span class="font-mono ml-1">{result.instructions.metadata.lengthLevel}</span>
                                                </div>
                                            {/if}
                                            {#if result.instructions.metadata?.adaptations?.length > 0}
                                                <div class="col-span-2">
                                                    <span class="text-gray-600">Adaptations:</span>
                                                    <span class="font-mono ml-1">{result.instructions.metadata.adaptations.join(', ')}</span>
                                                </div>
                                            {/if}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    {/each}
                </div>
        {/if}
    {/snippet}
</Modal>
