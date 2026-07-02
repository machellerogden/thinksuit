# Designations (working design note)

**Status:** scaffolding, not a spec. This captures alignment reached in
conversation so it survives across sessions. It records settled decisions, what
remains open, and what we have explicitly deferred.

## Origin / presenting friction

The operator reported: "I do a voice chat and no longer see it listed in the
sessions sidebar." Investigation showed this is a **presentation mismatch, not a
defect**:

- The session list sorts by the timestamp embedded in the session *filename* —
  i.e. **creation time** (`engine/sessions/index.js:92-96`).
- The voice daemon was changed to seed and reuse a single durable session
  (`mainSessionId`) across restarts (`thinksuit-voice/src/daemon.js:97`,
  set-once at `:142-151`; resumed via `sessionForAction`, `src/session.js:20-22`
  and `daemon.js:193`).
- So every `converse` appends to one session that keeps its original creation
  timestamp, and it stays pinned low in a creation-sorted list — buried, not
  missing.

`mainSessionId` was added hastily; it lives in the user-authored config
(`~/.thinksuit.json`) and was bolted onto the schema (`config.v1.json`, commit
`ac9f03c`). That placement is the deeper smell this work corrects.

## The concept: designations

A **designation** is a named pointer to a session: a flat map

```
name -> sessionId
```

cardinality-one (each name resolves to exactly one session). "main" was
considered and rejected in favor of "home"; the general mechanism is
*designations*, of which any specific name (e.g. `voice`, later `home`) is an
instance. Because each name maps to exactly one session, the storage needs no
schema — it is just a map.

Cardinality is **directional**: `name -> session` is one-to-one, but a single
session may be the target of *multiple* designations (`session -> names` is
one-to-many) — e.g. one thread could be both `voice` and `home` at once. This is
why display can't hang a single chip on a session row; designations are listed
independently, not as a per-session attribute.

## Settled decisions

1. The presenting issue is a presentation mismatch, not a defect.
2. The concept is **designations** — a flat `name -> sessionId` map,
   cardinality-one.
3. The **kernel (`thinksuit` package)** owns the *mechanism*: a dumb,
   write-agnostic registrar, exported from the package the way `listSessions`
   already is. It stores strings and knows nothing of what any name *means*.
4. **Meaning lives at the surfaces**, not in the kernel. Each name's semantics
   and write-policy belong to whoever cares about it (voice owns `voice`).
5. Storage is a new file **`~/.thinksuit/state.json`** — kernel-authored, not
   hand-edited, distinct from the user-authored `~/.thinksuit.json`.
   `designations` is its first key.
   - Rationale: the kernel had no home for its *own maintained state*.
     `~/.thinksuit.json` is user-authored, layered, and schema-validated by
     `buildConfig` (`engine/config.js:197`). Fast-moving routing state (the
     `voice` pointer moves every turn) does not belong in the document the
     human edits by hand.
   - Naming: **config = authored/desired, state = observed/current**. Prior art:
     XDG `STATE_HOME` vs `CONFIG_HOME`, Terraform `tfstate`, Chrome "Local
     State", git `refs`/`HEAD` (pointers kept out of config). `settings` was
     rejected (conventionally means *user* prefs; collides with
     `~/.thinksuit.json` and `console/settings.json`); `system` was rejected as
     vague.
   - Precedent for a small owned store already exists: `console/settings.json`,
     `secrets.env`, and the wakeword store's "two homes by design"
     (`thinksuit-voice/src/wakewords/store.js:1-10`).
6. **`mainSessionId` retires** from both `~/.thinksuit.json` and
   `userConfig.v1.json` (formerly `config.v1.json`), replaced by `designations` in
   `state.json`.
7. **Voice semantics:**
   - `converse` -> resume the voice designation.
   - `new` -> mint a fresh session *and* repoint the voice designation to it.
8. **Voice drives a designation by name, defaulting to `voice`** — not a
   kernel-reserved string. The kernel stays dumb. The "reserved designation"
   idea is **retired** for this pass (it only existed to protect a namespace we
   no longer need to protect, once `home` is deferred and voice's name is its
   own config value). The name voice follows is a **user config value** in
   `~/.thinksuit.json` (default `voice`), set by editing config — *not*
   runtime-switchable, and voice actions remain `converse`/`new` only.
9. **"home" is deferred** — a user bookmark with *no* system privilege
   (seat-as-persona pruned). Not formalized this pass; treated as a free name
   if/when it appears.
