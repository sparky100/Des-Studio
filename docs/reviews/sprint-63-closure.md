# Sprint 63 Closure Report — Planned Data Import

**Sprint:** 63  
**Theme:** Planned Data Import (CSV, XLSX, and REST schedule feed)  
**Date closed:** 2026-05-18  
**Status:** Complete

---

## Delivered scope

| # | Item | Status |
|---|------|--------|
| 63-1 | `ScheduleFeedAdapter` — fetch REST endpoint, convert timestamps, apply attrMap | ✅ |
| 63-2 | `fetchWithRetry` — retries on network failures only; HTTP errors thrown immediately | ✅ |
| 63-3 | `AdapterRegistry.prefetchScheduleFeeds(model)` — fetches all `scheduleFeed` sources, injects rows[] into B-events | ✅ |
| 63-4 | `ScheduleFeedAdapter` registered in `AdapterRegistry._getAdapter()` | ✅ |
| 63-5 | `xlsxParser.js` — parses XLSX/XLS/ODS ArrayBuffer via SheetJS → delegates to `parsePlanCsv` | ✅ |
| 63-6 | `ScheduleSource` typedef added to `types.js`; `DataSource` union extended with `scheduleFeed` | ✅ |
| 63-7 | `DataSourcesEditor` component in `ModelDetail.jsx` — add/remove/edit data sources | ✅ |
| 63-8 | `entityId` reserved attribute documented in `types.js` | ✅ |
| 63-9 | 13 tests for `ScheduleFeedAdapter` (all passing) | ✅ |
| 63-10 | 10 tests for `xlsxParser` (all passing) | ✅ |

---

## Key design decisions

### No planned duration in the model
Plan data provides *what* arrives and *when* (entity identity + attributes). The engine derives service duration from calibrated distributions conditioned on entity attributes (Sprint 64). Planned durations from the feed are ignored.

### `parseTimeInput` for all time values
`ScheduleFeedAdapter` uses `parseTimeInput()` from `clockUtils.js` for all time field values. This handles plain numbers (sim time), HH:MM strings, and ISO 8601 datetimes uniformly, re-using existing tested logic.

### HTTP errors not retried
`fetchWithRetry` distinguishes network/timeout failures (retried with 2 s / 4 s / 8 s backoff) from HTTP error responses (4xx/5xx thrown immediately — retrying would not help).

### XLSX → CSV → parsePlanCsv
`xlsxParser.js` converts XLSX sheets to CSV via SheetJS then delegates entirely to `parsePlanCsv`, keeping all timestamp/epoch/attrHeader logic in one place.

### Auth secret convention
`authSecret` fields must contain `{{env.VAR}}` placeholders only. The `AdapterRegistry._resolveSecret()` method resolves them from `envSecrets` at runtime — actual credentials are never stored in model JSON or Supabase.

---

## Files changed

| File | Change |
|------|--------|
| `src/engine/adapters/ScheduleFeedAdapter.js` | **New** — REST schedule feed adapter |
| `src/engine/adapters/index.js` | Added `ScheduleFeedAdapter` import, `scheduleFeed` case in `_getAdapter`, new `prefetchScheduleFeeds()` method |
| `src/engine/adapters/types.js` | Added `ScheduleSource` typedef; extended `DataSource` union |
| `src/ui/shared/xlsxParser.js` | **New** — XLSX file parser |
| `src/ui/ModelDetail.jsx` | Added `DataSourcesEditor` component; wired into overview tab |
| `src/engine/__tests__/ScheduleFeedAdapter.test.js` | **New** — 13 tests |
| `src/ui/shared/__tests__/xlsxParser.test.js` | **New** — 10 tests |

---

## Test summary

```
src/engine/__tests__/ScheduleFeedAdapter.test.js   13 tests  ✓
src/ui/shared/__tests__/xlsxParser.test.js         10 tests  ✓
```

All pre-existing tests continue to pass. Two pre-existing failures in `multi-stage-queue.test.js` and `dist-picker.test.jsx` are unrelated to this sprint.

---

## Not in scope (deferred)

- Engine integration: calling `prefetchScheduleFeeds()` before `engine.run()` in ExecutePanel (requires Sprint 65 actuals framework to be complete first)
- `actualsStream` WebSocket source type (Sprint 65)
- Attribute-conditional service times via `when` on cSchedule entries (Sprint 64)
