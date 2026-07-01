<script>
    import { Button, Input, Textarea, Checkbox } from '$lib/components/ui/index.js';
    import Modal from '$lib/components/ui/Modal.svelte';
    import { getSession } from '$lib/stores/session.svelte.js';
    import { ui } from '$lib/stores/ui.svelte.js';
    import PlanViewer from './PlanViewer.svelte';
    import DrilldownModal from './workbench/DrilldownModal.svelte';
    import { flip } from 'svelte/animate';
    import { onMount } from 'svelte';

    let {
        input = $bindable(''),
        trace = $bindable(false),
        workdir = $bindable(''),
        selectedPlan = $bindable(''),
        frame = $bindable({ text: '' }),
        modality = $bindable('text'),
        isSubmitting = $bindable(false),
        isCancelling = $bindable(false),
        onSubmit,
        onCancel
    } = $props();

    let textareaComponent = $state();
    let selectedPlanId = $state(null);
    let isDirty = $state(false);
    let showDirtyConfirmation = $state(false);
    let pendingPlanId = $state(null);

    // Plan display state
    let plansExpanded = $state(false);
    const MAX_VISIBLE_PLANS = 5;

    // Plan editor modal state
    let showPlanEditor = $state(false);
    let planEditorStack = $state([]);
    let planEditorTab = $state('plan-builder'); // Currently only 'plan-builder', expandable

    // Drag and drop state
    let draggedPlanId = $state(null);

    // Frame state
    let allFrames = $state([]);
    let selectedFrameId = $state(null);
    let framesExpanded = $state(false);
    let draggedFrameId = $state(null);
    const MAX_VISIBLE_FRAMES = 5;

    // Frame editor modal state
    let showFrameEditor = $state(false);
    let frameEditorStack = $state([]);

    // Frame dirty state tracking
    let lastLoadedFrameText = $state('');
    let isFrameDirty = $state(false);
    let showFrameDirtyConfirmation = $state(false);
    let pendingFrameId = $state(null);

    // Save frame state
    let showSaveFrameDialog = $state(false);
    let newFrameName = $state('');
    let newFrameDescription = $state('');
    let saveFrameError = $state(null);
    let isSavingFrame = $state(false);

    // LLM assistance state
    let llmDescription = $state('');
    let isGeneratingPlan = $state(false);
    let generationError = $state(null);
    let moduleMetadata = $state(null);
    // Modality options come from the module (a runtime turn param, sibling to frame).
    const modalityOptions = $derived(moduleMetadata?.modalities || []);
    let showHelp = $state(false);

    // Plan view mode
    let showPlanJson = $state(false);

    // Preview instructions state
    let showPreview = $state(false);
    let previewData = $state(null);
    let isLoadingPreview = $state(false);
    let previewError = $state(null);

    // Plan loading state
    let allPlans = $state([]);
    let userPlans = $state([]);
    let isLoadingPlans = $state(false);

    // Available tools for plan generation
    let availableTools = $state([]);

    // Save plan state
    let showSaveDialog = $state(false);
    let newPlanName = $state('');
    let newPlanDescription = $state('');
    let saveError = $state(null);
    let isSavingPlan = $state(false);

    const session = getSession();

    // workdir is fixed for a session's lifetime: editable while the session is new
    // (no turns yet), read-only once it exists.
    const workdirLocked = $derived(session.entries.length > 0);

    // Derive a human-meaningful filename address from a display name.
    function slugify(name) {
        return (name || '')
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '');
    }

    // Sort plans by user-defined order
    const sortedPlans = $derived.by(() => {
        const order = ui.planOrder || [];
        return [...allPlans].sort((a, b) => {
            const aIndex = order.indexOf(a.name);
            const bIndex = order.indexOf(b.name);
            if (aIndex === -1 && bIndex === -1) return 0;
            if (aIndex === -1) return 1;
            if (bIndex === -1) return -1;
            return aIndex - bIndex;
        });
    });

    const visiblePlans = $derived(
        plansExpanded ? sortedPlans : sortedPlans.slice(0, MAX_VISIBLE_PLANS)
    );

    const hasMorePlans = $derived(sortedPlans.length > MAX_VISIBLE_PLANS);

    // Sort frames by user-defined order
    const sortedFrames = $derived.by(() => {
        const order = ui.frameOrder || [];
        return [...allFrames].sort((a, b) => {
            const aIndex = order.indexOf(a.name);
            const bIndex = order.indexOf(b.name);
            if (aIndex === -1 && bIndex === -1) return 0;
            if (aIndex === -1) return 1;
            if (bIndex === -1) return -1;
            return aIndex - bIndex;
        });
    });

    const visibleFrames = $derived(
        framesExpanded ? sortedFrames : sortedFrames.slice(0, MAX_VISIBLE_FRAMES)
    );

    const hasMoreFrames = $derived(sortedFrames.length > MAX_VISIBLE_FRAMES);

    const frameStatus = $derived.by(() => {
        if (!selectedFrameId) return null;
        const f = allFrames.find(f => f.id === selectedFrameId);
        return f ? f.name : null;
    });

    // Fetch module metadata, plans, frames, and tools on mount
    onMount(async () => {
        isLoadingPlans = true;
        try {
            const metadataResponse = await fetch('/api/module/metadata');
            if (metadataResponse.ok) {
                moduleMetadata = await metadataResponse.json();
                const currentModule = `${moduleMetadata.namespace}/${moduleMetadata.name}`;

                // Load plans
                const plansResponse = await fetch(`/api/plans?module=${encodeURIComponent(currentModule)}`);
                if (plansResponse.ok) {
                    const { plans } = await plansResponse.json();
                    allPlans = plans;
                    userPlans = plans.filter(p => p.source === 'user');
                }

                // Load frames (merges module frames with user frames)
                const framesResponse = await fetch(`/api/frames?module=${encodeURIComponent(currentModule)}`);
                if (framesResponse.ok) {
                    const { frames } = await framesResponse.json();
                    allFrames = frames;
                }
            }

            const toolsResponse = await fetch('/api/tools');
            if (toolsResponse.ok) {
                const toolsData = await toolsResponse.json();
                availableTools = toolsData.tools.map(t => ({
                    name: t.name,
                    description: t.description
                }));
            }
        } catch (error) {
            console.error('Failed to load plans, frames, or tools:', error);
        } finally {
            isLoadingPlans = false;
        }
    });

    // Drag and drop handlers
    function handleDragStart(e, planId) {
        draggedPlanId = planId;
        e.dataTransfer.effectAllowed = 'move';
    }

    function handleDragOver(e, targetPlanId) {
        e.preventDefault();
        if (draggedPlanId === targetPlanId) return;

        const order = ui.planOrder?.length
            ? [...ui.planOrder]
            : sortedPlans.map(p => p.name);

        const draggedName = allPlans.find(p => p.id === draggedPlanId)?.name;
        const targetName = allPlans.find(p => p.id === targetPlanId)?.name;

        if (!draggedName || !targetName) return;

        const fromIndex = order.indexOf(draggedName);
        const toIndex = order.indexOf(targetName);

        // If plan not in order array yet, add all plans first
        if (fromIndex === -1 || toIndex === -1) {
            const fullOrder = sortedPlans.map(p => p.name);
            const newFromIndex = fullOrder.indexOf(draggedName);
            const newToIndex = fullOrder.indexOf(targetName);
            if (newFromIndex !== -1 && newToIndex !== -1) {
                fullOrder.splice(newFromIndex, 1);
                fullOrder.splice(newToIndex, 0, draggedName);
                ui.planOrder = fullOrder;
            }
            return;
        }

        order.splice(fromIndex, 1);
        order.splice(toIndex, 0, draggedName);
        ui.planOrder = order;
    }

    function handleDragEnd() {
        draggedPlanId = null;
    }

    // Frame drag and drop handlers
    function handleFrameDragStart(e, frameId) {
        draggedFrameId = frameId;
        e.dataTransfer.effectAllowed = 'move';
    }

    function handleFrameDragOver(e, targetFrameId) {
        e.preventDefault();
        if (draggedFrameId === targetFrameId) return;

        const order = ui.frameOrder?.length
            ? [...ui.frameOrder]
            : sortedFrames.map(f => f.name);

        const draggedName = allFrames.find(f => f.id === draggedFrameId)?.name;
        const targetName = allFrames.find(f => f.id === targetFrameId)?.name;

        if (!draggedName || !targetName) return;

        const fromIndex = order.indexOf(draggedName);
        const toIndex = order.indexOf(targetName);

        // If frame not in order array yet, add all frames first
        if (fromIndex === -1 || toIndex === -1) {
            const fullOrder = sortedFrames.map(f => f.name);
            const newFromIndex = fullOrder.indexOf(draggedName);
            const newToIndex = fullOrder.indexOf(targetName);
            if (newFromIndex !== -1 && newToIndex !== -1) {
                fullOrder.splice(newFromIndex, 1);
                fullOrder.splice(newToIndex, 0, draggedName);
                ui.frameOrder = fullOrder;
            }
            return;
        }

        order.splice(fromIndex, 1);
        order.splice(toIndex, 0, draggedName);
        ui.frameOrder = order;
    }

    function handleFrameDragEnd() {
        draggedFrameId = null;
    }

    // Frame selection with dirty check
    function selectFrame(frameId) {
        if (selectedFrameId === frameId) {
            // Deselect
            selectedFrameId = null;
            frame = { text: '' };
            lastLoadedFrameText = '';
            isFrameDirty = false;
            return;
        }

        // If dirty, show confirmation
        if (isFrameDirty) {
            pendingFrameId = frameId;
            showFrameDirtyConfirmation = true;
            return;
        }

        loadFrameById(frameId);
    }

    function loadFrameById(frameId) {
        const f = allFrames.find(f => f.id === frameId);
        if (f) {
            selectedFrameId = frameId;
            frame = { text: f.text };
            lastLoadedFrameText = f.text;
            isFrameDirty = false;
        }
    }

    function confirmLoadFrame() {
        if (pendingFrameId) {
            loadFrameById(pendingFrameId);
            pendingFrameId = null;
        }
        showFrameDirtyConfirmation = false;
    }

    function cancelLoadFrame() {
        pendingFrameId = null;
        showFrameDirtyConfirmation = false;
    }

    // Frame editor modal
    function openFrameEditor() {
        frameEditorStack = [{ title: 'Frame Editor', type: 'main', data: null }];
        showFrameEditor = true;
    }

    function openSaveFrameDialog() {
        if (!frame.text?.trim()) {
            saveFrameError = 'No frame content to save';
            return;
        }
        newFrameName = '';
        newFrameDescription = '';
        saveFrameError = null;
        showSaveFrameDialog = true;
    }

    async function saveFrameAsNew() {
        if (!newFrameName.trim()) {
            saveFrameError = 'Frame name is required';
            return;
        }

        if (!frame.text?.trim()) {
            saveFrameError = 'No frame content to save';
            return;
        }

        isSavingFrame = true;
        saveFrameError = null;

        try {
            const frameId = slugify(newFrameName) || `frame-${Date.now()}`;

            const newFrame = {
                id: frameId,
                name: newFrameName.trim(),
                description: newFrameDescription.trim(),
                text: frame.text
            };

            const response = await fetch('/api/frames', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ frame: newFrame })
            });

            if (!response.ok) {
                throw new Error('Failed to save frame');
            }

            // Reload frames
            const currentModule = `${moduleMetadata.namespace}/${moduleMetadata.name}`;
            const framesResponse = await fetch(`/api/frames?module=${encodeURIComponent(currentModule)}`);
            if (framesResponse.ok) {
                const { frames } = await framesResponse.json();
                allFrames = frames;
            }

            // Select the newly saved frame
            selectedFrameId = frameId;
            lastLoadedFrameText = frame.text;
            isFrameDirty = false;

            showSaveFrameDialog = false;
            newFrameName = '';
            newFrameDescription = '';
        } catch (error) {
            saveFrameError = error.message;
            console.error('Error saving frame:', error);
        } finally {
            isSavingFrame = false;
        }
    }

    function cancelSaveFrame() {
        showSaveFrameDialog = false;
        newFrameName = '';
        newFrameDescription = '';
        saveFrameError = null;
    }

    async function deleteFrameById(frameId) {
        if (!confirm('Delete this frame?')) {
            return;
        }

        try {
            const response = await fetch(`/api/frames?id=${encodeURIComponent(frameId)}`, {
                method: 'DELETE'
            });

            if (!response.ok) {
                throw new Error('Failed to delete frame');
            }

            // Reload frames
            const currentModule = `${moduleMetadata.namespace}/${moduleMetadata.name}`;
            const framesResponse = await fetch(`/api/frames?module=${encodeURIComponent(currentModule)}`);
            if (framesResponse.ok) {
                const { frames } = await framesResponse.json();
                allFrames = frames;
            }

            // Clear selection if deleted frame was selected
            if (selectedFrameId === frameId) {
                selectedFrameId = null;
                frame = { text: '' };
                lastLoadedFrameText = '';
                isFrameDirty = false;
            }
        } catch (error) {
            console.error('Error deleting frame:', error);
            alert('Failed to delete frame: ' + error.message);
        }
    }

    // Track frame dirty state
    $effect(() => {
        // Track if frame text has changed from what was loaded
        if (selectedFrameId && frame.text !== lastLoadedFrameText) {
            isFrameDirty = true;
        } else if (!selectedFrameId && frame.text?.trim()) {
            // User typed in frame without selecting one
            isFrameDirty = true;
        } else {
            isFrameDirty = false;
        }
    });

    // Plan editor modal
    function openPlanEditor() {
        planEditorStack = [{ title: 'Plan Editor', type: 'main', data: null }];
        showPlanEditor = true;
    }

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

    // Handle plan selection
    function selectPlan(planId) {
        if (selectedPlanId === planId) {
            selectedPlanId = null;
            selectedPlan = '';
            lastLoadedPlan = '';
            llmDescription = '';
            isDirty = false;
            return;
        }

        if (isDirty) {
            pendingPlanId = planId;
            showDirtyConfirmation = true;
            return;
        }

        loadPlan(planId);
    }

    function loadPlan(planId) {
        const plan = allPlans.find(p => p.id === planId);
        if (plan) {
            selectedPlanId = planId;
            selectedPlan = JSON.stringify(plan.plan, null, 2);
            lastLoadedPlan = selectedPlan;
            isDirty = false;
        }
    }

    function confirmLoadPlan() {
        if (pendingPlanId) {
            loadPlan(pendingPlanId);
            pendingPlanId = null;
        }
        showDirtyConfirmation = false;
    }

    function cancelLoadPlan() {
        pendingPlanId = null;
        showDirtyConfirmation = false;
    }

    function openSaveDialog() {
        if (!selectedPlan) {
            saveError = 'No plan to save';
            return;
        }
        newPlanName = '';
        newPlanDescription = '';
        saveError = null;
        showSaveDialog = true;
    }

    async function savePlan() {
        if (!newPlanName.trim()) {
            saveError = 'Plan name is required';
            return;
        }

        if (!selectedPlan) {
            saveError = 'No plan to save';
            return;
        }

        isSavingPlan = true;
        saveError = null;

        try {
            const plan = JSON.parse(selectedPlan);
            const planId = slugify(newPlanName) || `plan-${Date.now()}`;

            const newPlan = {
                id: planId,
                name: newPlanName.trim(),
                description: newPlanDescription.trim(),
                plan
            };

            const currentModule = `${moduleMetadata.namespace}/${moduleMetadata.name}`;

            const response = await fetch('/api/plans', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    module: currentModule,
                    plan: newPlan
                })
            });

            if (!response.ok) {
                throw new Error('Failed to save plan');
            }

            const plansResponse = await fetch(`/api/plans?module=${encodeURIComponent(currentModule)}`);
            if (plansResponse.ok) {
                const { plans } = await plansResponse.json();
                allPlans = plans;
                userPlans = plans.filter(p => p.source === 'user');
            }

            showSaveDialog = false;
            newPlanName = '';
            newPlanDescription = '';
        } catch (error) {
            saveError = error.message;
            console.error('Error saving plan:', error);
        } finally {
            isSavingPlan = false;
        }
    }

    function cancelSavePlan() {
        showSaveDialog = false;
        newPlanName = '';
        newPlanDescription = '';
        saveError = null;
    }

    async function deletePlan(planId) {
        if (!confirm('Delete this plan?')) {
            return;
        }

        try {
            const currentModule = `${moduleMetadata.namespace}/${moduleMetadata.name}`;

            const response = await fetch(`/api/plans?module=${encodeURIComponent(currentModule)}&id=${encodeURIComponent(planId)}`, {
                method: 'DELETE'
            });

            if (!response.ok) {
                throw new Error('Failed to delete plan');
            }

            const plansResponse = await fetch(`/api/plans?module=${encodeURIComponent(currentModule)}`);
            if (plansResponse.ok) {
                const { plans } = await plansResponse.json();
                allPlans = plans;
                userPlans = plans.filter(p => p.source === 'user');
            }

            if (selectedPlanId === planId) {
                selectedPlanId = null;
                selectedPlan = '';
                lastLoadedPlan = '';
                llmDescription = '';
                isDirty = false;
            }
        } catch (error) {
            console.error('Error deleting plan:', error);
            alert('Failed to delete plan: ' + error.message);
        }
    }

    // Track dirty state
    let lastLoadedPlan = $state('');

    $effect(() => {
        if (selectedPlanId && selectedPlan && selectedPlan !== lastLoadedPlan) {
            lastLoadedPlan = selectedPlan;
            isDirty = false;
            return;
        }

        const planChanged = selectedPlan && selectedPlan !== lastLoadedPlan;
        const hasDescription = llmDescription.trim().length > 0;

        if (hasDescription || planChanged) {
            isDirty = true;
            if (planChanged && selectedPlanId) {
                selectedPlanId = null;
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

    // Helper for plan status display
    const planStatus = $derived.by(() => {
        if (!selectedPlan) return null;
        try {
            const plan = JSON.parse(selectedPlan);
            return { name: plan.name || 'unnamed', strategy: plan.strategy || 'unknown' };
        } catch {
            return { name: 'custom', strategy: 'configured' };
        }
    });

    function handleSubmit() {
        if (!input.trim() || isSubmitting) return;
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

<!-- Processing indicator (full width, above grid) -->
{#if session.isProcessing}
    <div class="mb-4">
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

<form onsubmit={(e) => { e.preventDefault(); handleSubmit(); }}>
    <div class="grid grid-cols-1 lg:grid-cols-12 lg:grid-rows-[1fr_auto] gap-4">
        <!-- LEFT COLUMN: Frames (spans both rows) -->
        <div class="lg:col-span-3 lg:row-span-2 border rounded-lg border-indigo-800/16 bg-linear-to-r/decreasing from-indigo-500/3 to-violet-400/3 p-4 space-y-4">
            <!-- Frame Status -->
            <div class="text-xs text-gray-600 font-mono p-2 bg-white/50 rounded border border-gray-200/50">
                {#if frameStatus}
                    Frame: {frameStatus}
                {:else}
                    No frame selected
                {/if}
            </div>

            <!-- Frame Selection -->
            <div class="space-y-2">
                <div class="flex items-center justify-between">
                    <span class="text-xs font-medium text-gray-700">Frames</span>
                    {#if framesExpanded}
                        <button
                            type="button"
                            onclick={() => framesExpanded = false}
                            class="text-xs text-indigo-600 hover:text-indigo-800"
                        >
                            Collapse
                        </button>
                    {/if}
                </div>

                {#if allFrames.length === 0}
                    <div class="text-xs text-gray-500">No frames available</div>
                {:else}
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {#each visibleFrames as f (f.id)}
                            <div
                                class="relative group {visibleFrames.length === 1 ? 'sm:col-span-2' : ''}"
                                animate:flip={{ duration: 200 }}
                            >
                                <button
                                    type="button"
                                    draggable={framesExpanded}
                                    ondragstart={(e) => handleFrameDragStart(e, f.id)}
                                    ondragover={(e) => handleFrameDragOver(e, f.id)}
                                    ondragend={handleFrameDragEnd}
                                    onclick={() => selectFrame(f.id)}
                                    class="w-full text-left px-3 py-2 text-xs font-medium rounded border transition-colors
                                        {selectedFrameId === f.id
                                            ? 'bg-indigo-600 text-white border-indigo-600'
                                            : 'bg-white text-gray-700 border-gray-300 hover:border-indigo-400 hover:bg-indigo-50'}
                                        {framesExpanded ? 'cursor-grab active:cursor-grabbing' : ''}"
                                    disabled={isSubmitting}
                                    title={f.description}
                                >
                                    {f.name}
                                </button>
                                {#if f.source === 'user'}
                                    <button
                                        type="button"
                                        onclick={(e) => {
                                            e.stopPropagation();
                                            deleteFrameById(f.id);
                                        }}
                                        class="absolute top-1 right-1 w-5 h-5 bg-gray-400 text-white rounded-full text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-gray-600"
                                        disabled={isSubmitting}
                                        title="Delete frame"
                                    >
                                        &times;
                                    </button>
                                {/if}
                            </div>
                        {/each}

                        {#if hasMoreFrames && !framesExpanded}
                            <button
                                type="button"
                                onclick={() => framesExpanded = true}
                                class="w-full text-center px-3 py-2 text-xs text-gray-500 hover:text-indigo-600 border border-dashed border-gray-300 rounded hover:border-indigo-400 transition-colors"
                            >
                                &hellip;
                            </button>
                        {/if}
                    </div>
                {/if}
            </div>

            <!-- Edit/Create Frame Button -->
            <button
                type="button"
                onclick={openFrameEditor}
                class="w-full px-3 py-2 text-xs font-medium rounded border border-indigo-300 text-indigo-600 hover:bg-indigo-50 transition-colors"
                disabled={isSubmitting}
            >
                {selectedFrameId ? 'Edit Frame' : 'Create Frame'}
            </button>

            <!-- Modality: a runtime turn param, sibling to frame; composed into the prelude -->
            <div class="mt-2">
                <label for="run-modality" class="block text-[11px] font-medium text-gray-500 mb-1">Modality</label>
                <select
                    id="run-modality"
                    bind:value={modality}
                    class="w-full px-2 py-1.5 text-xs border border-gray-300 rounded bg-white"
                    disabled={isSubmitting}
                >
                    <option value="">none</option>
                    {#each modalityOptions as m (m)}
                        <option value={m}>{m}</option>
                    {/each}
                </select>
            </div>
        </div>

        <!-- CENTER COLUMN ROW 1: Input & Send -->
        <div class="flex lg:col-span-5 border rounded-lg border-indigo-800/16 bg-linear-to-r/decreasing from-indigo-500/3 to-violet-400/3 p-4 pb-1 space-y-3">
            <Textarea
                bind:this={textareaComponent}
                id="input"
                bind:value={input}
                rows={4}
                placeholder="Enter your message..."
                disabled={isSubmitting}
                onkeydown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSubmit();
                    }
                }}
                class="rounded-tr-none rounded-br-none"
            />
            <Button
                variant="primary"
                size="xs"
                disabled={isDisabled}
                onclick={handleSubmit}
                class="mb-3 border-l-none rounded-tl-none rounded-bl-none"
            >
                {#if isSubmitting}
                    <svg class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Running...
                {:else}
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 3l9 18-9-6-9 6 9-18z"></path>
                    </svg>
                {/if}
            </Button>
        </div>

        <!-- RIGHT COLUMN: Plans (spans both rows) -->
        <div class="lg:col-span-4 lg:row-span-2 border rounded-lg border-indigo-800/16 bg-linear-to-r/decreasing from-indigo-500/3 to-violet-400/3 p-4 space-y-4">
            <!-- Plan Status -->
            <div class="text-xs text-gray-600 font-mono p-2 bg-white/50 rounded border border-gray-200/50">
                {#if planStatus}
                    Plan: {planStatus.name} ({planStatus.strategy})
                {:else}
                    No plan configured
                {/if}
            </div>

            <!-- Plan Selection -->
            <div class="space-y-2">
                <div class="flex items-center justify-between">
                    <span class="text-xs font-medium text-gray-700">Plans</span>
                    {#if plansExpanded}
                        <button
                            type="button"
                            onclick={() => plansExpanded = false}
                            class="text-xs text-indigo-600 hover:text-indigo-800"
                        >
                            Collapse
                        </button>
                    {/if}
                </div>

                {#if isLoadingPlans}
                    <div class="text-xs text-gray-500">Loading...</div>
                {:else}
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {#each visiblePlans as plan (plan.id)}
                            <div
                                class="relative group {visiblePlans.length === 1 ? 'sm:col-span-2' : ''}"
                                animate:flip={{ duration: 200 }}
                            >
                                <button
                                    type="button"
                                    draggable={plansExpanded}
                                    ondragstart={(e) => handleDragStart(e, plan.id)}
                                    ondragover={(e) => handleDragOver(e, plan.id)}
                                    ondragend={handleDragEnd}
                                    onclick={() => selectPlan(plan.id)}
                                    class="w-full text-left px-3 py-2 text-xs font-medium rounded border transition-colors
                                        {selectedPlanId === plan.id
                                            ? 'bg-indigo-600 text-white border-indigo-600'
                                            : 'bg-white text-gray-700 border-gray-300 hover:border-indigo-400 hover:bg-indigo-50'}
                                        {plansExpanded ? 'cursor-grab active:cursor-grabbing' : ''}"
                                    disabled={isSubmitting}
                                    title={plan.description}
                                >
                                    {plan.name}
                                </button>
                                {#if plan.source === 'user'}
                                    <button
                                        type="button"
                                        onclick={(e) => {
                                            e.stopPropagation();
                                            deletePlan(plan.id);
                                        }}
                                        class="absolute top-1 right-1 w-5 h-5 bg-gray-400 text-white rounded-full text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-gray-600"
                                        disabled={isSubmitting}
                                        title="Delete plan"
                                    >
                                        &times;
                                    </button>
                                {/if}
                            </div>
                        {/each}

                        {#if hasMorePlans && !plansExpanded}
                            <button
                                type="button"
                                onclick={() => plansExpanded = true}
                                class="w-full text-center px-3 py-2 text-xs text-gray-500 hover:text-indigo-600 border border-dashed border-gray-300 rounded hover:border-indigo-400 transition-colors"
                            >
                                &hellip;
                            </button>
                        {/if}
                    </div>
                {/if}
            </div>

            <!-- Create/Edit Plan Button -->
            <button
                type="button"
                onclick={openPlanEditor}
                class="w-full px-3 py-2 text-xs font-medium rounded border border-indigo-300 text-indigo-600 hover:bg-indigo-50 transition-colors"
                disabled={isSubmitting}
            >
                {selectedPlanId ? 'Edit Plan' : 'Create Plan'}
            </button>
        </div>

        <!-- CENTER COLUMN ROW 2: CWD & TRACE -->
        <div class="lg:col-span-5 lg:col-start-4 border rounded-lg border-indigo-800/16 bg-linear-to-r/decreasing from-indigo-500/3 to-violet-400/3 p-4">
            <div class="flex items-center gap-4">
                <div class="flex items-center gap-3 flex-1">
                    <label for="workdir" class="text-xs font-medium font-mono text-gray-700 whitespace-nowrap">WORKDIR</label>
                    <Input
                        id="workdir"
                        bind:value={workdir}
                        size="sm"
                        placeholder="/path/to/project"
                        disabled={isSubmitting || workdirLocked}
                        title={workdirLocked ? 'Workdir is fixed for the life of this session' : 'Home-base directory for this session'}
                        class="flex-1"
                    />
                </div>
                <Checkbox
                    bind:checked={trace}
                    label="TRACE"
                    class="text-xs font-mono"
                    disabled={isSubmitting}
                />
            </div>
        </div>
    </div>
</form>

<!-- Plan Editor Drilldown Modal -->
<DrilldownModal bind:open={showPlanEditor} bind:stack={planEditorStack}>
    {#if planEditorStack[planEditorStack.length - 1]?.type === 'main'}
        <!-- Tab Bar -->
        <div class="border-b border-gray-200 mb-6">
            <nav class="flex gap-4">
                <button
                    type="button"
                    onclick={() => planEditorTab = 'plan-builder'}
                    class="pb-2 text-sm font-medium border-b-2 transition-colors
                        {planEditorTab === 'plan-builder'
                            ? 'border-indigo-600 text-indigo-600'
                            : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}"
                >
                    Plan Builder
                </button>
                <!-- Future tabs will go here -->
            </nav>
        </div>

        {#if planEditorTab === 'plan-builder'}
            <div class="space-y-6">
                <!-- LLM Description -->
                <div class="space-y-3">
                    <label class="text-sm font-medium text-gray-700">Describe the plan you want:</label>
                <Textarea
                    bind:value={llmDescription}
                    rows={4}
                    placeholder="e.g., Investigate files, then analyze and create a summary..."
                    disabled={isGeneratingPlan}
                />

                <!-- Quick reference toggle -->
                {#if moduleMetadata}
                    <button
                        type="button"
                        onclick={() => showHelp = !showHelp}
                        class="text-xs text-indigo-600 hover:text-indigo-700 underline"
                    >
                        {showHelp ? '- Hide' : '+ Show'} quick reference
                    </button>
                    {#if showHelp}
                        <div class="p-3 bg-gray-50 rounded border text-xs space-y-1">
                            <div><span class="font-semibold">Roles:</span> {moduleMetadata.roles.map(r => r.name || r).join(', ')}</div>
                            <div><span class="font-semibold">Strategies:</span> {moduleMetadata.strategies.map(s => s.name || s).join(', ')}</div>
                            <div><span class="font-semibold">Adaptations:</span> {moduleMetadata.adaptations.map(a => a.name || a).join(', ')}</div>
                        </div>
                    {/if}
                {/if}

                <div class="flex items-center gap-3">
                    <Button
                        size="sm"
                        onclick={generatePlanFromDescription}
                        disabled={isGeneratingPlan || !llmDescription.trim()}
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
                        <span class="text-xs text-gray-500">Using LLM to generate plan...</span>
                    {/if}
                </div>

                {#if generationError}
                    <div class="p-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">
                        {generationError}
                    </div>
                {/if}
            </div>

            <!-- Plan Preview -->
            {#if selectedPlan}
                <div class="space-y-3">
                    <div class="flex items-center justify-between">
                        <label class="text-sm font-medium text-gray-700">Plan Preview</label>
                        <div class="flex items-center gap-2">
                            <Button
                                variant="outline"
                                size="xs"
                                onclick={previewInstructions}
                                disabled={isLoadingPreview}
                            >
                                {isLoadingPreview ? 'Loading...' : 'Preview Instructions'}
                            </Button>
                            <button
                                type="button"
                                class="px-2 py-1 text-xs font-medium rounded border transition-colors
                                    {showPlanJson
                                        ? 'bg-gray-600 text-white border-gray-600'
                                        : 'bg-white text-gray-700 border-gray-300 hover:border-gray-400'}"
                                onclick={() => showPlanJson = !showPlanJson}
                            >
                                {showPlanJson ? 'Visual' : 'JSON'}
                            </button>
                        </div>
                    </div>

                    {#if previewError}
                        <div class="text-xs text-red-600 bg-red-50 p-2 rounded">
                            {previewError}
                        </div>
                    {/if}

                    {#if showPlanJson}
                        <Textarea
                            bind:value={selectedPlan}
                            rows={12}
                            class="font-mono text-xs"
                        />
                    {:else}
                        <PlanViewer plan={selectedPlan} />
                    {/if}
                </div>

                <!-- Save as Plan -->
                <div class="pt-4 border-t">
                    <Button variant="outline" size="sm" onclick={openSaveDialog}>
                        Save as Plan
                    </Button>
                </div>
            {/if}
            </div>
        {/if}
    {/if}
</DrilldownModal>

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
                            {#if result.instructions.systemInstructions}
                                <div>
                                    <div class="text-xs font-semibold text-gray-700 mb-1">System Instructions</div>
                                    <div class="text-xs bg-blue-50 p-2 rounded border border-blue-200 font-mono whitespace-pre-wrap">
                                        {result.instructions.systemInstructions}
                                    </div>
                                </div>
                            {/if}

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

                            {#if result.instructions.adaptations}
                                <div>
                                    <div class="text-xs font-semibold text-gray-700 mb-1">Adaptations</div>
                                    <div class="text-xs bg-white p-2 rounded border border-gray-200 font-mono whitespace-pre-wrap">
                                        {result.instructions.adaptations}
                                    </div>
                                </div>
                            {/if}

                            {#if result.instructions.lengthGuidance}
                                <div>
                                    <div class="text-xs font-semibold text-gray-700 mb-1">Length Guidance</div>
                                    <div class="text-xs bg-white p-2 rounded border border-gray-200 font-mono whitespace-pre-wrap">
                                        {result.instructions.lengthGuidance}
                                    </div>
                                </div>
                            {/if}

                            {#if result.instructions.toolInstructions}
                                <div>
                                    <div class="text-xs font-semibold text-gray-700 mb-1">Tool Instructions</div>
                                    <div class="text-xs bg-white p-2 rounded border border-gray-200 font-mono whitespace-pre-wrap">
                                        {result.instructions.toolInstructions}
                                    </div>
                                </div>
                            {/if}

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
                You have unsaved changes to your current plan. Loading a plan will discard these changes.
            </p>
            <div class="flex justify-end gap-2">
                <Button
                    variant="outline"
                    size="sm"
                    onclick={cancelLoadPlan}
                >
                    Cancel
                </Button>
                <Button
                    variant="danger"
                    size="sm"
                    onclick={confirmLoadPlan}
                >
                    Load Plan Anyway
                </Button>
            </div>
        </div>
    {/snippet}
</Modal>

<!-- Save Plan Modal -->
<Modal
    bind:open={showSaveDialog}
    title="Save as Plan"
>
    {#snippet children()}
        <div class="space-y-4">
            <div class="space-y-2">
                <label for="plan-name" class="text-sm font-medium text-gray-700">
                    Plan Name
                </label>
                <Input
                    id="plan-name"
                    bind:value={newPlanName}
                    placeholder="e.g., My Custom Workflow"
                    disabled={isSavingPlan}
                />
            </div>

            <div class="space-y-2">
                <label for="plan-description" class="text-sm font-medium text-gray-700">
                    Description (optional)
                </label>
                <Textarea
                    id="plan-description"
                    bind:value={newPlanDescription}
                    rows={3}
                    placeholder="Describe what this plan does..."
                    disabled={isSavingPlan}
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
                    onclick={cancelSavePlan}
                    disabled={isSavingPlan}
                >
                    Cancel
                </Button>
                <Button
                    variant="primary"
                    size="sm"
                    onclick={savePlan}
                    disabled={isSavingPlan || !newPlanName.trim()}
                >
                    {isSavingPlan ? 'Saving...' : 'Save Plan'}
                </Button>
            </div>
        </div>
    {/snippet}
</Modal>

<!-- Frame Editor Drilldown Modal -->
<DrilldownModal bind:open={showFrameEditor} bind:stack={frameEditorStack}>
    {#if frameEditorStack[frameEditorStack.length - 1]?.type === 'main'}
        <div class="space-y-6">
            <div class="space-y-3">
                <label class="text-sm font-medium text-gray-700">Frame Content</label>
                <Textarea
                    bind:value={frame.text}
                    rows={12}
                    placeholder="Define context, constraints, identity, rules of engagement..."
                    class="font-mono text-xs"
                />
                <div class="text-xs text-gray-500">
                    {frame.text?.length || 0} characters
                </div>
            </div>

            <!-- Save as Frame -->
            <div class="pt-4 border-t">
                <Button variant="outline" size="sm" onclick={openSaveFrameDialog}>
                    Save as Frame
                </Button>
            </div>
        </div>
    {/if}
</DrilldownModal>

<!-- Frame Dirty Confirmation Modal -->
<Modal
    bind:open={showFrameDirtyConfirmation}
    title="Unsaved Frame Changes"
>
    {#snippet children()}
        <div class="space-y-4">
            <p class="text-sm text-gray-700">
                You have unsaved changes to your current frame. Loading a different frame will discard these changes.
            </p>
            <div class="flex justify-end gap-2">
                <Button
                    variant="outline"
                    size="sm"
                    onclick={cancelLoadFrame}
                >
                    Cancel
                </Button>
                <Button
                    variant="danger"
                    size="sm"
                    onclick={confirmLoadFrame}
                >
                    Load Frame Anyway
                </Button>
            </div>
        </div>
    {/snippet}
</Modal>

<!-- Save Frame Modal -->
<Modal
    bind:open={showSaveFrameDialog}
    title="Save Frame"
>
    {#snippet children()}
        <div class="space-y-4">
            <div class="space-y-2">
                <label for="frame-name" class="text-sm font-medium text-gray-700">
                    Frame Name
                </label>
                <Input
                    id="frame-name"
                    bind:value={newFrameName}
                    placeholder="e.g., Code Review Context"
                    disabled={isSavingFrame}
                />
            </div>

            <div class="space-y-2">
                <label for="frame-description" class="text-sm font-medium text-gray-700">
                    Description (optional)
                </label>
                <Textarea
                    id="frame-description"
                    bind:value={newFrameDescription}
                    rows={2}
                    placeholder="Describe this frame..."
                    disabled={isSavingFrame}
                />
            </div>

            {#if saveFrameError}
                <div class="p-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">
                    {saveFrameError}
                </div>
            {/if}

            <div class="flex justify-end gap-2">
                <Button
                    variant="outline"
                    size="sm"
                    onclick={cancelSaveFrame}
                    disabled={isSavingFrame}
                >
                    Cancel
                </Button>
                <Button
                    variant="primary"
                    size="sm"
                    onclick={saveFrameAsNew}
                    disabled={isSavingFrame || !newFrameName.trim()}
                >
                    {isSavingFrame ? 'Saving...' : 'Save Frame'}
                </Button>
            </div>
        </div>
    {/snippet}
</Modal>
