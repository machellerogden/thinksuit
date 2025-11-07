<script>
    import { Button, Badge } from '$lib/components/ui/index.js';
    import { SvelteSet } from 'svelte/reactivity';
    import { formatTime } from '$lib/utils/time.js';

    let { approvalQueue = [], onApprove = () => {}, onDeny = () => {} } = $props();

    let panelExpanded = $state(true);
    let expanded = new SvelteSet();
    let previousQueue = [];

    // Auto-expand new items and collapse completed ones
    $effect(() => {
        const previousIds = new Set(previousQueue.map(req => req.approvalId));

        // Auto-expand new pending items
        for (const request of approvalQueue) {
            if (!previousIds.has(request.approvalId) && request.status === 'pending') {
                expanded.add(request.approvalId);
            }
            // Collapse completed items
            if (request.status === 'approved' || request.status === 'denied') {
                expanded.delete(request.approvalId);
            }
        }

        previousQueue = approvalQueue;
    });

    function toggleExpanded(approvalId) {
        if (expanded.has(approvalId)) {
            expanded.delete(approvalId);
        } else {
            expanded.add(approvalId);
        }
    }

    function getStatusConfig(status) {
        const configs = {
            pending: {
                borderColor: 'border-amber-200',
                bgColor: 'bg-amber-50',
                badgeVariant: 'warning',
                badgeText: 'Pending'
            },
            approved: {
                borderColor: 'border-green-200',
                bgColor: 'bg-green-50',
                badgeVariant: 'success',
                badgeText: 'Approved'
            },
            denied: {
                borderColor: 'border-red-200',
                bgColor: 'bg-red-50',
                badgeVariant: 'danger',
                badgeText: 'Denied'
            }
        };
        return configs[status] || configs.pending;
    }

    let hasApprovals = $derived(approvalQueue.length > 0);

    // Sort queue: pending items first, then approved/denied
    let sortedQueue = $derived(
        [...approvalQueue].sort((a, b) => {
            // Pending items always come before non-pending
            if (a.status === 'pending' && b.status !== 'pending') return -1;
            if (a.status !== 'pending' && b.status === 'pending') return 1;
            // Within same status group, maintain original order (stable sort)
            return 0;
        })
    );
</script>

{#if hasApprovals}
    <div class="flex flex-col border-b border-gray-200">
        <!-- Panel Header -->
        <button
            onclick={() => panelExpanded = !panelExpanded}
            class="flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors border-b border-gray-200"
        >
            <div class="flex items-center gap-2">
                <svg
                    class="w-4 h-4 text-gray-600 transition-transform {panelExpanded ? 'rotate-90' : ''}"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                >
                    <path d="M6 6L14 10L6 14V6Z" />
                </svg>
                <span class="text-sm font-semibold text-gray-700">Approvals</span>
            </div>
            <Badge variant="warning" size="sm" bordered>{approvalQueue.length}</Badge>
        </button>

        <!-- Panel Content -->
        {#if panelExpanded}
            <div class="flex-1 overflow-y-auto">
                {#each sortedQueue as request (request.approvalId)}
                    {@const isExpanded = expanded.has(request.approvalId)}
                    {@const config = getStatusConfig(request.status)}
                    <div class="border-b {config.borderColor}">
                        <button
                            onclick={() => toggleExpanded(request.approvalId)}
                            class="w-full px-4 py-3 text-left {config.bgColor} transition-colors"
                        >
                            <div class="flex items-start justify-between gap-2">
                                <div class="flex-1 min-w-0">
                                    <div class="flex items-center gap-2 mb-1">
                                        <svg
                                            class="w-3 h-3 text-gray-500 transition-transform {isExpanded ? 'rotate-90' : ''}"
                                            fill="currentColor"
                                            viewBox="0 0 20 20"
                                        >
                                            <path d="M6 6L14 10L6 14V6Z" />
                                        </svg>
                                        <span class="text-sm font-mono text-purple-600 truncate">
                                            {request.tool || 'Unknown Tool'}
                                        </span>
                                    </div>
                                    <div class="text-xs text-gray-500 truncate">
                                        {formatTime(request.time)}
                                    </div>
                                </div>
                                {#key `${request.approvalId}-${request.status}`}
                                    <Badge variant={config.badgeVariant} size="sm" bordered>{config.badgeText}</Badge>
                                {/key}
                            </div>
                        </button>

                        {#if isExpanded}
                            <div class="px-4 pb-4 space-y-3 {config.bgColor}">
                                <!-- Tool Details -->
                                <div class="bg-white rounded-md p-3 text-sm border border-gray-200">
                                    <div class="font-semibold text-gray-700 mb-1">Arguments:</div>
                                    <div class="font-mono text-xs text-gray-600 break-all">
                                        {request.args || 'None'}
                                    </div>
                                </div>

                                {#if request.sessionId}
                                    <div class="text-xs text-gray-500">
                                        Session: <span class="font-mono">{request.sessionId}</span>
                                    </div>
                                {/if}

                                <!-- Warning -->
                                {#if request.status === 'pending'}
                                    <div class="bg-amber-50 border border-amber-200 rounded-md p-2 text-xs text-amber-800">
                                        This tool will access your file system.
                                    </div>
                                {/if}

                                <!-- Actions (only show for pending) -->
                                {#if request.status === 'pending'}
                                    <div class="flex gap-2">
                                        <Button
                                            variant="reject"
                                            size="sm"
                                            class="flex-1"
                                            onclick={() => onDeny(request.approvalId)}
                                        >
                                            Deny
                                        </Button>
                                        <Button
                                            variant="approve"
                                            size="sm"
                                            class="flex-1"
                                            onclick={() => onApprove(request.approvalId)}
                                        >
                                            Approve
                                        </Button>
                                    </div>
                                {/if}
                            </div>
                        {/if}
                    </div>
                {/each}
            </div>
        {/if}
    </div>
{/if}
