import { describe, expect, it } from "vitest";
import {
  applySuggestionPatch,
  applySchedulePatch,
  buildCiResults,
  buildComparisonPrompt,
  buildExplainResultsPrompt,
  buildGoalGaps,
  buildNarrativePrompt,
  buildPlanRefinementPrompt,
  buildResultsQueryPrompt,
  buildSensitivityPrompt,
  buildSuggestionPrompt,
  parsePlanRefinementResponse,
  parseSuggestionResponse,
  promptWordEstimate,
} from "../../src/llm/prompts.js";

const model = {
  name: "Clinic",
  description: "A small clinic with one nurse.",
  entityTypes: [{ id: "server-nurse", name: "Nurse", role: "server" }],
  queues: [{ id: "queue-main", name: "Main queue" }],
};

describe("LLM prompt builders", () => {
  it("builds a narrative prompt with structured JSON in the user message", () => {
    const prompt = buildNarrativePrompt(
      model,
      { warmupPeriod: 10, maxSimTime: 200, replications: 3, seed: 42 },
      {
        summary: { total: 20, served: 18, reneged: 2, avgWait: 9, avgSvc: 3, avgSojourn: 12 },
        waitDist: { "Main queue": { mean: 9, n: 18, p50: 8, p90: 14, p95: 16, p99: 18, values: [1, 9, 17] } },
      }
    );

    expect(prompt.kind).toBe("narrative");
    expect(prompt.messages[0].role).toBe("system");
    const payload = JSON.parse(prompt.messages[1].content);
    expect(payload.model.name).toBe("Clinic");
    expect(payload.experiment).toEqual(expect.objectContaining({ warmup: 10, runDuration: 200, replications: 3, seed: 42 }));
    expect(payload.kpis.queues[0]).toEqual(expect.objectContaining({ name: "Main queue", meanWait: 9 }));
  });

  it("flags possible queue overload in the narrative instruction", () => {
    const prompt = buildNarrativePrompt(model, {}, { summary: { avgWait: 12, avgSvc: 4 } });
    expect(prompt.messages[1].content).toMatch(/2 x service time/i);
    expect(prompt.messages[1].content).toMatch(/possible overload/i);
  });

  it("keeps narrative prompts below the sprint token budget heuristic", () => {
    const prompt = buildNarrativePrompt(model, {}, { summary: { avgWait: 1, avgSvc: 1 } });
    expect(promptWordEstimate(prompt)).toBeLessThan(2000);
  });

  it("builds a comparison prompt containing both run labels", () => {
    const prompt = buildComparisonPrompt("Clinic", { label: "Option A", kpis: { served: 10 } }, { label: "Option B", kpis: { served: 12 } });
    const payload = JSON.parse(prompt.messages[1].content);

    expect(payload.runA.label).toBe("Option A");
    expect(payload.runB.label).toBe("Option B");
    expect(prompt.messages[0].content).toMatch(/Compare the two simulation runs/i);
  });

  it("builds sensitivity prompts from confidence interval stats", () => {
    const ciResults = buildCiResults({
      "summary.avgWait": { n: 5, mean: 8, lower: 6, upper: 10, stdDev: 2 },
    });
    const prompt = buildSensitivityPrompt("Clinic", { replications: 5 }, ciResults);
    const payload = JSON.parse(prompt.messages[1].content);

    expect(payload.confidenceIntervals[0]).toEqual(expect.objectContaining({
      name: "summary.avgWait",
      mean: 8,
      ci95Lower: 6,
      ci95Upper: 10,
      n: 5,
    }));
  });

  it("builds a merged explain-results prompt with narrative and JSON suggestions", () => {
    const ciResults = buildCiResults({
      "summary.avgWait": { n: 5, mean: 8, lower: 6, upper: 10, stdDev: 2 },
    });
    const prompt = buildExplainResultsPrompt(
      model,
      { warmupPeriod: 10, maxSimTime: 200, replications: 5, seed: 42 },
      {
        summary: { total: 20, served: 18, reneged: 2, avgWait: 9, avgSvc: 3, avgSojourn: 12 },
        waitDist: { "Main queue": { mean: 9, n: 18, p50: 8, p90: 14, p95: 16, p99: 18 } },
        aggregateStats: { "summary.avgWait": { n: 5, mean: 8, lower: 6, upper: 10 } },
      },
      ciResults
    );

    expect(prompt.kind).toBe("explainResults");
    expect(prompt.messages[0].role).toBe("system");
    const payload = JSON.parse(prompt.messages[1].content);
    expect(payload.instruction).toMatch(/What Happened/i);
    expect(payload.instruction).toMatch(/How Reliable/i);
    expect(payload.instruction).toMatch(/What to Change/i);
    expect(payload.instruction).toMatch(/"suggestions"/i);
    expect(payload.instruction).toMatch(/confidence/i);
    expect(payload.instruction).toMatch(/PART 2/i);
    expect(promptWordEstimate(prompt)).toBeLessThan(2000);
  });

  it("explain-results prompt includes sensitivity guidance when CI data is present", () => {
    const ciResults = buildCiResults({
      "summary.avgWait": { n: 10, mean: 8, lower: 6, upper: 10, stdDev: 2 },
    });
    const prompt = buildExplainResultsPrompt(model, { replications: 10 }, {}, ciResults);
    const instruction = prompt.messages[1].content;
    expect(instruction).toMatch(/confidence interval/i);
    expect(instruction).toMatch(/How Reliable/i);
  });

  it("explain-results prompt notes low replication count when CI data is sparse", () => {
    const ciResults = buildCiResults({
      "summary.avgWait": { n: 2, mean: 8, lower: 6, upper: 10, stdDev: 2 },
    });
    const prompt = buildExplainResultsPrompt(model, { replications: 2 }, {}, ciResults);
    const instruction = prompt.messages[1].content;
    expect(instruction).toMatch(/replication count is low/i);
  });

  it("builds a suggestion prompt with model structure and KPI data", () => {
    const prompt = buildSuggestionPrompt(
      model,
      { warmupPeriod: 10, maxSimTime: 200, replications: 3, seed: 42 },
      {
        summary: { total: 20, served: 18, reneged: 2, avgWait: 8.2, avgSvc: 4.1, avgSojourn: 12.3 },
        waitDist: { "Main queue": { mean: 8.2, n: 18, p50: 7, p90: 13, p95: 15, p99: 17, values: [2, 8, 15] } },
      }
    );
    expect(prompt.kind).toBe("suggestion");
    expect(prompt.messages[0].role).toBe("system");
    const payload = JSON.parse(prompt.messages[1].content);
    expect(payload.model.entityTypes[0]).toEqual(expect.objectContaining({ name: "Nurse", role: "server" }));
    expect(payload.model.queues[0]).toEqual(expect.objectContaining({ name: "Main queue" }));
    expect(payload.kpis.queues[0].meanWait).toBe(8.2);
    expect(payload.kpis.avgWait).toBe(8.2);
    expect(payload.experiment.replications).toBe(3);
    expect(payload.waitDist).toBeDefined();
    expect(payload.perQueue).toBeDefined();
  });

  it("includes per-resource utilisation and idleCount in suggestion prompt", () => {
    const modelWithServer = {
      ...model,
      entityTypes: [{ id: "server-nurse", name: "Nurse", role: "server", count: 2 }],
    };
    const prompt = buildSuggestionPrompt(
      modelWithServer,
      {},
      {
        summary: {
          total: 20, served: 18, reneged: 2, avgWait: 8.2, avgSvc: 4.1, avgSojourn: 12.3,
          perResource: { Nurse: { total: 2, busyCount: 2, idleCount: 0, utilisation: 1.0 } },
        },
      }
    );
    const payload = JSON.parse(prompt.messages[1].content);
    expect(payload.kpis.resources[0]).toEqual(expect.objectContaining({
      name: "Nurse",
      utilisation: 1.0,
      busyCount: 2,
      idleCount: 0,
      totalServers: 2,
    }));
  });

  it("includes per-queue wait percentile and blocking/balking data in suggestion prompt", () => {
    const modelWithQueue = {
      ...model,
      queues: [{ id: "q1", name: "Main queue", discipline: "FIFO", capacity: 5 }],
    };
    const prompt = buildSuggestionPrompt(
      modelWithQueue,
      {},
      {
        summary: { total: 20, served: 18, reneged: 2, avgWait: 8.2, avgSvc: 4.1, avgSojourn: 12.3 },
        waitDist: { "Main queue": { n: 18, mean: 8.2, p50: 6.1, p90: 15.3, p95: 18.7, p99: 22.4 } },
        perQueue: { "Main queue": { blockingCount: 3, balkCount: 1 } },
      }
    );
    const payload = JSON.parse(prompt.messages[1].content);
    expect(payload.kpis.queues[0]).toEqual(expect.objectContaining({
      name: "Main queue",
      meanWait: 8.2,
      p50: 6.1,
      p90: 15.3,
      p95: 18.7,
      p99: 22.4,
      blockingCount: 3,
      balkCount: 1,
    }));
    expect(payload.waitDist["Main queue"]).toBeDefined();
    expect(payload.perQueue["Main queue"]).toEqual({ blockingCount: 3, balkCount: 1 });
  });

  describe("buildResultsQueryPrompt", () => {
    const queryModel = {
      name: "Clinic",
      description: "A small clinic.",
      entityTypes: [{ name: "Nurse", role: "server" }, { name: "Patient", role: "customer" }],
      queues: [{ name: "Triage Queue", discipline: "FIFO", customerType: "Patient" }],
      stateVariables: [{ name: "shiftActive", initialValue: 1 }],
    };

    const queryResults = {
      summary: { total: 50, served: 45, reneged: 5, avgWait: 8.2, avgSvc: 4.1, avgSojourn: 12.3, warmupPeriod: 10, maxSimTime: 500 },
    };

    it("builds a query prompt with kind 'query'", () => {
      const prompt = buildResultsQueryPrompt("Which queue had the longest wait?", queryModel, queryResults);
      expect(prompt.kind).toBe("query");
    });

    it("includes the question and KPI data in the user message", () => {
      const prompt = buildResultsQueryPrompt("What was the utilisation of Nurse?", queryModel, queryResults);
      const parsed = JSON.parse(prompt.messages[prompt.messages.length - 1].content);
      expect(parsed.question).toBe("What was the utilisation of Nurse?");
      expect(parsed.data.model.name).toBe("Clinic");
      expect(parsed.data.kpis.avgWait).toBe(8.2);
      expect(parsed.data.kpis.served).toBe(45);
    });

    it("includes model structure: entity types, queues, state variables", () => {
      const prompt = buildResultsQueryPrompt("How many patients were served?", queryModel, queryResults);
      const parsed = JSON.parse(prompt.messages[prompt.messages.length - 1].content);
      expect(parsed.data.model.entityTypes).toHaveLength(2);
      expect(parsed.data.model.queues[0].name).toBe("Triage Queue");
      expect(parsed.data.model.queues[0].customerType).toBe("Patient");
      expect(parsed.data.model.stateVariables[0].name).toBe("shiftActive");
    });

    it("includes conversation history when provided", () => {
      const history = [
        { role: "user", content: "What was the mean wait?" },
        { role: "assistant", content: "The mean wait was 8.2 minutes." },
      ];
      const prompt = buildResultsQueryPrompt("What about the second queue?", queryModel, queryResults, history);
      expect(prompt.messages).toHaveLength(4);
      expect(prompt.messages[1].content).toBe("What was the mean wait?");
      expect(prompt.messages[2].content).toBe("The mean wait was 8.2 minutes.");
    });

    it("sets a system instruction to only answer from provided data", () => {
      const prompt = buildResultsQueryPrompt("Is the system overloaded?", queryModel, queryResults);
      expect(prompt.messages[0].content).toMatch(/only the provided KPI data/i);
      expect(prompt.messages[0].content).toMatch(/never invent numbers/i);
    });

    it("reports timeSeriesAvailable flag and includes waitDist data", () => {
      const withTimeSeries = buildResultsQueryPrompt("Show me queue trends", queryModel, { ...queryResults, timeSeries: [{ t: 0, queues: {} }] });
      const parsedTs = JSON.parse(withTimeSeries.messages[withTimeSeries.messages.length - 1].content);
      expect(parsedTs.data.timeSeriesAvailable).toBe(true);
      expect(parsedTs.data.waitDist).toBeNull();
      expect(parsedTs.data.perQueue).toBeNull();

      const engineWaitDist = { "Triage Queue": { n: 45, mean: 8.2, p50: 6.1, p90: 15.3, p95: 18.7, p99: 22.4 } };
      const withWaitDist = buildResultsQueryPrompt("Show percentiles", queryModel, { ...queryResults, waitDist: engineWaitDist });
      const parsedWd = JSON.parse(withWaitDist.messages[withWaitDist.messages.length - 1].content);
      expect(parsedWd.data.waitDist).toEqual({
        "Triage Queue": { n: 45, mean: 8.2, p50: 6.1, p90: 15.3, p95: 18.7, p99: 22.4 },
      });
    });

    it("includes perQueue blocking/balking data when available", () => {
      const enginePerQueue = { "Triage Queue": { blockingCount: 3, balkCount: 1 } };
      const prompt = buildResultsQueryPrompt("How many balked?", queryModel, { ...queryResults, perQueue: enginePerQueue });
      const parsed = JSON.parse(prompt.messages[prompt.messages.length - 1].content);
      expect(parsed.data.perQueue).toEqual(enginePerQueue);
    });

    it("keeps query prompts within token budget", () => {
      const prompt = buildResultsQueryPrompt("What is the throughput?", queryModel, queryResults);
      expect(promptWordEstimate(prompt)).toBeLessThan(2000);
    });

    it("handles empty question gracefully", () => {
      const prompt = buildResultsQueryPrompt("", queryModel, queryResults);
      const parsed = JSON.parse(prompt.messages[prompt.messages.length - 1].content);
      expect(parsed.question).toBe("");
      expect(parsed.data.kpis.avgWait).toBe(8.2);
      expect(prompt.kind).toBe("query");
    });

    it("handles missing optional results data without error", () => {
      const minimalResults = { summary: { total: 0, served: 0, reneged: 0, avgWait: 0, avgSvc: 0, avgSojourn: 0 } };
      const prompt = buildResultsQueryPrompt("What happened?", queryModel, minimalResults);
      const parsed = JSON.parse(prompt.messages[prompt.messages.length - 1].content);
      expect(parsed.data.kpis.avgWait).toBe(0);
      expect(parsed.data.timeSeriesAvailable).toBe(false);
    });
  });

  describe("Sprint 45 — enriched prompt grounding", () => {
    it("includes maxSojourn and avgWIP in kpis", () => {
      const prompt = buildSuggestionPrompt(
        model, {},
        { summary: { total: 20, served: 18, reneged: 2, avgWait: 8.2, avgSvc: 4.1, avgSojourn: 12.3, maxSojourn: 45.0, avgWIP: 3.2 } }
      );
      const payload = JSON.parse(prompt.messages[1].content);
      expect(payload.kpis.maxSojourn).toBe(45.0);
      expect(payload.kpis.avgWIP).toBe(3.2);
    });

    it("includes totalCost and costPerServed in kpis when non-zero", () => {
      const prompt = buildSuggestionPrompt(
        model, {},
        { summary: { total: 10, served: 10, reneged: 0, avgWait: 1, avgSvc: 1, avgSojourn: 2, totalCost: 500, costPerServed: 50 } }
      );
      const payload = JSON.parse(prompt.messages[1].content);
      expect(payload.kpis.totalCost).toBe(500);
      expect(payload.kpis.costPerServed).toBe(50);
    });

    it("includes containerLevels in kpis when present", () => {
      const prompt = buildSuggestionPrompt(
        model, {},
        { summary: { total: 10, served: 10, reneged: 0, avgWait: 1, avgSvc: 1, avgSojourn: 2, containerLevels: { Tank: { min: 0, max: 100, avg: 42, final: 60 } } } }
      );
      const payload = JSON.parse(prompt.messages[1].content);
      expect(payload.kpis.containerLevels).toEqual({ Tank: { min: 0, max: 100, avg: 42, final: 60 } });
    });

    it("includes warnings and phaseCTruncated in kpis when set", () => {
      const prompt = buildSuggestionPrompt(
        model, {},
        { summary: { total: 10, served: 10, reneged: 0, avgWait: 1, avgSvc: 1, avgSojourn: 2, phaseCTruncated: true, warnings: ["Phase C truncated after 500 passes"] } }
      );
      const payload = JSON.parse(prompt.messages[1].content);
      expect(payload.kpis.warning_phaseCTruncated).toBe(true);
      expect(payload.kpis.warnings).toContain("Phase C truncated after 500 passes");
    });

    it("includes server failure model in entity types", () => {
      const modelWithFailure = {
        ...model,
        entityTypes: [{
          id: "s1", name: "Machine", role: "server", count: 3,
          mtbfDist: "Exponential", mtbfDistParams: { mean: 60 },
          mttrDist: "Exponential", mttrDistParams: { mean: 10 },
        }],
      };
      const prompt = buildSuggestionPrompt(modelWithFailure, {}, { summary: { total: 5, served: 5, reneged: 0, avgWait: 1, avgSvc: 1, avgSojourn: 2 } });
      const payload = JSON.parse(prompt.messages[1].content);
      expect(payload.model.entityTypes[0].failureModel).toEqual(expect.objectContaining({
        mtbfDist: "Exponential",
        mttrDist: "Exponential",
      }));
    });

    it("includes shift schedule summary for server entity types", () => {
      const modelWithShift = {
        ...model,
        entityTypes: [{
          id: "s1", name: "Clerk", role: "server", count: 1,
          shiftSchedule: [{ time: 0, capacity: 2 }, { time: 480, capacity: 1 }],
        }],
      };
      const prompt = buildSuggestionPrompt(modelWithShift, {}, { summary: { total: 5, served: 5, reneged: 0, avgWait: 1, avgSvc: 1, avgSojourn: 2 } });
      const payload = JSON.parse(prompt.messages[1].content);
      expect(payload.model.entityTypes[0].shiftSchedule).toBe("2 period(s)");
    });

    it("includes queue overflowDestination when set", () => {
      const modelWithOverflow = {
        ...model,
        queues: [{ id: "q1", name: "Main Queue", discipline: "FIFO", overflowDestination: "Backup Queue" }],
      };
      const prompt = buildSuggestionPrompt(modelWithOverflow, {}, { summary: { total: 5, served: 5, reneged: 0, avgWait: 1, avgSvc: 1, avgSojourn: 2 } });
      const payload = JSON.parse(prompt.messages[1].content);
      expect(payload.model.queues[0].overflowDestination).toBe("Backup Queue");
    });

    it("includes B-event digest with routing type, loop guard, and balk mode", () => {
      const modelWithEvents = {
        ...model,
        bEvents: [
          {
            id: "b1", name: "Patient Arrives",
            effect: ["ARRIVE(Patient)"],
            defaultQueueName: "Triage",
            loopConfig: { maxLoopCount: 5, exitQueueName: "Exit" },
            balkProbability: 0.2,
            schedules: [{ dist: "Exponential", distParams: { mean: 5 } }],
          },
          {
            id: "b2", name: "Nurse Treats",
            effect: ["COMPLETE(Patient)", "RELEASE(Nurse)"],
            probabilisticRouting: [{ probability: 0.7, queueName: "Recovery" }, { probability: 0.3, queueName: "Discharge" }],
          },
        ],
      };
      const prompt = buildSuggestionPrompt(modelWithEvents, {}, { summary: { total: 5, served: 5, reneged: 0, avgWait: 1, avgSvc: 1, avgSojourn: 2 } });
      const payload = JSON.parse(prompt.messages[1].content);
      const b1 = payload.model.bEvents[0];
      const b2 = payload.model.bEvents[1];
      expect(b1.effectTypes).toContain("ARRIVE");
      expect(b1.loopGuard).toMatch(/max 5x/);
      expect(b1.balkMode).toBe("probability:0.2");
      expect(b1.arrivalStreams).toBe(1);
      expect(b2.routing).toBe("probabilistic");
      expect(b2.effectTypes).toContain("COMPLETE");
    });

    it("includes C-event digest when C-events are present", () => {
      const modelWithCEvents = {
        ...model,
        cEvents: [
          { id: "c1", name: "Check Queue Length", effect: ["SET(alert, 1)"], priority: 1 },
        ],
      };
      const prompt = buildSuggestionPrompt(modelWithCEvents, {}, { summary: { total: 5, served: 5, reneged: 0, avgWait: 1, avgSvc: 1, avgSojourn: 2 } });
      const payload = JSON.parse(prompt.messages[1].content);
      expect(payload.model.cEvents).toHaveLength(1);
      expect(payload.model.cEvents[0].name).toBe("Check Queue Length");
      expect(payload.model.cEvents[0].effectTypes).toContain("SET");
      expect(payload.model.cEvents[0].priority).toBe(1);
    });

    it("includes state variables in suggestion prompt", () => {
      const modelWithState = {
        ...model,
        stateVariables: [{ name: "priority", initialValue: 0 }, { name: "queueLimit", initialValue: 20 }],
      };
      const prompt = buildSuggestionPrompt(modelWithState, {}, { summary: { total: 5, served: 5, reneged: 0, avgWait: 1, avgSvc: 1, avgSojourn: 2 } });
      const payload = JSON.parse(prompt.messages[1].content);
      expect(payload.model.stateVariables).toHaveLength(2);
      expect(payload.model.stateVariables[0]).toEqual({ name: "priority", initialValue: 0 });
    });

    it("includes state variables in narrative prompt", () => {
      const modelWithState = {
        ...model,
        stateVariables: [{ name: "shiftMode", initialValue: 1 }],
      };
      const prompt = buildNarrativePrompt(modelWithState, {}, { summary: { total: 5, served: 5, reneged: 0, avgWait: 1, avgSvc: 1, avgSojourn: 2 } });
      const payload = JSON.parse(prompt.messages[1].content);
      expect(payload.model.stateVariables[0].name).toBe("shiftMode");
    });

    it("includes entity anomaly digest when anomalies are present", () => {
      const entitySummary = [
        { id: 1, type: "Patient", stages: [{ stageWait: 50 }] },
        { id: 2, type: "Patient", stages: [{ stageWait: 2 }] },
        { id: 3, type: "Patient", stages: [{ stageWait: 3 }] },
        { id: 4, type: "Patient", stages: [{ stageWait: 2 }] },
        { id: 5, type: "Patient", stages: [{ stageWait: 3 }] },
      ];
      const prompt = buildSuggestionPrompt(
        model, {},
        { summary: { total: 5, served: 5, reneged: 0, avgWait: 4, avgSvc: 1, avgSojourn: 5 }, entitySummary }
      );
      const payload = JSON.parse(prompt.messages[1].content);
      expect(payload.entityAnomalies).toBeDefined();
      expect(payload.entityAnomalies.anomalyCount).toBe(1);
      expect(payload.entityAnomalies.worstWait).toBe(50);
      expect(payload.entityAnomalies.byType.Patient).toBe(1);
    });

    it("omits entity anomalies when no anomalies exceed threshold", () => {
      const entitySummary = [
        { id: 1, type: "Patient", stages: [{ stageWait: 5 }] },
        { id: 2, type: "Patient", stages: [{ stageWait: 6 }] },
      ];
      const prompt = buildSuggestionPrompt(
        model, {},
        { summary: { total: 2, served: 2, reneged: 0, avgWait: 5.5, avgSvc: 1, avgSojourn: 6.5 }, entitySummary }
      );
      const payload = JSON.parse(prompt.messages[1].content);
      expect(payload.entityAnomalies).toBeUndefined();
    });

    it("narrative prompt mentions phaseCTruncated caveat in instruction", () => {
      const prompt = buildNarrativePrompt(
        model, {},
        { summary: { total: 10, served: 10, reneged: 0, avgWait: 1, avgSvc: 1, avgSojourn: 2, phaseCTruncated: true } }
      );
      expect(prompt.messages[1].content).toMatch(/Phase C was truncated|caveat/i);
    });
  });
});

