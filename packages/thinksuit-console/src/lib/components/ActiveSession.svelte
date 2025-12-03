<script>
    import { Badge, Copyable } from '$lib/components/ui/index.js';
    import { getSession } from '$lib/stores/session.svelte.js';

    const session = getSession();
</script>

{#if session.id}
    <div class="flex items-center gap-3 px-4 py-2 bg-gray-700 rounded-lg">
        <span class="text-sm text-gray-300">Session:</span>
        <div class="flex flex-col items-center gap-1">
            <a href={`#/run/sessions/${session.id}/workbench`} class="text-s text-blue-300">{session.id}</a>
            <span class="text-xs"><Copyable displayText="Copy Session ID" text={session.id} /></span>
        </div>
        <Badge
            variant={
                session.status === 'processing' ? 'warning' :
                    session.status === 'completed' ? 'success' :
                        session.status === 'failed' ? 'danger' :
                        'secondary'
            }
            size="sm"
        >
            {session.status || 'unknown'}
        </Badge>
        {#if session.messageCount > 0}
            <span class="text-xs text-gray-400">
                ({session.messageCount} {session.messageCount === 1 ? 'message' : 'messages'})
            </span>
        {/if}
    </div>
{/if}
