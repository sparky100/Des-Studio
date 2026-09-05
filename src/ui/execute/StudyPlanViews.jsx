// ui/execute/StudyPlanViews.jsx — Sampled-study UI: multi-parameter range
// picker, results table, and sensitivity ranking panel. Split out from
// SweepViews.jsx (which stays focused on the 1D/2D chart components) since
// a sampled study's N-parameter shape doesn't fit those chart types.

import { useState } from "react";
import { alpha, RADIUS } from "../shared/tokens.js";
import { Btn } from "../shared/components.jsx";
import { ParamBrowserPanel, paramColor } from "../shared/ParamBrowserPanel.jsx";
import { fmtMetric, METRIC_LABELS } from "./executeHelpers.js";
import { useTheme } from "../shared/ThemeContext.jsx";

// Mirrors OverrideChipList.jsx's chip-list-plus-picker pattern, but each
// chip carries a min/max range (for Latin hypercube sampling) instead of a
// single override value.
export function SampledParamRangeList({ sampledParams, setSampledParams, sweepParams, pickerOpen, setPickerOpen }) {
  const { C, FONT } = useTheme();
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: 10, color: C.label, fontFamily: FONT, letterSpacing: 1.2, fontWeight: 700 }}>PARAMETERS</span>
        <Btn small variant="ghost" onClick={() => setPickerOpen(o => !o)}>{pickerOpen ? "Done" : "+ Add parameter"}</Btn>
      </div>
      {sampledParams.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {sampledParams.map((p, idx) => {
            const chipColor = paramColor(p.type, C);
            return (
              <div key={p.path} style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                <div style={{ flex: 2, minWidth: 140, display: "flex", flexDirection: "column", gap: 1, background: alpha(chipColor, 0.09), border: `1px solid ${alpha(chipColor, 0.27)}`, borderRadius: RADIUS.sm, padding: "3px 8px" }}>
                  <span style={{ fontSize: 11, color: chipColor, fontFamily: FONT, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.label}</span>
                  {p.subLabel && <span style={{ fontSize: 10, color: C.muted, fontFamily: FONT }}>{p.subLabel}</span>}
                </div>
                <input aria-label={`${p.label} minimum`} type="number" value={p.min}
                  onChange={e => setSampledParams(prev => prev.map((sp, i) => i === idx ? { ...sp, min: parseFloat(e.target.value) || 0 } : sp))}
                  placeholder="min"
                  style={{ width: 76, background: "transparent", border: `1px solid ${C.border}`, borderRadius: RADIUS.sm, color: C.amber, fontFamily: FONT, fontSize: 11, padding: "4px 6px" }} />
                <input aria-label={`${p.label} maximum`} type="number" value={p.max}
                  onChange={e => setSampledParams(prev => prev.map((sp, i) => i === idx ? { ...sp, max: parseFloat(e.target.value) || 0 } : sp))}
                  placeholder="max"
                  style={{ width: 76, background: "transparent", border: `1px solid ${C.border}`, borderRadius: RADIUS.sm, color: C.amber, fontFamily: FONT, fontSize: 11, padding: "4px 6px" }} />
                <Btn small variant="ghost" ariaLabel={`Remove ${p.label}`} onClick={() => setSampledParams(prev => prev.filter((_, i) => i !== idx))}>×</Btn>
              </div>
            );
          })}
        </div>
      )}
      {pickerOpen && (
        <ParamBrowserPanel params={sweepParams} alreadyAdded={new Set(sampledParams.map(p => p.path))}
          onSelect={path => {
            const found = sweepParams.find(p => p.path === path);
            if (!found) return;
            const cv = typeof found.currentValue === "number" && Number.isFinite(found.currentValue) ? found.currentValue : 1;
            setSampledParams(prev => [...prev, { ...found, min: cv, max: cv > 0 ? cv * 3 : cv + 3 }]);
          }}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </div>
  );
}

