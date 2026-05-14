# Sprint 33 Closure Report

**Sprint:** 33 — Advanced Scheduling & Analytics  
**Date:** 2026-05-14  
**Status:** ✅ Complete

## Summary

Sprint 33 delivered advanced scheduling macros (SPLIT, COSEIZE, MATCH), dynamic batch sizing, three new queue disciplines (SPT, EDD, PRIORITY by attribute), histogram collection, one-way ANOVA with Tukey HSD post-hoc testing, and resource failure visualization on the Execute canvas.

## Features Delivered

| Feature | Status | Description |
|---|---|---|
| G06 — SPLIT macro | ✅ Complete | Creates N-1 clones of context entity, tracks parent-child relationships |
| G07 — COSEIZE macro | ✅ Complete | Atomically seizes multiple server types simultaneously |
| G08 — MATCH macro | ✅ Complete | Pairs entities from two queues into batch entity |
| G09 — Dynamic BATCH | ✅ Complete | Batch size from entity attribute (Entity.attrName) |
| G10 — SPT/EDD/PRIORITY queues | ✅ Complete | Three new queue disciplines with attribute-based sorting |
| G12 — Histogram collector | ✅ Complete | Equal-width and Freedman-Diaconis automatic bin selection |
| G13 — ANOVA analysis | ✅ Complete | One-way ANOVA with Tukey HSD post-hoc test |
| G16 — Resource failure UI | ✅ Complete | Failed server visualization on Execute canvas Activity nodes |

## Test Results

- **Engine tests:** 695/695 passing (37 new Sprint 33 tests added)
- **Build:** Clean (`npm run build` succeeds)
- **Test file:** `tests/engine/sprint-33-features.test.js` (37 tests)

## Files Modified

| File | Changes |
|---|---|
| `src/engine/macros.js` | Added SPLIT, COSEIZE, MATCH macros; extended BATCH for dynamic sizing |
| `src/engine/entities.js` | Extended `queueDisciplineComparator` for SPT, EDD, PRIORITY(attrName) |
| `src/engine/statistics.js` | Added `buildHistogram`, `buildHistogramFD`, `oneWayANOVA`, `tukeyHSD` |
| `src/ui/execute/ExecuteCanvas.jsx` | Added `failedCount` to activity node liveData |
| `src/ui/execute/ExecuteActivityNode.jsx` | Added failed server visualization (red dots, warning badge) |
| `tests/engine/sprint-33-features.test.js` | 37 new tests for all Sprint 33 features |
| `docs/reviews/sprint-33-capability-guide.md` | Capability guide for all new features |

## Exit Gate Verification

- [x] All engine tests pass (695/695)
- [x] Production build succeeds
- [x] Capability guide created
- [x] AGENTS.md updated with Sprint 33 history
- [x] No new runtime dependencies added

## Notes

- All new macros follow the existing macro registry pattern — no engine core changes required
- Histogram and ANOVA functions are pure statistical utilities — no DOM or React dependencies
- Queue discipline extensions use regex parsing for PRIORITY(attrName) pattern
- Resource failure visualization uses existing color tokens (C.red for failed state)
