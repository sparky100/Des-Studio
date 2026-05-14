// ui/execute/SweepViews.jsx — SweepChart, WarmupChart, Sweep2DGrid

import { C, FONT } from "../shared/tokens.js";
import { Btn } from "../shared/components.jsx";
import { fmt, METRIC_LABELS } from "./executeHelpers.js";

export function SweepChart({ results, metric, paramLabel }) {
  if (!results?.length) return null;

  const values = results.map(r => r.value);
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

  const W = 400, H = 160, PAD = { top: 16, right: 16, bottom: 28, left: 50 };
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;

  const valid = results.filter((_, i) => means[i] != null);
  const vValues = valid.map(r => r.value);
  const vMeans = valid.map(r => r.aggregateStats[statPath].mean);
  const vLowers = valid.map(r => r.aggregateStats[statPath]?.lower ?? r.aggregateStats[statPath].mean);
  const vUppers = valid.map(r => r.aggregateStats[statPath]?.upper ?? r.aggregateStats[statPath].mean);

  const xMin = Math.min(...vValues);
  const xMax = Math.max(...vValues);
  const yMin = Math.min(...vLowers);
  const yMax = Math.max(...vUppers);
  const yRange = yMax - yMin || 1;
  const yPad = yRange * 0.1;

  const xScale = (v) => PAD.left + (v - xMin) / (xMax - xMin || 1) * plotW;
  const yScale = (v) => PAD.top + plotH - (v - (yMin - yPad)) / (yRange + 2 * yPad) * plotH;

  const linePath = vValues.map((v, i) => `${i === 0 ? "M" : "L"}${xScale(v).toFixed(1)},${yScale(vMeans[i]).toFixed(1)}`).join(" ");
  const ciUpperPath = vValues.map((v, i) => `${i === 0 ? "M" : "L"}${xScale(v).toFixed(1)},${yScale(vUppers[i]).toFixed(1)}`).join(" ");
  const ciLowerPath = vValues.map((v, i) => `${i === 0 ? "L" : "L"}${xScale(v).toFixed(1)},${yScale(vLowers[i]).toFixed(1)}`).join(" ");
  const ciPolygon = ciUpperPath + " " + [...vValues].reverse().map((v, i) => {
    const idx = vValues.length - 1 - i;
    return `L${xScale(vValues[idx]).toFixed(1)},${yScale(vLowers[idx]).toFixed(1)}`;
  }).join(" ") + " Z";

  const yTicks = Array.from({ length: 5 }, (_, i) => {
    const frac = i / 4;
    return (yMin - yPad) + frac * (yRange + 2 * yPad);
  });

  return (
    <div style={{ background: C.bg, borderRadius: 6, border: `1px solid ${C.border}`, padding: 12, overflow: "hidden" }}>
      <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" style={{ display: "block" }}>
        {yTicks.map((tick, i) => (
          <g key={i}>
            <line x1={PAD.left} y1={yScale(tick)} x2={W - PAD.right} y2={yScale(tick)}
              stroke={C.border} strokeWidth={1} />
            <text x={PAD.left - 6} y={yScale(tick) + 3} textAnchor="end" fill={C.label} fontSize={9} fontFamily="monospace">
              {tick.toFixed(1)}
            </text>
          </g>
        ))}
        <path d={ciPolygon} fill={`${C.accent}22`} />
        <path d={ciUpperPath} fill="none" stroke={`${C.accent}66`} strokeWidth={1} strokeDasharray="4,3" />
        <path d={[...vValues].reverse().map((v, i) => {
          const idx = vValues.length - 1 - i;
          return `${i === 0 ? "M" : "L"}${xScale(vValues[idx]).toFixed(1)},${yScale(vLowers[idx]).toFixed(1)}`;
        }).join(" ")} fill="none" stroke={`${C.accent}66`} strokeWidth={1} strokeDasharray="4,3" />
        <path d={linePath} fill="none" stroke={C.accent} strokeWidth={2} />
        {vValues.map((v, i) => (
          <circle key={i} cx={xScale(v)} cy={yScale(vMeans[i])} r={3} fill={C.accent} stroke={C.bg} strokeWidth={1} />
        ))}
        <text x={W / 2} y={H - 2} textAnchor="middle" fill={C.label} fontSize={9} fontFamily={FONT}>
          {paramLabel || "Parameter value"}
        </text>
        <text x={8} y={H / 2} textAnchor="middle" fill={C.label} fontSize={9} fontFamily={FONT}
          transform={`rotate(-90, 8, ${H / 2})`}>
          {METRIC_LABELS[metric] || metric}
        </text>
      </svg>
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

export function Sweep2DGrid({ results, metric, paramLabelA, paramLabelB, onCellClick }) {
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

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
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
                  return (
                    <td key={vb}
                      onClick={() => onCellClick?.(cell)}
                      style={{
                        padding: "8px 10px",
                        background: colorFor(mean),
                        color: C.bg,
                        fontWeight: 700,
                        minWidth: 60,
                        cursor: onCellClick ? "pointer" : "default",
                        border: "2px solid transparent",
                        transition: "border-color 0.15s",
                      }}
                      onMouseEnter={e => { if (onCellClick) e.currentTarget.style.borderColor = "#fff"; }}
                      onMouseLeave={e => { if (onCellClick) e.currentTarget.style.borderColor = "transparent"; }}>
                      {fmt(mean)}
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
