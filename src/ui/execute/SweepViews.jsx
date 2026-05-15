// ui/execute/SweepViews.jsx — SweepChart, WarmupChart, Sweep2DGrid

import { C, FONT } from "../shared/tokens.js";
import { Btn } from "../shared/components.jsx";
import { fmt, METRIC_LABELS } from "./executeHelpers.js";

// Check whether a sweep point's aggregateStats satisfies all goals.
// goals: array of {metric, operator, target} from model.goals
// Returns true if all goals met, false if any missed, null if no goals or no data.
function pointIsFeasible(goals, aggregateStats) {
  if (!goals?.length) return null;
  const STAT_KEY = {
    avgWait: "summary.avgWait", avgSvc: "summary.avgSvc", avgSojourn: "summary.avgSojourn",
    served: "summary.served", reneged: "summary.reneged", totalCost: "summary.totalCost",
  };
  for (const g of goals) {
    const key = STAT_KEY[g.metric];
    if (!key) continue;
    const val = aggregateStats[key]?.mean;
    if (val == null || !Number.isFinite(val)) return null;
    const t = parseFloat(g.target);
    const op = g.operator || "<";
    const met =
      op === "<"  ? val < t  :
      op === "<=" ? val <= t :
      op === ">"  ? val > t  :
      op === ">=" ? val >= t :
      Math.abs(val - t) < 0.001;
    if (!met) return false;
  }
  return true;
}

