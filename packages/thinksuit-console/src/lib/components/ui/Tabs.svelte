<script>
    let {
        tabs = [],
        activeTab = '',
        onTabChange = () => {},
        class: className = ''
    } = $props();

    function handleTabClick(tab) {
        if (tab.disabled) return;
        onTabChange(tab);
    }
</script>

<div class="{className}">
    <nav class="flex space-x-8 border-b border-gray-200">
        {#each tabs as tab (tab.value)}
            <button
                onclick={() => handleTabClick(tab)}
                disabled={tab.disabled}
                class="py-2 px-1 border-b-3 transition-colors {
                    activeTab === tab.value
                        ? 'border-blue-500 text-blue-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700'
                } {tab.disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}"
            >
                {tab.label}
            </button>
        {/each}
    </nav>
</div>
