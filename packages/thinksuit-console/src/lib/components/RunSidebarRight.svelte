<script>
    import { Sidebar, Badge } from '$lib/components/ui/index.js';
    import { ui } from '$lib/stores/ui.svelte.js';
    import ToolApprovalPanel from './ToolApprovalPanel.svelte';

    let { approvalQueue = [], onApprove = () => {}, onDeny = () => {} } = $props();

    let pendingCount = $derived(approvalQueue.filter(a => a.status === 'pending').length);
    let hasPending = $derived(pendingCount > 0);
</script>

<Sidebar
    bind:collapsed={ui.rightSidebarCollapsed}
    width="w-80"
    collapsedWidth="w-12"
    side="right"
>
    <div class="flex flex-col h-full">
        {#if approvalQueue.length > 0}
            <!-- Panels -->
            <ToolApprovalPanel
                {approvalQueue}
                {onApprove}
                {onDeny}
            />
        {:else}
            <!-- Empty state -->
            <div class="flex-1 flex flex-col items-center justify-center text-gray-400 px-8">
                <svg class="w-12 h-12 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M13 10V3L4 14h7v7l9-11h-7z"></path>
                </svg>
                <p class="text-sm text-center">No pending approvals</p>
            </div>
        {/if}
    </div>

    {#snippet collapsedContent()}
        <div class="flex-1 flex flex-col items-center justify-center gap-4">
            {#if hasPending}
                <button
                    onclick={() => ui.rightSidebarCollapsed = false}
                    class="relative flex items-center justify-center cursor-pointer"
                    title="{pendingCount} pending tool approval{pendingCount !== 1 ? 's' : ''}"
                >
                    <div class="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-12 h-12 animate-ping rounded-full bg-amber-400 opacity-40"></div>
                    <Badge variant="warning" size="sm" bordered class="relative hover:scale-110 transition-transform">
                        {pendingCount}
                    </Badge>
                </button>
            {:else}
                <div class="flex items-center justify-center text-gray-400">
                    <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path>
                    </svg>
                </div>
            {/if}
        </div>
    {/snippet}
</Sidebar>