export function SweepChart({ results, metric, paramLabel, goals = [] }) {
  if (!results?.length) return null;

  const statPath = metric;
  const means = results.map(r => r.aggregateStats[statPath]?.mean ?? null);

  const finite = means.filter(m => m != null);
  if (finite.length < 2) {
    return (
      <div style={{ fontSize: 11, color: C.muted, fontFamily: FONT, padding: 12, textAlign: "center", background: C.bg, borderRadius: 6, border: `1px solid ${C.border}` }}>
        Not enough data points to plot chart (need at least 2).
      </div>
    );
  }

  const W = 400, H = 170, PAD = { top: 16, right: 20, bottom: 28, left: 50 };
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;

  const valid = results.filter((_, i) => means[i] != null);
  const vValues = valid.map(r => r.value);
  const vMeans = valid.map(r => r.aggregateStats[statPath].mean);
  const vLowers = valid.map(r => r.aggregateStats[statPath]?.lower ?? r.aggregateStats[statPath].mean);
  const vUppers = valid.map(r => r.aggregateStats[statPath]?.upper ?? r.aggregateStats[statPath].mean);
  const feasibility = valid.map(r => pointIsFeasible(goals, r.aggregateStats));

  // Goal threshold lines that match the displayed metric
  const STAT_KEY = {
    avgWait: "summary.avgWait", avgSvc: "summary.avgSvc", avgSojourn: "summary.avgSojourn",
    served: "summary.served", reneged: "summary.reneged", totalCost: "summary.totalCost",
  };
  const matchingGoals = goals.filter(g => STAT_KEY[g.metric] === metric && g.target != null);

  const xMin = Math.min(...vValues);
  const xMax = Math.max(...vValues);
  const allY = [...vLowers, ...vUppers, ...matchingGoals.map(g => parseFloat(g.target))].filter(Number.isFinite);
  const yMin = Math.min(...allY);
  const yMax = Math.max(...allY);
  const yRange = yMax - yMin || 1;
  const yPad = yRange * 0.12;

  const xScale = (v) => PAD.left + (v - xMin) / (xMax - xMin || 1) * plotW;
  const yScale = (v) => PAD.top + plotH - (v - (yMin - yPad)) / (yRange + 2 * yPad) * plotH;

  const linePath = vValues.map((v, i) => `${i === 0 ? "M" : "L"}${xScale(v).toFixed(1)},${yScale(vMeans[i]).toFixed(1)}`).join(" ");
  const ciUpperPath = vValues.map((v, i) => `${i === 0 ? "M" : "L"}${xScale(v).toFixed(1)},${yScale(vUppers[i]).toFixed(1)}`).join(" ");
  const ciPolygon = ciUpperPath + " " + [...vValues].reverse().map((v, i) => {
    const idx = vValues.length - 1 - i;
    return `L${xScale(vValues[idx]).toFixed(1)},${yScale(vLowers[idx]).toFixed(1)}`;
  }).join(" ") + " Z";

  const yTicks = Array.from({ length: 5 }, (_, i) => (yMin - yPad) + (i / 4) * (yRange + 2 * yPad));

  // Best feasible point: lowest mean among feasible points (or highest for served)
  const feasibleIndices = vValues.map((_, i) => i).filter(i => feasibility[i] === true);
  const isHigherBetter = metric.includes("served");
  const bestIdx = feasibleIndices.length
    ? feasibleIndices.reduce((best, i) =>
        isHigherBetter ? (vMeans[i] > vMeans[best] ? i : best) : (vMeans[i] < vMeans[best] ? i : best),
        feasibleIndices[0])
    : null;

  const hasGoals = goals.length > 0;
  const feasibleCount = feasibility.filter(f => f === true).length;

  return (
    <div style={{ background: C.bg, borderRadius: 6, border: `1px solid ${C.border}`, padding: 12, overflow: "hidden" }}>
      {hasGoals && (
        <div style={{ fontSize: 10, fontFamily: FONT, marginBottom: 6, display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ color: feasibleCount > 0 ? C.green : C.red }}>
            {feasibleCount}/{valid.length} points satisfy all goals
          </span>
          {matchingGoals.map((g, i) => (
            <span key={i} style={{ color: C.amber }}>
              — goal: {g.metric} {g.operator} {g.target}
            </span>
          ))}
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: C.muted }}>
            <svg width={10} height={10}><circle cx={5} cy={5} r={4} fill={C.green} /></svg> feasible
            <svg width={10} height={10} style={{ marginLeft: 4 }}><circle cx={5} cy={5} r={4} fill={C.muted} opacity={0.5} /></svg> infeasible
          </span>
        </div>
      )}
      <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" style={{ display: "block" }}>
        {yTicks.map((tick, i) => (
          <g key={i}>
            <line x1={PAD.left} y1={yScale(tick)} x2={W - PAD.right} y2={yScale(tick)} stroke={C.border} strokeWidth={1} />
            <text x={PAD.left - 6} y={yScale(tick) + 3} textAnchor="end" fill={C.muted} fontSize={9} fontFamily="monospace">
              {tick.toFixed(1)}
            </text>
          </g>
        ))}
        {/* Goal threshold lines */}
        {matchingGoals.map((g, gi) => {
          const ty = yScale(parseFloat(g.target));
          if (!Number.isFinite(ty)) return null;
          return (
            <g key={gi}>
              <line x1={PAD.left} y1={ty} x2={W - PAD.right} y2={ty}
                stroke={C.amber} strokeWidth={1.5} strokeDasharray="6,3" />
              <text x={W - PAD.right + 2} y={ty + 3} fill={C.amber} fontSize={8} fontFamily="monospace">
                {g.operator}{g.target}
              </text>
            </g>
          );
        })}
        <path d={ciPolygon} fill={`${C.accent}22`} />
        <path d={ciUpperPath} fill="none" stroke={`${C.accent}55`} strokeWidth={1} strokeDasharray="4,3" />
        <path d={vValues.map((v, i) => `${i === 0 ? "M" : "L"}${xScale(v).toFixed(1)},${yScale(vLowers[i]).toFixed(1)}`).join(" ")}
          fill="none" stroke={`${C.accent}55`} strokeWidth={1} strokeDasharray="4,3" />
        <path d={linePath} fill="none" stroke={C.accent} strokeWidth={2} />
        {/* Data points — coloured by feasibility */}
        {vValues.map((v, i) => {
          const f = feasibility[i];
          const isBest = i === bestIdx;
          const col = !hasGoals ? C.accent : f === true ? C.green : f === false ? C.red : C.muted;
          return (
            <g key={i}>
              <circle cx={xScale(v)} cy={yScale(vMeans[i])} r={isBest ? 5 : 3.5}
                fill={col} stroke={C.bg} strokeWidth={1.5} opacity={f === false ? 0.5 : 1} />
              {isBest && (
                <text x={xScale(v)} y={yScale(vMeans[i]) - 8} textAnchor="middle"
                  fill={C.green} fontSize={8} fontFamily="monospace" fontWeight="bold">best</text>
              )}
            </g>
          );
        })}
        <text x={W / 2} y={H - 2} textAnchor="middle" fill={C.muted} fontSize={9} fontFamily={FONT}>
          {paramLabel || "Parameter value"}
        </text>
        <text x={8} y={H / 2} textAnchor="middle" fill={C.muted} fontSize={9} fontFamily={FONT}
          transform={`rotate(-90, 8, ${H / 2})`}>
          {METRIC_LABELS[metric] || metric}
        </text>
      </svg>
      {bestIdx != null && (
        <div style={{ fontSize: 10, fontFamily: FONT, color: C.green, marginTop: 4 }}>
          Best feasible: {paramLabel || "param"} = <strong>{vValues[bestIdx]}</strong>,
          {" "}{METRIC_LABELS[metric] || metric} = <strong>{vMeans[bestIdx]?.toFixed(3)}</strong>
        </div>
      )}
    </div>
  );
}

