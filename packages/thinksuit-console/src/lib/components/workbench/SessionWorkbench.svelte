<script>
    import { tick } from 'svelte';
    import { SvelteSet } from 'svelte/reactivity';
    import { getSession } from '$lib/stores/session.svelte.js';
    import { Badge, Button } from '$lib/components/ui/index.js';
    import EventCard from './EventCard.svelte';
    import MessageSummary from './MessageSummary.svelte';
    import PlanSummary from './PlanSummary.svelte';
    import LLMRequestSummary from './LLMRequestSummary.svelte';
    import LLMResponseSummary from './LLMResponseSummary.svelte';
    import ToolEventSummary from './ToolEventSummary.svelte';
    import {
        SESSION_EVENTS,
        ORCHESTRATION_EVENTS,
        EXECUTION_EVENTS,
        PROCESSING_EVENTS,
        SYSTEM_EVENTS
    } from 'thinksuit/constants/events';

    // Auto-scroll constants
    const USER_SCROLL_OVERRIDE_DURATION = 500;
    const AT_BOTTOM_THRESHOLD = 5;
    const NEAR_BOTTOM_THRESHOLD = 100;

    let { sessionId = null } = $props();
    const session = getSession();

    // Track sessionId changes to reset local state and ensure reactivity
    let previousSessionId = $state(null);
    $effect(() => {
        // Read from session store to create reactive dependency
        const _ = session.entries;
        if (sessionId !== previousSessionId) {
            expandedTurns.clear();
            expandedEvents.clear();
            // Reset scroll state on session change
            isInitialLoad = true;
            atBottom = true;
            nearBottom = true;
            userScrollOverride = false;
            clearTimeout(scrollTimeout);
            previousSessionId = sessionId;
        }
    });

    // Track which turns are expanded (by turn ID)
    let expandedTurns = new SvelteSet();

    // Track which individual events are expanded (by event ID)
    let expandedEvents = new SvelteSet();

    // Auto-scroll state
    let scrollContainer = $state(null);
    let atBottom = $state(true);
    let nearBottom = $state(true);
    let userScrollOverride = $state(false);
    let isInitialLoad = $state(true);
    let scrollTimeout = null;

    // Auto-scroll when content changes
    $effect(() => {
        if (atBottom && !userScrollOverride && turnGroups.length && scrollContainer) {
            tick().then(() => {
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

    // Listen for user input submission to scroll to bottom
    $effect(() => {
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

        window.addEventListener('user-submitted-input', handleUserSubmit);

        return () => {
            window.removeEventListener('user-submitted-input', handleUserSubmit);
        };
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

    function toggleTurn(turnId) {
        if (expandedTurns.has(turnId)) {
            expandedTurns.delete(turnId);
        } else {
            expandedTurns.add(turnId);
        }
    }

    function toggleEvent(eventId) {
        if (expandedEvents.has(eventId)) {
            expandedEvents.delete(eventId);
        } else {
            expandedEvents.add(eventId);
        }
    }

    // Synthetic event type for paired LLM request/response
    const LLM_EXCHANGE = 'processing.llm.exchange';

    // Whitelist for intermediate events shown in expanded view
    const WHITELISTED_EVENTS = new Set([
        ORCHESTRATION_EVENTS.START,
        EXECUTION_EVENTS.SEQUENTIAL_STEP_START,
        EXECUTION_EVENTS.SEQUENTIAL_STEP_COMPLETE,
        PROCESSING_EVENTS.LLM_REQUEST,
        PROCESSING_EVENTS.LLM_RESPONSE,
        SYSTEM_EVENTS.BUDGET_EXCEEDED,
        EXECUTION_EVENTS.TOOL_START,
        EXECUTION_EVENTS.TOOL_COMPLETE,
        EXECUTION_EVENTS.TOOL_ERROR,
        LLM_EXCHANGE
    ]);

    // Group events by turn: input -> intermediate events -> response
    const turnGroups = $derived((() => {
        const groups = [];
        let currentTurn = null;

        for (let i = 0; i < session.entries.length; i++) {
            const entry = session.entries[i];

            if (entry.event === SESSION_EVENTS.INPUT) {
                // Start a new turn group
                currentTurn = {
                    type: 'turn',
                    id: getEventId(entry),
                    turnStart: null,
                    input: { entry, originalIndex: i },
                    intermediateEvents: [],
                    response: null,
                    turnComplete: null,
                    isComplete: false
                };
                groups.push(currentTurn);
            } else if (entry.event === SESSION_EVENTS.TURN_START && currentTurn) {
                currentTurn.turnStart = { entry, originalIndex: i };
            } else if (entry.event === SESSION_EVENTS.RESPONSE && currentTurn) {
                currentTurn.response = { entry, originalIndex: i };
            } else if (entry.event === SESSION_EVENTS.TURN_COMPLETE && currentTurn) {
                currentTurn.turnComplete = { entry, originalIndex: i };
                currentTurn.isComplete = true;
            } else if (currentTurn) {
                // All other events go to intermediate (whether before or after response)
                currentTurn.intermediateEvents.push({ entry, originalIndex: i });
            } else {
                // Orphan event (before first input) - show as standalone
                groups.push({
                    type: 'standalone',
                    id: getEventId(entry),
                    entry,
                    originalIndex: i
                });
            }
        }

        return groups;
    })());

    // Show jump-to-bottom button when not near bottom and there is content
    let shouldShowJumpButton = $derived(!nearBottom && turnGroups.length > 0);

    // Filter and transform intermediate events for expanded view
    function filterIntermediateEvents(events) {
        return events.reduce((acc, { entry, originalIndex }) => {
            if (!WHITELISTED_EVENTS.has(entry.event)) return acc;

            // Filter out orchestration.start without plan name
            if (entry.event === ORCHESTRATION_EVENTS.START && !entry.data?.selectedPlan?.name) return acc;

            // When we see a request, create an exchange shape
            if (entry.event === PROCESSING_EVENTS.LLM_REQUEST) {
                acc.push({
                    entry: {
                        ...entry,
                        event: LLM_EXCHANGE,
                        request: entry,
                        response: null
                    },
                    originalIndex
                });
                return acc;
            }

            // When we see a response, attach to last pending exchange
            if (entry.event === PROCESSING_EVENTS.LLM_RESPONSE) {
                for (let i = acc.length - 1; i >= 0; i--) {
                    if (acc[i].entry.event === LLM_EXCHANGE && !acc[i].entry.response) {
                        acc[i].entry.response = entry;
                        break;
                    }
                }
                return acc;
            }

            acc.push({ entry, originalIndex });
            return acc;
        }, []);
    }

    // Helper to check event type categories
    function isPlan(event) {
        return event.event === ORCHESTRATION_EVENTS.START && event.data?.selectedPlan;
    }

    function isLLMExchange(event) {
        return event.event === LLM_EXCHANGE;
    }

    function isBudgetExceeded(event) {
        return event.event === SYSTEM_EVENTS.BUDGET_EXCEEDED;
    }

    function isToolEvent(event) {
        return event.event === EXECUTION_EVENTS.TOOL_START ||
               event.event === EXECUTION_EVENTS.TOOL_COMPLETE ||
               event.event === EXECUTION_EVENTS.TOOL_ERROR;
    }

    // Events with always-visible labels when expanded
    function isHighlightedEvent(event) {
        return event.event === ORCHESTRATION_EVENTS.START ||
               event.event === EXECUTION_EVENTS.SEQUENTIAL_STEP_START ||
               event.event === EXECUTION_EVENTS.SEQUENTIAL_STEP_COMPLETE;
    }

    // Get label for timeline circle
    function getEventLabel(event) {
        switch (event.event) {
            case ORCHESTRATION_EVENTS.START:
                return event.data?.selectedPlan?.name || 'Plan';
            case EXECUTION_EVENTS.SEQUENTIAL_STEP_START:
                return `Step ${event.step ?? '?'}: ${event.role} - started`;
            case EXECUTION_EVENTS.SEQUENTIAL_STEP_COMPLETE:
                return `Step ${event.step ?? '?'}: ${event.role} - complete`;
            case LLM_EXCHANGE:
                return event.response ? 'LLM Exchange' : 'LLM Request...';
            case SYSTEM_EVENTS.BUDGET_EXCEEDED:
                return 'Budget Exceeded';
            case EXECUTION_EVENTS.TOOL_ERROR:
                return event.data?.error || 'tool error';
            case EXECUTION_EVENTS.TOOL_START:
                return event.data?.tool || 'tool start';
            case EXECUTION_EVENTS.TOOL_COMPLETE:
                return event.data?.request?.tool || 'tool' + event.data?.success ? ' succeeded' : ' failed';
            default:
                return event.event || 'Event';
        }
    }

    function getEventId(entry) {
        return entry.eventId ?? `${entry.event}-${entry.time}`;
    }
</script>

<div class="h-full flex flex-col">
    <div class="relative flex-1 overflow-hidden">
        <div
            class="absolute inset-0 overflow-y-auto p-4 pb-32"
            bind:this={scrollContainer}
            onscroll={handleScroll}
        >
            {#if session.isLoading && !session.entries.length}
                <div class="text-gray-500">Loading...</div>
            {:else if session.error}
                <div class="text-red-500">{session.error}</div>
            {:else if turnGroups.length === 0}
                <div class="text-gray-500">No events</div>
            {:else}
                <div class="relative">
                    <!-- Vertical center line - spans exactly this wrapper -->
                    <div class="absolute left-1/2 top-2 bottom-8 w-1 bg-gray-200 -translate-x-1/2 z-0"></div>

            {#each turnGroups as group (group.id)}
            {#if group.type === 'turn'}

                <!-- User Input - always full card -->
                <div class="mb-4 relative">
                    <EventCard event={group.input.entry}>
                        <MessageSummary event={group.input.entry} />
                    </EventCard>
                </div>

                <!-- Intermediate Events - collapsed or expanded -->
                {@const isExpanded = expandedTurns.has(group.id)}
                {@const hasIntermediateEvents = group.intermediateEvents.length > 0}

                {#if hasIntermediateEvents}
                    <div class="flex flex-col items-center relative pt-1 pb-5">
                        {#if isExpanded}
                            <!-- Expanded: minus button + all intermediate events -->
                            <button
                                type="button"
                                class="w-6 h-6 rounded-full bg-indigo-400 hover:bg-indigo-500 flex items-center justify-center text-white cursor-pointer mb-2"
                                onclick={() => toggleTurn(group.id)}
                                aria-label="Collapse intermediate events"
                            >
                                <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 12H4" />
                                </svg>
                            </button>

                            <!-- Render filtered intermediate events -->
                            {#each filterIntermediateEvents(group.intermediateEvents) as { entry, originalIndex } (getEventId(entry))}
                                {@const eventId = getEventId(entry)}
                                {@const isEventExpanded = expandedEvents.has(eventId)}
                                <div class="flex flex-col items-center py-2 relative w-full">
                                    <button
                                        type="button"
                                        class="cursor-pointer flex items-center justify-center relative w-full group"
                                        onclick={() => toggleEvent(eventId)}
                                    >
                                        <div
                                            class="flex items-center justify-center"
                                        >
                                            {#if isHighlightedEvent(entry)}
                                                <div class="w-6 h-6 rounded-full bg-gray-300 group-hover:bg-indigo-400 transition-colors"></div>
                                            {:else}
                                                <div class="w-3 h-3 rounded-full bg-gray-300 group-hover:bg-indigo-400 transition-all duration-200"></div>
                                            {/if}
                                        </div>
                                        {#if isHighlightedEvent(entry)}
                                            <span class="absolute left-1/2 ml-6 top-1/2 -translate-y-1/2 text-sm text-gray-600 whitespace-nowrap">{getEventLabel(entry)}</span>
                                        {:else}
                                            <span class="absolute left-1/2 ml-6 top-1/2 -translate-y-1/2 text-sm text-gray-400 whitespace-nowrap">{getEventLabel(entry)}</span>
                                        {/if}
                                    </button>

                                    <!-- Expanded event card - only shown when event is expanded -->
                                    {#if isEventExpanded}
                                        {#if isLLMExchange(entry)}
                                            <div class="w-full max-w-2xl mt-2">
                                                <EventCard event={entry}>
                                                    <div class="space-y-3">
                                                        <LLMRequestSummary event={{ ...entry.request, data: entry.request.data }} />
                                                        {#if entry.response}
                                                            <div class="border-t border-gray-100 pt-3">
                                                                <LLMResponseSummary event={entry.response} />
                                                            </div>
                                                        {:else}
                                                            <div class="text-xs text-gray-400 italic">Awaiting response...</div>
                                                        {/if}
                                                    </div>
                                                </EventCard>
                                            </div>
                                        {:else if isPlan(entry)}
                                            <div class="w-full max-w-2xl mt-2">
                                                <EventCard event={entry}>
                                                    <PlanSummary event={entry} />
                                                </EventCard>
                                            </div>
                                        {:else if isBudgetExceeded(entry)}
                                            <div class="w-full max-w-2xl mt-2">
                                                <EventCard event={entry}>
                                                    <div class="text-sm text-amber-700">
                                                        <Badge variant="warning" size="xs">Budget Exceeded</Badge>
                                                        <span class="ml-2">{entry.msg || 'Handler exceeded budget'}</span>
                                                    </div>
                                                </EventCard>
                                            </div>
                                        {:else if isToolEvent(entry)}
                                            <div class="w-full max-w-2xl mt-2">
                                                <EventCard event={entry}>
                                                    <ToolEventSummary event={entry} />
                                                </EventCard>
                                            </div>
                                        {:else}
                                            <div class="w-full max-w-2xl mt-2">
                                                <EventCard event={entry} />
                                            </div>
                                        {/if}
                                    {/if}
                                </div>
                            {/each}
                        {:else}
                            <!-- Collapsed: single plus button with status hint (only shown when processing) -->
                            {@const latestEvent = group.intermediateEvents[group.intermediateEvents.length - 1]?.entry}
                            {@const statusHint = !group.isComplete ? (latestEvent?.msg || latestEvent?.event || '') : ''}
                            <button
                                type="button"
                                class="relative cursor-pointer group flex items-center justify-center"
                                onclick={() => toggleTurn(group.id)}
                                aria-label="Expand intermediate events"
                            >
                                <div class="w-6 h-6 rounded-full bg-gray-300 group-hover:bg-indigo-400 flex items-center justify-center text-gray-600 group-hover:text-white transition-colors">
                                    <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
                                    </svg>
                                </div>
                                {#if statusHint}
                                    <span class="absolute left-full ml-3 top-1/2 -translate-y-1/2 text-sm text-gray-500 whitespace-nowrap">{statusHint}</span>
                                {/if}
                            </button>
                        {/if}
                    </div>
                {/if}

                <!-- System Response - always full card (if exists) -->
                {#if group.response}
                    <div class="mb-4 relative">
                        <EventCard event={group.response.entry}>
                            <MessageSummary event={group.response.entry} />
                        </EventCard>
                    </div>

                    {#if group.turnComplete}

                        <!-- Fork button after turn complete -->
                        <div class="flex justify-center pt-2 pb-6 relative z-10">
                            <button
                                type="button"
                                class="px-2 py-1 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded text-xs transition-colors flex items-center gap-1"
                                onclick={async () => {
                                    const forkPoint = group.turnComplete.originalIndex;
                                    const response = await fetch(`/api/sessions/${sessionId}/fork`, {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({ forkPoint })
                                    });
                                    const result = await response.json();
                                    if (result.success) {
                                        window.location.hash = `#/run/sessions/${result.sessionId}/workbench`;
                                    }
                                }}
                            >
                                <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                        d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                                </svg>
                                <span>fork</span>
                            </button>
                        </div>
                    {/if}
                {/if}
            {:else}
                <!-- Standalone event (orphan before first input) -->
                <div class="flex justify-center py-2 relative">
                    <div class="w-3 h-3 rounded-full bg-gray-300"></div>
                    <span class="absolute left-1/2 ml-4 top-1/2 -translate-y-1/2 text-xs text-gray-400 whitespace-nowrap">{group.entry.msg || group.entry.event}</span>
                </div>
            {/if}
            {/each}
                </div>
            {/if}
        </div>

        {#if shouldShowJumpButton}
            <div class="absolute bottom-4 right-4">
                <Button variant="primary" size="sm" onclick={jumpToBottom} class="shadow-lg">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 14l-7 7m0 0l-7-7m7 7V3"></path>
                    </svg>
                </Button>
            </div>
        {/if}
    </div>
</div>
