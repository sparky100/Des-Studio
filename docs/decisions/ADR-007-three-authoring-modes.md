# ADR-007: Three authoring modes over one canonical model

**Date:** 2026-05-04
**Status:** Accepted
**Sprint:** Sprint 6 planning

## Context

The visual designer design document originally proposed a phased UI path:

- stabilise the existing tab editors
- add a split-pane SVG hybrid designer
- later replace the SVG diagram with a React Flow canvas

That plan was useful when the visual designer was considered mainly as an incremental extension of the tab editor. The product direction has since changed. DES Studio now needs three distinct ways to create and edit models:

- form/tab authoring for precise manual control
- AI-generated model authoring from natural language
- a full visual designer for graph-first modelling

Building an interim SVG hybrid would create a second visual authoring surface that is not the final product direction. It would consume implementation and testing effort while delaying the real visual designer and the AI model-generation path.

## Decision

DES Studio will support three first-class authoring modes over one canonical `model_json` format:

- Forms/Tabs
- AI Generated Model
- Visual Designer

The split-pane SVG hybrid designer is retired as a required implementation phase. When visual graph authoring is scheduled, the implementation should target the real visual designer directly, using React Flow or an equivalent canvas library covered by a future dependency decision if needed.

## Alternatives Considered

**Keep the original SVG hybrid phase.** Rejected because it is likely to become throwaway UI. It would require graph rendering, connection handling, validation UI, and tests, but would still need to be replaced by the final canvas experience.

**Replace forms/tabs with the visual designer.** Rejected because the tab editors are already working and remain valuable for precise editing, especially for complex C-Event predicates and distributions.

**Make AI-generated models a separate model format.** Rejected because it would fragment validation, persistence, export/import, run history, and engine execution. AI should propose the same canonical model JSON that every other authoring mode uses.

**Delay AI model generation until after the visual designer.** Rejected because Sprint 6 and Sprint 8 already establish LLM infrastructure and model-building flows. AI authoring is a separate creation mode and does not depend on a visual canvas.

## Consequences

### Positive

- Product architecture is clearer: one model format, three authoring surfaces.
- No implementation effort is spent on a temporary SVG designer.
- The visual designer can be designed as the final graph-first experience from the start.
- AI-generated models use the same validation, persistence, import/export, and execution paths as manually-authored models.
- Forms/tabs remain stable and useful rather than being treated as legacy UI.

### Negative

- There is no intermediate visual overview before the full visual designer is built.
- The final visual designer sprint will carry more scope because it will not inherit an SVG prototype implementation.
- React Flow or any equivalent canvas dependency still needs explicit review before implementation.

## Rules added to CLAUDE.md

- DES Studio has one canonical model format: `model_json`.
- Forms/Tabs, AI Generated Model, and Visual Designer are authoring modes over the same model data.
- Do not implement the old split-pane SVG hybrid designer as a required bridge phase.
- The visual designer should be planned as the final graph-first authoring surface, not as a temporary SVG renderer.
- AI model generation must produce validated canonical model JSON before applying changes.

## Open Questions

- Which sprint should own the full visual designer implementation?
- Which canvas library and version should be used for the final visual designer?
- Should `model_json.graph` be persisted as visual layout metadata, or should graph layout be derived until manual positioning exists?
