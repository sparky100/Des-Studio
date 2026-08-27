# ADR-020: Draw/Run Integration — Live Preview While Authoring

**Date:** 2026-08-25
**Status:** Decided against (2026-08-26) — the Draw and Run canvases will remain separate surfaces. Phase 1 was implemented, dogfooded, reviewed, and removed; the product owner has since confirmed the decision not to integrate the two canvases, closing the direction rather than pausing it. See "Decision Not to Integrate" at the end of this document.
**Sprint:** Post-91/92 (unified-canvas prerequisite work)

---

## Context

The 2026-08 UX review (`docs/reviews/expert-review-2026-08-ux.md`) rated the app 7.5/10 and, in follow-up discussion with the product owner, identified a fundamental — not incremental — gap: **building and executing a model are three separate rooms.** A modeller edits in Design (Draw canvas or the twelve form tabs), then walks to Run to find out whether the model behaves as intended, then to Results to see what happened. Feedback is batch, not continuous.

The engine, uniquely for a project this size, already has the raw capability to close that loop: it is fast (7–33ms for a `maxSimTime≈50` run — see Benchmarks below), stateless/pure (`buildEngine()` has zero side effects — no Supabase calls, no persistence), and already drives a genuinely live per-tick feed (`ExecutePanel`'s Auto Run: `setInterval(doStep, 40–400ms)` → `engine.step()` → `snap` → `ExecuteCanvas`). The gap is not engine capability; it is that nothing wires an edit on the Draw canvas to a running preview.

This ADR is the design for closing that gap, informed by two deep-exploration passes over the current Draw canvas (`VisualDesignerPanel`/`graph.js`/`graph-operations.js`) and execution machinery (`ExecutePanel`/`replication-runner.js`/`engine/index.js`). It supersedes vague "merge the canvases" language with a concrete, phased, low-risk path — because the exploration surfaced hard reasons a naive merge would fail today.

## Why a Full Merge Is Not Phase 1

Four findings rule out "just render live tokens on the Draw canvas" as a first move:

1. **`buildEngine()` has no incremental re-init.** `step()` closes over a `runtimeModel` built once at construction (`src/engine/index.js:489-946`). There is no API to hand the engine a patched model mid-run — every edit requires a full rebuild from t=0. This is fine (rebuilds are cheap — see Benchmarks) but means live preview is fundamentally "cancel and restart," never "patch in place."
2. **The `runtimeModel` WeakMap cache is identity-keyed and Draw always produces new model objects** (`applyModel`/`setWholeModel` is an immutable-update pattern throughout). Every edit is a guaranteed cache miss — there is no free "diff and reuse" path today. `detectStructuralChanges()` (`src/engine/validation.js:2037`) exists but isn't wired to skip work anywhere.
3. **Draw's node/edge components and Execute's are not dual-purpose.** `DesNode`/`DesEdge` (Draw) have no live-data slot at all. `ExecuteSourceNode`/`ExecuteQueueNode`/`ExecuteActivityNode`/`ExecuteSinkNode`/`AnimatedEdge` (Execute) have no editing affordances and explicitly disable dragging/connecting (`nodesDraggable={false}`, `ExecuteCanvas.jsx:838`). Building a genuinely dual-mode node component set is real, multi-sprint UI work — not something to gate behind a POC toggle.
4. **Draw's panel unmounts on tab switch; Execute's stays mounted** (`ModelDetail.jsx:1155-1161` vs `:1538,1590`). A merged single-surface view needs a deliberate lifecycle decision the codebase doesn't currently make for either side alone.

Given this, **rebuilding both canvases into one dual-mode surface is Phase 2+ work**, gated on validating that the underlying interaction — a small simulation staying warm and reacting to edits — actually feels good and is worth the investment. Phase 1 tests that value proposition cheaply, using existing components.

## Decision — Phase 1: Live Preview Strip (implemented, flagged off by default)

Add an optional, collapsible **Live Preview** panel to the Draw tab that:

- Runs a small, capped simulation (`maxSimTime` defaults to 60 sim-time units, configurable) using the *exact* engine lifecycle Auto Run already uses: `buildEngine()` → `setInterval(doStep, 200ms)` → `snap` → render.
- Renders that `snap` through the **existing, unmodified `ExecuteCanvas`** component in a small inset frame — reusing all of its node components, token animation, and snap-diffing logic verbatim. No new canvas code.
- **Debounces on model changes**: waits 800ms after the last edit settles before tearing down the current engine and rebuilding. This is deliberately *slower* than a keystroke-reactive loop — per the exploration's flagged risk, rebuilding resets simulated time to 0, which reads as a jarring "rewind" if it fires too eagerly. An 800ms settle plus a brief crossfade (opacity dip, not a blank flash) makes each rebuild read as "the preview updated" rather than "the preview broke."
- **Never persists.** No `saveSimulationRun`, no run-admission gating beyond a defensive `maxSimTime`/`maxCycles` cap (reusing `estimateMaxCycles`) so a pathological model (e.g. runaway recursive arrivals) can't hang the interval loop. This is intentional per the exploration: `buildEngine()` is confirmed side-effect-free, and Step/Auto Run's own code path only checks `hasValidationErrors`, not full admission — the preview follows that same, lighter bar.
- **Feature-flagged** via the codebase's established `localStorage` pattern (`des.livePreview.enabled`, same shape as `des.palette.collapsed` etc.) — off by default, toggled from the Draw canvas toolbar. No account/plan gating needed for a local, non-persisting preview.

### What Phase 1 deliberately does not do
- No changes to `DesNode`/`DesEdge` or the Draw canvas's editing behaviour.
- No changes to `ExecuteCanvas` or its node components — reused as-is.
- No engine changes — `buildEngine()`/`step()` used exactly as Auto Run uses them.
- No always-mounted lifecycle promotion for Draw — the preview panel's engine instance lives and dies with the Draw tab's mount, same as everything else in `VisualDesignerPanel` today.

### Benchmarks (measured this session, Node, warm JIT, `mm1` template)

| `maxSimTime` | Wall time | Events/scans |
|---|---|---|
| 50 | 7–33ms | 133 |
| 120 | 13–17ms | 317 |
| 600 (high util) | 84ms | 1608 |

A capped preview run is comfortably inside a single frame budget; the 800ms debounce is a UX choice (avoid rewind-flicker), not a performance necessity.

## Phase 2+ (not this ADR's scope — recorded for continuity)

If Phase 1 validates the interaction (user testing / dogfooding shows modellers want the preview running continuously, not just as an occasional check):

1. **Dual-mode node components.** Extend `DesNode`/edge or build new components that accept an optional `data.liveData` slot alongside existing editing affordances, so a single canvas can show structure *and* live state simultaneously — this is the real "unified canvas" and is a multi-sprint UI project in its own right.
2. **Structural-vs-parametric edit distinction.** Wire `detectStructuralChanges()` to actually skip a full engine rebuild for pure parameter tweaks (e.g. a distribution mean change) where the FEL/entity topology is unchanged — turns "cancel and restart" into "patch and continue" for the common case. This is an engine-layer change, not UI.
3. **Lifecycle unification.** Decide whether the merged view is always-mounted (Execute's model) or tab-scoped (Draw's model), and reconcile the two independent Dagre/auto-layout passes (`graph.js` vs `executeLayout.js`) so undrawn nodes don't visually diverge between modes.
4. **Worker-backed preview** if main-thread `step()` calls ever compete visibly with Draw's own drag/connect interactions — `replication-runner.js`'s persistent-pool pattern is the precedent, though the benchmarks above suggest this isn't needed for realistic preview sizes.

## Consequences

- Positive: validates the highest-value fundamental-UX recommendation cheaply, using entirely existing, tested components (`ExecuteCanvas`, `buildEngine`, the Auto Run loop) — the new code is a debounce/lifecycle hook and a toolbar toggle, not a canvas rewrite.
- Positive: zero risk to the authoring canvas or the engine — both are used read-only/as-is.
- Negative: Phase 1 is a preview *strip*, not the unified canvas the product vision describes — it proves the concept without delivering the full experience. Framing this to users as "Preview" (not "the new Execute") matters.
- Negative: an 800ms-debounced small-scale preview cannot show the effects of large structural changes as fluidly as full Execute — it's a sketch, not a substitute for a real run.

## Open Questions

- Should the preview's `maxSimTime`/entity-count cap be user-configurable, or fixed? (Phase 1 ships fixed at 60, adjustable only via a constant, pending user feedback.)
- Where does the preview panel live spatially on the Draw canvas — docked bottom strip (implemented) vs. floating inset vs. split-pane? Phase 1 picks a bottom strip as the least disruptive to existing canvas layout; revisit after use.
- Does Phase 2's dual-mode node work belong to the Visual Designer team's roadmap or is it large enough to warrant its own ADR/sprint plan? Recommend a dedicated design pass once Phase 1 data exists.

## Post-Merge Review and Fixes (2026-08-25)

Two independent close readings of the shipped Phase 1 code (one by the implementer, one adversarial) found and fixed one real behaviour bug, and identified one known limitation left unaddressed by user request.

**Fixed — the preview froze instead of updating on every edit.** This document's own description above ("waits 800ms after the last edit settles before tearing down the current engine") was not quite what the code did: the previous run's stepping stopped the instant an edit landed, but nothing signalled that to the display, so the panel held that now-stale frame at full brightness — looking exactly as "live" as before — for the entire 800ms wait, then jumped straight to the new run. `useLivePreview` now tracks a `pending` flag that goes true the moment an edit is queued and false once the rebuilt engine's first frame is ready; the panel dims to the same faded state it already used for "not started yet" and its caption says "Updating the preview for your last edit…" during that window, so the wait reads as an honest pause rather than a frozen or broken feature.

**Known, deliberately unaddressed — the preview can silently run on incomplete data.** A real Run resolves two things before simulating that this preview does not: live-data-bound parameters (`model.experimentDefaults.liveDataMode`), and named schedules stored outside the model (a bEvent schedule row with a `scheduleRef` and no inline `rows`, which resolves to *zero arrivals* rather than its real pattern when nothing supplies the referenced rows). For a model using either, the preview isn't wrong so much as it's quietly simulating a different, unresolved version of the model, with no indication that's happening. Detecting and warning about this was scoped out of this pass as more involved than the fix warrants right now; it remains open for a future pass — see Phase 2's data-fidelity considerations above, which this gap is a specific instance of.

## On Hold (2026-08-25)

After the fixes above shipped and the feature was dogfooded on a real model, the product owner decided to remove Phase 1 and put the whole Draw/Run integration direction on hold, rather than proceed to Phase 2.

**What was removed:** `LivePreviewPanel.jsx`, `useLivePreview.js`, and their tests. The Draw canvas is back to exactly how it worked before this ADR — no preview strip, no toggle. Nothing about Phase 2 (dual-mode node components, structural-vs-parametric rebuild skipping, lifecycle unification) was started; it was never more than the "Phase 2+" section above.

**Why this document stays.** This isn't a record of a mistake — Phase 1 did what it was for: it let the product owner try the idea cheaply, on a real model, before committing to the much larger Phase 2 investment, and the answer that came back was "not now." The two deep-exploration passes into the Draw canvas and execution architecture (Context/Why-not-a-full-merge sections above), the benchmarks, and the fixes made along the way (the freeze-on-edit bug, documented above) remain accurate and directly reusable if this direction is picked back up later — nothing here needs to be re-derived from scratch.

**If this is revisited:** start from this document rather than a blank page. The "Why a Full Merge Is Not Phase 1" findings and the benchmark numbers are unlikely to have changed meaningfully; re-verify them rather than assuming they still hold, since the codebase will have moved on. The removed code is recoverable from git history (search the commit that fixed the freeze-on-edit bug) as a starting point, though it should be re-reviewed rather than restored as-is given the schedule/live-data gap noted above was never resolved.

## Decision Not to Integrate (2026-08-26)

The product owner has confirmed the final call: **the Draw canvas and the Run (Execute) canvas will not be integrated.** They remain two deliberately separate surfaces — Draw for authoring structure, Run for watching and measuring execution — each keeping its own node components, layout pass, and lifecycle. This closes the direction the "On Hold" section above left open: Phase 2+ (dual-mode node components, structural-vs-parametric rebuild skipping, lifecycle unification) is cancelled, not paused.

The rationale from dogfooding stands: the separation between authoring and execution turned out to be a feature, not a gap — each surface can stay optimised for its own job without carrying the other's complexity. The document is retained as the record of how the question was explored and answered; the architectural findings ("Why a Full Merge Is Not Phase 1", the benchmarks) remain a useful reference for any future work that touches either canvas individually.
