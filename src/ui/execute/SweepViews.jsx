// ui/execute/SweepViews.jsx — SweepChart, WarmupChart, Sweep2DGrid, QueueHistogram, EntitySummaryTable

import { useMemo, useState } from "react";
import { C, FONT, alpha, lerpColor } from "../shared/tokens.js";
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
  const [tip, setTip] = useState(null);
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
      <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" style={{ display: "block" }}
        onMouseLeave={() => setTip(null)}>
        {yTicks.map((tick, i) => (
          <g key={i}>
            <line x1={PAD.left} y1={yScale(tick)} x2={W - PAD.right} y2={yScale(tick)} stroke={C.chartGrid} strokeWidth={1} />
            <text x={PAD.left - 6} y={yScale(tick) + 4} textAnchor="end" fill={C.muted} fontSize={11} fontFamily="monospace">
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
              <text x={W - PAD.right + 2} y={ty + 3} fill={C.amber} fontSize={9} fontFamily="monospace">
                {g.operator}{g.target}
              </text>
            </g>
          );
        })}
        <path d={ciPolygon} fill={alpha(C.accent, 0.12)} />
        <path d={ciUpperPath} fill="none" stroke={alpha(C.accent, 0.35)} strokeWidth={1} strokeDasharray="4,3" />
        <path d={vValues.map((v, i) => `${i === 0 ? "M" : "L"}${xScale(v).toFixed(1)},${yScale(vLowers[i]).toFixed(1)}`).join(" ")}
          fill="none" stroke={alpha(C.accent, 0.35)} strokeWidth={1} strokeDasharray="4,3" />
        <path d={linePath} fill="none" stroke={C.accent} strokeWidth={2.5} />
        {/* Data points — coloured by feasibility */}
        {vValues.map((v, i) => {
          const f = feasibility[i];
          const isBest = i === bestIdx;
          const col = !hasGoals ? C.accent : f === true ? C.green : f === false ? C.red : C.muted;
          const cx = xScale(v), cy = yScale(vMeans[i]);
          return (
            <g key={i}
              onMouseEnter={() => setTip({ x: cx, y: cy, label: `${paramLabel || "x"} = ${v}`, value: `${(METRIC_LABELS[metric] || metric).slice(0,14)}: ${vMeans[i]?.toFixed(2)}` })}
              style={{ cursor: "crosshair" }}>
              <circle cx={cx} cy={cy} r={isBest ? 5 : 3}
                fill={col} stroke={C.bg} strokeWidth={1.5} opacity={f === false ? 0.5 : 1} />
              {isBest && (
                <text x={cx} y={cy - 9} textAnchor="middle"
                  fill={C.green} fontSize={9} fontFamily="monospace" fontWeight="bold">best</text>
              )}
            </g>
          );
        })}
        <text x={W / 2} y={H - 2} textAnchor="middle" fill={C.muted} fontSize={11} fontFamily={FONT}>
          {paramLabel || "Parameter value"}
        </text>
        <text x={8} y={H / 2} textAnchor="middle" fill={C.muted} fontSize={11} fontFamily={FONT}
          transform={`rotate(-90, 8, ${H / 2})`}>
          {METRIC_LABELS[metric] || metric}
        </text>
        {tip && (() => {
          const TW = 140, TH = 36, TX = Math.min(Math.max(tip.x - TW/2, PAD.left), W - PAD.right - TW), TY = Math.max(tip.y - TH - 8, PAD.top);
          return (
            <g style={{ pointerEvents: "none" }}>
              <rect x={TX} y={TY} width={TW} height={TH} rx={4} fill={C.panel} stroke={C.accent} strokeWidth={1} opacity={0.97} />
              <text x={TX + TW/2} y={TY + 13} textAnchor="middle" fill={C.muted} fontSize={9} fontFamily={FONT}>{tip.label}</text>
              <text x={TX + TW/2} y={TY + 27} textAnchor="middle" fill={C.text} fontSize={10} fontFamily={FONT} fontWeight={700}>{tip.value}</text>
            </g>
          );
        })()}
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
    <div style={{ background: C.bg, borderRadius: 4, border: `1px solid ${C.border}`, padding: 12, overflow: "hidden" }}>
      <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" style={{ display: "block" }}>
        {yTicks.map((tick, i) => (
          <g key={i}>
            <line x1={PAD.left} y1={yScale(tick)} x2={W - PAD.right} y2={yScale(tick)} stroke={C.chartGrid} strokeWidth={1} />
            <text x={PAD.left - 4} y={yScale(tick) + 4} textAnchor="end" fill={C.muted} fontSize={11} fontFamily="monospace">
              {tick.toFixed(1)}
            </text>
          </g>
        ))}
        <path d={linePath} fill="none" stroke={C.accent} strokeWidth={2.5} />
        {series.filter((_, i) => i % Math.max(1, Math.floor(series.length / 20)) === 0).map((p, i) => (
          <circle key={i} cx={xScale(p.t)} cy={yScale(p.value)} r={2.5} fill={C.accent} stroke={C.bg} strokeWidth={1} />
        ))}
        <line x1={kneeX} y1={PAD.top} x2={kneeX} y2={H - PAD.bottom} stroke={C.amber} strokeWidth={1.5} strokeDasharray="4,3" />
        <text x={kneeX + 4} y={PAD.top + 12} fill={C.amber} fontSize={10} fontFamily="monospace">
          knee t={Math.round(truncationPoint)}
        </text>
        <text x={W / 2} y={H - 2} textAnchor="middle" fill={C.muted} fontSize={11} fontFamily="monospace">
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
    <div style={{ background: C.bg, borderRadius: 4, border: `1px solid ${C.border}`, padding: 12, overflow: "hidden" }}>
      <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" style={{ display: "block" }}>
        {yTicks.map((tick, i) => (
          <g key={i}>
            <line x1={PAD.left} y1={yScale(tick)} x2={W - PAD.right} y2={yScale(tick)} stroke={C.chartGrid} strokeWidth={1} />
            <text x={PAD.left - 4} y={yScale(tick) + 4} textAnchor="end" fill={C.muted} fontSize={11} fontFamily="monospace">
              {tick.toFixed(2)}
            </text>
          </g>
        ))}
        <path d={linePath} fill="none" stroke={C.accent} strokeWidth={2.5} />
        {points.filter((_, i) => i % Math.max(1, Math.floor(points.length / 20)) === 0).map((p, i) => (
          <circle key={i} cx={xScale(p.index)} cy={yScale(p.mean)} r={2.5} fill={C.accent} stroke={C.bg} strokeWidth={1} />
        ))}
        <text x={W / 2} y={H - 2} textAnchor="middle" fill={C.muted} fontSize={11} fontFamily="monospace">
          Observations
        </text>
        <text x={PAD.left - 2} y={PAD.top + 4} textAnchor="end" fill={C.muted} fontSize={11} fontFamily="monospace" transform={`rotate(-90, ${PAD.left - 14}, ${H / 2})`}>
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
    return t < 0.5
      ? lerpColor(C.accent, C.amber, t * 2)
      : lerpColor(C.amber, C.red, (t - 0.5) * 2);
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
              <th scope="col" style={{ padding: "6px 8px", color: C.muted, fontSize: 11 }}>{paramLabelA} \ {paramLabelB}</th>
              {valueBs.map(vb => (
                <th key={vb} scope="col" style={{ padding: "6px 8px", color: C.muted, fontSize: 11 }}>{fmt(vb)}</th>
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
                      onMouseEnter={e => { if (onCellClick) e.currentTarget.style.borderColor = C.text; }}
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
        <div style={{ width: 120, height: 10, background: `linear-gradient(to right, ${C.accent}, ${C.amber}, ${C.red})`, borderRadius: 2 }} />
        <span>High</span>
        <span style={{ marginLeft: 8 }}>{METRIC_LABELS[metric] || metric}</span>
      </div>
    </div>
  );
}

// G15 — Live queue-depth time-plot chart
const QUEUE_COLORS = [C.accent, C.amber, C.green, C.purple, C.reneged, C.kpiArr, C.pink, C.server];

export function QueueDepthTimePlot({ timeSeries, queues, timeUnit, width = 400, height = 140 }) {
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
    <div style={{ background: C.bg, borderRadius: 6, border: `1px solid ${C.border}`, padding: 12, overflow: "hidden" }}>
      <div style={{ fontSize: 10, color: C.muted, fontFamily: FONT, letterSpacing: 1.2, fontWeight: 700, marginBottom: 6 }}>
        QUEUE DEPTH OVER TIME
      </div>
      <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet" style={{ display: "block" }}>
        {yTicks.map((tick, i) => (
          <g key={i}>
            <line x1={PAD.left} y1={yScale(tick)} x2={width - PAD.right} y2={yScale(tick)} stroke={C.chartGrid} strokeWidth={1} />
            <text x={PAD.left - 4} y={yScale(tick) + 4} textAnchor="end" fill={C.muted} fontSize={11} fontFamily="monospace">
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
              <path d={linePath} fill="none" stroke={color} strokeWidth={2.5} />
            </g>
          );
        })}
        <text x={width / 2} y={height - 2} textAnchor="middle" fill={C.muted} fontSize={11} fontFamily="monospace">
          {timeUnit ? `Time (${timeUnit})` : "Simulation time"}
        </text>
        <text x={PAD.left - 2} y={PAD.top + 4} textAnchor="end" fill={C.muted} fontSize={11} fontFamily="monospace" transform={`rotate(-90, ${PAD.left - 14}, ${height / 2})`}>
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

// ── QueueHistogram — per-queue wait time distribution bar chart ───────────────
export function QueueHistogram({ waitDist }) {
  if (!waitDist || !Object.keys(waitDist).length) return null;
  const queues = Object.entries(waitDist).filter(([, d]) => d && d.n > 0);
  if (!queues.length) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ fontSize: 10, color: C.muted, fontFamily: FONT, letterSpacing: 1.2, fontWeight: 700 }}>
        WAIT TIME DISTRIBUTIONS (per queue)
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
        {queues.map(([qName, d]) => (
          <QueueHistogramCard key={qName} name={qName} dist={d} />
        ))}
      </div>
    </div>
  );
}

