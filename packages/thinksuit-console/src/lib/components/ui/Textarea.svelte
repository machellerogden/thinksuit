<script>
    let {
        value = $bindable(''),
        placeholder = '',
        disabled = false,
        rows = 3,
        size = 'md',
        class: className = '',
        id = undefined,
        onkeydown = undefined,
        ...restProps
    } = $props();

    let textareaElement = $state();

    const sizes = {
        sm: 'px-2 py-1 text-sm',
        md: 'px-3 py-2 text-base',
        lg: 'px-4 py-3 text-lg'
    };

    const sizeClass = $derived(sizes[size] || sizes.md);
    const disabledClass = $derived(disabled ? 'bg-gray-50 cursor-not-allowed opacity-60' : 'bg-white');

    // Expose focus method for parent components
    export function focus() {
        if (textareaElement) {
            textareaElement.focus();
        }
    }
</script>

<textarea
    bind:this={textareaElement}
    {id}
    {placeholder}
    {disabled}
    {rows}
    {onkeydown}
    bind:value
    class="w-full rounded-md border border-gray-300 transition-colors resize-none
        focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent
        {sizeClass} {disabledClass} {className}"
    {...restProps}
></textarea>
