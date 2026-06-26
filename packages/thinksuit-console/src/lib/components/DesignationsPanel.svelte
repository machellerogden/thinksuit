<script>
    import { onMount } from 'svelte';

    let { selectedSessionId = null, baseRoute = 'run/sessions', defaultView = 'workbench' } = $props();

    // entries: [{ name, sessionId, firstInput }]
    let entries = $state([]);

    async function load() {
        try {
            const [dRes, sRes] = await Promise.all([
                fetch('/api/designations'),
                fetch('/api/sessions')
            ]);
            const designations = dRes.ok ? (await dRes.json()).designations || {} : {};
            const sessions = sRes.ok ? await sRes.json() : [];
            const byId = new Map(sessions.map(s => [s.id, s]));
            entries = Object.entries(designations)
                .map(([name, sessionId]) => ({
                    name,
                    sessionId,
                    firstInput: byId.get(sessionId)?.firstInput || null
                }))
                .sort((a, b) => a.name.localeCompare(b.name));
        } catch (err) {
            console.error('Error loading designations:', err);
        }
    }

    onMount(() => {
        load();
        const onRefresh = () => load();
        window.addEventListener('designations-refresh', onRefresh);
        window.addEventListener('sessions-refresh', onRefresh);
        return () => {
            window.removeEventListener('designations-refresh', onRefresh);
            window.removeEventListener('sessions-refresh', onRefresh);
        };
    });
</script>

{#if entries.length > 0}
    <div class="border-b border-gray-300">
        <div class="px-4 pt-3 pb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
            Designations
        </div>
        {#each entries as entry (entry.name)}
            <a
                href="#/{baseRoute}/{entry.sessionId}/{defaultView}"
                class="block px-4 py-2 hover:bg-indigo-50 {selectedSessionId === entry.sessionId ? 'bg-gray-100' : ''}"
            >
                <div class="flex items-baseline gap-2 min-w-0">
                    <span class="text-sm font-medium text-violet-600 shrink-0">◆ {entry.name}</span>
                    {#if entry.firstInput}
                        <span class="text-xs text-gray-600 truncate">{entry.firstInput}</span>
                    {/if}
                </div>
            </a>
        {/each}
    </div>
{/if}
