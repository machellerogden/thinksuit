<script module>
    import { SvelteURL } from 'svelte/reactivity';

    class RouteMatcher {
        constructor(routeConfig) {
            if (typeof routeConfig === 'string') {
                routeConfig = { path: routeConfig };
            }

            this.path = routeConfig.path;
            this.guard = routeConfig.guard || (() => true);
            this.resolver = routeConfig.resolver || null;

            if (this.path === '*') {
                this.testPath = () => true;
                this.extractParams = () => ({});
                return;
            }

            if (!this.path.includes(':')) {
                this.testPath = path => path === this.path;
                this.extractParams = () => ({});
                return;
            }

            this.paramNames = [];
            const regexPattern = this.path
                .split('/')
                .map(segment => {
                    if (segment.startsWith(':')) {
                        this.paramNames.push(segment.slice(1));
                        return '([^/]+)';
                    }
                    return segment;
                })
                .join('\\/');

            this.regex = new RegExp(`^${regexPattern}$`);
            this.testPath = path => this.regex.test(path);
            this.extractParams = path => {
                const matches = path.match(this.regex);
                if (!matches) return {};
                return this.paramNames.reduce((params, name, index) => {
                    params[name] = matches[index + 1];
                    return params;
                }, {});
            };
        }

        test(location) {
            return this.testPath(location.pathname);
        }

        extract(location) {
            return this.extractParams(location.pathname);
        }
    }

    class SvelteLocation extends SvelteURL {
        assign(path) {
            // Like window.location.assign, creates a new history entry
            const newHash = this.#buildHashFromPath(path);
            window.location.hash = newHash;
            this.href = createVirtualURLString();
        }

        replace(path) {
            // Like window.location.replace, no new history entry
            const newHash = this.#buildHashFromPath(path);
            window.history.replaceState(null, '', newHash);
            this.href = createVirtualURLString();
        }

        #buildHashFromPath(path) {
            return '#' + (path.startsWith('/') ? path : '/' + path);
        }
    }

    export const location = $state(new SvelteLocation(createVirtualURLString()));
    export const state = $state({ loading: false, component: null, params: {} });

    // static utility method -- requires consumer to pass in location in order to force re-evaluation
    export function matchAndResolve(location, path, ifMatch = 'active', ifNoMatch = 'inactive') {
        if (path instanceof RegExp) {
            if (path.test(location.pathname)) {
                return ifMatch;
            } else {
                return ifNoMatch;
            }
        }
        if (path === location.pathname) {
            return ifMatch;
        } else {
            return ifNoMatch;
        }
    };

    function createVirtualURLString() {
        return window.location.origin + window.location.hash.substring(1);
    }
</script>

<script>
    import { onMount } from 'svelte';

    let { routes, onhashchange } = $props();

    onMount(() => {
        if (state.component) throw new Error('HashRouter can only be used once in a Svelte app');

        if (!window.location.hash || !window.location.hash.startsWith('#/')) {
            window.location.hash = '#/';
        }
        const handleHashChange = () => {
            // Sync location object with the actual hash when user navigates
            // using back/forward buttons or external changes
            location.href = createVirtualURLString();
            onhashchange && onhashchange(location);
        };
        window.addEventListener('hashchange', handleHashChange);
        return () => window.removeEventListener('hashchange', handleHashChange);
    });

    const entries = [...routes].map(([routeConfig, component]) => ({
        matcher: new RouteMatcher(routeConfig),
        component
    }));

    let navigationId = 0; // Increment on each navigation

    $effect(async () => {
        navigationId++;
        const currentNavigationId = navigationId;
        let match = null;

        for (const entry of entries) {
            if (!entry.matcher.test(location)) {
                continue;
            }

            let guardPassed = true;
            const rawParams = entry.matcher.extract(location);

            // Handle guard
            if (entry.matcher.guard) {
                let guardResult = entry.matcher.guard(location, rawParams);
                if (guardResult instanceof Promise) {
                    state.loading = true;
                    try {
                        guardResult = await guardResult;
                    } finally {
                        state.loading = false;
                    }
                    if (currentNavigationId !== navigationId) return;
                }
                guardPassed = guardResult;
            }

            if (!guardPassed) continue;

            // Handle resolver
            let finalParams = rawParams;
            if (entry.matcher.resolver) {
                let resolverResult = entry.matcher.resolver(location, rawParams);
                if (resolverResult instanceof Promise) {
                    state.loading = true;
                    try {
                        resolverResult = await resolverResult;
                    } finally {
                        state.loading = false;
                    }
                    if (currentNavigationId !== navigationId) return;
                }
                if (resolverResult === undefined) return; // Resolver triggered a redirect
                finalParams = resolverResult;
            }

            state.component = entry.component;
            state.params = finalParams;
            match = entry;
            break;
        }

        if (!match) {
            state.component = null;
            state.params = {};
        }
    });

    // Automatic synchronization when location properties are directly assigned
    $effect(() => {
        // Construct what the hash should be based on the current location state
        const newHash = '#' + location.pathname + location.search + location.hash;
        if (window.location.hash !== newHash) {
            // Update the browser location without creating a new history entry
            window.history.replaceState(null, '', newHash);
            // Keep the location object in sync with the browser
            location.href = createVirtualURLString();
        }
    });
</script>

<!--
{#if state.loading}
    <p>Loading...</p>
{/if}
-->

{#if state.component}
    {@const Component = state.component}
    <Component params={state.params} />
{/if}