describe("Sprint 46 — AI apply & verify", () => {
  const goalModel = {
    name: "Clinic",
    goals: [
      { metric: "summary.avgWait", operator: "<", target: 3, label: "Avg wait < 3" },
      { metric: "summary.served", operator: ">=", target: 100, label: "Served >= 100" },
    ],
  };

  describe("buildGoalGaps", () => {
    it("met goal returns met: true", () => {
      const stats = {
        "summary.avgWait": { mean: 2.1, n: 5 },
        "summary.served": { mean: 120, n: 5 },
      };
      const gaps = buildGoalGaps(goalModel, stats);
      expect(gaps[0].met).toBe(true);
      expect(gaps[1].met).toBe(true);
    });

    it("missed goal returns met: false and positive gap", () => {
      const stats = {
        "summary.avgWait": { mean: 4.2, n: 5 },
        "summary.served": { mean: 80, n: 5 },
      };
      const gaps = buildGoalGaps(goalModel, stats);
      expect(gaps[0].met).toBe(false);
      expect(gaps[0].gap).toBeGreaterThan(0);
      expect(gaps[1].met).toBe(false);
    });

    it("null aggregateStats returns met: false", () => {
      const gaps = buildGoalGaps(goalModel, {});
      expect(gaps[0].met).toBe(false);
      expect(gaps[0].current).toBeNull();
      expect(gaps[0].gap).toBeNull();
    });
  });

  describe("parseSuggestionResponse", () => {
    it("extracts JSON from markdown code fences", () => {
      const text = '```json\n{"analysis":"test analysis","suggestions":[{"rank":1,"constraint":"avgWait = 4.2 (goal: < 3)","cause":"high util","change":{"type":"entityTypeCount","target":"Nurse","from":2,"to":3},"predicted":"~2 min","goalImpact":"MET","confidence":"high"}]}\n```';
      const result = parseSuggestionResponse(text);
      expect(result.analysis).toBe("test analysis");
      expect(result.suggestions).toHaveLength(1);
      expect(result.suggestions[0].rank).toBe(1);
      expect(result.suggestions[0].change.type).toBe("entityTypeCount");
    });

    it("falls back to analysis text when no JSON", () => {
      const text = "Consider adding more servers to reduce wait times.";
      const result = parseSuggestionResponse(text);
      expect(result.analysis).toBe(text);
      expect(result.suggestions).toHaveLength(0);
    });

    it("handles malformed JSON gracefully", () => {
      const text = "```json\n{broken json here\n```";
      const result = parseSuggestionResponse(text);
      expect(result.analysis).toBeTruthy();
      expect(result.suggestions).toHaveLength(0);
    });
  });

  describe("applySuggestionPatch", () => {
    const baseModel = {
      entityTypes: [{ id: "e1", name: "Nurse", role: "server", count: 2 }],
      queues: [{ id: "q1", name: "Main queue", capacity: 10 }],
      stateVariables: [{ id: "v1", name: "shiftActive", initialValue: 1 }],
    };

    it("entityTypeCount changes correct entity", () => {
      const patched = applySuggestionPatch(baseModel, { type: "entityTypeCount", target: "Nurse", from: 2, to: 3 });
      expect(patched.entityTypes[0].count).toBe(3);
    });

    it("queueCapacity changes correct queue", () => {
      const patched = applySuggestionPatch(baseModel, { type: "queueCapacity", target: "Main queue", from: 10, to: 20 });
      expect(patched.queues[0].capacity).toBe(20);
    });

    it("stateVariable changes initial value", () => {
      const patched = applySuggestionPatch(baseModel, { type: "stateVariable", target: "shiftActive", from: 1, to: 0 });
      expect(patched.stateVariables[0].initialValue).toBe(0);
    });

    it("unknown target returns model unchanged (no crash)", () => {
      const patched = applySuggestionPatch(baseModel, { type: "entityTypeCount", target: "Doctor", from: 1, to: 2 });
      expect(patched.entityTypes[0].count).toBe(2);
    });

    it("does not mutate original model", () => {
      const original = JSON.parse(JSON.stringify(baseModel));
      applySuggestionPatch(baseModel, { type: "entityTypeCount", target: "Nurse", from: 2, to: 5 });
      expect(baseModel.entityTypes[0].count).toBe(original.entityTypes[0].count);
    });
  });

  describe("buildSuggestionPrompt — Sprint 46", () => {
    const modelWithGoals = {
      name: "Clinic",
      description: "A small clinic.",
      goals: [{ metric: "summary.avgWait", operator: "<", target: 3, label: "Avg wait < 3 min" }],
      entityTypes: [{ id: "e1", name: "Nurse", role: "server", count: 2 }],
      queues: [{ id: "q1", name: "Main queue", discipline: "FIFO" }],
      stateVariables: [],
    };

    it("includes goalGaps in payload when goals exist", () => {
      const prompt = buildSuggestionPrompt(
        modelWithGoals,
        { warmupPeriod: 10, maxSimTime: 200, replications: 3, seed: 42 },
        { aggregateStats: { "summary.avgWait": { mean: 4.2, n: 3 } } }
      );
      const payload = JSON.parse(prompt.messages[1].content);
      expect(payload.model.goalGaps).toBeDefined();
      expect(payload.model.goalGaps[0].met).toBe(false);
      expect(payload.model.goalGaps[0].current).toBe(4.2);
    });

    it("system prompt contains 'binding constraint'", () => {
      const prompt = buildSuggestionPrompt(modelWithGoals, {}, {});
      expect(prompt.messages[0].content).toMatch(/binding constraint/i);
    });
  });
});

