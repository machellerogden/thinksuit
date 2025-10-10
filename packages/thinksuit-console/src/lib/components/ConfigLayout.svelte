<script>
    import { location } from '$lib/components/HashRouter.svelte';
    import { Tabs } from '$lib/components/ui/index.js';
    import ConfigViewer from '$lib/components/ConfigViewer.svelte';
    import UserConfigEditor from '$lib/components/UserConfigEditor.svelte';

    let { params } = $props();

    // Determine active tab from URL
    let activeTab = $derived(params?.tab || 'resolved');

    function setTab(tab) {
        location.assign(`/config/${tab.value}`);
    }

    const tabs = [
        { value: 'resolved', label: 'Resolved Config' },
        { value: 'user', label: 'User Config' }
    ];
</script>

<div class="h-full flex flex-col">
    <div class="border-b border-gray-200 px-6 pt-4">
        <Tabs {tabs} {activeTab} onTabChange={setTab} />
    </div>
    <div class="flex-1 overflow-hidden">
        {#if activeTab === 'resolved'}
            <ConfigViewer />
        {:else if activeTab === 'user'}
            <UserConfigEditor />
        {/if}
    </div>
</div>
