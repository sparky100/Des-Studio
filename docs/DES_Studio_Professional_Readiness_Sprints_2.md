# simmodlr — Professional Readiness Sprint Plan
## Implementing R1–R5 of the Studio Platform Professional Readiness Standard v1.0

**Version:** 1.0 | **Date:** May 2026 | **Sprint baseline:** 55a

---

## 1. Current State and Gap Analysis

simmodlr at Sprint 55a is a substantive tool. The engine correctly implements the Three-Phase Method with 1,248 passing tests, mulberry32 PRNG, full macro vocabulary, parallel replication workers, confidence intervals, warmup removal, parametric sweep, and ANOVA. This is not a prototype.

However, five requirements defined in the Studio Platform Professional Readiness Standard v1.0 must be satisfied before results may be used in professional consultancy work.

| Requirement | Current status | Primary gap |
|---|---|---|
| R1 — Numerical Accuracy | ⚠ Partial | M/M/1 and M/M/c benchmarks exist but run manually. 6 of 8 benchmarks missing. CI gate not in GitHub Actions. |
| R2 — Reproducibility | ⚠ Partial | mulberry32 implemented. `run_results` does NOT store `model_snapshot` as a verbatim copy. Reproduce Run function absent. |
| R3 — Run Integrity | ✗ Not met | No immutable `model_snapshot` column. No database-level immutability trigger. No auto-assigned run labels. |
| R4 — Professional Output | ✗ Not met | JSON and CSV export exist. No structured .docx report with the 7 required sections. |
| R5 — Modelling Scope Honesty | ⚠ Partial | No formal Capability Register. No in-tool warnings for unsupported scenarios. |

> **Sprint dependency order:** PR-1 (run record schema) must complete before PR-3 (report) and PR-4 (shared URL). PR-2 (benchmark CI gate) is independent and may run in parallel with PR-1.

---

## 2. Sprint Overview

| Sprint | Name | Requirement(s) | Key deliverable |
|---|---|---|---|
| PR-1 | Run Record Integrity | R2 + R3 | `model_snapshot` column, immutability trigger, Reproduce Run |
| PR-2 | Benchmark CI Gate | R1 | Full 8-benchmark register, GitHub Actions gate, `performance-envelope.md` |
| PR-3 | Report Generation | R4 | 7-section .docx report, Export Report button, LLM narrative stored at run time |
| PR-4 | Shared URL Enhancement | R2 + R4 | Shared run view with provenance header, pre-computed narrative, Download Report |
| PR-5 | Capability Register | R5 | Formal register, in-tool scope warnings, readiness gate document |

---

---

# SPRINT PR-1 — Run Record Integrity
**Addresses:** R2 + R3

The `run_results` table currently stores summary statistics and experiment config but not the model that produced them. This is the most important gap for professional use: without an immutable model snapshot in the run record, results cannot be audited and Reproduce Run cannot work.

> **Why PR-1 is first:** Every other professional readiness deliverable depends on the run record being correct. The report (PR-3) reads `model_snapshot` for Section 2. The shared URL (PR-4) reads `narrative_text` stored in the run record. The R2 gate cannot be closed without Reproduce Run. Get the schema right first, before building anything on top of it.

---

## PR-1 · Prompt 1 of 3 — Supabase Schema Migration

Read CLAUDE.md before writing any code. Do not proceed to Prompt 2 until the migration has been applied and verified in the Supabase Table Editor.

```
Read CLAUDE.md before writing any code.

We are implementing Sprint PR-1 of the simmodlr Professional Readiness plan.
This prompt applies a database schema migration that adds model_snapshot to
run_results and enforces immutability. No UI changes. No engine changes.

TASK 1: Write supabase/migrations/PR-001_run_record_integrity.sql

The migration must:

1. Add the following columns to run_results if not already present:
     model_snapshot          JSONB    -- verbatim model JSON at run time
     engine_version          TEXT     -- e.g. '55a'
     prng_algorithm          TEXT DEFAULT 'mulberry32'
     base_seed               BIGINT   -- the integer seed used for this run
     run_label               TEXT NOT NULL DEFAULT ''
     narrative_text          TEXT     -- pre-computed LLM narrative (nullable)
     model_description_text  TEXT     -- pre-computed LLM description (nullable)

2. Create an immutability trigger that prevents modification of:
   model_snapshot, engine_version, prng_algorithm, base_seed,
   experiment_config, results (the existing summary column), run_at.
   Mutable fields (run_label, archived, tags) are NOT protected.
   narrative_text and model_description_text may be SET once from null
   but NOT changed after being set to a non-null value.

   CREATE OR REPLACE FUNCTION run_results_immutable_check()
   RETURNS TRIGGER LANGUAGE plpgsql AS $$
   BEGIN
     IF (OLD.model_snapshot IS DISTINCT FROM NEW.model_snapshot AND
         OLD.model_snapshot IS NOT NULL) THEN
       RAISE EXCEPTION 'run_results: model_snapshot is immutable after insert';
     END IF;
     IF (OLD.engine_version IS DISTINCT FROM NEW.engine_version AND
         OLD.engine_version IS NOT NULL) THEN
       RAISE EXCEPTION 'run_results: engine_version is immutable after insert';
     END IF;
     IF (OLD.prng_algorithm IS DISTINCT FROM NEW.prng_algorithm AND
         OLD.prng_algorithm IS NOT NULL) THEN
       RAISE EXCEPTION 'run_results: prng_algorithm is immutable after insert';
     END IF;
     IF (OLD.base_seed IS DISTINCT FROM NEW.base_seed AND
         OLD.base_seed IS NOT NULL) THEN
       RAISE EXCEPTION 'run_results: base_seed is immutable after insert';
     END IF;
     IF (OLD.narrative_text IS NOT NULL AND
         OLD.narrative_text IS DISTINCT FROM NEW.narrative_text) THEN
       RAISE EXCEPTION 'run_results: narrative_text cannot be changed once set';
     END IF;
     IF (OLD.model_description_text IS NOT NULL AND
         OLD.model_description_text IS DISTINCT FROM NEW.model_description_text) THEN
       RAISE EXCEPTION 'run_results: model_description_text cannot be changed once set';
     END IF;
     RETURN NEW;
   END;
   $$;

   CREATE TRIGGER run_results_immutability
     BEFORE UPDATE ON run_results
     FOR EACH ROW EXECUTE FUNCTION run_results_immutable_check();

3. Auto-assign run_label on insert if blank:

   CREATE OR REPLACE FUNCTION run_results_auto_label()
   RETURNS TRIGGER LANGUAGE plpgsql AS $$
   BEGIN
     IF NEW.run_label = '' OR NEW.run_label IS NULL THEN
       NEW.run_label := COALESCE(
         (SELECT name FROM models WHERE id = NEW.model_id LIMIT 1), 'Run'
       ) || ' — ' || TO_CHAR(NOW(), 'DD Mon YYYY') || ' — ' ||
       COALESCE(NEW.base_seed::TEXT, 'auto');
     END IF;
     RETURN NEW;
   END;
   $$;

   CREATE TRIGGER run_results_label_on_insert
     BEFORE INSERT ON run_results
     FOR EACH ROW EXECUTE FUNCTION run_results_auto_label();

4. Add indexes:
   CREATE INDEX IF NOT EXISTS run_results_model_id_idx ON run_results(model_id);
   CREATE INDEX IF NOT EXISTS run_results_run_at_idx ON run_results(run_at DESC);

TASK 2: Verify the migration with this query after applying:
  SELECT column_name, data_type, is_nullable
  FROM information_schema.columns
  WHERE table_name = 'run_results'
  ORDER BY ordinal_position;

TASK 3: Confirm both triggers are visible in Supabase Dashboard > Database > Triggers.

ACCEPTANCE CRITERIA:
  □ Migration file exists at supabase/migrations/PR-001_run_record_integrity.sql
  □ All new columns present in run_results
  □ Immutability trigger created and visible in Supabase Dashboard
  □ Auto-label trigger created
  □ npm test passes (no existing tests broken by schema change)
```

