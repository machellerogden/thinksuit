<script>
    import { getContext, setContext } from 'svelte';
    import { ROUTER_CTX, RouteMatcher, location } from './HashRouter.svelte';

    let { routes, onnavigate } = $props();

    const parentRouter = getContext(ROUTER_CTX);
    if (!parentRouter) {
        throw new Error('ChildHashRouter must be used within a parent router context');
    }

    // Set context for potential children (same key, shadows parent)
    let routerContext = $state({ basePath: '', params: {} });
    setContext(ROUTER_CTX, routerContext);

    // svelte-ignore state_referenced_locally — routes are static configuration, built once at mount
    const entries = [...routes].map(([path, component]) => {
        const routeConfig = typeof path === 'string' ? { path } : path;
        return {
            matcher: new RouteMatcher(routeConfig),
            component
        };
    });

    let state = $state({ loading: false, component: null, params: {} });
    let navigationId = 0;

    $effect(async () => {
        navigationId++;
        const currentNavigationId = navigationId;
        let match = null;

        // Strip parent's basePath to get relative path
        const relativePath = location.pathname.startsWith(parentRouter.basePath)
            ? location.pathname.slice(parentRouter.basePath.length) || '/'
            : null;

        if (!relativePath) {
            state.component = null;
            state.params = {};
            return;
        }

        const relativeLocation = { pathname: relativePath };

        for (const entry of entries) {
            if (!entry.matcher.test(relativeLocation)) {
                continue;
            }

            let guardPassed = true;
            const rawParams = { ...parentRouter.params, ...entry.matcher.extract(relativeLocation) };

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
                if (resolverResult === undefined) return;
                finalParams = resolverResult;
            }

            state.component = entry.component;
            state.params = finalParams;
            match = entry;

            // Update own context for potential children
            const matchedPrefix = entry.matcher.matchedPrefix(relativePath);
            routerContext.basePath = matchedPrefix
                ? parentRouter.basePath + matchedPrefix
                : parentRouter.basePath;
            routerContext.params = finalParams;

            onnavigate?.({ path: location.pathname, relativePath, params: finalParams });
            break;
        }

        if (!match) {
            state.component = null;
            state.params = {};
        }
    });
</script>

{#if state.component}
    {@const Component = state.component}
    <Component params={state.params} />
{/if}
