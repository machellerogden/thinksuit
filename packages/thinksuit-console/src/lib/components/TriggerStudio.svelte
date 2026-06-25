<script>
    import { onMount, onDestroy } from 'svelte';
    import { Card, Button, EmptyState } from '$lib/components/ui/index.js';
    import TriggerEnroll from '$lib/components/TriggerEnroll.svelte';
    import TriggerSamples from '$lib/components/TriggerSamples.svelte';

    let triggers = $state([]);
    let actions = $state(['converse', 'new']);
    let negPrompts = $state([]);
    let loading = $state(true);
    let error = $state(null);
    let busy = $state(null); // name of the trigger with an action in flight

    let mode = $state('list'); // 'list' | 'enroll' | 'samples'
    let enrollCtx = $state(null); // { name, phrase, samples }
    let samplesName = $state(null); // trigger whose clips are being managed

    let showNew = $state(false);
    let newName = $state('');
    let newPhrase = $state('');

    let enabledNames = $derived(triggers.filter((t) => t.enabled).map((t) => t.name));

    // Training is a long (~50-min) detached job. We start it, then poll its
    // run-log status every 2s; `training[name]` holds the live snapshot, and a
    // 1s ticker drives the elapsed clock while any run is in flight.
    let training = $state({}); // name -> { running, runId, phase, startedAt, result }
    const pollers = {}; // name -> intervalId (non-reactive)
    let ticker = null;
    let now = $state(Date.now());

    function ensureTicker() {
        if (!ticker) ticker = setInterval(() => (now = Date.now()), 1000);
    }
    function maybeStopTicker() {
        const anyRunning = Object.values(training).some((s) => s.running);
        if (!anyRunning && ticker) {
            clearInterval(ticker);
            ticker = null;
        }
    }
    function stopPoll(name) {
        if (pollers[name]) {
            clearInterval(pollers[name]);
            delete pollers[name];
        }
    }
    function startPoll(name) {
        stopPoll(name);
        ensureTicker();
        pollers[name] = setInterval(() => pollTrain(name), 2000);
        pollTrain(name);
    }

    async function pollTrain(name) {
        try {
            const res = await fetch(`/api/voice/triggers/${encodeURIComponent(name)}/train`);
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'status check failed');
            const prev = training[name] || {};
            const startedAt =
                prev.startedAt ?? (data.events?.[0]?.ts ? Date.parse(data.events[0].ts) : Date.now());
            training = {
                ...training,
                [name]: { running: data.running, runId: data.runId, phase: data.phase, startedAt, result: data.result }
            };
            if (!data.running) {
                stopPoll(name);
                maybeStopTicker();
                await load(); // model now registered/promoted — refresh the card
            }
        } catch (e) {
            error = e.message; // transient; keep polling
        }
    }

    async function startTrain(name) {
        busy = name;
        try {
            const res = await fetch(`/api/voice/triggers/${encodeURIComponent(name)}/train`, { method: 'POST' });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || 'Failed to start training');
            training = {
                ...training,
                [name]: { running: true, runId: data.runId, phase: 'starting', startedAt: Date.now(), result: null }
            };
            startPoll(name);
        } catch (e) {
            error = e.message;
        } finally {
            busy = null;
        }
    }

    // After a (re)load, rejoin any run still in flight so a console reload doesn't
    // lose the progress view.
    async function reattach() {
        for (const t of triggers) {
            if (pollers[t.name]) continue;
            try {
                const res = await fetch(`/api/voice/triggers/${encodeURIComponent(t.name)}/train`);
                const data = await res.json();
                if (res.ok && data.running) startPoll(t.name);
            } catch {
            // ignore — nothing to reattach to
            }
        }
    }

    const elapsed = (startedAt) => {
        const s = Math.max(0, Math.floor((now - startedAt) / 1000));
        return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
    };
    const canPromoteLatest = (t) => t.versionCount > 0 && t.current !== `v${t.versionCount}`;

    async function load() {
        try {
            const res = await fetch('/api/voice/triggers');
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to load triggers');
            triggers = data.triggers;
            actions = data.actions ?? actions;
            negPrompts = data.negPrompts ?? negPrompts;
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

    async function createTrigger() {
        if (!newName.trim() || !newPhrase.trim()) {
            error = 'name and phrase are required';
            return;
        }
        busy = '__new__';
        try {
            const res = await fetch('/api/voice/triggers', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: newName.trim(), phrase: newPhrase.trim() })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to create trigger');
            showNew = false;
            newName = '';
            newPhrase = '';
            enterEnroll(data.trigger);
        } catch (e) {
            error = e.message;
        } finally {
            busy = null;
        }
    }

    function enterEnroll(t) {
        enrollCtx = { name: t.name, phrase: t.phrase, samples: t.samples ?? { positive: 0, negative: 0 } };
        mode = 'enroll';
    }

    function onEnrollDone() {
        mode = 'list';
        enrollCtx = null;
        load();
    }

    function enterSamples(t) {
        samplesName = t.name;
        mode = 'samples';
    }

    function onSamplesDone() {
        mode = 'list';
        samplesName = null;
        load();
    }

    const pct = (x) => (x == null ? '—' : `${(x * 100).toFixed(1)}%`);
    const num = (x, d = 2) => (x == null ? '—' : Number(x).toFixed(d));

    onMount(async () => {
        await load();
        await reattach();
    });

    onDestroy(() => {
        for (const name of Object.keys(pollers)) stopPoll(name);
        if (ticker) clearInterval(ticker);
    });
</script>

{#if mode === 'enroll' && enrollCtx}
    <TriggerEnroll
        name={enrollCtx.name}
        phrase={enrollCtx.phrase}
        samples={enrollCtx.samples}
        {negPrompts}
        onDone={onEnrollDone}
    />
{:else if mode === 'samples' && samplesName}
    <TriggerSamples name={samplesName} onDone={onSamplesDone} />
{:else}
    <div class="h-full overflow-y-auto">
        <div class="p-6 space-y-4 max-w-4xl mx-auto">
            <div class="flex items-center justify-between mb-1">
                <h1 class="text-xl font-bold">Trigger Word Studio</h1>
                <div class="flex items-center gap-2">
                    <Button variant="primary" disabled={busy !== null} onclick={() => (showNew = !showNew)}>New Trigger</Button>
                    <Button variant="secondary" onclick={load} disabled={loading || busy !== null}>Refresh</Button>
                </div>
            </div>
            <p class="text-xs text-gray-500">
                Listening set: <span class="font-mono">{enabledNames.length ? enabledNames.join(', ') : '(none)'}</span>
                · changes apply on the next voice service restart.
            </p>

            {#if showNew}
                <Card variant="indigo">
                    <div class="flex flex-wrap items-end gap-3">
                        <label class="flex flex-col gap-1 text-sm">
                            <span class="text-gray-600">Name (a–z, 0–9, -, _)</span>
                            <input
                                class="rounded-md border border-gray-300 px-2 py-1 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                bind:value={newName}
                                placeholder="thinksuit_new"
                            />
                        </label>
                        <label class="flex flex-col gap-1 text-sm flex-1 min-w-48">
                            <span class="text-gray-600">Phrase</span>
                            <input
                                class="rounded-md border border-gray-300 px-2 py-1 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                bind:value={newPhrase}
                                placeholder="ThinkSuit New"
                            />
                        </label>
                        <Button variant="success" disabled={busy !== null} onclick={createTrigger}>Create &amp; enroll</Button>
                        <Button variant="ghost" disabled={busy !== null} onclick={() => (showNew = false)}>Cancel</Button>
                    </div>
                </Card>
            {/if}

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
                    message="Click New Trigger to name one, enroll your voice, then Train (a one-time ~50-min step) — all here in the Studio."
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
                                {#if !t.current}
                                    <div class="mt-1 text-xs text-amber-600">
                                        {#if t.samples.positive === 0}
                                            enroll a few samples, then Train
                                        {:else}
                                            not trained yet — click Train (a one-time ~50-min step)
                                        {/if}
                                    </div>
                                {/if}
                            </div>
                            <div class="flex items-center gap-2 flex-shrink-0">
                                {#if t.enabled}
                                    <Button variant="danger" size="sm" disabled={busy !== null} onclick={() => patch(t.name, { enabled: false })}>
                                        Disable
                                    </Button>
                                {:else}
                                    <Button variant="success" size="sm" disabled={busy !== null || !t.current} onclick={() => patch(t.name, { enabled: true })}>
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
                                <Button variant="subtle" size="sm" disabled={busy !== null} onclick={() => enterEnroll(t)}>
                                    Add samples
                                </Button>
                                <Button variant="subtle" size="sm" disabled={busy !== null} onclick={() => enterSamples(t)}>
                                    Manage samples
                                </Button>
                                <Button
                                    variant="primary"
                                    size="sm"
                                    disabled={busy !== null || training[t.name]?.running || t.samples.positive === 0}
                                    onclick={() => startTrain(t.name)}
                                >
                                    {training[t.name]?.running ? 'Training…' : t.current ? 'Re-train' : 'Train'}
                                </Button>
                                {#if canPromoteLatest(t)}
                                    <Button variant="default" size="sm" disabled={busy !== null} onclick={() => promote(t.name)}>
                                        Promote latest
                                    </Button>
                                {/if}
                                <Button variant="ghost" size="sm" disabled={busy !== null} onclick={() => del(t.name)}>
                                    Delete
                                </Button>
                            </div>
                        </div>

                        {#if training[t.name]}
                            {@const trn = training[t.name]}
                            <div class="mt-3 text-xs">
                                {#if trn.running}
                                    <span class="text-indigo-600">
                                        Training… <span class="font-mono">{trn.phase}</span> · {elapsed(trn.startedAt)}
                                    </span>
                                {:else if trn.result?.event === 'complete'}
                                    <span class="text-green-700">
                                        Trained {trn.result.version}{trn.result.promoted ? ' (promoted)' : ' — Promote latest to use it'}
                                    </span>
                                {:else if trn.result?.event === 'error'}
                                    <span class="text-red-700">Training failed: {trn.result.message}</span>
                                {/if}
                            </div>
                        {/if}
                    </Card>
                {/each}
            {/if}
        </div>
    </div>
{/if}