export function WarmupChart({ series, truncationPoint, width = 320, height = 100 }) {
  if (!series || series.length < 2) return null;
  const W = width, H = height, PAD = { top: 8, right: 8, bottom: 18, left: 36 };
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;

  const values = series.map(p => p.value);
  const times = series.map(p => p.t);
  const yMin = Math.min(...values);
  const yMax = Math.max(...values);
  const yRange = yMax - yMin || 1;
  const yPad = yRange * 0.1;
  const xMin = times[0];
  const xMax = times[times.length - 1];

  const xScale = (t) => PAD.left + (t - xMin) / (xMax - xMin || 1) * plotW;
  const yScale = (v) => PAD.top + plotH - (v - (yMin - yPad)) / (yRange + 2 * yPad) * plotH;

  const linePath = series.map((p, i) =>
    `${i === 0 ? "M" : "L"}${xScale(p.t).toFixed(1)},${yScale(p.value).toFixed(1)}`
  ).join(" ");

  const kneeX = xScale(truncationPoint);

  const yTicks = Array.from({ length: 3 }, (_, i) =>
    (yMin - yPad) + (i / 2) * (yRange + 2 * yPad)
  );

  return (
    <div style={{ background: C.bg, borderRadius: 4, border: `1px solid ${C.border}`, padding: 6, overflow: "hidden" }}>
      <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" style={{ display: "block" }}>
        {yTicks.map((tick, i) => (
          <g key={i}>
            <line x1={PAD.left} y1={yScale(tick)} x2={W - PAD.right} y2={yScale(tick)} stroke={C.border} strokeWidth={1} />
            <text x={PAD.left - 4} y={yScale(tick) + 2} textAnchor="end" fill={C.muted} fontSize={8} fontFamily="monospace">
              {tick.toFixed(1)}
            </text>
          </g>
        ))}
        <path d={linePath} fill="none" stroke={C.accent} strokeWidth={1.5} />
        <line x1={kneeX} y1={PAD.top} x2={kneeX} y2={H - PAD.bottom} stroke={C.amber} strokeWidth={1} strokeDasharray="3,2" />
        <text x={kneeX + 3} y={PAD.top + 8} fill={C.amber} fontSize={8} fontFamily="monospace">
          knee t={Math.round(truncationPoint)}
        </text>
        <text x={W / 2} y={H - 2} textAnchor="middle" fill={C.muted} fontSize={8} fontFamily="monospace">
          Time
        </text>
      </svg>
    </div>
  );
}

