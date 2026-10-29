# User guide and in-app help audit — 2026-10-29

Scope: `docs/DES_Studio_User_Guide.md`, `docs/help-reference.md` (the in-app Help Assistant's knowledge base, loaded by `src/llm/help-assistant-prompt.js`), `docs/quick-start-guide.md` and `mcp/README.md`, checked against the app at `a4834a3` (PR #613). The last full docs sync was PR #545; since then about 70 PRs changed what users see. Some (Pause when…, docked inspector, Sections) had been patched into the user guide piecemeal; the help reference had none of the October work.

Status column: **Fixed** in this PR, or **Not changed** with the reason.

## A. Bug found while auditing

| # | Finding | Status |
|---|---------|--------|
| A1 | The **Evidence** tab had no button on the desktop Design bar. `ModelTabBar`'s `DEFINE_TAB_IDS` did not include `evidence`, so after #612 it only showed on phones; on desktop it was reachable only from the Draw inspector's "Open in Evidence tab" link, and once there the Define bar disappeared. | Fixed (added to the Define sub-bar with an icon; `tests/ui/model-tab-bar-evidence.test.jsx`) |

## B. User guide

| # | Where | Problem | Status |
|---|-------|---------|--------|
| B1 | Top of file | A "Publishing a model" block sat above the title and version header; version 7.9.0 / 2026-08-27 / Sprint 89 baseline | Fixed: header updated, publishing moved to §4.11 |
| B2 | Throughout | Product called "simmodlr"; the app, prompt pack, MCP and About box say Flow | Fixed (Flow, with a note on the older names) |
| B3 | §1 table | "⬇ SimPy button in the header" — there is no header button; SimPy is Access → Export SimPy | Fixed |
| B4 | §1, §4.6 | Results sharing offered "QR code" and "Embed widget" — neither exists in the UI (`share/qr.js` is unused) | Fixed: only the run share link is described |
| B5 | §1 glossary (CI) | Said ANOVA/Tukey are "not yet exposed in the UI" — Named Scenarios uses them for 3+ groups | Fixed |
| B6 | §3 Quick start | "Browse Templates (top-right)", template "Single Queue — M/M/1", "Open a copy", a "Run" button, "Results tab opens automatically", "Run History → Compare" — none match | Fixed (Templates tab, M/M/1 Queue card, Step / Auto Run / ⚡ Batch Run, View Results →, Results → History → Compare selected) |
| B7 | §4.0 | Prompt pack file is `flow-ai-prompt-pack.md`, not `simmodlr-ai-prompt-pack.md`; no mention of Connect AI app | Fixed |
| B8 | §4.1 | Tags "set in the model's settings panel" — they are added on library cards (+ tag); header buttons (Explore published, Connect AI app) missing | Fixed |
| B9 | §4.2 | New Model dialog described as name + Create; it now offers Model assistant / Draw / Use a template / Import a file / Paste model | Fixed |
| B10 | §4.2 | Goals "set on the Overview tab" — they are Define → Goals; Define table missing Sections, Goals, Evidence and out of order; "all 55 validation rules" | Fixed |
| B11 | §4.3 | Describe flow described as Generate / Apply / Refine; it is a conversation with confirm, Review proposal, Apply model / Apply & Save / Apply Selected / Refine this / Discard | Fixed |
| B12 | §4.4 | Run settings named Replications / Max sim time / Termination condition / Seed / Purge period; UI says Number of runs / Run for / When should the run stop? / Random starting point / Let in-flight entities complete; Archive detail, Check Model, ⚙ Setup missing | Fixed |
| B13 | §4.4 | Steps 5 and 6 both "Open the ✦ AI sidebar", one orphaned; button is "✨ Simulation Assistant" | Fixed |
| B14 | §4.4 | Batch Run "takes you straight to results" — it shows a summary on Run; Results opens via View Results → | Fixed |
| B15 | §4.5 | "Run tab → Parametric Sweep" — sweeps are Run → Studies with 1D / 2D / Sampled / Sequential; Experiments and saved studies not described | Fixed |
| B16 | §4.7 | Bottom panel tabs listed as Log / Entities / Charts / Stage KPIs; actual: Step Log, Entity Details, Resources, Charts, Live Metrics, State Variables, Future Events | Fixed |
| B17 | §4.7 | Run tier limits "Pro up to 100"; defaults are Free 10, Standard 30, Pro 500, and the Pro plan maps to the Standard tier by default | Fixed |
| B18 | §4.7 | Skills "State tab (under Design)" — Define → Model Data | Fixed |
| B19 | §4.7 | Duplicate "Validation" paragraph (V-SKILL-1..3 and 1..4) | Fixed (kept the complete one) |
| B20 | §4.7 Sections | "Sections tab (under the Design area)"; "mark queues IN / OUT" — there are no IN/OUT markers | Fixed: rewritten as §4.13 |
| B21 | §4.7 Optimise | Only said "inside the sidebar"; it is in Design, Run and Results | Fixed |
| B22 | §4.8 | "No UI control exists" for full event logs — Run setup → Archive detail → Full | Fixed |
| B23 | §5.1 | "38 pre-run validation rules" | Fixed (no count) |
| B24 | §5.3 | "Switch to Forms/Tabs", "Refine input in the AI panel" | Fixed |
| B25 | Glossary | Macro list "full set of 25" missed DRAIN_PARTIAL | Fixed |
| B26 | Missing | Publishing, Explore published gallery and public page | Fixed: §4.11 |
| B27 | Missing | Evidence tab (Evidence, Assumptions, Coverage), Draw Evidence block and link, Model Health V-BACK warnings, reports, Describe and MCP behaviour | Fixed: §4.12 |
| B28 | Missing | Connect AI app / Flow MCP 0.6, including flow_record_evidence | Fixed: §4.14 |
| B29 | Missing | Run views (Run / Experiments / Studies), Switches readout, section cards in the inspector, Results views (Summary / Log / Entities / History), View definition, Undo/Redo | Fixed |
| B30 | Terms | "Execute canvas / Execute panel / Run History" mixed with "Run" | Fixed (Run canvas, Run tab, Results → History) |

## C. In-app help (help-reference.md)

| # | Problem | Status |
|---|---------|--------|
| C1 | Last updated 2026-08-31; nothing on publishing, Explore published, Evidence, Pause when…, docked Run inspector, Sections, Connect AI app / MCP | Fixed: new sections, plus a "Where Things Are" map of every tab and button |
| C2 | Validation tables missing V71–V75, V82 and V-BACK-01..05; V70 out of order | Fixed |
| C3 | "All 24 effect macros" (there are 26); "All 12 distribution types" (SchedulePattern and Piecewise cycleLength undocumented) | Fixed |
| C4 | Purge period described as a timed queue purge Bound event — it is the run-down after the run length ("Let in-flight entities complete") | Fixed |
| C5 | Run setup labels, Archive detail, bottom panel tabs, Studies modes, Experiments | Fixed |
| C6 | Optimise "visible in Results mode only", "starts with 5 replications", plan table Pro 100 | Fixed (Design/Run/Results, 10, tier table incl. Published) |
| C7 | Simulation Assistant opened with "✦ AI"; Run tab described as a "Diagnostics panel" | Fixed (✨ Simulation Assistant; Design / Diagnose / Debug) |
| C8 | New Model dialog lists "Describe"; Visual Designer "Visual sub-tab" | Fixed (Model assistant; Draw) |
| C9 | SimPy "⬇ SimPy in the model header" | Fixed |
| C10 | Share link "Run History → Share"; model export "toolbar → Export Model" | Fixed |
| C11 | Shortest-queue "Gotcha" said a state variable on the right-hand side is a literal, contradicting the Conditional Events section (state variables are read dynamically) | Fixed |
| C12 | Versions: "Diff" | Fixed (Compare to current, restore) |
| C13 | Size: grows from 113 KB to about 137 KB, i.e. roughly 6k more tokens in every Help Assistant call | Not changed; worth trimming the Sprint-era detail (e.g. V50–V60 prose, SimPy internals) in a later pass if cost matters |

## D. Other files

| # | File | Problem | Status |
|---|------|---------|--------|
| D1 | quick-start-guide.md | simmodlr naming, "Click Run", "Report button", four ways to build (no MCP), nothing on evidence, sections or publishing | Fixed |
| D2 | mcp/README.md | Tools table missing flow_evidence_coverage and flow_record_evidence | Fixed |
| D3 | quick-start-guide.docx, capabilities-overview.* | Generated or older copies; not regenerated here | Not changed (regenerate with `scripts/generate-docs.cjs` when wanted) |
| D4 | docs/help-knowledge-base.json | Dated 2026-06-04 and not loaded by any code | Not changed; candidate for deletion |
| D5 | AGENTS.md | Points at `docs/simmodlr_User_Guide.md`, which does not exist (the file is `DES_Studio_User_Guide.md`) | Not changed; flag for whoever owns AGENTS.md |
