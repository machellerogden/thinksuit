<script>
    import { onMount } from 'svelte';
    import { Card, Badge, Button, Input, Checkbox, EmptyState } from '$lib/components/ui/index.js';

    let config = $state({});
    let originalConfig = $state({});
    let loading = $state(true);
    let saving = $state(false);
    let error = $state(null);
    let saveSuccess = $state(false);
    let configPath = $state('');
    let exists = $state(false);
    let validationErrors = $state([]);

    // Form fields
    let module = $state('');
    let modulesPackage = $state('');
    let provider = $state('');
    let model = $state('');
    let maxDepth = $state(5);
    let maxFanout = $state(3);
    let maxChildren = $state(5);
    let cwd = $state('');
    let trace = $state(false);
    let silent = $state(false);
    let verbose = $state(false);
    let allowedTools = $state('');
    let allowedDirectories = $state('');
    let mcpServersJson = $state('');
    let approvalTimeout = $state(43200000);

    onMount(async () => {
        await loadConfig();
    });

    async function loadConfig() {
        loading = true;
        error = null;
        try {
            const response = await fetch('/api/config/user');
            if (!response.ok) {
                throw new Error('Failed to fetch user configuration');
            }
            const data = await response.json();

            exists = data.exists;
            configPath = data.path;
            config = data.config || {};
            originalConfig = JSON.parse(JSON.stringify(config));
            validationErrors = data.validationErrors || [];

            // Populate form fields
            module = config.module || '';
            modulesPackage = config.modulesPackage || '';
            provider = config.provider || '';
            model = config.model || '';
            maxDepth = config.maxDepth || 5;
            maxFanout = config.maxFanout || 3;
            maxChildren = config.maxChildren || 5;
            cwd = config.cwd || '';
            trace = config.trace || false;
            silent = config.silent || false;
            verbose = config.verbose || false;
            allowedTools = Array.isArray(config.allowedTools) ? config.allowedTools.join(', ') : '';
            allowedDirectories = Array.isArray(config.allowedDirectories) ? config.allowedDirectories.join('\n') : '';
            mcpServersJson = config.mcpServers ? JSON.stringify(config.mcpServers, null, 2) : '{}';
            approvalTimeout = config.approvalTimeout !== undefined ? config.approvalTimeout : 43200000;
        } catch (e) {
            error = e.message;
        } finally {
            loading = false;
        }
    }

    async function saveConfig() {
        saving = true;
        error = null;
        saveSuccess = false;

        try {
            // Build config object from form fields
            const updatedConfig = {};

            if (module) updatedConfig.module = module;
            if (modulesPackage) updatedConfig.modulesPackage = modulesPackage;
            if (provider) updatedConfig.provider = provider;
            if (model) updatedConfig.model = model;
            if (maxDepth !== undefined) updatedConfig.maxDepth = maxDepth;
            if (maxFanout !== undefined) updatedConfig.maxFanout = maxFanout;
            if (maxChildren !== undefined) updatedConfig.maxChildren = maxChildren;
            if (cwd) updatedConfig.cwd = cwd;
            updatedConfig.trace = trace;
            updatedConfig.silent = silent;
            updatedConfig.verbose = verbose;
            if (approvalTimeout !== undefined) updatedConfig.approvalTimeout = approvalTimeout;

            // Parse arrays
            if (allowedTools.trim()) {
                updatedConfig.allowedTools = allowedTools.split(',').map(t => t.trim()).filter(Boolean);
            }
            if (allowedDirectories.trim()) {
                updatedConfig.allowedDirectories = allowedDirectories.split('\n').map(d => d.trim()).filter(Boolean);
            }

            // Parse MCP servers JSON
            if (mcpServersJson.trim() && mcpServersJson.trim() !== '{}') {
                try {
                    updatedConfig.mcpServers = JSON.parse(mcpServersJson);
                } catch (e) {
                    throw new Error(`Invalid MCP Servers JSON: ${e.message}`);
                }
            }

            const response = await fetch('/api/config/user', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ config: updatedConfig })
            });

            if (!response.ok) {
                const data = await response.json();
                if (data.validationErrors) {
                    validationErrors = data.validationErrors;
                    throw new Error('Configuration validation failed. Please fix the errors below.');
                }
                throw new Error(data.message || 'Failed to save configuration');
            }

            // Clear validation errors on successful save
            validationErrors = [];

            saveSuccess = true;
            setTimeout(() => saveSuccess = false, 3000);

            // Reload to confirm changes
            await loadConfig();
        } catch (e) {
            error = e.message;
        } finally {
            saving = false;
        }
    }

    function resetForm() {
        config = JSON.parse(JSON.stringify(originalConfig));
        module = config.module || '';
        modulesPackage = config.modulesPackage || '';
        provider = config.provider || '';
        model = config.model || '';
        maxDepth = config.maxDepth || 5;
        maxFanout = config.maxFanout || 3;
        maxChildren = config.maxChildren || 5;
        cwd = config.cwd || '';
        trace = config.trace || false;
        silent = config.silent || false;
        verbose = config.verbose || false;
        allowedTools = Array.isArray(config.allowedTools) ? config.allowedTools.join(', ') : '';
        allowedDirectories = Array.isArray(config.allowedDirectories) ? config.allowedDirectories.join('\n') : '';
        mcpServersJson = config.mcpServers ? JSON.stringify(config.mcpServers, null, 2) : '{}';
        approvalTimeout = config.approvalTimeout !== undefined ? config.approvalTimeout : 43200000;
        error = null;
        saveSuccess = false;
    }

    let hasChanges = $derived.by(() => {
        const current = {
            module, modulesPackage, provider, model, maxDepth, maxFanout, maxChildren, cwd, trace, silent, verbose,
            allowedTools: allowedTools.split(',').map(t => t.trim()).filter(Boolean),
            allowedDirectories: allowedDirectories.split('\n').map(d => d.trim()).filter(Boolean),
            mcpServersJson,
            approvalTimeout
        };
        const original = {
            module: originalConfig.module || '',
            modulesPackage: originalConfig.modulesPackage || '',
            provider: originalConfig.provider || '',
            model: originalConfig.model || '',
            maxDepth: originalConfig.maxDepth || 5,
            maxFanout: originalConfig.maxFanout || 3,
            maxChildren: originalConfig.maxChildren || 5,
            cwd: originalConfig.cwd || '',
            trace: originalConfig.trace || false,
            silent: originalConfig.silent || false,
            verbose: originalConfig.verbose || false,
            allowedTools: Array.isArray(originalConfig.allowedTools) ? originalConfig.allowedTools : [],
            allowedDirectories: Array.isArray(originalConfig.allowedDirectories) ? originalConfig.allowedDirectories : [],
            mcpServersJson: originalConfig.mcpServers ? JSON.stringify(originalConfig.mcpServers, null, 2) : '{}',
            approvalTimeout: originalConfig.approvalTimeout !== undefined ? originalConfig.approvalTimeout : 43200000
        };

        return JSON.stringify(current) !== JSON.stringify(original);
    });
