<script>
    let {
        type = 'empty',
        title = '',
        message = '',
        icon = null,
        children
    } = $props();

    const defaults = {
        empty: {
            title: 'No data found',
            message: 'There is no data to display',
            icon: `<svg class="w-12 h-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"></path>
            </svg>`
        },
        loading: {
            title: 'Loading...',
            message: 'Please wait while we fetch the data',
            icon: `<svg class="w-12 h-12 text-gray-400 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>`
        },
        error: {
            title: 'Error occurred',
            message: 'Something went wrong',
            icon: `<svg class="w-12 h-12 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
            </svg>`
        }
    };

    const config = defaults[type] || defaults.empty;
    const displayTitle = title || config.title;
    const displayMessage = message || config.message;
    const displayIcon = icon || config.icon;
</script>

<div class="flex flex-col items-center justify-center py-12 px-4 text-center">
    {#if displayIcon}
        {@html displayIcon}
    {/if}
    <h3 class="mt-4 text-lg font-medium text-gray-900">{displayTitle}</h3>
    <p class="mt-2 text-sm text-gray-500">{displayMessage}</p>
    {#if children}
        <div class="mt-6">
            {@render children()}
        </div>
    {/if}
</div>