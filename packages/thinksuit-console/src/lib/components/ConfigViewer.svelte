<script>
    import { onMount } from 'svelte';
    import { Card, Badge, JSONView, EmptyState } from '$lib/components/ui/index.js';

    let config = $state(null);
    let loading = $state(true);
    let error = $state(null);

    /**
     * Recursively walk an object and mask any field containing 'apikey' or 'token' in its name
     */
    function maskSensitiveFields(obj) {
        if (obj === null || obj === undefined) return obj;
        if (typeof obj !== 'object') return obj;
        if (Array.isArray(obj)) return obj.map(maskSensitiveFields);

        const result = {};
        for (const [key, value] of Object.entries(obj)) {
            const keyLower = key.toLowerCase();
            if (keyLower.includes('apikey') || keyLower.includes('token')) {
                // Mask the value if it exists
                result[key] = value ? '***' : value;
            } else if (typeof value === 'object' && value !== null) {
                // Recurse into nested objects
                result[key] = maskSensitiveFields(value);
            } else {
                result[key] = value;
            }
        }
        return result;
    }

    // Masked version for display
    let maskedConfig = $derived(config ? maskSensitiveFields(config) : null);

    onMount(async () => {
        try {
            const response = await fetch('/api/config');
            if (!response.ok) {
                throw new Error('Failed to fetch configuration');
            }
            config = await response.json();
        } catch (e) {
            error = e.message;
        } finally {
            loading = false;
        }
    });

    function getValueType(value) {
        if (value === true) return 'success';
        if (value === false) return 'danger';
        if (typeof value === 'string' && value.includes('***')) return 'warning';
        return 'secondary';
    }
</script>

