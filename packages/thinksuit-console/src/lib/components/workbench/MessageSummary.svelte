<script>
    let { event } = $props();

    const isInput = $derived(event.event === 'session.input');

    const content = $derived(() => {
        const text = isInput ? event.data?.input : event.data?.response;
        if (!text) return '';
        if (typeof text !== 'string') return JSON.stringify(text).slice(0, 200);
        return text.length > 200 ? text.slice(0, 200) + '...' : text;
    });
</script>

<div class="text-sm {isInput ? 'text-blue-700' : 'text-gray-700'}">
    <span class="font-medium">{isInput ? 'User' : 'Assistant'}:</span>
    <span class="ml-2">{content()}</span>
</div>