// ── Sprint 70 — Constrained Plan Refinement ──────────────────────────────────

const scheduleModel = {
  name: "Clinic with Schedule",
  description: "A clinic with a loaded shift schedule.",
  entityTypes: [
    { id: "e1", name: "Nurse", role: "server", count: 2 },
  ],
  queues: [{ id: "q1", name: "Waiting", discipline: "FIFO" }],
  schedules: [
    { id: "sched-1", eventId: "sched-1", startTime: 0, endTime: 480, resourceType: "Nurse", count: 2 },
    { id: "sched-2", eventId: "sched-2", startTime: 480, endTime: 960, resourceType: "Nurse", count: 1 },
  ],
  goals: [
    { metric: "summary.avgWait", operator: "<", target: 5, label: "Avg wait < 5 min" },
  ],
};

const scheduleResults = {
  summary: { total: 50, served: 45, reneged: 5, avgWait: 7.2, avgSvc: 3.0, avgSojourn: 10.2 },
  aggregateStats: { "summary.avgWait": { mean: 7.2, n: 3 } },
  waitDist: {},
};

describe("Sprint 70 — buildPlanRefinementPrompt", () => {
  it("returns a valid messages array with system and user roles", () => {
    const prompt = buildPlanRefinementPrompt(scheduleModel, {}, scheduleResults);
    expect(Array.isArray(prompt.messages)).toBe(true);
    expect(prompt.messages[0].role).toBe("system");
    expect(prompt.messages[1].role).toBe("user");
    expect(prompt.max_tokens).toBe(700);
  });

  it("user message includes schedule digest when model has schedules", () => {
    const prompt = buildPlanRefinementPrompt(scheduleModel, {}, scheduleResults);
    const payload = JSON.parse(prompt.messages[1].content);
    expect(Array.isArray(payload.scheduleDigest)).toBe(true);
    expect(payload.scheduleDigest.length).toBe(2);
    expect(payload.scheduleDigest[0].eventId).toBe("sched-1");
    expect(payload.scheduleDigest[0].startTime).toBe(0);
    expect(payload.scheduleDigest[0].endTime).toBe(480);
  });

  it("user message includes goal gaps when goals are defined", () => {
    const prompt = buildPlanRefinementPrompt(scheduleModel, {}, scheduleResults);
    const payload = JSON.parse(prompt.messages[1].content);
    expect(Array.isArray(payload.goalGaps)).toBe(true);
    expect(payload.goalGaps.length).toBeGreaterThan(0);
    expect(payload.goalGaps[0].metric).toBe("summary.avgWait");
    expect(payload.goalGaps[0].met).toBe(false);
  });

  it("assembled payload does not exceed 2000 words (truncateWords applied)", () => {
    const prompt = buildPlanRefinementPrompt(scheduleModel, {}, scheduleResults);
    const wordCount = prompt.messages[1].content.split(/\s+/).filter(Boolean).length;
    expect(wordCount).toBeLessThanOrEqual(2000);
  });

  it("system prompt contains the string 'hard constraints'", () => {
    const prompt = buildPlanRefinementPrompt(scheduleModel, {}, scheduleResults);
    expect(prompt.messages[0].content).toMatch(/hard constraints/i);
  });

  it("works with empty model and results (no crash)", () => {
    const prompt = buildPlanRefinementPrompt({}, {}, {});
    expect(Array.isArray(prompt.messages)).toBe(true);
    expect(prompt.messages[0].role).toBe("system");
  });
});

