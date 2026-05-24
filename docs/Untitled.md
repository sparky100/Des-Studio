# DES Studio — Documentation & Test Completeness Rule

_Standing rule. Applies to every change made to DES Studio, regardless of size or sprint context._

---

## The Rule

No change to DES Studio is complete until the following obligations have been discharged. Claude Code must treat these as exit conditions, not optional follow-up tasks.

---

### 1. Documentation must be kept current

After any change that affects behaviour, schema, UI, or API, review each of the following documents and update any section that is now inaccurate or incomplete. A document only needs updating if it is affected — but affected documents must be updated before the change is committed, not deferred.

|Document|Update trigger|
|---|---|
|`DES_Studio_User_Guide.md`|Any change visible to the end user: new features, renamed controls, changed workflows, new error messages|
|`DES_Studio_Product_Spec.md`|Any change to product-level capability, scope, or roadmap|
|`DES_Studio_Engineering_Spec.md`|Any change to engine behaviour, macro signatures, schema, API contracts, or architectural decisions|
|`model-schema-for-llm.md`|Any change to `model_json` structure, validation rules, macro syntax, or LLM-facing schema|
|In-app help content|Any change to a feature that has corresponding in-app guidance or tooltip text|

---

### 2. Tests must be written alongside every change

Any change that adds, modifies, or removes engine behaviour, a macro, a validation rule, a DB operation, or a schema field must include corresponding Vitest tests before the change is considered complete.

Tests must be written in the same session as the code change — never deferred to a follow-up prompt or sprint.

The test suite must pass at zero failures before committing.

---

### 3. Modelling capability changes require a UI change

Any change that affects what a user can model — new macros, new schema fields, new routing options, new distributions, new validation rules, or changes to existing modelling behaviour — must be accompanied by a corresponding UI change in the same session.

The UI change must make the new or modified capability accessible and operable through the editor. Capability that exists in the engine or schema but cannot be reached through the UI is not complete.

Examples of what this requires in practice:

- A new macro parameter must appear as an input field in the relevant editor
- A new schema field must be editable in the Forms/Tabs editor and, where applicable, represented in the Visual Designer
- A new routing option must be selectable in the routing UI, not only expressible in raw JSON
- A new validation rule must surface a clear, actionable error message in the model health panel

---

### 4. Sprint obligations

When work is structured as a sprint, two additional documents are required.

**Sprint plan** — produced before implementation begins. Must include:

- Sprint goal
- Scope guardrails (what will not be changed)
- Feature scope table with IDs, statuses, and deliverables
- Sequential Claude Code implementation prompts

**Sprint closure document** — produced after all features are implemented and tested. Must include:

- Final test count
- Confirmation that the production build passes
- List of any features deferred, with reason and target sprint
- Build plan version bump entry
- Any new ADRs accepted during the sprint

Both documents must be created even for short sprints. The closure document is what permits the build plan's sprint status to be set to ✅ Complete.

---

### 5. Schema contract rule

Any change that adds a field to `model_json`, `db/models.js` serialisation, or the Supabase schema must include a corresponding Vitest round-trip assertion in `tests/db/`. A change without this test is incomplete regardless of whether other tests pass.

---

## When This Rule Applies

These obligations apply to:

- All sprint feature work
- Bug fixes that change observable behaviour
- Documentation-only corrections that reveal a spec gap
- Hotfixes

They do not apply to:

- Pure refactoring with no behaviour change and no public API change
- Style or formatting changes with no functional effect
- Local-only experimental branches not intended for merge

---

_This rule should appear in full in `CLAUDE.md` and `AGENTS.md` under the heading "Documentation & Test Completeness Rule". It is not optional and cannot be waived by a sprint prompt._