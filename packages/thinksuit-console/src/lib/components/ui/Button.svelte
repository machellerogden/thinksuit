<script>
    let {
        variant = 'default',
        size = 'md',
        disabled = false,
        active = false,
        href = null,
        onclick = () => {},
        class: className = '',
        children
    } = $props();

    const variants = {
        default: 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50',
        primary: 'bg-indigo-600 text-white hover:bg-indigo-700',
        secondary: 'bg-gray-600 text-white hover:bg-gray-700',
        success: 'bg-green-600 text-white hover:bg-green-700',
        danger: 'bg-red-600 text-white hover:bg-red-700',
        reject: 'border border-red-300 bg-red-100 text-gray-900 hover:bg-red-300 hover:text-gray-900 hover:border-red-600',
        approve: 'border border-emerald-300 bg-emerald-100 text-gray-900 hover:bg-emerald-300 hover:text-gray-900 hover:border-emerald-600',
        ghost: 'text-gray-700 hover:bg-gray-100',
        link: 'text-indigo-600 hover:text-indigo-800 underline-offset-2 hover:underline',
        subtle: 'border border-indigo-200 bg-indigo-50 hover:border-indigo-400 hover:bg-indigo-100 text-gray-700 !font-normal hover:text-indigo-900'
    };

    const activeVariants = {
        subtle: 'border-indigo-400 bg-indigo-100 text-indigo-900'
    };

    const sizes = {
        xs: 'px-2 py-1 text-xs',
        sm: 'px-3 py-1.5 text-sm',
        md: 'px-4 py-2 text-base',
        lg: 'px-6 py-3 text-lg',
        custom: ''
    };

    const variantClass = $derived(variants[variant] || variants.default);
    const activeClass = $derived(active && activeVariants[variant] ? activeVariants[variant] : '');
    const sizeClass = $derived(sizes[size] || sizes.md);
    const disabledClass = $derived(disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer');
</script>

{#if href}
    <a
        {href}
        class="inline-flex items-center justify-center rounded font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-500 {variantClass} {activeClass} {sizeClass} {disabledClass} {className}"
    >
        {@render children()}
    </a>
{:else}
    <button
        {onclick}
        {disabled}
        class="inline-flex items-center justify-center rounded font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-500 {variantClass} {activeClass} {sizeClass} {disabledClass} {className}"
    >
        {@render children()}
    </button>
{/if}