---

## PR-1 · Prompt 2 of 3 — Write model_snapshot at Run Time

```
Read CLAUDE.md before writing any code.
Confirm the PR-001 migration is applied and verified before starting.

We are wiring model_snapshot into the run record write path.

TASK 1: Search for all run record write paths
  Run: grep -rn "run_results\|createRun\|insertRun\|saveRun" src/
  List every file and line found. Do not modify anything yet.
  Report the list before writing any code.

TASK 2: Create src/db/runRecord.js

  Export function buildRunRecord(model, results, experimentConfig, resolvedSeed):

  export const buildRunRecord = (model, results, experimentConfig, resolvedSeed) => {
    // CRITICAL: deep clone the model at this exact moment.
    // The snapshot must never reference the live model object.
    // Any subsequent edit to the model must NOT affect this snapshot.
    const snapshot = JSON.parse(JSON.stringify(model));

    return {
      model_id:         model.id,
      model_snapshot:   snapshot,
      engine_version:   import.meta.env.VITE_ENGINE_VERSION || '55a',
      prng_algorithm:   'mulberry32',
      base_seed:        resolvedSeed,
      experiment_config: {
        maxSimTime:           experimentConfig.maxSimTime,
        warmupPeriod:         experimentConfig.warmupPeriod,
        replications:         experimentConfig.replications,
        seed:                 resolvedSeed,
        terminationMode:      experimentConfig.terminationMode,
        terminationCondition: experimentConfig.terminationCondition ?? null,
      },
      summary:   results.summary ?? results,
      run_label: '',  // auto-assigned by DB trigger
      // narrative_text and model_description_text: written separately after LLM calls
    };
  };

  Also export updateRunNarrative(runId, narrativeText, modelDescriptionText):
    Updates only narrative_text and model_description_text.
    Only sets each field if it is currently null (WHERE narrative_text IS NULL).
    Never modifies immutable fields.

TASK 3: Update every run record write path found in Task 1
  Replace all direct run record object construction with buildRunRecord().
  Verify that model_snapshot is always the deep clone, never the live reference.

TASK 4: Resolve seed before every run
  In the Execute panel wherever Run is initiated:
    const resolvedSeed = experimentConfig.seed != null
      ? experimentConfig.seed
      : Math.floor(Math.random() * 2147483647);
  Store resolvedSeed in component state before calling the engine.
  Pass resolvedSeed to buildRunRecord().
  Display resolvedSeed in the Execute panel: "Seed: [resolvedSeed]"

TASK 5: Add VITE_ENGINE_VERSION to .env.example
  VITE_ENGINE_VERSION=55a
  Increment this manually whenever the engine changes.

TASK 6: Write the snapshot immutability test
  Create tests/db/runRecord.test.js:

  test('model_snapshot is a deep clone independent of the live model', () => {
    const model = { id: '1', name: 'Test', entityTypes: [{ name: 'A' }] };
    const record = buildRunRecord(model, {summary:{}}, {}, 42);
    // Mutate the live model after snapshot is taken
    model.name = 'MUTATED';
    model.entityTypes[0].name = 'MUTATED';
    // Snapshot must be unchanged
    expect(record.model_snapshot.name).toBe('Test');
    expect(record.model_snapshot.entityTypes[0].name).toBe('A');
  });

ACCEPTANCE CRITERIA:
  □ buildRunRecord and updateRunNarrative exported from src/db/runRecord.js
  □ All run record writes use buildRunRecord()
  □ Snapshot immutability test passes
  □ resolvedSeed displayed in Execute panel
  □ npm test passes
```

---

## PR-1 · Prompt 3 of 3 — Reproduce Run Function

```
Read CLAUDE.md before writing any code.
Confirm PR-1 Prompt 2 tests pass before starting.

TASK 1: Add Reproduce Run button to the run history view
  Each past run row in the History panel gets a "Reproduce" button.

  On click:
    1. Load the full run record via getRun(runId) to get model_snapshot,
       base_seed, and experiment_config.
    2. Run the engine using run.model_snapshot (NOT the current model)
       and { ...run.experiment_config, seed: run.base_seed }.
    3. Compare new result to stored result:

       function compareResults(newResult, storedResult) {
         const fields = ['served','avgWait','avgSvc','avgSojourn','reneged'];
         return fields.every(f =>
           Math.abs((newResult.summary[f] || 0) -
                    (storedResult.summary[f] || 0)) < 0.0001
         );
       }

    4. Show a result banner:
       PASS: green "✓ Reproduce confirmed — results are bit-identical."
       FAIL: red "✗ Reproduce failed. Stored engine: v[run.engine_version],
             current: v[current]. Results may differ due to engine changes."

TASK 2: Model-modified indicator
  In the Execute panel and run history, after results from a past run are loaded:
    const isModified = JSON.stringify(currentModel) !==
                       JSON.stringify(run.model_snapshot);
  If true, show an amber banner:
    "⚠ Model has been modified since this run. Results shown are from the
     saved run record, not the current model. Run again for updated results."

TASK 3: Store narrative_text and model_description_text after run
  After a run completes and LLM narrative calls return:
    await updateRunNarrative(runId, narrativeText, modelDescriptionText)
  Both fields: only set if currently null.
  Use the updateRunNarrative function from Prompt 2.

TASK 4: Tests
  tests/db/runRecord.test.js (add to existing file):
    - compareResults: two identical summaries → true
    - compareResults: summaries differing by < 0.0001 → true
    - compareResults: summaries differing by 0.01 → false

  tests/ui/ReproduceRun.test.jsx:
    - Mock getRun returning run with model_snapshot and base_seed
    - Mock engine run returning same summary → green banner shown
    - Mock engine run returning different summary → red banner shown
    - model_snapshot used as input (not current model)

PR-1 EXIT GATE:
  □ npm test passes (all tests including new ones)
  □ Manual: Run a model. Check Supabase Table Editor — model_snapshot
    is populated as full model JSON, not null, not a model_id reference.
  □ Manual: Edit the model after running. Execute panel shows amber
    "model modified" banner.
  □ Manual: Click Reproduce Run — green "bit-identical" banner appears.
  □ Manual: Edit model, save, check Supabase — model_snapshot in the
    existing run record has NOT changed. Immutability trigger is working.
  □ Manual: narrative_text in Supabase is non-null after a run that
    called the LLM narrative prompt.
```

