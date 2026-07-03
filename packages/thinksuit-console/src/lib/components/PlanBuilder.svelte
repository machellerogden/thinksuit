<script>
    import { Button, Input } from '$lib/components/ui/index.js';
    import Modal from '$lib/components/ui/Modal.svelte';
    import { onMount } from 'svelte';

    let { onPlanChange, disabled = false } = $props();

    // Preview state
    let showPreview = $state(false);
    let previewData = $state(null);
    let isLoadingPreview = $state(false);
    let previewError = $state(null);

    // Plan state (plan.v1). The root is a node; `task` is a leaf, `sequence`/`parallel`
    // are composites of task children. The form authors one level of nesting — deeper
    // trees are authored in the raw JSON editor.
    let nodeType = $state('task');
    let name = $state('task-plan');
    let description = $state('');
    let resultStrategy = $state('last');

    function newTask() {
        return {
            role: '',
            toolsStr: '',
            tools: [],
            input: '',
            maxRounds: '',
            timeoutMs: '',
            lengthLevel: '',
            adaptations: [],
            maxTokens: ''
        };
    }

    // The root task (used when nodeType === 'task') and the composite children.
    let rootTask = $state(newTask());
    let children = $state([]);

    // Module metadata
    let availableRoles = $state([]);
    let availableAdaptations = $state([]);
    const lengthLevels = ['brief', 'standard', 'comprehensive'];

    onMount(async () => {
        try {
            const response = await fetch('/api/module/metadata');
            if (response.ok) {
                const metadata = await response.json();
                availableRoles = metadata.roles || [];
                availableAdaptations = metadata.adaptations || [];
            }
        } catch (error) {
            console.error('Failed to load module metadata:', error);
        }
    });

    // Build a plan.v1 task node from a task-state object; omit empty fields.
    function buildTaskNode(t) {
        const node = { type: 'task' };
        if (t.role?.trim()) node.role = t.role.trim();
        if (t.tools?.length) node.tools = t.tools.filter((x) => x.trim()).map((x) => x.trim());
        if (t.input?.trim()) node.input = t.input;

        const mr = parseInt(t.maxRounds);
        if (!isNaN(mr)) node.maxRounds = mr;
        const tm = parseInt(t.timeoutMs);
        if (!isNaN(tm)) node.timeoutMs = tm;

        const params = {};
        if (t.lengthLevel) params.lengthLevel = t.lengthLevel;
        if (t.adaptations?.length) params.adaptations = [...t.adaptations];
        const mt = parseInt(t.maxTokens);
        if (!isNaN(mt)) params.maxTokens = mt;
        if (Object.keys(params).length) node.params = params;

        return node;
    }

    // The current plan is derived from form state; changes flow to the parent.
    const plan = $derived.by(() => {
        const p = { name: name.trim() || `${nodeType}-plan`, type: nodeType };
        if (description.trim()) p.description = description.trim();

        if (nodeType === 'task') {
            Object.assign(p, buildTaskNode(rootTask));
            p.type = 'task';
        } else {
            p.resultStrategy = resultStrategy;
            p.children = children.map(buildTaskNode);
        }
        return p;
    });

    $effect(() => {
        onPlanChange?.(plan);
    });

    function addChild() {
        children = [...children, newTask()];
    }
    function removeChild(index) {
        children = children.filter((_, i) => i !== index);
    }

    function addAdaptation(task, key) {
        if (key && !task.adaptations.includes(key)) {
            task.adaptations = [...task.adaptations, key];
        }
    }
    function removeAdaptation(task, index) {
        task.adaptations = task.adaptations.filter((_, i) => i !== index);
    }

    function updateTypeDefaults(newType) {
        name = `${newType}-plan`;
        if (newType === 'parallel') {
            resultStrategy = 'concat';
        } else {
            resultStrategy = 'last';
        }
    }

    async function previewInstructions() {
        isLoadingPreview = true;
        previewError = null;
        try {
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
</script>

{#snippet taskFields(task)}
    <!-- Role -->
    <div class="space-y-1">
        <div class="text-xs font-medium text-gray-700">Role</div>
        <select
            bind:value={task.role}
            class="text-xs border border-gray-300 rounded px-2 py-1 w-full"
            {disabled}
        >
            <option value="">Select role...</option>
            {#each availableRoles as r (r)}
                <option value={r}>{r}</option>
            {/each}
        </select>
    </div>

    <!-- Adaptations -->
    <div class="space-y-1">
        <div class="text-xs font-medium text-gray-700">
            Adaptations <span class="text-gray-500">(optional, applied in order)</span>
        </div>
        {#if task.adaptations.length > 0}
            <div class="flex flex-wrap gap-1 p-2 bg-gray-50 rounded border border-gray-200">
                {#each task.adaptations as adaptation, index (adaptation)}
                    <span class="inline-flex items-center gap-1 px-2 py-1 bg-indigo-100 text-indigo-800 rounded text-xs">
                        <span class="text-[10px] text-indigo-500">{index + 1}.</span>
                        {adaptation}
                        <button
                            type="button"
                            onclick={() => removeAdaptation(task, index)}
                            class="hover:text-indigo-900"
                            {disabled}
                        >×</button>
                    </span>
                {/each}
            </div>
        {/if}
        <select
            onchange={(e) => { addAdaptation(task, e.target.value); e.target.value = ''; }}
            class="text-xs border border-gray-300 rounded px-2 py-1 w-full"
            {disabled}
        >
            <option value="">+ Add adaptation...</option>
            {#each availableAdaptations.filter((a) => !task.adaptations.includes(a)) as adaptation (adaptation)}
                <option value={adaptation}>{adaptation}</option>
            {/each}
        </select>
    </div>

    <!-- Tools -->
    <div class="space-y-1">
        <div class="text-xs font-medium text-gray-700">
            Tools <span class="text-gray-500">(optional)</span>
        </div>
        <Input
            bind:value={task.toolsStr}
            size="sm"
            placeholder="comma-separated tool names"
            {disabled}
            class="font-mono text-xs"
            oninput={(e) => { task.tools = e.target.value.split(',').map((t) => t.trim()).filter(Boolean); }}
        />
    </div>

    <!-- Input template -->
    <div class="space-y-1">
        <div class="text-xs font-medium text-gray-700">
            Input Template <span class="text-gray-500">(optional: $input, $last_response, $&lt;id&gt;_response)</span>
        </div>
        <Input
            bind:value={task.input}
            size="sm"
            placeholder="default: prior result, else turn input"
            {disabled}
            class="font-mono text-xs"
        />
    </div>

    <!-- Bounds + length + tokens -->
    <div class="grid grid-cols-2 gap-2">
        <div>
            <div class="text-[10px] text-gray-500">Max rounds</div>
            <Input bind:value={task.maxRounds} size="sm" type="number" placeholder="e.g. 1" {disabled} />
        </div>
        <div>
            <div class="text-[10px] text-gray-500">Timeout (ms)</div>
            <Input bind:value={task.timeoutMs} size="sm" type="number" step="1000" placeholder="e.g. 60000" {disabled} />
        </div>
        <div>
            <div class="text-[10px] text-gray-500">Length level</div>
            <select
                bind:value={task.lengthLevel}
                class="text-xs border border-gray-300 rounded px-2 py-1 w-full"
                {disabled}
            >
                <option value="">(default)</option>
                {#each lengthLevels as level (level)}
                    <option value={level}>{level}</option>
                {/each}
            </select>
        </div>
        <div>
            <div class="text-[10px] text-gray-500">Max tokens</div>
            <Input bind:value={task.maxTokens} size="sm" type="number" placeholder="e.g. 8000" {disabled} />
        </div>
    </div>
{/snippet}

<div class="space-y-4 my-4">
    <!-- Node type -->
    <div class="space-y-2">
        <div class="text-xs font-medium text-gray-700">Type *</div>
        <div class="grid grid-cols-3 gap-2">
            {#each ['task', 'sequence', 'parallel'] as t (t)}
                <button
                    type="button"
                    class="px-3 py-2 text-xs font-medium rounded border transition-colors
                        {nodeType === t
                            ? 'bg-indigo-600 text-white border-indigo-600'
                            : 'bg-white text-gray-700 border-gray-300 hover:border-indigo-300'}"
                    onclick={() => { nodeType = t; updateTypeDefaults(t); }}
                    {disabled}
                >
                    {t}
                </button>
            {/each}
        </div>
    </div>

    <!-- Name -->
    <div class="space-y-2">
        <label for="plan-name" class="text-xs font-medium text-gray-700">Plan Name *</label>
        <Input id="plan-name" bind:value={name} size="sm" {disabled} />
    </div>

    <!-- Description -->
    <div class="space-y-2">
        <label for="plan-description" class="text-xs font-medium text-gray-700">
            Description <span class="text-gray-500">(optional)</span>
        </label>
        <Input id="plan-description" bind:value={description} size="sm" placeholder="What this plan does..." {disabled} />
    </div>

    <!-- Task root -->
    {#if nodeType === 'task'}
        <div class="space-y-3 bg-white p-3 rounded border border-gray-200">
            {@render taskFields(rootTask)}
        </div>
    {/if}

    <!-- Composite children -->
    {#if nodeType === 'sequence' || nodeType === 'parallel'}
        <div class="space-y-2">
            <label for="result-strategy" class="text-xs font-medium text-gray-700">Result Strategy</label>
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
        </div>

        <div class="space-y-3">
            <div class="flex items-center justify-between">
                <div class="text-xs font-medium text-gray-700">
                    {nodeType === 'parallel' ? 'Branches' : 'Steps'} (task nodes)
                </div>
                <Button size="xs" variant="subtle" onclick={addChild} {disabled}>
                    + Add {nodeType === 'parallel' ? 'Branch' : 'Step'}
                </Button>
            </div>
            {#if children.length === 0}
                <div class="text-xs text-gray-500 italic p-2 bg-gray-100 rounded">
                    No children defined. Click "Add" to create one.
                </div>
            {:else}
                <div class="space-y-3">
                    {#each children as child, index (index)}
                        <div class="bg-white p-3 rounded border border-gray-200 space-y-2">
                            <div class="flex items-center justify-between">
                                <span class="text-xs font-mono text-gray-500">{index + 1}.</span>
                                <button
                                    type="button"
                                    onclick={() => removeChild(index)}
                                    class="text-red-600 hover:text-red-800 text-xs px-2"
                                    {disabled}
                                >×</button>
                            </div>
                            {@render taskFields(child)}
                        </div>
                    {/each}
                </div>
            {/if}
        </div>
    {/if}

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
    title={previewData ? `Instruction Preview: ${previewData.plan.name} (${previewData.plan.type})` : 'Instruction Preview'}
>
    {#snippet children()}
        {#if previewData}
            <div class="space-y-6">
                {#each previewData.results as result, resultIndex (resultIndex)}
                    <div class="border border-gray-200 rounded-lg p-4 bg-gray-50">
                        <div class="flex items-center gap-2 mb-3">
                            <span class="text-xs font-mono bg-green-100 text-green-800 px-2 py-1 rounded">
                                {result.type}
                            </span>
                            <span class="text-sm font-semibold text-gray-900">{result.role}</span>
                            <span class="text-xs text-gray-500 font-mono">{result.path}</span>
                        </div>

                        <div class="space-y-3">
                            <!-- Thread -->
                            {#if result.instructions.thread}
                                <div>
                                    <div class="text-xs font-semibold text-gray-700 mb-1">Thread ({result.instructions.thread.length} messages)</div>
                                    <div class="space-y-2">
                                        {#each result.instructions.thread as msg, idx (idx)}
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
                                                        {#each Object.entries(msg.content) as [key, value] (key)}
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
