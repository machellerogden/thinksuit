<script>
    import { Sidebar, Button } from '$lib/components/ui/index.js';
    import SessionList from './SessionList.svelte';
    import { ui } from '$lib/stores/ui.svelte.js';
    import { onMount } from 'svelte';

    let { selectedSessionId = null, searchFilter = $bindable('') } = $props();

    let searchInput = $state();
    let selectMode = $state(false);

    onMount(() => {
        const handleFocusSessionList = () => {
            if (ui.leftSidebarCollapsed) {
                ui.leftSidebarCollapsed = false;
            }
            setTimeout(() => {
                searchInput?.focus();
            }, 50);
        };

        window.addEventListener('focus-session-list', handleFocusSessionList);
        return () => window.removeEventListener('focus-session-list', handleFocusSessionList);
    });
</script>

<Sidebar
    bind:collapsed={ui.leftSidebarCollapsed}
    width="w-80"
    collapsedWidth="w-12"
    side="left"
    class="bg-white"
>
    <!-- New Session button -->
    <div class="p-4 border-b border-gray-200 font-indigo-700">
        <Button href="#/run" variant="subtle" size="sm" class="w-full justify-start gap-2">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path>
            </svg>

            {#if !ui.leftSidebarCollapsed}
                <span class="text-sm font-medium">New Session</span>
            {/if}
        </Button>
    </div>

    <!-- Search filter -->
    <div class="p-4 border-b border-gray-300">
        <div class="flex gap-2">
            <input
                bind:this={searchInput}
                type="text"
                bind:value={searchFilter}
                placeholder="Search sessions..."
                class="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                disabled={ui.leftSidebarCollapsed || selectMode}
            />
            <button
                onclick={() => window.dispatchEvent(new CustomEvent('sessions-refresh'))}
                class="px-2 py-2 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-md transition-colors"
                title="Refresh sessions"
                aria-label="Refresh sessions"
            >
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
                </svg>
            </button>
        </div>
    </div>

    <!-- Session List -->
    <SessionList
        {selectedSessionId}
        baseRoute="run/sessions"
        defaultView="workbench"
        {searchFilter}
        collapsed={ui.leftSidebarCollapsed}
        {selectMode}
        onExitSelectMode={() => selectMode = false}
    />

    {#snippet collapsedContent()}
        <div class="flex flex-col h-full">
            <!-- Collapsed New Session button -->
            <div class="border-b border-gray-200 p-2">
                <Button href="#/run" variant="subtle" size="xs" class="w-full" title="New Session">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path>
                    </svg>
                </Button>
            </div>
            <!-- Collapsed sessions icon -->
            <div class="flex-1 flex items-center justify-center">
                <svg class="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-4l-4 4v-4z"></path>
                </svg>
            </div>
        </div>
    {/snippet}
</Sidebar>
