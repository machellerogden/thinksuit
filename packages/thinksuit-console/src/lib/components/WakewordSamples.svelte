<script>
    import { onMount } from 'svelte';
    import { Card, Button, EmptyState } from '$lib/components/ui/index.js';

    let { name, onDone } = $props();

    let loading = $state(true);
    let error = $state(null);
    let busy = $state(null); // `${kind}/${file}` of a delete in flight
    let samples = $state({ positive: [], negative: [] });

    const base = $derived(`/api/voice/wakewords/${encodeURIComponent(name)}/samples`);
    const clipUrl = (kind, file) => `${base}/${encodeURIComponent(file)}?kind=${kind}`;

    async function load() {
        loading = true;
        try {
            const res = await fetch(base);
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to load samples');
            samples = data;
            error = null;
        } catch (e) {
            error = e.message;
        } finally {
            loading = false;
        }
    }

    async function del(kind, file) {
        if (!confirm(`Delete ${kind} clip ${file}?`)) return;
        busy = `${kind}/${file}`;
        try {
            const res = await fetch(clipUrl(kind, file), { method: 'DELETE' });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || 'Failed to delete clip');
            samples = { ...samples, [kind]: samples[kind].filter((f) => f !== file) };
        } catch (e) {
            error = e.message;
        } finally {
            busy = null;
        }
    }

    onMount(load);
</script>

<div class="h-full overflow-y-auto">
    <div class="p-6 space-y-4 max-w-3xl mx-auto">
        <div class="flex items-center justify-between">
            <h1 class="text-xl font-bold">Samples · {name}</h1>
            <div class="flex items-center gap-2">
                <Button variant="secondary" onclick={load} disabled={loading}>Refresh</Button>
                <Button variant="secondary" onclick={() => onDone?.()}>Done</Button>
            </div>
        </div>

        {#if error}
            <div class="bg-red-50 border border-red-200 rounded p-3 text-sm text-red-700">
                <strong>Error:</strong> {error}
            </div>
        {/if}

        {#if loading}
            <EmptyState type="loading" title="Loading samples…" message="Reading the clip library" />
        {:else}
            {#each ['positive', 'negative'] as kind (kind)}
                <Card>
                    <h2 class="text-sm font-semibold text-gray-700 mb-3">
                        {kind === 'positive' ? 'Positives' : 'Negatives'} ({samples[kind].length})
                    </h2>
                    {#if samples[kind].length === 0}
                        <p class="text-xs text-gray-500">No {kind} clips yet.</p>
                    {:else}
                        <div class="space-y-2">
                            {#each samples[kind] as file (file)}
                                <div class="flex items-center gap-3">
                                    <span class="font-mono text-xs text-gray-500 w-32 flex-shrink-0">{file}</span>
                                    <audio controls preload="none" class="h-8 flex-1" src={clipUrl(kind, file)}></audio>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        disabled={busy === `${kind}/${file}`}
                                        onclick={() => del(kind, file)}
                                    >
                                        Delete
                                    </Button>
                                </div>
                            {/each}
                        </div>
                    {/if}
                </Card>
            {/each}
        {/if}
    </div>
</div>
