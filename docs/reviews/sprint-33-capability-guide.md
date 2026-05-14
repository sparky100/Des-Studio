# Sprint 33 Capability Guide — Advanced Scheduling & Analytics

Created: 2026-05-14  
Sprint: Sprint 33  
Status: ✅ Complete

## Purpose

This guide explains the advanced scheduling and analytics capabilities delivered in Sprint 33. It answers:

- How to model entity splitting (one entity becomes multiple)
- How to model co-seize (requiring multiple resource types simultaneously)
- How to model matching (pairing entities from different queues)
- How to use dynamic batch sizes based on entity attributes
- How to use new queue disciplines (SPT, EDD, PRIORITY by attribute)
- How to collect and analyze histograms and ANOVA results
- How resource failures are visualized on the Execute canvas

## New Macros

### SPLIT(EntityType, N, TargetQueue)

Creates N-1 clones of the context entity, all placed in TargetQueue. The original entity is marked as the split parent with `_splitChildren` tracking the clone IDs. Each clone has `_splitFrom` (parent ID) and `_splitIndex` (1 to N-1).

**Use case:** Document splitting into multiple copies for parallel review, batch disassembly into components, fork-join patterns.

**Example:**
```
SPLIT(Document, 3, ReviewQueue)
```

This creates 2 clones (N-1) of the context Document entity, all placed in ReviewQueue.

### COSEIZE(Queue, ServerType1, ServerType2[, ...])

Seizes one customer from the specified queue and simultaneously claims one server from each specified server type. If any server type has no idle servers, the macro fails immediately without seizing anything.

**Use case:** Surgical procedures requiring surgeon + anesthetist + nurse, assembly requiring multiple specialized tools.

**Example:**
```
COSEIZE(PatientQueue, Surgeon, Anesthetist, Nurse)
```

### MATCH(TypeA, QueueA, TypeB, QueueB, TargetQueue)

Waits for one entity from each of two queues, pairs them into a new batch entity, and routes to TargetQueue. Original entities are marked as `done` with `_matchedInto` referencing the new batch ID.

**Use case:** Order fulfillment (matching orders with inventory), pairing requests with responses, assembly of two component types.

**Example:**
```
MATCH(Order, OrderQueue, Item, ItemQueue, FulfillmentQueue)
```

## Enhanced Macros

### BATCH(QueueName, batchSize|Entity.attrName)

The BATCH macro now supports dynamic batch sizes via entity attribute references.

**Fixed batch size (existing):**
```
BATCH(PartsQueue, 5)
```

**Dynamic batch size (new):**
```
BATCH(PartsQueue, Entity.batchSize)
```

When using `Entity.attrName`, the batch size is read from the first waiting entity's attribute. This allows batch sizes to vary based on entity characteristics (e.g., order size, product type).

## New Queue Disciplines

### SPT — Shortest Processing Time

Entities are sorted by their `serviceTime` or `processingTime` attribute (ascending). Entities with shorter processing times are served first. FIFO tiebreaker on equal processing times.

**Use case:** Minimizing average wait time, favoring quick tasks.

**Configuration:**
```json
{ "name": "Queue", "discipline": "SPT" }
```

**Required entity attribute:** `serviceTime` or `processingTime` (number)

### EDD — Earliest Due Date

Entities are sorted by their `dueDate` attribute (ascending). Entities with earlier due dates are served first. FIFO tiebreaker on equal due dates.

**Use case:** Meeting deadlines, minimizing tardiness.

**Configuration:**
```json
{ "name": "Queue", "discipline": "EDD" }
```

**Required entity attribute:** `dueDate` (number)

### PRIORITY(attrName)

Entities are sorted by the specified attribute value (ascending). Lower values have higher priority. FIFO tiebreaker on equal priority values.

**Use case:** Custom priority schemes (urgency, customer tier, severity).

**Configuration:**
```json
{ "name": "Queue", "discipline": "PRIORITY(urgency)" }
```

**Required entity attribute:** The specified attribute name (number)

