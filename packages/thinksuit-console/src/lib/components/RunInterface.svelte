<script>
    import { Card, Button } from '$lib/components/ui/index.js';
    import SessionThread from '$lib/components/SessionThread.svelte';
    import SessionInspector from '$lib/components/SessionInspector.svelte';
    import SessionControls from '$lib/components/SessionControls.svelte';
    import RunSidebarLeft from '$lib/components/RunSidebarLeft.svelte';
    import RunSidebarRight from '$lib/components/RunSidebarRight.svelte';
    import { getSession, canSubmitToSession, loadSession } from '$lib/stores/session.svelte.js';
    import { ui } from '$lib/stores/ui.svelte.js';
    import { registerHotkey } from '$lib/stores/hotkeys.svelte.js';
    import { SESSION_EVENTS } from 'thinksuit/constants/events';
    import { subscribeToSessionEvents } from '$lib/utils/sessionEvents.js';
    import { onDestroy, onMount } from 'svelte';

    let { params = {} } = $props();

    // Extract session ID, view, and eventId from route params
    let routeSessionId = $derived(params.id || null);
    let routeView = $derived(params.view || 'thread');
    let routeEventId = $derived(params.eventId || null);

    let input = $state('');
    let trace = $state(false);
    let cwd = $state('');  // Working directory for tools
    let isSubmitting = $state(false);
    let searchFilter = $state('');
    let isCancelling = $state(false);
    let approvalQueue = $state([]);
    let sessionControlsComponent = $state();

    const session = getSession();


    // Fetch default working directory from config on mount
    onMount(async () => {
        try {
            const response = await fetch('/api/config');
            if (response.ok) {
                const config = await response.json();
                // Use cwd from config if available, otherwise use workingDirectory from sources
                cwd = config.cwd || config._sources?.workingDirectory || '';
            }
        } catch (error) {
            console.error('Failed to fetch config for default cwd:', error);
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
            const response = await fetch('/api/run', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    input: input.trim(),
                    trace,
                    cwd: cwd.trim() || undefined,  // Include working directory if provided
                    sessionId: targetSessionId || undefined
                })
            });

            const result = await response.json();

            if (response.ok) {
                console.log('ThinkSuit started:', result);

                if (result.sessionId) {
                    console.log(`Session ${result.sessionId} status: ${result.status}`);
                    window.location.hash = `#/run/sessions/${result.sessionId}/thread`;

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
            }
        } catch (error) {
            console.error('Error submitting to ThinkSuit:', error);
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
            (notification) => {
                // Trigger a session update event - SessionThread will handle incremental loading
                window.dispatchEvent(new CustomEvent('session-updated', {
                    detail: { sessionId }
                }));
            },
            (error) => {
            // Silently ignore SSE errors - they're often from browser reconnection attempts
                // and don't affect functionality
            }
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

    // Re-subscribe when route session changes
    $effect(() => {
        if (routeSessionId) {
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
                body: JSON.stringify({ approved: true })
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
                body: JSON.stringify({ approved: false })
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
        <div class="flex-1 flex flex-col bg-white">
            <!-- View Switcher -->
            {#if routeSessionId}
                <div class="border-b border-gray-200 bg-white">
                    <div class="flex gap-2 p-1.5">
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
                    </div>
                </div>
            {/if}

            <!-- Content View -->
            <div class="flex-1 overflow-y-auto">
                {#if routeSessionId}
                    {#if routeView === 'inspect'}
                        <SessionInspector sessionId={routeSessionId} />
                    {:else}
                        <SessionThread sessionId={routeSessionId} targetEventId={routeEventId} bind:approvalQueue />
                    {/if}
                {:else}
                    <div class="h-full flex items-center justify-center p-8">
                        <div class="text-center max-w-md">
                            <img src="/favicon.svg" alt="ThinkSuit" class="w-16 h-16 mx-auto mb-4" />
                            <h3 class="text-2xl font-extralight text-gray-800 mb-4">Welcome to <span class="font-serif font-semibold">ThinkSuit</span>.</h3>
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
            <SessionControls
                bind:this={sessionControlsComponent}
                bind:input
                bind:trace
                bind:cwd
                bind:isSubmitting
                bind:isCancelling
                onSubmit={handleSubmit}
                onCancel={handleCancel}
            />
        </div>

        <!-- Right Sidebar: Tool Approvals -->
        <RunSidebarRight
            {approvalQueue}
            onApprove={handleApprove}
            onDeny={handleDeny}
        />
    </div>
</div>
