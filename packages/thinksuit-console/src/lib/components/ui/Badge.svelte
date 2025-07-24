<script>
    let {
        variant = 'default',
        size = 'sm',
        bordered = false,
        class: className = '',
        children
    } = $props();

    const variants = {
        default: 'bg-gray-100 text-gray-700',
        primary: 'bg-blue-100 text-blue-700',
        success: 'bg-green-100 text-green-700',
        warning: 'bg-yellow-100 text-yellow-700',
        danger: 'bg-red-100 text-red-700',
        purple: 'bg-purple-100 text-purple-700',
        indigo: 'bg-indigo-100 text-indigo-700',
        orange: 'bg-orange-100 text-orange-700'
    };

    const borderColors = {
        default: 'border-gray-300',
        primary: 'border-blue-300',
        success: 'border-green-300',
        warning: 'border-amber-300',
        danger: 'border-red-300',
        purple: 'border-purple-300',
        indigo: 'border-indigo-300',
        orange: 'border-orange-300'
    };

    const sizes = {
        xs: 'px-2 py-0.5 text-xs',
        sm: 'px-2 py-1 text-sm',
        md: 'px-3 py-1.5 text-base'
    };

    const variantClass = variants[variant] || variants.default;
    const sizeClass = sizes[size] || sizes.sm;
    const borderClass = bordered ? `border ${borderColors[variant] || borderColors.default}` : '';
</script>

<span class="inline-flex items-center gap-1 rounded font-medium {variantClass} {sizeClass} {borderClass} {className}">
    {@render children()}
</span>
