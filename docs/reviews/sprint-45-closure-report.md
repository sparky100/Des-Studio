# Sprint 45 — Closure Report
**Sprint:** 45 — AI Prompt Grounding
**Completed:** 2026-05-16
**Branch:** sprint-45 (PR #40)

## Delivered Scope
| Item | Description | Result |
|------|-------------|--------|
| S45.1 | buildKpis() enriched with maxSojourn, avgWIP, totalCost, costPerServed, containerLevels, warnings | ✅ Done |
| S45.2 | extractResources() enriched with count, failureModel dist params, shiftSchedule summary | ✅ Done |
| S45.3 | extractQueues() enriched with overflowDestination | ✅ Done |
| S45.4 | New extractBEvents() helper — compact B-event digest | ✅ Done |
| S45.5 | New extractCEvents() helper — compact C-event digest | ✅ Done |
| S45.6 | New extractEntityAnomalies() helper — anomaly summary with byType breakdown | ✅ Done |
| S45.7 | buildSuggestionPrompt() payload expanded with full model structure | ✅ Done |
| S45.8 | buildNarrativePrompt() expanded with stateVariables, phaseCTruncated caveat, cost/WIP instructions | ✅ Done |
| S45.9 | System prompt reasoning guidance updated; MAX_PROMPT_WORDS raised 1500→2000 | ✅ Done |

## Detail

### S45.1 — buildKpis() Enrichment
**Problem:** The KPI payload sent to the LLM included only basic throughput and wait-time statistics, omitting WIP levels, cost accounting, container states, and engine cautions.

**What was built:** buildKpis() in src/llm/prompts.js was extended to extract and include: maxSojourn (the longest observed entity sojourn time, useful for identifying worst-case behaviour), avgWIP (average entities-in-system across the run), totalCost and costPerServed (from COST macro accumulations), a containerLevels map keyed by container name with current/mean/max level values, a warning_phaseCTruncated boolean set when the engine reports that the Phase C scan was curtailed due to time pressure, and a warnings array for any other engine-reported cautions.

**Files changed:** src/llm/prompts.js

**Key design decisions:** warning_phaseCTruncated is surfaced as a top-level boolean rather than buried in the warnings array because it requires a specific narrative caveat instruction — the LLM must warn the user that conditional event results may be incomplete.

### S45.2 — extractResources() Enrichment
**Problem:** Resource entries in the prompt payload showed only name and utilisation. The LLM could not reason about server capacity, failure characteristics, or shift patterns.

**What was built:** extractResources() was extended to add: count (number of server units in this resource pool), failureModel containing mtbfDist, mtbfDistParams, mttrDist, and mttrDistParams when a failure model is configured on the resource (drawn from the model's resource definition), and a shiftSchedule summary string (e.g., "3 shifts: 08:00–16:00, 16:00–00:00, 00:00–08:00") when shift configuration is present.

**Files changed:** src/llm/prompts.js

**Key design decisions:** Failure model parameters are included verbatim rather than summarised because the LLM benefits from knowing the actual distribution types (e.g., Weibull vs Exponential MTBF implies very different failure clustering behaviour).

### S45.3 — extractQueues() Enrichment
**Problem:** Queue overflow routing was configured in the model but invisible to the AI, preventing it from reasoning about load-shedding behaviour.

**What was built:** extractQueues() was extended to include overflowDestination (the name of the queue or entity destination to which entities are routed when the queue is full) when present on the queue definition.

**Files changed:** src/llm/prompts.js

### S45.4 — extractBEvents() Helper
**Problem:** B-event configurations — the primary behavioural logic of a DES model — were entirely absent from the prompt payload. The LLM could not see what effects, routing, balking, or loop guards were configured.

**What was built:** extractBEvents(model) is a new exported function that iterates model.bEvents and returns a compact digest array. Each digest contains: effectTypes (array of unique macro names used in the event's effects, e.g., ["SEIZE", "COST", "PREEMPT"]), routing type (direct, weighted, conditional), balkMode (none, probability, or condition, drawn from ev.balkCondition and existing probability field), loopGuard (boolean, true when ev.loopConfig is set), arrivalStreams (count of configured arrival streams), hasReneging (boolean), and fireCount (total times this event fired in the run, from event statistics).

**Files changed:** src/llm/prompts.js

**Key design decisions:** effectTypes uses unique names rather than the full effects array to keep the digest compact. The LLM needs to know that PREEMPT is used somewhere in the event, not the exact argument values, for reasoning purposes.

### S45.5 — extractCEvents() Helper
**Problem:** C-events (conditional events — Phase C of Pidd's method) were entirely absent from the prompt payload.

**What was built:** extractCEvents(model) is a new exported function that iterates model.cEvents and returns a compact digest array. Each digest contains: effectTypes (same format as B-events) and priority (the C-event's evaluation priority order within the Phase C scan).

**Files changed:** src/llm/prompts.js

### S45.6 — extractEntityAnomalies() Helper
**Problem:** Entity anomaly data was computed in the Sprint 44 EntitySummaryTable UI component but never fed back to the AI, breaking the loop between what the user sees and what the AI can discuss.

**What was built:** extractEntityAnomalies(runResult) is a new exported function that applies the same 3× mean wait threshold as the Sprint 44 UI component. It returns: anomalyCount (total anomalous entities), anomalyRate (anomalyCount / total entities), worstWait (maximum wait time observed), byType (object mapping entity type name to that type's anomaly count), and threshold (the computed 3× mean value, included so the LLM can cite it in its output).

**Files changed:** src/llm/prompts.js

**Key design decisions:** Using the identical threshold as the UI component ensures the AI and the visual panel agree on what constitutes an anomaly. The threshold value is passed explicitly so the LLM can write sentences like "8 entities waited more than 3× the mean (threshold: 4.2 min)."

### S45.7 — buildSuggestionPrompt() Payload Expansion
**Problem:** The six-step suggestion framework from Sprint 43 was producing better-structured suggestions but they remained generic because the LLM could not see the model's behavioural configuration.

**What was built:** buildSuggestionPrompt() was updated to include the full set of new extracts in its payload: bEvents digest (from extractBEvents), cEvents digest (from extractCEvents), stateVariables (moved from being available only in query context to being always included), entityAnomalies (from extractEntityAnomalies), and all enriched KPIs from S45.1. The payload section of the prompt was restructured with clear labelled sections for each data category.

**Files changed:** src/llm/prompts.js

### S45.8 — buildNarrativePrompt() Expansion
**Problem:** The narrative prompt produced generic summaries that ignored cost, WIP, state variable dynamics, and the risk of incomplete Phase C results.

**What was built:** buildNarrativePrompt() was extended to include: stateVariables from the model definition, an explicit instruction to add a caveat sentence when warning_phaseCTruncated is true (e.g., "Note: Phase C scan was truncated — conditional event results may be incomplete"), and an explicit instruction to mention cost per served entity and average WIP when totalCost and avgWIP are non-zero in the KPIs.

**Files changed:** src/llm/prompts.js

### S45.9 — System Prompt and MAX_PROMPT_WORDS Update
**Problem:** The system prompt did not guide the LLM on how to reason about failure models, loop guards, or state variables. The 1500-word limit was too tight for the expanded payload.

**What was built:** The system prompt in src/llm/prompts.js was updated with three new reasoning guidance paragraphs: one explaining that failure models imply MTBF/MTTR trade-offs and that high MTTR relative to MTBF is the primary failure-driven bottleneck; one explaining that loop guards prevent infinite recirculation and that a high fireCount on a looped B-event may indicate the maxLoopCount is being hit; one explaining that state variables represent cross-event shared state and that unexpected values may indicate sequencing bugs. MAX_PROMPT_WORDS was raised from 1500 to 2000 to accommodate the richer payloads.

**Files changed:** src/llm/prompts.js

## Test Results
13 new tests were added to tests/llm/prompts.test.js covering: extractBEvents return shape, extractCEvents return shape, extractEntityAnomalies threshold computation and byType grouping, buildKpis enriched fields, extractResources failure model inclusion, and buildSuggestionPrompt payload completeness assertions. Total test count reached 1248. All 1248 tests pass. A capability document was written at docs/sprint-45-ai-prompt-grounding-guide.md.

## What's Next
With prompt grounding complete, the AI can now reason about the full model structure. Potential follow-on work includes: structured suggestion parsing in the UI (consuming the mandated JSON output schema from Sprint 43), per-suggestion apply-to-model actions, and multi-run comparison prompts that contrast two run configurations rather than analysing a single run.
