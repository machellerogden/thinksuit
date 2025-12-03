<script>
    import HashRouter from '$lib/components/HashRouter.svelte';
    import Navigation from '$lib/components/Navigation.svelte';
    import AppDrawer from '$lib/components/AppDrawer.svelte';
    import { routes } from '$lib/routes.js';
    import { ui } from '$lib/stores/ui.svelte.js';

    // Dark mode effect
    $effect(() => {
        window.document.documentElement.style.backgroundColor = 'white';
        window.document.documentElement.style.filter = ui.darkMode
            ? 'invert(1) hue-rotate(180deg)'
            : '';
    });

    // Dynamic padding based on drawer position and size
    let mainPadding = $derived.by(() => {
        const collapsedSize = 48;
        const isHorizontal = ui.terminalPosition === 'left' || ui.terminalPosition === 'right';
        const currentSize = isHorizontal ? ui.terminalSizeHorizontal : ui.terminalSizeVertical;
        const actualSize = ui.terminalOpen ? currentSize : collapsedSize;
        const size = actualSize + 'px';

        if (ui.terminalPosition === 'top') return `padding-top: ${size};`;
        if (ui.terminalPosition === 'bottom') return `padding-bottom: ${size};`;
        if (ui.terminalPosition === 'left') return `padding-left: ${size};`;
        if (ui.terminalPosition === 'right') return `padding-right: ${size};`;
        return '';
    });
</script>

<svelte:head>
    <title>Thinksuit Console</title>
</svelte:head>

<div class="h-screen flex flex-col" style={mainPadding}>
    <Navigation />
    <div class="flex-1 overflow-hidden">
        <HashRouter {routes} />
    </div>
</div>

<AppDrawer />