---

---

# SPRINT PR-2 — Benchmark CI Gate
**Addresses:** R1 | **Can run in parallel with PR-1**

simmodlr already has M/M/1 and M/M/c benchmarks that pass manually. This sprint adds the six missing benchmarks, tightens the M/M/1 tolerance from 5% to 2%, wires the benchmark suite into GitHub Actions so the build fails on any breach, and documents results in `performance-envelope.md`.

---

## PR-2 · Prompt 1 of 2 — Complete the Benchmark Register

```
Read CLAUDE.md before writing any code.

We are completing the simmodlr benchmark register to all 8 required benchmarks.
The existing M/M/1 and M/M/c benchmarks pass at 5% tolerance.

TASK 1: Tighten M/M/1 tolerance to ±2%
  In the existing M/M/1 benchmark test, change the tolerance assertion
  from 5% to 2%. The current measured error is 1.48% so this will still pass.
  Update docs/performance-envelope.md to reflect the tighter tolerance.

TASK 2: Benchmark 3 — M/G/1 mean wait (Pollaczek-Khinchine)
  Model: lambda=0.9, mu=1.0, Uniform[0,2] service time.
  Expected Wq by P-K formula:
    rho = 0.9
    E[S^2] = Var[S] + (E[S])^2 = 1/3 + 1 = 4/3
    Wq = (lambda * E[S^2]) / (2 * (1 - rho)) = (0.9 * 4/3) / 0.2 = 6.0
  Tolerance: ±3%
  Run 30 replications, warmupPeriod=10000, maxSimTime=50000.
  Assert: CI mean of avgWait within 3% of 6.0.

TASK 3: Benchmark 4 — M/M/1/K finite queue loss probability
  Model: lambda=2.0, mu=1.0, queue capacity K=5.
  Expected loss probability (M/M/1/K closed form):
    rho = 2.0
    P_loss = rho^K * (1-rho) / (1 - rho^(K+1))
           = 32 * (-1) / (1 - 64) = 32/63 ≈ 0.508
  Tolerance: ±3%
  Assert: balked / (arrived + balked) within 3% of 0.508.
  Run 20 replications, warmupPeriod=5000, maxSimTime=30000.

TASK 4: Benchmark 5 — Priority queue ordering (qualitative directional)
  Model: Two entity types (HighPriority, LowPriority), one server.
    HighPriority: arrival rate Exp(0.4), priority attribute = 1
    LowPriority:  arrival rate Exp(0.4), priority attribute = 2
    Service: Exp(1.0) for both. Queue discipline: PRIORITY.
  Expected: HighPriority mean wait < LowPriority mean wait.
  Run 20 replications, warmupPeriod=1000, maxSimTime=10000.
  Assert: highPriority.avgWait < lowPriority.avgWait (directional — no formula).

TASK 5: Benchmark 6 — PREEMPT correctness (qualitative directional)
  Model: One server, two entity types.
    All arrivals: Exp(0.9), service Exp(1.0), 90% utilisation.
    HighPriority entities use PREEMPT when server is busy.
  Expected: LowPriority mean wait is greater than M/M/1 baseline of 9.0.
    (Preemption adds wait for the interrupted lower-priority entity.)
  Assert: lowPriority.avgWait > 9.0
  Run 15 replications, warmupPeriod=2000, maxSimTime=20000.

TASK 6: Benchmark 7 — Warmup removal correctness
  Model: M/M/1, lambda=0.9, mu=1.0.
    Run A: warmupPeriod=0, maxSimTime=10000, 20 replications.
    Run B: warmupPeriod=500, maxSimTime=10000, 20 replications.
  Expected: post-warmup mean (Run B) is closer to analytical 9.0
    than the no-warmup mean (Run A).
  Assert: Math.abs(runB.mean - 9.0) < Math.abs(runA.mean - 9.0)
  This confirms warmup removal improves accuracy.

TASK 7: Benchmark 8 — Seeded reproducibility (exact)
  Run the M/M/1 model twice with identical seed=42.
    Both runs: 5 replications, warmupPeriod=1000, maxSimTime=5000.
  Assert: every field in run1.aggregateStats === run2.aggregateStats
    (exact equality — not within tolerance).
  This is a formal verification of what mulberry32 should already guarantee.

TASK 8: Update docs/performance-envelope.md
  Add a complete benchmark table:
  | # | Name | Expected | Tolerance | Actual result | Pass/Fail |
  Fill in actual results after running. Mark 1-2 as existing, 3-8 as new.

ACCEPTANCE CRITERIA:
  □ All 8 benchmark tests exist in tests/engine/benchmarks/
  □ npm run bench exits with 0 failures
  □ M/M/1 tolerance tightened to ±2% and still passing (1.48% < 2%)
  □ docs/performance-envelope.md updated with all 8 actual results
```

---

## PR-2 · Prompt 2 of 2 — GitHub Actions CI Gate

