<script>
    import { onMount } from 'svelte';

    let count = $state(0);
    let confirming = $state(false);
    let busy = $state(false);
    let refreshing = false;

    async function refresh() {
        if (refreshing) return; // don't stack polls if the broker is briefly slow
        refreshing = true;
        try {
            const res = await fetch('/api/sessions/interrupt-all');
            if (!res.ok) return;
            const data = await res.json();
            count = data.count ?? 0;
            if (count === 0) confirming = false;
        } catch {
            // Broker down or unreachable: nothing to interrupt.
            count = 0;
            confirming = false;
        } finally {
            refreshing = false;
        }
    }

    async function interruptAll() {
        if (busy) return;
        busy = true;
        try {
            await fetch('/api/sessions/interrupt-all', { method: 'POST' });
            window.dispatchEvent(new CustomEvent('sessions-refresh'));
        } catch (error) {
            console.error('Error interrupting all sessions:', error);
        } finally {
            busy = false;
            confirming = false;
            await refresh();
        }
    }

    onMount(() => {
        refresh();
        const handleRefresh = () => refresh();
        window.addEventListener('sessions-refresh', handleRefresh);
        // Poll so the count tracks turns that complete without a console action —
        // including cross-client (voice) turns, which never fire sessions-refresh.
        const interval = setInterval(refresh, 3000);
        return () => {
            window.removeEventListener('sessions-refresh', handleRefresh);
            clearInterval(interval);
        };
    });
</script>

{#if count > 0}
    {#if confirming}
        <div class="flex items-center gap-1">
            <span class="text-xs text-gray-600">Interrupt {count}?</span>
            <button
                onclick={interruptAll}
                disabled={busy}
                class="border rounded px-2 py-1 bg-red-600 text-white border-red-700 hover:bg-red-700 disabled:opacity-50"
            >
                {busy ? 'Interrupting…' : 'Yes'}
            </button>
            <button
                onclick={() => (confirming = false)}
                disabled={busy}
                class="border rounded px-2 py-1 bg-gray-50 text-gray-700 border-gray-300 hover:bg-gray-200 disabled:opacity-50"
            >
                No
            </button>
        </div>
    {:else}
        <button
            onclick={() => (confirming = true)}
            title="Interrupt all live turns (the broker stays up)"
            class="border rounded px-2 py-1 bg-red-50 text-red-700 border-red-300 hover:bg-red-100 hover:border-red-500"
        >
            Interrupt All ({count})
        </button>
    {/if}
{/if}
