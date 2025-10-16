<script>
    import { onMount } from 'svelte';
    import { SvelteSet } from 'svelte/reactivity';
    import { EmptyState, Dropdown, Button } from '$lib/components/ui/index.js';

    let {
        selectedSessionId = null,
        baseRoute = '/inspect/sessions',
        defaultView = 'timeline',
        searchFilter = '',
        selectMode = false,
        onExitSelectMode = () => {}
    } = $props();

    let sessions = $state([]);
    let loading = $state(false);
    let error = $state(null);
    let confirmDeleteSessionId = $state(null);
    let deleting = $state(false);
    let selectedSessions = new SvelteSet();
    let confirmBulkDelete = $state(false);

    let filteredSessions = $derived(sessions.filter(session => {
        if (!searchFilter) return true;
        const search = searchFilter.toLowerCase();
        return session.id.toLowerCase().includes(search) ||
            (session.firstInput && session.firstInput.toLowerCase().includes(search));
    }));

    let allSelected = $derived(
        filteredSessions.length > 0 &&
        filteredSessions.every(session => selectedSessions.has(session.id))
    );

    let someSelected = $derived(
        filteredSessions.some(session => selectedSessions.has(session.id)) && !allSelected
    );

    // Clear selections when exiting select mode
    $effect(() => {
        if (!selectMode) {
            selectedSessions.clear();
            confirmBulkDelete = false;
        }
    });

    onMount(async () => {
        await loadSessions();

        // Listen for refresh events
        function handleRefresh() {
            loadSessions();
        }

        window.addEventListener('sessions-refresh', handleRefresh);

        return () => {
            window.removeEventListener('sessions-refresh', handleRefresh);
        };
    });

    async function loadSessions() {
        try {
            loading = true;
            error = null;
            const response = await fetch('/api/sessions');
            if (!response.ok) throw new Error('Failed to load sessions');
            sessions = await response.json();
        } catch (err) {
            error = err.message;
            console.error('Error loading sessions:', err);
        } finally {
            loading = false;
        }
    }

    export function refresh() {
        loadSessions();
    }

    async function handleDeleteSession(sessionId) {
        try {
            deleting = true;
            const response = await fetch(`/api/sessions/${sessionId}`, {
                method: 'DELETE'
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to delete session');
            }

            confirmDeleteSessionId = null;
            await loadSessions();

            // Dispatch refresh event for other components
            window.dispatchEvent(new CustomEvent('sessions-refresh'));
        } catch (err) {
            error = err.message;
            console.error('Error deleting session:', err);
        } finally {
            deleting = false;
        }
    }

    function toggleSessionSelection(sessionId) {
        if (selectedSessions.has(sessionId)) {
            selectedSessions.delete(sessionId);
        } else {
            selectedSessions.add(sessionId);
        }
    }

    function toggleSelectAll() {
        if (allSelected) {
            // Deselect all filtered sessions
            filteredSessions.forEach(session => {
                selectedSessions.delete(session.id);
            });
        } else {
            // Select all filtered sessions
            filteredSessions.forEach(session => {
                selectedSessions.add(session.id);
            });
        }
    }

    async function handleBulkDelete() {
        try {
            deleting = true;
            const sessionIds = Array.from(selectedSessions);

            // Delete sessions sequentially to avoid overwhelming the system
            for (const sessionId of sessionIds) {
                const response = await fetch(`/api/sessions/${sessionId}`, {
                    method: 'DELETE'
                });

                if (!response.ok) {
                    const errorData = await response.json();
                    console.error(`Failed to delete session ${sessionId}:`, errorData.error);
                }
            }

            confirmBulkDelete = false;
            selectedSessions.clear();
            await loadSessions();

            // Dispatch refresh event for other components
            window.dispatchEvent(new CustomEvent('sessions-refresh'));

            // Exit select mode after successful bulk delete
            onExitSelectMode();
        } catch (err) {
            error = err.message;
            console.error('Error during bulk delete:', err);
        } finally {
            deleting = false;
        }
    }
</script>

<div class="flex-1 overflow-y-auto">
    {#if loading}
        <EmptyState type="loading" />
    {:else if error}
        <EmptyState type="error" message={error} />
    {:else if filteredSessions.length === 0}
        <EmptyState
            type="empty"
            title={searchFilter ? 'No matching sessions' : 'No sessions found'}
            message={searchFilter ? 'Try a different search term' : 'Sessions will appear here once created'}
        />
    {:else}
        {#each filteredSessions as session (session.id)}
            <div class="relative group border-b border-gray-200 hover:bg-indigo-50 {selectedSessionId === session.id && !selectMode ? 'bg-gray-100' : ''}">
                {#if selectMode}
                    <!-- Select mode: clickable area with checkbox -->
                    <div
                        class="flex items-start gap-3 p-4 cursor-pointer"
                        onclick={() => toggleSessionSelection(session.id)}
                    >
                        <input
                            type="checkbox"
                            checked={selectedSessions.has(session.id)}
                            class="mt-0.5 h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                            onclick={(e) => e.stopPropagation()}
                            onchange={() => toggleSessionSelection(session.id)}
                        />
                        <div class="flex-1 min-w-0">
                            <div class="font-medium text-sm">
                                {session.id}
                            </div>
                            {#if session.firstInput}
                                <div class="text-xs text-gray-600 truncate mt-1">{session.firstInput}</div>
                            {/if}
                            <div class="text-xs text-gray-500 mt-1">
                                {session.lineCount} entries • {new Date(session.timestamp).toLocaleString()}
                            </div>
                        </div>
                    </div>
                {:else}
                    <!-- Normal mode: link with dropdown -->
                    <a
                        href="#/{baseRoute}/{session.id}/{defaultView}"
                        class="block p-4 pr-12"
                    >
                        <div class="font-medium text-sm">
                            {session.id}
                        </div>
                        {#if session.firstInput}
                            <div class="text-xs text-gray-600 truncate mt-1">{session.firstInput}</div>
                        {/if}
                        <div class="text-xs text-gray-500 mt-1">
                            {session.lineCount} entries • {new Date(session.timestamp).toLocaleString()}
                        </div>
                    </a>

                    <!-- Actions dropdown -->
                    <div class="absolute right-2 top-2">
                        <Dropdown align="right">
                            {#snippet trigger()}
                                <button
                                    class="p-2 rounded hover:bg-gray-200 opacity-0 group-hover:opacity-100 transition-opacity"
                                    onclick={(e) => e.preventDefault()}
                                >
                                    <svg class="w-4 h-4 text-gray-600" fill="currentColor" viewBox="0 0 16 16">
                                        <circle cx="8" cy="2" r="1.5"/>
                                        <circle cx="8" cy="8" r="1.5"/>
                                        <circle cx="8" cy="14" r="1.5"/>
                                    </svg>
                                </button>
                            {/snippet}
                            {#snippet children()}
                                {#if confirmDeleteSessionId === session.id}
                                    <!-- Confirmation state -->
                                    <div class="px-3 py-2">
                                        <div class="text-xs text-gray-700 mb-2">Delete session?</div>
                                        <div class="flex gap-2">
                                            <button
                                                onclick={(e) => {
                                                    e.stopPropagation();
                                                    confirmDeleteSessionId = null;
                                                }}
                                                disabled={deleting}
                                                class="flex-1 px-2 py-1 text-xs border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50"
                                            >
                                                Cancel
                                            </button>
                                            <button
                                                onclick={(e) => {
                                                    e.stopPropagation();
                                                    handleDeleteSession(session.id);
                                                }}
                                                disabled={deleting}
                                                class="flex-1 px-2 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
                                            >
                                                {deleting ? 'Deleting...' : 'Delete'}
                                            </button>
                                        </div>
                                    </div>
                                {:else}
                                    <!-- Normal state -->
                                    <button
                                        onclick={(e) => {
                                            e.stopPropagation();
                                            confirmDeleteSessionId = session.id;
                                        }}
                                        class="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                                        role="menuitem"
                                    >
                                        Delete Session
                                    </button>
                                {/if}
                            {/snippet}
                        </Dropdown>
                    </div>
                {/if}
            </div>
        {/each}
    {/if}
</div>

<!-- Fixed action bar for select mode -->
<div class="sticky bottom-0 border-t border-gray-300 bg-white p-3">
    <div class="flex items-center justify-between gap-3">
        {#if !confirmBulkDelete}
            <div class="flex items-center gap-1">
                <button
                    onclick={() => selectMode = !selectMode}
                    class="px-2 py-2 rounded-md transition-colors {selectMode ? 'bg-indigo-100 text-indigo-700' : 'text-gray-600 hover:text-gray-800 hover:bg-gray-100'}"
                    title={selectMode ? 'Cancel selection' : 'Select sessions'}
                    aria-label={selectMode ? 'Cancel selection' : 'Select sessions'}
                >
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"></path>
                    </svg>
                </button>
                {#if selectMode}
                    <button
                        onclick={toggleSelectAll}
                        class="px-2 py-2 rounded-md transition-colors text-gray-600 hover:text-gray-800 hover:bg-gray-100"
                        title={allSelected ? 'Deselect all' : 'Select all'}
                        aria-label={allSelected ? 'Deselect all' : 'Select all'}
                    >
                        {#if allSelected}
                            <!-- Checked checkbox -->
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                                <rect x="3" y="3" width="18" height="18" rx="2" stroke-linecap="round" stroke-linejoin="round"/>
                                <path d="M9 12l2 2l4-4" stroke-linecap="round" stroke-linejoin="round"/>
                            </svg>
                        {:else if someSelected}
                            <!-- Indeterminate checkbox -->
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                                <rect x="3" y="3" width="18" height="18" rx="2" stroke-linecap="round" stroke-linejoin="round"/>
                                <path d="M8 12h8" stroke-linecap="round" stroke-linejoin="round"/>
                            </svg>
                        {:else}
                            <!-- Empty checkbox -->
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                                <rect x="3" y="3" width="18" height="18" rx="2" stroke-linecap="round" stroke-linejoin="round"/>
                            </svg>
                        {/if}
                    </button>
                {/if}
            </div>
        {/if}
        {#if selectMode}
            {#if confirmBulkDelete}
            <!-- Confirmation state -->
                <div class="text-sm text-gray-700">
                    Delete {selectedSessions.size} session{selectedSessions.size !== 1 ? 's' : ''}?
                </div>
                <div class="flex gap-2">
                    <Button
                        variant="default"
                        size="sm"
                        onclick={() => confirmBulkDelete = false}
                        disabled={deleting}
                    >
                        Cancel
                    </Button>
                    <Button
                        variant="danger"
                        size="sm"
                        onclick={handleBulkDelete}
                        disabled={deleting}
                    >
                        {deleting ? 'Deleting...' : 'Delete'}
                    </Button>
                </div>
            {:else}
            <!-- Normal state -->
                <div class="text-xs text-gray-600">
                    {selectedSessions.size} selected
                </div>
                <Button
                    variant="danger"
                    size="sm"
                    onclick={() => confirmBulkDelete = true}
                    disabled={selectedSessions.size === 0}
                >
                    Delete
                </Button>
            {/if}
        {/if}
    </div>
</div>
