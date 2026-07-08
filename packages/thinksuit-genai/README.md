# thinksuit-genai

Resident generative-model service for ThinkSuit. Every LLM call in the product
goes through this package: the daemon holds provider credentials and warm
models; everything else (engine, broker workers, console, CLI, voice) is a
client that never sees a key.

## Why a resident service

Three problems this factoring solves:

1. **Cold inference.** Providers used to be constructed per call, and the ONNX
   path forked a worker and reloaded the model from disk *per call*. The daemon
   keeps SDK clients and ONNX models warm for its lifetime.
2. **Credential spread.** API keys used to be resolved in the engine CLI, the
   broker worker, and the console process, each with its own copy of the
   resolution table. Now exactly one process touches keys.
3. **No shared boundary.** The agent loop and the console's plan generator each
   grew their own provider plumbing. Both now speak one contract over one
   socket.

## Surfaces

| Export | What it is |
|---|---|
| `thinksuit-genai/client` | Socket client: `call`, `health`, `status`, `providers`, plus `wrapProviderError` (applies the engine's `E_PROVIDER` contract) and `isGenaiDownError` / `GENAI_DOWN_HINT` |
| `thinksuit-genai/env` | The env keyring: `resolveEnv(name)` — process environment first, then `~/.thinksuit/.env` (override with `THINKSUIT_ENV_FILE`) |
| `thinksuit-genai` | In-process library (`callProvider`, `getCapabilities`, `buildProviderConfig`, registry helpers) — for tests and dev tooling; runtime callers use the daemon |
| `thinksuit-genai/service` | Service definition consumed by `thinkctl` |

## Daemon API (HTTP over `~/.thinksuit/genai.sock`)

| Route | Shape |
|---|---|
| `GET /health` | `{ ok, pid }` |
| `GET /status` | `{ ok, pid, uptime, providers: {name: bool}, onnx: {workerPid, ready, loadedModels, queueDepth}, calls: {total, inFlight} }` — never key material |
| `GET /providers` | `{ providers: { name: { configured, credentialEnvs, description } } }` |
| `POST /call` | `{ provider, model, thread, maxTokens, temperature?, tools?, toolSchemas?, responseFormat?, stop? }` → `{ output, usage, model, finishReason, toolCalls?, outputItems?, original: {request, response} }` |

Errors from `/call` return 502 with `{ error, originalError: {message, status,
code, name, type}, request }`; the client rehydrates `originalError` onto the
thrown error so callers can branch on `.originalError.status` across the
socket. Abort: pass an `AbortSignal` to `client.call` — when the client request
dies, the daemon aborts the underlying provider call.

Socket path override: `THINKSUIT_GENAI_SOCK`.

## Environment (`~/.thinksuit/.env`)

The daemon resolves every provider value by name at boot — credentials
(`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `HF_TOKEN`) and plain settings
(`GOOGLE_CLOUD_PROJECT`, `GOOGLE_CLOUD_LOCATION`, `ONNX_DTYPE`) alike — from
its process environment first, then from `~/.thinksuit/.env` (`KEY=value`
dotenv). Read-once semantics: after changing the file, `thinkctl start genai`.

How the file gets populated is the operator's concern. `etc/env-pull.sh` is an
example that materializes it from 1Password via `op inject` — copy and adapt.

## Residency design

- **Cloud providers**: instances (and their SDK clients) are created once per
  provider name and live for the daemon's lifetime (`src/residency.js`).
  providerConfig is fixed at boot; key rotation is a restart.
- **ONNX** (`src/providers/onnx.js`): a supervisor keeps ONE long-lived worker
  process holding models warm (cached by `modelId:dtype`, LRU capped by
  `ONNX_MAX_MODELS`, default 1). Requests are FIFO-serialized (transformers.js
  is not concurrency-safe). The worker never exits after a response — ONNX
  Runtime crashes on teardown, so teardown never happens. Crash isolation is
  preserved: a worker death rejects outstanding requests and a fresh worker is
  forked lazily on the next request (one reload per crash, not per call). Abort
  kills the worker (native generate can't be cancelled). While idle the worker
  is unref'd so it never holds a client process open, and it is killed when its
  parent exits.

## Operations

Managed by `thinkctl` (`up`/`down`/`start`/`stop`/`status`/`logs genai`), with
`restart: on-crash`. One structured `genai.call` log line per call (provider,
model, durationMs, usage, finishReason, error?) lands in
`~/Library/Logs/thinksuit-genai.service.stdout.log`. The console's services
panel can start/stop it.

Foreground instance for development: `npm -w thinksuit-genai run dev`.

## Testing

Unit + integration tests run via the root `vitest`. The daemon↔client tests
spin the real server on a temp socket with an injected fake provider:

```javascript
const handle = await startGenaiServer({
    socketPath: '/tmp/ts-genai-test.sock',   // keep it short (unix path limit)
    providerConfig: { openai: { apiKey: 'fake' } },
    pool: { get: () => fakeProvider, names: () => ['openai'] }
});
```

The ONNX supervisor is tested against a stub worker script via the
`THINKSUIT_ONNX_WORKER` env override (see `tests/fixtures/onnx-stub-worker.js`).
