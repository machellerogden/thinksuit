<script>
    const copyText = (text, done) => async (_evt) => {
        if (window.ClipboardItem) {
            const data = [
                new window.ClipboardItem({
                    'text/plain': new Blob([ text ], { type: 'text/plain' })
                })
            ];
            try {
                await window.navigator.clipboard.write(data);
                console.log('Copied to clipboard successfully!');
            } catch (_err) {
                console.error('Unable to write to clipboard. :-(');
            }
            done(text);
        } else if (document.execCommand) {
            const textarea = document.createElement('textarea');
            textarea.textContent = text;
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
            done(text);
        } else {
            console.error('Unable to write to clipboard. :-(');
        }
    };

    let { text = '', displayText = '' } = $props();
    let copied = $state(false);

    const done = _unused => {
        copied = true;
        setTimeout(() => {
            copied = false;
        }, 2000);
    };

    const copy = text => copyText(text, done);
</script>

{#if copied}
    <span class="text-warning-600">
        copied
    </span>
{:else}
    <button type="button" title="copy to clipboard" class="cursor-pointer hover:text-secondary" onclick={copy(text)}>
        {displayText || text}
    </button>
{/if}
