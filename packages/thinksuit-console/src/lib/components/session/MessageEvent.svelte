<script>
    import { Card, Badge } from '$lib/components/ui/index.js';
    import { formatTime } from '$lib/utils/time.js';

    let {
        node,
        role = 'user', // 'user' or 'assistant'
        copyToClipboard = async () => {}
    } = $props();

    const content = $derived(role === 'user' ? node.data?.input : node.data?.response);
    const variant = $derived(role === 'user' ? 'chat' : 'chat');
    const alignment = $derived(role === 'user' ? 'ml-auto' : 'mr-auto');
</script>

<Card
    {variant}
    padding="md"
    class="max-w-6xl {alignment} relative transition-all duration-300"
    data-event-id={node.eventId}
>
    <div class="flex items-start justify-between gap-3 mb-2">
        <Badge variant="primary" size="sm">{role}</Badge>
        <div class="flex items-center gap-2">
            <span class="text-xs text-gray-500">
                {formatTime(node.time)}
            </span>
            <button
                onclick={() => copyToClipboard(content || '')}
                class="px-1.5 py-0.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded text-xs transition-colors"
                title="Copy message content"
                aria-label="Copy message content"
            >
                <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
            </button>
        </div>
    </div>
    <div class="text-md whitespace-pre-wrap p-3">
        {content || ''}
    </div>
</Card>
