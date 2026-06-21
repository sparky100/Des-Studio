import { describe, expect, test } from "vitest";
import {
  binSeriesPoints,
  buildChartSections,
  buildQueueDepthSeries,
  buildResultsViewModel,
  buildRuntimeMetricsModel,
  buildServerUtilizationSeries,
  buildSystemSojournDistribution,
  buildThroughputSeries,
  buildWaitDistributions,
  buildWaitTimeSeries,
  buildWipSeries,
} from "../../../src/ui/results/resultsViewModel.js";

const model = {
  queues: [
    { id: "q-a", name: "Queue A", customerType: "Customer" },
    { id: "q-b", name: "Queue B", customerType: "Patient" },
  ],
  entityTypes: [
    { id: "et-c", name: "Customer", role: "customer" },
    { id: "et-p", name: "Patient", role: "customer" },
    { id: "et-s", name: "Clerk", role: "server", count: "2" },
  ],
};

describe("results view model", () => {
  test("buildQueueDepthSeries uses queue-level data when present", () => {
    const series = buildQueueDepthSeries({
      timeSeries: [
        { t: 0, byQueue: { "Queue A": { waiting: 1 }, "Queue B": { waiting: 4 } }, byType: { Customer: { waiting: 99 } } },
        { t: 5, byQueue: { "Queue A": { waiting: 2 }, "Queue B": { waiting: 3 } }, byType: { Customer: { waiting: 99 } } },
      ],
    }, model);

    expect(series.map(s => s.label)).toEqual(["Queue A", "Queue B"]);
    expect(series[0].points).toEqual([{ t: 0, value: 1 }, { t: 5, value: 2 }]);
    expect(series[1].points).toEqual([{ t: 0, value: 4 }, { t: 5, value: 3 }]);
    expect(series[0].source).toBe("queue");
  });

  test("buildQueueDepthSeries falls back to type-level data for older saved runs", () => {
    const series = buildQueueDepthSeries({
      timeSeries: [
        { t: 0, byType: { Customer: { waiting: 7 }, Patient: { waiting: 2 } } },
        { t: 5, byType: { Customer: { waiting: 5 }, Patient: { waiting: 6 } } },
      ],
    }, model);

    expect(series[0].points).toEqual([{ t: 0, value: 7 }, { t: 5, value: 5 }]);
    expect(series[1].points).toEqual([{ t: 0, value: 2 }, { t: 5, value: 6 }]);
    expect(series[0].source).toBe("type-fallback");
  });

  test("buildWaitTimeSeries reads avgWait per queue on the same time axis as queue depth", () => {
    const series = buildWaitTimeSeries({
      timeSeries: [
        { t: 0, byQueue: { "Queue A": { waiting: 1, avgWait: null, waitN: 0 }, "Queue B": { waiting: 4, avgWait: 2, waitN: 1 } } },
        { t: 5, byQueue: { "Queue A": { waiting: 2, avgWait: 3, waitN: 2 }, "Queue B": { waiting: 3, avgWait: 1, waitN: 1 } } },
      ],
    }, model);

    expect(series.map(s => s.label)).toEqual(["Queue A", "Queue B"]);
    // Queue A's t=0 sample has no completions yet (avgWait null) and is dropped.
    expect(series[0].points).toEqual([{ t: 5, value: 3 }]);
    expect(series[0].hasData).toBe(false);
    expect(series[1].points).toEqual([{ t: 0, value: 2 }, { t: 5, value: 1 }]);
    expect(series[1].hasData).toBe(true);
  });

  test("buildServerUtilizationSeries normalizes busy servers by capacity", () => {
    const series = buildServerUtilizationSeries({
      timeSeries: [
        { t: 0, byType: { Clerk: { busy: 0 } } },
        { t: 5, byType: { Clerk: { busy: 1 } } },
        { t: 10, byType: { Clerk: { busy: 2 } } },
      ],
    }, model);

    expect(series[0].label).toBe("Clerk");
    expect(series[0].points).toEqual([
      { t: 0, value: 0 },
      { t: 5, value: 50 },
      { t: 10, value: 100 },
    ]);
  });

  test("buildWaitDistributions sorts values and drops unchartable distributions", () => {
    const distributions = buildWaitDistributions({
      waitDist: {
        "Queue A": { n: 3, mean: 4, p50: 4, p90: 8, p95: 9, p99: 10, values: [8, 1, 3] },
        Empty: { n: 0, values: [] },
      },
    });

    expect(distributions).toHaveLength(1);
    expect(distributions[0].label).toBe("Queue A");
    expect(distributions[0].values).toEqual([1, 3, 8]);
  });

  test("buildWaitDistributions keeps histogram-only entries from compacted saved runs", () => {
    const histogram = { bins: [{ low: 0, high: 5, count: 4 }, { low: 5, high: 10, count: 2 }] };
    const distributions = buildWaitDistributions({
      waitDist: {
        "Queue A": { n: 6, mean: 4, p50: 4, p90: 8, p95: 9, p99: 10, histogram },
        Empty: { n: 0, histogram: { bins: [] } },
      },
    });

    expect(distributions).toHaveLength(1);
    expect(distributions[0].label).toBe("Queue A");
    expect(distributions[0].n).toBe(6);
    expect(distributions[0].values).toEqual([]);
    expect(distributions[0].histogram).toEqual(histogram);
  });

  test("buildWipSeries reads the wip field from timeSeries entries", () => {
    const series = buildWipSeries({
      timeSeries: [{ t: 0, wip: 3 }, { t: 5, wip: 7 }, { t: 10, wip: 4 }],
    });

    expect(series).toHaveLength(1);
    expect(series[0].id).toBe("wip");
    expect(series[0].points).toEqual([{ t: 0, value: 3 }, { t: 5, value: 7 }, { t: 10, value: 4 }]);
    expect(series[0].hasData).toBe(true);
  });

  test("buildWipSeries reports no data when wip is absent (older saved runs)", () => {
    const series = buildWipSeries({ timeSeries: [{ t: 0 }, { t: 5 }] });
    expect(series[0].points).toEqual([]);
    expect(series[0].hasData).toBe(false);
  });

  test("buildWipSeries leaves chartPoints equal to points for small runs (no binning needed)", () => {
    const series = buildWipSeries({
      timeSeries: [{ t: 0, wip: 3 }, { t: 5, wip: 7 }, { t: 10, wip: 4 }],
    });
    expect(series[0].chartPoints).toEqual(series[0].points);
  });

  test("buildThroughputSeries reads the completed field from timeSeries entries", () => {
    const series = buildThroughputSeries({
      timeSeries: [{ t: 0, completed: 0 }, { t: 5, completed: 4 }, { t: 10, completed: 2 }],
    });

    expect(series).toHaveLength(1);
    expect(series[0].id).toBe("throughput");
    expect(series[0].points).toEqual([{ t: 0, value: 0 }, { t: 5, value: 4 }, { t: 10, value: 2 }]);
    expect(series[0].hasData).toBe(true);
  });

  test("buildThroughputSeries leaves chartPoints equal to points for small runs (no binning needed)", () => {
    const series = buildThroughputSeries({
      timeSeries: [{ t: 0, completed: 0 }, { t: 5, completed: 4 }, { t: 10, completed: 2 }],
    });
    expect(series[0].chartPoints).toEqual(series[0].points);
  });

  test("binSeriesPoints passes points through unchanged when under the bucket count", () => {
    const points = [{ t: 0, value: 1 }, { t: 5, value: 2 }];
    expect(binSeriesPoints(points)).toEqual(points);
  });

  test("binSeriesPoints averages a large series into a reduced number of buckets", () => {
    const points = Array.from({ length: 200 }, (_, i) => ({ t: i, value: i % 2 === 0 ? 10 : 0 }));
    const binned = binSeriesPoints(points, { aggregate: "avg" });

    expect(binned.length).toBeLessThan(points.length);
    expect(binned.length).toBeLessThanOrEqual(60);
    // averaging alternating 10/0 values should land close to 5 overall
    const overallAvg = binned.reduce((sum, p) => sum + p.value, 0) / binned.length;
    expect(overallAvg).toBeCloseTo(5, 0);
  });

  test("binSeriesPoints sums a large series instead of averaging when aggregate is 'sum'", () => {
    const points = Array.from({ length: 200 }, (_, i) => ({ t: i, value: 1 }));
    const binnedAvg = binSeriesPoints(points, { aggregate: "avg" });
    const binnedSum = binSeriesPoints(points, { aggregate: "sum" });

    const totalRaw = points.reduce((sum, p) => sum + p.value, 0);
    const totalSum = binnedSum.reduce((sum, p) => sum + p.value, 0);
    const totalAvg = binnedAvg.reduce((sum, p) => sum + p.value, 0);

    expect(totalSum).toBeCloseTo(totalRaw, 5);
    expect(totalSum).toBeGreaterThan(totalAvg);
  });

  test("binSeriesPoints collapses to a single point when all timestamps are identical", () => {
    const points = Array.from({ length: 100 }, () => ({ t: 5, value: 2 }));
    expect(binSeriesPoints(points)).toEqual(points);
  });

  test("buildWipSeries reduces chartPoints below raw point count for large runs", () => {
    const timeSeries = Array.from({ length: 500 }, (_, i) => ({ t: i, wip: i % 10 }));
    const series = buildWipSeries({ timeSeries });

    expect(series[0].points).toHaveLength(500);
    expect(series[0].chartPoints.length).toBeLessThan(500);
    expect(series[0].chartPoints.length).toBeLessThanOrEqual(60);
  });

  test("buildThroughputSeries reduces chartPoints below raw point count for large runs", () => {
    const timeSeries = Array.from({ length: 500 }, (_, i) => ({ t: i, completed: 1 }));
    const series = buildThroughputSeries({ timeSeries });

    expect(series[0].points).toHaveLength(500);
    expect(series[0].chartPoints.length).toBeLessThan(500);
    expect(series[0].chartPoints.length).toBeLessThanOrEqual(60);
  });

  test("buildSystemSojournDistribution wraps results.sojournDist in the WaitHistogram shape", () => {
    const distributions = buildSystemSojournDistribution({
      sojournDist: { n: 3, mean: 5, p50: 5, p90: 8, p95: 8, p99: 8, values: [2, 5, 8] },
    });

    expect(distributions).toHaveLength(1);
    expect(distributions[0].label).toBe("Whole-journey sojourn time");
    expect(distributions[0].values).toEqual([2, 5, 8]);
    expect(distributions[0].n).toBe(3);
  });

  test("buildSystemSojournDistribution returns empty array when sojournDist is absent", () => {
    expect(buildSystemSojournDistribution({})).toEqual([]);
  });

  test("buildResultsViewModel reports chart availability", () => {
    const vm = buildResultsViewModel({
      timeSeries: [{ t: 0, byQueue: { "Queue A": { waiting: 1 }, "Queue B": { waiting: 2 } }, byType: { Clerk: { busy: 1, total: 2 } } }],
      waitDist: {},
    }, model);
    expect(vm.hasTimeSeries).toBe(true);
    expect(vm.queueDepthSeries).toHaveLength(2);
    expect(vm.serverUtilizationSeries).toHaveLength(1);
  });

  test("buildRuntimeMetricsModel normalises runtime metrics for the results UI", () => {
    const runtime = buildRuntimeMetricsModel({
      runtimeMetrics: {
        wall_clock_ms: 42,
        replications: 3,
        events_processed: 900,
        c_event_scans: 1200,
        c_events_fired: 450,
        entities_created: 220,
        entities_completed: 200,
        max_queue_length_by_queue: { "Queue B": 2, "Queue A": 5 },
      },
    });

    expect(runtime.hasMetrics).toBe(true);
    expect(runtime.metrics.wallClockMs).toBe(42);
    expect(runtime.metrics.replications).toBe(3);
    expect(runtime.metrics.maxQueueLengthByQueue).toEqual([
      { queueName: "Queue A", depth: 5 },
      { queueName: "Queue B", depth: 2 },
    ]);
  });

  test("buildRuntimeMetricsModel tolerates older runs with no runtime metrics", () => {
    const runtime = buildRuntimeMetricsModel({});

    expect(runtime.hasMetrics).toBe(false);
    expect(runtime.metrics.maxQueueLengthByQueue).toEqual([]);
  });

  test("buildChartSections describes the modelling question and data method", () => {
    const sections = buildChartSections({
      timeSeries: [{ t: 0, byQueue: { "Queue A": { waiting: 2 } }, byType: { Clerk: { busy: 1 } } }],
      waitDist: { "Queue A": { n: 2, mean: 3, p50: 3, p90: 4, p95: 4, p99: 4, values: [2, 4] } },
    }, model);

    expect(sections.map(section => section.id)).toEqual([
      "wait-distribution",
      "server-utilization",
      "queue-depth",
      "wait-over-time",
      "wait-by-arrival-attr",
      "system-wip",
      "system-throughput",
      "system-sojourn",
    ]);
    expect(sections[0].question).toBe("How much time is spent queueing?");
    expect(sections[0].title).toBe("Waiting time distribution");
    expect(sections[1].method).toMatch(/busy over time/i);
    expect(sections[2].question).toBe("Where do queues build up?");
    expect(sections[3].question).toBe("When did waits get longer?");
    expect(sections[4].question).toMatch(/Did wait get worse for entities that arrived later/i);
    expect(sections[4].question).not.toMatch(/attribute/i);
  });

  test("buildChartSections hides queue-depth and server-utilization series that are all zero", () => {
    const sections = buildChartSections({
      timeSeries: [
        { t: 0, byQueue: { "Queue A": { waiting: 0 }, "Queue B": { waiting: 3 } }, byType: { Clerk: { busy: 0, total: 2 } } },
        { t: 5, byQueue: { "Queue A": { waiting: 0 }, "Queue B": { waiting: 1 } }, byType: { Clerk: { busy: 0, total: 2 } } },
      ],
    }, model);

    const queueDepth = sections.find(s => s.id === "queue-depth");
    expect(queueDepth.series.map(s => s.label)).toEqual(["Queue B"]);

    const serverUtilization = sections.find(s => s.id === "server-utilization");
    expect(serverUtilization.series).toEqual([]);
  });

  test("buildChartSections hides wait-over-time, wip, throughput, and wait-by-arrival when all-zero", () => {
    const sections = buildChartSections({
      timeSeries: [
        { t: 0, byQueue: { "Queue A": { waiting: 0, avgWait: 0, waitN: 1 } }, wip: 0, completed: 0 },
        { t: 5, byQueue: { "Queue A": { waiting: 0, avgWait: 0, waitN: 1 } }, wip: 0, completed: 0 },
      ],
      waitByArrival: [[0, 0], [10, 0], [20, 0]],
    }, model);

    expect(sections.find(s => s.id === "wait-over-time").series).toEqual([]);
    expect(sections.find(s => s.id === "system-wip").series).toEqual([]);
    expect(sections.find(s => s.id === "system-throughput").series).toEqual([]);
    expect(sections.find(s => s.id === "wait-by-arrival-attr").series).toEqual([]);
  });
});
