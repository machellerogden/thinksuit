<script>
    let {
        checked = $bindable(false),
        disabled = false,
        label = '',
        class: className = '',
        id = undefined,
        ...restProps
    } = $props();
</script>

<label class="inline-flex items-center gap-2 text-sm text-gray-700 cursor-pointer {className}">
    <input
        {id}
        type="checkbox"
        bind:checked
        {disabled}
        class="h-4 w-4 text-indigo-600 rounded border-gray-300
            focus:ring-2 focus:ring-indigo-500 focus:ring-offset-0
            transition-colors cursor-pointer
            disabled:opacity-50 disabled:cursor-not-allowed"
        {...restProps}
    />
    {#if label}
        <span class:opacity-50={disabled}>{label}</span>
    {/if}
</label>
