<script>
    import { SvelteSet } from 'svelte/reactivity';
    import { EmptyState, Badge, Button, JSONView } from '$lib/components/ui/index.js';
    import { getSession, loadSession } from '$lib/stores/session.svelte.js';
    import { EXECUTION_EVENTS } from 'thinksuit/constants/events';
    import SignalDetectionView from '$lib/components/session/boundary/SignalDetectionView.svelte';
    import RuleEvaluationView from '$lib/components/session/boundary/RuleEvaluationView.svelte';
    import FactAggregationView from '$lib/components/session/boundary/FactAggregationView.svelte';
    import PlanSelectionView from '$lib/components/session/boundary/PlanSelectionView.svelte';
    import InstructionCompositionView from '$lib/components/session/boundary/InstructionCompositionView.svelte';
    import ToolExecutionView from '$lib/components/session/boundary/ToolExecutionView.svelte';
    import LLMExchangeView from '$lib/components/session/boundary/LLMExchangeView.svelte';
    import GenericEventView from '$lib/components/session/boundary/GenericEventView.svelte';
    import MessageEvent from '$lib/components/session/MessageEvent.svelte';

    let { sessionId = null, targetEventId = null, approvalQueue = $bindable([]) } = $props();

    // Constants
    const USER_SCROLL_OVERRIDE_DURATION = 500;
    const AT_BOTTOM_THRESHOLD = 5;
    const NEAR_BOTTOM_THRESHOLD = 100;

    const session = getSession();
    let expanded = new SvelteSet();
    let showRawData = new SvelteSet();

    function toggle(key) {
        if (expanded.has(key)) {
            expanded.delete(key);
        } else {
            expanded.add(key);
        }
    }

    function expandAll(node) {
        const key = `${node.type}-${node.boundaryId}`;
        expanded.add(key);
        if (node.children) {
            node.children.forEach(child => {
                if (['execution', 'cycle', 'step', 'branch', 'orchestration', 'pipeline', 'tool', 'llm_exchange'].includes(child.type)) {
                    expandAll(child);
                }
            });
        }
    }

    function collapseAll(node) {
        const key = `${node.type}-${node.boundaryId}`;
        expanded.delete(key);
        if (node.children) {
            node.children.forEach(child => {
                if (['execution', 'cycle', 'step', 'branch', 'orchestration', 'pipeline', 'tool', 'llm_exchange'].includes(child.type)) {
                    collapseAll(child);
                }
            });
        }
    }

    function toggleRawData(key) {
        if (showRawData.has(key)) {
            showRawData.delete(key);
        } else {
            showRawData.add(key);
        }
    }

    // Local UI state
    let previousSessionId = $state(null);
    let previousTargetEventId = $state(null);
    let scrollContainer = $state(null);
    let atBottom = $state(true);
    let nearBottom = $state(true);
    let userScrollOverride = $state(false);
    let isInitialLoad = $state(true);
    let scrollTimeout = null;

    let shouldShowJumpButton = $derived(!nearBottom && session.thread?.children?.length > 0);

    // Auto-scroll when messages change
    $effect(() => {
        if (atBottom && !userScrollOverride && session.thread?.children?.length && scrollContainer) {
            requestAnimationFrame(() => {
                if (!scrollContainer) return;
                if (isInitialLoad) {
                    scrollContainer.scrollTop = scrollContainer.scrollHeight;
                    isInitialLoad = false;
                } else {
                    scrollContainer.scrollTo({
                        top: scrollContainer.scrollHeight,
                        behavior: 'smooth'
                    });
                }
            });
        }
    });

    // Handle scrolling to target event
    $effect(() => {
        if (!targetEventId || !scrollContainer) return;
        const targetElement = scrollContainer.querySelector(`[data-event-id="${targetEventId}"]`);
        if (targetElement) {
            userScrollOverride = false;
            clearTimeout(scrollTimeout);
            targetElement.scrollIntoView({ behavior: 'instant', block: 'center' });
            targetElement.classList.add('ring-2', 'ring-indigo-500');
            setTimeout(() => {
                targetElement.classList.remove('ring-2', 'ring-indigo-500');
            }, 2000);
        }
    });

    function handleScroll() {
        if (!scrollContainer) return;
        const { scrollHeight, clientHeight, scrollTop } = scrollContainer;
        const distance = scrollHeight - scrollTop - clientHeight;
        atBottom = distance < AT_BOTTOM_THRESHOLD;
        nearBottom = distance < NEAR_BOTTOM_THRESHOLD;
        userScrollOverride = true;
        clearTimeout(scrollTimeout);
        scrollTimeout = setTimeout(() => {
            userScrollOverride = false;
        }, USER_SCROLL_OVERRIDE_DURATION);
    }

    function jumpToBottom() {
        if (scrollContainer) {
            userScrollOverride = false;
            clearTimeout(scrollTimeout);
            scrollContainer.scrollTo({
                top: scrollContainer.scrollHeight,
                behavior: 'smooth'
            });
            atBottom = true;
            nearBottom = true;
        }
    }

    // Load session when props change
    $effect(() => {
        if (sessionId && (sessionId !== previousSessionId || targetEventId !== previousTargetEventId)) {
            isInitialLoad = true;
            atBottom = !targetEventId;
            nearBottom = !targetEventId;
            userScrollOverride = false;
            clearTimeout(scrollTimeout);
            loadSession(sessionId);
            previousSessionId = sessionId;
            previousTargetEventId = targetEventId;
        } else if (!sessionId) {
            loadSession(null);
            previousSessionId = null;
            previousTargetEventId = null;
            isInitialLoad = true;
        }
    });

    // Listen for session updates
    $effect(() => {
        function handleSessionUpdate(event) {
            if (event.detail.sessionId === sessionId && sessionId === session.id) {
                loadSession(sessionId, session.entries.length);
            }
        }

        function handleUserSubmit(event) {
            if (event.detail.sessionId === sessionId) {
                userScrollOverride = false;
                clearTimeout(scrollTimeout);
                if (scrollContainer) {
                    scrollContainer.scrollTop = scrollContainer.scrollHeight;
                    atBottom = true;
                    nearBottom = true;
                }
            }
        }

        window.addEventListener('session-updated', handleSessionUpdate);
        window.addEventListener('user-submitted-input', handleUserSubmit);

        return () => {
            window.removeEventListener('session-updated', handleSessionUpdate);
            window.removeEventListener('user-submitted-input', handleUserSubmit);
        };
    });

    // Monitor for tool approval requests and maintain queue
    $effect(() => {
        if (!session.entries || session.entries.length === 0) {
            approvalQueue = [];
            return;
        }

        /* eslint-disable-next-line svelte/prefer-svelte-reactivity */
        const approvalStatuses = new Map(); // approvalId -> status

        // Scan entries to find all approval states
        for (const entry of session.entries) {
            if (entry.event === EXECUTION_EVENTS.TOOL_APPROVAL_REQUESTED && entry.approvalId) {
                // Default to pending unless we see a completion event later
                if (!approvalStatuses.has(entry.approvalId)) {
                    approvalStatuses.set(entry.approvalId, {
                        status: 'pending',
                        tool: entry.data?.tool,
                        args: entry.data?.args,
                        sessionId: entry.sessionId || sessionId
                    });
                }
            } else if (entry.event === EXECUTION_EVENTS.TOOL_APPROVED && entry.approvalId) {
                const existing = approvalStatuses.get(entry.approvalId);
                if (existing) {
                    existing.status = 'approved';
                }
            } else if (entry.event === EXECUTION_EVENTS.TOOL_DENIED && entry.approvalId) {
                const existing = approvalStatuses.get(entry.approvalId);
                if (existing) {
                    existing.status = 'denied';
                }
            }
        }

        // Build new queue with updated statuses
        const newQueue = [];

        // Add/update approvals
        for (const [approvalId, data] of approvalStatuses.entries()) {
            newQueue.push({
                approvalId,
                tool: data.tool,
                args: data.args,
                sessionId: data.sessionId,
                status: data.status
            });
        }

        approvalQueue = newQueue;
    });

    function formatTimestamp(timestamp) {
        const date = new Date(timestamp);
        return date.toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
    }

    async function copyToClipboard(text) {
        try {
            await navigator.clipboard.writeText(text);
        } catch (error) {
            console.error('Failed to copy to clipboard:', error);
        }
    }

    // Boundary configuration by type
    function getLatestEventMsg(node) {
        if (!node) return null;
        if (node.type === 'event' && node.msg) return node.msg;
        if (node.children && node.children.length > 0) {
            for (let i = node.children.length - 1; i >= 0; i--) {
                const msg = getLatestEventMsg(node.children[i]);
                if (msg) return msg;
            }
        }
        return null;
    }

    function getBoundaryConfig(node) {
        const type = node.type;
        const metadata = node.metadata || {};

        const configs = {
            execution: {
                borderColor: 'border-green-400',
                bgColor: 'bg-green-100',
                hoverColor: 'hover:bg-green-200',
                textColor: 'text-green-700',
                badgeVariant: 'success',
                badgeText: `execution.${metadata.strategy || 'unknown'}`,
                label: metadata.role || ''
            },
            cycle: {
                borderColor: 'border-amber-300',
                bgColor: 'bg-amber-100',
                hoverColor: 'hover:bg-amber-200',
                textColor: 'text-amber-700',
                badgeVariant: 'warning',
                badgeText: `cycle ${metadata.cycle || metadata.cycleNumber || '?'}`,
                label: metadata.finishReason || ''
            },
            step: {
                borderColor: 'border-green-300',
                bgColor: 'bg-green-100',
                hoverColor: 'hover:bg-green-200',
                textColor: 'text-green-700',
                badgeVariant: 'success',
                badgeText: `step ${metadata.step}/${metadata.totalSteps}`,
                label: metadata.role || ''
            },
            branch: {
                borderColor: 'border-green-300',
                bgColor: 'bg-green-100',
                hoverColor: 'hover:bg-green-200',
                textColor: 'text-green-700',
                badgeVariant: 'success',
                badgeText: 'branch',
                label: metadata.role || ''
            },
            orchestration: {
                borderColor: 'border-slate-300',
                bgColor: 'bg-slate-200',
                hoverColor: 'hover:bg-slate-300',
                textColor: 'text-slate-700',
                badgeVariant: 'secondary',
                badgeText: 'orchestration',
                label: metadata.branch || ''
            },
            pipeline: {
                borderColor: 'border-indigo-300',
                bgColor: 'bg-indigo-100',
                hoverColor: 'hover:bg-indigo-200',
                textColor: 'text-indigo-700',
                badgeVariant: 'info',
                badgeText: 'pipeline',
                label: metadata.stage || ''
            },
            tool: {
                borderColor: 'border-teal-300',
                bgColor: 'bg-teal-100',
                hoverColor: 'hover:bg-teal-200',
                textColor: 'text-teal-700',
                badgeVariant: 'info',
                badgeText: metadata.tool || 'tool',
                label: ''
            },
            llm_exchange: {
                borderColor: 'border-cyan-300',
                bgColor: 'bg-cyan-100',
                hoverColor: 'hover:bg-cyan-200',
                textColor: 'text-cyan-700',
                badgeVariant: 'info',
                badgeText: 'llm exchange',
                label: metadata.model || ''
            }
        };

        return configs[type] || configs.execution;
    }