describe("Sprint 70 — parsePlanRefinementResponse", () => {
  const validJson = JSON.stringify({
    analysis: "The schedule has a gap during peak hours.",
    recommendations: [
      {
        rank: 1,
        targetScheduleId: "sched-1",
        change: "Extend morning shift by 1 hour",
        rationale: "Reduces queue length at peak",
        goalImpact: "Avg wait expected to drop from 7.2 to 4.8",
        feasible: true,
        revisedEntry: { id: "sched-1", startTime: 0, endTime: 540, count: 2 },
      },
    ],
    infeasibleGoals: [],
  });

  it("correctly extracts recommendations array from valid fenced JSON block", () => {
    const text = `\`\`\`json\n${validJson}\n\`\`\``;
    const result = parsePlanRefinementResponse(text);
    expect(result.analysis).toBe("The schedule has a gap during peak hours.");
    expect(result.recommendations).toHaveLength(1);
    expect(result.recommendations[0].rank).toBe(1);
    expect(result.recommendations[0].targetScheduleId).toBe("sched-1");
    expect(result.infeasibleGoals).toHaveLength(0);
  });

  it("returns graceful fallback when JSON block is absent", () => {
    const text = "The schedule needs adjustment.";
    const result = parsePlanRefinementResponse(text);
    expect(result.analysis).toBe(text);
    expect(result.recommendations).toHaveLength(0);
    expect(result.infeasibleGoals).toHaveLength(0);
  });

  it("returns graceful fallback when JSON is malformed", () => {
    const text = "```json\n{broken json here\n```";
    const result = parsePlanRefinementResponse(text);
    expect(result.analysis).toBeTruthy();
    expect(result.recommendations).toHaveLength(0);
    expect(result.infeasibleGoals).toHaveLength(0);
  });

  it("feasible field is correctly parsed as boolean on each card", () => {
    const withFeasibility = JSON.stringify({
      analysis: "Analysis text",
      recommendations: [
        { rank: 1, targetScheduleId: "s1", change: "x", rationale: "r", goalImpact: "i", feasible: true, revisedEntry: {} },
        { rank: 2, targetScheduleId: "s2", change: "y", rationale: "r", goalImpact: "i", feasible: false, revisedEntry: {} },
      ],
      infeasibleGoals: [{ goalLabel: "Goal A", reason: "Capacity limit" }],
    });
    const result = parsePlanRefinementResponse(`\`\`\`json\n${withFeasibility}\n\`\`\``);
    expect(typeof result.recommendations[0].feasible).toBe("boolean");
    expect(result.recommendations[0].feasible).toBe(true);
    expect(result.recommendations[1].feasible).toBe(false);
    expect(result.infeasibleGoals[0].goalLabel).toBe("Goal A");
  });
});

