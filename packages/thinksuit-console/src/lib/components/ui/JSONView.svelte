<script>
    import CodeView from './CodeView.svelte';

    let {
        data,
        showLineNumbers = false,
        maxHeight = null,
        class: className = ''
    } = $props();

    const code = $derived(JSON.stringify(data, null, 4));
</script>

<CodeView {code} language="json" {showLineNumbers} {maxHeight} class={className} />
