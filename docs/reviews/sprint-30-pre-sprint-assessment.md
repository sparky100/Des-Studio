# Sprint 30 Pre-Sprint Assessment — Inventory Report

**Branch:** `claude/sprint-28-inventory-BDYGg`
**Date:** 2026-05-14
**Constraint:** Assessment only — no implementation code.

---

## Area 1 — Template and Model Library

### 1a. Template inventory

All 10 templates are defined as a static JavaScript array in `src/engine/templates.js` (lines 1–293).
They are never stored in Supabase — they are code-only. The `TEMPLATES` export has no metadata
fields beyond `id`, `name`, and an inline `description` string.

| # | Name | Domain | Scenario type | File / lines |
|---|---|---|---|---|
| 1 | M/M/1 Queue | Academic / Benchmark | Single-server queue | `src/engine/templates.js` 3–22 |
| 2 | Call Center | Service Systems | Multi-server + abandonment (RENEGE) | lines 24–49 |
| 3 | ER Triage | Healthcare | Two-stage priority queue | lines 51–80 |
| 4 | Fast Food Drive-Through | Service Systems | Three-stage sequential routing | lines 82–114 |
| 5 | Factory Assembly | Manufacturing | Batching / single-stage assembly line | lines 116–136 |
| 6 | Airport Security | Service Systems | Two-stage finite queue + balking | lines 138–167 |
| 7 | Construction Logistics | Manufacturing / Logistics | Two-stage RELEASE routing + state vars | lines 169–201 |
| 8 | Data Center | Technology / Benchmark | Large resource pool | lines 203–223 |
| 9 | Outpatient Clinic | Healthcare | Two-stage clinic with RELEASE | lines 225–254 |
| 10 | Warehouse Picking | Manufacturing / Logistics | Batch-then-process pipeline | lines 256–280 |

### 1b. Per-template documentation fields

No template has a `paramGuide`, `limitations`, or `domainTag` field. Each has only an inline
`description` string (one or two sentences). Human-readable narrative exists in two external
documents (`docs/Template Models Guide.md` and `docs/simmodlr_Template_Models.md`) but is not
surfaced in the UI.

| Name | Has description? | Has param guide? | Has limitations note? | Has domain tag? |
|---|---|---|---|---|
| M/M/1 Queue | Yes (inline string) | No | No | No |
| Call Center | Yes | No | No | No |
| ER Triage | Yes | No | No | No |
| Fast Food Drive-Through | Yes | No | No | No |
| Factory Assembly | Yes | No | No | No |
| Airport Security | Yes | No | No | No |
| Construction Logistics | Yes | No | No | No |
| Data Center | Yes | No | No | No |
| Outpatient Clinic | Yes | No | No | No |
| Warehouse Picking | Yes | No | No | No |

### 1c. Template identity flag

**PARTIAL.** Templates are not distinguished from user models in the database. There is no
`is_template`, `visibility: "template"`, or equivalent DB column in `des_models`. The `TEMPLATES`
export in `src/engine/templates.js` is a static JavaScript array — templates never enter Supabase
as templates. The only flag is a transient React state variable `isTemplate` at `src/App.jsx`
line 150, meaning "opened from template, auto-run on open." It is not persisted and disappears
after the model is copied to the user's account.

### 1d. UX flow for finding and using a template

1. User opens the app → sees `"Templates (10)"` tab in the Model Library (`src/App.jsx` lines 570–594).
2. Template cards render as a flat grid: name, two-line truncated description, and a "▶ Start from template" label.
3. Clicking a card calls `handleStartTemplate()` (lines 309–332):
   - Saves a private copy via Supabase with `visibility = "private"`.
   - Sets transient `isTemplate = true` React state.
   - Opens `ModelDetail` with `initialTab = "execute"` and `autoRun: true` — the template runs
     automatically on open.
