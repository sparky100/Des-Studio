# simmodlr — Product Next Steps

**Date:** 2026-05-08  
**Purpose:** Strategic recommendations for turning simmodlr from a capable prototype into a differentiated product.

---

## Core Strategy: Don't Compete Head-On

Do not try to beat AnyLogic, Simio, or Arena at their own game. They have 20+ year head starts, field validation across thousands of sites, and budgets that dwarf this project. Instead, lean into what makes simmodlr unique:

1. **Zero install, browser-based** — share a link, not an installer
2. **AI-native** — natural language model authoring + run analysis
3. **Three authoring modes** — meet modellers where they are
4. **Clean, auditable engine** — seeded, deterministic, safe

The winning niche: **rapid prototyping + AI-assisted simulation design**, targeted at analysts who find AnyLogic too heavy and spreadsheets too limited.

---

## Phase 1: Ship Sprint 12 (Immediate — 1 week)

Sprint 12 (entity batching + recirculation) closes the last modelling vocabulary gap for queueing-network work. Without it, models that need batch assembly or rework loops are impossible. This is table stakes.

**Do not start anything else until this ships.** Everything below assumes a complete modelling vocabulary.

---

## Phase 2: Differentiate (1–2 months)

### 1. Make AI the Hero Feature

The AI model authoring is what separates simmodlr from every other tool. Double down:

- **Chat-based model refinement.** Let users say "add a second server" and have the AI apply the change to their existing model, not just generate from scratch.
- **AI scenario suggestions.** After a run, AI should automatically suggest what to try next: "Your triage nurse is the bottleneck. Try adding a second nurse to reduce mean wait from 8.2 to ~4.5 minutes."
- **Natural language results queries.** "Which queue had the longest wait?" answered directly from the results object — no need to navigate tabs.

**Why this wins:** No competitor has this. Arena/Simio/AnyLogic users still manually interpret output and manually design experiments. simmodlr can offer an AI analyst that connects model → run → insight → next experiment in one loop.

### 2. Drop-in Prototyping — The Killer Use Case

Position simmodlr as the tool an analyst uses *before* deciding whether to build a full AnyLogic model:

- **Export to AnyLogic/Simio/Arena.** Export the canonical `model_json` as a report or intermediate format. This removes the fear of lock-in. "Prototype here; build the production model in your tool of choice."
- **Pre-built template gallery.** 5–10 curated templates (call center, ER triage, factory line, airport security, data center, fast food drive-through, warehouse picking, outpatient clinic, construction logistics, board game). Each template is a complete runnable model with default parameters.
- **30-second demo loop.** A new user should go from landing page → running a template → seeing results in under 30 seconds. Currently you need to create an account, create a model, configure B-Events, and hit run. That's too many steps.

**Why this wins:** Spreadsheet modellers currently build fragile Monte Carlo sims in Excel. simmodlr offers a purpose-built tool that is easier to start with than Arena and more powerful than Excel, with no installation friction.

### 3. One-Page Model Dashboard

Create a **shareable read-only view** of a model and its latest run results — like GitHub Pages for simulation models. No login required to view. This is the fastest way to share simulation results with stakeholders who don't care about modelling.

- Permalink: `desstudio.app/models/abc123/results`
- Shows: model topology (read-only Visual Designer), KPI summary, CI dashboard, time-series charts
- Optional: AI narrative commentary embedded below the results

**Why this wins:** AnyLogic and Simio can't produce a shareable web link to a single run's results. This is a genuine gap. Decision-makers want a URL, not a file attachment.

---

## Phase 3: Fill the Gaps That Matter (2–4 months)

### 4. Statistical Output Analyzer

The current stats layer (mean + 95% CI + percentiles) is too thin. Add these in order of impact:

