<script>
    import { Button, Input, Textarea, Checkbox } from '$lib/components/ui/index.js';
    import Modal from '$lib/components/ui/Modal.svelte';
    import { getSession } from '$lib/stores/session.svelte.js';
    import PlanViewer from './PlanViewer.svelte';
    import FrameEditor from './FrameEditor.svelte';
    import { onMount } from 'svelte';

    let {
        input = $bindable(''),
        trace = $bindable(false),
        cwd = $bindable(''),
        selectedPlan = $bindable(''),
        frame = $bindable({ text: '' }),
        isSubmitting = $bindable(false),
        isCancelling = $bindable(false),
        onSubmit,
        onCancel
    } = $props();

    let textareaComponent = $state();
    let selectedPresetId = $state(null); // Currently selected preset ID
    let planFormExpanded = $state(true); // Whether plan form is expanded or collapsed
    let isDirty = $state(false); // Whether plan form has been modified
    let showDirtyConfirmation = $state(false); // Show confirmation dialog
    let pendingPresetId = $state(null); // Preset pending load after confirmation

    // LLM assistance state
    let llmDescription = $state('');
    let isGeneratingPlan = $state(false);
    let generationError = $state(null);
    let moduleMetadata = $state(null);
    let showHelp = $state(false);

    // Plan view mode
    let showPlanJson = $state(false); // false = visual view, true = JSON view

    // Preview instructions state
    let showPreview = $state(false);
    let previewData = $state(null);
    let isLoadingPreview = $state(false);
    let previewError = $state(null);

    // Preset loading state
    let allPresets = $state([]);
    let userPresets = $state([]);
    let isLoadingPresets = $state(false);

    // Available tools for plan generation
    let availableTools = $state([]);

    // Save preset state
    let showSaveDialog = $state(false);
    let newPresetName = $state('');
    let newPresetDescription = $state('');
    let saveError = $state(null);
    let isSavingPreset = $state(false);

    // Frame editor state
    let frameExpanded = $state(false);

    const session = getSession();

    // Fetch module metadata, presets, and tools on mount
    onMount(async () => {
        isLoadingPresets = true;
        try {
            // Load module metadata
            const metadataResponse = await fetch('/api/module/metadata');
            if (metadataResponse.ok) {
                moduleMetadata = await metadataResponse.json();
                const currentModule = `${moduleMetadata.namespace}/${moduleMetadata.name}`;

                // Load presets using new API (merges module + user presets)
                const presetsResponse = await fetch(`/api/presets?module=${encodeURIComponent(currentModule)}`);
                if (presetsResponse.ok) {
                    const { presets } = await presetsResponse.json();
                    allPresets = presets;
                    userPresets = presets.filter(p => p.source === 'user');
                }
            }

            // Load available tools
            const toolsResponse = await fetch('/api/tools');
            if (toolsResponse.ok) {
                const toolsData = await toolsResponse.json();
                // Store only name and description for plan generation
                availableTools = toolsData.tools.map(t => ({
                    name: t.name,
                    description: t.description
                }));
            }
        } catch (error) {
            console.error('Failed to load presets or tools:', error);
        } finally {
            isLoadingPresets = false;
        }
    });

    // Generate plan from LLM description
    async function generatePlanFromDescription() {
        if (!llmDescription.trim()) {
            generationError = 'Please enter a description';
            return;
        }

        isGeneratingPlan = true;
        generationError = null;

        try {
            const currentPlan = selectedPlan ? JSON.parse(selectedPlan) : undefined;

            const response = await fetch('/api/generate/plan', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    description: llmDescription,
                    currentPlan,
                    availableTools
                })
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Failed to generate plan');
            }

            const { plan } = await response.json();
            selectedPlan = JSON.stringify(plan, null, 2);
        } catch (error) {
            generationError = error.message;
            console.error('Plan generation error:', error);
        } finally {
            isGeneratingPlan = false;
        }
    }

    // Preview instructions
    async function previewInstructions() {
        isLoadingPreview = true;
        previewError = null;

        try {
            const plan = JSON.parse(selectedPlan);

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

    // Handle preset selection
    function selectPreset(presetId) {
        // If clicking the already-selected preset, deselect it
        if (selectedPresetId === presetId) {
            selectedPresetId = null;
            selectedPlan = '';
            lastLoadedPlan = '';
            llmDescription = '';
            isDirty = false;
            return;
        }

        // If dirty, show confirmation
        if (isDirty) {
            pendingPresetId = presetId;
            showDirtyConfirmation = true;
            return;
        }

        // Load preset
        loadPreset(presetId);
    }

    function loadPreset(presetId) {
        const preset = allPresets.find(p => p.id === presetId);
        if (preset) {
            selectedPresetId = presetId;
            selectedPlan = JSON.stringify(preset.plan, null, 2);
            lastLoadedPlan = selectedPlan;
            isDirty = false;
        }
    }

    function confirmLoadPreset() {
        if (pendingPresetId) {
            loadPreset(pendingPresetId);
            pendingPresetId = null;
        }
        showDirtyConfirmation = false;
    }

    function cancelLoadPreset() {
        pendingPresetId = null;
        showDirtyConfirmation = false;
    }

    function openSaveDialog() {
        if (!selectedPlan) {
            saveError = 'No plan to save';
            return;
        }
        newPresetName = '';
        newPresetDescription = '';
        saveError = null;
        showSaveDialog = true;
    }

    async function savePreset() {
        if (!newPresetName.trim()) {
            saveError = 'Preset name is required';
            return;
        }

        if (!selectedPlan) {
            saveError = 'No plan to save';
            return;
        }

        isSavingPreset = true;
        saveError = null;

        try {
            const plan = JSON.parse(selectedPlan);

            // Generate unique ID
            const presetId = `preset-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

            const newPreset = {
                id: presetId,
                name: newPresetName.trim(),
                description: newPresetDescription.trim(),
                plan
            };

            // Get current module name
            const currentModule = `${moduleMetadata.namespace}/${moduleMetadata.name}`;

            // Save to server using new API
            const response = await fetch('/api/presets', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    module: currentModule,
                    preset: newPreset
                })
            });

            if (!response.ok) {
                throw new Error('Failed to save preset');
            }

            // Reload presets from API
            const presetsResponse = await fetch(`/api/presets?module=${encodeURIComponent(currentModule)}`);
            if (presetsResponse.ok) {
                const { presets } = await presetsResponse.json();
                allPresets = presets;
                userPresets = presets.filter(p => p.source === 'user');
            }

            // Close dialog
            showSaveDialog = false;
            newPresetName = '';
            newPresetDescription = '';
        } catch (error) {
            saveError = error.message;
            console.error('Error saving preset:', error);
        } finally {
            isSavingPreset = false;
        }
    }

    function cancelSavePreset() {
        showSaveDialog = false;
        newPresetName = '';
        newPresetDescription = '';
        saveError = null;
    }

    async function deletePreset(presetId) {
        if (!confirm('Delete this preset?')) {
            return;
        }

        try {
            // Get current module name
            const currentModule = `${moduleMetadata.namespace}/${moduleMetadata.name}`;

            // Delete using new API
            const response = await fetch(`/api/presets?module=${encodeURIComponent(currentModule)}&id=${encodeURIComponent(presetId)}`, {
                method: 'DELETE'
            });

            if (!response.ok) {
                throw new Error('Failed to delete preset');
            }

            // Reload presets from API
            const presetsResponse = await fetch(`/api/presets?module=${encodeURIComponent(currentModule)}`);
            if (presetsResponse.ok) {
                const { presets } = await presetsResponse.json();
                allPresets = presets;
                userPresets = presets.filter(p => p.source === 'user');
            }

            // Clear selection if deleted preset was selected
            if (selectedPresetId === presetId) {
                selectedPresetId = null;
                selectedPlan = '';
                lastLoadedPlan = '';
                llmDescription = '';
                isDirty = false;
            }
        } catch (error) {
            console.error('Error deleting preset:', error);
            alert('Failed to delete preset: ' + error.message);
        }
    }

    // Track dirty state and preset deselection when plan is modified
    let lastLoadedPlan = $state('');

    $effect(() => {
        // If plan was just loaded from preset, store it
        if (selectedPresetId && selectedPlan && selectedPlan !== lastLoadedPlan) {
            lastLoadedPlan = selectedPlan;
            isDirty = false;
            return;
        }

        // If user has typed description or manually edited the plan
        const planChanged = selectedPlan && selectedPlan !== lastLoadedPlan;
        const hasDescription = llmDescription.trim().length > 0;

        if (hasDescription || planChanged) {
            isDirty = true;
            // Clear preset selection if plan was manually edited
            if (planChanged && selectedPresetId) {
                selectedPresetId = null;
            }
        } else {
            isDirty = false;
        }
    });

    const latestMessage = $derived(
        session.entries.length > 0
            ? session.entries[session.entries.length - 1].msg || 'Processing'
            : 'Processing'
    );

    let isDisabled = $derived(
        !input.trim() ||
        isSubmitting ||
        session.isProcessing
    );

    function handleSubmit() {
        if (!input.trim() || isSubmitting) return;
        planFormExpanded = false;
        onSubmit?.();
    }

    function handleCancel() {
        onCancel?.();
    }

    // Expose focus method for parent components
    export function focus() {
        if (textareaComponent) {
            textareaComponent.focus();
        }
    }
</script>

<div class="border rounded-lg border-indigo-800/16 bg-linear-to-r/decreasing from-indigo-500/3 to-violet-400/3 p-4">
    {#if session.isProcessing}
        <div class="mb-4 max-w-6xl mx-auto">
            <div class="flex items-center justify-between gap-4 p-3 bg-amber-50 border border-amber-200 rounded-lg shadow-sm">
                <div class="flex items-center gap-3">
                    <div class="flex-shrink-0">
                        <svg class="w-5 h-5 text-amber-600 animate-spin" fill="none" viewBox="0 0 24 24">
                            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                    </div>
                    <div>
                        <p class="text-sm font-medium text-amber-900">Processing</p>
                        <p class="text-xs text-amber-700">{latestMessage}</p>
                    </div>
                </div>
                <Button
                    variant="danger"
                    size="sm"
                    onclick={handleCancel}
                    disabled={isCancelling}
                >
                    {isCancelling ? 'Cancelling...' : 'Cancel'}
                </Button>
            </div>
        </div>
    {/if}

    <form onsubmit={(e) => { e.preventDefault(); handleSubmit(); }} class="max-w-6xl mx-auto space-y-3">
        <div class="flex items-center gap-3">
            <!-- Working Directory Input -->
            <label for="cwd" class="text-xs font-medium font-mono text-gray-700 whitespace-nowrap min-w-fit">
                CWD
            </label>
            <Input
                id="cwd"
                bind:value={cwd}
                size="sm"
                placeholder="/path/to/project (optional)"
                disabled={isSubmitting}
            />
        </div>

        <!-- Frame Section -->
        <div class="space-y-2 border border-gray-200 rounded-md p-3 bg-gray-50">
            <button
                type="button"
                onclick={() => frameExpanded = !frameExpanded}
                class="flex items-center justify-between w-full text-left"
            >
                <div class="flex items-center gap-2">
                    <svg class="w-3 h-3 transition-transform {frameExpanded ? 'rotate-90' : ''}" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M6 6L14 10L6 14V6Z" />
                    </svg>
                    <span class="text-xs font-medium text-gray-700">Frame</span>
                    {#if frame?.text}
                        <span class="text-[10px] text-gray-500">({frame.text.length} chars)</span>
                    {/if}
                </div>
                <span class="text-[10px] text-gray-500">Session context</span>
            </button>

            {#if frameExpanded}
                <div class="pt-2">
                    <FrameEditor
                        bind:frame={frame}
                        onSave={(newFrame) => { frame = newFrame; frameExpanded = false; }}
                        onCancel={() => frameExpanded = false}
                        disabled={isSubmitting}
                    />
                </div>
            {:else if frame?.text}
                <div class="text-xs text-gray-600 bg-white p-2 rounded border border-gray-200 font-mono line-clamp-2">
                    {frame.text}
                </div>
            {/if}
        </div>

        <!-- Presets Section -->
        <div class="space-y-3">
            <!-- Preset buttons -->
            <div class="space-y-2">
                <div class="flex items-center justify-between gap-2">
                    <label class="text-xs font-medium text-gray-700">
                        Presets:
                    </label>
                    <button
                        type="button"
                        onclick={() => planFormExpanded = !planFormExpanded}
                        class="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
                        disabled={isSubmitting}
                    >
                        {planFormExpanded ? '▼ Collapse Builder' : '▶ Expand Builder'}
                    </button>
                </div>

                {#if isLoadingPresets}
                    <div class="text-xs text-gray-500">Loading presets...</div>
                {:else}
                    <div class="flex flex-wrap gap-2">
                        {#if allPresets.length === 0}
                            <div class="text-xs text-gray-500 py-1">No presets available</div>
                        {:else}
                            {#each allPresets as preset}
                                <div class="relative inline-flex group">
                                    <button
                                        type="button"
                                        onclick={() => selectPreset(preset.id)}
                                        class="px-3 py-1.5 text-xs font-medium rounded border transition-colors
                                            {selectedPresetId === preset.id
                                                ? 'bg-indigo-600 text-white border-indigo-600'
                                                : 'bg-white text-gray-700 border-gray-300 hover:border-indigo-400 hover:bg-indigo-50'}"
                                        disabled={isSubmitting}
                                        title={preset.description}
                                    >
                                        {preset.name}
                                    </button>
                                    {#if preset.source === 'user'}
                                        <button
                                            type="button"
                                            onclick={(e) => {
                                                e.stopPropagation();
                                                deletePreset(preset.id);
                                            }}
                                            class="absolute -top-1.5 -right-1.5 w-4 h-4 bg-gray-400 text-white rounded-full text-[10px] leading-none flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-gray-600"
                                            disabled={isSubmitting}
                                            title="Delete preset"
                                        >
                                            ×
                                        </button>
                                    {/if}
                                </div>
                            {/each}
                        {/if}
                        <button
                            type="button"
                            onclick={openSaveDialog}
                            class="px-3 py-1.5 text-xs font-medium rounded border border-dashed border-gray-400 text-gray-600 hover:border-indigo-500 hover:text-indigo-600 transition-colors"
                            disabled={isSubmitting || !selectedPlan}
                            title="Save current plan as preset"
                        >
                            + Save as Preset
                        </button>
                    </div>
                {/if}
            </div>

            <!-- Plan builder/editor -->
            <!-- Collapsed summary view -->
            {#if !planFormExpanded}
                    <div class="pl-6 border-l-2 border-indigo-200 py-2">
                        <div class="text-xs text-gray-600 font-mono">
                            {#if selectedPlan}
                                {(() => {
                                    try {
                                        const plan = JSON.parse(selectedPlan);
                                        return `Plan: ${plan.name || 'unnamed'} (${plan.strategy || 'unknown'})`;
                                    } catch {
                                        return 'Custom plan configured';
                                    }
                                })()}
                            {:else}
                                No plan configured
                            {/if}
                        </div>
                    </div>
                {/if}

                {#if planFormExpanded}
                <div class="pl-6 border-l-2 border-indigo-200 pt-2">
                    <!-- Two-column layout -->
                    <div class="grid grid-cols-2 gap-4">
                        <!-- Left: LLM Description -->
                        <div class="space-y-3">
                            <div class="space-y-2">
                                <label for="llm-description" class="text-xs font-medium text-gray-700">
                                    Describe the plan you want:
                                </label>
                                <Textarea
                                    id="llm-description"
                                    bind:value={llmDescription}
                                    rows={4}
                                    placeholder="e.g., Investigate files, then analyze and create a summary..."
                                    disabled={isSubmitting || isGeneratingPlan}
                                    class="text-xs"
                                    onkeydown={(e) => {
                                        if (e.key === 'Enter' && !e.shiftKey) {
                                            e.preventDefault();
                                            if (llmDescription.trim()) {
                                                generatePlanFromDescription();
                                            }
                                        }
                                    }}
                                />

                                <!-- Help Text Toggle -->
                                {#if moduleMetadata}
                                    <button
                                        type="button"
                                        onclick={() => showHelp = !showHelp}
                                        class="text-[10px] text-indigo-600 hover:text-indigo-700 underline"
                                        disabled={isSubmitting}
                                    >
                                        {showHelp ? '− Hide' : '+ Show'} quick reference
                                    </button>

                                    {#if showHelp}
                                        <div class="p-2 bg-gray-50 rounded border border-gray-200 text-[10px] space-y-1">
                                            <div>
                                                <span class="font-semibold">Roles:</span>
                                                <span class="text-gray-700">{moduleMetadata.roles.join(', ')}</span>
                                            </div>
                                            <div>
                                                <span class="font-semibold">Strategies:</span>
                                                <span class="text-gray-700">{moduleMetadata.strategies.join(', ')}</span>
                                            </div>
                                            <div>
                                                <span class="font-semibold">Adaptations:</span>
                                                <span class="text-gray-700">{moduleMetadata.adaptations.join(', ')}</span>
                                            </div>
                                        </div>
                                    {/if}
                                {/if}

                                <!-- Generate Button and Status -->
                                <div class="flex items-center gap-2">
                                    <Button
                                        size="xs"
                                        onclick={generatePlanFromDescription}
                                        disabled={isSubmitting || isGeneratingPlan || !llmDescription.trim()}
                                    >
                                        {#if isGeneratingPlan}
                                            Generating...
                                        {:else if selectedPlan}
                                            Revise Plan
                                        {:else}
                                            Generate Plan
                                        {/if}
                                    </Button>

                                    {#if isGeneratingPlan}
                                        <span class="text-[10px] text-gray-500">
                                            Using LLM to generate plan...
                                        </span>
                                    {/if}
                                </div>

                                <!-- Error Display -->
                                {#if generationError}
                                    <div class="p-2 bg-red-50 border border-red-200 rounded text-[10px] text-red-700">
                                        {generationError}
                                    </div>
                                {/if}
                            </div>
                        </div>

                        <!-- Right: Plan Viewer with toggle -->
                        <div class="space-y-2">
                            <div class="flex items-center justify-between">
                                <label class="text-xs font-medium text-gray-700">
                                    Plan Preview:
                                </label>
                                <div class="flex items-center gap-2">
                                    <Button
                                        variant="outline"
                                        size="xs"
                                        onclick={previewInstructions}
                                        disabled={!selectedPlan || isSubmitting || isLoadingPreview}
                                    >
                                        {isLoadingPreview ? 'Loading...' : '🔍 Preview Instructions'}
                                    </Button>
                                    <button
                                        type="button"
                                        class="px-2 py-1 text-[10px] font-medium rounded border transition-colors
                                            {showPlanJson
                                                ? 'bg-gray-600 text-white border-gray-600'
                                                : 'bg-white text-gray-700 border-gray-300 hover:border-gray-400'}"
                                        onclick={() => showPlanJson = !showPlanJson}
                                        disabled={isSubmitting}
                                    >
                                        {showPlanJson ? '📊 View' : '{ } JSON'}
                                    </button>
                                </div>
                            </div>

                            {#if previewError}
                                <div class="text-xs text-red-600 bg-red-50 p-2 rounded">
                                    {previewError}
                                </div>
                            {/if}

                            {#if showPlanJson}
                                <!-- JSON Editor -->
                                <Textarea
                                    id="selectedPlan"
                                    bind:value={selectedPlan}
                                    rows={12}
                                    placeholder={`{"strategy": "direct", "name": "my-plan", "role": "analyze"}`}
                                    disabled={isSubmitting}
                                    class="font-mono text-xs"
                                />
                            {:else}
                                <!-- Visual Plan Viewer -->
                                <PlanViewer plan={selectedPlan} />
                            {/if}
                        </div>
                    </div>
                </div>
            {/if}
        </div>

        <!-- Message Input and Controls -->
        <div class="flex gap-3 items-start">
            <div class="flex-1">
                <Textarea
                    bind:this={textareaComponent}
                    id="input"
                    bind:value={input}
                    rows={3}
                    placeholder="Enter your message..."
                    disabled={isSubmitting}
                    onkeydown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            handleSubmit();
                        }
                    }}
                />
            </div>

            <div class="flex place-items-stretch gap-3">
                <!-- Trace Checkbox -->
                <Checkbox
                    bind:checked={trace}
                    label="TRACE"
                    class="text-xs font-mono"
                    disabled={isSubmitting}
                />
                <Button
                    variant="primary"
                    size="md"
                    disabled={isDisabled}
                    onclick={handleSubmit}
                >
                    {#if isSubmitting}
                        <svg class="w-4 h-4 mr-2 animate-spin" fill="none" viewBox="0 0 24 24">
                            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Running...
                    {:else}
                        <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 3l9 18-9-6-9 6 9-18z"></path>
                        </svg>
                        Send
                    {/if}
                </Button>
            </div>
        </div>
    </form>
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
                                                <div class="font-semibold mb-1 {msg.role === 'user' ? 'text-blue-600' : 'text-green-600'}">
                                                    {msg.role}:
                                                </div>
                                                <div class="font-mono whitespace-pre-wrap">{msg.content}</div>
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

<!-- Dirty Confirmation Modal -->
<Modal
    bind:open={showDirtyConfirmation}
    title="Unsaved Changes"
>
    {#snippet children()}
        <div class="space-y-4">
            <p class="text-sm text-gray-700">
                You have unsaved changes to your current plan. Loading a preset will discard these changes.
            </p>
            <div class="flex justify-end gap-2">
                <Button
                    variant="outline"
                    size="sm"
                    onclick={cancelLoadPreset}
                >
                    Cancel
                </Button>
                <Button
                    variant="danger"
                    size="sm"
                    onclick={confirmLoadPreset}
                >
                    Load Preset Anyway
                </Button>
            </div>
        </div>
    {/snippet}
</Modal>

<!-- Save Preset Modal -->
<Modal
    bind:open={showSaveDialog}
    title="Save Plan as Preset"
>
    {#snippet children()}
        <div class="space-y-4">
            <div class="space-y-2">
                <label for="preset-name" class="text-sm font-medium text-gray-700">
                    Preset Name
                </label>
                <Input
                    id="preset-name"
                    bind:value={newPresetName}
                    placeholder="e.g., My Custom Workflow"
                    disabled={isSavingPreset}
                />
            </div>

            <div class="space-y-2">
                <label for="preset-description" class="text-sm font-medium text-gray-700">
                    Description (optional)
                </label>
                <Textarea
                    id="preset-description"
                    bind:value={newPresetDescription}
                    rows={3}
                    placeholder="Describe what this preset does..."
                    disabled={isSavingPreset}
                />
            </div>

            {#if saveError}
                <div class="p-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">
                    {saveError}
                </div>
            {/if}

            <div class="flex justify-end gap-2">
                <Button
                    variant="outline"
                    size="sm"
                    onclick={cancelSavePreset}
                    disabled={isSavingPreset}
                >
                    Cancel
                </Button>
                <Button
                    variant="primary"
                    size="sm"
                    onclick={savePreset}
                    disabled={isSavingPreset || !newPresetName.trim()}
                >
                    {isSavingPreset ? 'Saving...' : 'Save Preset'}
                </Button>
            </div>
        </div>
    {/snippet}
</Modal>