4. No domain grouping, no tag filter, no search, no model structure preview before copying.
5. The `StarterGuide` modal (`src/ui/ModelDetail.jsx` lines 1260–1303) is a separate entry point
   shown when a brand-new blank model is opened. It presents three choices (Visual Designer, AI
   Designer, Browse Templates) and is triggered by `App.jsx` line 619 only when a model is
   created via the "New Model" button — not when opening a template.

### 1e. Domain-specific groupings

**ABSENT.** No domain grouping exists in the template tab, in the template object definitions,
or in any DB column. Templates render as a flat unsorted list.

---

## Area 2 — Existing Onboarding Flows

### 2a. F5.8 First-run onboarding

**PARTIAL.** The `FirstRunPanel` component renders at `src/App.jsx` lines 117–128 when
`myModels.length === 0`. It shows two buttons: "Use a Template" and "Create a Model". This is a
minimal CTA prompt — not a guided tour, step-by-step walkthrough, or capability introduction.

The `StarterGuide` modal at `src/ui/ModelDetail.jsx` lines 1260–1303 shows when a new blank model
is opened (detected by `isStarterBlankModel()` at line 178), presenting three paths. It is
triggered automatically from `App.jsx` line 619 only when the "New Model" flow is used with
`canEdit = true`. Not shown when opening a template or existing model.

### 2b. "What can I model?" / capability guide in UI

**ABSENT.** No in-app component exists. Two capability guide documents exist as engineering docs
(`docs/reviews/sprint-26-capability-guide.md`, `docs/reviews/sprint-27-capability-guide.md`) but
are not surfaced in the UI.

### 2c. Modelling Guide / help panel / documentation tab

**ABSENT.** Searching `src/ui/` for "help", "guide", "documentation" returns no matching
components. The `ModelDetail.jsx` tab list (lines 611–625) has no Help or Guide tab. The user
guide exists at `docs/simmodlr_User_Guide.md` but is not linked from the UI.

### 2d. Tutorial / walkthrough flows

**ABSENT.** The `StarterGuide` modal is a choice-of-path prompt, not a step-by-step tutorial.
No guided walkthrough, interactive tutorial, or worked example flow exists in the application.

---

## Area 3 — Pattern and Scenario Documentation

### 3a. docs/patterns/ directory

**ABSENT.** The directory does not exist.

### 3b. In-app documentation mapping modelling intent to engine constructs

**ABSENT** as an in-app feature. `docs/Template Models Guide.md` (lines 1–185) covers all 10
templates with a macro quick reference and is the closest existing asset, but it is not surfaced
in the UI.

### 3c. Template authoring guide / contributor documentation

**ABSENT.** No `CONTRIBUTING.md`, no template authoring guide, no documentation in
`src/engine/templates.js` explaining how to add a new template.

**Existing documentation assets** that would feed Sprint 30:
- `docs/Template Models Guide.md` — human-readable guide + macro quick reference for all 10 templates
- `docs/simmodlr_Template_Models.md` — technical audit with flow diagrams and issue notes
- `docs/reviews/sprint-26-capability-guide.md` — modelling patterns for resource/waiting semantics
- `docs/reviews/sprint-27-capability-guide.md` — debugging/explainability workflow
- `docs/examples/sprint-26/` — two sample JSON models (`priority-handoff-demo.json`, `recirculation-exit-demo.json`)

---

## Area 4 — Domain Coverage of Existing Templates