```
Read CLAUDE.md before writing any code.
Confirm all 8 benchmarks pass locally (npm run bench) before starting.

TASK 1: Create .github/workflows/benchmark-gate.yml

  name: Benchmark Gate

  on:
    push:
      paths:
        - 'src/engine/**'
        - 'tests/engine/benchmarks/**'
    pull_request:
      paths:
        - 'src/engine/**'

  jobs:
    benchmarks:
      runs-on: ubuntu-latest
      steps:
        - uses: actions/checkout@v4
        - uses: actions/setup-node@v4
          with:
            node-version: '20'
            cache: 'npm'
        - run: npm ci
        - name: Run benchmark suite
          run: npm run bench
        - name: Verify no Math.random in engine
          run: |
            count=$(grep -rn "Math.random" src/engine/ | wc -l)
            echo "Math.random occurrences in src/engine/: $count"
            if [ "$count" -gt "0" ]; then
              echo "FAIL: Math.random found in engine"
              grep -rn "Math.random" src/engine/
              exit 1
            fi
            echo "PASS: No Math.random in engine"

TASK 2: Add benchmark badge to README.md
  Near the top of README.md, add:
  ![Benchmark Gate](https://github.com/sparky100/simmodlr/actions/workflows/benchmark-gate.yml/badge.svg)

TASK 3: Confirm package.json bench script
  Ensure "bench" script exists:
  "bench": "vitest run tests/engine/benchmarks --environment node --reporter verbose"

TASK 4: Add performance timing test
  Create tests/engine/benchmarks/performance.test.js:
    Construct a model with 3 entity types, 4 queues, 6 B-events, 4 C-events.
    Run with maxSimTime=10000, replications=1, no warmup.
    Measure wall-clock time.
    Assert: completes in < 3000ms.
    Log: console.log('Performance: ' + elapsed + 'ms')
    Record in docs/performance-envelope.md under "Performance timing".

PR-2 EXIT GATE:
  □ npm run bench passes locally with 0 failures (all 8 benchmarks)
  □ .github/workflows/benchmark-gate.yml committed and pushed
  □ GitHub Actions run completes — green badge visible in repository
  □ Math.random grep check passes in CI output
  □ docs/performance-envelope.md complete with all 8 actual results
  □ README.md shows benchmark badge
```

---

---

# SPRINT PR-3 — Report Generation
**Addresses:** R4 | **Requires PR-1 complete**

This sprint implements the 7-section .docx report and adds the two LLM calls that pre-compute and store `narrative_text` and `model_description_text` in the run record at run completion time.

---

## PR-3 · Prompt 1 of 3 — New LLM Prompt Builders

```
Read CLAUDE.md before writing any code.
Confirm PR-1 is fully complete (model_snapshot in run_results, immutability confirmed).

TASK 1: Add buildModelDescriptionPrompt(model) to src/llm/prompts.js

  Returns a prompt string that asks the LLM to write 120-180 words of
  plain English describing the model for a non-technical client.

  System instruction (embed verbatim):
    "Describe the following simmodlr model in 120-180 words of plain English
     for a non-technical client audience. Do not use any of these words:
     entity, macro, B-event, C-event, Phase, ARRIVE, COMPLETE, RELEASE,
     ASSIGN, queue discipline, FIFO, LIFO, PRIORITY. Describe the real-world
     system the model represents, what arrives, where waiting occurs, what
     provides service, and what the key constraints are. Tone: professional,
     clear, suitable for a board-level audience."

  User message context to include:
    - model.name and model.description
    - Customer entity type names
    - Server entity type names with counts
    - Queue names
    - Whether MTBF/MTTR is configured on any server type (boolean)
    - Whether shift schedules are configured (boolean)
    - Whether COST() appears in any effect array (boolean)
    - Goal labels and targets
  max_tokens: 400

TASK 2: Add buildReportRecommendationsPrompt(model, results) to src/llm/prompts.js

  System instruction (embed verbatim):
    "Generate exactly 3 prioritised recommendations based on this simulation.
     Each must be grounded in the data provided. Respond ONLY with a JSON array.
     No preamble. No markdown fences. Schema:
     [{
       priority: number,
       headline: string (10 words max),
       finding: string (1-2 sentences with specific numbers from the data),
       action: string (1-2 sentences, concrete and specific),
       expectedImpact: string (1 sentence),
       confidence: 'HIGH' | 'MEDIUM' | 'LOW'
     }]
     confidence rules: HIGH = finding supported by replicated CI data;
     MEDIUM = single run or directional; LOW = inferred or uncertain."

  User message context: same KPI grounding as buildSuggestionPrompt
  (goal gaps, utilisation, wait percentiles, anomaly counts, CI widths).
  max_tokens: 700

TASK 3: Add parseReportRecommendations(text) to src/llm/prompts.js
  Extracts JSON array from LLM response text.
  Strips accidental markdown fences (```json ... ```) before parsing.
  Returns [] on any parse failure — never throws.

TASK 4: Pre-compute and store narrative at run time
  In the Execute panel, after a run completes and the LLM is available:
    const [narrative, description] = await Promise.all([
      callLLM(buildNarrativePrompt(model, experimentConfig, results), 450),
      callLLM(buildModelDescriptionPrompt(model), 400)
    ]);
    await updateRunNarrative(runId, narrative, description);

TASK 5: Tests for tests/llm/prompts.test.js
  - buildModelDescriptionPrompt: output does not contain the forbidden words
    ('entity','macro','B-event','C-event','ARRIVE','COMPLETE','Phase','FIFO')
  - buildReportRecommendationsPrompt: output contains 'json' and 'confidence'
  - parseReportRecommendations with valid JSON array → returns array with
    priority fields
  - parseReportRecommendations with malformed input → returns [] without throwing
  - parseReportRecommendations with markdown-fenced JSON → returns array

ACCEPTANCE CRITERIA:
  □ Both new prompt builders exported from src/llm/prompts.js
  □ parseReportRecommendations handles all edge cases
  □ narrative_text and model_description_text stored in run record after run
  □ All tests pass
```

---

## PR-3 · Prompt 2 of 3 — Canvas Image Export and generateReport()

