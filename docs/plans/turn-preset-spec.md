# ThinkSuit Turn Preset — Natural Language Specification

> **Historical / pre-de-pipelining (read first).** This is a proposed design, not
> implemented. Its §2 "grounded in code" baseline (facts, `runCycle`, `selectPlan`,
> `mu/facts.js`, the rules/ASL plan-selection control flow) describes the architecture
> that the de-pipelining removed and **no longer holds**. Plans are now an authored
> plan.v1 node tree run by `executePlan`/`executeTask` (see `packages/thinksuit/CLAUDE.md`).
> Re-ground this spec before treating any part of it as current.

**Status:** Proposed — not yet implemented. Design developed collaboratively in
discussion; requires validation against ThinkSuit's own conventions before
execution.
**Date:** 2026-06-30
**Scope:** The *declarative artifact layer* — plans, frames, and a new
`turnPreset` concept — plus its on-disk storage, loading path, and the console's
input-control UX. **Not** the engine's plan-selection control flow (rules/ASL),
**not** the output/streaming plane.

**Provenance caveat (read first):** This spec was drafted in a session rooted in
a *different* repository, without ThinkSuit's `CLAUDE.md`, `docs/`, or module
conventions loaded. Every **fact** below is read directly from source and cited;
treat those as reliable. Every **naming/aesthetic judgment** (what a thing
*should* be called, how it should *feel*) should be re-validated against
[`docs/self-operation.md`](docs/self-operation.md) and the module conventions
before committing. Two interpretation errors were already made and corrected
during design; the *what* is trustworthy, the *why/should* deserves a second
read from inside the project frame.

---

## 1. Terminology decisions (fixed)

- **`turnPreset`** — the new concept, **always termed `turnPreset` in code** so it
  cannot be confused with anything else. In the **UI it is called "preset"** —
  that is acceptable and intended.
- The thing **currently** called `preset` in code is **not** a turnPreset. It is
  a **named, reusable plan** — effectively a *plan-library entry*. It must be
  renamed out of the way so `preset`/`turnPreset` is unambiguous (see §6).

---

## 2. Background — the declarative artifacts as they exist today (grounded in code)

ThinkSuit already has a small "declarative thing space." The relevant current
facts:

### 2.1 Frames
- Prose context. Shape `{ id, name, description, text }`.
- Loaded/merged by `loadFrames` / resolved by `getFrame`; written by
  `saveFrame` / `deleteFrame` — all in [`packages/thinksuit/frames.js`](packages/thinksuit/frames.js).
- User frames live in `~/.thinksuit.json` as a **flat, module-agnostic** array
  (`config.frames`). Module frames live on `module.frames` and merge in tagged
  `source: 'module'` vs `'user'`.
- `module.frames` is currently `[]` and annotated *"Forward-looking: will contain
  named frame definitions"* ([`packages/thinksuit-modules/mu/index.js:93`](packages/thinksuit-modules/mu/index.js)).

### 2.2 Presets (today = a named plan)
- Shape `{ id, name, description, plan }`. The `plan` is a `plan.v1.json` object.
- Loaded/merged by `loadPresets` / `getPreset`; written by `savePreset` /
  `deletePreset` — [`packages/thinksuit/presets.js`](packages/thinksuit/presets.js).
- User presets live in `~/.thinksuit.json` as `config.presets[moduleName]` (an
  **array, per module**). Module presets live on `module.presets` as a **keyed
  object** (e.g. [`packages/thinksuit-modules/mu/presets.json`](packages/thinksuit-modules/mu/presets.json):
  `chat → Chat`, `analyze → Analyze`, `deep-analysis → Deep Analysis`, …).
- **Note the storage-shape asymmetry:** module presets are a keyed object; user
  presets are a per-module array. Module frames are an array; user frames are a
  flat array.

### 2.3 Plans
- One schema, [`packages/thinksuit/schemas/plan.v1.json`](packages/thinksuit/schemas/plan.v1.json)
  (`name, strategy, sequence, roles, role, adaptations, rationale, maxTokens,
  threadAccumulation, resultStrategy, …`). **A plan already self-names** via
  `name` and `rationale` — so the preset wrapper's `name`/`description` largely
  duplicate fields the plan already carries; only `id` is genuinely additive.