describe("Sprint 70 — applySchedulePatch", () => {
  const baseModel = {
    schedules: [
      { id: "sched-1", startTime: 0, endTime: 480, count: 2 },
      { id: "sched-2", startTime: 480, endTime: 960, count: 1 },
    ],
    shiftSchedules: [
      { id: "shift-1", startTime: 0, endTime: 240, count: 3 },
    ],
  };

  const card = {
    targetScheduleId: "sched-1",
    revisedEntry: { id: "sched-1", startTime: 0, endTime: 540, count: 2 },
  };

  it("returns a deep clone (patched model !== original model)", () => {
    const result = applySchedulePatch(baseModel, card);
    expect(result).not.toBe(baseModel);
    expect(result.schedules).not.toBe(baseModel.schedules);
  });

  it("correctly replaces matched schedule entry by id", () => {
    const result = applySchedulePatch(baseModel, card);
    expect(result.schedules[0].endTime).toBe(540);
    expect(result.schedules[1].endTime).toBe(960);
  });

  it("correctly patches shiftSchedules when id matches there", () => {
    const shiftCard = {
      targetScheduleId: "shift-1",
      revisedEntry: { id: "shift-1", startTime: 0, endTime: 300, count: 3 },
    };
    const result = applySchedulePatch(baseModel, shiftCard);
    expect(result.shiftSchedules[0].endTime).toBe(300);
  });

  it("throws descriptive error when targetScheduleId is not found", () => {
    expect(() => applySchedulePatch(baseModel, { targetScheduleId: "nonexistent", revisedEntry: {} }))
      .toThrow(/nonexistent/);
  });

  it("does not mutate the input model", () => {
    const original = JSON.parse(JSON.stringify(baseModel));
    applySchedulePatch(baseModel, card);
    expect(baseModel.schedules[0].endTime).toBe(original.schedules[0].endTime);
  });
});
