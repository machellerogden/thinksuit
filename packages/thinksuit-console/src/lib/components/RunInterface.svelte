<script>
    import { Button, Dropdown } from '$lib/components/ui/index.js';
    import DesignateControl from '$lib/components/DesignateControl.svelte';
    import SessionThread from '$lib/components/SessionThread.svelte';
    import SessionInspector from '$lib/components/SessionInspector.svelte';
    import SessionWorkbench from '$lib/components/workbench/SessionWorkbench.svelte';
    import SessionControls from '$lib/components/SessionControls.svelte';
    import RunSidebarLeft from '$lib/components/RunSidebarLeft.svelte';
    import RunSidebarRight from '$lib/components/RunSidebarRight.svelte';
    import { canSubmitToSession, loadSession, getSession } from '$lib/stores/session.svelte.js';
    import { EXECUTION_EVENTS } from 'thinksuit/constants/events';
    import { registerHotkey } from '$lib/stores/hotkeys.svelte.js';
    import { subscribeToSessionEvents } from '$lib/utils/sessionEvents.js';
    import { onDestroy, onMount } from 'svelte';

    const session = getSession();

    let designateOpen = $state(false);

    let { params = {} } = $props();

    // Extract session ID, view, and eventId from route params
    let routeSessionId = $derived(params.id || null);
    let routeView = $derived(params.view || 'workbench');
    let routeEventId = $derived(params.eventId || null);

    // workdir is fixed at session creation. Once a session has any entries it is
    // established, so the input is read-only AND the value must not be sent —
    // resending it on resume trips provisionWorkspace's set-once guard.
    let workdirLocked = $derived(session.entries.length > 0);

    let input = $state('');
    let trace = $state(false);
    let workdir = $state('');  // Session home-base directory (immutable once the session exists)
    let selectedPlan = $state('');  // Manual plan override (JSON string)
    let frame = $state({ text: '' });  // Session context frame
    let modality = $state('text');  // Runtime modality (sibling to frame); console is a text caller
    let isSubmitting = $state(false);
    let searchFilter = $state('');
    let isCancelling = $state(false);
    let approvalQueue = $state([]);
    let sessionControlsComponent = $state();


    // Fetch default home-base directory (workdir) from config on mount
    onMount(async () => {
        try {
            const response = await fetch('/api/config');
            if (response.ok) {
                const config = await response.json();
                // Prefer workdir; fall back to the legacy cwd, then the resolved working dir
                workdir = config.workdir || config.cwd || config._sources?.workingDirectory || '';
            }
        } catch (error) {
            console.error('Failed to fetch config for default workdir:', error);
        }
    });

    // Register hotkey for focusing input and listen for focus events
    onMount(() => {
        // Ctrl+Alt+I: Focus input
        const inputHotkeyCleanup = registerHotkey('ctrl+alt+i', () => {
            if (sessionControlsComponent) {
                sessionControlsComponent.focus();
            }
        }, {
            description: 'Focus input',
            preventDefault: true,
            allowInInput: true
        });

        // Listen for focus-session-input event from new session hotkey
        const handleFocusInput = () => {
            if (sessionControlsComponent) {
                sessionControlsComponent.focus();
            }
        };
        window.addEventListener('focus-session-input', handleFocusInput);

        return () => {
            if (inputHotkeyCleanup) inputHotkeyCleanup();
            window.removeEventListener('focus-session-input', handleFocusInput);
        };
    });

    let activeSubscription = null;
    let activeSubscriptionSessionId = null;

    async function handleCancel() {
        if (isCancelling || !routeSessionId) return;

        isCancelling = true;
        try {
            const response = await fetch(`/api/session/${routeSessionId}/interrupt`, {
                method: 'POST'
            });

            const result = await response.json();

            if (response.ok && result.success) {
                console.log('Session interrupted successfully');
            // The session will update automatically via SSE
            } else {
                console.error('Failed to interrupt session:', result.error || 'Unknown error');
            }
        } catch (error) {
            console.error('Error interrupting session:', error);
        } finally {
            isCancelling = false;
        }
    }

    async function handleSubmit() {
        if (!input.trim() || isSubmitting) return;

        const targetSessionId = routeSessionId || null;

        // Check if we can submit
        if (!canSubmitToSession(targetSessionId)) {
            console.warn('Cannot submit while session is processing');
            return;
        }

        isSubmitting = true;

        // Signal intent to follow conversation at the bottom
        window.dispatchEvent(new CustomEvent('user-submitted-input', {
            detail: { sessionId: targetSessionId }
        }));

        try {
            // Parse selectedPlan if provided
            let parsedPlan;
            if (selectedPlan.trim()) {
                try {
                    parsedPlan = JSON.parse(selectedPlan.trim());
                } catch (error) {
                    console.error('Invalid plan JSON:', error);
                    alert('Invalid plan JSON: ' + error.message);
                    isSubmitting = false;
                    return;
                }
            }

            const response = await fetch('/api/run', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    input: input.trim(),
                    trace,
                    workdir: workdirLocked ? undefined : (workdir.trim() || undefined),  // Only at session creation; never resend on resume
                    selectedPlan: parsedPlan || undefined,  // Include plan override if provided
                    frame: frame.text?.trim() ? frame : undefined,  // Include frame if provided
                    modality: modality || undefined,  // Runtime modality (sibling to frame)
                    sessionId: targetSessionId || undefined
                })
            });

            const result = await response.json();

            if (response.ok) {
                console.log('ThinkSuit started:', result);

                if (result.sessionId) {
                    console.log(`Session ${result.sessionId} status: ${result.status}`);
                    window.location.hash = `#/run/sessions/${result.sessionId}/workbench`;

                    // Trigger sidebar refresh to show new session
                    window.dispatchEvent(new CustomEvent('sessions-refresh'));

                    // Subscribe to session events - this will catch the input event when it's written
                    subscribeToSessionUpdates(result.sessionId);
                } else {
                    // New session - we'll need to get ID from logs/polling
                    console.log('New session started. Waiting for session ID...');
                }

                // Clear input for next message
                input = '';
            } else {
                console.error('Error response:', result);
                alert(`Run failed: ${result.error || `HTTP ${response.status}`}`);
            }
        } catch (error) {
            console.error('Error submitting to ThinkSuit:', error);
            alert(`Run failed: ${error.message}`);
        } finally {
            isSubmitting = false;
        }
    }

    function subscribeToSessionUpdates(sessionId) {
        // If already subscribed to this session, don't restart
        if (activeSubscriptionSessionId === sessionId && activeSubscription) {
            return;
        }

        // Close any existing subscription to a different session
        if (activeSubscription) {
            activeSubscription.close();
        }

        activeSubscriptionSessionId = sessionId;

        // Subscribe to real-time events
        activeSubscription = subscribeToSessionEvents(
            sessionId,
            ({ sessionId, type, msg, data }) => {
                // Trigger a session update event - SessionThread will handle incremental loading
                window.dispatchEvent(new CustomEvent('session-updated', {
                    detail: { sessionId, type, msg, data }
                }));
            },
            (_error) => {} // Silently ignore SSE errors for now - they're usually from browser reconnection attempts
        );
    }

    // Cleanup subscription on destroy
    onDestroy(() => {
        if (activeSubscription) {
            activeSubscription.close();
            activeSubscription = null;
            activeSubscriptionSessionId = null;
        }
    });

    // Load session and subscribe when route session changes
    let previousRouteSessionId = null;
    $effect(() => {
        // Only run when routeSessionId actually changes
        if (routeSessionId === previousRouteSessionId) return;
        previousRouteSessionId = routeSessionId;

        if (routeSessionId) {
            loadSession(routeSessionId);
            subscribeToSessionUpdates(routeSessionId);
        } else {
            // No session - clear everything
            if (activeSubscription) {
                activeSubscription.close();
                activeSubscription = null;
                activeSubscriptionSessionId = null;
            }
            // Clear the session store when navigating to new session
            loadSession(null);
            // Clear approval queue
            approvalQueue = [];
        }
    });

    // Handle incremental session loading from SSE events
    $effect(() => {
        function handleSessionUpdate(event) {
            if (event.detail.sessionId === routeSessionId && routeSessionId === session.id) {
                loadSession(routeSessionId, session.entries.length);
            }
        }

        window.addEventListener('session-updated', handleSessionUpdate);

        return () => {
            window.removeEventListener('session-updated', handleSessionUpdate);
        };
    });

    // Build approval queue from session entries
    $effect(() => {
        if (!session.entries || session.entries.length === 0) {
            approvalQueue = [];
            return;
        }

        const approvalStatuses = new Map();

        for (const entry of session.entries) {
            if (entry.event === EXECUTION_EVENTS.TOOL_APPROVAL_REQUESTED && entry.approvalId) {
                if (!approvalStatuses.has(entry.approvalId)) {
                    approvalStatuses.set(entry.approvalId, {
                        status: 'pending',
                        tool: entry.data?.tool,
                        args: entry.data?.args,
                        sessionId: entry.sessionId || routeSessionId,
                        time: entry.time
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

        const newQueue = [];
        for (const [approvalId, data] of approvalStatuses.entries()) {
            newQueue.push({
                approvalId,
                tool: data.tool,
                args: data.args,
                sessionId: data.sessionId,
                status: data.status,
                time: data.time
            });
        }

        approvalQueue = newQueue;
    });

    // Navigation helper
    function navigateToView(view) {
        if (routeSessionId) {
            window.location.hash = `#/run/sessions/${routeSessionId}/${view}`;
        }
    }

    // Approval handlers
    async function handleApprove(approvalId) {
        try {
            const response = await fetch(`/api/approvals/${approvalId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ approved: true, sessionId: routeSessionId })
            });
            if (!response.ok) {
                const error = await response.json();
                console.error('Failed to approve tool:', error);
            }
        } catch (error) {
            console.error('Error approving tool:', error);
        }
    }

    async function handleDeny(approvalId) {
        try {
            const response = await fetch(`/api/approvals/${approvalId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ approved: false, sessionId: routeSessionId })
            });
            if (!response.ok) {
                const error = await response.json();
                console.error('Failed to deny tool:', error);
            }
        } catch (error) {
            console.error('Error denying tool:', error);
        }
    }

</script>

<div class="h-full flex flex-col">
    <!-- Top Section: Three-Column Layout -->
    <div class="flex-1 min-h-0 flex bg-gray-50">
        <!-- Left Sidebar: Sessions -->
        <RunSidebarLeft
            selectedSessionId={routeSessionId}
            bind:searchFilter
        />
        <!-- Main Content Area -->
        <div class="flex-1 flex flex-col">
            <!-- View Switcher -->
            {#if routeSessionId}
                <div class="-mb-4 pb-4 bg-gradient-to-b from-indigo-50 from-20% via-violet-50 via-80% to-transparent to-100% z-10">
                    <div class="flex gap-2 px-1.5 pt-1.5">
                        <Button
                            variant="subtle"
                            size="xs"
                            active={routeView === 'workbench'}
                            onclick={() => navigateToView('workbench')}
                        >
                            Workbench
                        </Button>
                        <Button
                            variant="subtle"
                            size="xs"
                            active={routeView === 'thread'}
                            onclick={() => navigateToView('thread')}
                        >
                            Thread
                        </Button>
                        <Button
                            variant="subtle"
                            size="xs"
                            active={routeView === 'inspect'}
                            onclick={() => navigateToView('inspect')}
                        >
                            Inspect
                        </Button>
                        <Dropdown align="right" class="ml-auto" bind:open={designateOpen}>
                            {#snippet trigger()}
                                <Button variant="subtle" size="xs">Designate</Button>
                            {/snippet}
                            {#snippet children()}
                                <DesignateControl
                                    sessionId={routeSessionId}
                                    onDone={() => designateOpen = false}
                                />
                            {/snippet}
                        </Dropdown>
                    </div>
                </div>
            {/if}

            <!-- Content View -->
            <div class="flex-1 overflow-y-auto bg-gradient-to-t from-violet-50 to-indigo-50">
                {#if routeSessionId}
                    {#if routeView === 'inspect'}
                        <SessionInspector sessionId={routeSessionId} />
                    {:else if routeView === 'workbench'}
                        <SessionWorkbench sessionId={routeSessionId} />
                    {:else}
                        <SessionThread sessionId={routeSessionId} targetEventId={routeEventId} />
                    {/if}
                {:else}
                    <div class="h-full flex items-center justify-center p-8">
                        <div class="text-center max-w-md j">
                            <div class="mb-4 flex justify-center">
<div class="text-left text-gray-800 text-2xl leading-none font-mono whitespace-pre-wrap font-extralight">
&nbsp;   ┯
  ╭─┴─╮
 ╭┤◐ ◐├╯
  ╰┬─┬╯
   ╯ ╰</div>

                            </div>
                            <h3 class="text-2xl font-light text-gray-800 mb-4">Welcome to <span class="font-bold text-violet-500">ThinkSuit</span>.</h3>
                            <p class="text-md text-gray-600 mb-4">
                                Start a new conversation by entering a message below, or select an existing session from the sidebar.
                            </p>
                            <div class="text-xs text-gray-500">
                                Sessions are automatically saved and can be resumed at any time.
                            </div>
                        </div>
                    </div>
                {/if}
            </div>

            <!-- Input Area at Bottom -->
            <div class="relative p-8 -mt-4 pt-12 bg-transparent bg-gradient-to-t from-indigo-50 from-20% via-violet-50 via-95% to-transparent to-100%">
                <SessionControls
                    bind:this={sessionControlsComponent}
                    bind:input
                    bind:trace
                    bind:workdir
                    bind:selectedPlan
                    bind:frame
                    bind:modality
                    bind:isSubmitting
                    bind:isCancelling
                    onSubmit={handleSubmit}
                    onCancel={handleCancel}
                />
            </div>
        </div>

        <!-- Right Sidebar: Tool Approvals -->
        <RunSidebarRight
            {approvalQueue}
            onApprove={handleApprove}
            onDeny={handleDeny}
        />
    </div>
</div>