- The same `plan.v1.json` shape appears in several **roles/envelopes**:
  - **authored** (raw plan): `config.selectedPlan`, "Manual plan override"
    ([`packages/thinksuit/engine/run/internals.js:81`](packages/thinksuit/engine/run/internals.js));
    "Bypass signal detection if provided"
    ([`packages/thinksuit/engine/runCycle.js:25`](packages/thinksuit/engine/runCycle.js)).
    `execute.js` sets `selectedPlan = config.selectedPlan` **or** `= preset.plan`
    ([`packages/thinksuit/engine/execute.js:100,109`](packages/thinksuit/engine/execute.js)).
  - **candidate**: `ExecutionPlan` fact — the plan **spread** onto the fact:
    `{ ns, type: 'ExecutionPlan', ...plan }`
    ([`packages/thinksuit-modules/mu/facts.js:13`](packages/thinksuit-modules/mu/facts.js)).
  - **precedence**: `PlanPrecedence` fact.
  - **winner**: `SelectedPlan` fact — the plan **nested** under `.plan`:
    `{ type: 'SelectedPlan', plan }`
    ([`packages/thinksuit/engine/policy/systemPlanSelectionRule.js`](packages/thinksuit/engine/policy/systemPlanSelectionRule.js));
    `selectPlan` returns `{ plan }`
    ([`packages/thinksuit/engine/handlers/selectPlan.js`](packages/thinksuit/engine/handlers/selectPlan.js)).

### 2.4 Modalities
- Channel instruction text (voice/text), keyed by name on `module.modalities`
  ([`packages/thinksuit-modules/mu/index.js:98`](packages/thinksuit-modules/mu/index.js)).
  Asserted per-turn via run config `modality`. **No user storage** today
  (module-only). Frame and modality are UI *neighbors* in the console, but are
  **not** coupled in the system.

### 2.5 Config + the loading paths (important — the cascade is not what it looks like)
- `~/.thinksuit.json` filename = `DEFAULT_CONFIG_FILE`
  ([`packages/thinksuit/engine/constants/defaults.js:32`](packages/thinksuit/engine/constants/defaults.js)).
- **Two independent loading paths exist:**
  1. **The config cascade** — `buildConfig`
     ([`packages/thinksuit/engine/config.js`](packages/thinksuit/engine/config.js))
     layers global › project › explicit, validates against
     [`config.v1.json`](packages/thinksuit/schemas/config.v1.json), and emits
     scalar config **plus selectors only**: `preset` id
     (`config.js:370`) and `frame` id (`config.js:389`). It does **not** carry
     the frames/presets *collections* forward.
  2. **The artifact loaders** — `loadFrames`/`loadPresets`/`getFrame`/`getPreset`
     read the **global** `~/.thinksuit.json` **directly**
     (`join(homedir(), DEFAULT_CONFIG_FILE)`), **bypassing the cascade**:
     global-only, no project/explicit layering.
- **Consequence:** the apparent benefit of "frames/presets live in the config
  file so they ride the cascade" is **illusory** — they never rode it. The
  collections appear in `config.v1.json` only so validation doesn't reject them.
- Call sites for the loaders: console
  ([`api/frames/+server.js`](packages/thinksuit-console/src/routes/api/frames/+server.js),
  [`api/presets/+server.js`](packages/thinksuit-console/src/routes/api/presets/+server.js)),
  CLI ([`packages/thinksuit-cli/src/main.js:45,54,65`](packages/thinksuit-cli/src/main.js)),
  engine ([`execute.js:102,119`](packages/thinksuit/engine/execute.js)). Public
  exports: [`packages/thinksuit/index.js:28-29`](packages/thinksuit/index.js).

### 2.6 The turn boundary (for orientation)
- A turn's input is one config object; the only required field is `input: string`
  ([`packages/thinksuit-console/src/routes/api/run/+server.js`](packages/thinksuit-console/src/routes/api/run/+server.js)).
  Other fields (`frame`, `modality`, `module`, `provider`, `model`,
  `selectedPlan`, `policy`, …) are execution context. A turnPreset is, in
  essence, **"the turn minus the live utterance"** (+ an optional seed utterance;
  see §5.3).

---

## 3. Problem

The declarative namespace is **crowded and non-injective**, which matters more
here than in an ordinary system because ThinkSuit is **self-operative**: its
terms are operative substrate (the rules engine matches on `ExecutionPlan` /
`SelectedPlan` etc.), not mere labels. Under an x-ray view that holds internal
and user-facing surfaces as one body, a term must have **exactly one referent**.
See [`docs/self-operation.md`](docs/self-operation.md) for the project's own
statement of this principle.

Concrete defects in the plan/preset cluster:

