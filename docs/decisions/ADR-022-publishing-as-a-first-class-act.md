# ADR-022: Publishing as a First-Class Act

## 2026-10-28 amendment: immutable public release

The initial publishing implementation is extended by migration
`20261028180000_published_release_snapshots.sql`. Publication is now the atomic
`publish_model(uuid)` operation: check the authenticated model owner, resolve a
version belonging to that model, capture its public model fields and current
named timetables, and store the public metadata and parameter settings together
in `public_payload`. Public reads use that payload only. Draft settings and edits
or deletion of a working version/timetable cannot alter an existing release.

The original RPC's live-model and live-timetable fallbacks are superseded by this
amendment. Existing valid published payloads are frozen during migration; an
invalid cross-model/missing version aborts migration for owner review. New public
payloads omit external data-source configuration. Anonymous execution and report
generation remain browser-local, and public reports do not call the AI proxy.

**Date:** 2026-10-21
**Status:** Accepted
**Sprint:** 100

## Context

Flow can already share a model. `des_models.visibility` is `private` or `public`; a public model appears in the Model Library's Community tab; a non-owner can fork it to run it; named collaborators can be granted `viewer` or `editor`; a single run's results can be shared via a tokenised link with a QR code.

None of that is publishing.

A published model in this product's terms is a **documented, versioned, publicly reachable artefact** — something a stranger can find, read, understand, cite, and run without an account. The current capability set has no way to express any of those five things.

The competitive context is unambiguous. AnyLogic Cloud publishes models with source files, browseable and forkable online. SimScale runs an equivalent sharing marketplace. Simul8 and Arena — the desktop incumbents — publish nothing at all, which is why Flow's existing sharing model is genuinely ahead of them and why the *publishing* layer is the one place Flow sits behind the modern SaaS tier.

The critical question is whether publishing is a **flag on the model** or **a separate act**. SD-Studio answered this in ADR-039 and the answer is worth copying, because the two readings are genuinely different products:

- `visibility: public` means "listed in the library, visible to signed-in users" — a *catalogue entry*.
- A published model is a *deliverable*: a page a client can open, a deck can embed, a paper can cite.

An author may well want one without the other. Conflating them would mean the only way to publish anything was to make the model appear in a public list — which is exactly the mistake SD-Studio avoided.

## Decision

### Publishing is its own act, not a flag on the model

A new table, `public.published_models`, with one row per model:

```
id, model_id (unique), owner_id,
title, summary, description, category, licence, cover_image_url,
released_version_id, release_notes,
show_evidence_register, exposed_params,
status ('draft' | 'published' | 'withdrawn'),
published_at, created_at, updated_at
```

`visibility` and `status` are independent. A model can be public-but-unpublished (listed in the community tab, with no public page), published-but-not-listed (a private model with a public page at a known URL), or both.

### The published row, not the model row, is the unit of publication

Everything the public needs to know about a published model lives on `published_models`: its own title, summary, description, category, licence and cover. The model's own `name` and `description` are the owner's working copy and are not what a stranger sees. A published model may therefore be titled differently in the gallery from what it is called in the owner's library — which is correct, because the two audiences are different.

### The public read is a function, not a table policy

`published_models` has **no `anon` or `authenticated` select policy** — only the owner's. The public read is a single `SECURITY DEFINER` function granted to `anon`:

- `get_published_model(p_model_id uuid)` — one published model
- `list_published_models(p_category text, p_search text, p_limit int)` — the gallery listing

This is deliberate and it is the security design:

- **Nothing can be enumerated.** No policy lets anyone list the table, so there is no way to walk it and harvest model ids.
- **A draft or withdrawn model cannot be fetched even with its id.** The function filters on `status = 'published'` and returns nothing for a model that was never published — deliberately the *same* answer, so the public page cannot tell a stranger that an id exists.
- **The function returns a sanitised payload**, not the row: the published fields, plus the model JSON the public surface needs, plus the evidence/assumption registers only when the owner has enabled them. The owner's other settings are not exposed by accident.
- **The RLS policy keys on the model's `owner_id`**, not on collaborator roles. Publishing a model to the world is the owner's call; an `editor` collaborator does not get to make it.

