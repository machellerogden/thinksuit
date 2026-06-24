<script>
    import { onMount } from 'svelte';
    import { Card, Button, EmptyState } from '$lib/components/ui/index.js';

    let services = $state([]);
    let loading = $state(true);
    let error = $state(null);
    let busy = $state(null); // `${label}:${action}` while an action is in flight

    async function load() {
        try {
            const res = await fetch('/api/services');
            if (!res.ok) throw new Error('Failed to load services');
            const data = await res.json();
            services = data.services || [];
            error = null;
        } catch (e) {
            error = e.message;
        } finally {
            loading = false;
        }
    }

    async function act(svc, action) {
        busy = `${svc.label}:${action}`;
        try {
            const res = await fetch('/api/services', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ label: svc.label, action })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Action failed');
            await load();
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
        <div class="flex items-center justify-between mb-2">
            <h1 class="text-xl font-bold">Services</h1>
            <Button variant="secondary" onclick={load} disabled={loading || busy !== null}>Refresh</Button>
        </div>

        {#if error}
            <div class="bg-red-50 border border-red-200 rounded p-3 text-sm text-red-700">
                <strong>Error:</strong> {error}
            </div>
        {/if}

        {#if loading}
            <EmptyState title="Loading services..." description="Querying launchd" variant="loading" />
        {:else}
            <div class="space-y-3">
                {#each services as svc (svc.label)}
                    <Card>
                        <div class="p-4 flex items-center justify-between gap-4">
                            <div class="flex items-center gap-3 min-w-0">
                                <span
                                    class="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0 {svc.running ? 'bg-green-500' : 'bg-gray-300'}"
                                ></span>
                                <div class="min-w-0">
                                    <div class="text-sm font-semibold text-gray-800">{svc.name}</div>
                                    <div class="text-xs font-mono text-gray-500 truncate">
                                        {svc.label} · {svc.running ? `running (pid ${svc.pid})` : svc.state}
                                    </div>
                                </div>
                            </div>
                            <div class="flex items-center gap-2 flex-shrink-0">
                                <Button
                                    variant="success"
                                    onclick={() => act(svc, 'start')}
                                    disabled={busy !== null || svc.running}
                                >
                                    Start
                                </Button>
                                <Button
                                    variant="secondary"
                                    onclick={() => act(svc, 'restart')}
                                    disabled={busy !== null || svc.self}
                                >
                                    Restart
                                </Button>
                                <Button
                                    variant="danger"
                                    onclick={() => act(svc, 'stop')}
                                    disabled={busy !== null || svc.self || !svc.running}
                                >
                                    Stop
                                </Button>
                            </div>
                        </div>
                        {#if svc.self}
                            <div class="px-4 pb-3 text-xs text-gray-500">
                                Manage the console service from a terminal — stopping it here would kill this page.
                            </div>
                        {/if}
                    </Card>
                {/each}
            </div>
        {/if}
    </div>
</div>