```
Read CLAUDE.md before writing any code.
Confirm PR-3 Prompt 1 tests pass before starting.

TASK 1: Install dependencies
  npm install html2canvas docx
  Confirm npm run build succeeds after install.

TASK 2: Canvas image export utility
  Create src/ui/visual-designer/canvasExport.js:

  export async function getModelImageDataUrl() {
    try {
      const el = document.querySelector('.react-flow__renderer');
      if (!el) return null;
      const html2canvas = (await import('html2canvas')).default;
      const canvas = await html2canvas(el, {
        backgroundColor: '#ffffff',
        scale: 2
      });
      return canvas.toDataURL('image/png');
    } catch (e) {
      console.warn('Canvas export failed:', e.message);
      return null;
    }
  }

  Returns null if the Visual Designer is not mounted or capture fails.
  Never throws.

TASK 3: Create src/reports/reportGenerator.js

  export async function generateReport(model, results, experimentConfig, runMeta)

  runMeta shape:
    { runId, runLabel, engineVersion, seed, prnAlgorithm, runTimestamp,
      narrativeText, modelDescriptionText }

  The function:
    1. Runs two async operations in parallel:
         const [imageDataUrl, recommendations] = await Promise.all([
           getModelImageDataUrl(),
           callLLM(buildReportRecommendationsPrompt(model, results), 700)
             .then(parseReportRecommendations)
             .catch(() => [])
         ]);

    2. Builds a .docx document using the docx npm library.
       Page size: A4 (11906 × 16838 DXA), 1 inch margins.
       Font: Arial throughout.
       Header: "simmodlr — [model.name] — [runMeta.runLabel]" right-aligned.
       Footer: "Confidential" left, page number right.

  SECTION 1 — COVER (followed by page break):
    model.name — 34pt bold centred, colour #1A2E4A
    "Simulation Analysis Report" — 20pt centred, colour #555555
    runMeta.runLabel — 14pt centred
    Date formatted as "DD Month YYYY" from runMeta.runTimestamp
    "Prepared using simmodlr v[runMeta.engineVersion]" — 11pt italic centred
    "CONFIDENTIAL" — 11pt bold centred, colour #8B0000

  SECTION 2 — MODEL SUMMARY (followed by page break):
    Heading: "Model Summary"
    Subheading: "What this model represents"
    Paragraph: runMeta.narrativeText OR model.description OR "No description available."
    Subheading: "Model Structure"
    Two-column table (Element | Detail):
      Entity types: customer names; server names with instance counts
      Queues: queue names and disciplines
      B-Events: total count
      C-Events: total count
      Goals: label + operator + target for each, or "None defined"
    Subheading: "Model Diagram"
    If imageDataUrl is not null: embed image at full content width.
      Caption paragraph: "Figure 1 — Visual model diagram"
    If null: italic paragraph "Open the Visual Designer and regenerate
      the report to include a model diagram."

  SECTION 3 — EXPERIMENT CONFIGURATION (followed by page break):
    Two-column table (Parameter | Value):
      Run duration: experimentConfig.maxSimTime + " time units"
      Warmup period: experimentConfig.warmupPeriod + " time units"
      Replications: experimentConfig.replications
      Seed: runMeta.seed
      Termination mode: experimentConfig.terminationMode
      Termination condition: rendered as readable string or "None (time-based)"

  SECTION 4 — RESULTS (followed by page break):
    Subheading: "Key Performance Indicators"
    Table (6 columns): Metric | Value | CI Lower | CI Upper | Goal | Status
      Row for each of: avgWait, avgSvc, avgSojourn, served, reneged,
        avgWIP, totalCost (omit totalCost row if totalCost === 0)
      Value from results.summary[metric]
      CI lower/upper from results.aggregateStats["summary."+metric] if present;
        "—" for single runs without CI data
      Goal and Status from buildGoalGaps(model, results) — "✓ MET" or "✗ MISSED"
        if a goal exists for that metric; "—" otherwise
    Subheading: "Queue Statistics"
    Table: Queue | Mean Wait | p50 | p90 | p95 | p99 | Balked | Blocked
      One row per queue from results.waitDist and results.perQueue
    Subheading: "Resource Utilisation"
    Table: Resource | Utilisation (%) | Busy Count | Idle Count
      One row per entry in results.summary.perResource

  SECTION 5 — STATISTICAL NOTES (followed by page break):
    Bullet: "Replications: [n]. Results are [point estimates / 95% CIs]
      based on [n] independent replications with mulberry32 PRNG."
    Bullet: "Warmup period: [warmupPeriod] time units removed from statistics."
      Or: "No warmup applied. Results include transient start-up behaviour."
    Bullet: "Random number generator: mulberry32. Base seed: [seed]."
    Bullet (only if results.summary.phaseCTruncated): "⚠ Phase C truncation
      occurred. One or more conditional events did not converge within the
      iteration limit. Results may be incomplete."
    Bullet for each item in results.summary.warnings (if any).

  SECTION 6 — RECOMMENDATIONS (followed by page break):
    For each recommendation in the recommendations array:
      Shaded block (background fill #EEF4FB, left border 3pt solid #2E5C8A):
        "Priority [n]: [headline]" — bold paragraph
        "Finding: [finding]" — body paragraph
        "Recommended action: [action]" — body paragraph
        "Expected impact: [expectedImpact]" — body paragraph
        "Confidence: [confidence]" — small italic paragraph
      Spacer paragraph between blocks.
    If recommendations array is empty:
      Italic paragraph: "Recommendations could not be generated for this run.
        Review the AI Insights panel in simmodlr for interactive analysis."

  SECTION 7 — RUN PROVENANCE:
    Subheading: "Run Provenance"
    Two-column table (Field | Value):
      Run ID: runMeta.runId
      Model name: model.name
      Run label: runMeta.runLabel
      Run date/time: runMeta.runTimestamp (ISO 8601 UTC)
      Engine version: runMeta.engineVersion
      PRNG algorithm: runMeta.prnAlgorithm
      Base seed: runMeta.seed
    Italic paragraph:
      "This report was generated from a run record stored in simmodlr.
       The model definition, experiment configuration, and results used to
       produce this report are preserved in the run record identified above
       and can be reproduced exactly by loading that record in simmodlr
       and using the Reproduce Run function."

    3. Return:
         new Blob([await Packer.toBuffer(doc)],
           { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });

TASK 4: Create src/reports/index.js
  export { generateReport } from './reportGenerator.js';

TASK 5: Tests for tests/reports/reportGenerator.test.js
  - Mock callLLM and getModelImageDataUrl (return null).
  - generateReport returns a Blob with the correct MIME type.
  - Blob size is > 0.
  - If callLLM throws: function still returns a valid Blob (graceful fallback).
  - If getModelImageDataUrl returns null: function still returns a valid Blob.

ACCEPTANCE CRITERIA:
  □ generateReport returns a valid Blob with correct MIME type
  □ All 7 sections present (verify by opening in Word/LibreOffice)
  □ LLM failures produce graceful fallback — no crash
  □ All tests pass
```

---

## PR-3 · Prompt 3 of 3 — Export Report Button

```
Read CLAUDE.md before writing any code.
Confirm PR-3 Prompt 2 tests pass before starting.

TASK 1: Assemble runMeta from the current run record
  In the Execute panel, add:

  function assembleRunMeta(runRecord, model, experimentConfig) {
    const fallbackLabel = model.name + ' — ' +
      new Date().toLocaleDateString('en-GB', {
        day:'2-digit', month:'short', year:'numeric'
      });
    return {
      runId:               runRecord?.id || 'unknown',
      runLabel:            runRecord?.run_label || fallbackLabel,
      engineVersion:       runRecord?.engine_version ||
                           import.meta.env.VITE_ENGINE_VERSION || '55a',
      seed:                runRecord?.base_seed ?? experimentConfig?.seed ?? 'unknown',
      prnAlgorithm:        'mulberry32',
      runTimestamp:        runRecord?.created_at || new Date().toISOString(),
      narrativeText:       runRecord?.narrative_text || null,
      modelDescriptionText: runRecord?.model_description_text || null,
    };
  }

TASK 2: Add the Export Report button
  In the Execute panel Analysis view, alongside existing export buttons:
    - Label: "📄 Export Report"
    - Disabled when: no completed run results available
    - Tooltip when disabled: "Run the simulation first to export a report."
    - Loading state: label changes to "Generating…" with a spinner
    - Button disabled during generation to prevent double-clicks

TASK 3: Click handler
  async function handleExportReport() {
    setReportLoading(true);
    try {
      const runMeta = assembleRunMeta(currentRunRecord, model, experimentConfig);
      const blob = await generateReport(model, results, experimentConfig, runMeta);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      // Sanitise: replace characters not safe in filenames with hyphens
      const safe = (model.name + ' — ' + runMeta.runLabel + ' — Report')
        .replace(/[/\\:*?"<>|]/g, '-') + '.docx';
      a.download = safe;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      console.error('Report generation failed:', e);
      // Show toast notification: "Report generation failed. Please try again."
    } finally {
      setReportLoading(false);
    }
  }

TASK 4: Tests for tests/ui/ExportReport.test.jsx
  - Button is disabled when results is null
  - On click: generateReport called with correct model and assembled runMeta
  - Filename is sanitised (no special characters)
  - On error: toast shown and loading state resets to false

PR-3 EXIT GATE:
  □ npm test passes
  □ Export Report button visible in Execute panel Analysis view
  □ Downloads a .docx for an M/M/1 run — opens in Word with all 7 sections
  □ Section 2 contains narrativeText (or model.description fallback)
  □ Section 7 provenance matches the actual sd_runs record in Supabase
  □ Recommendations present (may be empty if LLM unavailable — acceptable)
```

