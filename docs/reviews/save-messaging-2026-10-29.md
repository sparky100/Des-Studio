# Model save messaging — 2026-10-29

The user reported duplicate save prompts in the header and lower content area.
Ordinary model edits rendered both ModelDetailHeader's controls and SaveBanner;
canvas edits rendered only the header controls. Header Discard also bypassed the
confirmation required by the content banner.

## Changes

- Reuse SaveBanner as compact controls inside the existing header. Remove the
  duplicate content instance and move persistent failure/retry feedback to the
  same controls. During active runs, mount one compact replacement above the
  content while the full header is hidden.
- Use **Unsaved changes**, **Save model**, **Saving model…**, **Saved**, and
  **Retry** consistently for form and canvas edits. Preserve manual saving,
  keyboard shortcuts, validation messages, success toasts, and navigation guards.
- Require confirmation for Discard, including canvas edits. Cancel preserves edits.
- Rename the AI suggestion action **Apply to model** to describe its actual
  working-copy behaviour. Remove repeated save reminders from imports and Access.
- Label separate persistence actions **Save schedule** and **Save experiment**.
  Automatic result-save messages remain scoped to results.

These are targeted extensions of the existing components and save lifecycle.
No dependencies, engine behaviour, database contracts, or model fields changed.

## Verification

- 117 distinct tests across eight targeted UI files passed across the final
  runs: unsaved-warning (10), undo-guard (2), visual-designer-panel (36), plus
  accessibility, exposed-params-curation, execute-panel, ai-assistant-panel, and
  dist-picker (69 combined).
- Save-workflow coverage includes one save action, confirmed discard/cancel,
  retry after failure, saving state, navigation protection, and the compact
  controls during active runs.
- Some original 15-second UI tests timed out locally. Access curation and the
  two remaining canvas cases passed with a command-line 60-second timeout;
  repository timeout configuration was unchanged. Existing React act warnings
  and mocked schedule-fetch warnings remain visible in the UI test output.
- ESLint on changed UI/test files: zero errors; existing warnings remain.
- `npm run build`: passed, including the MCP prebuild; Vite's chunk-size warning
  remains. Help knowledge-base JSON parses successfully. `git diff --check` passed.
- The initial implementation used targeted checks. Complete-suite PR verification
  is recorded below; live browser verification has not been performed.

## Documentation review

Updated the user guide, product specification, help reference and help knowledge
base. Engineering specification and model schema require no save-messaging
changes because their contracts are unchanged. The build plan and capability
register require no roadmap or modelling-capability changes; this is a bug fix,
not a sprint or new modelling capability.

## PR verification — 2026-11-02

Reapplied the save changes to the current `origin/main` (`bb40ac38`), preserving
newer Evidence, Run and documentation work. Unrelated local AI/MCP authoring edits
were kept outside the PR. Existing MCP path assertions now use the native resolved
path and the guide assertion accepts LF or CRLF. The canvas jump test explicitly
waits for its lazy-loaded search control. These are test-only portability/timing
fixes found by the complete run; production MCP behaviour is unchanged.

- Complete fast suite: 313 files / 4,688 cases; initially 4,683 passed, 2 skipped
  and 3 failures (the two Windows assertions and lazy-load wait above).
- Both affected files passed all 52 tests after correction. Thus all 4,686 active
  cases are verified across the complete run and focused rerun.
- Production build including MCP 0.6 prebuild, lint and typecheck passed.
- GitHub CI must pass, including simulation soak, before merging.
