// Container level time-series digest (G21).
//
// Condenses timeSeries[].byContainer into a few figures per container that a
// reader (Key Findings, the LLM export pack, AI analysis prompts) can reason
// about without the raw series: when the stock bottomed out, whether and how
// often it ran dry, how long it sat empty, and a short level profile.
//
// The engine records the instantaneous level after every event, so the level
// is treated as a step function held from one sample to the next. For a batch
// result the series is the mean across replications, so "empty" there means
// every replication was empty at that time.

const EMPTY_EPS = 1e-9;
const DEFAULT_PROFILE_POINTS = 20;

function round(v, dp = 2) {
  return Number.isFinite(v) ? +v.toFixed(dp) : null;
}

/**
 * Summarise one container's level series.
 * @param {{ t: number, v: number }[]} points  ascending by t
 * @param {number} [profilePoints]
 */
export function summarizeLevelSeries(points, profilePoints = DEFAULT_PROFILE_POINTS) {
  if (!Array.isArray(points) || points.length < 2) return null;
  const t0 = points[0].t;
  const tEnd = points[points.length - 1].t;
  const span = tEnd - t0;

  let trough = points[0];
  let peak = points[0];
  let firstEmptyAt = null;
  let timesEmptied = 0;
  let timeEmpty = 0;
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    if (p.v < trough.v) trough = p;
    if (p.v > peak.v) peak = p;
    const empty = p.v <= EMPTY_EPS;
    const wasEmpty = i > 0 && points[i - 1].v <= EMPTY_EPS;
    if (empty && !wasEmpty) {
      timesEmptied++;
      if (firstEmptyAt == null) firstEmptyAt = p.t;
    }
    if (empty && i < points.length - 1) timeEmpty += points[i + 1].t - p.t;
  }

  // Trend: mean of the last 20% of samples vs the first 20%.
  const k = Math.max(1, Math.floor(points.length * 0.2));
  const mean = arr => arr.reduce((s, p) => s + p.v, 0) / arr.length;
  const earlyMean = mean(points.slice(0, k));
  const lateMean = mean(points.slice(-k));

  // Profile: equal time buckets, each reporting its minimum (so a brief
  // stockout survives the downsampling) and its closing level.
  const profile = [];
  if (span > 0) {
    const n = Math.max(2, profilePoints);
    let j = 0;
    let carried = points[0].v;
    for (let b = 0; b < n; b++) {
      const start = t0 + (b / n) * span;
      const end = t0 + ((b + 1) / n) * span;
      // The level entering the bucket is the one carried from the previous
      // sample (step function), then every sample inside the bucket.
      let min = carried;
      let last = carried;
      while (j < points.length && (points[j].t < end || b === n - 1)) {
        min = Math.min(min, points[j].v);
        last = points[j].v;
        j++;
      }
      carried = last;
      profile.push({ t: round(start), min: round(min), level: round(last) });
    }
  }

  return {
    trough: { level: round(trough.v), t: round(trough.t) },
    peak: { level: round(peak.v), t: round(peak.t) },
    final: round(points[points.length - 1].v),
    firstEmptyAt: firstEmptyAt != null ? round(firstEmptyAt) : null,
    timesEmptied,
    pctTimeEmpty: span > 0 ? round((timeEmpty / span) * 100, 1) : 0,
    earlyMean: round(earlyMean),
    lateMean: round(lateMean),
    samples: points.length,
    profile,
  };
}

/**
 * Digest every container in a results timeSeries.
 * @param {any[]} timeSeries
 * @param {{ profilePoints?: number }} [options]
 * @returns {Record<string, ReturnType<typeof summarizeLevelSeries>> | null}
 */
export function summarizeContainerSeries(timeSeries, options = {}) {
  if (!Array.isArray(timeSeries) || timeSeries.length < 2) return null;
  const ids = new Set();
  for (const pt of timeSeries) for (const id of Object.keys(pt?.byContainer || {})) ids.add(id);
  if (!ids.size) return null;
  /** @type {Record<string, any>} */
  const out = {};
  for (const id of ids) {
    const points = [];
    for (const pt of timeSeries) {
      const v = Number(pt?.byContainer?.[id]);
      const t = Number(pt?.t);
      if (Number.isFinite(v) && Number.isFinite(t)) points.push({ t, v });
    }
    const digest = summarizeLevelSeries(points, options.profilePoints);
    if (digest) out[id] = digest;
  }
  return Object.keys(out).length ? out : null;
}
