<script>
    let { event } = $props();

    const isInput = $derived(event.event === 'session.input');

    const content = $derived(() => {
        const text = isInput ? event.data?.input : event.data?.response;
        if (!text) return '';
        if (typeof text !== 'string') return JSON.stringify(text);
        return text;
    });
</script>

<div class="text-sm {isInput ? 'text-blue-700' : 'text-gray-700'}">
    <span class="font-medium">{isInput ? 'User' : 'Assistant'}:</span>
    <span
        class="ml-2 whitespace-pre-wrap break-words"
    >{content()}</span>
</div>
