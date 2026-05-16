import { describe, expect, it } from "vitest";
import {
  applySuggestionPatch,
  buildCiResults,
  buildComparisonPrompt,
  buildGoalGaps,
  buildNarrativePrompt,
  buildResultsQueryPrompt,
  buildSensitivityPrompt,
  buildSuggestionPrompt,
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
