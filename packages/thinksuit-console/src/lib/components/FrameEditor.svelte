<script>
    import { Textarea, Button } from '$lib/components/ui/index.js';

    let { frame = $bindable({ text: '' }), onSave, onCancel, disabled = false } = $props();
    let editText = $state(frame.text || '');
    let charCount = $derived(editText.length);

    function handleSave() {
        onSave?.({ text: editText });
    }

    function handleCancel() {
        editText = frame.text || '';
        onCancel?.();
    }
</script>

<div class="frame-editor space-y-3">
    <div class="space-y-2">
        <div class="flex items-center justify-between">
            <label for="frame-text" class="text-xs font-medium text-gray-700">
                Frame (Session Context)
            </label>
            <span class="text-xs text-gray-500">{charCount} characters</span>
        </div>
        <Textarea
            id="frame-text"
            bind:value={editText}
            rows={8}
            placeholder="Define context, constraints, identity, rules of engagement..."
            {disabled}
            class="font-mono text-xs"
        />
        <div class="text-[10px] text-gray-500">
            Frame provides persistent context that influences all interactions in this session.
        </div>
    </div>

    <div class="flex justify-end gap-2">
        <Button
            variant="outline"
            size="sm"
            onclick={handleCancel}
            {disabled}
        >
            Cancel
        </Button>
        <Button
            variant="primary"
            size="sm"
            onclick={handleSave}
            {disabled}
        >
            Save Frame
        </Button>
    </div>
</div>