export function CumulativeMeanChart({ points, warmupPeriod, width = 320, height = 100 }) {
  if (!points || points.length < 2) return null;
  const W = width, H = height, PAD = { top: 8, right: 8, bottom: 18, left: 36 };
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;

  const means = points.map(p => p.mean);
  const indices = points.map(p => p.index);
  const yMin = Math.min(...means);
  const yMax = Math.max(...means);
  const yRange = yMax - yMin || 1;
  const yPad = yRange * 0.1;
  const xMin = indices[0];
  const xMax = indices[indices.length - 1];

  const xScale = (i) => PAD.left + (i - xMin) / (xMax - xMin || 1) * plotW;
  const yScale = (v) => PAD.top + plotH - (v - (yMin - yPad)) / (yRange + 2 * yPad) * plotH;

  const linePath = points.map((p, i) =>
    `${i === 0 ? "M" : "L"}${xScale(p.index).toFixed(1)},${yScale(p.mean).toFixed(1)}`
  ).join(" ");

  const yTicks = Array.from({ length: 3 }, (_, i) =>
    (yMin - yPad) + (i / 2) * (yRange + 2 * yPad)
  );

  return (
    <div style={{ background: C.bg, borderRadius: 4, border: `1px solid ${C.border}`, padding: 6, overflow: "hidden" }}>
      <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" style={{ display: "block" }}>
        {yTicks.map((tick, i) => (
          <g key={i}>
            <line x1={PAD.left} y1={yScale(tick)} x2={W - PAD.right} y2={yScale(tick)} stroke={C.border} strokeWidth={1} />
            <text x={PAD.left - 4} y={yScale(tick) + 2} textAnchor="end" fill={C.muted} fontSize={8} fontFamily="monospace">
              {tick.toFixed(2)}
            </text>
          </g>
        ))}
        <path d={linePath} fill="none" stroke={C.green} strokeWidth={1.5} />
        <text x={W / 2} y={H - 2} textAnchor="middle" fill={C.muted} fontSize={8} fontFamily="monospace">
          Observations
        </text>
        <text x={PAD.left - 2} y={PAD.top + 4} textAnchor="end" fill={C.muted} fontSize={8} fontFamily="monospace" transform={`rotate(-90, ${PAD.left - 14}, ${H / 2})`}>
          Cum. mean
        </text>
      </svg>
    </div>
  );
}

