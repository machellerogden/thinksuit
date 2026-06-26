<script>
    import { onMount } from 'svelte';

    // Assign a designation name to a session. Reused by the per-row menu and the
    // open-session toolbar. Self-fetches existing names for suggestions so callers
    // stay dumb. Calls onDone(true) on success, onDone(false) on cancel.
    let { sessionId, onDone = () => {} } = $props();

    let name = $state('');
    let saving = $state(false);
    let error = $state(null);
    let names = $state([]);

    onMount(async () => {
        try {
            const res = await fetch('/api/designations');
            if (res.ok) names = Object.keys((await res.json()).designations || {});
        } catch {
            // suggestions are best-effort
        }
    });

    async function submit() {
        const value = name.trim();
        if (!value || saving) return;
        saving = true;
        error = null;
        try {
            const res = await fetch('/api/designations', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: value, sessionId })
            });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data.error || 'Failed to designate');
            }
            window.dispatchEvent(new CustomEvent('designations-refresh'));
            onDone(true);
        } catch (e) {
            error = e.message;
        } finally {
            saving = false;
        }
    }

    function onKeydown(e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            submit();
        } else if (e.key === 'Escape') {
            onDone(false);
        }
    }
</script>

<div class="px-3 py-2">
    <div class="text-xs text-gray-700 mb-2">Designate as…</div>
    <input
        type="text"
        list="designation-name-suggestions"
        bind:value={name}
        onkeydown={onKeydown}
        placeholder="name (e.g. voice)"
        class="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500"
    />
    <datalist id="designation-name-suggestions">
        {#each names as n}
            <option value={n}></option>
        {/each}
    </datalist>
    {#if error}
        <div class="text-xs text-red-600 mt-1">{error}</div>
    {/if}
    <div class="flex gap-2 mt-2">
        <button
            onclick={() => onDone(false)}
            disabled={saving}
            class="flex-1 px-2 py-1 text-xs border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50"
        >
            Cancel
        </button>
        <button
            onclick={submit}
            disabled={saving || !name.trim()}
            class="flex-1 px-2 py-1 text-xs bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50"
        >
            {saving ? 'Saving…' : 'Designate'}
        </button>
    </div>
</div>
