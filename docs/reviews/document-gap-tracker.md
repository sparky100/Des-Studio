# DES Studio — Document Gap Tracker

**Created:** 2026-05-23  
**Review session:** Read-only gap analysis (4 documents + 6 source files)  
**Status:** Open — fixes in progress

---

## Gap Register

| ID | Priority | Gap | Affected Document(s) | Source Truth | Status | Fixed In Version |
|---|---|---|---|---|---|---|
| DOC-001 | P1 | SEIZE macro appears in Engineering Spec §5 macro table but does not exist in `macros.js` — ASSIGN is the actual macro | Engineering Spec v1.9.0 §5 | `src/engine/macros.js` | ✅ Fixed | v1.10.0 |
| DOC-002 | P1 | ServerAttr distribution undocumented — exists in `distributions.js` and Model Schema §4 but missing from Engineering Spec and User Guide distribution tables | Engineering Spec §6.1, User Guide §6 | `src/engine/distributions.js`, Model Schema §4 | ✅ Fixed | v1.10.0 |
| DOC-003 | P1 | EntityAttr distribution undocumented — exists in `distributions.js` and Model Schema §4 but missing from Engineering Spec and User Guide distribution tables | Engineering Spec §6.1, User Guide §6 | `src/engine/distributions.js`, Model Schema §4 | ✅ Fixed | v1.10.0 |
| DOC-004 | P1 | RENEGE_OLDEST macro undocumented — exists in `macros.js:658` but missing from all three reference documents | Engineering Spec §5, User Guide §5, Product Spec §3.3, Model Schema §6 | `src/engine/macros.js:658` | ✅ Fixed | v1.10.0 |
| DOC-005 | P2 | W-CAP-01 validation warning undocumented — multi-class resource contention warning in `validation.js:636` not in Engineering Spec §10 | Engineering Spec §10 | `src/engine/validation.js:636` | ✅ Fixed | v1.10.0 |
| DOC-006 | P2 | W-CAP-02 validation warning undocumented — very high arrival rate warning in `validation.js:652` not in Engineering Spec §10 | Engineering Spec §10 | `src/engine/validation.js:652` | ✅ Fixed | v1.10.0 |
| DOC-007 | P2 | Help Assistant completely undocumented — Sprint 70 feature (`src/ui/HelpAssistant.jsx`) not mentioned in any user-facing document | Product Spec, User Guide, Engineering Spec | `src/ui/HelpAssistant.jsx` | ✅ Fixed | v1.10.0 |
| DOC-008 | P2 | Version history inconsistent — Product Spec ends at Sprint 67, Engineering Spec at Sprint 66, User Guide header says v1.15.0 but history shows v1.16.0 | All four documents | Sprint tracking in AGENTS.md | ✅ Fixed | v1.10.0+ |
| DOC-009 | P3 | V29 validation rule in code but not in Engineering Spec §10 table — fallback condition warning for cSchedules with `when` predicates | Engineering Spec §10 | `src/engine/validation.js:544-560` | ✅ Fixed | v1.10.0 |
| DOC-010 | P3 | V25 validation rule undocumented — RENEGE(ctx) requirement warning in `validation.js` not in spec | Engineering Spec §10 | `src/engine/validation.js` | ✅ Fixed | v1.10.0 |
| DOC-011 | P3 | Structural change detection undocumented — `detectStructuralChanges()` in `validation.js:689-770` used for versioning but not referenced in any document | All documents | `src/engine/validation.js:689-770` | ✅ Fixed | v1.10.0 |
| DOC-012 | P3 | Queue disciplines SPT/EDD undocumented in User Guide — code supports `PRIORITY(attrName)`, `SPT`, `EDD` but User Guide §4.2 only lists FIFO/LIFO/PRIORITY | User Guide §4.2 | `src/engine/entities.js:49-105` | ✅ Fixed | v1.10.0 |
| DOC-013 | P3 | Template count mismatch — Product Spec §5 lists 17 templates but codebase has 14 | Product Spec §5 | Template registry in code | ✅ Fixed | v1.10.0 |
| DOC-014 | P3 | applyScalar() function undocumented — handles VAR++, VAR--, VAR+=N syntax in `macros.js:1106-1132` but not documented anywhere | All documents | `src/engine/macros.js:1106-1132` | ⏳ Deferred | Sprint 71 |
| DOC-015 | P3 | Safe arithmetic evaluator functions undocumented — `min`, `max`, `abs`, `round`, `floor`, `ceil` support in `macros.js:18-87` only partially documented | User Guide §5 | `src/engine/macros.js:18-87` | ⏳ Deferred | Sprint 71 |

---

## Fix Summary by Document

### Product Specification (v1.1.1 → v1.2.0)

| Gap ID | Change |
|---|---|
| DOC-007 | Added §3.8 Help Assistant |
| DOC-008 | Updated version history to v1.2.0, added Sprints 68-70 |
| DOC-013 | Corrected template count from 17 to 14 |

### Engineering Specification (v1.9.0 → v1.10.0)

| Gap ID | Change |
|---|---|
| DOC-001 | Removed SEIZE from macro table (§5) |
| DOC-002 | Added ServerAttr to distribution table (§6.1) |
| DOC-003 | Added EntityAttr to distribution table (§6.1) |
| DOC-004 | Added RENEGE_OLDEST to macro table (§5) |
| DOC-005 | Added W-CAP-01 to validation table (§10) |
| DOC-006 | Added W-CAP-02 to validation table (§10) |
| DOC-008 | Updated version history to v1.10.0, added Sprints 68-70 |
| DOC-009 | Added V29 to validation table (§10) |
| DOC-010 | Added V25 to validation table (§10) |
| DOC-011 | Added structural change detection to §2.10 |
| DOC-012 | Added SPT/EDD to queue discipline table (§3.3) |

### User Guide (v1.15.0 → v1.16.0)

| Gap ID | Change |
|---|---|
| DOC-002 | Added ServerAttr to distribution table (§6) |
| DOC-003 | Added EntityAttr to distribution table (§6) |
| DOC-004 | Added RENEGE_OLDEST to macro table (§5) |
| DOC-007 | Added §2.Y Help Assistant |
| DOC-008 | Fixed version header to v1.16.0, updated version history |
| DOC-012 | Added SPT/EDD to queue discipline table (§4.2) |

### Model Schema for LLM (no version bump)

| Gap ID | Change |
|---|---|
| DOC-005 | Added W-CAP warnings to §10 validation table |
| DOC-006 | Added W-CAP warnings to §10 validation table |
| DOC-009 | Added V29 to §10 validation table |
| DOC-010 | Added V25 note to §10 validation table |

---

## Verification Checklist

Before closing this tracker:

- [ ] All P1 gaps fixed (DOC-001 through DOC-004)
- [ ] All P2 gaps fixed (DOC-005 through DOC-008)
- [ ] All P3 gaps fixed or explicitly deferred with Sprint assignment (DOC-009 through DOC-015)
- [ ] All four documents build without errors
- [ ] Version histories consistent across documents
- [ ] Cross-references between documents still valid

---

## Notes

- DOC-014 and DOC-015 deferred to Sprint 71 (internal engine functions, low user visibility)
- Help Assistant documentation added as §2.Y in User Guide and §3.8 in Product Spec
- Template count corrected to 14 (templates 15-17 were proposed but never implemented)
- SEIZE macro removal is a correction — ASSIGN is and always was the actual macro name

---

**Next review:** End of Sprint 71 (deferred items DOC-014, DOC-015)