// N-parameter results table for a sampled study — one column per parameter
// plus the objective metric and a feasibility marker, sorted by the
// objective (ascending for "min", descending for "max").
export function SampledResultsTable({ results, parameters, objectiveMetric, objectiveDirection = "min", goals = [], evaluateFeasible }) {
  const { C, FONT } = useTheme();
  const [sortAsc, setSortAsc] = useState(objectiveDirection !== "max");

  if (!results?.length) return null;

  const rows = results.map((pt, i) => ({
    index: i,
    values: parameters.map(p => pt.params?.find(v => v.path === p.path)?.value),
    objectiveMean: pt.aggregateStats?.[objectiveMetric]?.mean ?? null,
    feasible: goals.length ? evaluateFeasible?.(pt.aggregateStats || {}) : null,
  }));

  const sorted = [...rows].sort((a, b) => {
    if (a.objectiveMean == null) return 1;
    if (b.objectiveMean == null) return -1;
    return sortAsc ? a.objectiveMean - b.objectiveMean : b.objectiveMean - a.objectiveMean;
  });

  const isHigherBetter = objectiveDirection === "max";
  const feasibleRows = sorted.filter(r => r.feasible !== false);
  const bestIndex = feasibleRows.length ? feasibleRows[0].index : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 10, color: C.muted, fontFamily: FONT, letterSpacing: 1.2, fontWeight: 700 }}>
          POINTS ({results.length}) — sorted by {METRIC_LABELS[objectiveMetric] || objectiveMetric}, {isHigherBetter ? "best (highest) first" : "best (lowest) first"}
        </span>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", color: C.text, fontSize: 12, textAlign: "left" }}>
          <thead>
            <tr style={{ color: C.muted, borderBottom: `1px solid ${C.border}` }}>
              {goals.length > 0 && <th scope="col" style={{ padding: "6px 8px" }} />}
              {parameters.map(p => (
                <th key={p.path} scope="col" style={{ padding: "6px 8px" }}>{p.label}</th>
              ))}
              <th scope="col" style={{ padding: "6px 8px", cursor: "pointer" }} onClick={() => setSortAsc(a => !a)}>
                {METRIC_LABELS[objectiveMetric] || objectiveMetric} {sortAsc ? "▲" : "▼"}
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(row => (
              <tr key={row.index} style={{ borderBottom: `1px solid ${C.border}`, opacity: row.feasible === false ? 0.5 : 1, background: row.index === bestIndex ? alpha(C.green, 0.08) : "transparent" }}>
                {goals.length > 0 && (
                  <td style={{ padding: "6px 8px" }}>
                    <span style={{ fontSize: 10, color: row.feasible === true ? C.green : row.feasible === false ? C.red : C.muted }}>
                      {row.feasible === true ? "✓" : row.feasible === false ? "✗" : "·"}
                    </span>
                  </td>
                )}
                {row.values.map((v, i) => (
                  <td key={parameters[i].path} style={{ padding: "6px 8px", color: C.amber }}>
                    {Number.isFinite(v) ? v : "—"}
                  </td>
                ))}
                <td style={{ padding: "6px 8px", fontWeight: row.index === bestIndex ? 700 : 400 }}>
                  {fmtMetric(objectiveMetric, row.objectiveMean)}
                  {row.index === bestIndex && <span style={{ marginLeft: 6, fontSize: 9, color: C.green, fontWeight: 900 }}>BEST</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Sensitivity ranking panel — computeSensitivityRanking()'s output rendered
// as a ranked bar list, with the method's one-line explanation always shown
// so the ranking is never presented without its own caveat.
export function SensitivityPanel({ method, ranking }) {
  const { C, FONT } = useTheme();
  if (!ranking?.length) return null;

  const maxAbs = Math.max(0.01, ...ranking.map(r => Math.abs(r.correlation ?? 0)));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 6, padding: 12 }}>
      <span style={{ fontSize: 10, color: C.muted, fontFamily: FONT, letterSpacing: 1.2, fontWeight: 700 }}>SENSITIVITY — WHICH PARAMETERS MATTER MOST</span>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {ranking.map(r => {
          const magnitude = r.correlation == null ? 0 : Math.abs(r.correlation) / maxAbs;
          const isPositive = (r.correlation ?? 0) >= 0;
          return (
            <div key={r.path} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 11, color: C.text, fontFamily: FONT, minWidth: 140, flexShrink: 0 }}>{r.label}</span>
              <div style={{ flex: 1, height: 8, background: C.border, borderRadius: 4, overflow: "hidden" }}>
                <div style={{
                  width: `${Math.round(magnitude * 100)}%`, height: "100%",
                  background: r.correlation == null ? C.muted : isPositive ? C.red : C.accent,
                }} />
              </div>
              <span style={{ fontSize: 11, color: C.muted, fontFamily: "monospace", width: 60, textAlign: "right", flexShrink: 0 }}>
                {r.correlation == null ? "no signal" : r.correlation.toFixed(2)}
              </span>
            </div>
          );
        })}
      </div>
      <span style={{ fontSize: 10, color: C.muted, fontFamily: FONT, lineHeight: 1.5, fontStyle: "italic" }}>
        Method: {method}
      </span>
    </div>
  );
}