export function Sweep2DGrid({ results, metric, paramLabelA, paramLabelB, onCellClick, goals = [] }) {
  if (!results?.length) return null;

  const valueAs = [...new Set(results.map(r => r.valueA))].sort((a, b) => a - b);
  const valueBs = [...new Set(results.map(r => r.valueB))].sort((a, b) => a - b);

  const getCell = (va, vb) => results.find(r => r.valueA === va && r.valueB === vb);

  const means = results.map(r => r.aggregateStats[metric]?.mean).filter(Number.isFinite);
  const minMean = Math.min(...means);
  const maxMean = Math.max(...means);
  const meanRange = maxMean - minMean || 1;

  const colorFor = (mean) => {
    if (!Number.isFinite(mean)) return "transparent";
    const t = (mean - minMean) / meanRange;
    if (t < 0.5) {
      const s = t * 2;
      return `rgb(${Math.round(6 + s * (240 - 6))}, ${Math.round(182 + s * (136 - 182))}, ${Math.round(212 + s * (62 - 212))})`;
    } else {
      const s = (t - 0.5) * 2;
      return `rgb(${Math.round(240 + s * (248 - 240))}, ${Math.round(136 + s * (81 - 136))}, ${Math.round(62 + s * (73 - 62))})`;
    }
  };

  const hasGoals = goals.length > 0;
  const feasibleCells = hasGoals
    ? results.filter(r => pointIsFeasible(goals, r.aggregateStats) === true)
    : [];
  const feasibleCount = feasibleCells.length;

  // Best feasible cell (lowest mean, or highest for served)
  const isHigherBetter = metric.includes("served");
  const bestCell = feasibleCells.length
    ? feasibleCells.reduce((best, r) => {
        const vm = r.aggregateStats[metric]?.mean;
        const bm = best.aggregateStats[metric]?.mean;
        return Number.isFinite(vm) && (isHigherBetter ? vm > bm : vm < bm) ? r : best;
      })
    : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {hasGoals && (
        <div style={{ fontSize: 10, fontFamily: FONT, display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ color: feasibleCount > 0 ? C.green : C.red }}>
            {feasibleCount}/{results.length} cells satisfy all goals
          </span>
          {bestCell && (
            <span style={{ color: C.green }}>
              Best feasible: {paramLabelA}={bestCell.valueA}, {paramLabelB}={bestCell.valueB},
              {" "}{METRIC_LABELS[metric] || metric}={fmt(bestCell.aggregateStats[metric]?.mean)}
            </span>
          )}
          <span style={{ color: C.muted }}>
            ✗ = infeasible (misses a goal)
          </span>
        </div>
      )}
      <div style={{ overflowX: "auto" }}>
        <table style={{ borderCollapse: "collapse", color: C.text, fontSize: 11, textAlign: "center" }}>
          <thead>
            <tr>
              <th style={{ padding: "6px 8px", color: C.muted, fontSize: 10 }}>{paramLabelA} \ {paramLabelB}</th>
              {valueBs.map(vb => (
                <th key={vb} style={{ padding: "6px 8px", color: C.muted, fontSize: 10 }}>{fmt(vb)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {valueAs.map(va => (
              <tr key={va}>
                <td style={{ padding: "6px 8px", color: C.amber, fontWeight: 700, fontSize: 10 }}>{fmt(va)}</td>
                {valueBs.map(vb => {
                  const cell = getCell(va, vb);
                  const mean = cell?.aggregateStats[metric]?.mean;
                  const feasible = hasGoals && cell ? pointIsFeasible(goals, cell.aggregateStats) : null;
                  const isBest = hasGoals && cell && cell === bestCell;
                  return (
                    <td key={vb}
                      onClick={() => onCellClick?.(cell)}
                      title={hasGoals && feasible === false ? "Infeasible — misses one or more goals" : undefined}
                      style={{
                        padding: "8px 10px",
                        background: colorFor(mean),
                        color: C.bg,
                        fontWeight: isBest ? 900 : 700,
                        minWidth: 60,
                        cursor: onCellClick ? "pointer" : "default",
                        border: isBest ? `2px solid ${C.green}` : "2px solid transparent",
                        opacity: feasible === false ? 0.35 : 1,
                        position: "relative",
                        transition: "border-color 0.15s",
                      }}
                      onMouseEnter={e => { if (onCellClick) e.currentTarget.style.borderColor = "#fff"; }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor = isBest ? C.green : "transparent"; }}>
                      {feasible === false ? (
                        <span style={{ display: "block", fontSize: 9, opacity: 0.7 }}>✗ {fmt(mean)}</span>
                      ) : fmt(mean)}
                      {isBest && <span style={{ display: "block", fontSize: 8, color: C.green }}>★ best</span>}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10, color: C.muted, fontFamily: FONT }}>
        <span>Low</span>
        <div style={{ width: 120, height: 10, background: "linear-gradient(to right, #06b6d4, #f0883e, #f85149)", borderRadius: 2 }} />
        <span>High</span>
        <span style={{ marginLeft: 8 }}>{METRIC_LABELS[metric] || metric}</span>
      </div>
    </div>
  );
}

// G15 — Live queue-depth time-plot chart
const QUEUE_COLORS = [C.accent, C.amber, C.green, C.purple, C.reneged, "#06b6d4", "#f472b6", "#a78bfa"];

export function QueueDepthTimePlot({ timeSeries, queues, width = 400, height = 140 }) {
  if (!timeSeries || timeSeries.length < 2) {
    return (
      <div style={{ fontSize: 11, color: C.muted, fontFamily: FONT, padding: 12, textAlign: "center", background: C.bg, borderRadius: 6, border: `1px solid ${C.border}` }}>
        No time-series data. Run with "Collect time-series" enabled.
      </div>
    );
  }

  const queueNames = (queues || []).map(q => q.name || q.id || "Queue").filter(Boolean);
  if (queueNames.length === 0) return null;

  const PAD = { top: 12, right: 12, bottom: 22, left: 40 };
  const plotW = width - PAD.left - PAD.right;
  const plotH = height - PAD.top - PAD.bottom;

  const tMin = timeSeries[0]?.t ?? 0;
  const tMax = timeSeries[timeSeries.length - 1]?.t ?? 1;
  const tRange = tMax - tMin || 1;

  const maxDepth = Math.max(1, ...timeSeries.flatMap(entry =>
    queueNames.map(qName => entry?.byQueue?.[qName]?.waiting ?? entry?.byType?.[qName]?.waiting ?? 0).filter(Number.isFinite)
  ));

  const xScale = (t) => PAD.left + (t - tMin) / tRange * plotW;
  const yScale = (v) => PAD.top + plotH - (v / maxDepth) * plotH;

  const yTicks = Array.from({ length: 4 }, (_, i) => Math.round((i / 3) * maxDepth));

  return (
    <div style={{ background: C.bg, borderRadius: 6, border: `1px solid ${C.border}`, padding: 10, overflow: "hidden" }}>
      <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet" style={{ display: "block" }}>
        {yTicks.map((tick, i) => (
          <g key={i}>
            <line x1={PAD.left} y1={yScale(tick)} x2={width - PAD.right} y2={yScale(tick)} stroke={C.border} strokeWidth={1} />
            <text x={PAD.left - 4} y={yScale(tick) + 3} textAnchor="end" fill={C.muted} fontSize={8} fontFamily="monospace">
              {tick}
            </text>
          </g>
        ))}
        {queueNames.map((qName, qi) => {
          const color = QUEUE_COLORS[qi % QUEUE_COLORS.length];
          const points = timeSeries.map(entry => ({
            t: entry?.t ?? 0,
            v: entry?.byQueue?.[qName]?.waiting ?? entry?.byType?.[qName]?.waiting ?? 0,
          })).filter(p => Number.isFinite(p.v));
          if (points.length < 2) return null;
          const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"}${xScale(p.t).toFixed(1)},${yScale(p.v).toFixed(1)}`).join(" ");
          return (
            <g key={qName}>
              <path d={linePath} fill="none" stroke={color} strokeWidth={1.5} />
            </g>
          );
        })}
        <text x={width / 2} y={height - 2} textAnchor="middle" fill={C.muted} fontSize={8} fontFamily="monospace">
          Simulation time
        </text>
        <text x={PAD.left - 2} y={PAD.top + 4} textAnchor="end" fill={C.muted} fontSize={8} fontFamily="monospace" transform={`rotate(-90, ${PAD.left - 14}, ${height / 2})`}>
          Queue depth
        </text>
      </svg>
      <div style={{ display: "flex", gap: 12, marginTop: 4, flexWrap: "wrap" }}>
        {queueNames.map((qName, qi) => (
          <span key={qName} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 9, color: C.muted, fontFamily: FONT }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: QUEUE_COLORS[qi % QUEUE_COLORS.length], display: "inline-block" }} />
            {qName}
          </span>
        ))}
      </div>
    </div>
  );
}
