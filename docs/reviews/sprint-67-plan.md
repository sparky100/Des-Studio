# Sprint 67 Plan — Plain-English UX & Results Clarity

**Sprint:** 67
**Theme:** Plain-English presentation, clearer decision-making, and Results workspace layout refinement
**Date planned:** 2026-05-19
**Branch:** `main`

---

## Objectives

1. Make advanced modelling and analysis features easier to understand without removing expert capability
2. Reframe the Run and Results surfaces around user questions instead of engine/statistics jargon
3. Improve information hierarchy so modellers can see outcome, confidence, and next action faster

---

## Scope

| # | Item | Area | Files |
|---|------|------|-------|
| 67-1 | Standardize navigation terminology: `Run`, `Results`, `Run History`, plain-English button labels | Model shell | `ModelDetail.jsx`, `ModelTabBar.jsx`, `ModelHealthPanel.jsx` |
| 67-2 | Rewrite Model Health status copy and issue chips to lead with consequence before codes | Model shell | `ModelHealthPanel.jsx`, `ModelDetail.jsx` |
| 67-3 | Rewrite Run setup labels/helper text using plain-English first + technical detail second | Execute Panel | `execute/ExperimentControls.jsx`, `execute/index.jsx` |
| 67-4 | Reorganize Results workspace to lead with summary, then confidence, then bottlenecks, then detailed charts/raw data | Results | `results/ResultsWorkspace.jsx`, `results/resultsViewModel.js` |
| 67-5 | Rewrite Results terminology for reliability and provenance in plain English | Results | `results/ResultsWorkspace.jsx` |
| 67-6 | Simplify Model Data / Data Sources wording; move raw formats into progressive disclosure where possible | Model Data | `ModelDetail.jsx` |
| 67-7 | Rewrite Run History labels and summaries in outcome-focused language | History | `ModelHistoryTab.jsx` |
| 67-8 | Refresh editor empty states and inline help to teach the next step instead of assuming DES jargon | Editors | `editors/*.jsx` (targeted copy-only changes) |
| 67-9 | Add focused regression coverage for renamed labels, new Results layout order, and advanced-help disclosure behaviour | Tests | `tests/ui/**/*` |

---

## Detailed design

### 67-1: Navigation terminology

Standardize user-facing names across the app:

| Current | Target |
|---------|--------|
| Execute | Run |
| Analysis | Results |
| History | Run History |
| Open Execute | Open Run |
| Open Analysis | Open Results |

**Rule:** If a destination shows current or saved simulation outputs, the top-level user-facing label is **Results**, not **Analysis**. If a destination is the experiment control surface, the top-level label is **Run**, not **Execute**.

### 67-2: Model Health rewrite

Model Health should answer:
1. Can I run this?
2. If not, why not?
3. Where do I go next?

**Required wording pattern:**
- Primary status in plain English
- Short consequence sentence
- Technical code and validation category as secondary detail

Examples:
- `Needs fixes before it can run`
- `Ready to run, but 2 things are worth checking`
- `No major issues were found`

### 67-3: Run setup rewrite

Run setup labels must be understandable without prior knowledge of simulation statistics.

**Required replacements:**
- `Warm-up period` → `Ignore early results`
- `Replications` → `Number of runs`
- `Seed` → `Random starting point`
- `Termination mode` → `When should the run stop?`
- `Time-based` → `After a fixed duration`
- `Condition-based` → `When a rule becomes true`
- `Collect time-series` → `Keep chart data during the run`

Each major setting gets one short helper sentence explaining when to use it.

### 67-4: Results workspace layout

The Results workspace must be reordered to answer the user’s questions in this sequence:

1. **Results summary** — what happened?
2. **How reliable are these results?** — can I trust this?
3. **Where are the bottlenecks?** — where are the delays or pressure points?
4. **Detailed charts** — supporting visuals
5. **Numbers behind the charts** — raw previews and export affordances

**Important:** The current statistical machinery stays intact. This sprint changes presentation order, grouping, headings, and explanatory copy, not the underlying calculations.

### 67-5: Results language rewrite

Replace method-led phrases with decision-led phrasing:

| Current | Target |
|---------|--------|
| Statistical analysis | How reliable are these results? |
| Batch-means confidence intervals | Estimated range for the true result |
| replication means | results from repeated runs |
| deviates from normality | repeated runs are uneven; use more runs before making decisions |
| Data: | Source: |
| View chart data | See the numbers behind this chart |
| View wait samples | See the waiting times behind this chart |

### 67-6: Model Data / Data Sources wording