function QueueHistogramCard({ name, dist }) {
  const [tip, setTip] = useState(null);
  const values = Array.isArray(dist.values) && dist.values.length > 0 ? dist.values : null;
  const W = 280, H = 140, PAD = { top: 10, right: 10, bottom: 24, left: 34 };
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;

  // Build histogram bins from raw values or approximate from percentiles
  let bins = [];
  if (values && values.length >= 3) {
    const minV = Math.min(...values);
    const maxV = Math.max(...values);
    const range = maxV - minV || 1;
    const N = Math.min(10, Math.ceil(Math.sqrt(values.length)));
    const binSize = range / N;
    const counts = Array(N).fill(0);
    values.forEach(v => {
      const idx = Math.min(Math.floor((v - minV) / binSize), N - 1);
      counts[idx]++;
    });
    bins = counts.map((count, i) => ({
      x: minV + i * binSize,
      xEnd: minV + (i + 1) * binSize,
      count,
    }));
  } else {
    // Approximate from percentiles: p0≈0, p50, p90, p95, p99
    const pts = [
      { x: 0, cumP: 0 },
      { x: dist.p50 ?? dist.mean * 0.8, cumP: 0.5 },
      { x: dist.p90 ?? dist.mean * 1.5, cumP: 0.9 },
      { x: dist.p95 ?? dist.mean * 1.8, cumP: 0.95 },
      { x: dist.p99 ?? dist.mean * 2.5, cumP: 0.99 },
    ].filter(p => p.x != null && Number.isFinite(p.x));
    for (let i = 1; i < pts.length; i++) {
      bins.push({ x: pts[i - 1].x, xEnd: pts[i].x, count: (pts[i].cumP - pts[i - 1].cumP) * (dist.n || 1) });
    }
  }

  if (!bins.length) return null;
  const maxCount = Math.max(...bins.map(b => b.count), 1);
  const xMin = bins[0].x;
  const xMax = bins[bins.length - 1].xEnd;
  const xScale = v => PAD.left + (v - xMin) / (xMax - xMin || 1) * plotW;
  const yScale = count => PAD.top + plotH - (count / maxCount) * plotH;

  // Percentile markers
  const pMarkers = [
    dist.p50 != null && { label: "p50", x: dist.p50, color: C.green },
    dist.p90 != null && { label: "p90", x: dist.p90, color: C.amber },
    dist.p99 != null && { label: "p99", x: dist.p99, color: C.red },
  ].filter(Boolean);

  return (
    <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 6, padding: 12 }}>
      <div style={{ fontSize: 10, color: C.accent, fontFamily: FONT, fontWeight: 700, marginBottom: 4 }}>{name}</div>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: "block", width: "100%", overflow: "visible" }}
        onMouseLeave={() => setTip(null)}>
        {/* Grid lines */}
        {Array.from({ length: 3 }, (_, i) => PAD.top + (plotH / 2) * i).map((y, i) => (
          <line key={i} x1={PAD.left} y1={y} x2={W - PAD.right} y2={y} stroke={C.chartGrid} strokeWidth={1} />
        ))}
        {/* Bars */}
        {bins.map((b, i) => {
          const bx = xScale(b.x);
          const bw = Math.max(2, xScale(b.xEnd) - bx - 1);
          const by = yScale(b.count);
          const bh = Math.max(1, plotH - (by - PAD.top));
          return (
            <rect key={i} x={bx} y={by} width={bw} height={bh}
              rx={4} ry={4}
              fill={alpha(C.accent, 0.85)} stroke={C.accent} strokeWidth={0.5}
              style={{ cursor: "crosshair" }}
              onMouseEnter={() => setTip({ x: bx + bw / 2, y: by, label: `${b.x.toFixed(1)} – ${b.xEnd.toFixed(1)}`, value: `count: ${b.count}` })}
            />
          );
        })}
        {/* Percentile lines */}
        {pMarkers.map(m => {
          const mx = xScale(m.x);
          if (mx < PAD.left || mx > W - PAD.right) return null;
          return (
            <g key={m.label}>
              <line x1={mx} y1={PAD.top} x2={mx} y2={PAD.top + plotH} stroke={m.color} strokeWidth={1.5} strokeDasharray="4,3" />
              <text x={mx + 2} y={PAD.top + 10} fill={m.color} fontSize={9} fontFamily="monospace">{m.label}</text>
            </g>
          );
        })}
        {/* X axis ticks */}
        {[xMin, (xMin + xMax) / 2, xMax].map((v, i) => (
          <text key={i} x={xScale(v)} y={H - 4} textAnchor="middle" fill={C.muted} fontSize={10} fontFamily="monospace">
            {v.toFixed(1)}
          </text>
        ))}
        {/* Y axis label */}
        <text x={8} y={H / 2} textAnchor="middle" fill={C.muted} fontSize={10} fontFamily="monospace"
          transform={`rotate(-90, 8, ${H / 2})`}>count</text>
        {tip && (() => {
          const TW = 110, TH = 36, TX = Math.min(Math.max(tip.x - TW/2, PAD.left), W - PAD.right - TW), TY = Math.max(tip.y - TH - 6, PAD.top);
          return (
            <g style={{ pointerEvents: "none" }}>
              <rect x={TX} y={TY} width={TW} height={TH} rx={4} fill={C.panel} stroke={C.accent} strokeWidth={1} opacity={0.97} />
              <text x={TX + TW/2} y={TY + 13} textAnchor="middle" fill={C.muted} fontSize={9} fontFamily={FONT}>{tip.label}</text>
              <text x={TX + TW/2} y={TY + 27} textAnchor="middle" fill={C.text} fontSize={10} fontFamily={FONT} fontWeight={700}>{tip.value}</text>
            </g>
          );
        })()}
      </svg>
      <div style={{ fontSize: 9, color: C.muted, fontFamily: FONT, marginTop: 3, display: "flex", gap: 8, flexWrap: "wrap" }}>
        <span>n={dist.n}</span>
        <span>mean={fmt(dist.mean, 1)}</span>
        {dist.p90 != null && <span style={{ color: C.amber }}>p90={fmt(dist.p90, 1)}</span>}
        {dist.p99 != null && <span style={{ color: C.red }}>p99={fmt(dist.p99, 1)}</span>}
      </div>
    </div>
  );
}

