import { describe, expect, it } from "vitest";
import {
  buildCiResults,
  buildComparisonPrompt,
  buildNarrativePrompt,
  buildResultsQueryPrompt,
  buildSensitivityPrompt,
  buildSuggestionPrompt,
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
