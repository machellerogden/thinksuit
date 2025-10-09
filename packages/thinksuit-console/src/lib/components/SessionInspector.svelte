<script>
    import { onMount } from 'svelte';
    import { Badge, Card, JSONView, EmptyState, Tabs, Copyable } from '$lib/components/ui/index.js';
    import { SESSION_EVENTS } from 'thinksuit/constants/events';

    let { sessionId = null } = $props();

    // State management
    let eventFilter = $state('');
    let selectedSessionData = $state(null);
    let selectedTraceData = $state(null);
    let activeTab = $state('raw');

    // LRU Cache implementation
    class LRUCache {
        constructor(maxSize = 1000) {
            this.maxSize = maxSize;
            this.cache = new Map();
        }

        get(key) {
            if (!this.cache.has(key)) return null;

            // Move to end (most recently used)
            const value = this.cache.get(key);
            this.cache.delete(key);
            this.cache.set(key, value);
            return value;
        }

        set(key, value) {
            // Remove if exists (to reinsert at end)
            if (this.cache.has(key)) {
                this.cache.delete(key);
            }

            // Add to end
            this.cache.set(key, value);

            // Evict oldest if over limit
            if (this.cache.size > this.maxSize) {
                const firstKey = this.cache.keys().next().value;
                this.cache.delete(firstKey);
            }
        }

        clear() {
            this.cache.clear();
        }
    }

    const jsonCache = new LRUCache(1000);
    let traceLoading = $state(false);
    let traceError = $state(null);
    let selectedTraceEntry = $state(null);
    let selectedTraceIndex = $state(null);

    // Reactive session selection
    $effect(() => {
        if (sessionId) {
            selectSession(sessionId);
        } else {
            selectedSessionData = null;
        }
    });

    // Load trace data when switching to trace tab
    $effect(() => {
        if (activeTab === 'trace' && selectedSessionData?.hasTrace && selectedSessionData?.traceId && !selectedTraceData && !traceLoading) {
            loadTraceData(selectedSessionData.traceId);
        }
    });

    // Clear trace selection when switching tabs or sessions
    $effect(() => {
        if (activeTab !== 'trace' || !selectedSessionData) {
            selectedTraceEntry = null;
            selectedTraceIndex = null;
        }
    });

    onMount(() => {
    // Component initialization if needed
    });

    async function selectSession(sessionId) {
        if (!sessionId) return;

        selectedSessionData = null;
        selectedTraceData = null;
        jsonCache.clear();  // Clear cache when switching sessions

        try {
            const response = await fetch(`/api/sessions/${sessionId}`);
            if (!response.ok) throw new Error('Failed to load session data');
            selectedSessionData = await response.json();

            // Load trace data if available and we're on the trace tab
            if (selectedSessionData?.hasTrace && activeTab === 'trace') {
                await loadTraceData(selectedSessionData.traceId);
            }
        } catch (err) {
            console.error('Error loading session data:', err);
        }
    }

    async function loadTraceData(traceId) {
        if (!traceId) return;

        try {
            traceLoading = true;
            traceError = null;
            const response = await fetch(`/api/sessions/trace/${traceId}`);
            if (!response.ok) throw new Error('Failed to load trace data');
            const data = await response.json();
            selectedTraceData = data;
        } catch (err) {
            traceError = err.message;
            console.error('Error loading trace data:', err);
        } finally {
            traceLoading = false;
        }
    }

    function selectTraceEntry(entry, index) {
        selectedTraceEntry = entry;
        selectedTraceIndex = index;
    }

    // Helper functions

    function getLogLevelColor(level) {
        if (level === 50) return 'bg-red-500';
        if (level === 40) return 'bg-yellow-500';
        if (level === 30) return 'bg-blue-500';
        if (level === 20) return 'bg-gray-400';
        return 'bg-gray-300';
    }

    function getLogLevelText(level) {
        if (level === 50) return 'ERROR';
        if (level === 40) return 'WARN';
        if (level === 30) return 'INFO';
        if (level === 20) return 'DEBUG';
        if (level === 10) return 'TRACE';
        return `Level ${level}`;
    }

    function formatTimeWithMs(timestamp) {
        if (!timestamp) return '';
        const date = new Date(timestamp);
        return date.toLocaleTimeString('en-US', {
            hour12: false,
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            fractionalSecondDigits: 3
        });
    }

    function formatDuration(ms) {
        if (!ms) return '';
        const seconds = Math.floor(ms / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);

        if (hours > 0) {
            return `${hours}h ${minutes % 60}m`;
        } else if (minutes > 0) {
            return `${minutes}m ${seconds % 60}s`;
        } else {
            return `${seconds}s`;
        }
    }

    // Helper to get JSON string with caching
    function getJsonString(entry) {
        if (entry.eventId) {
            let cached = jsonCache.get(entry.eventId);
            if (cached) return cached;

            const jsonString = JSON.stringify(entry).toLowerCase();
            jsonCache.set(entry.eventId, jsonString);
            return jsonString;
        }

        // No eventId, don't cache
        return JSON.stringify(entry).toLowerCase();
    }

    // Derived values

    const tabs = $derived([
        { label: 'Raw Data', value: 'raw' },
        ...(selectedSessionData?.hasTrace ? [{ label: 'Trace', value: 'trace' }] : [])
    ]);

    // Compute session metadata
    let sessionMetadata = $derived.by(() => {
        if (!selectedSessionData?.entries) return null;

        const entries = selectedSessionData.entries;
        const firstEntry = entries[0];
        const lastEntry = entries.at(-1);

        // Calculate number of turns (user inputs)
        const turnCount = entries.filter(e => e.event === SESSION_EVENTS.INPUT).length;

        // Get session timestamp and duration
        const sessionStart = firstEntry?.time;
        const sessionEnd = lastEntry?.time;
        const duration = sessionStart && sessionEnd ?
            new Date(sessionEnd) - new Date(sessionStart) : null;

        // Count errors and warnings
        const errorCount = entries.filter(e => e.level === 50).length;
        const warningCount = entries.filter(e => e.level === 40).length;

        // Collect unique models used
        const modelsUsed = new Set();
        let totalTokens = { prompt: 0, completion: 0 };

        entries.forEach(entry => {
            if (entry.data?.model) modelsUsed.add(entry.data.model);
            if (entry.data?.usage) {
                totalTokens.prompt += entry.data.usage.prompt || 0;
                totalTokens.completion += entry.data.usage.completion || 0;
            }
        });

        // Determine status
        const hasErrors = errorCount > 0;
        const isComplete = entries.some(e => e.event === SESSION_EVENTS.END);
        const status = hasErrors ? 'error' : isComplete ? 'complete' : 'active';

        return {
            turnCount,
            sessionStart,
            duration,
            errorCount,
            warningCount,
            modelsUsed: Array.from(modelsUsed),
            totalTokens,
            status
        };
    });

    function handleTabChange(tab) {
        activeTab = tab.value;
    }
