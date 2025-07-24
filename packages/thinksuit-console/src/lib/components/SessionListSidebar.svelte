<script>
    import { Sidebar } from '$lib/components/ui/index.js';
    import SessionList from './SessionList.svelte';

    let {
        selectedSessionId = null,
        baseRoute = '/inspect/sessions',
        defaultView = 'timeline'
    } = $props();

    let searchFilter = $state('');
    let sidebarCollapsed = $state(false);
    let sessionListRef = $state(null);

    export function refresh() {
        sessionListRef?.refresh();
    }
</script>

<Sidebar
    bind:collapsed={sidebarCollapsed}
    width="w-80"
    collapsedWidth="w-12"
>
    <!-- Search filter -->
    <div class="p-4 border-b border-gray-300">
        <input
            type="text"
            bind:value={searchFilter}
            placeholder="Search sessions..."
            class="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={sidebarCollapsed}
        />
    </div>

    <!-- Sessions list -->
    <SessionList
        bind:this={sessionListRef}
        {selectedSessionId}
        {baseRoute}
        {defaultView}
        {searchFilter}
        collapsed={sidebarCollapsed}
    />

    {#snippet collapsedContent()}
        <div class="flex-1 flex items-center justify-center">
            <svg class="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
            </svg>
        </div>
    {/snippet}
</Sidebar>