# simmodlr — Model Versioning Guide

**Version:** 1.13.0 (Sprint 68)  
**Audience:** Modellers using simmodlr for iterative model development

---

## Overview

Model versioning lets you tag the current state of a model as a named milestone. Unlike the auto-save that runs every time you click Save, a version is a deliberate checkpoint — a point you can look back at, compare against, and restore to.

There are three related but distinct capabilities in Sprint 68:

| Capability | What it does |
|---|---|
| **Named versions** | Manually tag a model state with a name and notes |
| **Scenario baseline** | Fork the model under a new name, linked back to the original |
| **Run snapshot diff** | See how the model looked at the time of any past run |

---

## Named Versions

### Creating a version

1. Open a model you own.
2. Click the **Versions** tab (visible to owners only).
3. Click **+ Create version**.
4. Give it a name (e.g., "v1 – Initial design") and optional notes.
5. simmodlr detects whether changes since the last version are **structural** (topology changed: entity types, events, queues) or **parameter-only** (distributions tweaked, server counts adjusted).
6. Click **Create Version**.

The version is saved with a full snapshot of the model at that moment.

### When to create a version

- Before making significant changes you might want to undo
- When you have a working baseline you want to preserve
- Before sharing the model with others for review
- At the end of a modelling session

**Tip:** You don't need to version every save — that's what the undo stack is for. Version when you've reached a meaningful milestone.

### Viewing version history

The Versions tab lists all tagged versions, newest first. Each row shows:
- Version number (`v1`, `v2`, …)
- Name (if set)
- Date created
- Whether the change was **structural** or **parameter-only**
- Notes (if set)

### Comparing a version to the current model

Click **Diff** on any version row to see a side-by-side comparison:
- What was **added** (green)
- What was **removed** (red)
- What was **modified** (amber)
- What is **unchanged** (count only)

The diff covers entity types, B-Events, C-Events, queues, and model data.

### Restoring a past version

Click **Restore** on any version row. Confirm the dialog. The version's model state is loaded into the editor and marked as modified — save manually if you want to persist it.

Restoring does not delete later versions. You can restore v2 even if v5 exists.

---

## Scenario Baseline

A scenario baseline is a fork of the current model, linked back to its origin so you can see where it came from.

**Use case:** You have a base hospital model and want to test three staffing configurations. Create a scenario baseline for each one — they stay linked to the original so you can trace what you changed.

### Creating a scenario baseline

1. Open the model you want to branch from.
2. In the **Overview** tab, find the **Save as scenario baseline** card.
3. Enter a name for the new scenario (e.g., "High-volume staffing scenario").
4. Click **Save as scenario baseline**.

simmodlr creates a new private model with a **Forked from [original model] on [date]** badge in its Overview tab.

### What changes in a fork

- The fork is a complete copy of the model at the time of forking.
- It is always **private** and owned by you.
- It has its own version history, run history, and settings.
- The parent model is unaffected.
- If the parent model is later deleted, the fork remains — the provenance badge simply notes "from a deleted model".

### Copy vs. scenario baseline

The **Copy** action (in the model library card menu) creates a plain copy with no provenance link. Use Copy for a utility duplicate; use Scenario Baseline when you want to track the relationship to the original.

---

## Run Snapshot Diff

Every run stores a snapshot of the model at the exact moment the simulation ran. You can compare this snapshot against the current model to understand how the model has evolved since that run.

### How to use it

1. Go to the **Run History** tab.
2. Find the run you are interested in.
3. Click the **⋯** menu on the right of the row.
4. Click **View model at this run**.
5. A read-only diff appears showing what changed between then and now.

### When this is useful

- You ran a simulation last week and want to know what the model looked like then
- A past run gave surprisingly different results — check if the model has changed since
- You want to confirm a run was done against the correct model version

**Note:** Runs made before Sprint 68 may not have a stored snapshot and will show "No model snapshot stored for this run."

---

## Version Badges in Run History

The Run History table shows a **V{n}** badge on any run that was tagged to a specific version when it ran. This helps you trace which runs correspond to which milestones.

Runs without a version badge were run against the working draft (not a tagged version).

---

## Local Mode

Model versioning requires a signed-in account. Local (unauthenticated) models do not support named versions, scenario baselines, or run snapshot diffs.

---

## Frequently Asked Questions

**Do versions auto-create on save?**  
No. Versions are always explicit and intentional. The normal Save button updates the working draft only.

**Does restoring a version save automatically?**  
No. Restore loads the version into the editor and marks it as modified. Click Save to persist.

**Can collaborators create versions?**  
Currently, only the model owner can create and delete versions. Collaborator versioning is planned for a future sprint.

**What happens if I delete a model that other models were forked from?**  
The forked (child) models remain. Their provenance badge will note that the parent model has been deleted.

**How is a version different from a model snapshot in a run?**  
A run snapshot is automatic and tied to that specific run — it ensures reproducibility. A named version is a deliberate milestone you create at a meaningful point. Both are stored as full model JSON.
