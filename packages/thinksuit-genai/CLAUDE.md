# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with
the ThinkSuit GenAI package.

## Package Overview

**ThinkSuit GenAI** - The resident generative-model service. Owns the provider
library (openai / anthropic / google / hugging-face / onnx), the env keyring
(`~/.thinksuit/.env`), and the daemon that holds credentials and warm models.
Every LLM call in the product goes through here.

**Status**: v1 functional. Daemon + client + residency verified end-to-end;
all runtime callers (engine adapter, broker worker, console plan generator)
require the service.

## For Development Details

See **../../CONTRIBUTING.md** for repo-wide commands, architecture, and style.
See **README.md** here for the daemon API, environment, and residency design.

## Package-Specific Notes

### Core design tenets

- **This is a leaf package.** It depends on nothing else in the repo; `thinksuit`
  depends on it (and re-exports `resolveEnv`). Never import from `thinksuit`
  here — that would recreate the cycle the secrets move broke.
- **Credentials live here and nowhere else.** `buildProviderConfig()`
  (`src/config.js`) is the single provider-configuration table for the whole
  product — every value via `resolveEnv` (process env first, then
  `~/.thinksuit/.env`). Do not add per-process copies elsewhere.
- **Providers are engine-agnostic.** Signature `callLLM(ctx = {abortSignal},
  params)`; no loggers, no engine constants. All five normalize `original` to
  `{request, response}` and attach `.request` to thrown errors so failed calls
  stay traceable. Trace emission is the *caller's* job (the engine adapter
  re-emits `provider.api.*` from `original`).
- **`core.js` is the single normalization point** (thread cleaning + maxTokens
  clamp + dispatch). The daemon path (`callWithProvider`, warm instances) and
  the in-process path (`callProvider`) must stay behaviorally identical.
- **Never key material on the wire.** `/status` and `/providers` return
  presence booleans + metadata only; error bodies serialize a fact subset
  (`message/status/code/name/type`), never whole SDK errors (they can carry
  request headers).

### File map

- `src/server.js` — daemon: socket HTTP server, request boundary, per-call
  abort (res 'close' → AbortController), structured `genai.call` log lines.
- `src/client.js` — socket client; rehydrates `originalError` facts;
  `E_GENAI_DOWN` hint on ECONNREFUSED/ENOENT; `wrapProviderError` applies the
  `E_PROVIDER:` contract (down errors pass through unwrapped).
- `src/residency.js` — provider-instance pool (per daemon lifetime; rotation =
  restart).
- `src/core.js` — `callProvider` / `callWithProvider` / `cleanThreadForProvider`.
- `src/config.js` — `buildProviderConfig()` (the credential table).
- `src/env.js` — `resolveEnv` / `clearEnvCache` (the env keyring).
- `src/providers/` — provider modules + registry (`index.js`: factories,
  `requiresConfig`, `credentialEnvs`, descriptions).
- `src/providers/onnx.js` — supervisor of the resident ONNX worker;
  `src/providers/onnx-worker.js` — the worker (model cache, never exits after
  a response). See README "Residency design" for the invariants.
- `bin/service.mjs` + `service.js` — daemon entry + thinkctl definition
  (`restart: on-crash`).
- `etc/env-pull.sh` — example 1Password populator for `~/.thinksuit/.env`.

### Gotchas

- **ONNX worker lifecycle invariants**: never send a second request while one
  is in flight (FIFO queue enforces this); never tear the worker down after a
  response (ONNX Runtime crashes on teardown — the supervisor kills it only on
  abort, crash, or parent exit); keep the idle unref/ref discipline or client
  processes will hang open (or exit mid-request).
- **Unix socket paths are length-limited** (~104 bytes on macOS). Tests must
  use short socket paths (`/tmp/...`, or `mkdtempSync(tmpdir())`).
- **Engine tests mock `engine/providers/io.js` by path** and the adapter test
  mocks `thinksuit-genai/client`. If you change the client's export names,
  update the engine adapter and its test together.
- **`credentialEnvs` is an array** — providers can read several env vars
  (google: project + location). Door messages join them; don't collapse to a
  scalar.

### Testing (coding agents)

```bash
# All package tests (root vitest picks them up)
npx vitest run --config vitest.config.js packages/thinksuit-genai

# Foreground daemon on an isolated socket + probe
SOCK=/tmp/ts-genai-dev.sock
THINKSUIT_GENAI_SOCK="$SOCK" node packages/thinksuit-genai/bin/service.mjs &
curl -s --unix-socket "$SOCK" http://localhost/health
curl -s --unix-socket "$SOCK" http://localhost/providers
```

Always use an isolated `THINKSUIT_GENAI_SOCK` for tests; never assume the
default socket is free — the managed service usually owns it.
