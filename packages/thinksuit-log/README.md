# thinksuit-log

Standardized service logging for ThinkSuit: the JSONL contract and the pino
logger that emits it. Emit side only — what readers do with the lines (jq,
pino-pretty, a UI) is the reader's business. Scope is logging, nothing else —
the name is the charter. A leaf package (depends on nothing in the repo) so
every service — including other leaves like `thinksuit-genai` — can depend
on it.

## The service logging contract

Every resident ThinkSuit service logs JSONL to stdout via
`createServiceLogger(service)` (pino under the hood). launchd routes stdout to
`~/Library/Logs/<label>.stdout.log`, so the whole log directory is one
uniformly parseable corpus.

Every line carries:

| Field | Meaning |
|---|---|
| `time` | ISO-8601 timestamp |
| `level` | pino numeric level (30=info, 40=warn, 50=error, ...) |
| `service` | short service id: `broker`, `genai`, `voice`, `tty` |
| `pid` | process id |
| `msg` | human-readable line |
| `event` | *optional* dotted identifier for machine-readable events (e.g. `genai.call`, `voice.wake`) — grep/jq on this, never on `msg` |
| anything else | structured payload for the line |

Credential-shaped fields (`apiKey`, `token`, `secret`, ...) are redacted
defensively at this boundary. Level comes from `LOG_LEVEL` (default `info`).

```javascript
import { createServiceLogger } from 'thinksuit-log';

const log = createServiceLogger('genai');
log.info({ event: 'genai.call', provider, model, durationMs }, 'model call');
```

## Reading logs

This package takes no position on rendering. `thinkctl logs <svc> --pretty`
pipes through pino-pretty (its concern, not this package's); the same pipe
works by hand:

```bash
tail -f ~/Library/Logs/thinksuit-voice.service.stdout.log | npx pino-pretty
```

Query the raw JSONL directly:

```bash
# -R + fromjson? skips any non-JSONL lines (framework output, old history)
jq -R 'fromjson? | select(.event == "genai.call") | {model, durationMs}' \
    ~/Library/Logs/thinksuit-genai.service.stdout.log
```

## Exceptions to the contract

Case-by-case, currently: `thinkctl` and the voice/wakeword CLIs (interactive
tools, not services), the console's framework (vite/SvelteKit) output, and
browser-side components.
