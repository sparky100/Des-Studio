// A published model runs in the visitor's browser, so it is admitted under its
// own "published" tier rather than the free plan's (which exists to protect
// the platform, and blocked realistic models on the public page).
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import { checkPublishedRun, publishedRunSettings } from "../../src/engine/published-run-check.js";
import { RUN_ADMISSION_TIERS, getRunAdmission } from "../../src/engine/run-admission.js";

const electricity = JSON.parse(fs.readFileSync(
  new URL("../fixtures/uk_electricity_supplier_des_phase1.json", import.meta.url), "utf8"));

describe("publishedRunSettings", () => {
  it("uses the model's experiment defaults, with the page's own fallbacks", () => {
    expect(publishedRunSettings({ experimentDefaults: { replications: 4, maxSimTime: 90, warmupPeriod: 10, seed: 7 } }))
      .toMatchObject({ replications: 4, maxSimTime: 90, warmupPeriod: 10, seed: 7, terminationMode: "time" });
    expect(publishedRunSettings({})).toMatchObject({ replications: 10, maxSimTime: 500, warmupPeriod: 0, seed: 0 });
  });

  it("has no run length for a stop-on-condition model", () => {
    const s = publishedRunSettings({ experimentDefaults: { terminationMode: "condition", terminationCondition: "x > 1" } });
    expect(s).toMatchObject({ terminationMode: "condition", maxSimTime: null, terminationCondition: "x > 1" });
  });
});

describe("the published tier", () => {
  it("is more generous than the free tier on every limit", () => {
    const { free, published } = RUN_ADMISSION_TIERS;
    expect(published.maxScans).toBeGreaterThan(free.maxScans);
    expect(published.maxReplications).toBeGreaterThan(free.maxReplications);
    expect(published.maxSimTime).toBeGreaterThan(free.maxSimTime);
    expect(published.maxPlannedRows).toBeGreaterThan(free.maxPlannedRows);
  });

  it("admits the UK electricity model at its default settings, which the free tier blocks", () => {
    const { settings, complexityEstimate, admission } = checkPublishedRun(electricity);
    expect(admission.tier).toBe("published");
    expect(admission.hardErrors).toEqual([]);
    expect(admission.effectiveSettings.allowRun).toBe(true);
    // It is heavy, and says so, rather than being blocked.
    expect(admission.warnings.map(w => w.code)).toContain("RA8");

    const free = getRunAdmission(electricity, { ...settings, complexityEstimate });
    expect(free.hardErrors.map(e => e.code)).toContain("RA7");
  });

  it("still blocks a visitor run that asks for too many replications", () => {
    const heavy = { ...electricity, experimentDefaults: { ...electricity.experimentDefaults, replications: 500 } };
    const { admission } = checkPublishedRun(heavy);
    expect(admission.hardErrors.map(e => e.code)).toContain("RA3");
    expect(admission.hardErrors.find(e => e.code === "RA3").message).toMatch(/published tier/i);
  });
});