| Scenario | Status | Note |
|---|---|---|
| **Healthcare: ED triage** | **EXISTS** | ER Triage template. Two-stage priority queue. The only fully working template. Functionally correct. |
| **Healthcare: Outpatient clinic** | **PARTIAL** | Outpatient Clinic template exists. Model structure is valid. Broken at runtime — see critical defect below (served = 0). |
| **Healthcare: Ward/bed admission** | **ABSENT** | No template. No finite-bed capacity / admission / discharge / bed-blocking flow. |
| **Service Systems: Call centre** | **PARTIAL** | Call Center template exists. Structural defect — served = 0, all entities reneged immediately due to runtime bug. |
| **Service Systems: Bank branch / multi-channel** | **ABSENT** | No template for multi-channel service (walk-in + phone + online queues feeding shared agents). |
| **Service Systems: Checkout / retail queue** | **ABSENT** | Fast Food Drive-Through is adjacent but is a sequential routing model, not parallel checkout lanes. Specialist retail scenario absent. |
| **Manufacturing / Logistics: Production line** | **PARTIAL** | Factory Assembly covers batching on a single-stage line. ARRIVE queue name mismatch means served = 0. No multi-stage WIP buffer routing. |
| **Manufacturing / Logistics: Warehouse / order picking** | **PARTIAL** | Warehouse Picking template exists. ARRIVE queue name mismatch means served = 0. |
| **Manufacturing / Logistics: Port / berth / transport** | **ABSENT** | Construction Logistics is the closest (truck loading/weighing) but does not model vessel arrival or port berth capacity. |

**Summary: 1 EXISTS (fully functional), 4 PARTIAL (structurally present, runtime broken or incomplete), 4 ABSENT.**

---

## Area 5 — Template Quality Audit

### 5a–5b. Headless engine run results

All 10 templates were run headlessly using `buildEngine(template.model, 42, 0, 100).runAll()`.

| Name | Served | Utilisation | Runs cleanly? | Root cause if broken |
|---|---|---|---|---|
| M/M/1 Queue | 0 | 0% | **NO** | ARRIVE queue name mismatch |
| Call Center | 0 | 0% (298/308 reneged) | **NO** | ARRIVE queue name mismatch |
| ER Triage | 23 of 56 arrived | > 0% | **YES** | Uses two-arg `ARRIVE(Patient, Patient)` — correct |
| Fast Food Drive-Through | 0 | 0% | **NO** | ARRIVE queue name mismatch |
| Factory Assembly | 0 | 0% | **NO** | ARRIVE queue name mismatch |
| Airport Security | 0 | 0% | **NO** | ARRIVE queue name mismatch |
| Construction Logistics | 0 | 0% | **NO** | ARRIVE queue name mismatch |
| Data Center | 0 | 0% | **NO** | ARRIVE queue name mismatch |
| Outpatient Clinic | 0 | 0% | **NO** | ARRIVE queue name mismatch |
| Warehouse Picking | 0 | 0% | **NO** | ARRIVE queue name mismatch |

**Critical defect — ARRIVE queue name mismatch (9 of 10 templates):**

`src/engine/macros.js` line 156:
```
const queueName = match[2]?.trim() || (typeName + "Queue");
```
When called as `ARRIVE(Customer)` (one argument), the macro derives queue name `"CustomerQueue"`.
However the registered queue in each template is named `"Customer"` (or the entity type name
without the "Queue" suffix). Entities land in an unregistered slot `"CustomerQueue"` while the
C-event condition `queue(Customer).length > 0` resolves against the registered queue `"Customer"`
— which always has zero entities. The C-event never fires. ER Triage is the only working template
because it uses two-arg `ARRIVE(Patient, Patient)`, explicitly naming the queue to match the
registered queue definition.

The fix is mechanical: change every single-arg `ARRIVE(Type)` call in `src/engine/templates.js`
to `ARRIVE(Type, QueueName)` where `QueueName` matches the registered queue name.

### 5c. Test coverage

`tests/engine/templates.test.js` (38 tests, all passing) checks:
- Templates run without crashing ✓
- Same seed produces identical results ✓

It does **NOT** assert `summary.served > 0` or `summary.utilisation > 0`. The 9 silent failures
are completely invisible to the current CI gate. A `served > 0` assertion per template would
have caught this.

---

## Area 6 — UI Component Inventory

### 6a. Template browser / gallery component

**EXISTS (basic).** The `"Templates"` tab in `src/App.jsx` (lines 570–594) renders all 10
templates as a flat card grid. Each card shows name, truncated description, and a start button.
No domain grouping, no filter, no sort, no preview of model structure before copying.