Data-source setup should explain intent first and raw mechanics second.

**Required changes:**
- `Simulation start (epoch)` → `Real-world start date and time`
- `Target B-event ID` → `Arrival event to populate`
- `Time field (dot path)` → `Time field in the incoming data`
- `Attribute map (JSON...)` → `Match incoming fields to model fields`

Where raw JSON examples are still needed, place them behind an expandable advanced-help pattern rather than in the primary label.

### 67-7: Run History rewrite

Run History should read as a summary of outcomes, not as an export table first.

**Required copy changes:**
- `RUN HISTORY (LAST 20)` → `Recent runs`
- `Export History` → `Export run list`
- `Archive selected` → `Hide selected runs`
- `Renege rate` → `Left before service`
- `Avg wait` → `Average wait`

### 67-8: Editor empty states and help

Empty states should tell the modeller what to do next in plain English.

Examples:
- `No B-events.` → `No timed events yet. Add one to schedule something that happens at a specific time.`
- `No performance goals set...` → `No targets set yet. Add a target if you want the tool to judge whether results are good enough.`

Technical references such as `C-event`, `attr`, or `goal-aware AI analysis` should only appear after a plain-English explanation or in secondary help text.

### 67-9: Regression coverage

Add focused UI tests for:
- standardized navigation labels
- Model Health copy and issue-chip format
- Run setup helper text presence
- Results layout ordering and new section headings
- advanced/help disclosure behaviour in Model Data where added

---

## Acceptance criteria

| # | Criterion |
|---|-----------|
| AC-1 | Top-level navigation uses `Run`, `Results`, and `Run History` consistently |
| AC-2 | Model Health leads with plain-English consequence text before technical codes |
| AC-3 | Run setup labels and helper text can be understood without prior DES/statistics knowledge |
| AC-4 | Results page shows summary before reliability/method detail |
| AC-5 | Reliability section heading is plain-English and includes a clear next-step message |
| AC-6 | Data-source labels explain intent before raw technical format |
| AC-7 | Run History labels emphasize outcomes rather than internal terminology |
| AC-8 | Empty states in targeted editors teach the next user action |
| AC-9 | Advanced users can still access the underlying technical terms, codes, and formats |
| AC-10 | Focused UI tests pass for the renamed labels and revised layout structure |

---

## Files to change

| File | Change |
|------|--------|
| `src/ui/ModelDetail.jsx` | Navigation label updates; Model Data / Data Sources copy rewrite; advanced disclosure where appropriate |
| `src/ui/ModelTabBar.jsx` | Standardized top-level and sub-tab wording; issue tooltip phrasing |
| `src/ui/ModelHealthPanel.jsx` | Status rewrite; issue-chip wording; action-button labels |
| `src/ui/execute/ExperimentControls.jsx` | Run setup copy rewrite; helper text; warm-up recommendation wording |
| `src/ui/execute/index.jsx` | Summary-chip wording; any Run/Results terminology updates |
| `src/ui/results/ResultsWorkspace.jsx` | Results layout reorder; section heading rewrite; reliability copy; provenance/data preview wording |
| `src/ui/results/resultsViewModel.js` | Any supporting question-led titles or empty-state copy |
| `src/ui/ModelHistoryTab.jsx` | Run History wording updates and summary-card relabeling |
| `src/ui/editors/*.jsx` | Targeted empty-state/help-text rewrites |
| `tests/ui/**/*` | Focused regression tests for labels and layout order |
| `docs/DES_Studio_Product_Spec.md` | Product requirements for plain-English-first UI and Results presentation order |
| `docs/sprint-67-plain-language-ux-guide.md` | User-facing guide for the planned wording/layout changes |

---

## Out of scope

- New analysis algorithms or new statistical methods
- New engine features or model-schema changes
- Full visual redesign / re-theming / new design system
- New onboarding flows or tutorials beyond copy/layout adjustments
- Rewriting working editor components from scratch

---

## Exit gate

- Focused UI tests pass for the touched surfaces.
- Browser smoke check confirms the new wording is consistent across desktop and tablet layouts.
- Advanced technical detail remains accessible where needed.
- No capability is removed while simplifying wording.
- User-facing docs and product spec are updated to reflect the new interaction standard.

---

## Current checkpoint

- Sprint 67 documentation package created: plan, closure template, capability guide, AGENTS tracking, build-plan entry, and product-spec requirements.
- Baseline verification complete: the pre-implementation branch is confirmed green after a full regression pass.
- No Sprint 67 UX/code changes are marked delivered yet; this remains a planned sprint until the UI work is implemented and re-verified.