### A published model is pinned to a release

`released_version_id` points at a `model_versions` row (ADR-015). The public page shows that release, its notes and its timestamp. Editing the model afterwards does **not** silently change the published release — the owner re-promotes deliberately.

`model_versions` are owner-only milestones today, so promoting one to a published release is a new role for them, not a new table. A model with no version yet can be published from its current state, in which case the release is recorded as a synthetic "current state" entry rather than silently having no release.

### The owner chooses what is exposed

`exposed_params` holds parameter **paths**, drawn from the existing `enumerateSweepableParams()` enumeration and the existing `model.exposedParams` mechanism that the Business view already uses. The first publish exposes every sweepable parameter — a published model with nothing to vary is not worth publishing — and the owner narrows it from there.

Paths, not names, because renaming a parameter in the model must not silently change what the published surface exposes.

### Publishing requires a valid model, and says what it costs

The publish action is blocked while `validateModel()` reports errors. The publish panel states, **before** the button, that the model JSON — and the evidence and assumption registers, if enabled — become readable by anyone with the link.

That disclosure is not a formality. The model JSON is the payload: the engine is client-side, the public surface runs the model in the visitor's browser, and there is no server-side run. Anyone with the link can read the model's logic. That is the point — it is what Vensim's Model Reader and isee's Player do — but it is not something to do by accident.

## Alternatives Considered

**A flag on `des_models` (`is_published`).** Rejected: it conflates the catalogue entry with the deliverable, gives nowhere to put the published title, licence, category or release, and makes "published but not listed" inexpressible.

**A `published` column plus RLS policies on `des_models`.** Rejected: the model's row carries the owner's private settings; widening a select policy on it to reach `anon` would expose them.

**Public reads through a Supabase Edge Function rather than an RPC.** Rejected as unnecessary: the read is a single filtered row, not a computation, and an RPC is one fewer moving part. If the public payload later needs assembly across several tables, the function can grow rather than be replaced.

**Server-side runs for the published model.** Rejected for v1: it introduces per-viewer cost, run storage and an API to protect, and it would let a visitor's parameter changes touch the owner's model. The engine already runs client-side in a Web Worker; the visitor's browser doing the work is a feature.

**Publishing a run's results rather than the model.** Rejected as the primary act: run sharing already exists (tokenised link, widget picker, QR, expiry, revoke) and is a *different* thing — it shares one result, not the model. Both exist.

**A `published_models` row per release rather than per model.** Rejected for v1: it multiplies the identity problem (which release is "the" model?) and complicates the gallery, for a benefit that only matters to a model with a long release history. The pinned-release design gets most of the benefit with one row.

## Consequences

### Positive

- A published model is a documented, citable, versioned page — the thing a consultant puts in a client's email.
- Publication is auditable and reversible: draft → published → withdrawn, with the owner's call at each step.
- The public surface is one reviewable function rather than a widened table policy.
- The published release pins the model and the registers together, so a published release is internally consistent.

### Negative

- One migration, two tables' worth of state (the published row and its artifacts) and one new public surface to keep working — it must not break when the model schema changes.
- The public page is a second rendering of a model, so it can drift from the editor's rendering. It must render from the sanitised payload only and assume nothing about the editor.
- Two identities for a model (owner's name, published title) can confuse a user who expects them to match. The publish panel shows both.

### Rules added to AGENTS.md

- Publishing is a distinct act from `visibility`. `published_models.status` governs publication; `des_models.visibility` governs listing.
- Public reads of published models go through `SECURITY DEFINER` functions granted to `anon`. Never add an `anon` select policy to `published_models` or `published_artifacts`.
- A published model is pinned to a release. Editing the model does not change the published release.
- The publish control must disclose that the model JSON becomes publicly readable **before** the action, not after.
- Only the model's owner may publish it. Collaborator roles do not grant publication.

## Open Questions

- Does the published release freeze the evidence/assumption registers, or show the model's live register? Deferred to ADR-025, which owns the public payload shape.
- Does the published model need a moderation queue before the gallery opens to the public? Deferred — the moderation surface is a separate concern from the publication act, but the schema must not preclude it (`status` already has room for more values).
