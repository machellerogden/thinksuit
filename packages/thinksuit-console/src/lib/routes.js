import Welcome from '$lib/components/Welcome.svelte';
import RunInterface from '$lib/components/RunInterface.svelte';
import ConfigLayout from '$lib/components/ConfigLayout.svelte';
import Sandbox from '$lib/components/Sandbox.svelte';
import NotFound from '$lib/components/NotFound.svelte';
import { location } from '$lib/components/HashRouter.svelte';

export const routes = new Map([
    ['/', Welcome],
    ['/run', RunInterface],
    ['/run/sessions/:id/:view', RunInterface],
    ['/run/sessions/:id/:view/:eventId', RunInterface],
    [
        {
            path: '/config',
            resolver: () => {
                // Redirect /config to /config/resolved
                location.replace('/config/resolved');
                return undefined;
            }
        },
        ConfigLayout
    ],
    ['/config/:tab', ConfigLayout],
    ['/sandbox', Sandbox],
    ['*', NotFound]
]);
