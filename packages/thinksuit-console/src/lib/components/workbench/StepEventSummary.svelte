<script>
    import { Badge } from '$lib/components/ui/index.js';
    let { event } = $props();
</script>

<div class="text-sm flex items-center gap-2 flex-wrap whitespace-pre-wrap break-words">
    {#if event?.data?.output}
        {event.data.output}
    {:else}
        Step {event?.step} of {event?.totalSteps} - {event?.role}
    {/if}
</div>
