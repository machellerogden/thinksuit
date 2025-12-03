<script>
    import { Badge } from '$lib/components/ui/index.js';

    let { event } = $props();

    const plan = $derived(event.data?.selectedPlan);
    const name = $derived(plan?.name || '(unnamed)');
    const strategy = $derived(plan?.strategy || 'unknown');
    const role = $derived(plan?.role);
</script>

<div class="text-sm flex items-center gap-2 flex-wrap">
    <span class="font-medium text-gray-700">Plan:</span>
    <Badge variant="secondary" size="xs">{name}</Badge>
    <Badge variant="info" size="xs">{strategy}</Badge>
    {#if role}
        <Badge variant="success" size="xs">{role}</Badge>
    {/if}
</div>
