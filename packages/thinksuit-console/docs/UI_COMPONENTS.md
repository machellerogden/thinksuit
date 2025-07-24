# ThinkSuit UI Component Library

## Overview

The ThinkSuit UI component library provides a consistent set of reusable components built with Svelte 5 and Tailwind CSS. These components follow a design system that ensures visual consistency across the application.

## Component Directory Structure

```
src/lib/components/ui/
├── Badge.svelte          # Status and data type indicators
├── Button.svelte         # Interactive buttons with variants
├── Card.svelte           # Content containers with variants
├── CodeBlock.svelte      # Code/JSON display with formatting
├── Copyable.svelte       # Text with copy-to-clipboard
├── EmptyState.svelte     # Loading, error, and empty states
├── PanelWithDrawer.svelte # Resizable panel with collapsible drawer
├── Sidebar.svelte        # Collapsible sidebar layout
├── Tabs.svelte           # Tab navigation component
└── index.js             # Barrel export for convenience
```

## Component Usage

### Badge

Display status indicators, data types, or labels.

```svelte
<script>
import { Badge } from '$lib/components/ui';
</script>

<Badge variant="success" size="sm">Active</Badge>
<Badge variant="danger" size="xs">Error</Badge>
<Badge variant="purple">Signal</Badge>
```

**Props:**
- `variant`: 'default' | 'primary' | 'success' | 'warning' | 'danger' | 'purple' | 'indigo' | 'orange'
- `size`: 'xs' | 'sm' | 'md'

### Button

Interactive buttons with consistent styling.

```svelte
<Button variant="primary" onclick={handleClick}>
    Save Changes
</Button>

<Button variant="ghost" size="sm">
    Cancel
</Button>
```

**Props:**
- `variant`: 'default' | 'primary' | 'secondary' | 'success' | 'danger' | 'ghost' | 'link'
- `size`: 'xs' | 'sm' | 'md' | 'lg'
- `disabled`: boolean
- `onclick`: function

### Card

Content containers with background variants.

```svelte
<Card variant="default" padding="lg">
    <h3>Card Title</h3>
    <p>Card content goes here</p>
</Card>

<Card variant="error" padding="sm">
    Error message
</Card>
```

**Props:**
- `variant`: 'default' | 'elevated' | 'ghost' | 'error' | 'warning' | 'success' | 'info' | 'purple' | 'indigo'
- `padding`: 'none' | 'sm' | 'md' | 'lg' | 'xl'
- `class`: Additional CSS classes

### CodeBlock

Display formatted code or JSON data.

```svelte
<CodeBlock 
    code={jsonData} 
    language="json"
    showLineNumbers={true}
    maxHeight="400px"
/>
```

**Props:**
- `code`: string | object (auto-formats JSON objects)
- `language`: 'json' | 'javascript' | etc.
- `showLineNumbers`: boolean
- `maxHeight`: string (CSS height value)

### EmptyState

Consistent empty, loading, and error states.

```svelte
<EmptyState type="loading" />

<EmptyState 
    type="error" 
    message="Failed to load data"
>
    {#snippet children()}
        <Button variant="primary" onclick={retry}>
            Try Again
        </Button>
    {/snippet}
</EmptyState>
```

**Props:**
- `type`: 'empty' | 'loading' | 'error'
- `title`: string (optional, has defaults)
- `message`: string (optional, has defaults)
- `icon`: HTML string (optional, has defaults)

### PanelWithDrawer

Main content panel with resizable, collapsible drawer for supplementary content.

```svelte
<PanelWithDrawer
    orientation="horizontal"  // 'horizontal' | 'vertical'
    position="right"         // 'right' | 'bottom'
    bind:collapsed={isCollapsed}
    bind:size={drawerSize}
    defaultSize={400}
    minSize={200}
    maxSize={600}
    persistKey="my-panel"
>
    {#snippet primary()}
        <!-- Main content -->
        <div>Primary panel content</div>
    {/snippet}
    
    {#snippet secondary()}
        <!-- Drawer content -->
        <div>Supplementary drawer content</div>
    {/snippet}
</PanelWithDrawer>
```

