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
    let workdir = $state('');
    let cwd = $state('');
    let trace = $state(false);
    let silent = $state(false);
    let verbose = $state(false);
    let allowedTools = $state('');
    let allowedDirectories = $state('');
    let mcpServersJson = $state('');
    let approvalTimeout = $state(43200000);

    // Voice (thinksuit-voice daemon) — backend selection + device, never secrets
    let voiceInputDeviceName = $state('');
    let voiceSttProvider = $state('');
    let voiceTtsProvider = $state('');
    let voiceDetectorProvider = $state('');

    // Capture / endpointer tuning (post-wake recording)
    let voiceCaptureRmsThreshold = $state(400);
    let voiceCaptureSilenceMs = $state(700);
    let voiceCaptureStartTimeoutMs = $state(3000);
    let voiceCaptureMaxMs = $state(300000);

    // Audio feedback cues
    let voiceCuesEnabled = $state(true);
    let voiceCuesStart = $state('/System/Library/Sounds/Tink.aiff');
    let voiceCuesEnd = $state('/System/Library/Sounds/Pop.aiff');
    let voiceCuesError = $state('/System/Library/Sounds/Funk.aiff');
    let voiceCuesWorking = $state('/System/Library/Sounds/Purr.aiff');

    // Input devices for the wake-word selector (listed by name; saved by name)
    let inputDevices = $state([]);
    let devicesError = $state(null);

    onMount(async () => {
        await loadConfig();
        await loadDevices();
    });

    async function loadDevices() {
        devicesError = null;
        try {
            const response = await fetch('/api/voice/devices');
            if (!response.ok) throw new Error('Failed to list input devices');
            const data = await response.json();
            inputDevices = data.devices || [];
        } catch (e) {
            devicesError = e.message;
            inputDevices = [];
        }
    }

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
            workdir = config.workdir || '';
            cwd = config.cwd || '';
            trace = config.trace || false;
            silent = config.silent || false;
            verbose = config.verbose || false;
            allowedTools = Array.isArray(config.allowedTools) ? config.allowedTools.join(', ') : '';
            allowedDirectories = Array.isArray(config.allowedDirectories) ? config.allowedDirectories.join('\n') : '';
            mcpServersJson = config.mcpServers ? JSON.stringify(config.mcpServers, null, 2) : '{}';
            approvalTimeout = config.approvalTimeout !== undefined ? config.approvalTimeout : 43200000;

            const voice = config.voice || {};
            voiceInputDeviceName = voice.input?.deviceName || '';
            voiceSttProvider = voice.stt?.provider || '';
            voiceTtsProvider = voice.tts?.provider || '';
            voiceDetectorProvider = voice.detector?.provider || '';
            voiceCaptureRmsThreshold = voice.capture?.rmsThreshold ?? 400;
            voiceCaptureSilenceMs = voice.capture?.silenceMs ?? 700;
            voiceCaptureStartTimeoutMs = voice.capture?.startTimeoutMs ?? 3000;
            voiceCaptureMaxMs = voice.capture?.maxMs ?? 300000;
            voiceCuesEnabled = voice.cues?.enabled ?? true;
            voiceCuesStart = voice.cues?.start || '/System/Library/Sounds/Tink.aiff';
            voiceCuesEnd = voice.cues?.end || '/System/Library/Sounds/Pop.aiff';
            voiceCuesError = voice.cues?.error || '/System/Library/Sounds/Funk.aiff';
            voiceCuesWorking = voice.cues?.working || '/System/Library/Sounds/Purr.aiff';
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
            if (workdir) updatedConfig.workdir = workdir;
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

            // Voice config (only emit sub-sections that have values; never secrets)
            const input = {};
            if (voiceInputDeviceName) input.deviceName = voiceInputDeviceName;
            const capture = {};
            if (voiceCaptureRmsThreshold !== undefined && voiceCaptureRmsThreshold !== '') capture.rmsThreshold = Number(voiceCaptureRmsThreshold);
            if (voiceCaptureSilenceMs !== undefined && voiceCaptureSilenceMs !== '') capture.silenceMs = Number(voiceCaptureSilenceMs);
            if (voiceCaptureStartTimeoutMs !== undefined && voiceCaptureStartTimeoutMs !== '') capture.startTimeoutMs = Number(voiceCaptureStartTimeoutMs);
            if (voiceCaptureMaxMs !== undefined && voiceCaptureMaxMs !== '') capture.maxMs = Number(voiceCaptureMaxMs);
            const cues = { enabled: voiceCuesEnabled };
            if (voiceCuesStart) cues.start = voiceCuesStart;
            if (voiceCuesEnd) cues.end = voiceCuesEnd;
            if (voiceCuesError) cues.error = voiceCuesError;
            if (voiceCuesWorking) cues.working = voiceCuesWorking;
            const voice = {};
            if (Object.keys(input).length) voice.input = input;
            if (Object.keys(capture).length) voice.capture = capture;
            voice.cues = cues;
            if (voiceSttProvider) voice.stt = { provider: voiceSttProvider };
            if (voiceTtsProvider) voice.tts = { provider: voiceTtsProvider };
            if (voiceDetectorProvider) voice.detector = { provider: voiceDetectorProvider };
            if (Object.keys(voice).length) updatedConfig.voice = voice;

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
        const voice = config.voice || {};
        voiceInputDeviceName = voice.input?.deviceName || '';
        voiceSttProvider = voice.stt?.provider || '';
        voiceTtsProvider = voice.tts?.provider || '';
        voiceDetectorProvider = voice.detector?.provider || '';
        voiceCaptureRmsThreshold = voice.capture?.rmsThreshold ?? 400;
        voiceCaptureSilenceMs = voice.capture?.silenceMs ?? 700;
        voiceCaptureStartTimeoutMs = voice.capture?.startTimeoutMs ?? 3000;
        voiceCaptureMaxMs = voice.capture?.maxMs ?? 300000;
        voiceCuesEnabled = voice.cues?.enabled ?? true;
        voiceCuesStart = voice.cues?.start || '/System/Library/Sounds/Tink.aiff';
        voiceCuesEnd = voice.cues?.end || '/System/Library/Sounds/Pop.aiff';
        voiceCuesError = voice.cues?.error || '/System/Library/Sounds/Funk.aiff';
        voiceCuesWorking = voice.cues?.working || '/System/Library/Sounds/Purr.aiff';
        error = null;
        saveSuccess = false;
    }

    let hasChanges = $derived.by(() => {
        const current = {
            module, modulesPackage, provider, model, maxDepth, maxFanout, maxChildren, workdir, cwd, trace, silent, verbose,
            allowedTools: allowedTools.split(',').map(t => t.trim()).filter(Boolean),
            allowedDirectories: allowedDirectories.split('\n').map(d => d.trim()).filter(Boolean),
            mcpServersJson,
            approvalTimeout,
            voiceInputDeviceName, voiceSttProvider, voiceTtsProvider, voiceDetectorProvider,
            voiceCaptureRmsThreshold, voiceCaptureSilenceMs, voiceCaptureStartTimeoutMs, voiceCaptureMaxMs,
            voiceCuesEnabled, voiceCuesStart, voiceCuesEnd, voiceCuesError, voiceCuesWorking
        };
        const original = {
            module: originalConfig.module || '',
            modulesPackage: originalConfig.modulesPackage || '',
            provider: originalConfig.provider || '',
            model: originalConfig.model || '',
            maxDepth: originalConfig.maxDepth || 5,
            maxFanout: originalConfig.maxFanout || 3,
            maxChildren: originalConfig.maxChildren || 5,
            workdir: originalConfig.workdir || '',
            cwd: originalConfig.cwd || '',
            trace: originalConfig.trace || false,
            silent: originalConfig.silent || false,
            verbose: originalConfig.verbose || false,
            allowedTools: Array.isArray(originalConfig.allowedTools) ? originalConfig.allowedTools : [],
            allowedDirectories: Array.isArray(originalConfig.allowedDirectories) ? originalConfig.allowedDirectories : [],
            mcpServersJson: originalConfig.mcpServers ? JSON.stringify(originalConfig.mcpServers, null, 2) : '{}',
            approvalTimeout: originalConfig.approvalTimeout !== undefined ? originalConfig.approvalTimeout : 43200000,
            voiceInputDeviceName: originalConfig.voice?.input?.deviceName || '',
            voiceSttProvider: originalConfig.voice?.stt?.provider || '',
            voiceTtsProvider: originalConfig.voice?.tts?.provider || '',
            voiceDetectorProvider: originalConfig.voice?.detector?.provider || '',
            voiceCaptureRmsThreshold: originalConfig.voice?.capture?.rmsThreshold ?? 400,
            voiceCaptureSilenceMs: originalConfig.voice?.capture?.silenceMs ?? 700,
            voiceCaptureStartTimeoutMs: originalConfig.voice?.capture?.startTimeoutMs ?? 3000,
            voiceCaptureMaxMs: originalConfig.voice?.capture?.maxMs ?? 300000,
            voiceCuesEnabled: originalConfig.voice?.cues?.enabled ?? true,
            voiceCuesStart: originalConfig.voice?.cues?.start || '/System/Library/Sounds/Tink.aiff',
            voiceCuesEnd: originalConfig.voice?.cues?.end || '/System/Library/Sounds/Pop.aiff',
            voiceCuesError: originalConfig.voice?.cues?.error || '/System/Library/Sounds/Funk.aiff',
            voiceCuesWorking: originalConfig.voice?.cues?.working || '/System/Library/Sounds/Purr.aiff'
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
                                {#each validationErrors as err, i (i)}
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
                                <label for="module" class="block text-xs font-medium text-gray-600 mb-1">
                                    Module
                                    <Input
                                        name="module"
                                        bind:value={module}
                                        placeholder="thinksuit/mu"
                                    />
                                </label>
                            </div>
                            <div>
                                <label for="modules-package" class="block text-xs font-medium text-gray-600 mb-1">
                                    Modules Package
                                    <Input
                                        name="modules-package"
                                        bind:value={modulesPackage}
                                        placeholder="/path/to/custom/modules"
                                    />
                                </label>
                                <p class="text-xs text-gray-500 mt-1">
                                    Path to custom modules package directory (optional)
                                </p>
                            </div>
                            <div class="grid grid-cols-2 gap-3">
                                <div>
                                    <label for="provider" class="block text-xs font-medium text-gray-600 mb-1">
                                        Provider
                                        <Input
                                            name="provider"
                                            bind:value={provider}
                                            placeholder="openai"
                                        />
                                    </label>
                                </div>
                                <div>
                                    <label for="model" class="block text-xs font-medium text-gray-600 mb-1">
                                        Model
                                        <Input
                                            name="model"
                                            bind:value={model}
                                            placeholder="gpt-4o-mini"
                                        />
                                    </label>
                                </div>
                            </div>
                            <div>
                                <label for="workdir" class="block text-xs font-medium text-gray-600 mb-1">
                                    Workdir (default session home base)
                                    <Input
                                        name="workdir"
                                        bind:value={workdir}
                                        placeholder="/path/to/home-base"
                                    />
                                </label>
                            </div>
                            <div>
                                <label for="cwd" class="block text-xs font-medium text-gray-600 mb-1">
                                    Working Directory (legacy; prefer Workdir)
                                    <Input
                                        name="cwd"
                                        bind:value={cwd}
                                        placeholder="/path/to/working/directory"
                                    />
                                </label>
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
                                <label for="max-depth-input" class="block text-xs font-medium text-gray-600 mb-1">
                                    Max Depth
                                    <Input
                                        name="max-depth-input"
                                        type="number"
                                        bind:value={maxDepth}
                                        min="1"
                                        max="20"
                                    />
                                </label>
                            </div>
                            <div>
                                <label for="max-fanout-input" class="block text-xs font-medium text-gray-600 mb-1">
                                    Max Fanout
                                    <Input
                                        name="max-fanout-input"
                                        type="number"
                                        bind:value={maxFanout}
                                        min="1"
                                        max="10"
                                    />
                                </label>
                            </div>
                            <div>
                                <label for="max-children-input" class="block text-xs font-medium text-gray-600 mb-1">
                                    Max Children
                                    <Input
                                        name="max-children-input"
                                        type="number"
                                        bind:value={maxChildren}
                                        min="1"
                                        max="20"
                                    />
                                </label>
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
                            <label for="allowed-tools-input" class="block text-xs font-medium text-gray-600 mb-1">
                                Tool names (comma-separated)
                                <Input
                                    name="allowed-tools-input"
                                    bind:value={allowedTools}
                                    placeholder="read_text_file, list_directory, execute_command"
                                />
                            </label>
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
                            <label for="allowed-directories-textarea" class="block text-xs font-medium text-gray-600 mb-1">
                                Directory paths (one per line)
                                <textarea
                                    name="allowed-directories-textarea"
                                    bind:value={allowedDirectories}
                                    class="w-full px-3 py-2 border border-gray-300 rounded text-sm font-mono"
                                    rows="4"
                                    placeholder="/path/to/directory1&#10;/path/to/directory2"
                                ></textarea>
                            </label>
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
                            <label for="mcp-servers-textarea" class="block text-xs font-medium text-gray-600 mb-1">
                                Server configuration (JSON)
                                <textarea
                                    name="mcp-servers-textarea"
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
                            </label>
                            <p class="text-xs text-gray-500 mt-1">
                                Must be valid JSON
                            </p>
                        </div>
                    </div>
                </Card>

                <!-- Voice -->
                <Card>
                    <div class="p-4">
                        <h2 class="text-sm font-semibold mb-4 text-gray-700">Voice (thinksuit-voice)</h2>
                        <p class="text-xs text-gray-500 mb-4">
                            Backend selection and input device for the hands-free voice daemon. Never holds secrets.
                        </p>
                        <div class="space-y-3">
                            <div>
                                <label for="voice-device" class="block text-xs font-medium text-gray-600 mb-1">
                                    Input Device
                                </label>
                                {#if inputDevices.length > 0}
                                    <select
                                        id="voice-device"
                                        bind:value={voiceInputDeviceName}
                                        class="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                                    >
                                        <option value="">System default</option>
                                        {#each inputDevices as dev (dev.id)}
                                            <option value={dev.name}>{dev.name} ({dev.channels}ch)</option>
                                        {/each}
                                    </select>
                                {:else}
                                    <Input
                                        name="voice-device"
                                        bind:value={voiceInputDeviceName}
                                        placeholder="MacBook Pro Microphone"
                                    />
                                    <p class="text-xs text-orange-600 mt-1">
                                        {devicesError ? `Could not list devices (${devicesError}). Type a device name (empty = system default).` : 'Loading devices…'}
                                    </p>
                                {/if}
                                <p class="text-xs text-gray-500 mt-1">
                                    The one microphone for the whole voice harness (wake + capture). Saved by name and resolved to the live device id at startup. System default follows macOS Sound settings.
                                </p>
                            </div>
                            <div class="grid grid-cols-2 gap-3">
                                <div>
                                    <label for="voice-stt" class="block text-xs font-medium text-gray-600 mb-1">
                                        STT Provider
                                        <Input
                                            name="voice-stt"
                                            bind:value={voiceSttProvider}
                                            placeholder="whisper"
                                        />
                                    </label>
                                </div>
                                <div>
                                    <label for="voice-tts" class="block text-xs font-medium text-gray-600 mb-1">
                                        TTS Provider
                                        <Input
                                            name="voice-tts"
                                            bind:value={voiceTtsProvider}
                                            placeholder="say"
                                        />
                                    </label>
                                </div>
                            </div>

                            <div class="mt-3">
                                <label for="voice-detector" class="block text-xs font-medium text-gray-600 mb-1">
                                    Endpointing detector
                                </label>
                                <select
                                    id="voice-detector"
                                    bind:value={voiceDetectorProvider}
                                    class="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                                >
                                    <option value="">Default (silero)</option>
                                    <option value="silero">silero — neural VAD, reliable in noise (default)</option>
                                    <option value="rms">rms — energy threshold, transparent (fallback)</option>
                                </select>
                                <p class="text-xs text-gray-500 mt-1">
                                    How end-of-turn is detected. silero handles background noise; rms is a simple energy threshold. Restart the voice daemon to apply.
                                </p>
                            </div>

                            <div class="pt-3 border-t border-gray-100">
                                <h3 class="text-xs font-semibold text-gray-600 mb-2">Capture tuning</h3>
                                <div class="grid grid-cols-2 gap-3">
                                    <div>
                                        <label for="voice-capture-maxms" class="block text-xs font-medium text-gray-600 mb-1">
                                            Max utterance (ms)
                                            <Input name="voice-capture-maxms" type="number" bind:value={voiceCaptureMaxMs} min="1000" />
                                        </label>
                                        <p class="text-xs text-gray-500 mt-1">Hard cap on one utterance. Default 300000 (5 min).</p>
                                    </div>
                                    <div>
                                        <label for="voice-capture-silence" class="block text-xs font-medium text-gray-600 mb-1">
                                            Trailing silence (ms)
                                            <Input name="voice-capture-silence" type="number" bind:value={voiceCaptureSilenceMs} min="100" />
                                        </label>
                                        <p class="text-xs text-gray-500 mt-1">Silence that ends an utterance. Default 700.</p>
                                    </div>
                                    <div>
                                        <label for="voice-capture-starttimeout" class="block text-xs font-medium text-gray-600 mb-1">
                                            Start timeout (ms)
                                            <Input name="voice-capture-starttimeout" type="number" bind:value={voiceCaptureStartTimeoutMs} min="500" />
                                        </label>
                                        <p class="text-xs text-gray-500 mt-1">Abort if no speech starts after wake. Default 3000.</p>
                                    </div>
                                    <div>
                                        <label for="voice-capture-rms" class="block text-xs font-medium text-gray-600 mb-1">
                                            Speech RMS threshold
                                            <Input name="voice-capture-rms" type="number" bind:value={voiceCaptureRmsThreshold} min="0" />
                                        </label>
                                        <p class="text-xs text-gray-500 mt-1">int16 RMS above which a frame is speech. Default 400.</p>
                                    </div>
                                </div>
                            </div>

                            <div class="pt-3 border-t border-gray-100">
                                <h3 class="text-xs font-semibold text-gray-600 mb-2">Feedback cues</h3>
                                <label class="flex items-center gap-2 cursor-pointer mb-3">
                                    <Checkbox bind:checked={voiceCuesEnabled} />
                                    <span class="text-sm text-gray-600">Play audio cues</span>
                                </label>
                                <div class="space-y-3">
                                    <div>
                                        <label for="voice-cue-start" class="block text-xs font-medium text-gray-600 mb-1">
                                            Listening start sound
                                            <Input name="voice-cue-start" bind:value={voiceCuesStart} placeholder="/System/Library/Sounds/Tink.aiff" />
                                        </label>
                                        <p class="text-xs text-gray-500 mt-1">Plays and finishes before recording starts.</p>
                                    </div>
                                    <div>
                                        <label for="voice-cue-end" class="block text-xs font-medium text-gray-600 mb-1">
                                            Listening end sound
                                            <Input name="voice-cue-end" bind:value={voiceCuesEnd} placeholder="/System/Library/Sounds/Pop.aiff" />
                                        </label>
                                    </div>
                                    <div>
                                        <label for="voice-cue-working" class="block text-xs font-medium text-gray-600 mb-1">
                                            Working / awaiting sound (looped)
                                            <Input name="voice-cue-working" bind:value={voiceCuesWorking} placeholder="/System/Library/Sounds/Purr.aiff" />
                                        </label>
                                        <p class="text-xs text-gray-500 mt-1">Loops from turn submit until the response arrives.</p>
                                    </div>
                                    <div>
                                        <label for="voice-cue-error" class="block text-xs font-medium text-gray-600 mb-1">
                                            Error sound
                                            <Input name="voice-cue-error" bind:value={voiceCuesError} placeholder="/System/Library/Sounds/Funk.aiff" />
                                        </label>
                                        <p class="text-xs text-gray-500 mt-1">Signals a failed turn — go look at the console.</p>
                                    </div>
                                </div>
                                <p class="text-xs text-gray-500 mt-2">Leave a field empty to disable that one cue. Paths are macOS sound files.</p>
                            </div>
                        </div>
                    </div>
                </Card>

                <!-- Advanced Settings -->
                <Card>
                    <div class="p-4">
                        <h2 class="text-sm font-semibold mb-4 text-gray-700">Advanced Settings</h2>
                        <div>
                            <label for="approval-timeout-input" class="block text-xs font-medium text-gray-600 mb-1">
                                Approval Timeout (milliseconds)
                                <Input
                                    name="approval-timeout-input"
                                    type="number"
                                    bind:value={approvalTimeout}
                                    placeholder="43200000"
                                />
                            </label>
                            <p class="text-xs text-gray-500 mt-1">
                                Tool approval timeout in milliseconds. Default: 43200000 (12 hours). Set to -1 to disable.
                            </p>
                        </div>
                    </div>
                </Card>

                <!-- Action Buttons -->
                <div class="flex justify-end gap-2 pt-4">
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
