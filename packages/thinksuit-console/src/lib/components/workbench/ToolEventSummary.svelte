<script>
    import { Badge } from '$lib/components/ui/index.js';

    let { event } = $props();

    // Extract tool name from msg or data
    const toolName = $derived(() => {
        if (event.data?.toolName) return event.data.toolName;
        if (event.data?.name) return event.data.name;
        // Try to extract from msg like "Tool execution start: list_directory"
        const match = event.msg?.match(/:\s*(\w+)$/);
        return match ? match[1] : 'unknown';
    });

    // Determine status from event type
    const status = $derived(() => {
        const eventType = event.event;
        if (eventType.endsWith('.start')) return 'started';
        if (eventType.endsWith('.requested')) return 'requested';
        if (eventType.endsWith('.approved')) return 'approved';
        if (eventType.endsWith('.denied')) return 'denied';
        if (eventType.endsWith('.executed')) return 'executed';
        if (eventType.endsWith('.complete')) return 'complete';
        return 'unknown';
    });

    const statusVariant = $derived(() => {
        const s = status();
        if (s === 'approved' || s === 'complete') return 'success';
        if (s === 'denied') return 'danger';
        if (s === 'executed') return 'info';
        return 'secondary';
    });
</script>

<div class="text-sm flex items-center gap-2 flex-wrap">
    <span class="font-medium text-gray-700">Tool:</span>
    <Badge variant="info" size="xs">{toolName()}</Badge>
    <Badge variant={statusVariant()} size="xs">{status()}</Badge>
</div>
