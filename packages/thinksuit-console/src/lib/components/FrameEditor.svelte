<script>
    import { Textarea } from '$lib/components/ui/index.js';

    let { frame = $bindable({ text: '' }), disabled = false } = $props();
    let charCount = $derived(frame.text?.length || 0);
</script>

<div class="frame-editor space-y-2">
    <div class="flex items-center justify-between">
        <label for="frame-text" class="text-xs font-medium text-gray-700">
            Frame
        </label>
        <span class="text-xs text-gray-500">{charCount} chars</span>
    </div>
    <Textarea
        id="frame-text"
        bind:value={frame.text}
        rows={6}
        placeholder="Define context, constraints, identity..."
        {disabled}
        class="font-mono text-xs"
    />
    <div class="text-[10px] text-gray-500">
        Persistent context for this session
    </div>
</div>
