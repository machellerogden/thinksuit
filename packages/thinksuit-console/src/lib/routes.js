import Welcome from '$lib/components/Welcome.svelte';
import RunInterface from '$lib/components/RunInterface.svelte';
import ConfigViewer from '$lib/components/ConfigViewer.svelte';
import Sandbox from '$lib/components/Sandbox.svelte';
import NotFound from '$lib/components/NotFound.svelte';

export const routes = new Map([
    ['/', Welcome],
    ['/run', RunInterface],
    ['/run/sessions/:id/:view', RunInterface],
    ['/run/sessions/:id/:view/:eventId', RunInterface],
    ['/config', ConfigViewer],
    ['/sandbox', Sandbox],
    ['*', NotFound]
]);
