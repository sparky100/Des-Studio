import { describe, test, expect } from "vitest";
import { summarizeContainerSeries, summarizeLevelSeries } from "../../src/engine/containerSeriesStats.js";

const pts = (pairs) => pairs.map(([t, v]) => ({ t, v }));

describe("summarizeLevelSeries", () => {
  test("finds trough/peak with times, stockouts and time spent empty (step function)", () => {
    // 100 until t=20, empty 20–30, 50 until 60, empty 60–80, 40 to t=100
    const d = summarizeLevelSeries(pts([[0, 100], [20, 0], [30, 50], [60, 0], [80, 40], [100, 40]]));
    expect(d.trough).toEqual({ level: 0, t: 20 });
    expect(d.peak).toEqual({ level: 100, t: 0 });
    expect(d.final).toBe(40);
    expect(d.firstEmptyAt).toBe(20);
    expect(d.timesEmptied).toBe(2);
    expect(d.pctTimeEmpty).toBe(30);
  });

  test("never-empty container has no firstEmptyAt and 0% empty", () => {
    const d = summarizeLevelSeries(pts([[0, 10], [5, 8], [10, 12]]));
    expect(d.firstEmptyAt).toBeNull();
    expect(d.timesEmptied).toBe(0);
    expect(d.pctTimeEmpty).toBe(0);
  });

  test("profile keeps a brief stockout as a bucket minimum", () => {
    const series = [[0, 50]];
    for (let t = 1; t <= 100; t++) series.push([t, t === 37 ? 0 : 50]);
    const d = summarizeLevelSeries(pts(series), 10);
    expect(d.profile).toHaveLength(10);
    const bucket = d.profile.find(p => p.t === 30);
    expect(bucket.min).toBe(0);
    expect(bucket.level).toBe(50);
    expect(d.profile.filter(p => p.min === 0)).toHaveLength(1);
  });

  test("reports early vs late mean for drawdown", () => {
    const series = Array.from({ length: 10 }, (_, i) => [i, 100 - i * 10]);
    const d = summarizeLevelSeries(pts(series));
    expect(d.earlyMean).toBe(95);
    expect(d.lateMean).toBe(15);
  });

  test("returns null with fewer than two points", () => {
    expect(summarizeLevelSeries(pts([[0, 1]]))).toBeNull();
  });
});

describe("summarizeContainerSeries", () => {
  test("digests every container found in timeSeries[].byContainer", () => {
    const ts = [
      { t: 0, byContainer: { A: 5, B: 0 } },
      { t: 10, byContainer: { A: 0, B: 3 } },
    ];
    const out = summarizeContainerSeries(ts);
    expect(Object.keys(out)).toEqual(["A", "B"]);
    expect(out.A.firstEmptyAt).toBe(10);
    expect(out.B.firstEmptyAt).toBe(0);
  });

  test("returns null without container data", () => {
    expect(summarizeContainerSeries([{ t: 0 }, { t: 1 }])).toBeNull();
    expect(summarizeContainerSeries(undefined)).toBeNull();
  });
});
