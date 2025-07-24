<script>
    let {
        variant = 'default',
        padding = 'md',
        class: className = '',
        children
    } = $props();

    const variants = {
        default: 'bg-white border border-gray-200',
        elevated: 'bg-white border border-gray-200 shadow-md',
        ghost: 'bg-gray-50',
        error: 'bg-red-50 border border-red-200',
        warning: 'bg-yellow-50 border border-yellow-200',
        success: 'bg-green-50 border border-green-200',
        info: 'bg-blue-50 border border-blue-200',
        purple: 'bg-purple-50 border border-purple-200',
        indigo: 'bg-indigo-50 border border-indigo-200'
    };

    const paddings = {
        none: '',
        sm: 'p-2',
        md: 'p-3',
        lg: 'p-4',
        xl: 'p-6'
    };

    const variantClass = variants[variant] || variants.default;
    const paddingClass = paddings[padding] || paddings.md;
</script>

<div class="rounded-lg {variantClass} {paddingClass} {className}">
    {@render children()}
</div>