<div class="h-full overflow-y-auto">
    <div class="p-6 space-y-4 max-w-6xl mx-auto">
        <div class="mb-4">
            <div class="flex items-center justify-between mb-2">
                <h1 class="text-xl font-bold">Configuration</h1>
                <Badge variant="secondary">Read-only</Badge>
            </div>
            {#if config?._sources}
                <div class="text-xs font-mono text-gray-500 space-y-1">
                    <div>
                        Sources: defaults
                        {#each config._sources.files as file (file.path)}
                            → {file.type}
                        {/each}
                        {#if Object.values(config._sources.environment).some(v => v)} → env{/if}
                        {#if config._sources.cli} → cli{/if}
                    </div>
                    {#each config._sources.files as file (file.path)}
                        <div class="flex items-center gap-2">
                            <span>{file.type}: {file.path}</span>
                            {#if file.error}
                                <Badge variant="danger" size="xs">parse error</Badge>
                            {:else if file.isEmpty}
                                <Badge variant="warning" size="xs">empty</Badge>
                            {/if}
                        </div>
                    {/each}
                    {#if config._sources.workingDirectory}
                        <div>cwd: {config._sources.workingDirectory}</div>
                    {/if}
                </div>
            {/if}
        </div>

        {#if loading}
            <EmptyState
                title="Loading configuration..."
                description="Fetching current ThinkSuit configuration"
                variant="loading"
            />
        {:else if error}
            <EmptyState
                title="Error loading configuration"
                description={error}
                variant="error"
            />
        {:else if config}
            <div class="grid gap-4">
                <!-- Core Settings -->
                <Card>
                    <div class="p-3">
                        <h2 class="text-sm font-semibold mb-3 text-gray-700">Core Settings</h2>
                        <div class="space-y-2 text-sm">
                            <div class="flex justify-between items-center">
                                <span class="text-gray-600">Module</span>
                                <Badge variant="primary">{config.module}</Badge>
                            </div>
                            <div class="flex justify-between items-center">
                                <span class="text-gray-600">Provider</span>
                                <Badge variant="secondary">{config.provider}</Badge>
                            </div>
                            <div class="flex justify-between items-center">
                                <span class="text-gray-600">Model</span>
                                <Badge variant="secondary">{config.model}</Badge>
                            </div>
                            {#if config.sessionId}
                                <div class="flex justify-between items-center">
                                    <span class="text-gray-600">Session ID</span>
                                    <span class="font-mono text-sm">{config.sessionId}</span>
                                </div>
                            {/if}
                        </div>
                    </div>
                </Card>

                <!-- Policy Settings -->
                {#if config.policy}
                    <Card>
                        <div class="p-3">
                            <h2 class="text-sm font-semibold mb-3 text-gray-700">Policy Settings</h2>
                            <div class="space-y-2 text-sm">
                                <div class="flex justify-between items-center">
                                    <span class="text-gray-600">Max Depth</span>
                                    <Badge variant="secondary">{config.policy.maxDepth}</Badge>
                                </div>
                                <div class="flex justify-between items-center">
                                    <span class="text-gray-600">Max Fanout</span>
                                    <Badge variant="secondary">{config.policy.maxFanout}</Badge>
                                </div>
                                <div class="flex justify-between items-center">
                                    <span class="text-gray-600">Max Children</span>
                                    <Badge variant="secondary">{config.policy.maxChildren}</Badge>
                                </div>
                            </div>
                        </div>
                    </Card>
                {/if}

                <!-- Logging Settings -->
                {#if config.logging}
                    <Card>
                        <div class="p-3">
                            <h2 class="text-sm font-semibold mb-3 text-gray-700">Logging Settings</h2>
                            <div class="space-y-2 text-sm">
                                <div class="flex justify-between items-center">
                                    <span class="text-gray-600">Silent Mode</span>
                                    <Badge variant={getValueType(config.logging.silent)}>
                                        {config.logging.silent}
                                    </Badge>
                                </div>
                                <div class="flex justify-between items-center">
                                    <span class="text-gray-600">Verbose Mode</span>
                                    <Badge variant={getValueType(config.logging.verbose)}>
                                        {config.logging.verbose}
                                    </Badge>
                                </div>
                            </div>
                        </div>
                    </Card>
                {/if}

                <!-- Features -->
                <Card>
                    <div class="p-3">
                        <h2 class="text-sm font-semibold mb-3 text-gray-700">Features</h2>
                        <div class="space-y-2 text-sm">
                            <div class="flex justify-between items-center">
                                <span class="text-gray-600">Tracing</span>
                                <Badge variant={getValueType(config.trace)}>
                                    {config.trace}
                                </Badge>
                            </div>
                            <div class="flex justify-between items-center">
                                <span class="text-gray-600">Debug Mode</span>
                                <Badge variant={getValueType(config.debug)}>
                                    {config.debug || false}
                                </Badge>
                            </div>
                        </div>
                    </div>
                </Card>

                <!-- API Keys -->
                {#if config.apiKeys}
                    <Card>
                        <div class="p-3">
                            <h2 class="text-sm font-semibold mb-3 text-gray-700">API Keys</h2>
                            <div class="space-y-2 text-sm">
                                <div class="flex justify-between items-center">
                                    <span class="text-gray-600">OpenAI</span>
                                    <Badge variant={config.apiKeys.openai ? 'success' : 'danger'}>
                                        {config.apiKeys.openai ? 'Configured' : 'Not Set'}
                                    </Badge>
                                </div>
                                <div class="flex justify-between items-center">
                                    <span class="text-gray-600">Anthropic</span>
                                    <Badge variant={config.apiKeys.anthropic ? 'success' : 'danger'}>
                                        {config.apiKeys.anthropic ? 'Configured' : 'Not Set'}
                                    </Badge>
                                </div>
                            </div>
                        </div>
                    </Card>
                {/if}

                <!-- Tools -->
                {#if config.tools && config.tools.length > 0}
                    <Card>
                        <div class="p-3">
                            <h2 class="text-sm font-semibold mb-3 text-gray-700">Enabled Tools</h2>
                            <div class="flex flex-wrap gap-2">
                                {#each config.tools as tool (tool)}
                                    <Badge variant="primary">{tool}</Badge>
                                {/each}
                            </div>
                        </div>
                    </Card>
                {/if}

                <!-- Working Directory -->
                {#if config.cwd}
                    <Card>
                        <div class="p-3">
                            <h2 class="text-sm font-semibold mb-3 text-gray-700">Working Directory</h2>
                            <code class="text-sm bg-gray-100 p-2 rounded block">{config.cwd}</code>
                        </div>
                    </Card>
                {/if}

                <!-- Raw Configuration -->
                <Card>
                    <div class="p-3">
                        <h2 class="text-sm font-semibold mb-3 text-gray-700">Raw Configuration</h2>
                        <JSONView data={maskedConfig} />
                    </div>
                </Card>
            </div>
        {/if}
    </div>
</div>
