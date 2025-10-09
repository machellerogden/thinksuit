<script>
    import hljs from 'highlight.js/lib/core';
    import json from 'highlight.js/lib/languages/json';
    import javascript from 'highlight.js/lib/languages/javascript';
    import 'highlight.js/styles/github.css';

    // Register languages
    hljs.registerLanguage('json', json);
    hljs.registerLanguage('javascript', javascript);

    let {
        code = '',
        language = 'json',
        showLineNumbers = false,
        maxHeight = null,
        class: className = ''
    } = $props();

    let highlightedCode = $state('');
    let codeElement = $state(null);

    $effect(() => {
        try {
            const result = hljs.highlight(code, { language });
            highlightedCode = result.value;
        } catch {
            // Fallback to plain text if highlighting fails
            highlightedCode = code;
        }
    });

    function getLines() {
        return code.split('\n');
    }
</script>

<div class="relative rounded overflow-hidden {className}">
    <pre class="bg-gray-50 border border-gray-200 p-3 text-xs overflow-x-auto whitespace-pre-wrap break-words font-mono {maxHeight ? `max-h-[${maxHeight}] overflow-y-auto` : ''}">{#if showLineNumbers}<div class="flex">
                <div class="select-none pr-3 text-gray-400 text-right">
                    {#each getLines() as _, i (i)}
                        <div>{i + 1}</div>
                    {/each}
                </div>
                <code class="flex-1 hljs" bind:this={codeElement}>{@html highlightedCode}</code>
            </div>{:else}<code class="hljs">{@html highlightedCode}</code>{/if}</pre>
</div>
