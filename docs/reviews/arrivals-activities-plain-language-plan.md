# Plan: Plain-language completion summary + bidirectional event navigation

## Status

**Phase 1 — implemented.** Plain-language B-Event effect summary inline in the
C-Events editor, plus bidirectional navigation between a C-Event and the
B-Event(s) it schedules/that schedule it.

**Phase 2 — documented only, not implemented.** Dedicated "Arrivals"/
"Activities" tabs with a per-user simplified/advanced toggle. See below.

## Context

The B-Event / C-Event split is faithful to the Three-Phase simulation engine,
but the cross-referencing between the two was invisible: a C-Event's
"Schedule Follow-on Event" panel let you pick a completion B-Event by
name/dropdown, but you couldn't see what that B-Event actually does (which
resource it releases, where it routes the entity) without leaving the tab to
go find it — and going the other direction, a B-Event that exists purely as a
completion handler didn't show which C-Event scheduled it.

A bigger redesign was considered — dedicated "Arrivals" and "Activities" tabs
with a per-user simplified/advanced toggle, replacing the mental model of
B/C-Events entirely — and rejected for this pass. It requires a classifier to
decide which events map cleanly onto "Arrival"/"Activity" framing (BATCH,
COSEIZE, MATCH, PREEMPT, FAIL, REPAIR, multi-branch routing, FILL/DRAIN, loop
guards don't), which is a meaningfully larger and riskier surface area for
what is fundamentally a presentation convenience. That idea is deferred to
**Phase 2** below.

**Phase 1**, implemented in this pass: a plain-language summary of what a
linked B-Event does, shown inline in the C-Event editor, plus a working link
in both directions so a user can jump straight to the other half of an
activity.

## Phase 1 (implemented)

### 1. Plain-language effect summary

`summarizeBEventEffect(bEvent)` in `src/model/effectSummary.js` pattern-matches
a B-Event's macro calls (via `macroCalls`, shared from the new
`src/model/macroParser.js` — extracted from `src/ui/visual-designer/graph.js`,
which now imports `clean`/`macroCalls` from there instead of defining its own
copies) into a friendly phrase:

- `RELEASE(...)` + `routing`/`probabilisticRouting` →
  `"Releases <resource> · routes 80% → Checkout Queue, 20% → Express Queue"`.
- `COMPLETE()` → `"Entity exits simulation"`.
- `RENEGE(ctx)` → `"Entity reneges"`.
- Anything else (FILL/DRAIN/SET/COST/PREEMPT/FAIL/REPAIR, or any combination it
  doesn't have a phrase for) → graceful fallback that lists the raw macro
  calls, e.g. `"Also: FILL(Stockroom, 10)"`. Nothing is ever hidden — this
  function only ever adds a friendlier label on top of, never instead of, the
  real effect.

### 2. Forward link: C-Event → B-Event

In `CEventEditor.jsx`'s "Schedule Follow-on Event" section, the "Will
schedule" preview under each `cSchedules` row now renders
`summarizeBEventEffect(linkedBEvent)` and makes the B-Event's name clickable.
Clicking calls a new `onGoToBEvent(bEventId)` prop, wired in `ModelDetail.jsx`
the same way `ScheduleManager`'s existing `onGoToBEvent` already is
(`setFocusBEventId(bEventId); setTab("bevents")`). `BEventEditor` already
supported being focused/scrolled-to via its existing `focusBEventId`/
`onFocusHandled` props — no change was needed on that end.

### 3. Backward link: B-Event → C-Event

`BEventEditor.jsx` already computed a boolean `isCScheduleTarget`
(`cEvents.some(c => (c.cSchedules||[]).some(s => s.eventId === ev.id))`) but
only used it for a warning. It now also keeps the actual matching C-Event(s)
(`cEvents.filter(...)`) and renders a "Scheduled by: `<C-Event name>`" link in
the expanded card. Clicking calls a new `onGoToCEvent(cEventId)` prop.

This required `CEventEditor` to gain the same focus-and-scroll mechanism
`BEventEditor` already had, mirrored 1:1: `focusCEventId`/`onFocusHandled`
props, a `cardRefs` ref map, and a `useEffect` that expands the matching card,
clears the filter, and scrolls it into view. `ModelDetail.jsx` holds this
state as `focusCEventId`/`setFocusCEventId`, alongside the pre-existing
`focusBEventId`/`focusScheduleId`, and wires `onGoToCEvent`/`onGoToBEvent`
into the `cevents`/`bevents` tabs respectively — identical shape to the
existing `onGoToSchedule` wiring already on that same line.

No classifier, no new tabs, no per-user setting, no Supabase change, no new
editor components. This was a self-contained addition to the two existing
editors plus new state/wiring in `ModelDetail.jsx`.

### 4. Documentation

- `docs/help-reference.md` — added a paragraph describing the inline
  completion summary and the cross-links, in the B-Events/C-Events section.
- `docs/DES_Studio_User_Guide.md` — added §5.5 describing the summary and the
  bidirectional navigation, next to the existing Delay-activity FAQ entry.
- `docs/DES_Studio_Product_Spec.md` — no entry added; the spec has no
  changelog/recent-improvements section, and this is a navigation/labeling
  improvement over existing data, not a new capability.
- `docs/DES_Studio_Engineering_Spec.md` §3.2 — added notes on
  `macroParser.js`, `effectSummary.js`, and the `focusCEventId`/
  `onGoToCEvent`/`onGoToBEvent` navigation wiring.

### Verification performed

- Vitest suite run before and after the change (`git stash` comparison): the
  same 53 pre-existing failures occur on both, confirming this work introduced
  no regressions. `tests/ui/editors/b-event-editor.test.jsx`,
  `tests/ui/editors/c-event-editor.test.jsx`, and all `graph.js`-dependent
  suites (`graph.test.js`, `graph-operations.test.js`,
  `visual-node-inspector.test.jsx`, `sprint-9b-roundtrip.test.jsx`) pass.
- No `model_json`/`db/models.js`/Supabase schema field was added, so no new
  Vitest round-trip test was required under the CLAUDE.md Schema Contract.
- Manual check: a C-Event scheduling a B-Event with RELEASE + probabilistic
  routing, one with COMPLETE, and one with an uncommon macro (e.g. FILL) each
  render a sensible one-line summary, including the fallback case. Clicking a
  scheduled B-Event's name jumps to the B-Events tab with that event expanded
  and scrolled into view; opening a B-Event referenced by a C-Event's schedule
  shows a "Scheduled by" link that jumps back to the C-Events tab.

## Phase 2 (documented now, not implemented in this pass)

Dedicated "Arrivals" and "Activities" tabs, with a friendlier card-based
listing (pairing a C-Event with its completion B-Event into one "Activity"
card, mirroring how `deriveGraphFromModel` already pairs them for the Visual
Designer canvas). Non-mapping constructs (BATCH, UNBATCH, COSEIZE, MATCH,
PREEMPT, FAIL, REPAIR, FILL/DRAIN, multi-branch routing, loop guards) would be
shown as flagged "Advanced" items rather than hidden.

Gated behind a per-user `ui.eventViewMode` setting (`'advanced'` default |
`'simplified'`), stored in the existing `user_settings.settings_json.ui`
following the same pattern already used for theme (`UserSettingsPanel.jsx`,
`App.jsx:233-243`, `src/db/models.js:18-22,40-48,237-279`) — fully additive;
the raw B-Events/C-Events tabs would remain available in advanced mode.

Revisit once Phase 1 has shipped and there's a read on whether the
navigation/summary improvements already solve most of the friction on their
own.