## Analytics Functions

### Histogram Collection

Two histogram functions are available in `src/engine/statistics.js`:

**`buildHistogram(values, options)`** — Equal-width bins
```javascript
import { buildHistogram } from './engine/statistics.js';

const hist = buildHistogram(waitTimes, { numBins: 10 });
// Returns: { bins: [{ low, high, count, density }], numBins, min, max, total }
```

**`buildHistogramFD(values, options)`** — Freedman-Diaconis automatic bin selection
```javascript
import { buildHistogramFD } from './engine/statistics.js';

const hist = buildHistogramFD(waitTimes);
// Uses IQR-based rule for optimal bin width
// Returns: { bins, numBins, min, max, total, method: 'freedman-diaconis' }
```

### One-Way ANOVA

**`oneWayANOVA(groups, options)`** — Tests whether group means differ significantly
```javascript
import { oneWayANOVA } from './engine/statistics.js';

const result = oneWayANOVA([
  [8.2, 9.1, 7.8, 8.5],  // Scenario A wait times
  [12.3, 11.8, 13.1, 12.7],  // Scenario B wait times
], { labels: ['Baseline', 'Variant'] });

// Returns: { k, n, grandMean, fStatistic, pValue, significant, groupStats, explanation }
```

**Key outputs:**
- `fStatistic` — F-test value
- `pValue` — Probability under null hypothesis
- `significant` — Whether p < 0.05
- `explanation` — Human-readable summary

### Tukey HSD Post-Hoc Test

**`tukeyHSD(groups, options)`** — Identifies which specific group pairs differ after significant ANOVA
```javascript
import { tukeyHSD } from './engine/statistics.js';

const result = tukeyHSD([groupA, groupB, groupC], { labels: ['A', 'B', 'C'] });

// Returns: { comparisons: [{ groupA, groupB, meanDiff, significant, ... }], anySignificant, explanation }
```

## Resource Failure Visualization (G16)

The Execute canvas Activity nodes now display failed server state:

- **Dot grid:** Failed servers shown as red dots (■), busy as teal (■), idle as outlined (□)
- **Text fallback:** Shows "X failed" indicator when capacity exceeds dot limit
- **Warning badge:** "⚠ N failed" shown below utilisation percentage

Failed servers are excluded from the busy/idle counts but included in total capacity.

## Debugging

### Trace Entries

New macro executions appear in the Step Log:

```
[t=5.000] B: "Split"  ·  SPLIT: #1 → 2 clones [#2, #3] → "OutputQueue"
[t=6.000] C: "Co-Seize"  ·  #1 → serving by #2 (Surgeon), #3 (Anesthetist)
[t=7.000] C: "Match"  ·  #1 (Order) + #2 (Item) → #3 → "FulfillmentQueue"
```

### Entity Attributes

Split and matched entities carry tracking attributes:

- `_splitParent: true` — Original entity that was split
- `_splitChildren: [id1, id2, ...]` — IDs of clone entities
- `_splitFrom: parentId` — Parent ID for clone entities
- `_splitIndex: N` — Clone index (1 to N-1)
- `_matchedInto: batchId` — References the batch entity created by MATCH

## Testing

All Sprint 33 features are covered by 37 new tests in `tests/engine/sprint-33-features.test.js`:

- G09: Dynamic batch size (5 tests)
- G12: Histogram collector (7 tests)
- G13: ANOVA analysis (8 tests)
- SPLIT macro (2 tests)
- COSEIZE macro (3 tests)
- MATCH macro (3 tests)
- New queue disciplines (3 tests)
- Tukey HSD (4 tests)

## Migration Notes

- Existing BATCH macros with fixed integer batch sizes continue to work unchanged
- Existing queue disciplines (FIFO, LIFO, PRIORITY) continue to work unchanged
- New queue disciplines require corresponding entity attributes to be defined
- COSEIZE requires all specified server types to have at least one idle server
- MATCH consumes entities from both queues — ensure sufficient entities in both queues before the condition fires