1. **Warm-up detection** (Welch's graphical method) — automated truncation of initial transient
2. **Batch-means** — correct confidence intervals for autocorrelated output
3. **Scenario comparison** — side-by-side KPI table for multiple runs with paired-t or Bonferroni confidence intervals on differences

**Why this matters:** Professional simulation work requires statistical confidence that results are not artefacts of initial conditions or autocorrelation. Excel modellers don't know this; professional sim modellers won't trust a tool without it.

**Keep it practical:** Implement as a UI tab, not a statistics library. Offer sensible defaults with brief explanations ("Welch's method detected warm-up ends at t=47; first 47 time units excluded from CI calculation"). Do not require a statistics degree.

### 5. Parametric Sweep (Lightweight Optimizer)

Not a full OptQuest replacement. Start with:
- Select any numeric model parameter (count, capacity, rate, distribution mean)
- Define a range and step size
- Run all combinations; display a heatmap or trade-off chart of the chosen KPI

This is the single highest-ROI feature for real-world use. Most simulation projects are about "what if we had one more nurse" or "what if arrival rate increases by 20%." A parametric sweep answers that directly.

### 6. Model Import Toolkit

The fastest way to grow the user base is to reduce the cost of switching from Excel:
- CSV/Excel import: data columns → entity attributes, distributions fit automatically (Gap 2 from the gap analysis)
- Arena/Simio model import: extremely high value for academic users migrating from lab-licensed Arena

---

## Phase 4: Platform (3–6 months)

### 7. Templates & Community Sharing

- A Supabase-backed **public template gallery**. Users publish templates; other users fork and run.
- **Model cloning count** as a lightweight social proof metric
- Featured templates by the simmodlr team

### 8. Team Workspaces

- Organisation-scoped models (belong to a workspace, not an individual)
- Shared run history across team members
- Model comments and annotations on specific nodes/events

This is ADR-008's deferred SaaS tenancy. The key insight: you don't need full enterprise SSO or audit trails. You need "my team can see our models." Start there.

---

## What Not to Build

| Feature                        | Why Not                                                          |
| ------------------------------ | ---------------------------------------------------------------- |
| 3D visualization               | Entire product on its own. simmodlr should never compete here. |
| Custom scripting / plug-in API | Reintroduces security risk. Kills the "no code" promise.         |
| Mobile app                     | A DES model editor on a phone is a product mistake.              |
| Real-time animation syncing    | The current step-based execute canvas is fine for analysis.      |
| Enterprise SSO / SAML          | Premature. Reach product-market fit first.                       |

---

## Summary: The Pitch

> "simmodlr is to simulation modelling what Figma is to design — browser-native, collaborative, AI-assisted. Prototype a queueing model in 5 minutes, share the results with a URL, and export for production use in AnyLogic. No install, no license server, no learning curve."

The goal is not to replace AnyLogic. The goal is to **expand the market** to people who currently use Excel for stochastic modelling because the professional tools are too expensive, too complex, or too hard to share.

---

## Concrete Next Actions (Priority Order)

| #   | Action                                        | Effort  | Impact                                   |
| --- | --------------------------------------------- | ------- | ---------------------------------------- |
| 1   | Complete Sprint 12 (batching + recirculation) | 1 week  | Unlocks full queueing-network vocabulary |
| 2   | Chat-based model refinement (AI)              | 2 weeks | Killer differentiator                    |
| 3   | Template gallery (5 curated templates)        | 1 week  | 30-second demo loop                      |
| 4   | Shareable one-page results URL                | 1 week  | Stakeholder sharing                      |
| 5   | Warm-up detection (Welch)                     | 1 week  | Professional credibility                 |
| 6   | Parametric sweep                              | 2 weeks | Highest-ROI practical feature            |
| 7   | Scenario comparison with CI                   | 2 weeks | Decision-grade output                    |
| 8   | Model export (AnyLogic report)                | 1 week  | Removes lock-in fear                     |
| 9   | Template gallery publishing                   | 1 week  | Community growth                         |
| 10  | Team workspaces                               | 3 weeks | Collaboration                            |