1. **`selectedPlan` (camelCase) is overloaded** across two referents — the
   *authored override* (`config.selectedPlan`, `runCycle` param) **and** the
   engine's *chosen winner* (local `selectedPlan` in
   [`selectPlan.js`](packages/thinksuit/engine/handlers/selectPlan.js) and
   [`systemPlanSelectionRule.js`](packages/thinksuit/engine/policy/systemPlanSelectionRule.js)).
   Input and output of the same pipeline share a token.
2. **`SelectedPlan` (fact) vs `selectedPlan` (camel)** — distinguished only by
   casing, and the casing doesn't hold.
3. **Bare `plan`** spans the shape, `preset.plan`, and the resolved `{ plan }`.
4. **The two plan facts wrap inconsistently** — candidate **spreads**
   (`...plan`), winner **nests** (`.plan`).
5. **"preset" is a misnomer** — it is a plan-library entry, and the name is
   needed for the new concept.

There is **no concept today for "a saved, reusable, addressable bundle that
configures a turn"** — module/provider/model/modality + a plan + a frame, with an
optional seed input. Users must reassemble that by hand each time.

---

## 4. Goal

Introduce **`turnPreset`** (UI: "preset") — a first-class, named, reusable
artifact representing *the turn minus the utterance*, composed **by reference**
from existing first-class artifacts, with an optional seed utterance — and, in
the process, make the plan/preset cluster's terminology injective.

---

## 5. Proposed solution (under consideration)

### 5.1 Three first-class citizens, composed by reference (not subsumption)
- **plan** — a `plan.v1.json` thing; self-naming.
- **frame** — prose context; remains its own first-class artifact (a **frame
  library**, *not* folded into the turnPreset body).
- **turnPreset** — references a plan and a frame **by name**; sets turn scalars;
  optionally seeds the input. It **does not contain** plans or frames.

A turnPreset with a seed input is a **fully runnable turn**; without one it is a
**configuration scaffold**.

### 5.2 Storage — format split is principled (structured → JSON; scalars+prose → markdown)
- **plan library** → `~/.thinksuit/plans/<name>.json` (one file per plan).
  Plans are structured trees; JSON is the correct carrier. The module's built-in
  plan library file (`mu/presets.json`) is renamed to **`plans.json`**.
- **frame library** → `~/.thinksuit/frames/<name>.md` (markdown; light
  frontmatter `name`/`description`, body = the frame text). Module-agnostic.
- **turnPreset** → `~/.thinksuit/presets/<name>.md` (markdown):
  - **frontmatter** = scalars + references: `module`, `provider`, `model`,
    `modality`, a **plan reference**, a **frame reference**.
  - **body** = a registry of named **H1 sections** (content runs until the next
    H1; unrecognized headings are **reserved/ignored**).

This deliberately moves artifacts **out of the `~/.thinksuit.json` blob** into a
`~/.thinksuit/` artifact directory (the file and the directory coexist — common
pattern). Per §2.5 this costs **no cascade** (there was none); it trades
single-file simplicity + one-schema validation for per-item files, per-item
diffs, and directory enumeration.

Example turnPreset:

```markdown
---
modality: text
module: thinksuit/mu
provider: anthropic
model: claude-sonnet-4-6
plan: Chat
frame: helpful-assistant
---
# input
Summarize the attached design doc in three bullets.
```

### 5.3 The `# input` section (the one defined body section)
- `# input` **prepopulates the input**. It maps to the **existing** `input`
  field — no new concept, no new term (passes injectivity).
- It is a **seed/default**, editable — not a hard override of the live utterance.
- **Unresolved:** consumption surface (see §8).
- All other body sections are reserved for future use; the grammar (H1 = named
  section) is the extension point.

### 5.4 Loading
- New **directory loaders** for each library: `readdir` the relevant
  `~/.thinksuit/<kind>/`, parse each file, and **merge with module-provided
  built-ins** — same merge semantics `loadPresets`/`loadFrames` use today
  (module `source` + user `source`). A directory model *could* additionally
  support project-level artifacts (`./.thinksuit/...`), which the current loaders
  do **not** — out of scope unless desired.

---

## 6. The rename (making the cluster injective)

Required to free `preset` and de-overload `plan`:

- **`preset` (current, = plan-library entry) → renamed.** It is a *named plan*;
  the wrapper is largely redundant (the plan self-names). Decide whether the
  library stores **plans directly** (addressed by their own `name`) or keeps a
  thin entry with a separate `id` (see §8).
- **`preset` is freed** → used (in code as `turnPreset`) for the new concept.
- **De-overload `selectedPlan` / bare `plan`:** the *authored* plan and the
  *operative winner* must stop sharing tokens. The operative pipeline's typed
  compounds — `ExecutionPlan` (candidate), `SelectedPlan` (winner),
  `PlanPrecedence` — are **unique and should stay**; the leaking bare-`plan` /
  camel-`selectedPlan` aliases are what need committing to one referent.