---

---

# SPRINT PR-4 — Shared URL Enhancement
**Addresses:** R2 + R4 | **Requires PR-1 and PR-3 complete**

The existing shared URL shows a read-only model view. This sprint upgrades it to a professional run-results view with a provenance header, pre-computed narrative (read from the run record — no LLM re-call), and a Download Report button.

---

## PR-4 · Prompt 1 of 2 — Shared Run View Component

```
Read CLAUDE.md before writing any code.
Confirm PR-1 and PR-3 are complete before starting.

TASK 1: Identify the existing shared URL implementation
  grep -rn "share\|Share\|is_public" src/
  Report: where share links are generated, what URL pattern they use,
  what the current shared view shows.
  Do not modify anything until you have reported the findings.

TASK 2: Create src/ui/shared/SharedRunView.jsx
  URL pattern: /shared/run/[runId]

  On load:
    1. Extract runId from window.location.pathname
    2. Call getRun(runId) — this must not require authentication
       (Supabase RLS policy allows select on run_results where model is_public=true)
    3. Also load the model: getModel(run.model_snapshot.id) to check is_public
    4. If model.is_public is false: render "This run is not publicly shared."
    5. Otherwise: render the full shared view

  Layout:

  HEADER BAR (background #1A2E4A, white text, full width):
    Left: "simmodlr" product name (bold)
    Centre: model name from run.model_snapshot.name
    Right: run label from run.run_label (truncated if > 40 chars)
    Below right: engine version badge "v[run.engine_version]" in amber

  PROVENANCE STRIP (background #FFF8E1, below header, full width):
    Small monospace-style text:
    "Run ID: [run.id]  ·  Seed: [run.base_seed]  ·  PRNG: mulberry32  ·
     Engine: v[run.engine_version]  ·  [formatted run date]"
    This strip is the R2 evidence visible to the recipient. Do not hide it.

  NARRATIVE SECTION:
    Heading: "What this analysis shows"
    If run.narrative_text is non-null: display as formatted prose directly.
    Else: italic "Narrative not available for this run."
    CRITICAL: Do NOT call the LLM here. Read only from the stored field.
    The LLM was called at run time (PR-3 Prompt 1 Task 4) and stored.
    If the stored value is null, the run pre-dates this feature — show fallback.

  MODEL DESCRIPTION SECTION:
    Heading: "About this model"
    If run.model_description_text is non-null: display directly.
    Else if run.model_snapshot.description: display that.
    Else: "No model description available."

  RESULTS SECTION:
    Heading: "Key Results"
    KPI summary table (same columns as report Section 4 but rendered as HTML).
    Goal status badges: green "✓ MET" or red "✗ MISSED" per goal.

  DOWNLOAD REPORT BUTTON:
    "📄 Download Report" — calls generateReport using:
      model = run.model_snapshot
      results = run.summary (stored results)
      runMeta assembled from the run record
    Triggers browser download. Same generateReport() function from PR-3.

  FOOTER:
    Small grey text:
    "Generated with simmodlr  ·  Results reproducible from run record [run.id]"

TASK 3: Add routing to App.jsx
  Before the auth check, add:
    const path = window.location.pathname;
    if (path.startsWith('/shared/run/')) {
      const runId = path.replace('/shared/run/', '');
      return <SharedRunView runId={runId} />;
    }
  Shared views are public — they must not require authentication to render.

TASK 4: Tests for tests/ui/SharedRunView.test.jsx
  - is_public false on model → "not publicly shared" message shown
  - narrative_text present in run record → displayed (no callLLM invoked)
  - narrative_text null → fallback message shown (no callLLM invoked)
  - Download Report button present in DOM
  - Provenance strip contains run.id and run.base_seed

ACCEPTANCE CRITERIA:
  □ /shared/run/[runId] loads in browser without authentication
  □ Provenance strip visible with run ID, seed, and engine version
  □ Narrative displayed from stored field (confirm with network tab — no LLM call)
  □ Download Report generates a valid .docx
```

---

## PR-4 · Prompt 2 of 2 — Share Button and Access Control

```
Read CLAUDE.md before writing any code.
Confirm PR-4 Prompt 1 tests pass before starting.

TASK 1: Share button in the run history panel
  Each past run row in the History tab gets a "Share" button.

  On click — if model.is_public is false:
    Show confirmation modal:
      "Sharing this run will make this model publicly viewable by anyone
       with the link. The model will be marked as public."
      [Make Public + Copy Link]  [Cancel]
    On confirm:
      await updateModel(model.id, { is_public: true });
      const url = window.location.origin + '/shared/run/' + runId;
      await navigator.clipboard.writeText(url);
      Show toast: "Link copied — anyone with this link can view results."

  On click — if model.is_public is already true:
    Construct URL and copy directly (no confirmation needed — already public).
    Show toast: "Link copied."

  Unshare button (shown when model.is_public is true):
    Show confirmation: "This will revoke public access to all runs of this model."
    On confirm: await updateModel(model.id, { is_public: false });
    Show toast: "Link revoked. Model is no longer publicly accessible."

TASK 2: Public indicator in model library
  Model cards with is_public=true show a small globe icon (🌐 or an SVG icon
  already in the codebase — do not add a new icon library).
  Tooltip on hover: "This model is publicly shared."

TASK 3: Tests for tests/ui/ShareButton.test.jsx
  - is_public false: confirmation modal shown before any action
  - User confirms: updateModel called with is_public:true; URL copied
  - User cancels: nothing changed, no updateModel call
  - is_public true: URL copied directly, no modal
  - Unshare: confirmation shown, then updateModel called with is_public:false

PR-4 EXIT GATE:
  □ npm test passes
  □ Share button works end-to-end for a real run
  □ Shared URL /shared/run/[id] loads without authentication
  □ Provenance strip visible on shared URL
  □ Narrative shown from stored field — no LLM network call on page load
    (verify with browser DevTools Network tab)
  □ Download Report on shared URL downloads a valid .docx
  □ Unshare removes public access (URL returns "not publicly shared")
  □ Model library shows globe icon on public models
```

