<script>
    import { onMount } from 'svelte';
    import { Card, Button, EmptyState } from '$lib/components/ui/index.js';

    let status = $state(null);
    let loading = $state(true);
    let error = $state(null); // unexpected error
    let down = $state(false); // daemon not running (socket absent)
    let busy = $state(null); // action in flight

    let micOn = $derived(status?.micOn ?? false);

    async function load() {
        try {
            const res = await fetch('/api/voice/control');
            const data = await res.json();
            if (res.status === 503) {
                down = true;
                status = null;
                error = null;
                return;
            }
            if (!res.ok) throw new Error(data.error || 'Failed to load voice status');
            status = data.status;
            down = false;
            error = null;
        } catch (e) {
            error = e.message;
        } finally {
            loading = false;
        }
    }

    async function act(action) {
        busy = action;
        try {
            const res = await fetch('/api/voice/control', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action })
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

    onMount(() => {
        load();
        const id = setInterval(load, 2000);
        return () => clearInterval(id);
    });

    const fmtAgo = (at) => (at ? `${Math.round((Date.now() - at) / 1000)}s ago` : '—');
    function fmtUptime(ms) {
        if (!ms) return '—';
        const s = Math.floor(ms / 1000);
        if (s < 60) return `${s}s`;
        const m = Math.floor(s / 60);
        if (m < 60) return `${m}m ${s % 60}s`;
        return `${Math.floor(m / 60)}h ${m % 60}m`;
    }
</script>

<div class="h-full overflow-y-auto">
    <div class="p-6 space-y-4 max-w-3xl mx-auto">
        <div class="flex items-center justify-between mb-2">
            <h1 class="text-xl font-bold">Voice</h1>
            <Button variant="secondary" onclick={load} disabled={loading || busy !== null}>Refresh</Button>
        </div>

        {#if error}
            <div class="bg-red-50 border border-red-200 rounded p-3 text-sm text-red-700">
                <strong>Error:</strong> {error}
            </div>
        {/if}

        {#if loading}
            <EmptyState title="Loading voice status..." description="Querying the daemon" variant="loading" />
        {:else if down}
            <EmptyState
                title="Voice daemon not running"
                description="Start the voice service from the Services screen, then refresh."
            />
        {:else if status}
            <Card>
                <div class="p-4 flex items-center justify-between gap-4">
                    <div class="flex items-center gap-3 min-w-0">
                        <span
                            class="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0 {micOn ? 'bg-green-500' : 'bg-gray-300'}"
                        ></span>
                        <div class="min-w-0">
                            <div class="text-sm font-semibold text-gray-800">
                                Mic {micOn ? 'on' : 'off'} · {status.mode}{status.turnActive ? ' · turn in flight' : ''}
                            </div>
                            <div class="text-xs font-mono text-gray-500 truncate">
                                {status.device?.name || `device ${status.device?.id ?? '?'}`} · up {fmtUptime(status.uptimeMs)}
                            </div>
                        </div>
                    </div>
                    <div class="flex items-center gap-2 flex-shrink-0">
                        {#if micOn}
                            <Button variant="danger" onclick={() => act('mic-off')} disabled={busy !== null}>
                                Mic Off
                            </Button>
                        {:else}
                            <Button variant="success" onclick={() => act('mic-on')} disabled={busy !== null}>
                                Mic On
                            </Button>
                        {/if}
                        <Button
                            variant="secondary"
                            onclick={() => act('interrupt')}
                            disabled={busy !== null || !status.turnActive}
                        >
                            Interrupt
                        </Button>
                    </div>
                </div>

                <div class="px-4 pb-4 pt-1 grid grid-cols-2 gap-x-6 gap-y-1 text-xs text-gray-600">
                    <div>
                        Last wake: {status.lastWake
                            ? `${status.lastWake.confidence.toFixed(3)} (${fmtAgo(status.lastWake.at)})`
                            : '—'}
                    </div>
                    <div>Detector: <span class="font-mono">{status.detector?.provider || '—'}</span></div>
                    <div>Session: <span class="font-mono">{status.lastSessionId || '—'}</span></div>
                    <div class="col-span-2">
                        Last error: {status.lastError
                            ? `${status.lastError.message} (${fmtAgo(status.lastError.at)})`
                            : '—'}
                    </div>
                </div>
            </Card>
        {/if}
    </div>
</div>