**Props:**
- `orientation`: 'horizontal' | 'vertical' - Layout direction
- `position`: 'right' | 'bottom' | 'left' | 'top' - Where drawer appears
- `collapsed`: boolean (bindable) - Drawer visibility state
- `size`: number (bindable) - Drawer size in pixels
- `defaultSize`: number - Initial drawer size
- `minSize`: number - Minimum drawer size
- `maxSize`: number - Maximum drawer size
- `collapsible`: boolean - Show collapse button (default: true)
- `persistKey`: string - localStorage key for size persistence
- `dividerSize`: number - Divider thickness in pixels (default: 4)
- `onResize`: function(size) - Resize callback

### Sidebar

Collapsible sidebar layout component.

```svelte
<Sidebar 
    bind:collapsed={isCollapsed}
    width="w-80"
    collapsedWidth="w-12"
>
    {#snippet children()}
        <!-- Expanded content -->
        <div>Full sidebar content</div>
    {/snippet}
    
    {#snippet collapsedContent()}
        <!-- Collapsed content -->
        <div>Icon only</div>
    {/snippet}
</Sidebar>
```

**Props:**
- `collapsed`: boolean (bindable)
- `width`: Tailwind width class
- `collapsedWidth`: Tailwind width class
- `onToggle`: function(collapsed: boolean)

### Tabs

Tab navigation component.

```svelte
<script>
const tabs = [
    { label: 'Overview', value: 'overview' },
    { label: 'Details', value: 'details' },
    { label: 'Settings', value: 'settings', disabled: true }
];
</script>

<Tabs 
    {tabs}
    activeTab="overview"
    onTabChange={handleTabChange}
/>
```

**Props:**
- `tabs`: Array of { label, value, disabled? }
- `activeTab`: string (current tab value)
- `onTabChange`: function(tab)

## Design System

### Color Palette

The component library uses semantic color variants:

- **Default**: Gray tones for neutral elements
- **Primary**: Blue for primary actions
- **Success**: Green for positive states
- **Warning**: Yellow for caution states
- **Danger**: Red for errors or destructive actions
- **Purple/Indigo/Orange**: Special purpose indicators

### Spacing

Components use consistent padding scales:
- `sm`: 0.5rem (8px)
- `md`: 0.75rem (12px) 
- `lg`: 1rem (16px)
- `xl`: 1.5rem (24px)

### Typography

Text sizes follow Tailwind's scale:
- `xs`: 0.75rem
- `sm`: 0.875rem
- `base`: 1rem
- `lg`: 1.125rem

## Migration Guide

To migrate existing components to use the UI library:

1. **Replace inline badge styles:**
```svelte
<!-- Before -->
<span class="px-2 py-0.5 text-xs bg-purple-100 text-purple-700 rounded">
    {signal}
</span>

<!-- After -->
<Badge variant="purple" size="xs">{signal}</Badge>
```

2. **Replace card patterns:**
```svelte
<!-- Before -->
<div class="bg-white p-3 rounded-lg border border-gray-200">
    {content}
</div>

<!-- After -->
<Card variant="default" padding="md">
    {content}
</Card>
```

3. **Standardize empty states:**
```svelte
<!-- Before -->
<div class="p-4 text-gray-500 text-center">
    Loading sessions...
</div>

<!-- After -->
<EmptyState type="loading" message="Loading sessions..." />
```

## Best Practices

1. **Use semantic variants**: Choose variants based on meaning (success, error) not just color
2. **Consistent sizing**: Use the same size scale across related components
3. **Accessibility**: Components include proper ARIA attributes and keyboard support
4. **Composition**: Build complex UI by composing simple components
5. **Type safety**: Leverage Svelte 5's props for type checking

## Future Enhancements

Planned additions to the component library:

- **DataTable**: Sortable, filterable data tables
- **Modal**: Dialog and modal overlays
- **Dropdown**: Menu and select components  
- **Toast**: Notification system
- **Form Controls**: Input, textarea, checkbox, radio
- **Tooltip**: Hover information displays
- **Progress**: Loading bars and spinners
- **Avatar**: User/entity representation

## Contributing

When adding new components:

1. Follow the existing prop pattern
2. Include all common variants
3. Use Tailwind utilities, avoid custom CSS
4. Export from `ui/index.js`
5. Document in this guide
6. Consider accessibility from the start