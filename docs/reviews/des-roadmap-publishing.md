# DES roadmap: publishing audit and review plan

Baseline: origin/main 6e748d81. The original local working directory has extensive uncommitted publishing and grounding changes. It remains untouched. This branch reuses its publishing files and tests, with targeted integration against current main.

## Reference audit

Loop's ADR-039, publishedSimulators database wrapper, migrations 011–015 and PublishedSimulatorSection establish the reference: separate publication from library visibility; owner-only settings; anonymous RPC reads; a deliberately curated payload; visitor-side execution; selected parameters; reporting.

DES already has parameter enumeration, exposed-parameter resolution, numeric bounds, worker replications, admission checks, timetable mapping, result cards, named versions and report generation. These remain the implementation paths.

## Incremental review units

1. Publishing: owner workflow, public model page and gallery, explicit immutable release payload, curated parameter labels and bounds, browser execution and reports.
2. Collapsible sub-models: extend existing sections through a display projection; retain detailed coordinates and the canonical simulation model. Test against the actual UK supplier DES example.
3. Run panel layouts: separate branch and review, using Help / Design Assistant as the layout reference.

## Release semantics and deployment

Apply both new publication migrations in timestamp order. The second migration freezes existing valid public payloads, then makes every new publication capture its model version, metadata, exposed parameters, optional registers and current named timetables together in one database transaction. An empty timetable set is a real snapshot. Saving settings changes the next release; Publish again replaces the public snapshot. Withdrawing or unpublishing removes anonymous access immediately.

Existing published rows must reference a version belonging to the same model before the snapshot migration can run; otherwise it aborts with a clear error. It does not silently publish a live working model. Legacy payload backfill preserves what was publicly visible when this migration runs; it cannot reconstruct historical timetable rows.

New releases omit data-source configuration. Their numeric model values remain available; external data is not refreshed. Publication is owner-only. Draft and withdrawn public reads have the same empty response as an unknown id. No public table SELECT policy is added.

The optional register display consumes registers already present in a version; this PR does not import the unrelated, unfinished register-editing work from the original checkout.
Private copies carry the simulation definition and inline timetable rows. Copying
structured registers into the editor depends on that separate register-persistence work.

## Verification limits

Database unit tests use mocked Supabase and static migration assertions. They do not prove deployed RLS or transaction behavior against live Postgres. Migration application and signed-out production smoke checks remain deployment acceptance tasks until performed explicitly. No migration is applied by this branch.

Test and build results are recorded after validation completes. This document does not declare the roadmap complete.

Focused verification: 141 tests pass across the publication database wrappers,
migration-source assertions, owner panel, anonymous routes, public surfaces,
visitor execution, provenance-reading helper and report generation. The route
test was repeated after making initial hash setup deterministic. Type checking
passes. MCP packaging completed successfully and the Vite production build passes.
The full unit/UI suite is being rerun with one fork after the resource failures.
It has reported existing Visual Designer tests exceeding their 15-second limit;
similar timeouts occurred on the independent layout branch. The root cause is
not proven, and the full suite is not reported as green. CI remains an acceptance gate.

A synthetic signed-out browser check ran the real replication worker, verified
two replications with a changed server count, downloaded an HTML report and
measured zero horizontal overflow at 375px. It exposed a missing aggregate-statistics
handoff, which was fixed and covered by an additional regression test. Per-run
served counts now match the existing results renderer's contract. Safety-limit
and truncated-event results are explicitly flagged as incomplete. Database RPC
responses were mocked for this local browser check; no live model was published.
