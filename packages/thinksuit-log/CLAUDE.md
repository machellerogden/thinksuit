# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with
the ThinkSuit Log package.

## Package Overview

**ThinkSuit Log** - The standardized service logging contract: the pino JSONL
preset every resident service emits through (`createServiceLogger`). Emit side
only — rendering belongs to readers (`thinkctl logs --pretty` pipes through
pino-pretty; that dependency is thinkctl's, not this package's).

## Scope — the name is the charter

- **This package is logging, nothing else.** The narrow name was a deliberate
  decision (over a broad `common`/`utils` package) so that scope is enforced
  structurally, not by prose discipline. If something isn't logging, it does
  not live here — other shared idioms get their own deliberately-named home
  if and when they earn one.
- **This is a leaf.** It must depend on nothing else in the repo — that's
  what lets other leaves (thinksuit-genai) use it. Never import from
  `thinksuit` here.

## The contract

See README.md for the field table. Package-specific rules:

- `event` is the machine-readable surface — dotted, namespaced by service
  (`genai.call`, `voice.wake`, `broker.listening`). Consumers grep/jq on
  `event`, never on `msg`. Changing an event name is a breaking change to
  anyone's saved jq one-liners; add, don't rename, when possible.
- `msg` is for humans and may change freely.
- The redaction table here is a defensive backstop, not permission to log
  credentials — services must still never put key material in a log call.
- New service code logs through `createServiceLogger`, never bare
  `console.*`. Exceptions are case-by-case and currently: interactive CLIs
  (thinkctl, voice ctl), console framework output, browser components.

## Testing

`tests/logger.test.js` covers the emit shape, redaction, and level filtering.
Run via the root vitest.