---

---

# SPRINT PR-5 — Capability Register and Professional Readiness Gate
**Addresses:** R5 | **Requires all previous sprints complete**

This sprint formalises what simmodlr can and cannot model, adds in-tool warnings for edge cases, and produces the official readiness gate assessment document that determines whether the tool may be used in professional consultancy work.

---

## PR-5 · Prompt 1 of 2 — Capability Register and In-Tool Warnings

```
Read CLAUDE.md before writing any code.
Confirm all previous sprints (PR-1 through PR-4) are complete.

TASK 1: Create docs/capability-register.md with this exact content:

# simmodlr — Capability Register v1.0
Sprint baseline: 55a  |  Date: [today's date]

All "Supported" statuses are backed by a passing benchmark in the
Benchmark Register (docs/performance-envelope.md).

| Scenario class | Status | Benchmark/Evidence | Notes |
|---|---|---|---|
| Single-class M/M/c queueing | ✓ Supported | Benchmarks 1, 2 | M/M/1 ±2%, M/M/c ±3% |
| M/G/1 general service | ✓ Supported | Benchmark 3 | Pollaczek-Khinchine ±3% |
| Finite queues with loss (M/M/1/K) | ✓ Supported | Benchmark 4 | Loss probability ±3% |
| Priority queuing (non-preemptive) | ✓ Supported | Benchmark 5 | Directional |
| Preemptive priority | ✓ Supported | Benchmark 6 | Directional |
| Warmup period removal | ✓ Supported | Benchmark 7 | Accuracy improvement confirmed |
| Seeded reproducibility | ✓ Supported | Benchmark 8 | Bit-identical |
| Server failures and repair | ✓ Supported | Functional test | FAIL/REPAIR macros |
| Time-varying arrivals | ✓ Supported | Functional test | Piecewise distributions |
| Shift schedules | ✓ Supported | Functional test | ShiftPeriod config |
| Batching and assembly | ✓ Supported | Functional test | BATCH/UNBATCH/MATCH macros |
| Cost tracking | ✓ Supported | Functional test | COST() macro |
| Containers (level resources) | ✓ Supported | Functional test | FILL/DRAIN macros |
| Preemption | ✓ Supported | Functional test | PREEMPT macro |
| Probabilistic routing | ✓ Supported | Functional test | ProbBranch config |
| Conditional routing | ✓ Supported | Functional test | RoutingBranch config |
| Multi-class resource contention | ~ Partial — Workaround required | See User Guide | Complex contention patterns require careful C-event priority ordering. See User Guide Section 12. |
| Network flows with arc travel time | ✗ Not supported | — | Entities on arcs not a first-class construct in this version |
| Agent-like entity decision logic | ✗ Not supported | — | Use AB Studio for agent-based modelling |
| Continuous flow (fluid models) | ✗ Not supported | — | Use SD Studio for system dynamics modelling |

TASK 2: Add W-CAP-01 to validateModel() in src/engine/validation.js

  Code: W-CAP-01 | Severity: Warning

  Condition: Two or more C-events reference the same server type in their
    effect arrays (detected by parsing SEIZE() or COSEIZE() macro calls
    and finding overlapping server type names across C-events).

  Message: "Complex multi-class resource contention detected (W-CAP-01).
    Two or more C-events compete for the same resource type. This pattern
    is partially supported — results may be sensitive to C-event priority
    ordering. See User Guide Section 12 for recommended design."

TASK 3: Add W-CAP-02 to validateModel()

  Code: W-CAP-02 | Severity: Warning

  Condition: Any B-event has a schedule with a distribution whose mean
    interval is < 0.001 (proxy for very high-frequency discrete arrivals
    that may be approximating continuous flow).

  Message: "Very high arrival rate detected (W-CAP-02). simmodlr models
    discrete individual entities. If you are modelling continuous flow or
    aggregate quantities, consider SD Studio which implements System Dynamics."

TASK 4: Ensure capability warnings appear in ValidationPanel
  Both W-CAP-01 and W-CAP-02 are warnings (not errors). They must appear
  in the ValidationPanel warnings list. They must not block the run.
  They must appear in the report Section 5 (Statistical Notes) alongside
  other validation warnings.

TASK 5: Tests for tests/engine/validation.test.js (add to existing)
  - Model with 2 C-events both SEIZE()-ing same server type → W-CAP-01 warning present
  - Model with ARRIVE schedule mean 0.0001 → W-CAP-02 warning present
  - Standard M/M/1 model → no capability warnings (W-CAP-01 and W-CAP-02 absent)
  - Both warnings are non-blocking (errors array remains empty)

ACCEPTANCE CRITERIA:
  □ docs/capability-register.md created with all 20 scenario classes and accurate statuses
  □ W-CAP-01 fires for detected multi-class contention
  □ W-CAP-02 fires for very high arrival rates
  □ Both warnings appear in ValidationPanel
  □ Both are non-blocking (run still executes)
  □ All tests pass
```

---

## PR-5 · Prompt 2 of 2 — Professional Readiness Gate Assessment

