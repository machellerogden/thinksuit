<script>
    // Kill switch: stop every live turn at once. The broker daemon stays up.
    // Deliberately dumb — no count, no liveness query, no polling. Clicking with
    // nothing live is a harmless no-op.
    let busy = $state(false);

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
        }
    }
</script>

<button
    onclick={interruptAll}
    disabled={busy}
    title="Interrupt all live turns (the broker stays up)"
    class="border rounded px-2 py-1 bg-red-50 text-red-700 border-red-300 hover:bg-red-100 hover:border-red-500 disabled:opacity-50"
>
    {busy ? 'Interrupting…' : 'Interrupt All'}
</button>