### 6b. Domain filter / tag filter on model list

**ABSENT.** The templates tab renders a flat list with no filter controls. The `tags` DB column
was added in Sprint 19 and is used for community models, but template objects in
`src/engine/templates.js` have no `domain` or `tags` field and the templates tab has no filter UI.

### 6c. Search bar on model library

**ABSENT.** No search input exists in `src/App.jsx`. All model list tabs (My Models, Public,
Community, Templates) are rendered without search capability.

### 6d. Import / export mechanism

**EXISTS (both directions).**
- Import: file-picker button "Import Model" at `src/App.jsx` lines 497–506; validates against
  `validateModel()` before saving.
- Export: `downloadJsonFile()` at `src/ui/ModelDetail.jsx` line 61; triggered by export action
  at line 425.

---

## Section 1: Template Inventory Table (consolidated)

| Name | Domain | Scenario type | Storage location | Has description? | Has param guide? | Has limitations? | Has domain tag? | Runs cleanly? |
|---|---|---|---|---|---|---|---|---|
| M/M/1 Queue | Academic | Single-server queue | `src/engine/templates.js` L3–22 | Yes | No | No | No | **NO** |
| Call Center | Service Systems | Multi-server + abandonment | L24–49 | Yes | No | No | No | **NO** |
| ER Triage | Healthcare | Two-stage priority queue | L51–80 | Yes | No | No | No | **YES** |
| Fast Food Drive-Through | Service Systems | Three-stage sequential routing | L82–114 | Yes | No | No | No | **NO** |
| Factory Assembly | Manufacturing | Batching / assembly line | L116–136 | Yes | No | No | No | **NO** |
| Airport Security | Service Systems | Two-stage finite queue + balking | L138–167 | Yes | No | No | No | **NO** |
| Construction Logistics | Mfg / Logistics | Two-stage RELEASE + state vars | L169–201 | Yes | No | No | No | **NO** |
| Data Center | Technology | Large resource pool | L203–223 | Yes | No | No | No | **NO** |
| Outpatient Clinic | Healthcare | Two-stage clinic with RELEASE | L225–254 | Yes | No | No | No | **NO** |
| Warehouse Picking | Mfg / Logistics | Batch-then-process pipeline | L256–280 | Yes | No | No | No | **NO** |

---

## Section 2: Domain Coverage Gaps

| Scenario | Status | Note |
|---|---|---|
| Healthcare: ED triage | **EXISTS** | ER Triage — fully working |
| Healthcare: Outpatient clinic | **PARTIAL** | Structure valid; ARRIVE bug makes served = 0 |
| Healthcare: Ward/bed admission | **ABSENT** | No template |
| Service Systems: Call centre | **PARTIAL** | Structure valid; ARRIVE bug makes served = 0 |
| Service Systems: Bank branch / multi-channel | **ABSENT** | No template |
| Service Systems: Checkout / retail queue | **ABSENT** | No template |
| Manufacturing: Production line | **PARTIAL** | Factory Assembly; ARRIVE bug makes served = 0 |
| Manufacturing: Warehouse / order picking | **PARTIAL** | Warehouse Picking; ARRIVE bug makes served = 0 |
| Logistics: Port / berth / transport | **ABSENT** | No template |

---

## Section 3: Onboarding and Documentation State

| Area | Status | Detail |
|---|---|---|
| First-run onboarding (F5.8) | PARTIAL | `FirstRunPanel` in `App.jsx` shows two CTA buttons. `StarterGuide` modal in `ModelDetail.jsx` shows three path choices. Neither is a guided walkthrough. |
| "What can I model?" / capability guide | ABSENT | No in-app component. Capability guide docs exist as engineering documents only. |
| Modelling Guide / help panel | ABSENT | No Help or Guide tab in ModelDetail. User guide at `docs/simmodlr_User_Guide.md` not linked from UI. |
| Tutorial / walkthrough flows | ABSENT | No step-by-step tutorial or worked example flow exists. |
| docs/patterns/ directory | ABSENT | Directory does not exist. |
| In-app modelling intent mapping | ABSENT | `docs/Template Models Guide.md` is the closest asset but is not surfaced in the UI. |
| Template authoring guide | ABSENT | No contributor documentation for adding new templates. |