// ── EntitySummaryTable — per-entity lifecycle table ───────────────────────────
const OUTCOME_COLOR = { done: C.green, served: C.green, reneged: C.red, waiting: C.amber, active: C.cEvent };
const fmtT = v => v != null && Number.isFinite(v) ? v.toFixed(2) : "—";

export function EntitySummaryTable({ entitySummary, meanWait }) {
  const [sortKey, setSortKey] = useState("arrivalTime");
  const [sortAsc, setSortAsc] = useState(true);
  const [typeFilter, setTypeFilter] = useState("all");
  const [outcomeFilter, setOutcomeFilter] = useState("all");

  const customers = useMemo(
    () => (entitySummary || []).filter(e => e.role !== "server"),
    [entitySummary]
  );

  const entityTypes = useMemo(() => [...new Set(customers.map(e => e.type).filter(Boolean))], [customers]);
  const outcomes = useMemo(() => [...new Set(customers.map(e => e.status).filter(Boolean))], [customers]);

  const computeWait = e => {
    if (e.stages?.length) return e.stages.reduce((s, st) => s + ((st.serviceStartedAt ?? st.serviceStart ?? 0) - (st.waitStartedAt ?? st.arrivalTime ?? 0)), 0);
    if (e.serviceStart != null && e.arrivalTime != null) return Math.max(0, e.serviceStart - e.arrivalTime);
    return null;
  };

  const computeSvc = e => {
    if (e.stages?.length) return e.stages.reduce((s, st) => s + ((st.serviceEndedAt ?? st.completionTime ?? 0) - (st.serviceStartedAt ?? st.serviceStart ?? 0)), 0);
    if (e.serviceStart != null && e.completionTime != null) return Math.max(0, e.completionTime - e.serviceStart);
    return null;
  };

  const computeSojourn = e => {
    const end = e.completionTime ?? e.renegeTime;
    if (end != null && e.arrivalTime != null) return Math.max(0, end - e.arrivalTime);
    return null;
  };

  const rows = useMemo(() => customers.map(e => ({
    ...e,
    _wait: computeWait(e),
    _svc: computeSvc(e),
    _sojourn: computeSojourn(e),
  })), [customers]);

  const attrColumns = useMemo(() => (
    [...new Set(rows.flatMap(row => Object.keys(row.attrs || {})))].sort((a, b) => a.localeCompare(b))
  ), [rows]);

  const filtered = useMemo(() => rows.filter(r => {
    if (typeFilter !== "all" && r.type !== typeFilter) return false;
    if (outcomeFilter !== "all" && r.status !== outcomeFilter) return false;
    return true;
  }), [rows, typeFilter, outcomeFilter]);

  const sorted = useMemo(() => {
    const key = sortKey;
    return [...filtered].sort((a, b) => {
      const av = key.startsWith("attr:") ? a.attrs?.[key.slice(5)] : key.startsWith("_") ? a[key] : (a[key] ?? 0);
      const bv = key.startsWith("attr:") ? b.attrs?.[key.slice(5)] : key.startsWith("_") ? b[key] : (b[key] ?? 0);
      if (av == null && bv == null) return 0;
      if (av == null) return sortAsc ? 1 : -1;
      if (bv == null) return sortAsc ? -1 : 1;
      return sortAsc ? (av < bv ? -1 : av > bv ? 1 : 0) : (av > bv ? -1 : av < bv ? 1 : 0);
    });
  }, [filtered, sortKey, sortAsc]);

  const setSort = col => {
    if (sortKey === col) setSortAsc(a => !a);
    else { setSortKey(col); setSortAsc(true); }
  };

  const thStyle = (col) => ({
    padding: "6px 8px", cursor: "pointer", userSelect: "none",
    color: sortKey === col ? C.accent : C.muted,
    fontWeight: sortKey === col ? 700 : 400, fontSize: 10, whiteSpace: "nowrap",
    background: "transparent", border: "none", textAlign: "left", fontFamily: FONT,
  });

  const formatAttrValue = value => {
    if (value == null || value === "") return "—";
    if (typeof value === "boolean") return value ? "True" : "False";
    if (typeof value === "number") return Number.isFinite(value) ? value.toString() : "—";
    return String(value);
  };

  if (!customers.length) return (
    <div style={{ fontSize: 11, color: C.muted, fontFamily: FONT, padding: 12, fontStyle: "italic" }}>
      Entity summary not available for this run type. Run a single simulation (not batch) to see per-entity detail.
    </div>
  );

  const anomalies = meanWait != null && meanWait > 0
    ? sorted.filter(r => r._wait != null && r._wait > meanWait * 3)
    : [];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {anomalies.length > 0 && (
        <div style={{ background: C.amber + "12", border: `1px solid ${C.amber}44`, borderRadius: 5,
          padding: "8px 12px", fontSize: 11, fontFamily: FONT, color: C.amber }}>
          ⚠ {anomalies.length} {anomalies.length === 1 ? "entity" : "entities"} waited more than 3× the mean wait ({fmtT(meanWait)} units).
          {" "}Longest: {fmtT(Math.max(...anomalies.map(r => r._wait)))} units.
        </div>
      )}

      {/* Filters */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
          style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 4, color: C.text, fontFamily: FONT, fontSize: 11, padding: "3px 7px", outline: "none" }}>
          <option value="all">All types</option>
          {entityTypes.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <select value={outcomeFilter} onChange={e => setOutcomeFilter(e.target.value)}
          style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 4, color: C.text, fontFamily: FONT, fontSize: 11, padding: "3px 7px", outline: "none" }}>
          <option value="all">All outcomes</option>
          {outcomes.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
        <span style={{ fontSize: 10, color: C.muted, fontFamily: FONT }}>
          {filtered.length} / {customers.length} entities
        </span>
      </div>

      <div style={{ overflowX: "auto", overflowY: "auto", maxHeight: 380 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, fontFamily: FONT }}>
          <thead style={{ position: "sticky", top: 0, background: C.surface, zIndex: 1 }}>
            <tr>
              {[
                ["id", "ID"], ["type", "Type"], ["status", "Outcome"],
                ["arrivalTime", "Arrived"], ["_wait", "Wait"], ["_svc", "Service"],
                ["_sojourn", "Sojourn"],
              ].map(([col, label]) => (
                <th key={col} scope="col">
                  <button style={thStyle(col)} onClick={() => setSort(col)}>
                    {label} {sortKey === col ? (sortAsc ? "▲" : "▼") : ""}
                  </button>
                </th>
              ))}
              {attrColumns.map(attrName => {
                const col = `attr:${attrName}`;
                return (
                  <th key={col} scope="col">
                    <button style={thStyle(col)} onClick={() => setSort(col)}>
                      {attrName} {sortKey === col ? (sortAsc ? "▲" : "▼") : ""}
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {sorted.map((e, i) => {
              const isAnomaly = meanWait != null && e._wait != null && e._wait > meanWait * 3;
              const outcomeColor = OUTCOME_COLOR[e.status] || C.muted;
              return (
                <tr key={e.id || i} style={{
                  borderBottom: `1px solid ${C.border}22`,
                  background: isAnomaly ? C.amber + "08" : i % 2 === 0 ? C.surface + "44" : "transparent",
                }}>
                  <td style={{ padding: "4px 8px", color: C.muted, whiteSpace: "nowrap" }}>{e.id}</td>
                  <td style={{ padding: "4px 8px", color: C.cEvent }}>{e.type}</td>
                  <td style={{ padding: "4px 8px" }}>
                    <span style={{ color: outcomeColor, fontWeight: 700 }}>{e.status}</span>
                    {isAnomaly && <span style={{ color: C.amber, marginLeft: 4 }}>⚠</span>}
                  </td>
                  <td style={{ padding: "4px 8px", color: C.muted }}>{fmtT(e.arrivalTime)}</td>
                  <td style={{ padding: "4px 8px", color: e._wait != null && meanWait != null && e._wait > meanWait * 2 ? C.amber : C.text }}>
                    {fmtT(e._wait)}
                  </td>
                  <td style={{ padding: "4px 8px" }}>{fmtT(e._svc)}</td>
                  <td style={{ padding: "4px 8px" }}>{fmtT(e._sojourn)}</td>
                  {attrColumns.map(attrName => (
                    <td key={attrName} style={{ padding: "4px 8px", color: C.muted, fontSize: 10, whiteSpace: "nowrap" }}>
                      {formatAttrValue(e.attrs?.[attrName])}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
