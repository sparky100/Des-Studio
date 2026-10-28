# ADR-025: Anonymous Public Access, and What a Public Payload Exposes

**Date:** 2026-10-21
**Status:** Accepted
**Sprint:** 100

## Context

ADR-022 decided *what* publishing is. This ADR decides who can reach a published model, and exactly what they can see when they get there.

The current state of the product is that **nobody** can reach a published model without an account. `App.jsx`'s `loadData` is gated on `session`, and a signed-out visitor is rendered `AuthShell` (`:694`). The Community tab — which lists public models — is therefore invisible to a prospect who has not signed up.

That is the single largest publishing weakness in the competitive assessment, and it is worth restating why it dominates the other nine: the community gallery is a marketing surface that marketing cannot reach. Every comparable product — AnyLogic Cloud, SimScale, and every SaaS competitor in the category — lets a visitor browse public content without an account. It is the table stakes of a public catalogue.

Two things must be settled together, because they pull against each other:

1. **Reachability.** A published model must be openable by a stranger, with no account, no sign-up wall, and no friction.
2. **Containment.** Opening a model to the public must not expose the owner anything they did not intend to publish — and must not create a new enumeration or data-leak surface.

This ADR also owns a question ADR-022 deferred: does the public payload carry the model's *live* evidence/assumption registers, or the registers as they stood at the published release?

## Decision

### Public routes are handled before the session check

The public model page, the public gallery and the published simulator are dispatched in `App.jsx` **before** the auth gate, alongside the existing `#share/:token` route, which is already handled before the session check (`App.jsx:497`).

A visitor opening a published model's link does not have a Flow account, and asking them to make one before they can see the model would defeat the purpose of publishing it. The only route out of a published model is "Open in Flow" — the normal signed-in flow, where a visitor can take a copy if they want one.

### The public read is a `SECURITY DEFINER` function, granted to `anon`

`published_models` and `published_artifacts` have **no `anon` or `authenticated` select policy** — only the owner's. The public read path is:

- `get_published_model(p_model_id uuid)`
- `list_published_models(p_category text, p_search text, p_limit int)`

granted to `anon`, both `SECURITY DEFINER`, both filtering on `status = 'published'`.

Four properties follow, and each is the reason for the shape:

- **Not enumerable.** No policy permits listing either table, so there is no way to walk it and harvest model ids. The gallery listing exists, but it is a function that returns only published rows — not a table scan.
- **Indistinguishable absence.** A draft, withdrawn or never-published model returns nothing, and the function returns nothing in every one of those cases. A stranger holding an id cannot tell whether the model exists, was withdrawn, or never existed. This is why `status` is checked inside the function rather than relied on at the call site.
- **Sanitised payload.** The function returns a constructed object — not the row — so fields the owner did not publish are not exposed by accident. The payload is built from an explicit field list.
- **Owner-keyed authorisation.** The RLS policy on the table keys on the model's `owner_id`, not on collaborator roles. Publishing to the world is the owner's call; an `editor` collaborator does not get to make it.

### The published payload is an explicit field list, and it is the whole contract

`get_published_model` returns:

| Field | Notes |
|---|---|
| `title`, `summary`, `description` | From the published row, not the model row |
| `category`, `licence`, `cover_image_url` | Published row |
| `released_version_id`, `release_notes`, `published_at` | The pinned release and its notes |
| `model` | The model JSON, so the visitor's browser can run it |
| `exposed_params` | The paths the owner chose to expose |
| `evidence`, `assumptions`, `backingLinks` | **Only when `show_evidence_register` is true** |
| `artifacts` | Published artefact summaries, each with its provenance |

Nothing else. In particular: not `access`, not the owner's collaborator list, not `exposedParams` internals beyond the published paths, not `notes`, not the model's own working `name` and `description` — those are the owner's copy, and the published row's title and description are the stranger's copy.

### The payload is built from a WHITELIST, not by subtracting private fields

This was found while building the public surface, and it is the more important half of the rule above.

A **version snapshot** stores the whole in-memory model, not the normalised `model_json` shape. The in-memory model carries the row's **metadata** as well as the model: the collaborator `access` map (user ids and their roles), `owner_id`, the internal `notes`, the Business-view `exposedParams` curation, the `tags`. A published model pins a version, so the payload would have carried all of it.

Subtracting a list of known-private fields is exactly how those leak: a metadata field added later is exposed by default, because the default is "included". The payload is therefore built from an **explicit list of the model's own fields**, and `tests/db/published-models.test.js` ties that list to `MODEL_JSON_FIELDS` in `src/model/modelJsonFields.js` so the two cannot drift apart.

The one piece of owner metadata the public payload carries is the author's **display name**, as a byline. `profiles` is readable by signed-in users only, so without it an anonymous visitor could not see who published the model — and a published model with no author cannot be cited. It is limited to the name: no id, no email, no role, no plan. The publish panel says the name will appear before the owner publishes.

### A published model carries its named schedules

A B-event's `scheduleRef` points at a row in `model_schedules` (ADR-016), and the engine resolves that reference through a schedules map. If the map has no entry, `resolveInlineSchedules()` leaves the entry unresolved and the engine pushes the event to `t=1e9` — **the published model would run with no scheduled arrivals, and say nothing about it**.

So the payload carries the schedule rows, and the published release carries its **own snapshot** of them (`published_models.released_schedules`), captured at publish time. The snapshot matters as much as the rows: without it, a timetable edited or deleted after publication would silently change — or empty — the published model's arrivals, while its parameters stayed pinned.

The public simulator builds the map with the same rule the app uses for a model it owns (the default schedule if there is one, otherwise all of them), and says so plainly if the timetable is missing.

