# Sprint 30 Closure Report — Reusable Modelling Library and Scenario Packs

**Sprint:** 30
**Completed:** 2026-05-14
**Branch:** `claude/sprint-28-inventory-BDYGg`

---

## Summary

Sprint 30 delivered a fully functional reusable modelling library: 14 built-in templates across 6 domains, all verified correct; a redesigned template gallery with domain filtering and search; an in-app Patterns Guide; and 6 canonical pattern reference documents.

The sprint began with a full pre-sprint inventory (`sprint-30-pre-sprint-assessment.md`) that identified two classes of engine bug affecting the majority of existing templates. Both were fixed before any new templates were added.

---

## Bugs Fixed

### Bug 1 — ARRIVE one-arg queue-name mismatch (9 templates)
`ARRIVE(Type)` derives the queue name as `typeName + "Queue"` when only one argument is given. All 9 original templates used the one-arg form; their registered queue names did not follow that convention, so no entities ever entered the correct queue. All 9 were updated to use the two-arg form `ARRIVE(Type, QueueName)`.

Templates fixed: MM1, ER Triage, Outpatient Clinic, Call Center, Fast Food, Airport, Construction, Data Center, Warehouse.

### Bug 2 — ASSIGN entity-type-vs-queue-name mismatch (6 templates)
`ASSIGN(X, Server)` calls `waitingInQueue("X", …)` which matches `entity.queue === "X"`. If X is the entity type name rather than the actual queue name the entities are sitting in, ASSIGN finds zero candidates every C-phase — causing either an infinite loop (condition satisfied, effect no-ops) or zero throughput.

Templates fixed: Fast Food (×3 C-events), Airport (×2), Ward Bed Admission (×2), Bank Branch, Retail Checkout, Port Berth Operations.

### Bug 3 — Factory BATCH+ASSIGN split
The original Factory C-event combined `BATCH(Parts, 3)` with `cSchedules` but no ASSIGN, so batched parts were never processed. Split into two C-events: BATCH (priority 1, no cSchedules) then ASSIGN (priority 2, with service schedule).

### Bug 4 — Airport queue name ambiguity
Second queue was named "Scanner" — same as the Scanner entity type — making `queue(Scanner)` vs `idle(Scanner)` ambiguous. Renamed queue to "ScanQueue" throughout.

---

## New Templates (4)

| Template | Domain | Key features |
|---|---|---|
| Ward Bed Admission | Healthcare | RELEASE multi-stage, finite bed capacity (10), Admission queue cap=5 |
| Bank Branch | Service Systems | 4 tellers, PRIORITY discipline, priority attribute on Customer |
| Retail Checkout | Service Systems | 6 checkouts, finite waiting area cap=20 (balking) |
| Port Berth Operations | Logistics | 3 berths, Triangular(4,8,16) h, high utilisation (~83%) |

---

## Template Inventory (14 total)

| ID | Name | Domain | Status |
|---|---|---|---|
| mm1 | M/M/1 Queue | Academic | Fixed + metadata |
| er-triage | ER Triage | Healthcare | Fixed + metadata |
| outpatient-clinic | Outpatient Clinic | Healthcare | Fixed + metadata |
| ward-admission | Ward Bed Admission | Healthcare | **New** |
| call-center | Call Center | Service Systems | Fixed + metadata |
| fast-food | Fast Food Drive-Through | Service Systems | Fixed + metadata |
| airport | Airport Security | Service Systems | Fixed + metadata |
| bank-branch | Bank Branch | Service Systems | **New** |
| retail-checkout | Retail Checkout | Service Systems | **New** |
| factory | Factory Assembly | Manufacturing | Fixed + metadata |
| construction | Construction Logistics | Manufacturing | Fixed + metadata |
| warehouse | Warehouse Picking | Manufacturing | Fixed + metadata |
| port-berth | Port Berth Operations | Logistics | **New** |
| data-center | Data Center | Technology | Fixed + metadata |

---

## Features Delivered

### F30.0 — Engine correctness
All 14 templates: `served > 0` headless validation with `seed=42, t=0–100`. Both bug classes fixed.

### F30.1 — Template metadata
`domain` (string) and `templateMeta` (scenarioType, keyMacros, paramGuide, limitations) added to all 14 templates. Validated by test suite.

### F30.2 — Healthcare pack
Ward Bed Admission added. Outpatient Clinic ARRIVE fixed.

### F30.3 — Service Systems pack
Bank Branch and Retail Checkout added. Call Center, Fast Food, Airport ASSIGN bugs fixed.

### F30.4 — Manufacturing / Logistics pack
Port Berth Operations added. Factory BATCH split; Construction, Warehouse ASSIGN confirmed correct.

### F30.5 — Template gallery UI
- Domain filter strip: All / Academic / Healthcare / Service Systems / Manufacturing / Logistics / Technology — colour-coded per domain
- Full-text search bar: matches on name, description, scenarioType
- Richer cards: domain badge, scenarioType label, key macro chips, per-domain hover accent colour
- Search resets gracefully: "No templates match" empty state

### F30.6 — In-app Patterns Guide
Slide-in panel (480 px, fixed-right) opened from "Patterns Guide" button in gallery toolbar. Shows all 6 patterns with: title, summary, macro sequence code snippet, macro chips, template cross-references.

### F30.7 — Pattern documentation (docs/patterns/)
Six Markdown files, each covering: when to use, structure diagram, macro table, minimal template scaffold, analytical reference or notes, and example templates.

| File | Pattern |
|---|---|
| `01-single-queue-service.md` | M/M/c single shared queue |
| `02-multi-stage-release.md` | Sequential routing via RELEASE |
| `03-batching-assembly.md` | BATCH accumulation and processing |
| `04-reneging-abandonment.md` | Patience timers and RENEGE |
| `05-finite-capacity-balking.md` | Queue capacity limits |
| `06-priority-queue.md` | PRIORITY discipline and priority attribute |

---

## Test Results

| Suite | Tests | Result |
|---|---|---|
| Full Vitest suite | 1000 / 1000 | ✅ Pass |
| templates.test.js | 83 / 83 | ✅ Pass |
| Headless engine run (all 14 templates, seed=42) | 14 / 14 served > 0 | ✅ Pass |
| Build (`npx vite build`) | 0 errors | ✅ Pass |

---

## Files Changed

| File | Change |
|---|---|
| `src/engine/templates.js` | Rewritten: all 14 templates, ARRIVE/ASSIGN fixes, new templates, domain+templateMeta |
| `src/App.jsx` | Gallery redesign (F30.5), PatternsGuidePanel component (F30.6), state vars |
| `tests/engine/templates.test.js` | served>0 assertions, templateMeta validation, new template property tests, domain set validation |
| `docs/patterns/01–06-*.md` | Created (6 files) |
| `AGENTS.md` | Sprint history updated; §21 updated to Sprint 30 |
| `docs/simmodlr_Build_Plan.md` | Changelog v1.68; sprint history row added |
| `docs/reviews/sprint-30-closure-report.md` | This file |