```
Read CLAUDE.md before writing any code.
Confirm all PR-1 through PR-5 Prompt 1 work is complete.

TASK 1: Create docs/readiness-gate-PR5.md

  This document is the official assessment of simmodlr against the
  Studio Platform Professional Readiness Standard v1.0. It must be
  honest. If any requirement is not met, say so precisely.

  Use this template and fill in real values from actual tests:

  ---
  # simmodlr — Professional Readiness Gate Assessment
  Date: [today]  |  Sprint: Post-PR5  |  Assessor: [your initials]

  ## R1 — Numerical Accuracy

  | # | Benchmark | Expected | Actual | Tolerance | Status |
  |---|---|---|---|---|---|
  | 1 | M/M/1 mean wait | 9.0 | [actual] | ±2% | [PASS/FAIL] |
  | 2 | M/M/c mean wait | [Erlang-C] | [actual] | ±3% | [PASS/FAIL] |
  | 3 | M/G/1 mean wait | 6.0 | [actual] | ±3% | [PASS/FAIL] |
  | 4 | M/M/1/K loss prob | 0.508 | [actual] | ±3% | [PASS/FAIL] |
  | 5 | Priority ordering | High < Low | [actual] | Directional | [PASS/FAIL] |
  | 6 | PREEMPT correctness | Low > 9.0 | [actual] | Directional | [PASS/FAIL] |
  | 7 | Warmup removal | B closer to 9.0 | [actual] | Directional | [PASS/FAIL] |
  | 8 | Seeded reproducibility | Bit-identical | [actual] | Exact | [PASS/FAIL] |

  CI gate: GitHub Actions build [green/red] — badge URL: [URL]
  Math.random grep check: [0 occurrences / X occurrences — PASS/FAIL]

  **R1 Overall: [PASS / FAIL]**

  ## R2 — Reproducibility

  - PRNG: mulberry32 confirmed.
    grep -rn "Math.random" src/engine/ → [N occurrences]
    [PASS if 0, FAIL if > 0]
  - model_snapshot in run_results: [confirmed / not confirmed]
    Evidence: [Supabase Table Editor screenshot or SQL query result]
  - Reproduce Run function: tested on model "[model name]"
    Result: [PASS — bit-identical / FAIL — results differed]
  - Environment independence: confirmed across [browsers tested]

  **R2 Overall: [PASS / FAIL]**

  ## R3 — Run Integrity

  - Immutability trigger: [trigger name] present in Supabase
    Test: edited model after run, model_snapshot unchanged → [PASS/FAIL]
  - run_label auto-assignment: example label: "[example from Supabase]"
  - JSON export function: location [src/...] → [present / absent]
  - model_snapshot unchanged after edit: [PASS/FAIL]

  **R3 Overall: [PASS / FAIL]**

  ## R4 — Professional Output

  - .docx report generated: [PASS/FAIL]
  - All 7 sections present: [PASS/FAIL with list of any missing sections]
  - narrative_text in Section 2: [PASS / FAIL / N/A — LLM unavailable]
  - Run provenance in Section 7: [PASS/FAIL — matches Supabase record]
  - Shared URL with provenance strip: [PASS/FAIL]
  - Narrative on shared URL reads from stored field (no LLM call): [PASS/FAIL]
  - Download Report on shared URL: [PASS/FAIL]

  **R4 Overall: [PASS / FAIL — note any partial deliveries honestly]**

  ## R5 — Modelling Scope Honesty

  - Capability Register: docs/capability-register.md [present / absent]
    Scenario classes documented: [N of 20]
  - W-CAP-01 in-tool warning: [PASS/FAIL]
  - W-CAP-02 in-tool warning: [PASS/FAIL]

  **R5 Overall: [PASS / FAIL]**

  ---

  ## Final Determination

  [Choose one of the following — do not use both]

  **PASS:** R1, R2, R3, R4, and R5 all pass.
  "simmodlr v[engineVersion] satisfies all five requirements of the Studio
   Platform Professional Readiness Standard v1.0. Results may be presented
   in professional consultancy work."
   Recommended action: git tag v-readiness-1.0

  **FAIL:** One or more requirements do not pass.
  "simmodlr v[engineVersion] does NOT yet satisfy the Professional Readiness
   Standard. Outstanding items:"
  - [List each failing requirement and the specific gap]
  Recommended action: do not use for client-facing consultancy work until
   the outstanding items are resolved and this gate is re-assessed.
  ---

TASK 2: Update AGENTS.md
  Add a "Professional Readiness Sprint Log" section:
    Sprint PR-1 completed: [date]
    Sprint PR-2 completed: [date]
    Sprint PR-3 completed: [date]
    Sprint PR-4 completed: [date]
    Sprint PR-5 completed: [date]
    Gate assessment: docs/readiness-gate-PR5.md
    Gate result: [PASS / FAIL]

TASK 3: If gate result is PASS — add to README.md
  ## Professional Readiness
  [![Benchmark Gate]([badge URL])]([workflow URL])
  simmodlr satisfies the Studio Platform Professional Readiness Standard v1.0.
  See [docs/readiness-gate-PR5.md](docs/readiness-gate-PR5.md) for the full assessment.

TASK 4: Final regression check — run in this exact order
  npm test          → must pass with 0 failures
  npm run bench     → must pass with 0 failures (all 8 benchmarks)
  npm run build     → must succeed with no errors

PR-5 EXIT GATE — THIS IS THE PROFESSIONAL READINESS GATE:
  □ npm test passes with 0 failures
  □ npm run bench passes with 0 failures
  □ npm run build succeeds
  □ docs/readiness-gate-PR5.md created with a completed, honest R1–R5 assessment
  □ docs/capability-register.md complete with all 20 scenario classes
  □ In-tool warnings W-CAP-01 and W-CAP-02 fire correctly and are non-blocking
  □ AGENTS.md updated with all sprint completion dates and gate result

  IF GATE IS PASS:
    simmodlr is ready for professional consultancy use.
    Tag: git tag v-readiness-1.0

  IF GATE IS FAIL:
    Do not use for client-facing work.
    Create a follow-up sprint addressing each failing item.
    Re-assess this gate after the follow-up sprint completes.
```

---

---

## Appendix: Files Created or Modified per Sprint

| Sprint | New files | Modified files |
|---|---|---|
| PR-1 | `supabase/migrations/PR-001_run_record_integrity.sql`, `src/db/runRecord.js`, `tests/db/runRecord.test.js`, `tests/ui/ReproduceRun.test.jsx` | `run_results` table (new columns + triggers), all run record write paths, Execute panel (seed display, model-modified banner) |
| PR-2 | `.github/workflows/benchmark-gate.yml`, 6 new benchmark test files, `tests/engine/benchmarks/performance.test.js` | Existing M/M/1 benchmark (tolerance tightened), `docs/performance-envelope.md`, `README.md` (badge) |
| PR-3 | `src/reports/reportGenerator.js`, `src/reports/index.js`, `src/ui/visual-designer/canvasExport.js`, `tests/reports/reportGenerator.test.js`, `tests/llm/prompts.test.js`, `tests/ui/ExportReport.test.jsx` | `src/llm/prompts.js` (2 new builders + parseReportRecommendations), Execute panel (Export Report button), `package.json` (html2canvas, docx) |
| PR-4 | `src/ui/shared/SharedRunView.jsx`, `tests/ui/SharedRunView.test.jsx`, `tests/ui/ShareButton.test.jsx` | `App.jsx` (routing for `/shared/run/`), run history (Share/Unshare buttons), model library (public indicator) |
| PR-5 | `docs/capability-register.md`, `docs/readiness-gate-PR5.md` | `src/engine/validation.js` (W-CAP-01, W-CAP-02), `AGENTS.md`, `README.md` (readiness badge if PASS) |

---

*After all five sprints, run `npm test && npm run bench && npm run build` one final time. Open `docs/readiness-gate-PR5.md`. If R1–R5 all show PASS, simmodlr meets the Professional Readiness Standard.*
