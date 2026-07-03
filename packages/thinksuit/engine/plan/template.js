/**
 * Plan input templating.
 *
 * A plan.v1 task node's `input` is a freeform template string expanded against the
 * execution context bag. Tokens are `$<key>` where key names a bag entry:
 *   - `$input`          — the turn's original input
 *   - `$last_response`  — the immediately-prior node's output
 *   - `$<id>_response`  — a specific earlier node's output (by its authored `id`)
 * Unknown tokens expand to '' — a template references what it expects to exist; an
 * absent value is empty, not a literal `$token`.
 */

// Bag keys are conventional identifiers: word chars only. `$foo`, `$last_response`,
// `$step1_response`. `$` not followed by an identifier is left verbatim.
const TOKEN = /\$([A-Za-z_][A-Za-z0-9_]*)/g;

/**
 * Expand `$<key>` tokens in a template against the context bag.
 * @param {string} template - freeform string with `$key` tokens
 * @param {Object} bag - context bag ({ input, last_response, <id>_response, … })
 * @returns {string}
 */
export function expandTemplate(template, bag = {}) {
    if (typeof template !== 'string') return '';
    return template.replace(TOKEN, (_match, key) => {
        const value = bag[key];
        return value == null ? '' : String(value);
    });
}