</script>

<div class="flex flex-col h-full">
    {#if selectedSessionData}
        <!-- Header with tabs -->
        <div class="border-b border-gray-200">
            <div class="px-6 py-4">
                <!-- Session ID with copy functionality -->
                <h2 class="text-xl font-semibold">
                    <Copyable text={sessionId} />
                </h2>

                <!-- Session metadata row 1 -->
                <div class="flex items-center gap-4 text-sm text-gray-600 mt-2">
                    {#if sessionMetadata?.sessionStart}
                        <span>{new Date(sessionMetadata.sessionStart).toLocaleString()}</span>
                    {/if}
                    {#if sessionMetadata?.duration}
                        <span>{formatDuration(sessionMetadata.duration)}</span>
                    {/if}
                    {#if sessionMetadata?.turnCount}
                        <span>{sessionMetadata.turnCount} turn{sessionMetadata.turnCount !== 1 ? 's' : ''}</span>
                    {/if}
                    <span>{selectedSessionData.entryCount} events</span>
                </div>

                <!-- Session metadata row 2 -->
                <div class="flex items-center gap-3 text-sm mt-2">
                    <!-- Status badge -->
                    {#if sessionMetadata}
                        <Badge variant={
                            sessionMetadata.status === 'error' ? 'danger' :
                                sessionMetadata.status === 'complete' ? 'success' :
                                    'warning'
                        } size="xs">
                            {sessionMetadata.status}
                        </Badge>
                    {/if}

                    <!-- Trace availability -->
                    {#if selectedSessionData.hasTrace !== undefined}
                        <Badge variant={selectedSessionData.hasTrace ? 'success' : 'default'} size="xs">
                            {selectedSessionData.hasTrace ? 'Trace Available' : 'No Trace'}
                        </Badge>
                    {/if}

                    <!-- Error/Warning counts -->
                    {#if sessionMetadata?.errorCount > 0}
                        <Badge variant="danger" size="xs">{sessionMetadata.errorCount} error{sessionMetadata.errorCount !== 1 ? 's' : ''}</Badge>
                    {/if}
                    {#if sessionMetadata?.warningCount > 0}
                        <Badge variant="warning" size="xs">{sessionMetadata.warningCount} warning{sessionMetadata.warningCount !== 1 ? 's' : ''}</Badge>
                    {/if}

                    <!-- Models used -->
                    {#if sessionMetadata?.modelsUsed?.length > 0}
                        <span class="text-xs text-gray-600">
                            Models: {sessionMetadata.modelsUsed.join(', ')}
                        </span>
                    {/if}

                    <!-- Token usage -->
                    {#if sessionMetadata?.totalTokens}
                        <span class="text-xs text-gray-600">
                            Tokens: {(sessionMetadata.totalTokens.prompt + sessionMetadata.totalTokens.completion).toLocaleString()}
                        </span>
                    {/if}
                </div>
            </div>

            <!-- Event filter and tabs row -->
            <div class="px-6 flex items-center justify-between">
                <Tabs
                    {tabs}
                    {activeTab}
                    onTabChange={handleTabChange}
                />

                <!-- Event filter (shown only in raw/trace views) -->
                {#if activeTab === 'raw' || activeTab === 'trace'}
                    <input
                        type="text"
                        bind:value={eventFilter}
                        placeholder={activeTab === 'raw' ? 'Search in JSON...' : 'Filter by event...'}
                        class="ml-4 px-3 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                {/if}
            </div>
        </div>

        <!-- Tab content -->
        <div class="flex-1 {activeTab === 'trace' ? 'overflow-hidden' : 'overflow-y-auto'} p-6">
            {#if activeTab === 'raw'}
                {@const filteredEntries = eventFilter ?
                    selectedSessionData.entries.filter(e => {
                        // Use cached JSON string when possible
                        const jsonText = getJsonString(e);
                        return jsonText.includes(eventFilter.toLowerCase());
                    }) :
                        selectedSessionData.entries}
                <!-- Raw Data View -->
                <div class="space-y-4">
                    {#if filteredEntries.length === 0}
                        <EmptyState
                            type="empty"
                            title="No matching entries"
                            message={`No entries matching "${eventFilter}" found`}
                        />
                    {:else}
                        {#each filteredEntries as entry, _i (entry)}
                            <Card variant="default">
                                <div class="text-xs text-gray-500 mb-2">
                                    {#if entry.event}
                                        <Badge variant="primary" size="xs">{entry.event}</Badge>
                                    {/if}
                                    {entry.time ? new Date(entry.time).toLocaleString() : 'No timestamp'}
                                </div>
                                <JSONView data={entry} />
                            </Card>
                        {/each}
                    {/if}
                </div>

            {:else if activeTab === 'trace'}
                <!-- Trace View -->
                {#if traceLoading}
                    <div class="flex items-center justify-center h-64">
                        <EmptyState type="loading" message="Loading trace data..." />
                    </div>
                {:else if traceError}
                    <div class="flex items-center justify-center h-64">
                        <EmptyState type="error" message={`Error loading trace: ${traceError}`} />
                    </div>
                {:else if selectedTraceData}
                    {@const filteredTraceEntries = eventFilter && selectedTraceData?.entries ?
                        selectedTraceData.entries.filter(e =>
                            e.event && e.event.toLowerCase().includes(eventFilter.toLowerCase())
                        ) :
                            selectedTraceData?.entries || []}
                    <!-- Two column layout for trace view -->
                    <div class="grid grid-cols-2 h-full gap-4">
                        <!-- Left column: Trace events list -->
                        <div class="overflow-y-auto pr-2">
                            <div class="space-y-2">
                                <Card variant="ghost" padding="md" class="mb-4 sticky top-0 z-10">
                                    <div class="text-sm font-medium text-gray-700">Trace Events</div>
                                    <div class="text-xs text-gray-500 mt-1">
                                        {#if eventFilter && filteredTraceEntries.length !== selectedTraceData.entryCount}
                                            {filteredTraceEntries.length} of {selectedTraceData.entryCount || 0} events
                                        {:else}
                                            {selectedTraceData.entryCount || 0} total events
                                        {/if}
                                    </div>
                                </Card>

                                {#each filteredTraceEntries as entry, i (entry)}
                                    <button
                                        class="w-full text-left border rounded p-3 cursor-pointer transition-all {selectedTraceIndex === i ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'}"
                                        onclick={() => selectTraceEntry(entry, i)}
                                    >
                                        <div class="flex items-start gap-3">
                                            <div class="flex-shrink-0 w-2 h-2 rounded-full mt-2 {getLogLevelColor(entry.level)}"></div>
                                            <div class="flex-1 min-w-0">
                                                <div class="flex items-start justify-between gap-2">
                                                    <div class="flex-1">
                                                        <div class="flex items-center gap-2 flex-wrap">
                                                            {#if entry.data?.operation}
                                                                <Badge variant="purple" size="xs">{entry.data.operation}</Badge>
                                                            {/if}
                                                            {#if entry.event}
                                                                <Badge variant="primary" size="xs">{entry.event}</Badge>
                                                            {/if}
                                                            {#if entry.data?.state}
                                                                <Badge variant="success" size="xs">{entry.data.state}</Badge>
                                                            {/if}
                                                        </div>
                                                        {#if entry.msg}
                                                            <div class="text-sm text-gray-700 mt-1">{entry.msg}</div>
                                                        {/if}
                                                        {#if entry.data?.facts || entry.data?.classifierResults || entry.data || entry.data?.executionTrace}
                                                            <div class="flex gap-2 mt-1">
                                                                {#if entry.data?.executionTrace}
                                                                    <span class="text-xs text-purple-600">Rules ({entry.data?.traceEntryCount || entry.data?.executionTrace.length || 0})</span>
                                                                {/if}
                                                                {#if entry.data?.facts && Array.isArray(entry.data.facts) && entry.data.facts.some(f => f.type === 'Signal')}
                                                                    <span class="text-xs text-indigo-600">Signals</span>
                                                                {/if}
                                                                {#if entry.data?.classifierResults}
                                                                    <span class="text-xs text-blue-600">Classifiers</span>
                                                                {/if}
                                                                {#if entry.data || entry.data?.output_keys || entry.data?.data_keys}
                                                                    <span class="text-xs text-gray-600">Data</span>
                                                                {/if}
                                                            </div>
                                                        {/if}
                                                    </div>
                                                    <div class="text-xs text-gray-500 whitespace-nowrap">
                                                        {formatTimeWithMs(entry.time)}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </button>
                                {/each}
                            </div>
                        </div>

                        <!-- Right column: Event details panel -->
                        <div class="overflow-y-auto pl-2 border-l border-gray-200">
                            {#if selectedTraceEntry}
                                {#key selectedTraceIndex}
                                    <div class="space-y-4">
                                        <!-- Header -->
                                        <Card variant="ghost" padding="md" class="sticky top-0 z-10">
                                            <div class="flex items-center justify-between">
                                                <h3 class="text-sm font-medium text-gray-700">Event Details</h3>
                                                <span class="text-xs text-gray-500">
                                                    {#if selectedTraceIndex !== null && selectedTraceIndex !== undefined}
                                                        Entry #{selectedTraceIndex + 1}
                                                    {/if}
                                                </span>
                                            </div>
                                        </Card>

                                        <!-- Timestamp and Level -->
                                        <Card variant="default">
                                            <div class="grid grid-cols-2 gap-4">
                                                <div>
                                                    <div class="text-xs font-medium text-gray-500 mb-1">Timestamp</div>
                                                    <div class="font-mono text-xs text-gray-700">{new Date(selectedTraceEntry.time).toISOString()}</div>
                                                </div>
                                                <div>
                                                    <div class="text-xs font-medium text-gray-500 mb-1">Log Level</div>
                                                    <div class="flex items-center gap-2">
                                                        <div class="w-2 h-2 rounded-full {getLogLevelColor(selectedTraceEntry.level)}"></div>
                                                        <span class="text-xs text-gray-700">{getLogLevelText(selectedTraceEntry.level)}</span>
                                                    </div>
                                                </div>
                                            </div>
                                        </Card>

                                        <!-- Trace Context -->
                                        {#if selectedTraceEntry.traceId || selectedTraceEntry.spanId || selectedTraceEntry.parentSpanId}
                                            <Card variant="default">
                                                <div class="text-xs font-medium text-gray-700 mb-2">Trace Context</div>
                                                <div class="space-y-2">
                                                    {#if selectedTraceEntry.traceId}
                                                        <div class="flex items-start gap-2">
                                                            <span class="text-xs text-gray-500 w-20">Trace ID:</span>
                                                            <span class="font-mono text-xs text-gray-700 break-all">{selectedTraceEntry.traceId}</span>
                                                        </div>
                                                    {/if}
                                                    {#if selectedTraceEntry.spanId}
                                                        <div class="flex items-start gap-2">
                                                            <span class="text-xs text-gray-500 w-20">Span ID:</span>
                                                            <span class="font-mono text-xs text-gray-700">{selectedTraceEntry.spanId}</span>
                                                        </div>
                                                    {/if}
                                                    {#if selectedTraceEntry.parentSpanId}
                                                        <div class="flex items-start gap-2">
                                                            <span class="text-xs text-gray-500 w-20">Parent Span:</span>
                                                            <span class="font-mono text-xs text-gray-700">{selectedTraceEntry.parentSpanId}</span>
                                                        </div>
                                                    {/if}
                                                    {#if selectedTraceEntry.data?.depth !== undefined}
                                                        <div class="flex items-start gap-2">
                                                            <span class="text-xs text-gray-500 w-20">Depth:</span>
                                                            <span class="text-xs text-gray-700">{selectedTraceEntry.data.depth}</span>
                                                        </div>
                                                    {/if}
                                                    {#if selectedTraceEntry.data?.branch}
                                                        <div class="flex items-start gap-2">
                                                            <span class="text-xs text-gray-500 w-20">Branch:</span>
                                                            <span class="text-xs text-gray-700">{selectedTraceEntry.data.branch}</span>
                                                        </div>
                                                    {/if}
                                                </div>
                                            </Card>
                                        {/if}

                                        <!-- Event Information -->
                                        {#if selectedTraceEntry.event || selectedTraceEntry.data?.state || selectedTraceEntry.data?.operation}
                                            <Card variant="default">
                                                <div class="text-xs font-medium text-gray-700 mb-2">Event Information</div>
                                                <div class="flex flex-wrap gap-2">
                                                    {#if selectedTraceEntry.data?.operation}
                                                        <Badge variant="purple">{selectedTraceEntry.data.operation}</Badge>
                                                    {/if}
                                                    {#if selectedTraceEntry.event}
                                                        <Badge variant="primary">{selectedTraceEntry.event}</Badge>
                                                    {/if}
                                                    {#if selectedTraceEntry.data?.state}
                                                        <Badge variant="success">{selectedTraceEntry.data.state}</Badge>
                                                    {/if}
                                                    {#if selectedTraceEntry.data?.label}
                                                        <Badge variant="warning">{selectedTraceEntry.data.label}</Badge>
                                                    {/if}
                                                </div>
                                            </Card>
                                        {/if}

                                        <!-- Message -->
                                        {#if selectedTraceEntry.msg}
                                            <Card variant="default">
                                                <div class="text-xs font-medium text-gray-700 mb-2">Message</div>
                                                <div class="text-sm text-gray-700 whitespace-pre-wrap">{selectedTraceEntry.msg}</div>
                                            </Card>
                                        {/if}

                                        <!-- Error Details -->
                                        {#if selectedTraceEntry.data?.error}
                                            <Card variant="error">
                                                <div class="text-xs font-medium text-red-700 mb-2">Error</div>
                                                <div class="text-sm text-red-700">
                                                    {#if typeof selectedTraceEntry.data.error === 'object'}
                                                        {#if selectedTraceEntry.data.error.message}
                                                            <div class="mb-2">{selectedTraceEntry.data.error.message}</div>
                                                        {/if}
                                                        {#if selectedTraceEntry.data.error.stack}
                                                            <pre class="text-xs bg-red-100 p-2 rounded overflow-x-auto">{selectedTraceEntry.data.error.stack}</pre>
                                                        {/if}
                                                    {:else}
                                                        {selectedTraceEntry.data.error}
                                                    {/if}
                                                </div>
                                            </Card>
                                        {/if}

                                        <!-- Rules Execution Trace -->
                                        {#if selectedTraceEntry.event === 'rules_execution_trace' && selectedTraceEntry.data?.executionTrace}
                                            <Card variant="purple">
                                                <div class="text-xs font-medium text-purple-700 mb-3">Rules Execution Trace</div>
                                                <div class="space-y-3">
                                                    {#each selectedTraceEntry.data.executionTrace as rule, ruleIndex (ruleIndex)}
                                                        <div class="bg-white p-3 rounded border border-purple-100">
                                                            <div class="flex items-start justify-between mb-2">
                                                                <div class="flex items-center gap-2">
                                                                    <span class="text-xs font-medium text-purple-700">#{ruleIndex + 1}</span>
                                                                    <Badge variant="purple" size="xs">{rule.ruleName}</Badge>
                                                                </div>
                                                                {#if rule.timestamp}
                                                                    <span class="text-xs text-gray-500">{formatTimeWithMs(rule.timestamp)}</span>
                                                                {/if}
                                                            </div>

                                                            {#if rule.facts && rule.facts.length > 0}
                                                                <div class="mb-2">
                                                                    <div class="text-xs text-gray-600 mb-1">Triggered by:</div>
                                                                    <div class="flex flex-wrap gap-1">
                                                                        {#each rule.facts as fact (fact.type + (fact.dimension || '') + (fact.signal || ''))}
                                                                            <Badge variant="primary" size="xs">
                                                                                {fact.type}: {fact.dimension ? `${fact.dimension}.${fact.signal}` : fact.role || fact.strategy || 'unknown'}
                                                                            </Badge>
                                                                        {/each}
                                                                    </div>
                                                                </div>
                                                            {/if}

                                                            {#if rule.factsAdded && rule.factsAdded.length > 0}
                                                                <div>
                                                                    <div class="text-xs text-gray-600 mb-1">Facts added:</div>
                                                                    <div class="flex flex-wrap gap-1">
                                                                        {#each rule.factsAdded as fact (fact.type + (fact.role || fact.strategy || fact.value || ''))}
                                                                            <Badge variant="success" size="xs">
                                                                                {fact.type}: {fact.role || fact.strategy || fact.value || 'value'}
                                                                                {#if fact.confidence}
                                                                                    ({(fact.confidence * 100).toFixed(0)}%)
                                                                                {/if}
                                                                            </Badge>
                                                                        {/each}
                                                                    </div>
                                                                </div>
                                                            {/if}
                                                        </div>
                                                    {/each}
                                                </div>
                                                <div class="mt-3 pt-2 border-t border-purple-200">
                                                    <div class="text-xs text-purple-600">
                                                        Total rules fired: {selectedTraceEntry.data?.traceEntryCount || selectedTraceEntry.data?.executionTrace.length}
                                                    </div>
                                                </div>
                                            </Card>
                                        {/if}

                                        <!-- Signal Detection Results -->
                                        {#if selectedTraceEntry.data?.facts && Array.isArray(selectedTraceEntry.data.facts)}
                                            <Card variant="indigo">
                                                <div class="text-xs font-medium text-indigo-700 mb-2">Detected Signals</div>
                                                <div class="flex flex-wrap gap-2">
                                                    {#each selectedTraceEntry.data.facts as fact (fact.type + fact.dimension + fact.signal)}
                                                        {#if fact.type === 'Signal'}
                                                            <div class="px-2 py-1 bg-white rounded border border-indigo-200">
                                                                <span class="text-xs font-medium text-indigo-700">{fact.dimension}.</span>
                                                                <span class="text-xs text-indigo-600">{fact.signal}</span>
                                                                {#if fact.confidence}
                                                                    <span class="text-xs text-indigo-500 ml-1">({(fact.confidence * 100).toFixed(0)}%)</span>
                                                                {/if}
                                                            </div>
                                                        {/if}
                                                    {/each}
                                                </div>
                                            </Card>
                                        {/if}

                                        <!-- Classifier Results -->
                                        {#if selectedTraceEntry.data?.classifierResults && Array.isArray(selectedTraceEntry.data.classifierResults)}
                                            <Card variant="info">
                                                <div class="text-xs font-medium text-blue-700 mb-2">Classifier Results</div>
                                                <div class="space-y-2">
                                                    {#each selectedTraceEntry.data.classifierResults as result (result.dimension)}
                                                        <div class="flex items-start gap-2">
                                                            <span class="text-xs font-medium text-blue-700 w-20">{result.dimension}:</span>
                                                            <div class="flex flex-wrap gap-1">
                                                                {#if result.signals && result.signals.length > 0}
                                                                    {#each result.signals as signal (signal.signal)}
                                                                        <Badge variant="primary" size="xs">
                                                                            {signal.signal} ({(signal.confidence * 100).toFixed(0)}%)
                                                                        </Badge>
                                                                    {/each}
                                                                {:else}
                                                                    <span class="text-xs text-gray-500">no signals</span>
                                                                {/if}
                                                            </div>
                                                        </div>
                                                    {/each}
                                                </div>
                                            </Card>
                                        {/if}

                                        <!-- Additional Data -->
                                        {#if selectedTraceEntry.data || selectedTraceEntry.data?.output_keys || selectedTraceEntry.data?.data_keys}
                                            <Card variant="default">
                                                <div class="text-xs font-medium text-gray-700 mb-2">Additional Data</div>
                                                {#if selectedTraceEntry.data?.output_keys && Array.isArray(selectedTraceEntry.data.output_keys)}
                                                    <div class="mb-2">
                                                        <span class="text-xs text-gray-500">Output Keys:</span>
                                                        <div class="flex flex-wrap gap-1 mt-1">
                                                            {#each selectedTraceEntry.data.output_keys as key (key)}
                                                                <span class="px-2 py-0.5 text-xs bg-gray-100 text-gray-600 rounded font-mono">{key}</span>
                                                            {/each}
                                                        </div>
                                                    </div>
                                                {/if}
                                                {#if selectedTraceEntry.data?.data_keys && Array.isArray(selectedTraceEntry.data.data_keys)}
                                                    <div class="mb-2">
                                                        <span class="text-xs text-gray-500">Data Keys:</span>
                                                        <div class="flex flex-wrap gap-1 mt-1">
                                                            {#each selectedTraceEntry.data.data_keys as key (key)}
                                                                <span class="px-2 py-0.5 text-xs bg-gray-100 text-gray-600 rounded font-mono">{key}</span>
                                                            {/each}
                                                        </div>
                                                    </div>
                                                {/if}
                                                {#if selectedTraceEntry.data}
                                                    <div>
                                                        <span class="text-xs text-gray-500">Data:</span>
                                                        <div class="mt-1">
                                                            <JSONView data={selectedTraceEntry.data} />
                                                        </div>
                                                    </div>
                                                {/if}
                                            </Card>
                                        {/if}

                                        <!-- Raw JSON -->
                                        <Card variant="default">
                                            <details>
                                                <summary class="text-xs font-medium text-gray-700 cursor-pointer">Raw JSON</summary>
                                                <div class="mt-2">
                                                    <JSONView data={selectedTraceEntry} />
                                                </div>
                                            </details>
                                        </Card>
                                    </div>
                                {/key}
                            {:else}
                                <div class="flex items-center justify-center h-full">
                                    <EmptyState
                                        type="empty"
                                        title="No event selected"
                                        message="Select an event to view details"
                                    />
                                </div>
                            {/if}
                        </div>
                    </div>
                {:else}
                    <div class="flex items-center justify-center h-64">
                        <EmptyState type="empty" title="No trace data available" />
                    </div>
                {/if}
            {/if}
        </div>
    {:else}
        <div class="flex-1 flex items-center justify-center">
            <EmptyState
                type="empty"
                title="No session selected"
                message="Select a session from the sidebar to view details"
            />
        </div>
    {/if}
</div>
