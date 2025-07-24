<script>
    import { PanelWithDrawer, Card, Button, Badge } from '$lib/components/ui';

    let horizontalCollapsed = $state(false);
    let verticalCollapsed = $state(false);
    let rightSize = $state(400);
    let bottomSize = $state(300);
</script>

<div class="h-full p-6 bg-gray-50">
    <h1 class="text-2xl font-bold mb-6">PanelWithDrawer Demo</h1>

    <!-- Horizontal Split (Right Panel) -->
    <div class="mb-8">
        <h2 class="text-lg font-semibold mb-3">Horizontal Split - Right Panel</h2>
        <div class="h-96 border border-gray-300 rounded-lg overflow-hidden">
            <PanelWithDrawer
                orientation="horizontal"
                position="right"
                bind:collapsed={horizontalCollapsed}
                bind:size={rightSize}
                defaultSize={400}
                minSize={200}
                maxSize={600}
                persistKey="demo-horizontal"
            >
                {#snippet primary()}
                    <div class="p-4">
                        <Card variant="default" padding="lg">
                            <h3 class="font-medium mb-2">Primary Content</h3>
                            <p class="text-sm text-gray-600 mb-4">
                                This is the main content area. The panel to the right can be resized by dragging the divider.
                            </p>
                            <div class="space-y-2">
                                <div>Panel size: <Badge variant="primary">{rightSize}px</Badge></div>
                                <div>Status: <Badge variant={horizontalCollapsed ? 'warning' : 'success'}>
                                    {horizontalCollapsed ? 'Collapsed' : 'Expanded'}
                                </Badge></div>
                                <Button
                                    variant="primary"
                                    size="sm"
                                    onclick={() => horizontalCollapsed = !horizontalCollapsed}
                                >
                                    {horizontalCollapsed ? 'Show Panel' : 'Hide Panel'}
                                </Button>
                            </div>
                        </Card>
                    </div>
                {/snippet}

                {#snippet secondary()}
                    <div class="p-4 bg-blue-50 h-full">
                        <Card variant="info" padding="md">
                            <h3 class="font-medium mb-2">Secondary Panel</h3>
                            <p class="text-sm text-gray-600">
                                This panel appears on the right. Drag the divider to resize, or click the collapse button.
                            </p>
                            <div class="mt-4 space-y-2">
                                <div class="text-xs text-gray-500">Width: {rightSize}px</div>
                                <div class="text-xs text-gray-500">Min: 200px</div>
                                <div class="text-xs text-gray-500">Max: 600px</div>
                            </div>
                        </Card>
                    </div>
                {/snippet}
            </PanelWithDrawer>
        </div>
    </div>

    <!-- Vertical Split (Bottom Panel) -->
    <div>
        <h2 class="text-lg font-semibold mb-3">Vertical Split - Bottom Panel</h2>
        <div class="h-96 border border-gray-300 rounded-lg overflow-hidden">
            <PanelWithDrawer
                orientation="vertical"
                position="bottom"
                bind:collapsed={verticalCollapsed}
                bind:size={bottomSize}
                defaultSize={300}
                minSize={150}
                maxSize={500}
                persistKey="demo-vertical"
            >
                {#snippet primary()}
                    <div class="p-4">
                        <Card variant="default" padding="lg">
                            <h3 class="font-medium mb-2">Primary Content</h3>
                            <p class="text-sm text-gray-600 mb-4">
                                This is the main content area. The panel below can be resized by dragging the divider.
                            </p>
                            <div class="space-y-2">
                                <div>Panel size: <Badge variant="primary">{bottomSize}px</Badge></div>
                                <div>Status: <Badge variant={verticalCollapsed ? 'warning' : 'success'}>
                                    {verticalCollapsed ? 'Collapsed' : 'Expanded'}
                                </Badge></div>
                                <Button
                                    variant="primary"
                                    size="sm"
                                    onclick={() => verticalCollapsed = !verticalCollapsed}
                                >
                                    {verticalCollapsed ? 'Show Panel' : 'Hide Panel'}
                                </Button>
                            </div>
                        </Card>
                    </div>
                {/snippet}

                {#snippet secondary()}
                    <div class="p-4 bg-green-50 h-full">
                        <Card variant="success" padding="md">
                            <h3 class="font-medium mb-2">Secondary Panel</h3>
                            <p class="text-sm text-gray-600">
                                This panel appears at the bottom. Drag the divider to resize, or click the collapse button.
                            </p>
                            <div class="mt-4 space-y-2">
                                <div class="text-xs text-gray-500">Height: {bottomSize}px</div>
                                <div class="text-xs text-gray-500">Min: 150px</div>
                                <div class="text-xs text-gray-500">Max: 500px</div>
                            </div>
                        </Card>
                    </div>
                {/snippet}
            </PanelWithDrawer>
        </div>
    </div>
</div>
