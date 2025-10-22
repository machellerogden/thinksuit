<script>
    import { Button, Input, Textarea, Checkbox } from '$lib/components/ui/index.js';
    import { getSession } from '$lib/stores/session.svelte.js';
    import PlanBuilder from './PlanBuilder.svelte';

    let {
        input = $bindable(''),
        trace = $bindable(false),
        cwd = $bindable(''),
        selectedPlan = $bindable(''),
        isSubmitting = $bindable(false),
        isCancelling = $bindable(false),
        onSubmit,
        onCancel
    } = $props();

    let textareaComponent = $state();
    let planMode = $state('builder'); // 'builder' or 'json'
    let usePlanOverride = $state(false); // Whether to use plan override
    let planFormExpanded = $state(true); // Whether plan form is expanded or collapsed

    const session = getSession();

    // Handle plan changes from builder
    function handlePlanBuilderChange(plan) {
        selectedPlan = JSON.stringify(plan, null, 2);
    }

    // Clear plan when unchecking override
    $effect(() => {
        if (!usePlanOverride) {
            selectedPlan = '';
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

        <!-- Plan Override Section -->
        <div class="space-y-3">
            <!-- Checkbox to enable plan override -->
            <div class="flex items-center justify-between gap-2">
                <Checkbox
                    bind:checked={usePlanOverride}
                    label="Bypass automatic plan selection"
                    class="text-xs font-mono"
                    disabled={isSubmitting}
                />
                {#if usePlanOverride}
                    <button
                        type="button"
                        onclick={() => planFormExpanded = !planFormExpanded}
                        class="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
                        disabled={isSubmitting}
                    >
                        {planFormExpanded ? '▼ Collapse' : '▶ Expand'}
                    </button>
                {/if}
            </div>

            <!-- Plan builder/editor (only shown when checkbox is checked) -->
            {#if usePlanOverride}
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
                <div class="space-y-2 pl-6 border-l-2 border-indigo-200 pt-2">
                    <!-- Mode Toggle -->
                    <div class="flex gap-2">
                        <button
                            type="button"
                            class="px-3 py-1 text-xs font-medium rounded border transition-colors
                                {planMode === 'builder'
                                    ? 'bg-indigo-600 text-white border-indigo-600'
                                    : 'bg-white text-gray-700 border-gray-300 hover:border-indigo-300'}"
                            onclick={() => planMode = 'builder'}
                            disabled={isSubmitting}
                        >
                            Build Custom Plan
                        </button>
                        <button
                            type="button"
                            class="px-3 py-1 text-xs font-medium rounded border transition-colors
                                {planMode === 'json'
                                    ? 'bg-indigo-600 text-white border-indigo-600'
                                    : 'bg-white text-gray-700 border-gray-300 hover:border-indigo-300'}"
                            onclick={() => planMode = 'json'}
                            disabled={isSubmitting}
                        >
                            Edit JSON
                        </button>
                    </div>

                    <!-- Plan Builder or JSON Editor -->
                    {#if planMode === 'builder'}
                        <PlanBuilder onPlanChange={handlePlanBuilderChange} disabled={isSubmitting} />
                    {:else}
                        <Textarea
                            id="selectedPlan"
                            bind:value={selectedPlan}
                            rows={6}
                            placeholder={`{"strategy": "direct", "name": "my-plan", "role": "developer"}`}
                            disabled={isSubmitting}
                            class="font-mono text-xs"
                        />
                        <div class="mt-1 text-[10px] text-gray-500">
                            Enter JSON plan object to override automatic plan selection
                        </div>
                    {/if}
                </div>
                {/if}
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
