<script>
    import { onMount } from 'svelte';

    let {
        open = $bindable(false),
        align = 'right',
        class: className = '',
        trigger,
        children
    } = $props();

    let dropdownRef = $state(null);

    const alignClasses = {
        left: 'left-0',
        right: 'right-0'
    };

    const alignClass = $derived(alignClasses[align] || alignClasses.right);

    function handleClickOutside(event) {
        if (dropdownRef && !dropdownRef.contains(event.target)) {
            open = false;
        }
    }

    onMount(() => {
        document.addEventListener('click', handleClickOutside);
        return () => {
            document.removeEventListener('click', handleClickOutside);
        };
    });

    function handleTriggerClick(event) {
        event.stopPropagation();
        open = !open;
    }
</script>

<div class="relative inline-block {className}" bind:this={dropdownRef}>
    <!-- Trigger -->
    <div onclick={handleTriggerClick}>
        {@render trigger()}
    </div>

    <!-- Dropdown menu -->
    {#if open}
        <div
            class="absolute z-50 mt-2 w-48 rounded-md shadow-lg bg-white ring-1 ring-black ring-opacity-5 {alignClass}"
        >
            <div class="py-1" role="menu">
                {@render children()}
            </div>
        </div>
    {/if}
</div>
