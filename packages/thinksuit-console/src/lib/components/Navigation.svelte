<script>
    import { location, matchAndResolve } from '$lib/components/HashRouter.svelte';
    import { getSession } from '$lib/stores/session.svelte.js';
    import { ui } from '$lib/stores/ui.svelte.js';

    const session = getSession();

    let runHref = $derived(session.id ? `#/run/sessions/${session.id}/workbench` : '#/run');
    let expanded = $state(false);
</script>

<nav class="relative bg-gradient-to-t from-gray-100 to-white border-b border-gray-300 text-black transition-all duration-300 {expanded ? 'pb-40' : ''}">
    <div class="flex items-center justify-between">
        <a href="#/" class="flex items-center justify-center gap-2 px-4 text-gray-400 hover:text-violet-500"><!-- border-r border-gray-300 -->
            ThinkSuit
        </a>

        <!--
        <a href="#/" class="flex items-center justify-center gap-2">
            <span href="#/" class="text-lg font-serif font-semibold tracking-wide text-gray-900">ThinkSuit</span>
        </a>
        -->
        <div class="flex items-center justify-center gap-2 text-sm">
            <a
                href={runHref}
                class="border rounded px-2 py-1 {matchAndResolve(location, new RegExp('^/run'), 'bg-gray-100 text-gray-900 border-gray-400', 'bg-gray-50 text-gray-700 border-gray-300 hover:bg-gray-200 hover:text-gray-900 hover:border-gray-500')}"
            >
                Run
            </a>
            <a
                href="#/config"
                class="border rounded px-2 py-1 {matchAndResolve(location, new RegExp('^/config'), 'bg-gray-100 text-gray-900 border-gray-400', 'bg-gray-50 text-gray-700 border-gray-300 hover:bg-gray-200 hover:text-gray-900 hover:border-gray-500')}"
            >
                Config
            </a>

            <div class="h-12 w-12 flex items-center justify-center"> <!-- border-l border-gray-300 -->
                <!-- Dark Mode Toggle -->
                <button
                    onclick={() => ui.darkMode = !ui.darkMode}
                    class="p-1 border rounded border-gray-300 hover:border-gray-300 hover:bg-gray-600 text-gray-400 hover:text-gray-200 transition-colors"
                    title={ui.darkMode ? 'Light mode' : 'Dark mode'}
                >
                    {#if ui.darkMode}
                        <!-- Sun icon -->
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"></path>
                        </svg>
                    {:else}
                        <!-- Moon icon -->
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"></path>
                        </svg>
                    {/if}
                </button>
            </div>
        </div>
    </div>

    <!-- Expanded drawer content -->
    {#if expanded}
        <div class="px-8 py-6">
            <p class="text-gray-600">
                Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.
            </p>
        </div>
    {/if}

    <!-- Toggle Button - NB: temporarily hiding the toggle button until we have use for this section -->
    <!--
    <button
        onclick={() => expanded = !expanded}
        class="absolute -bottom-3 left-1/2 -translate-x-1/2 z-20 w-7 h-7 bg-white border border-gray-300 rounded-full flex items-center justify-center hover:bg-gray-50 transition-colors"
        title={expanded ? 'Collapse navigation' : 'Expand navigation'}
        aria-label={expanded ? 'Collapse navigation' : 'Expand navigation'}
    >
        <svg class="w-3 h-3 text-gray-600 transition-transform {expanded ? 'rotate-180' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path>
        </svg>
    </button>
    -->
</nav>
