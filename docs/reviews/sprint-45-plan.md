# Sprint 45 — AI Prompt Grounding
**Sprint:** 45 — AI Prompt Grounding
**Branch:** sprint-45 (PR #40)
**Date:** 2026-05-16

## Objective
The AI suggestion and narrative prompts had visibility only into KPIs and goal gaps. The full structural richness of the model — failure models, loop guards, balk conditions, state variables, cost tracking, container levels, B-event and C-event configurations, and entity anomalies — was invisible to the LLM. This sprint grounds both prompts in the complete model structure so the AI can reason about the actual configured system rather than a KPI-only shadow of it.

## Background
The prompts built in Sprint 43 improved suggestion quality through structured reasoning and goal gap awareness. However, the payload sent to the LLM contained only aggregated KPIs, goal gap data, and basic resource/queue names. A suggestion to "consider preemption" was impossible for the AI to make because it could not see whether preemption was already configured in a B-event. A narrative referencing "high costs" was impossible because cost totals were not in the payload. Entity anomaly patterns were computed in the UI (Sprint 44) but never fed back to the AI. State variables defined in the model were not included. The result was an AI that sounded generic because it lacked specificity about the actual model.

## Scope
| ID | Item | File(s) |
|----|------|---------|
| S45.1 | buildKpis() enriched — maxSojourn, avgWIP, totalCost, costPerServed, containerLevels, warnings | src/llm/prompts.js |
| S45.2 | extractResources() enriched — count, failureModel (dist params), shiftSchedule summary | src/llm/prompts.js |
| S45.3 | extractQueues() enriched — overflowDestination field added | src/llm/prompts.js |
| S45.4 | New extractBEvents() helper — compact B-event digest per event | src/llm/prompts.js |
| S45.5 | New extractCEvents() helper — compact C-event digest per event | src/llm/prompts.js |
| S45.6 | New extractEntityAnomalies() helper — anomaly summary with byType breakdown | src/llm/prompts.js |
| S45.7 | buildSuggestionPrompt() payload expanded — bEvents, cEvents, stateVariables, entityAnomalies, enriched KPIs | src/llm/prompts.js |
| S45.8 | buildNarrativePrompt() expanded — stateVariables, phaseCTruncated caveat, cost/WIP mention instructions | src/llm/prompts.js |
| S45.9 | System prompt instructions updated — failure model, loop guard, state variable reasoning; MAX_PROMPT_WORDS 1500→2000 | src/llm/prompts.js |

## Acceptance Criteria
- buildKpis() includes maxSojourn, avgWIP, totalCost, costPerServed, and a containerLevels map (keyed by container name); includes a warning_phaseCTruncated boolean and a warnings array for any engine-reported cautions
- extractResources() includes a count field (number of server units), a failureModel object with mtbfDist, mtbfDistParams, mttrDist, mttrDistParams when a failure model is configured, and a shiftSchedule summary string when shifts are configured
- extractQueues() includes overflowDestination when the queue has an overflow route configured
- extractBEvents(model) returns an array of compact digests, one per B-event, each containing: effectTypes (array of macro names used), routing type, balkMode, loopGuard (boolean), arrivalStreams (count), hasReneging (boolean), fireCount
- extractCEvents(model) returns an array of compact digests, one per C-event, each containing: effectTypes, priority
- extractEntityAnomalies(runResult) returns { anomalyCount, anomalyRate, worstWait, byType, threshold } using the same 3× mean threshold as the UI component in Sprint 44
- buildSuggestionPrompt() includes bEvents digest, cEvents digest, stateVariables (previously available only in query context), entityAnomalies, and all enriched KPIs in its payload
- buildNarrativePrompt() includes stateVariables, includes an instruction to caveat the narrative when phaseCTruncated is true, and includes an instruction to mention cost and WIP when those metrics are present
- System prompt reasoning guidance explicitly addresses failure models (MTBF/MTTR implications), loop guards (recirculation risk), and state variables (cross-event coupling)
- MAX_PROMPT_WORDS constant is raised from 1500 to 2000
- 13 new prompt tests are added; total test count reaches 1248
- Capability doc written at docs/sprint-45-ai-prompt-grounding-guide.md

## Dependencies
- Sprint 42: loop guard (ev.loopConfig) and balk condition (ev.balkCondition) model fields must be present in model schema
- Sprint 43: buildSuggestionPrompt and buildNarrativePrompt exist; buildGoalGaps used for stateVariables context
- Sprint 44: entity anomaly detection threshold logic (3× mean) established — extractEntityAnomalies must use the same threshold for consistency
- Engine must produce totalCost, avgWIP, containerLevels, and warning_phaseCTruncated in run results
- Model schema must have stateVariables at model.stateVariables