</script>

{#snippet renderBoundary(node, depth, config)}
    {@const key = `${node.type}-${node.boundaryId}`}
    {@const isCollapsed = !expanded.has(key)}
    {@const showData = showRawData.has(key)}
    {@const stage = node.metadata?.stage}
    {@const latestMsg = getLatestEventMsg(node)}

    <div class="max-w-6xl mx-auto">
        <div class="border-l-1 {config.borderColor} pl-1">
            <div class="flex items-stretch gap-1 group">
                <button
                    onclick={() => toggle(key)}
                    class="flex-1 text-left px-2 py-1 {config.bgColor} {config.hoverColor} {config.textColor} rounded text-xs transition-colors"
                >
                    <div class="flex items-center gap-2">
                        <svg class="w-3 h-3 transition-transform {isCollapsed ? '' : 'rotate-90'}" fill="currentColor" viewBox="0 0 20 20">
                            <path d="M6 6L14 10L6 14V6Z" />
                        </svg>
                        <Badge variant={config.badgeVariant} size="sm">
                            {config.badgeText}
                        </Badge>
                        {#if config.label}
                            <span class="font-semibold">
                                {config.label}
                            </span>
                        {/if}
                        {#if latestMsg}
                            <span class="text-xs opacity-70">
                                {latestMsg}
                            </span>
                        {/if}
                    </div>
                </button>
                <button
                    onclick={(e) => { e.stopPropagation(); expandAll(node); }}
                    class="px-2 py-1 {config.bgColor} {config.hoverColor} {config.textColor} rounded text-xs transition-all opacity-0 group-hover:opacity-100"
                    title="Expand all"
                    aria-label="Expand all"
                >
                    <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 7l3-4 3 4M9 17l3 4 3-4M7 9l-4 3 4 3M17 9l4 3-4 3" />
                    </svg>
                </button>
                <button
                    onclick={(e) => { e.stopPropagation(); collapseAll(node); }}
                    class="px-2 py-1 {config.bgColor} {config.hoverColor} {config.textColor} rounded text-xs transition-all opacity-0 group-hover:opacity-100"
                    title="Collapse all"
                    aria-label="Collapse all"
                >
                    <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 4l3 4 3-4M9 20l3-4 3 4M4 9l4 3-4 3M20 9l-4 3 4 3" />
                    </svg>
                </button>
                <button
                    onclick={() => toggleRawData(key)}
                    class="px-2 py-1 {config.bgColor} {config.hoverColor} {config.textColor} rounded text-xs transition-all opacity-0 group-hover:opacity-100"
                    title={showData ? 'Show normal view' : 'Show raw data'}
                >
                    {#if showData}
                        <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    {:else}
                        <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                        </svg>
                    {/if}
                </button>
            </div>
            {#if !isCollapsed}
                {#if showData}
                    <!-- Raw data view -->
                    <div class="ml-2 mt-2">
                        <JSONView data={node} />
                    </div>
                {:else}
                    <!-- Normal view -->
                    {#if node.type === 'pipeline' && stage}
                        <!-- Stage-specific view -->
                        {#if stage === 'signal_detection'}
                            <div class="ml-2 mt-2 px-3 py-2 bg-white rounded border border-indigo-100">
                                <SignalDetectionView {node} />
                            </div>
                        {:else if stage === 'fact_aggregation'}
                            <div class="ml-2 mt-2 px-3 py-2 bg-white rounded border border-indigo-100">
                                <FactAggregationView {node} />
                            </div>
                        {:else if stage === 'rule_evaluation'}
                            <div class="ml-2 mt-2 px-3 py-2 bg-white rounded border border-indigo-100">
                                <RuleEvaluationView {node} />
                            </div>
                        {:else if stage === 'plan_selection'}
                            <div class="ml-2 mt-2 px-3 py-2 bg-white rounded border border-indigo-100">
                                <PlanSelectionView {node} />
                            </div>
                        {:else if stage === 'instruction_composition'}
                            <div class="ml-2 mt-2 px-3 py-2 bg-white rounded border border-indigo-100">
                                <InstructionCompositionView {node} />
                            </div>
                        {/if}
                    {:else if node.type === 'tool'}
                        <!-- Tool execution view -->
                        <div class="ml-2 mt-2 px-3 py-2 bg-white rounded border border-teal-100">
                            <ToolExecutionView {node} />
                        </div>
                    {:else if node.type === 'llm_exchange'}
                        <!-- LLM exchange view -->
                        <div class="ml-2 mt-2 px-3 py-2 bg-white rounded border border-cyan-100">
                            <LLMExchangeView {node} />
                        </div>
                    {/if}

                    <!-- Child nodes -->
                    {#if node.children}
                        <div class="mt-1 space-y-1">
                            {#each node.children as child (child.eventId)}
                                {@render renderNode(child, depth + 1)}
                            {/each}
                        </div>
                    {/if}
                {/if}
            {/if}
        </div>
    </div>
{/snippet}

{#snippet renderNode(node, depth = 0)}
    {#if node.type === 'session'}
        <!-- Session boundary - render its children -->
        {#each node.children || [] as child (child.eventId)}
            {@render renderNode(child, depth)}
        {/each}
    {:else if node.type === 'turn'}
        <!-- Turn boundary - transparent container for conversational exchange -->
        {#each node.children || [] as child (child.eventId)}
            {@render renderNode(child, depth)}
        {/each}
        <!-- Fork button at end of turn if turn is complete -->
        {#if node.status === 'complete' && node.endTime && typeof node.metadata?.index !== 'undefined'}
            <div class="max-w-6xl mx-auto mb-2 flex justify-center">
                <button
                    onclick={async () => {
                        const response = await fetch(`/api/sessions/${sessionId}/fork`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ forkPoint: node.metadata.index })
                        });
                        const result = await response.json();
                        if (result.success) {
                            window.location.hash = `#/run/sessions/${result.sessionId}/thread`;
                        }
                    }}
                    class="px-3 py-1.5 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded text-xs transition-colors flex items-center gap-2"
                    title="Fork conversation from here"
                >
                    <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                    </svg>
                    <span>fork</span>
                </button>
            </div>
        {/if}
    {:else if node.type === 'event'}
        <!-- Generic event node -->
        {#if node.eventType === 'session.input'}
            {@const key = `event-${node.eventId}`}
            {@const showData = showRawData.has(key)}
            <div class="max-w-6xl ml-auto mb-4">
                <div class="flex items-stretch gap-1">
                    <div class="flex-1">
                        {#if showData}
                            <JSONView data={node} />
                        {:else}
                            <MessageEvent {node} role="user" {formatTimestamp} {copyToClipboard} />
                        {/if}
                    </div>
                    <button
                        onclick={() => toggleRawData(key)}
                        class="px-2 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded text-xs transition-colors self-start transition-all opacity-0 hover:opacity-100"
                        title={showData ? 'Show normal view' : 'Show raw data'}
                    >
                        {#if showData}
                            <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        {:else}
                            <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                            </svg>
                        {/if}
                    </button>
                </div>
            </div>
        {:else if node.eventType === 'session.response'}
            {@const key = `event-${node.eventId}`}
            {@const showData = showRawData.has(key)}
            <div class="max-w-6xl mr-auto mb-4">
                <div class="flex items-stretch gap-1 group">
                    <div class="flex-1">
                        {#if showData}
                            <JSONView data={node} />
                        {:else}
                            <MessageEvent {node} role="assistant" {formatTimestamp} {copyToClipboard} />
                        {/if}
                    </div>
                    <button
                        onclick={() => toggleRawData(key)}
                        class="px-2 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded text-xs transition-colors self-start transition-all opacity-0 group-hover:opacity-100"
                        title={showData ? 'Show normal view' : 'Show raw data'}
                    >
                        {#if showData}
                            <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        {:else}
                            <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                            </svg>
                        {/if}
                    </button>
                </div>
            </div>
        {:else}
            <!-- Other event types - show full data for debugging -->
            <GenericEventView {node} {depth} {toggleRawData} {showRawData} {sessionId} />
        {/if}
    {:else if ['execution', 'cycle', 'step', 'branch', 'orchestration', 'pipeline', 'tool', 'llm_exchange'].includes(node.type)}
        <!-- Boundary nodes -->
        {@const config = getBoundaryConfig(node)}
        {@render renderBoundary(node, depth, config)}
    {:else}
        <!-- Fallback for unknown node types -->
        <div class="px-2 py-1 bg-gray-50 text-gray-600 rounded text-xs max-w-6xl mx-auto mb-1">
            <span class="font-mono opacity-70">
                {node.type}: {node.eventType || ''}
            </span>
        </div>
    {/if}
{/snippet}

<div class="h-full flex flex-row">
    <!-- Main content area -->
    <div class="flex-1 flex flex-col min-w-0">
        {#if session.isLoading && session.loadingFrom === null}
            <div class="flex-1 flex items-center justify-center">
                <EmptyState
                    variant="loading"
                    title="Loading session..."
                    description="Fetching conversation history"
                />
            </div>
        {:else if session.error}
            <div class="flex-1 flex items-center justify-center">
                <EmptyState
                    variant="error"
                    title="Error loading session"
                    description={session.error}
                />
            </div>
        {:else if !session.thread?.children || session.thread.children.length === 0}
            <div class="flex-1 flex items-center justify-center">
                <EmptyState
                    variant="empty"
                    title="No messages yet"
                    description={sessionId ? 'This session has no messages' : 'Start a new session to begin'}
                />
            </div>
        {:else}
            <div class="relative flex-1 overflow-hidden">
                <div
                    class="absolute inset-0 overflow-y-auto p-8 pr-22 space-y-4"
                    bind:this={scrollContainer}
                    onscroll={handleScroll}
                >
                    {#each session.thread.children as node (node.eventId)}
                        {@render renderNode(node)}
                    {/each}
                </div>

                {#if shouldShowJumpButton}
                    <div class="absolute bottom-6 right-6">
                        <Button
                            variant="primary"
                            size="sm"
                            onclick={jumpToBottom}
                            class="shadow-lg"
                        >
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 14l-7 7m0 0l-7-7m7 7V3"></path>
                            </svg>
                        </Button>
                    </div>
                {/if}
            </div>
        {/if}
    </div>
</div>
