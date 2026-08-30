// buildResultsXlsx's Container Levels / Skill Utilisation / Queue Rejections
// sheets — previously entirely absent from CSV and XLSX exports (the
// hand-picked fixed-column schema had zero container/balk/skill presence).
// downloadWorkbook is mocked to capture the assembled `sheets` array instead
// of exercising the real ExcelJS write + browser download.
import { describe, expect, it, vi } from "vitest";

const downloadWorkbook = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock("../../../src/ui/shared/workbook.js", () => ({ downloadWorkbook }));

import { buildResultsXlsx } from "../../../src/ui/execute/executeHelpers.js";

const findSheet = (name) => downloadWorkbook.mock.calls.at(-1)[0].find(s => s.name === name);

describe("buildResultsXlsx — container/skill/rejection sheets", () => {
  it("adds a Container Levels sheet when summary.containerLevels is present", async () => {
    await buildResultsXlsx({
      results: { summary: { containerLevels: { Bikes: { min: 2, max: 18, avg: 9, final: 5 } } } },
      model: { name: "Bike Shop" },
    });
    const sheet = findSheet("Container Levels");
    expect(sheet).toBeDefined();
    expect(sheet.rows).toContainEqual(["Bikes", 2, 9, 18, 5]);
  });

  it("omits the Container Levels sheet when there is no container data", async () => {
    await buildResultsXlsx({ results: { summary: {} }, model: { name: "Plain" } });
    expect(findSheet("Container Levels")).toBeUndefined();
  });

  it("adds a Skill Utilisation sheet when a resource type has skillUtil", async () => {
    await buildResultsXlsx({
      results: { summary: { perResource: { Staff: { total: 2, utilisation: 0.5, skillUtil: { Repair: 0.8 } } } } },
      model: { name: "Bike Shop" },
    });
    const sheet = findSheet("Skill Utilisation");
    expect(sheet).toBeDefined();
    expect(sheet.rows).toContainEqual(["Staff", "Repair", "80%"]);
  });

  it("omits the Skill Utilisation sheet when no resource has skillUtil", async () => {
    await buildResultsXlsx({
      results: { summary: { perResource: { Staff: { total: 2, utilisation: 0.5 } } } },
      model: { name: "Plain" },
    });
    expect(findSheet("Skill Utilisation")).toBeUndefined();
  });

  it("adds a Queue Rejections sheet when perQueue has balk/blocking counts", async () => {
    await buildResultsXlsx({
      results: { summary: {}, perQueue: { "Hire Queue": { balkCount: 5, blockingCount: 2 }, "Empty Queue": { balkCount: 0, blockingCount: 0 } } },
      model: { name: "Bike Shop" },
    });
    const sheet = findSheet("Queue Rejections");
    expect(sheet).toBeDefined();
    expect(sheet.rows).toContainEqual(["Hire Queue", 5, 2]);
    // A queue with zero rejections is omitted from the sheet entirely.
    expect(sheet.rows.some(r => r[0] === "Empty Queue")).toBe(false);
  });

  it("omits the Queue Rejections sheet when no queue has any rejections", async () => {
    await buildResultsXlsx({
      results: { summary: {}, perQueue: { "Queue A": { balkCount: 0, blockingCount: 0 } } },
      model: { name: "Plain" },
    });
    expect(findSheet("Queue Rejections")).toBeUndefined();
  });
});
