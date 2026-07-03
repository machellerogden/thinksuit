# ThinkSuit De-Pipelining — Alignment Record

**Status:** Aligned in design discussion; not yet implemented. Captures decisions
reached collaboratively before implementation. Open items listed at the end must
be closed before starting work.

## Goal

Remove the cognition-as-pipeline experiment (signals → facts → rules →
plan-inference) from the turn. Keep the shell you value. Put a standard agent loop
where the pipeline was. The pipeline was an experiment, never the core idea.

## Scope — near-term vs north star

**This change:** a good, *simple*, agent-oriented system, close to what exists today,
minus the classification pipeline. Nothing more. Do not over-build toward the
long-term shape.

**North star (explicitly NOT this change):** ThinkSuit is a personal automation
platform where agents are *one kind of step*, not the whole game — plans will include
**direct, declared tool calls** (a non-agent node peer to `task`), an always-on voice
front door with a **deterministic command surface**, and **self-operation** (ThinkSuit
working on itself) as the acceptance milestone. These are the target the substrate
should not *foreclose*, but they are not built here. (Caveats: plan.v2 stays
`task`/`sequence`/`parallel` — the non-agent tool node is deferred; ASL is *not* in
scope. `vision.md` is an agent's transcription of the owner dreaming aloud, not a
spec.)

## The bright line

- **Keep (the shell, outside the turn):** ops/`thinkctl`, services, voice harness,
  broker (worker-per-turn), sessions/JSONL, CLI verbs, config registry, secrets,
  providers, `mcp`, `approval`, logger/transports.
- **The contract that must not break:** `run()`'s return shape (`formatFinalResult`:
  `{success, response, sessionId, usage, error}`) + the session JSONL stream
  (`TURN_START → INPUT → RESPONSE → TURN_COMPLETE`, or `INTERRUPTED`). Blast radius
  is entirely *behind* `run()`.

## Removed — the decision plane

- **Path 2** (auto-select) at `CheckSelectedPlan`; the fork collapses.
- Handlers `detectSignals`, `aggregateFacts`, `evaluateRules`, `selectPlan` + their
  `machine.json` states.
- Rules engine: `the-rules-engine` dep;
  `policy/{systemPlanSelectionRule,systemValidationRules}` (die with `evaluateRules`,
  their only referent — `evaluateRules.js:99`). *(`generatePolicyRules` +
  `systemEnforcementRules` already deleted in `#13`.)*
- **NOT removed — policy *enforcement* is now execution-plane (re-homed in `#13`).**
  `enforcePolicyCore` (`handlers/enforcePolicy.js`: `maxDepth`/`maxFanout`) +
  `applyToolPolicy` (tool filtering at MCP discovery) survive as shell. Distinct from
  the deleted rules-based enforcement.
