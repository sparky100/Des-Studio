# Sprint 42 — UI Usability Overhaul
**Sprint:** 42 — UI Usability Overhaul
**Branch:** sprint-42 (merged)
**Date:** 2026-05-15

## Objective
The BEventEditor had grown into a long, undifferentiated form that mixed effects, routing, balking, looping, and scheduling fields in a flat layout. This sprint introduces two new shared UI components — SectionPanel and EffectPicker — and restructures BEventEditor and EntityTypeEditor to use them, making the editors scannable and preventing cognitive overload as the field count grows.

## Background
After Sprint 41 added seven new macro types, the effects dropdown in BEventEditor contained 30+ options in a flat list with no grouping. The editor itself had no section structure: effects, balking probability, loop guard, release routing, and schedule fields all appeared at the same visual level. Users had to scroll the entire form to understand a B-event's configuration. Additionally, balking was modelled only as a probability — there was no way to express a conditional balk rule — and there was no mechanism to prevent infinite entity recirculation.

## Scope
| ID | Item | File(s) |
|----|------|---------|
| S42.1 | New SectionPanel accordion component — collapsible sections with status badge | src/ui/shared/components.jsx |
| S42.2 | New EffectPicker chip-based component — categorised effect selection replacing flat dropdown | src/ui/editors/helpers.jsx |
| S42.3 | Full rewrite of BEventEditor to use SectionPanel (5 sections) and EffectPicker | src/ui/editors/BEventEditor.jsx |
| S42.4 | Balking extended to three modes: none / probability / condition | src/ui/editors/BEventEditor.jsx |
| S42.5 | New Loop Guard section with ev.loopConfig persistence | src/ui/editors/BEventEditor.jsx |
| S42.6 | EntityTypeEditor Shift Schedule and Failure Model sections wrapped in SectionPanel | src/ui/editors/EntityTypeEditor.jsx |

## Acceptance Criteria
- SectionPanel renders a header with a chevron toggle and a status badge; badge remains visible when section is collapsed; section auto-opens when its status is active
- EffectPicker displays existing effects as removable chips; a "+ Add Effect" button opens a dropdown grouping options into Queue, Service, State, Cost, Server, and Container categories; each category tile shows the count of options within it
- BEventEditor is divided into five named sections: Effects, Release Routing, Balking, Loop Guard, Schedules
- Balking mode selector offers none, probability, and condition; probability mode shows a slider and numeric value; condition mode shows a free-text expression field stored as ev.balkCondition
- Loop Guard toggle enables ev.loopConfig = { maxLoopCount, exitQueueName }; disabling clears loopConfig from the event
- EntityTypeEditor Shift Schedule and Failure Model sections are collapsible via SectionPanel
- entity-type-editor.test.jsx updated to open the relevant panel before clicking checkboxes inside it
- b-event-editor.test.jsx updated to click "+ Add Effect" before asserting on option visibility

## Dependencies
- Sprint 41: full macro set present in helpers.jsx effect option lists (provides the options that EffectPicker categorises)
- BEventEditor, CEventEditor, EntityTypeEditor must already exist
- Shared component infrastructure in src/ui/shared/components.jsx must support adding new exports
