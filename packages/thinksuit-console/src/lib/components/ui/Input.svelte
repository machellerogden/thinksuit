<script>
    let {
        type = 'text',
        value = $bindable(''),
        placeholder = '',
        disabled = false,
        size = 'md',
        class: className = '',
        id = undefined,
        ...restProps
    } = $props();

    const sizes = {
        sm: 'px-2 py-1 text-sm',
        md: 'px-3 py-2 text-base',
        lg: 'px-4 py-3 text-lg'
    };

    const sizeClass = $derived(sizes[size] || sizes.md);
    const disabledClass = $derived(disabled ? 'bg-gray-50 cursor-not-allowed opacity-60' : 'bg-white');
</script>

<input
    {id}
    {type}
    {placeholder}
    {disabled}
    bind:value
    class="w-full rounded-md border border-gray-300 transition-colors
        focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent
        {sizeClass} {disabledClass} {className}"
    {...restProps}
/>