</script>

<div class="h-full overflow-y-auto">
    <div class="p-6 space-y-4 max-w-4xl mx-auto">
        <div class="mb-4">
            <div class="flex items-center justify-between mb-2">
                <h1 class="text-xl font-bold">User Configuration</h1>
                <Badge variant="primary">Editable</Badge>
            </div>
            <div class="text-xs font-mono text-gray-500">
                {configPath}
            </div>
            {#if !exists}
                <div class="text-xs text-orange-600 mt-1">
                    File does not exist yet. It will be created when you save.
                </div>
            {/if}
        </div>

        {#if loading}
            <EmptyState
                title="Loading configuration..."
                description="Fetching user configuration file"
                variant="loading"
            />
        {:else if error && !saveSuccess}
            <div class="bg-red-50 border border-red-200 rounded p-3 text-sm text-red-700">
                <strong>Error:</strong> {error}
            </div>
        {:else}
            {#if validationErrors.length > 0}
                <div class="bg-orange-50 border border-orange-200 rounded p-3 mb-4">
                    <div class="flex items-start gap-2">
                        <svg class="w-5 h-5 text-orange-600 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                        <div class="flex-1">
                            <strong class="text-sm font-semibold text-orange-900">Configuration Validation Warnings</strong>
                            <ul class="mt-2 text-sm text-orange-800 space-y-1">
                                {#each validationErrors as err}
                                    <li class="flex items-start gap-1">
                                        <span class="text-orange-600">•</span>
                                        <span>{err.property ? `${err.property}: ` : ''}{err.message}</span>
                                    </li>
                                {/each}
                            </ul>
                        </div>
                    </div>
                </div>
            {/if}

            {#if saveSuccess}
                <div class="bg-green-50 border border-green-200 rounded p-3 text-sm text-green-700">
                    Configuration saved successfully!
                </div>
            {/if}

            <form onsubmit={(e) => { e.preventDefault(); saveConfig(); }} class="space-y-4">
                <!-- Core Settings -->
                <Card>
                    <div class="p-4">
                        <h2 class="text-sm font-semibold mb-4 text-gray-700">Core Settings</h2>
                        <div class="space-y-3">
                            <div>
                                <label class="block text-xs font-medium text-gray-600 mb-1">Module</label>
                                <Input
                                    bind:value={module}
                                    placeholder="thinksuit/mu"
                                />
                            </div>
                            <div>
                                <label class="block text-xs font-medium text-gray-600 mb-1">Modules Package</label>
                                <Input
                                    bind:value={modulesPackage}
                                    placeholder="/path/to/custom/modules"
                                />
                                <p class="text-xs text-gray-500 mt-1">
                                    Path to custom modules package directory (optional)
                                </p>
                            </div>
                            <div class="grid grid-cols-2 gap-3">
                                <div>
                                    <label class="block text-xs font-medium text-gray-600 mb-1">Provider</label>
                                    <Input
                                        bind:value={provider}
                                        placeholder="openai"
                                    />
                                </div>
                                <div>
                                    <label class="block text-xs font-medium text-gray-600 mb-1">Model</label>
                                    <Input
                                        bind:value={model}
                                        placeholder="gpt-4o-mini"
                                    />
                                </div>
                            </div>
                            <div>
                                <label class="block text-xs font-medium text-gray-600 mb-1">Working Directory</label>
                                <Input
                                    bind:value={cwd}
                                    placeholder="/path/to/working/directory"
                                />
                            </div>
                        </div>
                    </div>
                </Card>

                <!-- Policy Settings -->
                <Card>
                    <div class="p-4">
                        <h2 class="text-sm font-semibold mb-4 text-gray-700">Policy Settings</h2>
                        <div class="grid grid-cols-3 gap-3">
                            <div>
                                <label class="block text-xs font-medium text-gray-600 mb-1">Max Depth</label>
                                <Input
                                    type="number"
                                    bind:value={maxDepth}
                                    min="1"
                                    max="20"
                                />
                            </div>
                            <div>
                                <label class="block text-xs font-medium text-gray-600 mb-1">Max Fanout</label>
                                <Input
                                    type="number"
                                    bind:value={maxFanout}
                                    min="1"
                                    max="10"
                                />
                            </div>
                            <div>
                                <label class="block text-xs font-medium text-gray-600 mb-1">Max Children</label>
                                <Input
                                    type="number"
                                    bind:value={maxChildren}
                                    min="1"
                                    max="20"
                                />
                            </div>
                        </div>
                    </div>
                </Card>

                <!-- Features -->
                <Card>
                    <div class="p-4">
                        <h2 class="text-sm font-semibold mb-4 text-gray-700">Features</h2>
                        <div class="space-y-2">
                            <label class="flex items-center gap-2 cursor-pointer">
                                <Checkbox bind:checked={trace} />
                                <span class="text-sm text-gray-600">Enable tracing</span>
                            </label>
                            <label class="flex items-center gap-2 cursor-pointer">
                                <Checkbox bind:checked={silent} />
                                <span class="text-sm text-gray-600">Silent mode (suppress all logging)</span>
                            </label>
                            <label class="flex items-center gap-2 cursor-pointer">
                                <Checkbox bind:checked={verbose} />
                                <span class="text-sm text-gray-600">Verbose logging</span>
                            </label>
                        </div>
                    </div>
                </Card>

                <!-- Allowed Tools -->
                <Card>
                    <div class="p-4">
                        <h2 class="text-sm font-semibold mb-4 text-gray-700">Allowed Tools</h2>
                        <div>
                            <label class="block text-xs font-medium text-gray-600 mb-1">
                                Tool names (comma-separated)
                            </label>
                            <Input
                                bind:value={allowedTools}
                                placeholder="read_file, list_directory, execute_command"
                            />
                            <p class="text-xs text-gray-500 mt-1">
                                Leave empty to allow all tools
                            </p>
                        </div>
                    </div>
                </Card>

                <!-- Allowed Directories -->
                <Card>
                    <div class="p-4">
                        <h2 class="text-sm font-semibold mb-4 text-gray-700">Allowed Directories</h2>
                        <div>
                            <label class="block text-xs font-medium text-gray-600 mb-1">
                                Directory paths (one per line)
                            </label>
                            <textarea
                                bind:value={allowedDirectories}
                                class="w-full px-3 py-2 border border-gray-300 rounded text-sm font-mono"
                                rows="4"
                                placeholder="/path/to/directory1&#10;/path/to/directory2"
                            ></textarea>
                            <p class="text-xs text-gray-500 mt-1">
                                Leave empty to allow current working directory
                            </p>
                        </div>
                    </div>
                </Card>

                <!-- MCP Servers -->
                <Card>
                    <div class="p-4">
                        <h2 class="text-sm font-semibold mb-4 text-gray-700">MCP Servers</h2>
                        <div>
                            <label class="block text-xs font-medium text-gray-600 mb-1">
                                Server configuration (JSON)
                            </label>
                            <textarea
                                bind:value={mcpServersJson}
                                class="w-full px-3 py-2 border border-gray-300 rounded text-sm font-mono"
                                rows="10"
                                placeholder="{`{
  "serverName": {
    "command": "npx",
    "args": ["-y", "package-name"],
    "env": {}
  }
}`}"
                            ></textarea>
                            <p class="text-xs text-gray-500 mt-1">
                                Must be valid JSON
                            </p>
                        </div>
                    </div>
                </Card>

                <!-- Advanced Settings -->
                <Card>
                    <div class="p-4">
                        <h2 class="text-sm font-semibold mb-4 text-gray-700">Advanced Settings</h2>
                        <div>
                            <label class="block text-xs font-medium text-gray-600 mb-1">
                                Approval Timeout (milliseconds)
                            </label>
                            <Input
                                type="number"
                                bind:value={approvalTimeout}
                                placeholder="43200000"
                            />
                            <p class="text-xs text-gray-500 mt-1">
                                Tool approval timeout in milliseconds. Default: 43200000 (12 hours). Set to -1 to disable.
                            </p>
                        </div>
                    </div>
                </Card>

                <!-- Action Buttons -->
                <div class="flex justify-end gap-2 pt-4 border-t">
                    <Button
                        type="button"
                        variant="secondary"
                        onclick={resetForm}
                        disabled={!hasChanges || saving}
                    >
                        Reset
                    </Button>
                    <Button
                        type="submit"
                        variant="primary"
                        disabled={!hasChanges || saving}
                    >
                        {saving ? 'Saving...' : 'Save Configuration'}
                    </Button>
                </div>
            </form>
        {/if}
    </div>
</div>
