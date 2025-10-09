<script>
    import { onMount } from 'svelte';
    import { EmptyState } from '$lib/components/ui/index.js';

    let {
        selectedSessionId = null,
        baseRoute = '/inspect/sessions',
        defaultView = 'timeline',
        searchFilter = ''
    } = $props();

    let sessions = $state([]);
    let loading = $state(false);
    let error = $state(null);

    let filteredSessions = $derived(sessions.filter(session => {
        if (!searchFilter) return true;
        const search = searchFilter.toLowerCase();
        return session.id.toLowerCase().includes(search) ||
            (session.firstInput && session.firstInput.toLowerCase().includes(search));
    }));

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
            <a
                href="#/{baseRoute}/{session.id}/{defaultView}"
                class="block p-4 border-b border-gray-200 hover:bg-indigo-50 {selectedSessionId === session.id ? 'bg-gray-100' : ''}"
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
        {/each}
    {/if}
</div>