### Taking a copy of a published model

"Open in Flow" on a published model the visitor cannot otherwise see needs a path the existing fork flow does not cover: `handleOpenModel` forks only models whose `visibility` is `public`, but publishing is independent of `visibility`. A published-but-unlisted model is not in the visitor's library at all, so the link would have done nothing.

The handoff therefore asks the public function whether the model is published, and if it is, offers **"Copy this published model"** — a private copy in the visitor's library, made from the published payload rather than from the owner's row, and carrying the evidence and assumption registers with it if the author published them. This is ADR-002's rule applied to publishing: a non-owner who runs someone else's model first gets a private copy they own.

### The published simulator is a separate surface

It shows the model, the settings the owner chose to expose, and the results — nothing else. It is not a read-only version of the app, and it does not become one.

### The evidence register travels with the release, not with the live model

A published model must be internally consistent: the parameters shown and the provenance shown must describe the same thing. If the public page rendered the model's *live* register while the model JSON came from the pinned release, a reader could see a release whose arrival rate is backed by evidence that only exists in a later, unpublished edit.

So the published release carries its own snapshot of the registers, and the public payload serves **that** snapshot.

This means the published release is not just a `model_versions` pointer — it also stores the evidence/assumption registers as they stood at promotion time. The owner's live register keeps evolving; the published one does not, until the owner re-promotes.

The owner can still switch the register off entirely (`show_evidence_register`), and the default is on: the register is the published model's most distinctive claim, and a model that publishes parameters without their provenance is publishing less than it could.

### Publishing discloses what it costs, before the button

The publish control states, before the action is taken, that the model JSON — and the evidence and assumption registers if enabled — become readable by anyone with the link.

The model JSON is the payload because the engine is client-side: the public surface runs the model in the visitor's browser from the payload it carries. There is no server-side run, so there is no per-viewer cost, no run storage, and no API to protect — and, correspondingly, no way to publish a model whose internals must stay hidden. A published model is a readable model. That is the point (it is what Vensim's Model Reader and isee's Player do), but it is not something to do by accident.

### The published surface is not a read-only copy of the app

The public model page renders from the sanitised payload and nothing else. It shows the model, its documentation, its provenance and its results — not the editor, not the access tab, not the run history, not the owner's other models.

A published surface that grew into a second copy of the whole app would double every schema change's maintenance cost and would leak owner chrome the moment it drifted.

## Alternatives Considered

**Require an account to view published models.** Rejected: it defeats the purpose. The whole point of publishing is reach, and the competitor set reaches further. The current product already has the opposite behaviour (everything needs an account), which is exactly the weakness this ADR closes.

**A `SELECT` policy on `published_models` for `anon`.** Rejected: it makes the table enumerable — anyone can list every published row, and, more importantly, every *draft* row, because a policy cannot express "only rows where status = 'published'" without also granting visibility of the table's shape. The function is the only public read path.

**An Edge Function rather than an RPC.** Rejected as unnecessary for v1: the read is a filtered row plus a constructed payload, and an RPC is one fewer deployable. If the payload later needs assembly across several tables, the function grows rather than being replaced.

**Serving the public page's model JSON from a CDN or a static bundle.** Rejected: the model JSON changes when the model does, and a published release is meant to be stable. Serving it from the database through the function keeps the release stable.

**Serving the model's *live* register alongside the pinned release.** Rejected: it produces a published release that describes itself inconsistently. The release carries its own snapshot.

**Letting the visitor run the model server-side.** Rejected: per-viewer cost, run storage, an API to protect, and the risk that a visitor's parameter changes touch the owner's model.

**Embedding with a `<script>` tag rather than an `<iframe>`.** Rejected: the published page is a full page with its own styles; a script embed would have to inject them into the host's DOM, which is how a third-party widget ends up breaking the site it is embedded in. An iframe also means the host page cannot see inside it.

## Consequences

### Positive

- The gallery becomes a genuine acquisition surface. This is the single highest-return change in Sprint 100.
- The public surface is one auditable function, not a widened table policy — a small, reviewable security surface.
- A published release is internally consistent: parameters and provenance come from the same snapshot.
- A published model can be embedded in a client's deck, which is how the work actually gets read.

### Negative

- Anonymous public read is a new exposure surface and needs its own tests: that `anon` cannot select from the table, that a withdrawn model is indistinguishable from a nonexistent one, that the payload contains nothing outside its field list.
- The public page is a new surface to keep working, and it must not break when the model schema changes. It renders from the payload only and assumes nothing about the editor.
- Storing the register snapshot with the release means a published release carries data the owner might later wish they had withdrawn. The owner withdraws the release; that is the control.

### Rules added to AGENTS.md

- Public routes (published model page, gallery, published simulator) are dispatched **before** the session check in `App.jsx`. A published model must be reachable without an account.
- Public reads of published models and artefacts go through `SECURITY DEFINER` functions granted to `anon`. Never add an `anon` select policy to `published_models` or `published_artifacts`.
- A draft, withdrawn and nonexistent published model must all produce the same empty public response, so an id cannot be probed.
- The public payload is an explicit field list. Adding a field to it is a deliberate act with a security review, not a side effect of a schema change.
- The published payload serves the **release's** snapshot of the evidence and assumption registers, not the model's live registers.
- The publish control discloses that the model JSON becomes publicly readable **before** the action.

## Open Questions

- Does the gallery need a moderation queue before it opens? The schema does not preclude one (`status` has room for more values), but moderation is a separate concern from reachability and is deferred.
- Should a published model be able to require an email address before the visitor can run it — a lightweight gate that still allows anonymous viewing? Deferred; it would need its own table and its own abuse story.
