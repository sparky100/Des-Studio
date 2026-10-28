# Run assistant layout fix

## Audit and scope

Help uses a bounded side panel with a separate header and scrolling conversation.
The Design Simulation Assistant already provides working model Q&A and is
preserved. Run shares that assistant shell but adds Diagnose and Debug content.

Run previously placed its header, mode buttons, diagnostics and an unrelated
analysis-response box into the same scrolling flex column. The modes followed
the Design question form, so switching modes moved them vertically. The mode
row could not wrap. Debug chat also introduced a second scrolling history inside
the already scrolling assistant. Its textarea retained its intrinsic minimum
width alongside fixed voice and send buttons.

## Targeted change

- In Run's sidebar, overlay and phone presentations, keep the header and mode
  controls outside the scrolling content area.
- Put the mode controls before each mode's content and allow them to wrap.
- Render the model Q&A response only in Design mode; Diagnose and Debug own
  their respective content and no longer show a spare response box.
- Let the assistant own scrolling for embedded diagnostics and debug history.
  Keep the standalone DiagnosticsTab history limit unchanged.
- Allow the debug textarea to shrink and diagnosis actions to wrap.
- Retain the existing model Q&A state when switching back to Design.

No simulation, publishing, database, Help, or Design workspace behavior changes.
No dependencies added. This is a focused bug fix, not a sprint or a panel rewrite.

## Verification

`tests/ui/execute/run-assistant-layout.test.jsx` covers the three bounded
presentations, mode selection and selected state, no-run guidance, a completed
diagnosis, returning to the Design draft, the single Optimise action, and the
existing Design workspace Q&A surface. Existing assistant and Help tests are
also run.

Validation on 2026-10-28:

- Focused assistant/Help tests: 4 files, 36 tests passed (22 UI tests,
  including all 6 new Run-layout tests, plus 14 Help prompt tests).
- Production build: passed, including the standard MCP packaging prebuild.
- Browser checks used an isolated local preview with synthetic results and
  synthetic AI replies; no live AI service or model changes were needed.
- At a 1000 x 400 viewport, a long diagnosis scrolled in the default-width
  sidebar while the mode bar stayed at the same position; no horizontal
  overflow. The compact overlay also retained its mode bar and stayed within
  the viewport (bottom 378 in a 400px window).
- At 320 x 480, phone Debug showed its question field, voice and send controls
  without horizontal overflow. The mode buttons and Optimise wrapped.
- A long synthetic Debug reply scrolled to the end of the content area with
  the mode controls still visible and zero nested scrolling areas.

The full unit/UI run did not pass: it reported MCP tests expecting a Unix path
(`/m/a.json`) and LF-only skill frontmatter on this Windows CRLF checkout,
Visual Designer timeouts, then a worker heap exhaustion / closed-channel error
during machine memory and disk pressure. These are outside this layout patch.
The focused 36-test assistant/Help run was repeated after space was released
and passed. The full suite remains unverified; this change is submitted as a draft.