- Facts & signals: all fact types; `historicalSignals` plumbing
  (`schedule → run → internals → runCycle → aggregateFacts`, `loadSessionSignals`);
  module `classifiers`/`rules` (mu). **Caveat — deliberate retreat:** the regex
  classifiers were also groundwork for a future *deterministic command surface*
  (utterance → route, no LLM). Deleting them retracts that in-progress capability;
  the replacement is a north-star concern (and won't be ASL). De-pipelining must not
  pretend the hole isn't there, but does not fill it.
- Config: `policy.perception` + `DEFAULT_POLICY.perception`.
- **Trajectory / `machine.json` dissolves** — nothing left to route once Path 2 and
  `strategy` are gone.
- Goes stale: console `SignalDetectionView`/`FactAggregationView` +
  `SessionInspector` signals section; outward `signals` MCP tool; `selectModule`
  classifier/rules validation.

## Model B (locked)

- Composition is **structural**; **one execution primitive = the loop**.
- `plan.strategy` enum removed. `sequence`/`parallel` are a **composition layer
  over the loop**, not peers. The work node is `type:"task"` = the loop; `direct` =
  the same loop bounded to one round (`maxRounds:1`). ("leaf" is talking-only —
  never appears in code.)
- Plans **authored**, supplied as today. Resolution:
  `selectedPlan = config.selectedPlan ?? loadPlan(module.defaultPlan)`, applied in
  `run()` after `selectModule` (`run.js:116`). `defaultPlan` is a **named reference**
  into the module's existing plan library (`plans.json` + `plans/<name>.json`) — not a
  duplicated inline object.
- **Module states the default plan** → planless doors (voice `daemon.js:120-137`,
  mcp-server `thinksuit.js`, console `run/+server.js:49`) inherit it with no change.

## `plan.v2` schema (locked — a **tree**, explicitly *not* a graph)

```
Plan = { name, description?, ...Node }              // plan is the root node, inline
Node =
  | { type:"task",     role, tools?, input?, maxRounds?, timeoutMs?, params? }
  | { type:"sequence", children: Node[], resultStrategy? }
  | { type:"parallel", children: Node[], resultStrategy? }
ResultStrategy = "last" | "concat" | "label" | "formatted"
```

- Explicit `type` discriminator. Composites use uniform `children`. Recursive.
- `input` = **freeform template string** (`$input`, `$last_response`,
  `$<nodeId>_response`), expanded against the context bag; default when omitted =
  `input` + immediately-prior result.
- Structural schema **closed**; module knobs (e.g. `lengthLevel`, `adaptations`) live
  in the open **`params`** bag. `adaptations` = named prompt-fragment keys
  (`adapt.<key>`) the module layers onto the system prompt; formerly set by rules, now
  authored — it's a module-specific convention, so it belongs in `params`, not the
  structural schema.
- Bounds `maxRounds` + `timeoutMs` (provisional until loop config locked). No
  `rationale` (keep `description`). No per-node model/provider.
- **Deleted plan fields:** `strategy`, `threadAccumulation`, `coverage`, `risks`,
  `cost`, `latency`, per-step `strategy`, `resolution` (→ loop bounds).
- **Graph rejected:** explored loops/conditionals; bailed because verdict-driven
  conditional routing is unbuilt (an LLM `task` node yielding a routable outcome would be a
  real new mechanism). Plans are composition, not control flow.

## Composer ↔ loop interface (grounded + decided)

- One recursive executor `executePlan(node, ctx) → result` replaces `runCycle` +
  machine + `exec*`.
- **`task` node runs the loop directly — no `runCycle` re-entry.** Today `execTask`
  loops by re-entering `runCycle({strategy:'direct'})` (`execTask.js:154`), which
  routes the machine to `execDirect` → `callLLM`. With the machine gone the node
  calls the primitives itself: `callLLM(machineContext, {model, systemInstructions,
  thread, maxTokens, temperature, tools}, toolSchemas)` (`providers/io.js:86`) → if
  `toolCalls`, approve + `callMCPTool({tool,args}, discoveredTools)`
  (`mcp/execution.js:30`) → append results → repeat until no tool calls; bounded by
  `maxRounds`/`timeoutMs`. This is what collapses `direct` into `task`.
- **Four primitives survive untouched (shell, not decision plane):** `callLLM`,
  `callMCPTool`, `requestToolApproval` (`approval/async.js:24`; bypassed on
  `config.autoApproveTools`), `abortSignal`/`InterruptError`. The node's `tools`
  array is the allowlist; `toolSchemas` are built from `discoveredTools`
  (`execDirect.js:140`).
- **Instruction composition folds into `task` setup.** `composeInstructions` built
  `{systemInstructions, thread}` from role+module+adaptations and `execDirect` just
  consumed it (`execDirect.js:94`). That building moves into the node's thread setup
  — this is exactly where the open `roles`/`adaptations` questions land.
- **Nodes exchange results (final text), not transcripts.** Each `task` owns its own
  history. Shared context bag threads through composition; each node writes
  `last_response` + `<nodeId>_response`. Parallel **clones** the bag per branch. Root
  carries session continuity (prior thread + this turn's `input`); children isolated.
  Old `execSequential` thread-stitching deleted.
- **Error policy (decided):**
  - *Interrupt* — uniform, unchanged: `InterruptError` re-thrown to the turn boundary
    → `session.interrupted` (as in `execSequential.js:391`, `execParallel.js:304`).
  - *`task`-node model error* — **error-result, no masking:**
    `{output, error, finishReason:'error'}`. Replaces execDirect's benign-text mask
    (`execDirect.js:261`), which lied to parent composites.
  - *composite on non-interrupt child error* — **sequence stops** (propagates up,
    later steps depend on earlier); **parallel tolerates** (`Promise.allSettled`,
    failed branch → failed-result, as `execParallel.js:298`).
  - *tool error* — unchanged: becomes tool-result content (`Error: …`), model reacts;
    not thrown.
- **Carry policy enforcement forward (don't drop it).** `enforcePolicyCore`
  (`maxDepth`/`maxFanout`) currently runs in `runCycle` (`runCycle.js:115`), re-homed
  there by `#13`. When `runCycle` dissolves: the **depth guard moves into
  `executePlan`** (recursion across composition), the **fanout guard into the
  `parallel` point**. `applyToolPolicy` at MCP discovery is untouched.
- **Dropped from `execTask`:** synthesis-reserve magic numbers + forced synthesis
  cycle (`execTask.js:29,582` — self-labeled "NO BUENO"), `compositionType`,
  thread-stitching. **`fidelity` dropped** (overlaps the freeform template, conflicts
  with isolation; inline summarization, if ever needed, is a explicit summarize node).

## Module shape (grounded + decided)

- **Roles survive nearly unchanged.** `{name, description, isDefault?, temperature,
  baseTokens, prompts:{system, primary}}` (`mu/index.js:17`). A `task` node's `role`
  indexes them; `temperature`/`baseTokens`/`prompts` feed thread setup
  (`utils/module.js` `getRoleConfig`/`getDefaultRole`/`getRoleTemperature` all stay).
  Only shift: `description` was machine-consumed by auto-select (role picking) — now
  **authoring documentation only**. `isDefault`/`getDefaultRole` kept as the fallback
  when a `task` omits `role`.
- **`composeInstructions` simplifies hard, stays module-owned** (preserves "module
  owns its thread structure"). Collapses to the single `default` path: prelude
  (`frame`+`modality`) + system + history (root only) + primary + input. **Dropped:**
  `compositionType` (continuation/accumulation existed only for the deleted `runCycle`
  re-entry), `factMap` (dead — no mu prompt references it), and the
  `plan.strategy==='task'` alignment branch (`composeInstructions.js:152`; a small
  follow-up: re-decide when task-execution-alignment applies, likely when the node has
  tools / `maxRounds>1`). **`frame` and `modality` stay** (modality is the voice/text
  mechanism).
- **`module.defaultPlan` = named reference**, resolved via `loadPlan` against the
  existing library.
- **`adaptations` lives in `params`** (consistent with `lengthLevel`).
- **Plan-file migration:** each `plans/<name>.json` wrapper `{name, description, plan}`
  flattens to the plan.v2 inline root `{name, description?, ...Node}`;
  `strategy`→`type`, `sequence`→`children`, `resolution`→`maxRounds`/`timeoutMs`,
  `rationale` dropped, `lengthLevel`/`adaptations`→`params`.

## De-risking sequence (test-anchored)

**Anchor:** `schemas/turn-contract.test.js` + `engine/schedule.test.js` stay green at
*every* step — if they hold, the shell never notices. Steps 1–2 are pure addition
(safe); 3 is the flip; 4–6 are subtraction once dead.

**Test tiers:**
- *Green throughout (bright line + shell):* `schemas/{turn-contract,validate}`,
  `engine/schedule`, `interrupt`, `engine/session-thread-interrupt`,
  `engine/sessions/*`, `config*`, `secrets`, `designations*`, `engine/providers/*`,
  `integration/providers`, `artifacts/*`, `logger`, `middleware`, `utils/temperature`,
  **`handlers/enforcePolicy`** (execution-plane now).
- *Deleted with their code (decision plane):* `engine/handlers/{detectSignals,
  aggregateFacts,evaluateRules}`, `handlers/selectedPlan` (Path 2 half), mu
  `tests/{intent,rules}`. *(rules-based policy tests already gone with `#13`.)*
- *Rewritten in place (exec plane → loop + composer):* `handlers/{execDirect,execTask,
  execSequential,execParallel,execFallback,resultStrategy,execution-plane-audit,
  composeInstructions}`, mu `composeInstructions`, `engine/runCycle`,
  `engine/run/internals`.

| Step | Change | New/rewritten tests | Deleted |
|---|---|---|---|
| 1 | `executeTask` (task loop) standalone, **beside** the machine | loop test: `callLLM`/`callMCPTool`/approval direct; maxRounds/timeout/error-result | — |
| 2 | `executePlan` composer calls it; port `sequence`/`parallel`; error policy (seq-stops / parallel-tolerates) | composer seq/parallel + `resultStrategy` over the loop | — |
| 3 | `selectedPlan = config ?? loadPlan(defaultPlan)`; cut Path 2 at `CheckSelectedPlan` | defaultPlan resolution | `selectedPlan` (Path 2) |
| 4 | Delete decision-plane handlers + facts/signals + remaining `policy/*` rules | — | detect/aggregate/evaluate + mu intent/rules *(partly done: `#13`)* |
| 5 | Migrate mu plans → v2; simplify `composeInstructions`; drop `factMap` | simplified composeInstructions | old compositionType/factMap asserts |
| 6 | Retire `runCycle`/`machine.json` → fold into `executePlan`; **relocate `enforcePolicyCore`** (depth→`executePlan`, fanout→`parallel`) | executePlan replaces runCycle test | machine-routing asserts |

## Still open — before "go"

- **Trace/event vocabulary** — *deferred by decision*: lock names when wiring
  console/inspect, so naming is decided with its consumers in view. Dies regardless:
  all `PIPELINE_EVENTS` + `PROCESSING.CLASSIFIER_*`/`RULES_*`. Sacred (turn contract):
  `SESSION_EVENTS`. The open naming: the loop + composite families
  (`execution.direct/task/sequential/parallel`) and boundary types
  (`cycle`/`step`/`branch` — all polluted by the old model). Options on the table:
  neutral rename (`execution.task.round_*`, `execution.{sequence,parallel}.child_*`)
  vs reuse `task.*`+`cycle`.
- **`task`-execution-alignment trigger** — small: the `strategy==='task'` alignment
  branch dies with `strategy`; re-decide when the alignment prompt applies (likely
  tools present / `maxRounds>1`).
- **`roadmap.md` ASL line** — the "Classifier → ASL-automation dispatch" item still
  commits the deterministic rung to ASL; `vision.md` now describes it mechanism-
  agnostic (explicitly not ASL). Reconcile that one line when convenient (not this
  change). *(`vision.md` itself: done — rewritten to the near-term reality + north
  star, cognition-pipeline-as-kernel and ASL-as-automation-language both removed.)*

## Documentation stance

keep / rewrite / **delete** ("is it worth owning?" is first-class — much is
prior-Claude-generated and already drifts). Agent-facing `CLAUDE.md`s move in
lockstep with code; human prose + diagrams batched at the end. Trace vocabulary is
the through-line. OS-signal docs (`cli/docs/signal-handling.md`) are false
positives. Heavy targets: `architecture-overview.md` diagrams,
`execution-strategies.md`, `module-authoring.md`, root `CLAUDE.md` trace queries,
`vision.md`.

## Working method (how we operate)

Ground in code and cite; don't invent. Define before building; don't leap to "go."
Injective terms, no imported vocabulary. attractor and Claude Code are
*illustrations* of the standard agent-loop pattern, **not blueprints** — ground
design in ThinkSuit's own code + user intent. Decisions are the owner's; surface
consequences, don't decide for them.

## Key grounding files

- Seam: `engine/run.js`, `run/internals.js`, `schedule.js`, `runCycle.js`,
  `machine.json`.
- Dying: `handlers/{detectSignals,aggregateFacts,evaluateRules,selectPlan}.js`,
  `policy/*`.
- Exec zoo: `handlers/{execTask,execDirect,execSequential,execParallel,execFallback}.js`.
- Plans: `schemas/plan.v1.json`, `thinksuit-modules/mu/plans/*.json`.
- Doors: `broker/src/worker.js`, console `api/run/+server.js`, `voice/src/daemon.js`,
  `mcp-server/lib/tools/*`.
