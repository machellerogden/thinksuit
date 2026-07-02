<script module>
    import { SvelteURL } from 'svelte/reactivity';

    export class RouteMatcher {
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

            // Check if path ends with /* (wildcard for sub-paths)
            const hasWildcard = this.path.endsWith('/*');
            const pathWithoutWildcard = hasWildcard ? this.path.slice(0, -2) : this.path;

            this._prefixSegmentCount = hasWildcard
                ? pathWithoutWildcard.split('/').filter(Boolean).length
                : 0;

            if (!pathWithoutWildcard.includes(':')) {
                if (hasWildcard) {
                    this.testPath = path => path === pathWithoutWildcard || path.startsWith(pathWithoutWildcard + '/');
                } else {
                    this.testPath = path => path === this.path;
                }
                this.extractParams = () => ({});
                return;
            }

            this.paramNames = [];
            const regexPattern = pathWithoutWildcard
                .split('/')
                .map(segment => {
                    if (segment.startsWith(':')) {
                        this.paramNames.push(segment.slice(1));
                        return '([^/]+)';
                    }
                    return segment;
                })
                .join('\\/');

            // If wildcard, allow anything after the pattern, otherwise require exact match
            const regexSuffix = hasWildcard ? '(/.*)?$' : '$';
            this.regex = new RegExp(`^${regexPattern}${regexSuffix}`);
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

        matchedPrefix(pathname) {
            if (!this._prefixSegmentCount) return null;
            const segments = pathname.split('/').filter(Boolean);
            return '/' + segments.slice(0, this._prefixSegmentCount).join('/');
        }
    }

    class SvelteLocation extends SvelteURL {
        assign(path) {
            // Like window.location.assign, creates a new history entry
            const newHash = this.#buildHashFromPath(path);
            window.location.hash = newHash;
            // Update the SvelteLocation object to reflect the new URL
            this.href = createVirtualURLString();
            // Clear the hash property to prevent $effect from appending it
            this.hash = '';
        }

        replace(path) {
            // Like window.location.replace, no new history entry
            const newHash = this.#buildHashFromPath(path);
            window.history.replaceState(null, '', newHash);
            // Update the SvelteLocation object to reflect the new URL
            this.href = createVirtualURLString();
            // Clear the hash property to prevent $effect from appending it
            this.hash = '';
        }

        #buildHashFromPath(path) {
            return '#' + (path.startsWith('/') ? path : '/' + path);
        }
    }

    export const ROUTER_CTX = {};

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
    import { onMount, setContext } from 'svelte';

    let { routes, onnavigate } = $props();

    let routerContext = $state({ basePath: '', params: {} });
    setContext(ROUTER_CTX, routerContext);

    onMount(() => {
        if (state.component) throw new Error('HashRouter can only be used once in a Svelte app');

        if (!window.location.hash || !window.location.hash.startsWith('#/')) {
            window.location.hash = '#/';
        }
        const handleHashChange = () => {
            // Sync location object with the actual hash when user navigates
            // using back/forward buttons or external changes
            location.href = createVirtualURLString();
        };
        window.addEventListener('hashchange', handleHashChange);
        return () => window.removeEventListener('hashchange', handleHashChange);
    });

    // svelte-ignore state_referenced_locally — routes are static configuration, built once at mount
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

            routerContext.basePath = entry.matcher.matchedPrefix(location.pathname) || '';
            routerContext.params = finalParams;
            onnavigate?.({ path: location.pathname, relativePath: location.pathname, params: finalParams });
            break;
        }

        if (!match) {
            state.component = null;
            state.params = {};
            routerContext.basePath = '';
            routerContext.params = {};
        }
    });

    // Automatic synchronization when location properties are directly assigned
    $effect(() => {
        // Construct what the hash should be based on the current location state
        // Only append location.hash if it contains meaningful content (not empty or just '#')
        const hashFragment = (location.hash && location.hash !== '#') ? location.hash : '';
        const newHash = '#' + location.pathname + location.search + hashFragment;
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
