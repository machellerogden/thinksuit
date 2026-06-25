<script>
    import { onMount } from 'svelte';
    import { Card, Button, EmptyState } from '$lib/components/ui/index.js';

    let triggers = $state([]);
    let actions = $state(['converse', 'new']);
    let loading = $state(true);
    let error = $state(null);
    let busy = $state(null); // name of the trigger with an action in flight

    let enabledNames = $derived(triggers.filter((t) => t.enabled).map((t) => t.name));

    async function load() {
        try {
            const res = await fetch('/api/voice/triggers');
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to load triggers');
            triggers = data.triggers;
            actions = data.actions ?? actions;
            error = null;
        } catch (e) {
            error = e.message;
        } finally {
            loading = false;
        }
    }

    async function send(name, method, body) {
        busy = name;
        try {
            const res = await fetch(`/api/voice/triggers/${encodeURIComponent(name)}${method.path ?? ''}`, {
                method: method.verb,
                headers: body ? { 'Content-Type': 'application/json' } : undefined,
                body: body ? JSON.stringify(body) : undefined
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || 'Action failed');
            await load();
        } catch (e) {
            error = e.message;
        } finally {
            busy = null;
        }
    }

    const patch = (name, body) => send(name, { verb: 'PATCH' }, body);
    const promote = (name) => send(name, { verb: 'POST', path: '/promote' }, {});

    function del(name) {
        if (!confirm(`Delete trigger "${name}"? This removes its model and samples.`)) return;
        send(name, { verb: 'DELETE' });
    }

    const pct = (x) => (x == null ? '—' : `${(x * 100).toFixed(1)}%`);
    const num = (x, d = 2) => (x == null ? '—' : Number(x).toFixed(d));

    onMount(load);
</script>

<div class="h-full overflow-y-auto">
    <div class="p-6 space-y-4 max-w-4xl mx-auto">
        <div class="flex items-center justify-between mb-1">
            <h1 class="text-xl font-bold">Trigger Word Studio</h1>
            <Button variant="secondary" onclick={load} disabled={loading || busy !== null}>Refresh</Button>
        </div>
        <p class="text-xs text-gray-500">
            Listening set: <span class="font-mono">{enabledNames.length ? enabledNames.join(', ') : '(none)'}</span>
            · changes apply on the next voice service restart.
        </p>

        {#if error}
            <div class="bg-red-50 border border-red-200 rounded p-3 text-sm text-red-700">
                <strong>Error:</strong> {error}
            </div>
        {/if}

        {#if loading}
            <EmptyState type="loading" title="Loading triggers…" message="Reading the trigger library" />
        {:else if triggers.length === 0}
            <EmptyState
                title="No triggers yet"
                message="Create one with the CLI: thinksuit-voice trigger init <name> --phrase '…'. In-UI enrollment and training are coming in the next slice."
            />
        {:else}
            {#each triggers as t (t.name)}
                <Card>
                    <div class="flex items-start justify-between gap-4">
                        <div class="min-w-0">
                            <div class="flex items-center gap-2">
                                <span
                                    class="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0 {t.enabled ? 'bg-green-500' : 'bg-gray-300'}"
                                ></span>
                                <span class="font-semibold text-gray-800">{t.name}</span>
                                <span class="text-sm text-gray-500 truncate">"{t.phrase}"</span>
                            </div>
                            <div class="mt-1 text-xs text-gray-500">
                                current={t.current || '—'} · {t.versionCount} version{t.versionCount === 1 ? '' : 's'}
                                · samples {t.samples.positive}/{t.samples.negative}
                                {#if t.metrics}
                                    · recall={pct(t.metrics.recall)} aut={num(t.metrics.aut, 3)} fpph={num(t.metrics.fpph, 1)}
                                {/if}
                            </div>
                        </div>
                        <div class="flex items-center gap-2 flex-shrink-0">
                            {#if t.enabled}
                                <Button variant="danger" size="sm" disabled={busy !== null} onclick={() => patch(t.name, { enabled: false })}>
                                    Disable
                                </Button>
                            {:else}
                                <Button variant="success" size="sm" disabled={busy !== null} onclick={() => patch(t.name, { enabled: true })}>
                                    Enable
                                </Button>
                            {/if}
                        </div>
                    </div>

                    <div class="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
                        <label class="flex items-center gap-2">
                            <span class="text-gray-600">Action</span>
                            <select
                                class="rounded-md border border-gray-300 px-2 py-1 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                value={t.binding}
                                disabled={busy !== null}
                                onchange={(e) => patch(t.name, { binding: e.currentTarget.value })}
                            >
                                {#each actions as a (a)}
                                    <option value={a}>{a}</option>
                                {/each}
                            </select>
                        </label>

                        <label class="flex items-center gap-2">
                            <span class="text-gray-600">Threshold</span>
                            <input
                                type="number"
                                min="0"
                                max="1"
                                step="0.05"
                                value={t.threshold}
                                disabled={busy !== null}
                                class="w-20 rounded-md border border-gray-300 px-2 py-1 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                onchange={(e) => patch(t.name, { threshold: parseFloat(e.currentTarget.value) })}
                            />
                        </label>

                        <div class="ml-auto flex items-center gap-2">
                            {#if t.versionCount > 1}
                                <Button variant="default" size="sm" disabled={busy !== null} onclick={() => promote(t.name)}>
                                    Promote latest
                                </Button>
                            {/if}
                            <Button variant="ghost" size="sm" disabled={busy !== null} onclick={() => del(t.name)}>
                                Delete
                            </Button>
                        </div>
                    </div>
                </Card>
            {/each}
        {/if}
    </div>
</div>