**Rename blast radius (term `preset`, today):** `presets.js` (4 functions +
filename), the `presets` property in `config.v1.json`, `module.presets` /
`mu/presets.json`, the run-config `preset` selector, the CLI `--preset` flag,
`getPreset` in `execute.js`, and the console's preset state/handlers + API. Plan
disambiguation touches the engine handlers/policy listed in §2.3.

---

## 7. Console UX (input-control area)

Today ([`SessionControls.svelte`](packages/thinksuit-console/src/lib/components/SessionControls.svelte))
the input area is a flat set of peers: an input textarea, **preset chips** (set a
plan today), **frame chips**, a **modality** selector
(`moduleMetadata.modalities`), and save-as-new flows. Each control is
independent.

The new turnPreset is **not a peer chip — it is a macro over the whole area**:
selecting one sets module/provider/model/modality + plan ref + frame ref **and**
seeds the input. UI consequences:

- The existing **preset chips become the plan-library picker** ("plan"); **frame
  chips** and **modality** become the other reference-slot pickers. The chip
  pattern is reusable for all three libraries.
- The genuinely new widget is the **turnPreset macro** (UI label "preset").
- **Unresolved** (see §8): the relationship between the macro and the parts, and
  whether a turnPreset is a per-turn macro or a session launcher.

---

## 8. Open questions / decisions to resolve

1. **Plan-library module scoping.** Plans reference module roles, so they are
   module-scoped today (`config.presets[moduleName]`). For per-file storage:
   subdirectory per module (`~/.thinksuit/plans/<module>/<name>.json`) **or** a
   `module` field inside each plan file? (Frames stay module-agnostic, so the
   frame library is flat — this asymmetry is principled.)
2. **Library entry vs bare plan.** When the `preset` wrapper dissolves, does the
   plan library address plans by their own `name`, or retain a separate `id`?
3. **`# input` consumption surface.** Console prefill (fill the textarea,
   editable) only, or also a headless/CLI default when no input is supplied, or
   both? ("Prepopulate" reads console-first.)
4. **turnPreset ↔ granular controls relationship.** Stamp-then-edit / bound-mode
   / stamp-with-dirty-tracking (provenance + "save as new")?
5. **turnPreset placement.** Per-turn macro (re-applied each turn) vs session
   launcher ("start a session like this")?
6. **Operative-winner renaming.** Exact target names for the bare-`plan` /
   camel-`selectedPlan` aliases so they commit to one referent without disturbing
   the `ExecutionPlan`/`SelectedPlan` fact types.
7. **Migration.** Existing user `~/.thinksuit.json` `frames[]` / `presets{}` →
   the new `~/.thinksuit/` directories. (One sampled user config had neither
   populated, but a migration/back-compat path is still needed.)
8. **Schema ownership.** Plan-library files reuse `plan.v1.json`. Do the
   turnPreset frontmatter and frame-file frontmatter get their own schemas?

---

## 9. Out of scope / future

- **The output/streaming plane.** A separate, larger concern from the same
  family (one referent, multiple encodings): a turn's result is one object
  in-process but an ack + event stream on the wire, and the `response` is encoded
  both as a return field and as a `RESPONSE` event. A future pass should consider
  a single **canonical, typed outcome record** that both the return value and the
  stream *project*. **Not part of this refactor.** (Note: the existing
  `session.interrupted` modeling is a deliberate, correct choice — do not "fix"
  it toward synthetic assistant responses.)
- **The full namespace audit** beyond the plan/preset cluster (roles, modules,
  instructions, facts) — not required to ship turnPreset.

---

## 10. Orientation for the implementing agent

Suggested reading order before changing anything: this spec →
[`docs/self-operation.md`](docs/self-operation.md) →
[`packages/thinksuit/frames.js`](packages/thinksuit/frames.js) +
[`packages/thinksuit/presets.js`](packages/thinksuit/presets.js) (the pattern to
generalize) → [`packages/thinksuit/engine/config.js`](packages/thinksuit/engine/config.js)
(confirm the cascade boundary) →
[`packages/thinksuit-console/src/lib/components/SessionControls.svelte`](packages/thinksuit-console/src/lib/components/SessionControls.svelte)
(the UX surface).

Resolve §8 with the author **before** implementing — several answers change the
storage shape and the UI structure. Do not over-specify ahead of those answers.
