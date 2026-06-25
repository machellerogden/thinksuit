<script>
    import { onMount } from 'svelte';
    import { Card, Button } from '$lib/components/ui/index.js';

    let { name, phrase, negPrompts = [], samples = { positive: 0, negative: 0 }, onDone } = $props();

    const TARGETS = { positive: 40, negative: 20 };
    const CLIP_MS = 2000;

    let recorder = null;
    let ready = $state(false);
    let kind = $state('positive');
    let recording = $state(false);
    let level = $state(0);
    let busy = $state(false);
    let error = $state(null);
    let counts = $state({ positive: 0, negative: 0 });
    let lastClip = $state(null); // { peak, durationMs, quiet }

    function currentPrompt(k, negCount) {
        if (k === 'positive') return phrase;
        if (!negPrompts.length) return '(say something that is NOT the phrase)';
        return negPrompts[negCount % negPrompts.length];
    }
    let prompt = $derived(currentPrompt(kind, counts.negative));

    onMount(() => {
        counts = { positive: samples?.positive ?? 0, negative: samples?.negative ?? 0 };
        let live = true;
        (async () => {
            try {
                const { createEnrollRecorder } = await import('$lib/utils/enrollRecorder.js');
                const rec = await createEnrollRecorder({ onLevel: (p) => (level = p) });
                await rec.resume();
                if (!live) {
                    rec.close();
                    return;
                }
                recorder = rec;
                ready = true;
            } catch (e) {
                error = `Microphone unavailable: ${e.message}`;
            }
        })();
        return () => {
            live = false;
            recorder?.close();
            recorder = null;
        };
    });

    async function recordOne() {
        if (!recorder || recording || busy) return;
        error = null;
        recording = true;
        recorder.start();
        await new Promise((r) => setTimeout(r, CLIP_MS));
        const pcm = recorder.stop();
        recording = false;
        await upload(pcm);
    }

    async function upload(pcm) {
        busy = true;
        try {
            const res = await fetch(
                `/api/voice/triggers/${encodeURIComponent(name)}/samples?kind=${kind}`,
                { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: pcm.buffer }
            );
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to save clip');
            counts = data.samples;
            lastClip = { peak: data.peak, durationMs: data.durationMs, quiet: data.peak < 0.05 };
        } catch (e) {
            error = e.message;
        } finally {
            busy = false;
        }
    }

    function finish() {
        recorder?.close();
        recorder = null;
        onDone?.();
    }
</script>

<div class="h-full overflow-y-auto">
    <div class="p-6 space-y-4 max-w-2xl mx-auto">
        <div class="flex items-center justify-between">
            <h1 class="text-xl font-bold">Enroll · {name}</h1>
            <Button variant="secondary" onclick={finish}>Done</Button>
        </div>

        <div class="flex items-center gap-2 text-sm">
            <span class="text-gray-600">Recording</span>
            <Button variant={kind === 'positive' ? 'primary' : 'default'} size="sm" disabled={recording || busy} onclick={() => (kind = 'positive')}>
                Positives ({counts.positive}/{TARGETS.positive})
            </Button>
            <Button variant={kind === 'negative' ? 'primary' : 'default'} size="sm" disabled={recording || busy} onclick={() => (kind = 'negative')}>
                Negatives ({counts.negative}/{TARGETS.negative})
            </Button>
        </div>

        {#if error}
            <div class="bg-red-50 border border-red-200 rounded p-3 text-sm text-red-700">
                <strong>Error:</strong> {error}
            </div>
        {/if}

        <Card padding="lg">
            <div class="text-center space-y-4">
                <div class="text-xs uppercase tracking-wide text-gray-500">
                    {kind === 'positive' ? 'Say the phrase' : 'Say something that is NOT the phrase'}
                </div>
                <div class="text-2xl font-semibold text-gray-800">“{prompt}”</div>

                <!-- level meter -->
                <div class="h-2 w-full bg-gray-200 rounded overflow-hidden">
                    <div
                        class="h-full transition-[width] duration-75 {recording ? 'bg-green-500' : 'bg-gray-400'}"
                        style="width: {Math.min(100, Math.round(level * 140))}%"
                    ></div>
                </div>

                <Button
                    variant={recording ? 'danger' : 'success'}
                    disabled={!ready || busy}
                    onclick={recordOne}
                >
                    {#if !ready}
                        Waiting for mic…
                    {:else if recording}
                        Recording… (2s)
                    {:else if busy}
                        Saving…
                    {:else}
                        Record {kind === 'positive' ? 'phrase' : 'negative'}
                    {/if}
                </Button>

                {#if lastClip}
                    <div class="text-xs {lastClip.quiet ? 'text-amber-600' : 'text-gray-500'}">
                        last clip: {lastClip.durationMs}ms · peak {lastClip.peak.toFixed(2)}
                        {lastClip.quiet ? '— quiet, consider re-recording' : ''}
                    </div>
                {/if}
            </div>
        </Card>

        <p class="text-xs text-gray-500">
            Vary your delivery; don't over-enunciate. Aim for ~{TARGETS.positive} positives and
            ~{TARGETS.negative} negatives, then run training.
        </p>
    </div>
</div>