10. **Scope of this pass:** designations mechanism + voice rewire + the
    `lastUpdate` sort. The sort is orthogonal to the mechanism (independent
    change) but cheap, and it is what resurfaces an *ongoing* converse thread,
    so it is included. Console already carries `lastUpdate` (mapped from
    `lastEvent.time`, `thinksuit-console/.../api/sessions/+server.js:24`); it is
    a sort-key choice, doable client-side in `SessionList.svelte`.
11. **No migration.** On retiring `mainSessionId`, its current value is dropped.
    The first converse/new after the change establishes `designations.voice`
    fresh.
12. **The console is a first-class writer of the map.** The operator can
    designate any thread with any designation name (existing or new) from the
    console UI. This is the bulk of the pass — mostly interface work.
13. **`state.json` holds only the designations map** — no selection-state
    layer. "Which designation voice follows" lives in config, not state.
14. **Display: a pinned "Designations" section** above the scrolling session
    list (chosen over inline per-row chips and over both). Each designation is
    its own line, linking to its session, and stays visible regardless of the
    recency sort. Per-row chips were rejected because a session can carry
    multiple designations (`session -> names` is one-to-many).
15. **Assignment gesture (assign a name to a thread)** lives in two places:
    the per-row `⋮` menu ("Designate as…", alongside the existing "Delete
    Session"), and a control near the **top of the open session** (workbench).
    Both are the same op from the thread side. *Repointing* an existing
    designation to a different thread (the op from the designation side) is a
    follow-on, hosted on the pinned-section entry — not the first cut.

## Single writer (refinement)

The kernel still *owns* the mechanism and exports
`getDesignation`/`setDesignation`/`listDesignations`, but **all writes to
`state.json` now go through the broker** — the one resident process — via
`POST /designations` (`thinksuit-broker` client `setDesignation`). This closes a
multi-writer race: previously the console endpoint and the voice daemon each
called `setDesignation` directly, so two processes mutated the same file.

- **Writes:** console POST endpoint and voice daemon route through the broker
  client. The broker calls the kernel's `setDesignation` (single writer). Writes
  are atomic (temp file + `renameSync`).
- **Reads stay direct.** `listDesignations`/`getDesignation` read `state.json`
  straight from disk (console GET, voice boot-time seed). An atomic rename means
  a reader never sees a torn write, and reads don't depend on the broker being up.
- A write needs the broker running — both surfaces already require it to run
  turns, so this adds no new practical dependency.

## Open

- None pending.

## Deferred (explicitly parked)

- `home` formalization and any sidebar real-estate for it. (Ad hoc use is still
  reachable: the generic console affordance lets the operator designate a thread
  as `home` as a free name; we just don't build special treatment for it.)
- Quick-access links / "pills" — simple navigation links from a designation to
  its session (a read-only view of the map). Notably a `voice` quick-link is an
  independent partial answer to the original "can't find my voice thread"
  friction: one click regardless of sort.
- Changing which designation *name* voice follows at runtime — it is a config
  edit, not a live UI control — and any voice-driven switching. (Repointing a
  designation to a different thread *via the console* is in scope; that is the
  console-writer affordance, not voice switching.)

## Component map (how each package relates)

- **thinksuit (kernel):** owns the designations mechanism + `state.json`;
  exposes `getDesignation` / `setDesignation` / `listDesignations`. Sessions,
  session-router, config read/patch (`readUserConfig`/`patchUserConfig`,
  `engine/config.js:464-479`), and the secrets keyring already live here.
- **thinksuit-voice:** owns the `voice` designation's meaning; demotes from
  *owner* of `mainSessionId` to *consumer* of a shared pointer. Reads
  `designations["voice"]` directly at boot; *writes* it through the broker on
  converse/new.
- **thinksuit-broker:** the **single writer** of `state.json` — hosts
  `POST /designations`, which calls the kernel's `setDesignation`. Still agnostic
  about what a name *means*; it just owns the one write path. (Open, later: a
  designated "home"-like seat might want a stable workspace rather than a per-turn
  one — not this pass.)
- **thinksuit-console:** in scope this pass — the logical *writer* of the
  designations map (physically routed through the broker), and where the
  representation lives:
  - Pinned "Designations" section above the session list (display).
  - Assign gesture from the per-row `⋮` menu and from the top of the open
    session (workbench).
  - `lastUpdate` recency sort on the session list.
  Bulk of the pass.
- **thinksuit-cli:** future reader/writer of designations. Deferred.
- **thinksuit-tty / mcp-server / mcp-tools:** out of frame for now.
