import { describe, expect, it } from "vitest";
import {
  buildCiResults,
  buildComparisonPrompt,
  buildNarrativePrompt,
  buildSensitivityPrompt,
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
      { summary: { total: 20, served: 18, reneged: 2, avgWait: 9, avgSvc: 3, avgSojourn: 12 } }
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
});