---

## Section 4: Feature Scope Adjustments

| Feature | Status given assessment | Revised action |
|---|---|---|
| **F30.1 Template library** | **EXTEND** — 10 templates exist; 9 of 10 are silently broken | **Priority 0 blocker:** Fix ARRIVE queue name mismatch in all 9 broken templates (`src/engine/templates.js`). Add `served > 0` regression assertion per template in `tests/engine/templates.test.js`. Add `templateMeta` schema (`domain`, `scenarioType`, `keyMacros`, `paramGuide`, `limitations`) and populate for all 10 templates. |
| **F30.2 Healthcare domain pack** | **PARTIAL → EXTEND** — ED Triage works; Outpatient Clinic needs ARRIVE fix | Fix Outpatient Clinic ARRIVE syntax. Add Ward/Bed Admission as a new template (finite-capacity beds, RELEASE on discharge, bed-blocking scenario). 2 of 3 planned healthcare templates need work. |
| **F30.3 Service systems domain pack** | **PARTIAL → BUILD** — Call Center structurally exists but broken; Bank Branch and Retail Checkout absent | Fix Call Center ARRIVE syntax. Build Bank Branch (multi-channel: walk-in + phone queues, shared agents). Build Checkout / Retail (parallel lanes, queue-join routing). 3 of 3 need some level of work. |
| **F30.4 Manufacturing / logistics domain pack** | **PARTIAL → BUILD** — Warehouse Picking and Factory Assembly structurally exist but broken; Port/Berth absent | Fix Factory Assembly and Warehouse Picking ARRIVE syntax. Add Port/Berth template (vessel arrivals, berth capacity, unloading, congestion). Construction Logistics (currently broken) becomes the fourth after fixing. 3 of 4 need work. |
| **F30.5 Onboarding / capability guide** | **ABSENT → BUILD** | No in-app "what can I model?" surface. No capability discovery panel. StarterGuide modal is a path-choice prompt, not a guide. Sprint 30 should build a lightweight Modelling Patterns overlay accessible from the template gallery, and an improved first-run flow that presents domain scenarios. |
| **F30.6 Documentation standard** | **PARTIAL → EXTEND** | Template descriptions exist as plain strings. Define and populate a `templateMeta` schema for all templates. Add a domain filter and search bar to the template gallery UI. |
| **F30.7 Pattern documentation** | **ABSENT → BUILD** | No `docs/patterns/` directory. No modelling intent–to–engine mapping available to users. Create `docs/patterns/README.md` and individual pattern files (single-queue-service, multi-stage-RELEASE, batching-assembly, reneging-abandonment, finite-capacity-balking, priority-queue). Mirror the sprint capability guide format from Sprint 26/27. |

---

## Assessment Verdict

Sprint 30 has an unexpected P0 blocker: **9 of 10 existing templates are silently broken**
(served = 0, utilisation = 0%) due to a queue name mismatch in the ARRIVE macro. This defect
has been invisible to CI because the template tests assert crash-freedom and seed determinism
but not non-zero output. The fix is mechanical but must happen before any new templates are added
or the template gallery is promoted to users.

Beyond the defect fix, Sprint 30 has a clear, bounded scope:
- Fix 9 templates + add regression assertions (P0)
- Add 3 new templates (Ward/Bed, Bank Branch, Port/Berth) to fill the 3 ABSENT domain gaps
- Add `templateMeta` schema and populate for all 13 templates
- Add domain filter + search to template gallery UI
- Build lightweight in-app capability / pattern guide
- Create `docs/patterns/` directory with 6 initial pattern files
