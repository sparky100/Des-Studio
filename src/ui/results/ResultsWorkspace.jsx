import { Fragment, useCallback, useMemo, useState } from "react";
import { alpha, RADIUS } from "../shared/tokens.js";
import { Btn } from "../shared/components.jsx";
import { csvEscape, downloadTextFile, slugifyResultName, timestampForFilename } from "../shared/utils.js";
import { batchMeansCI, buildHistogramFD, computePercentiles, computeSummaryStats, detectOutliers } from "../../engine/statistics.js";
import { SectionFilterTabs } from "../editors/helpers.jsx";
import { buildResultsViewModel } from "./resultsViewModel.js";
import { evaluateResultsHealth } from "./healthFlags.js";
import { useTheme } from "../shared/ThemeContext.jsx";
import { buildLLMBundle } from "../../llm/bundleExport.js";
import { buildGoalGaps } from "../../llm/prompts.js";

const HIST_W = 360;
const HIST_H = 140;
const HIST_BINS = 20;
const CHART_W = 400;
const CHART_H = 140;

const SECTION_DEFAULTS = { summary: true, bottlenecks: true, waitDist: true, waitOverTime: true, waitByArrival: true, serverUtil: true, queueDepth: true, sections: true, journeys: true, cost: true, analysis: true, runtime: true, systemTrends: true };

function SectionHeader({ id, label, badge, isOpen, onToggle }) {
  const { C, FONT } = useTheme();
  return (
    <button
      type="button"
      aria-expanded={isOpen}
      aria-controls={`results-section-${id}`}
      onClick={() => onToggle(id)}
      style={{
        alignItems: "center",
        background: "none",
        border: "none",
        borderBottom: `1px solid ${C.border}`,
        cursor: "pointer",
        display: "flex",
        fontFamily: FONT,
        gap: 8,
        marginBottom: 0,
        padding: "8px 0",
        textAlign: "left",
        width: "100%",
      }}
    >
      <span
        aria-hidden="true"
        style={{
          color: C.muted,
          display: "inline-block",
          fontSize: 9,
          lineHeight: 1,
          transition: "transform 160ms cubic-bezier(0.4,0,0.2,1)",
          transform: isOpen ? "rotate(90deg)" : "rotate(0deg)",
        }}
      >▶</span>
      <span style={{
        color: C.accent,
        flex: 1,
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: 1.2,
      }}>{label.toUpperCase()}</span>
      {badge != null && badge > 0 && (
        <span style={{
          background: C.bg,
          border: `1px solid ${C.border}`,
          borderRadius: 10,
          color: C.muted,
          fontFamily: FONT,
          fontSize: 9,
          fontWeight: 700,
          padding: "1px 7px",
        }}>{badge}</span>
      )}
    </button>
  );
}


function slugify(value = "") {
  return String(value || "data")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "data";
}

function formatNumber(value, digits = 1) {
  if (!Number.isFinite(Number(value))) return "—";
  const rounded = Number(value).toFixed(digits);
  return rounded.includes(".") ? rounded.replace(/\.?0+$/, "") : rounded;
}

function formatMetricValue(value, digits = 1, suffix = "") {
  if (!Number.isFinite(Number(value))) return "—";
  return `${formatNumber(value, digits)}${suffix}`;
}

const ANALYSIS_METRICS = [
  { path: "summary.avgWait", label: "Average wait" },
  { path: "summary.avgSvc", label: "Average service time" },
  { path: "summary.avgSojourn", label: "Average time in system" },
  { path: "summary.avgTimeInSystem", label: "Average time in system (all entities)" },
  { path: "summary.served", label: "Customers served" },
  { path: "summary.servedRatio", label: "Service completion rate" },
  { path: "summary.totalCost", label: "Total cost" },
  { path: "summary.costPerServed", label: "Cost per served customer" },
];

function getPathValue(source, path) {
  const parts = path.split(".");
  let value = source?.result || source;
  for (const part of parts) value = value?.[part];
  return value;
}

function addResultWrapper(row) {
  return row.result ? row : { ...row, result: { summary: row.summary || {} } };
}

function normaliseReplicationResults(replicationResults, results) {
  if (Array.isArray(replicationResults) && replicationResults.length) {
    return replicationResults.map(addResultWrapper);
  }
  if (Array.isArray(results?.replicationResults) && results.replicationResults.length) {
    return results.replicationResults.map(addResultWrapper);
  }
  if (Array.isArray(results?.replications) && results.replications.length) {
    return results.replications.map(row => addResultWrapper({ ...row }));
  }
  return [];
}


export function buildSeriesCsv(series = {}) {

  const rows = [["index", "time", "value"]];
  (series.points || []).forEach((point, index) => {
    rows.push([index + 1, point.t ?? "", point.value ?? ""]);
  });
  return rows.map(row => row.map(csvEscape).join(",")).join("\n");
}

export function buildWaitValuesCsv(dist = {}) {

  const rows = [["rank", "wait"]];
  (dist.values || []).forEach((value, index) => {
    rows.push([index + 1, value]);
  });
  return rows.map(row => row.map(csvEscape).join(",")).join("\n");
}

function MetricStrip({ items }) {
  const { C, FONT } = useTheme();
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(104px, 1fr))", gap: 6 }}>
      {items.map(item => (
        <div key={item.label} style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 5, padding: "6px 8px" }}>
          <div style={{ fontSize: 8, color: C.muted, fontFamily: FONT, letterSpacing: 1, fontWeight: 700, marginBottom: 2 }}>
            {item.label.toUpperCase()}
          </div>
          <div style={{ fontSize: 11, color: item.color || C.text, fontFamily: FONT, fontWeight: 700 }}>
            {item.value}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── StatCards ─────────────────────────────────────────────────────────────────
// Unified stat footer used by both line-chart panels and histogram panels.
// Replaces the ad-hoc MetricStrip that appeared below time-series charts.
function StatCards({ items }) {
  const { C, FONT } = useTheme();
  const cols = Math.min(items.length, 6);
  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 5 }}>
      {items.map(item => (
        <div key={item.label} style={{
          background: C.bg,
          border: `1px solid ${item.color ? alpha(item.color, 0.28) : C.border}`,
          borderRadius: 5,
          padding: "5px 6px",
          textAlign: "center",
        }}>
          <div style={{ fontSize: 8, fontWeight: 700, color: item.color || C.muted, fontFamily: FONT, letterSpacing: 1, marginBottom: 2 }}>
            {item.label.toUpperCase()}
          </div>
          <div style={{ fontSize: 12, fontWeight: 700, color: C.text, fontFamily: FONT, lineHeight: 1.2 }}>
            {item.value}
          </div>
          {item.desc && (
            <div style={{ fontSize: 8, color: C.muted, fontFamily: FONT, marginTop: 1 }}>{item.desc}</div>
          )}
        </div>
      ))}
    </div>
  );
}

// ── ChartCard ─────────────────────────────────────────────────────────────────
// Consistent bordered card wrapper for every chart panel — line charts and
// histograms alike. Provides the colour-dot title row, source label, chart
// body slot, optional stat footer, and optional data-preview slot.
function ChartCard({ title, color, sourceLabel, statItems, dataPreview, children }) {
  const { C, FONT } = useTheme();
  return (
    <div style={{
      background: C.surface,
      border: `1px solid ${C.border}`,
      borderRadius: 8,
      padding: 14,
      display: "flex",
      flexDirection: "column",
      gap: 10,
      minWidth: 0,
    }}>
      {/* Two-row header so long queue names never get truncated mid-word.
          Row 1: colour dot + name (wraps up to 2 lines, tooltip shows full name).
          Row 2: source label indented to align with the name text. */}
      <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 7, minWidth: 0 }}>
          <span style={{ width: 9, height: 9, borderRadius: "50%", background: color, flexShrink: 0, marginTop: 3, display: "inline-block" }} />
          <span
            title={title}
            style={{
              fontSize: 12,
              color: C.text,
              fontFamily: FONT,
              fontWeight: 700,
              lineHeight: 1.4,
              // Allow up to 2 lines before clipping — eliminates mid-word
              // truncation for all realistic queue names while keeping panels compact.
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
              minWidth: 0,
            }}
          >
            {title}
          </span>
        </div>
        {sourceLabel && (
          <span style={{ fontSize: 9, color: C.muted, fontFamily: FONT, paddingLeft: 16 }}>
            Source: {sourceLabel}
          </span>
        )}
      </div>
      {children}
      {statItems?.length > 0 && <StatCards items={statItems} />}
      {dataPreview}
    </div>
  );
}

// Returns the four stat-card items for a time-series panel.
function lineSeriesStats(series, yLabel, color, formatValue = v => formatNumber(v)) {
  const pts = Array.isArray(series?.points) ? series.points : [];
  if (pts.length < 2) return [];
  const peak = pts.reduce((b, p) => Number(p.value) > Number(b.value) ? p : b, pts[0]);
  const last = pts[pts.length - 1];
  return [
    { label: "peak", value: formatValue(peak.value), color, desc: yLabel },
    { label: "at t", value: formatNumber(peak.t, 0), desc: "peak time" },
    { label: "final", value: formatValue(last.value), desc: `t = ${formatNumber(last.t, 0)}` },
    { label: "n", value: pts.length.toLocaleString(), desc: "data points" },
  ];
}

// True when a points series has at least one value that differs from the first —
// used to suppress charts (e.g. resource capacity) that would otherwise just show a flat line.
function seriesHasVariation(points) {
  if (!Array.isArray(points) || points.length < 2) return false;
  const first = points[0].value;
  return points.some(p => p.value !== first);
}

function CiBadge({ ci, C, FONT }) {
  if (!ci?.halfWidth || !ci?.mean || !Number.isFinite(ci.mean) || ci.mean === 0) return null;
  const relHw = (ci.halfWidth / Math.abs(ci.mean)) * 100;
  const color = relHw < 10 ? C.green : relHw < 25 ? C.amber : C.red;
  return (
    <span
      title={`±${ci.halfWidth.toFixed(1)} half-width, n=${ci.n} reps`}
      style={{
        fontSize: 10, fontWeight: 700, color, fontFamily: FONT,
        background: `${color}18`, border: `1px solid ${color}44`,
        borderRadius: 999, padding: "2px 6px",
        whiteSpace: "nowrap", marginLeft: 5,
      }}
    >
      ±{relHw.toFixed(0)}%
    </span>
  );
}

function KeyFindingsBanner({ healthFlags, C, FONT }) {
  if (!healthFlags?.length) return null;
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 10, color: C.red, fontFamily: FONT, letterSpacing: 1.2, fontWeight: 700, marginBottom: 8 }}>
        KEY FINDINGS ({healthFlags.length})
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 360px), 1fr))", gap: 8 }}>
      {healthFlags.map((flag, i) => {
        const isCritical = flag.severity === "critical";
        const accentColor = isCritical ? C.red : C.amber;
        return (
          <div key={`${flag.code}-${i}`} style={{
            background: isCritical ? `${C.errorBg}44` : `${C.warnBg}18`,
            borderLeft: `3px solid ${accentColor}`,
            borderRadius: RADIUS.md,
            padding: "10px 14px",
            display: "flex", flexDirection: "column", gap: 4,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 14, lineHeight: 1 }}>{isCritical ? "\u26A1" : "\u26A0"}</span>
              <span style={{
                background: accentColor + "22", color: accentColor,
                borderRadius: 3, padding: "1px 6px",
                fontSize: 9, fontWeight: 700, letterSpacing: 1, fontFamily: FONT,
              }}>
                {isCritical ? "CRITICAL" : "WARNING"}
              </span>
              {flag.resource && (
                <span style={{ fontSize: 10, color: C.muted, fontFamily: FONT }}>{flag.resource}</span>
              )}
            </div>
            <div style={{ fontSize: 12, color: C.text, fontFamily: FONT, lineHeight: 1.5 }}>
              {flag.message}
            </div>
            {flag.suggestion && (
              <div style={{ fontSize: 11, color: C.accent, fontFamily: FONT, fontWeight: 600, marginTop: 2 }}>
                {"\u2192"} {flag.suggestion}
              </div>
            )}
          </div>
        );
      })}
      </div>
    </div>
  );
}

export function SummaryCardGrid({ results, replicationResults = [], model = {} }) {
  const { C, FONT } = useTheme();
  const summary = results?.summary || {};
  // Derive replication count from prop array; fall back to stored replications field
  // (array length for normal batches, or number for explore/history-loaded runs).
  const storedRepCount = Array.isArray(results?.replications)
    ? results.replications.length
    : (typeof results?.replications === 'number' && results.replications > 1 ? results.replications : null);
  const repCount = replicationResults.length > 0 ? replicationResults.length : (storedRepCount || 1);
  const isMultiRep = repCount > 1;

  const totalArrived = Number(summary.total ?? summary.arrived ?? summary.totalArrived ?? 0);
  const served = Number(summary.served ?? 0);
  const reneged = Number(summary.reneged ?? summary.totalReneged ?? 0);
  const leftRate = totalArrived > 0 ? (reneged / totalArrived) * 100 : null;

  // For count metrics, compute the per-run average when running multi-rep (integer).
  const avgPerRun = (total) =>
    isMultiRep && total > 0 ? Math.round(total / repCount) : null;

  // For count metric cards: prefer aggregateStats.mean (per-run avg from CI) over raw total.
  const resolveCount = (rawTotal, ciPath) => {
    const ci = results?.aggregateStats?.[ciPath];
    if (isMultiRep && ci?.n >= 2 && Number.isFinite(ci.mean)) return ci.mean;
    return rawTotal;
  };

  const waitBreakdown = summary.waitSamplesBreakdown;
  const waitBreakdownNote = waitBreakdown
    ? `(${waitBreakdown.served} served, ${waitBreakdown.reneged} reneged${waitBreakdown.inProgress > 0 ? `, ${waitBreakdown.inProgress} in-progress` : ""})`
    : "";

  // Fallback: compute servedRatio if not stored (older runs)
  const servedRatio = summary.servedRatio != null
    ? summary.servedRatio
    : (totalArrived > 0 ? +(served / totalArrived).toFixed(4) : null);
  const servedRatioDisplay = servedRatio != null ? Math.round(servedRatio * 100) : null;

  // avgTimeInSystem includes WIP entities; do not fall back to avgSojourn (served-only)
  const avgTimeInSystem = summary.avgTimeInSystem != null ? summary.avgTimeInSystem : null;

  const cards = [
    {
      label: "Avg wait",
      value: formatMetricValue(summary.avgWait),
      ciPath: "summary.avgWait",
      color: C.amber,
    },
    {
      label: "Avg service",
      value: formatMetricValue(summary.avgSvc),
      color: C.accent,
    },
    {
      label: "Sojourn",
      value: formatMetricValue(summary.avgSojourn),
      color: C.accent,
    },
    {
      label: "Time in system",
      value: formatMetricValue(avgTimeInSystem),
      color: C.accent,
    },
    {
      label: "Arrived",
      value: totalArrived > 0 ? formatMetricValue(isMultiRep ? Math.round(totalArrived / repCount) : totalArrived, 0) : "—",
      color: C.text,
    },
    {
      label: "Served",
      value: formatMetricValue(resolveCount(served, "summary.served"), 0),
      color: C.served,
    },
    {
      label: "Reneged",
      value: isMultiRep && reneged > 0
        ? formatMetricValue(resolveCount(reneged, "summary.reneged"), 0)
        : (leftRate == null ? "—" : `${formatNumber(leftRate, 1)}%`),
      ciPath: reneged > 0 ? "summary.reneged" : null,
      color: reneged > 0 ? C.reneged : C.green,
    },
    {
      label: "Completion rate",
      value: servedRatioDisplay != null ? `${servedRatioDisplay}%` : "—",
      color: C.green,
    },
  ];
  if (Number.isFinite(summary.totalCost) && summary.totalCost > 0) {
    cards.push({
      label: "Total cost",
      value: formatMetricValue(summary.totalCost),
      color: C.purple,
    });
  }
  if (summary.costPerServed != null && Number.isFinite(summary.costPerServed)) {
    cards.push({
      label: "Cost / served",
      value: formatMetricValue(summary.costPerServed),
      color: C.purple,
    });
  }
  const perResourceEntries = Object.entries(summary.perResource || {});
  const containerEntries = Object.entries(summary.containerLevels || {});
  const containerCapacities = {};
  (model?.containerTypes || []).forEach(ct => {
    if (ct.capacity != null && ct.capacity !== "") containerCapacities[ct.id] = Number(ct.capacity);
  });
  const outcomeEntries = Object.entries(summary.outcomes || {})
    .map(([routeId, outcome]) => ({
      routeId,
      routeLabel: outcome.routeLabel || routeId,
      status: outcome.status || "",
      endedBy: outcome.endedBy || "",
      count: Number(outcome.count) || 0,
    }))
    .filter(row => row.count > 0)
    .sort((a, b) => b.count - a.count || a.routeLabel.localeCompare(b.routeLabel));
  const utilPct = v => `${Math.round((v ?? 0) * 100)}%`;
  const utilColor = v => v > 0.9 ? C.red : v > 0.7 ? C.amber : C.green;
  const avgUtil = perResourceEntries.length > 0
    ? perResourceEntries.reduce((sum, [, r]) => sum + (r.utilisation ?? 0), 0) / perResourceEntries.length
    : null;

  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ fontSize: 10, color: C.accent, fontFamily: FONT, letterSpacing: 1.2, fontWeight: 700 }}>
          RESULTS SUMMARY
        </div>
        {isMultiRep && (
          <div style={{
            fontSize: 10, fontFamily: FONT, color: C.accent,
            background: C.accent + "18", border: `1px solid ${C.accent}44`,
            borderRadius: 4, padding: "2px 8px", letterSpacing: 0.5, fontWeight: 600,
          }}>
            Batch run · {repCount} replications
          </div>
        )}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
        {cards.map(card => (
          <div key={card.label} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6, padding: 12 }}>
            <div style={{ fontSize: 10, color: C.muted, fontFamily: FONT, letterSpacing: 1.1, fontWeight: 700, marginBottom: 5 }}>
              {card.label.toUpperCase()}
            </div>
            <div style={{ display: "flex", alignItems: "baseline", flexWrap: "wrap", gap: 4 }}>
              <span style={{ fontSize: 18, color: card.color, fontFamily: FONT, fontWeight: 700, lineHeight: 1.2 }}>{card.value}</span>
              {card.ciPath && <CiBadge ci={results?.aggregateStats?.[card.ciPath]} C={C} FONT={FONT} />}
            </div>
          </div>
        ))}
      </div>

      {(() => {
        const goals = model.goals || [];
        if (!goals.length) return null;
        const storedAgg = results?.aggregateStats && Object.keys(results.aggregateStats).length > 0
          ? results.aggregateStats : null;
        const summary = { ...(results?.summary || {}), waitDist: results?.waitDist, runtimeMetrics: results?.runtimeMetrics };
        const aggForGoals = storedAgg || (() => {
          const s = summary;
          const pt = v => (v != null && Number.isFinite(Number(v)) ? { mean: Number(v), n: 1 } : null);
          const out = {};
          if (pt(s.avgWait))    out['summary.avgWait']    = pt(s.avgWait);
          if (pt(s.avgSvc))     out['summary.avgSvc']     = pt(s.avgSvc);
          if (pt(s.avgSojourn)) out['summary.avgSojourn'] = pt(s.avgSojourn);
          if (pt(s.avgWIP))     out['summary.avgWIP']     = pt(s.avgWIP);
          if (pt(s.maxWIP))     out['summary.maxWIP']     = pt(s.maxWIP);
          if (pt(s.served))     out['summary.served']     = pt(s.served);
          if (pt(s.reneged))    out['summary.reneged']    = pt(s.reneged);
          if (pt(s.totalCost))  out['summary.totalCost']  = pt(s.totalCost);
          if (pt(s.costPerServed)) out['summary.costPerServed'] = pt(s.costPerServed);
          return out;
        })();
        const gaps = buildGoalGaps(model, aggForGoals, summary);
        if (!gaps?.length) return null;
        return (
          <>
            <div style={{ fontSize: 10, color: C.accent, fontFamily: FONT, letterSpacing: 1.2, fontWeight: 700, marginTop: 4 }}>
              GOALS
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(420px, 1fr))", gap: 6 }}>
              {gaps.map(g => {
                const pass = g.current != null && g.met;
                const chipColor = g.current == null ? C.muted : pass ? C.green : C.red;
                const chipLabel = g.current == null ? 'UNKNOWN' : pass ? '✓ PASS' : '✗ FAIL';
                const isPercentile = typeof g.operator === "string" && g.operator.startsWith("p");
                const opLabel = isPercentile
                  ? `${g.operator.replace("p", "")}th %ile <`
                  : g.operator;
                return (
                  <div key={g.metric + (g.scope?.id || "")} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6 }}>
                    <div style={{ flex: 1, fontFamily: FONT, fontSize: 12, color: C.text }}>{g.label}</div>
                    <div style={{ fontFamily: FONT, fontSize: 12, color: C.muted }}>
                      {g.current != null ? `${Number(g.current).toFixed(1)} ${opLabel} ${g.target}` : "n/a"}
                    </div>
                    <div style={{ padding: "2px 8px", borderRadius: 4, background: chipColor + "22", border: `1px solid ${chipColor}55`, fontFamily: FONT, fontSize: 10, fontWeight: 700, color: chipColor, letterSpacing: 0.5 }}>
                      {chipLabel}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        );
      })()}
      {outcomeEntries.length > 0 && (
        <>
          <div style={{ fontSize: 10, color: C.accent, fontFamily: FONT, letterSpacing: 1.2, fontWeight: 700, marginTop: 4 }}>
            JOURNEY OUTCOMES
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 10 }}>
            {outcomeEntries.map(outcome => {
              const outcomeAvg = isMultiRep ? avgPerRun(outcome.count) : null;
              const displayCount = outcomeAvg ?? outcome.count;
              const outcomeColor = outcome.status === "reneged" ? C.reneged : C.served;
              const hasWait    = Number.isFinite(outcome.avgWait)    && outcome.avgWait    > 0;
              const hasSojourn = Number.isFinite(outcome.avgSojourn) && outcome.avgSojourn > 0;
              return (
                <div key={outcome.routeId} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6, padding: 12 }}>
                  <div style={{ fontSize: 10, color: C.muted, fontFamily: FONT, letterSpacing: 1.1, fontWeight: 700, marginBottom: 5 }}>
                    {outcome.routeLabel.toUpperCase()}
                  </div>
                  <div style={{ fontSize: 18, color: outcomeColor, fontFamily: FONT, fontWeight: 700, marginBottom: 6 }}>
                    {formatMetricValue(displayCount, 0)}
                  </div>
                  {(hasWait || hasSojourn) && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 3, marginBottom: 6, paddingTop: 6, borderTop: `1px solid ${C.border}` }}>
                      {hasWait && (
                        <div style={{ display: "flex", justifyContent: "space-between", fontFamily: FONT, fontSize: 11 }}>
                          <span style={{ color: C.muted }}>Avg wait</span>
                          <span style={{ color: C.text, fontWeight: 600 }}>{formatMetricValue(outcome.avgWait)}</span>
                        </div>
                      )}
                      {hasSojourn && (
                        <div style={{ display: "flex", justifyContent: "space-between", fontFamily: FONT, fontSize: 11 }}>
                          <span style={{ color: C.muted }}>Avg time in system</span>
                          <span style={{ color: C.text, fontWeight: 600 }}>{formatMetricValue(outcome.avgSojourn)}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
        );
      })}
          </div>
        </>
      )}
      {perResourceEntries.length > 0 && (() => {
        // Resource counts must reflect the model that actually produced these
        // results, not the live model — it may have been edited since the run.
        const snapshotModel = results?._model_snapshot ?? model;
        const serverTypes = (snapshotModel?.entityTypes || []).filter(et => et.role === "server");
        const serverTypeMap = {};
        serverTypes.forEach(et => {
          serverTypeMap[et.name] = {
            count: Math.max(1, parseInt(et.count || "1", 10) || 1),
            hasShiftSchedule: Array.isArray(et.shiftSchedule) && et.shiftSchedule.length > 0,
          };
        });
        return (
        <>
          <div style={{ fontSize: 10, color: C.accent, fontFamily: FONT, letterSpacing: 1.2, fontWeight: 700, marginTop: 4 }}>
            RESOURCE UTILISATION
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10 }}>
            {perResourceEntries.map(([name, r]) => {
              const st = serverTypeMap[name] || { count: r.total ?? 1, hasShiftSchedule: false };
              return (
              <div key={name} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6, padding: 12 }}>
                <div style={{ fontSize: 10, color: C.muted, fontFamily: FONT, letterSpacing: 1.1, fontWeight: 700, marginBottom: 5 }}>
                  {name.toUpperCase()}
                </div>
                <div style={{ fontSize: 18, color: utilColor(r.utilisation ?? 0), fontFamily: FONT, fontWeight: 700, marginBottom: 5 }}>
                  {utilPct(r.utilisation ?? 0)}
                </div>
                <div style={{ fontSize: 11, color: C.muted, fontFamily: FONT, lineHeight: 1.5 }}>
                  {st.hasShiftSchedule
                    ? "Shift pattern enabled"
                    : `${st.count} resource${st.count !== 1 ? "s" : ""}. Average % of capacity in use.`}
                </div>
                {r.failureCount > 0 && (
                  <div style={{ fontSize: 11, color: r.availability < 0.9 ? C.red : C.muted, fontFamily: FONT, lineHeight: 1.5 }}>
                    {Math.round((r.availability ?? 1) * 100)}% available · {r.failureCount} failure{r.failureCount !== 1 ? "s" : ""}
                    {r.totalDowntime ? ` · ${formatMetricValue(r.totalDowntime)} downtime` : ""}
                  </div>
                )}
              </div>
              );
            })}
            {perResourceEntries.length > 1 && avgUtil != null && (
              <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6, padding: 12 }}>
                <div style={{ fontSize: 10, color: C.muted, fontFamily: FONT, letterSpacing: 1.1, fontWeight: 700, marginBottom: 5 }}>
                  AVERAGE UTILISATION
                </div>
                <div style={{ fontSize: 18, color: utilColor(avgUtil), fontFamily: FONT, fontWeight: 700, marginBottom: 5 }}>
                  {utilPct(avgUtil)}
                </div>
                <div style={{ fontSize: 11, color: C.muted, fontFamily: FONT, lineHeight: 1.5 }}>
                  Averaged across {perResourceEntries.length} resource types.
                </div>
              </div>
            )}
          </div>
        </>
        );
      })()}
      {containerEntries.length > 0 && (
        <>
          <div style={{ fontSize: 10, color: C.accent, fontFamily: FONT, letterSpacing: 1.2, fontWeight: 700, marginTop: 4 }}>
            CONTAINER LEVELS
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
            {containerEntries.map(([id, lvl]) => {
              const capacity = containerCapacities[id];
              const hasCapacity = Number.isFinite(capacity) && capacity > 0;
              const fillRatio = hasCapacity && lvl.final != null ? lvl.final / capacity : null;
              const fillColor = fillRatio == null ? C.accent : fillRatio >= 1 ? C.red : fillRatio >= 0.85 ? C.amber : C.accent;
              return (
                <div key={id} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6, padding: 12 }}>
                  <div style={{ fontSize: 10, color: C.muted, fontFamily: FONT, letterSpacing: 1.1, fontWeight: 700, marginBottom: 5 }}>
                    {id.toUpperCase()}
                  </div>
                  <div style={{ fontSize: 18, color: fillColor, fontFamily: FONT, fontWeight: 700, marginBottom: 6 }}>
                    {hasCapacity ? `${formatMetricValue(lvl.final, 0)} / ${formatMetricValue(capacity, 0)}` : formatMetricValue(lvl.final, 0)}
                  </div>
                  <StatCards
                    items={[
                      { label: "Min", value: formatMetricValue(lvl.min) },
                      { label: "Avg", value: formatMetricValue(lvl.avg) },
                      { label: "Max", value: formatMetricValue(lvl.max) },
                    ]}
                  />
                </div>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}

function SeriesDataSummary({ series, valueLabel, formatValue = v => formatNumber(v) }) {
  const { C, FONT } = useTheme();
  const points = Array.isArray(series?.points) ? series.points : [];
  if (!points.length) return null;
  const first = points[0];
  const last = points[points.length - 1];
  const peak = Math.max(...points.map(p => Number(p.value) || 0));
  return (
    <MetricStrip
      items={[
        { label: "points", value: points.length },
        { label: "first", value: `t=${formatNumber(first.t)} → ${formatValue(first.value)}` },
        { label: "last", value: `t=${formatNumber(last.t)} → ${formatValue(last.value)}` },
        { label: `peak ${valueLabel}`, value: formatValue(peak), color: C.accent },
      ]}
    />
  );
}

function WaitDataSummary({ dist }) {
  const { C, FONT } = useTheme();
  const vals = Array.isArray(dist?.values) ? dist.values : [];
  if (!vals.length) return null;
  return (
    <MetricStrip
      items={[
        { label: "samples", value: dist.n },
        { label: "min wait", value: formatNumber(vals[0]) },
        { label: "max wait", value: formatNumber(vals[vals.length - 1]) },
        { label: "mean wait", value: formatNumber(dist.mean), color: C.accent },
      ]}
    />
  );
}

function RuntimeMetricsSection({ runtimeMetrics }) {
  const { C, FONT } = useTheme();
  const metrics = runtimeMetrics?.metrics || {};
  const queuePeaks = Array.isArray(metrics.maxQueueLengthByQueue) ? metrics.maxQueueLengthByQueue : [];
  const items = [
    { label: "Wall-clock time", value: metrics.wallClockMs != null ? `${formatNumber(metrics.wallClockMs, 0)} ms` : "—", color: C.accent },
    { label: "Replications", value: metrics.replications != null ? formatNumber(metrics.replications, 0) : "—" },
    { label: "Events processed", value: metrics.eventsProcessed != null ? formatNumber(metrics.eventsProcessed, 0) : "—" },
    { label: "C-event scans", value: metrics.cEventScans != null ? formatNumber(metrics.cEventScans, 0) : "—" },
    { label: "C-events fired", value: metrics.cEventsFired != null ? formatNumber(metrics.cEventsFired, 0) : "—" },
    { label: "Entities created", value: metrics.entitiesCreated != null ? formatNumber(metrics.entitiesCreated, 0) : "—" },
    { label: "Entities completed", value: metrics.entitiesCompleted != null ? formatNumber(metrics.entitiesCompleted, 0) : "—" },
  ];

  return (
    <section aria-label="Runtime metrics" style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6, padding: 12, display: "flex", flexDirection: "column", gap: 10, minWidth: 0 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <div style={{ fontSize: 10, color: C.accent, fontFamily: FONT, letterSpacing: 1.2, fontWeight: 700 }}>
          RUN EFFORT
        </div>
        <div style={{ fontSize: 11, color: C.muted, fontFamily: FONT, lineHeight: 1.6 }}>
          See how much simulation work this result took.
        </div>
      </div>

      {runtimeMetrics?.hasMetrics ? (
        <MetricStrip items={items} />
      ) : (
        <div style={{ fontSize: 11, color: C.muted, fontFamily: FONT, lineHeight: 1.6 }}>
          Runtime metrics are not available for this saved run.
        </div>
      )}
    </section>
  );
}

function previewRows(rows, headCount = 6, tailCount = 4) {
  if (rows.length <= headCount + tailCount + 1) return rows.map((row, index) => ({ row, index, gap: false }));
  return [
    ...rows.slice(0, headCount).map((row, index) => ({ row, index, gap: false })),
    { row: null, index: "gap", gap: true },
    ...rows.slice(-tailCount).map((row, offset) => ({ row, index: rows.length - tailCount + offset, gap: false })),
  ];
}

function DataPreviewShell({ summary, onExport, children }) {
  const { C, FONT } = useTheme();
  return (
    <details style={{ marginTop: 4 }}>
      <summary style={{ cursor: "pointer", color: C.accent, fontFamily: FONT, fontSize: 10, fontWeight: 700 }}>
        <span>{summary}</span>
      </summary>
      <div style={{ marginTop: 8, display: "flex", justifyContent: "flex-end" }}>
        <button
          type="button"
          onClick={onExport}
          style={{
            background: C.bg,
            border: `1px solid ${C.border}`,
            borderRadius: 4,
            color: C.text,
            cursor: "pointer",
            fontFamily: FONT,
            fontSize: 10,
            fontWeight: 700,
            padding: "4px 8px",
          }}
        >
          CSV
        </button>
      </div>
      <div style={{ marginTop: 8, overflowX: "auto" }}>
        {children}
      </div>
    </details>
  );
}

function SeriesDataPreview({ series }) {
  const { C, FONT } = useTheme();
  const points = Array.isArray(series?.points) ? series.points : [];
  if (!points.length) return null;
  const th = label => <th key={label} scope="col" style={{ padding: "4px 8px", textAlign: "right", color: C.muted, fontFamily: FONT, fontSize: 11, fontWeight: 700 }}>{label}</th>;
  const td = (label, value, color = C.text) => <td key={label} style={{ padding: "4px 8px", textAlign: "right", color, fontFamily: FONT, fontSize: 10 }}>{value}</td>;
  const filename = `simmodlr-chart-${slugify(series.label)}.csv`;
  return (
    <DataPreviewShell summary={`See the numbers behind this chart (${points.length} points)`} onExport={() => downloadTextFile(buildSeriesCsv(series), filename)}>
      <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 260 }}>
        <thead>
          <tr style={{ borderBottom: `1px solid ${C.border}` }}>{[th("index"), th("time"), th("value")]}</tr>
        </thead>
        <tbody>
          {previewRows(points).map(item => item.gap ? (
            <tr key="gap" style={{ borderBottom: `1px solid ${C.border}` }}>{[td("gap-index", "...", C.muted), td("gap-time", "...", C.muted), td("gap-value", "...", C.muted)]}</tr>
          ) : (
            <tr key={item.index} style={{ borderBottom: `1px solid ${C.border}` }}>{[
              td("index", item.index + 1, C.muted),
              td("time", formatNumber(item.row.t)),
              td("value", formatNumber(item.row.value), C.accent),
            ]}</tr>
          ))}
        </tbody>
      </table>
    </DataPreviewShell>
  );
}

function WaitValuesPreview({ dist }) {
  const { C, FONT } = useTheme();
  const values = Array.isArray(dist?.values) ? dist.values : [];
  if (!values.length) return null;
  const th = label => <th key={label} scope="col" style={{ padding: "4px 8px", textAlign: "right", color: C.muted, fontFamily: FONT, fontSize: 11, fontWeight: 700 }}>{label}</th>;
  const td = (label, value, color = C.text) => <td key={label} style={{ padding: "4px 8px", textAlign: "right", color, fontFamily: FONT, fontSize: 10 }}>{value}</td>;
  const filename = `simmodlr-wait-samples-${slugify(dist.label)}.csv`;
  return (
    <DataPreviewShell summary={`See the waiting times behind this chart (${values.length} values)`} onExport={() => downloadTextFile(buildWaitValuesCsv(dist), filename)}>
      <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 220 }}>
        <thead>
          <tr style={{ borderBottom: `1px solid ${C.border}` }}>{[th("rank"), th("wait")]}</tr>
        </thead>
        <tbody>
          {previewRows(values).map(item => item.gap ? (
            <tr key="gap" style={{ borderBottom: `1px solid ${C.border}` }}>{[td("gap-rank", "...", C.muted), td("gap-wait", "...", C.muted)]}</tr>
          ) : (
            <tr key={item.index} style={{ borderBottom: `1px solid ${C.border}` }}>{[
              td("rank", item.index + 1, C.muted),
              td("wait", formatNumber(item.row), C.accent),
            ]}</tr>
          ))}
        </tbody>
      </table>
    </DataPreviewShell>
  );
}

function WaitHistogram({ dist, color }) {
  const { C, FONT } = useTheme();
  const [tip, setTip] = useState(null);
  if (!dist || dist.n < 2) return null;

  // Prefer pre-computed histogram bins (present in "minimal" saves) over raw values.
  // Fall back to computing FD bins from raw values for live/compact/full runs.
  const histBins = useMemo(() => {
    if (dist.histogram?.bins?.length > 1) return dist.histogram.bins;
    if (Array.isArray(dist.values) && dist.values.length > 1) {
      return buildHistogramFD(dist.values, { maxBins: HIST_BINS }).bins;
    }
    return null;
  }, [dist]);

  if (!histBins || histBins.length < 2) return null;
  const minV = histBins[0].low;
  const maxV = histBins[histBins.length - 1].high;
  if (maxV === minV) return null;

  const counts = histBins.map(b => b.count);
  const maxCount = Math.max(...counts, 1);
  const barW = HIST_W / histBins.length;
  const PAD = { top: 14, right: 6, bottom: 20, left: 40 };
  const w = HIST_W - PAD.left - PAD.right;
  const h = HIST_H - PAD.top - PAD.bottom;
  const toX = v => PAD.left + ((v - minV) / (maxV - minV)) * w;
  const barToX = i => PAD.left + (i / histBins.length) * w;
  const yTicks = [0, Math.round(maxCount / 2) || 1, maxCount];
  const markers = [
    { label: "p50", value: dist.p50, color: C.green },
    { label: "p90", value: dist.p90, color: C.amber },
    { label: "p99", value: dist.p99, color: C.red },
  ];

  return (
    <div>
      <svg width={HIST_W} height={HIST_H} aria-label="Wait time histogram"
        viewBox={`0 0 ${HIST_W} ${HIST_H}`} style={{ display: "block", width: "100%", overflow: "visible" }}
        onMouseLeave={() => setTip(null)}>
        {yTicks.map((t, i) => {
          const y = PAD.top + h - (t / maxCount) * h;
          return (
            <g key={`${t}-${i}`}>
              <line x1={PAD.left} y1={y} x2={PAD.left + w} y2={y}
                stroke={C.chartGrid} strokeWidth={1} />
              <text x={PAD.left - 4} y={y + 4} textAnchor="end" fontSize={10}
                fill={C.muted} fontFamily="monospace">{t}</text>
            </g>
          );
        })}
        {counts.map((cnt, i) => {
          const barH = Math.max(cnt > 0 ? 2 : 0, (cnt / maxCount) * h);
          const bx = barToX(i) + 1;
          const bw = Math.max(barW - 2, 1);
          const by = PAD.top + h - barH;
          const bin = histBins[i];
          return (
            <rect key={i}
              x={bx} y={by}
              width={bw} height={barH}
              fill={alpha(color, 0.85)} rx={4} ry={4}
              style={{ cursor: "crosshair" }}
              onMouseEnter={() => setTip({ x: bx + bw / 2, y: by, label: `${bin.low.toFixed(1)} – ${bin.high.toFixed(1)}`, value: `count: ${cnt}` })}
            />
          );
        })}
        {markers.map(m => {
          const x = toX(m.value);
          if (x < PAD.left || x > PAD.left + w) return null;
          return (
            <g key={m.label}>
              <line x1={x} y1={PAD.top} x2={x} y2={PAD.top + h}
                stroke={m.color} strokeWidth={1.5} strokeDasharray="4,3" />
              <text x={x + 2} y={PAD.top - 2} fontSize={9} fill={m.color} fontFamily="monospace">{m.label}</text>
            </g>
          );
        })}
        <text x={PAD.left} y={HIST_H - 4} fontSize={10} fill={C.muted} fontFamily="monospace">{Math.round(minV)}</text>
        <text x={PAD.left + w - 28} y={HIST_H - 4} fontSize={10} fill={C.muted} fontFamily="monospace">{Math.round(maxV)}</text>
        {tip && (() => {
          const TW = 120, TH = 36, TX = Math.min(Math.max(tip.x - TW/2, PAD.left), PAD.left + w - TW), TY = Math.max(tip.y - TH - 6, PAD.top);
          return (
            <g style={{ pointerEvents: "none" }}>
              <rect x={TX} y={TY} width={TW} height={TH} rx={4} fill={C.panel} stroke={C.accent} strokeWidth={1} opacity={0.97} />
              <text x={TX + TW/2} y={TY + 13} textAnchor="middle" fill={C.muted} fontSize={9} fontFamily={FONT}>{tip.label}</text>
              <text x={TX + TW/2} y={TY + 27} textAnchor="middle" fill={C.text} fontSize={10} fontFamily={FONT} fontWeight={700}>{tip.value}</text>
            </g>
          );
        })()}
      </svg>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(72px, 1fr))", gap: 6, marginTop: 8 }}>
        {[
          { label: "n", value: dist.n, color: C.muted, desc: "samples" },
          { label: "avg", value: dist.mean, color: C.accent, desc: "mean wait", decimal: true },
          { label: "p50", value: dist.p50, color: C.green, desc: "median" },
          { label: "p90", value: dist.p90, color: C.amber, desc: "90th %ile" },
          { label: "p95", value: dist.p95, color: C.amber, desc: "95th %ile" },
          { label: "p99", value: dist.p99, color: C.red, desc: "99th %ile" },
        ].map(s => (
          <div key={s.label} style={{ background: C.bg, border: `1px solid ${s.color}44`, borderRadius: 5, padding: "6px 8px", textAlign: "center" }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: s.color, fontFamily: FONT, letterSpacing: 1, marginBottom: 2 }}>{s.label.toUpperCase()}</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.text, fontFamily: FONT }}>{typeof s.value === "number" ? (s.decimal ? s.value.toFixed(1) : Math.round(s.value)) : s.value}</div>
            <div style={{ fontSize: 8, color: C.muted, fontFamily: FONT }}>{s.desc}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ChartSectionShell({ section, children }) {
  const { C, FONT } = useTheme();
  return (
    <section style={{
      background: C.surface,
      border: `1px solid ${C.border}`,
      borderRadius: 6,
      padding: 12,
      display: "flex",
      flexDirection: "column",
      gap: 12,
      minWidth: 0,
    }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <div style={{ fontSize: 10, color: C.accent, fontFamily: FONT, letterSpacing: 1.2, fontWeight: 700 }}>
          {section.question}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div style={{ fontSize: 12, color: C.text, fontFamily: FONT, fontWeight: 700, minWidth: 0 }}>
            {section.title}
          </div>
          <div style={{ fontSize: 10, color: C.muted, fontFamily: FONT, flex: "1 1 260px", minWidth: 0 }}>
            {section.method}
          </div>
        </div>
      </div>
      {children}
    </section>
  );
}

export function MiniLineChart({ title, ariaTitle, points, color, yLabel, formatY = v => formatNumber(v) }) {
  const { C, FONT } = useTheme();
  const [tip, setTip] = useState(null);
  if (!points || points.length < 2) return null;
  const accessibleName = ariaTitle ?? title;
  const maxY = Math.max(...points.map(p => p.value), 1);
  const minY = Math.min(...points.map(p => p.value), 0);
  const maxT = points[points.length - 1].t || 1;
  const minT = points[0].t || 0;
  const PAD = { top: 14, right: 16, bottom: 38, left: 46 };
  const w = CHART_W - PAD.left - PAD.right;
  const h = CHART_H - PAD.top - PAD.bottom;
  const tSpan = Math.max(maxT - minT, 1);
  const ySpan = Math.max(maxY - minY, 1);
  const toX = t => PAD.left + ((t - minT) / tSpan) * w;
  const toY = v => PAD.top + h - ((v - minY) / ySpan) * h;
  const linePts = points.map(p => `${toX(p.t).toFixed(1)},${toY(p.value).toFixed(1)}`).join(" ");
  const fillPts = [
    ...points.map(p => `${toX(p.t).toFixed(1)},${toY(p.value).toFixed(1)}`),
    `${toX(maxT)},${PAD.top + h}`, `${PAD.left},${PAD.top + h}`,
  ].join(" ");
  const yTicks = [minY, minY + ySpan / 2, maxY];
  const xTicks = [minT, minT + tSpan / 2, maxT];
  const lastPoint = points[points.length - 1];
  const peakPoint = points.reduce((best, point) => Number(point.value) > Number(best.value) ? point : best, points[0]);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {title && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 11, color, fontFamily: FONT, fontWeight: 700 }}>{title}</span>
          <span style={{ fontSize: 9, color: C.muted, fontFamily: FONT }}>{yLabel} · latest {formatY(lastPoint.value)} · peak {formatY(peakPoint.value)}</span>
        </div>
      )}
      <svg width={CHART_W} height={CHART_H} style={{ display: "block", width: "100%", minWidth: 0, minHeight: 110 }}
        viewBox={`0 0 ${CHART_W} ${CHART_H}`} preserveAspectRatio="xMidYMid meet" role="img" aria-label={`${accessibleName} ${yLabel} trend chart`}
        onMouseLeave={() => setTip(null)}>
        {/* Horizontal grid lines only — no vertical lines */}
        {yTicks.map((t, i) => {
          const y = toY(t);
          return (
            <g key={`${t}-${i}`}>
              <line x1={PAD.left} y1={y} x2={PAD.left + w} y2={y}
                stroke={C.chartGrid} strokeWidth={1} />
              <text x={PAD.left - 4} y={y + 4} textAnchor="end" fontSize={11}
                fill={C.muted} fontFamily="monospace">{formatY(t)}</text>
            </g>
          );
        })}
        {/* X axis tick labels (no vertical grid lines) */}
        {xTicks.map((t, i) => (
          <text key={`xl-${i}`} x={toX(t)} y={CHART_H - 22} textAnchor="middle" fontSize={11}
            fill={C.muted} fontFamily="monospace">{formatNumber(t, 0)}</text>
        ))}
        <polygon points={fillPts} fill={color} fillOpacity={0.12} />
        <polyline points={linePts} fill="none" stroke={color} strokeWidth={2.5}
          strokeLinejoin="round" strokeLinecap="round" />
        {/* Invisible hit targets on each data point for tooltip */}
        {points.map((p, i) => (
          <circle key={i} cx={toX(p.t)} cy={toY(p.value)} r={5} fill="transparent"
            style={{ cursor: "crosshair" }}
            onMouseEnter={() => setTip({ x: toX(p.t), y: toY(p.value), label: `t = ${formatNumber(p.t)}`, value: `${yLabel}: ${formatY(p.value)}` })} />
        ))}
        <circle cx={toX(lastPoint.t)} cy={toY(lastPoint.value)} r={3} fill={color} stroke={C.bg} strokeWidth={1.5} style={{ pointerEvents: "none" }} />
        <circle cx={toX(peakPoint.t)} cy={toY(peakPoint.value)} r={3} fill={C.amber} stroke={C.bg} strokeWidth={1.5} style={{ pointerEvents: "none" }} />
        <text x={PAD.left + w / 2} y={CHART_H - 7} textAnchor="middle" fontSize={11}
          fill={C.muted} fontFamily="monospace">simulation time</text>
        <text x={11} y={PAD.top + h / 2} textAnchor="middle" fontSize={11}
          fill={C.muted} fontFamily="monospace" transform={`rotate(-90 11 ${PAD.top + h / 2})`}>{yLabel}</text>
        {tip && (() => {
          const TW = 130, TH = 36, TX = Math.min(Math.max(tip.x - TW/2, PAD.left), PAD.left + w - TW), TY = Math.max(tip.y - TH - 8, PAD.top);
          return (
            <g style={{ pointerEvents: "none" }}>
              <rect x={TX} y={TY} width={TW} height={TH} rx={4} fill={C.panel} stroke={C.accent} strokeWidth={1} opacity={0.97} />
              <text x={TX + TW/2} y={TY + 13} textAnchor="middle" fill={C.muted} fontSize={9} fontFamily={FONT}>{tip.label}</text>
              <text x={TX + TW/2} y={TY + 27} textAnchor="middle" fill={C.text} fontSize={10} fontFamily={FONT} fontWeight={700}>{tip.value}</text>
            </g>
          );
        })()}
      </svg>
      <div aria-label={`${accessibleName} chart legend`} style={{ display: "flex", gap: 10, flexWrap: "wrap", fontFamily: FONT, fontSize: 9, color: C.muted }}>
        <span><span aria-hidden="true" style={{ color }}>●</span> latest t={formatNumber(lastPoint.t)}</span>
        <span><span aria-hidden="true" style={{ color: C.amber }}>●</span> peak t={formatNumber(peakPoint.t)}</span>
      </div>
    </div>
  );
}

// Multi-line sibling of MiniLineChart — one polyline per attribute value
// (e.g. tier=gold, tier=silver), sharing a single time/value scale so the
// lines are directly comparable. Used by the "wait by arrival time, by
// attribute" section, where MiniLineChart's single-series shape doesn't fit.
function CollapsibleRunDetails({ label, children, C, FONT }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        style={{
          background: "none", border: "none", cursor: "pointer", padding: 0,
          display: "flex", alignItems: "center", gap: 6, marginBottom: 8,
          fontFamily: FONT, fontSize: 10, color: C.cEvent, letterSpacing: 1.2, fontWeight: 700,
        }}
      >
        <span style={{ display: "inline-block", transform: open ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 160ms ease", fontSize: 9 }}>▶</span>
        {label}
      </button>
      {open && children}
    </div>
  );
}

export function ResultsAnalysisPanel({ results, replicationResults = [], warmupDetection = null }) {
  const { C, FONT } = useTheme();
  const [batchMetric, setBatchMetric] = useState("summary.avgWait");
  const [batchResult, setBatchResult] = useState(null);
  const replications = useMemo(
    () => normaliseReplicationResults(replicationResults, results),
    [replicationResults, results]
  );
  const extractValues = path => replications
    .map(row => getPathValue(row, path))
    .filter(Number.isFinite);
  const runBatchMeans = () => {
    const values = extractValues(batchMetric);
    if (values.length < 2) return;
    setBatchResult(batchMeansCI(values));
  };
  const summaryStats = useMemo(() => {
    const values = replications
      .map(row => getPathValue(row, "summary.avgWait"))
      .filter(Number.isFinite);
    if (values.length < 3) return null;
    return {
      avgWait: computeSummaryStats(values),
      percentiles: computePercentiles(values, [50, 90, 95]),
    };
  }, [replications]);
  const hasAnalysisInputs = replications.length > 0 || (warmupDetection?.series || []).length > 0 || results?.aggregateStats;

  if (!hasAnalysisInputs) {
    return (
      <ChartSectionShell section={{
        question: "How reliable are these outputs?",
        title: "How reliable are these results?",
        method: "Run repeated versions of the same scenario to judge how stable the answer is.",
      }}>
        <div style={{ fontSize: 12, color: C.muted, fontFamily: FONT, lineHeight: 1.7 }}>
          Reliability guidance will appear here once the results include repeated runs or warm-up data.
        </div>
      </ChartSectionShell>
    );
  }

  const reliabilityVerdict = replications.length < 2
    ? { title: "Not enough repeated runs yet", note: "Run this scenario more than once to judge how reliable the result is.", color: C.amber }
    : summaryStats?.avgWait?.isApproxNormal
      ? { title: "High confidence", note: "The repeated-run results are behaving in a stable way.", color: C.green }
      : { title: "Use with caution", note: "The repeated-run results are uneven, so it would be safer to run more repeats before making decisions.", color: C.amber };

  return (
    <ChartSectionShell section={{
      question: "Can I trust these results yet?",
      title: "How reliable are these results?",
      method: "Uses repeated runs and warm-up checks to judge whether the answer looks stable.",
    }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <div style={{ background: C.bg, border: `1px solid ${reliabilityVerdict.color}44`, borderRadius: 6, padding: 10 }}>
          <div style={{ fontSize: 11, color: reliabilityVerdict.color, fontFamily: FONT, fontWeight: 700, marginBottom: 4 }}>
            {reliabilityVerdict.title}
          </div>
          <div style={{ fontSize: 11, color: C.muted, fontFamily: FONT, lineHeight: 1.6 }}>
            {reliabilityVerdict.note}
          </div>
        </div>

        <div>
          <div style={{ fontSize: 10, color: C.amber, fontFamily: FONT, letterSpacing: 1.2, fontWeight: 700, marginBottom: 8 }}>
            START-UP CHECK
          </div>
          {warmupDetection && warmupDetection.series?.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ fontSize: 11, color: C.text, fontFamily: FONT, lineHeight: 1.6 }}>
                {warmupDetection.explanation}
              </div>
              {warmupDetection.series.length > 1 && (
                <div style={{ background: C.bg, borderRadius: 4, border: `1px solid ${C.border}`, padding: 8 }}>
                  <MiniLineChart
                    title="Ensemble average trajectory"
                    points={warmupDetection.series}
                    color={C.accent}
                    yLabel="metric"
                  />
                </div>
              )}
            </div>
          ) : (
            <div style={{ fontSize: 11, color: C.muted, fontFamily: FONT }}>
              No start-up check was recorded for this result.
            </div>
          )}
        </div>

        <div>
          <div style={{ fontSize: 10, color: C.green, fontFamily: FONT, letterSpacing: 1.2, fontWeight: 700, marginBottom: 8 }}>
            ESTIMATED RANGE FOR THE TRUE RESULT
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
            <span style={{ fontSize: 10, color: C.muted, fontFamily: FONT, whiteSpace: "nowrap" }}>Result to assess</span>
            <select
              aria-label="Batch-means metric"
              value={batchMetric}
              onChange={e => { setBatchMetric(e.target.value); setBatchResult(null); }}
              style={{ flex: 1, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 4, color: C.text, fontFamily: FONT, fontSize: 12, padding: "5px 8px", outline: "none" }}
            >
              {ANALYSIS_METRICS.map(metric => (
                <option key={metric.path} value={metric.path}>{metric.label}</option>
              ))}
            </select>
            <Btn small variant="primary" onClick={runBatchMeans} disabled={replications.length < 2}>
              Assess
            </Btn>
          </div>
          {batchResult ? (
            <div>
              <div style={{ fontSize: 11, color: C.muted, fontFamily: FONT, lineHeight: 1.8, marginBottom: 6 }}>
                This estimate groups the repeated-run results into <strong>{batchResult.batchCount}</strong> groups of size <strong>{batchResult.batchSize}</strong>.
              </div>
              <MetricStrip
                items={[
                  { label: "n used", value: batchResult.nUsed ?? batchResult.n },
                  { label: "mean", value: formatNumber(batchResult.mean), color: C.accent },
                  { label: "lower bound", value: formatNumber(batchResult.lower) },
                  { label: "upper bound", value: formatNumber(batchResult.upper) },
                  { label: "lag-1 rho", value: formatNumber(batchResult.lag1Rho), color: C.amber },
                ]}
              />
              {batchResult.discarded > 0 && (
                <div style={{ fontSize: 11, color: C.amber, fontFamily: FONT, marginTop: 6 }}>
                  {batchResult.discarded} of {batchResult.n} repeated-run result(s) didn't fill a complete group of {batchResult.batchSize} and were left out of this estimate.
                </div>
              )}
            </div>
          ) : (
            <div style={{ fontSize: 11, color: C.muted, fontFamily: FONT }}>
              {replications.length >= 2
                ? "Choose a result and assess the likely range."
                : "Run this scenario more than once to assess how reliable the result is."}
            </div>
          )}
        </div>

        {summaryStats && (
          <div>
            <div style={{ fontSize: 10, color: C.purple, fontFamily: FONT, letterSpacing: 1.2, fontWeight: 700, marginBottom: 8 }}>
              SHAPE OF REPEATED-RUN RESULTS (AVERAGE WAIT)
            </div>
            <MetricStrip
              items={[
                { label: "n", value: summaryStats.avgWait.n },
                { label: "mean", value: formatNumber(summaryStats.avgWait.mean), color: C.accent },
                { label: "stdDev", value: formatNumber(summaryStats.avgWait.stdDev) },
                { label: "skewness", value: formatNumber(summaryStats.avgWait.skewness), color: C.amber },
                { label: "kurtosis", value: formatNumber(summaryStats.avgWait.kurtosis), color: C.amber },
                { label: "p50", value: formatNumber(summaryStats.percentiles.p50), color: C.green },
                { label: "p90", value: formatNumber(summaryStats.percentiles.p90), color: C.amber },
                { label: "p95", value: formatNumber(summaryStats.percentiles.p95), color: C.red },
              ]}
            />
            <div style={{ fontSize: 11, color: C.muted, fontFamily: FONT, lineHeight: 1.8, marginTop: 8 }}>
              {summaryStats.avgWait.isApproxNormal
                ? "The repeated-run results are behaving in a stable way."
                : "The repeated-run results are uneven, so it would be safer to run more repeats before making decisions."}
            </div>
          </div>
        )}

        {replications.length >= 2 && (() => {
          const waitVals   = replications.map(r => r.result?.summary?.avgWait).filter(Number.isFinite);
          const svcVals    = replications.map(r => r.result?.summary?.avgSvc).filter(Number.isFinite);
          const servedVals = replications.map(r => r.result?.summary?.served).filter(Number.isFinite);
          const outlierWait   = detectOutliers(waitVals);
          const outlierSvc    = detectOutliers(svcVals);
          const outlierServed = detectOutliers(servedVals);
          const minWait   = waitVals.length   ? Math.min(...waitVals)   : null;
          const maxWait   = waitVals.length   ? Math.max(...waitVals)   : null;
          const minSvc    = svcVals.length    ? Math.min(...svcVals)    : null;
          const maxSvc    = svcVals.length    ? Math.max(...svcVals)    : null;
          const minServed = servedVals.length ? Math.min(...servedVals) : null;
          const maxServed = servedVals.length ? Math.max(...servedVals) : null;
          const fmt = (v, d = 1) => Number.isFinite(v) ? formatNumber(v, d) : "—";
          const cellStyle = { padding: "5px 8px", fontSize: 11, fontFamily: FONT, color: C.text };
          const hdStyle   = { ...cellStyle, color: C.muted, fontWeight: 600, borderBottom: `1px solid ${C.border}`, textAlign: "left" };
          let waitFiniteIdx = 0, svcFiniteIdx = 0, servedFiniteIdx = 0;
          return (
            <CollapsibleRunDetails label="PER-RUN BREAKDOWN" C={C} FONT={FONT}>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      <th style={hdStyle}>Rep</th>
                      <th style={hdStyle}>Seed</th>
                      <th style={hdStyle}>Served</th>
                      <th style={hdStyle}>Reneged</th>
                      <th style={hdStyle}>Avg wait</th>
                      <th style={hdStyle}>Avg service</th>
                      <th style={hdStyle}>Avg sojourn</th>
                      <th style={hdStyle}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {replications.map((row, rowIdx) => {
                      const s = row.result?.summary || {};
                      const wi  = Number.isFinite(s.avgWait)  ? waitFiniteIdx++   : -1;
                      const si  = Number.isFinite(s.avgSvc)   ? svcFiniteIdx++    : -1;
                      const sei = Number.isFinite(s.served)   ? servedFiniteIdx++ : -1;
                      const isWaitOutlier   = wi  >= 0 && outlierWait.outlierIndices.includes(wi);
                      const isSvcOutlier    = si  >= 0 && outlierSvc.outlierIndices.includes(si);
                      const isServedOutlier = sei >= 0 && outlierServed.outlierIndices.includes(sei);
                      const isOutlier = isWaitOutlier || isSvcOutlier || isServedOutlier;
                      const outlierMsg = [
                        isWaitOutlier   && `Avg wait outside fence [${fmt(outlierWait.lowerFence)}, ${fmt(outlierWait.upperFence)}]`,
                        isSvcOutlier    && `Avg service outside fence [${fmt(outlierSvc.lowerFence)}, ${fmt(outlierSvc.upperFence)}]`,
                        isServedOutlier && `Served outside fence [${fmt(outlierServed.lowerFence, 0)}, ${fmt(outlierServed.upperFence, 0)}]`,
                      ].filter(Boolean).join("; ");
                      return (
                        <tr key={row.replicationIndex ?? rowIdx} style={{ borderBottom: `1px solid ${C.border}` }}>
                          <td style={cellStyle}>{(row.replicationIndex ?? 0) + 1}</td>
                          <td style={{ ...cellStyle, color: C.amber }}>{row.seed ?? "—"}</td>
                          <td style={cellStyle}>{s.served ?? "—"}</td>
                          <td style={cellStyle}>{s.reneged ?? "—"}</td>
                          <td style={{ ...cellStyle, color: isWaitOutlier ? C.amber : C.text }}>{fmt(s.avgWait)}</td>
                          <td style={{ ...cellStyle, color: isSvcOutlier  ? C.amber : C.text }}>{fmt(s.avgSvc)}</td>
                          <td style={cellStyle}>{fmt(s.avgSojourn)}</td>
                          <td style={cellStyle}>
                            {isOutlier && <span title={outlierMsg} style={{ color: C.amber, cursor: "help" }}>⚠</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr style={{ borderTop: `2px solid ${C.border}`, color: C.muted, fontStyle: "italic" }}>
                      <td style={cellStyle} colSpan={2}>Min / Max</td>
                      <td style={cellStyle}>{minServed != null ? `${minServed} / ${maxServed}` : "—"}</td>
                      <td style={cellStyle}>—</td>
                      <td style={cellStyle}>{minWait != null ? `${fmt(minWait)} / ${fmt(maxWait)}` : "—"}</td>
                      <td style={cellStyle}>{minSvc  != null ? `${fmt(minSvc)} / ${fmt(maxSvc)}`   : "—"}</td>
                      <td style={cellStyle} colSpan={2}>—</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </CollapsibleRunDetails>
          );
        })()}
      </div>
    </ChartSectionShell>
  );
}

function JourneysPanel({ queueJourneys, queueNames, repCount = 1, C, FONT }) {
  const isMultiRep = repCount > 1;
  const rows = Object.entries(queueJourneys || {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15);
  if (!rows.length) return null;
  const total = rows.reduce((s, [, c]) => s + c, 0);
  const maxCount = rows[0][1];
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 10 }}>
      {rows.map(([path, count]) => {
        const segs = path.split("→");
        const pct = total > 0 ? Math.round(count / total * 100) : 0;
        const lastSeg = segs[segs.length - 1];
        const hasSink = !queueNames?.has(lastSeg);
        const sinkColor = lastSeg === "Incomplete" ? C.amber : C.accent;
        return (
          <div key={path} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6, padding: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap", marginBottom: 6 }}>
              {segs.map((q, i) => {
                const isSink = hasSink && i === segs.length - 1;
                return (
                  <Fragment key={i}>
                    {i > 0 && <span style={{ color: C.muted, fontSize: 9 }}>→</span>}
                    <span style={{
                      fontFamily: FONT, fontSize: 10,
                      color: isSink ? sinkColor : C.text,
                      background: isSink ? `${sinkColor}18` : C.bg,
                      border: `1px ${isSink ? "dashed" : "solid"} ${isSink ? sinkColor : C.border}`,
                      borderRadius: 3, padding: "1px 5px",
                    }}>{q}</span>
                  </Fragment>
                );
              })}
            </div>
            <div style={{ height: 3, background: C.border, borderRadius: 2, marginBottom: 4 }}>
              <div style={{ height: 3, width: `${(count / maxCount) * 100}%`, background: C.accent, borderRadius: 2 }} />
            </div>
            <div>
              <span style={{ fontFamily: FONT, fontSize: 11, color: C.text, fontWeight: 600 }}>{Math.round(isMultiRep ? count / repCount : count)} ({pct}%)</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function SectionResultsPanel({ sectionsDef, sectionStats, journeys, waitDist, perQueue, queues, repCount = 1, C, FONT }) {
  const queueNameById = {};
  for (const q of queues || []) { if (q.id && q.name) queueNameById[q.id] = q.name; }
  const sectionById = {};
  for (const s of sectionsDef || []) sectionById[s.id] = s;

  // waitDist/perQueue keys come from engine scripts (case may differ from q.name) — normalise for lookup
  const waitDistNorm = {};
  for (const [k, v] of Object.entries(waitDist || {})) waitDistNorm[k.trim().toLowerCase()] = v;
  const perQueueNorm = {};
  for (const [k, v] of Object.entries(perQueue || {})) perQueueNorm[k.trim().toLowerCase()] = v;

  const fmtT = v => v == null ? "—" : formatNumber(v, 1);

  const isMultiRep = repCount > 1;
  const fmtCount = (n) => String(Math.round(isMultiRep ? n / repCount : n));

  const [queueOpen, setQueueOpen] = useState({});
  const toggleQueue = id => setQueueOpen(prev => ({ ...prev, [id]: !prev[id] }));

  const journeyRows = Object.entries(journeys || {})
    .sort((a, b) => b[1] - a[1])
    .map(([key, count]) => {
      const label = key.split("→")
        .map(id => sectionById[id]?.name || id)
        .join(" → ");
      return { key, label, count };
    });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
      {(sectionsDef || []).map(sec => {
        const stats = sectionStats?.[sec.id];
        if (!stats) return null;
        const memberQueueRows = (sec.memberIds || [])
          .map(id => {
            const name = queueNameById[id];
            const dist = name && waitDistNorm[name.trim().toLowerCase()];
            const rejection = name && perQueueNorm[name.trim().toLowerCase()];
            return dist ? { name, dist, rejection } : null;
          })
          .filter(Boolean);
        const showRejectionCols = memberQueueRows.some(({ rejection }) =>
          (rejection?.balkCount || 0) > 0 || (rejection?.blockingCount || 0) > 0
        );
        const terminalCount = Object.entries(journeys || {}).reduce((sum, [key, n]) => {
          const parts = key.split("→");
          const lastPart = parts[parts.length - 1];
          const isSink = !sectionById[lastPart];
          return (isSink && lastPart !== "Incomplete" && parts[parts.length - 2] === sec.id) ? sum + n : sum;
        }, 0);
        const incompleteCount = Object.entries(journeys || {}).reduce((sum, [key, n]) => {
          const parts = key.split("→");
          const lastPart = parts[parts.length - 1];
          return (lastPart === "Incomplete" && parts[parts.length - 2] === sec.id) ? sum + n : sum;
        }, 0);
        const isQueueOpen = !!queueOpen[sec.id];
        return (
          <div key={sec.id} style={{
            background: C.surface,
            border: `1px solid ${sec.color}33`,
            borderLeft: `3px solid ${sec.color}`,
            borderRadius: 6,
            padding: "10px 12px",
            display: "flex", flexDirection: "column", gap: 8,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <div style={{ width: 10, height: 10, borderRadius: "50%", background: sec.color, flexShrink: 0 }} />
              <span style={{ fontFamily: FONT, fontSize: 12, fontWeight: 700, color: C.text, flex: 1 }}>
                {sec.name || sec.id}
              </span>
            </div>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <div style={{ background: `${sec.color}18`, border: `1px solid ${sec.color}44`, borderRadius: 4, padding: "4px 8px", display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 1 }}>
                <span style={{ fontFamily: FONT, fontSize: 8, color: C.muted, letterSpacing: 0.8, fontWeight: 700 }}>VISITED</span>
                <span style={{ fontFamily: FONT, fontSize: 12, color: C.text, fontWeight: 700 }}>{fmtCount(stats.count)}</span>
              </div>
              <div style={{ background: `${sec.color}18`, border: `1px solid ${sec.color}44`, borderRadius: 4, padding: "4px 8px", display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 1 }}>
                <span style={{ fontFamily: FONT, fontSize: 8, color: C.muted, letterSpacing: 0.8, fontWeight: 700 }}>AVG TIME IN SECTION</span>
                <span style={{ fontFamily: FONT, fontSize: 12, color: C.text, fontWeight: 700 }}>{fmtT(stats.avgSojourn)}</span>
              </div>
              {terminalCount > 0 && (
                <div style={{ background: `${C.accent}18`, border: `1px solid ${C.accent}44`, borderRadius: 4, padding: "4px 8px", display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 1 }}>
                  <span style={{ fontFamily: FONT, fontSize: 8, color: C.muted, letterSpacing: 0.8, fontWeight: 700 }}>DONE</span>
                  <span style={{ fontFamily: FONT, fontSize: 12, color: C.accent, fontWeight: 700 }}>{fmtCount(terminalCount)}</span>
                </div>
              )}
              {incompleteCount > 0 && (
                <div style={{ background: `${C.amber}18`, border: `1px solid ${C.amber}44`, borderRadius: 4, padding: "4px 8px", display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 1 }}>
                  <span style={{ fontFamily: FONT, fontSize: 8, color: C.muted, letterSpacing: 0.8, fontWeight: 700 }}>IN SYST.</span>
                  <span style={{ fontFamily: FONT, fontSize: 12, color: C.amber, fontWeight: 700 }}>{fmtCount(incompleteCount)}</span>
                </div>
              )}
            </div>

            {memberQueueRows.length > 0 && (
              <div>
                <div
                  onClick={() => toggleQueue(sec.id)}
                  style={{ cursor: "pointer", display: "flex", alignItems: "center", gap: 4, fontFamily: FONT, fontSize: 9, color: C.muted, letterSpacing: 1, fontWeight: 700, marginBottom: isQueueOpen ? 4 : 0, userSelect: "none" }}
                >
                  <span style={{ fontSize: 8 }}>{isQueueOpen ? "▾" : "▸"}</span>
                  QUEUE WAIT TIMES
                </div>
                {isQueueOpen && (
                  <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: FONT, fontSize: 11 }}>
                    <thead>
                      <tr>
                        <th style={{ textAlign: "left", color: C.muted, fontWeight: 600, fontSize: 9, letterSpacing: 0.6, paddingBottom: 3, borderBottom: `1px solid ${C.border}` }}>Queue</th>
                        {["Mean", "P50", "P95"].map(h => (
                          <th key={h} style={{ textAlign: "right", width: 48, minWidth: 48, color: C.muted, fontWeight: 600, fontSize: 9, letterSpacing: 0.6, paddingBottom: 3, paddingLeft: 12, borderBottom: `1px solid ${C.border}` }}>{h}</th>
                        ))}
                        {showRejectionCols && ["Balked", "Blocked"].map(h => (
                          <th key={h} style={{ textAlign: "right", width: 48, minWidth: 48, color: C.muted, fontWeight: 600, fontSize: 9, letterSpacing: 0.6, paddingBottom: 3, paddingLeft: 12, borderBottom: `1px solid ${C.border}` }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {memberQueueRows.map(({ name, dist, rejection }) => (
                        <tr key={name}>
                          <td style={{ color: C.text, paddingTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</td>
                          <td style={{ color: C.text, textAlign: "right", paddingTop: 3, paddingLeft: 12, width: 48 }}>{fmtT(dist.mean)}</td>
                          <td style={{ color: C.text, textAlign: "right", paddingTop: 3, paddingLeft: 12, width: 48 }}>{fmtT(dist.p50)}</td>
                          <td style={{ color: C.text, textAlign: "right", paddingTop: 3, paddingLeft: 12, width: 48 }}>{fmtT(dist.p95)}</td>
                          {showRejectionCols && (
                            <>
                              <td style={{ color: C.text, textAlign: "right", paddingTop: 3, paddingLeft: 12, width: 48 }}>{rejection?.balkCount ? fmtCount(rejection.balkCount) : "—"}</td>
                              <td style={{ color: C.text, textAlign: "right", paddingTop: 3, paddingLeft: 12, width: 48 }}>{rejection?.blockingCount ? fmtCount(rejection.blockingCount) : "—"}</td>
                            </>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </div>
        );
      })}
      </div>

      {journeyRows.length > 0 && (() => {
        const visibleRows = journeyRows.slice(0, 15);
        const total = visibleRows.reduce((s, r) => s + r.count, 0);
        const maxCount = visibleRows[0].count;
        return (
          <div style={{ marginTop: 4 }}>
            <div style={{ fontFamily: FONT, fontSize: 9, color: C.muted, letterSpacing: 1, fontWeight: 700, marginBottom: 6 }}>ENTITY PATHWAYS ACROSS SECTIONS</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 10 }}>
              {visibleRows.map(({ key, count }) => {
                const rawParts = key.split("→");
                const names = rawParts.map(id => sectionById[id]?.name || id);
                const pct = total > 0 ? Math.round(count / total * 100) : 0;
                const lastRaw = rawParts[rawParts.length - 1];
                const hasSink = !sectionById[lastRaw];
                const sinkColor = lastRaw === "Incomplete" ? C.amber : C.accent;
                return (
                  <div key={key} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6, padding: 10 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap", marginBottom: 6 }}>
                      {names.map((name, i) => {
                        const isSink = hasSink && i === names.length - 1;
                        return (
                          <Fragment key={i}>
                            {i > 0 && <span style={{ color: C.muted, fontSize: 9 }}>→</span>}
                            <span style={{
                              fontFamily: FONT, fontSize: 10,
                              color: isSink ? sinkColor : C.text,
                              background: isSink ? `${sinkColor}18` : C.bg,
                              border: `1px ${isSink ? "dashed" : "solid"} ${isSink ? sinkColor : C.border}`,
                              borderRadius: 3, padding: "1px 5px",
                            }}>{name}</span>
                          </Fragment>
                        );
                      })}
                    </div>
                    <div style={{ height: 3, background: C.border, borderRadius: 2, marginBottom: 4 }}>
                      <div style={{ height: 3, width: `${(count / maxCount) * 100}%`, background: C.accent, borderRadius: 2 }} />
                    </div>
                    <div>
                      <span style={{ fontFamily: FONT, fontSize: 11, color: C.text, fontWeight: 600 }}>{Math.round(isMultiRep ? count / repCount : count)} ({pct}%)</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}
    </div>
  );
}

export function ResultsWorkspace({ results, model, replicationResults = [], warmupDetection = null }) {
  const { C, FONT } = useTheme();
  const CHART_COLORS = [C.accent, C.bEvent, C.purple, C.green, C.red, C.server];
  const [sectionsOpen, setSectionsOpen] = useState(() => {
    try {
      const stored = JSON.parse(localStorage.getItem("des.results.sections") || "null");
      if (stored && typeof stored === "object") return { ...SECTION_DEFAULTS, ...stored };
    } catch {}
    return { ...SECTION_DEFAULTS };
  });
  const [activeSectionIds, setActiveSectionIds] = useState([]);

  const toggleSection = id => setSectionsOpen(prev => {
    const next = { ...prev, [id]: !prev[id] };
    try { localStorage.setItem("des.results.sections", JSON.stringify(next)); } catch {}
    return next;
  });

  const chartModel = useMemo(() => buildResultsViewModel(results, model, { activeSectionIds }), [results, model, activeSectionIds]);
  const healthFlags = useMemo(() => evaluateResultsHealth(results, model), [results, model]);

  const handleExportLLMBundle = useCallback(() => {
    const expConfig = results?._experiment_config || {};
    const config = {
      engineVersion: results?._engine_version,
      prngAlgorithm: results?._prng_algorithm,
      baseSeed: results?._base_seed,
      replications: expConfig.replications,
      maxSimTime: expConfig.maxSimTime,
      warmupPeriod: expConfig.warmupPeriod,
      seed: expConfig.seed,
    };
    const bundleResults = {
      ...results,
      aggregateStats: results?.aggregateStats || {},
      replications: replicationResults.map(p => ({
        replicationIndex: p.replicationIndex,
        seed: p.seed,
        summary: p.result?.summary ?? p.summary ?? {},
      })),
    };
    const filename = `simmodlr-llm-bundle-${slugifyResultName(model?.name || 'model')}-${timestampForFilename()}.md`;
    downloadTextFile(buildLLMBundle(model, bundleResults, config), filename, "text/markdown;charset=utf-8");
  }, [model, results, replicationResults]);
  const queueSection = chartModel.chartSections.find(section => section.id === "queue-depth");
  const serverSection = chartModel.chartSections.find(section => section.id === "server-utilization");
  const waitSection = chartModel.chartSections.find(section => section.id === "wait-distribution");
  const waitTimeSection = chartModel.chartSections.find(section => section.id === "wait-over-time");
  const waitByArrivalSection = chartModel.chartSections.find(section => section.id === "wait-by-arrival-attr");
  const wipSection = chartModel.chartSections.find(section => section.id === "system-wip");
  const throughputSection = chartModel.chartSections.find(section => section.id === "system-throughput");
  const systemSojournSection = chartModel.chartSections.find(section => section.id === "system-sojourn");
  const hasWaitDistributions = (waitSection?.distributions || []).length > 0;
  const hasWaitTimeSeries = (waitTimeSection?.series || []).length > 0;
  const hasWaitByArrival = (waitByArrivalSection?.series || []).length > 0;
  const hasWip = (wipSection?.series || []).length > 0;
  const hasThroughput = (throughputSection?.series || []).length > 0;
  const hasSystemSojourn = (systemSojournSection?.distributions || []).length > 0;
  const queuePeaks = Array.isArray(chartModel.runtimeMetrics?.metrics?.maxQueueLengthByQueue)
    ? chartModel.runtimeMetrics.metrics.maxQueueLengthByQueue
    : [];
  const analysisInputs = normaliseReplicationResults(replicationResults, results);
  const hasAnalysisInputs = analysisInputs.length > 0 || (warmupDetection?.series || []).length > 0 || results?.aggregateStats;

  const sectionStats = results?.summary?.sections;
  const sectionJourneys = results?.summary?.journeys;
  const hasSectionResults = !!(model?.sections?.length && sectionStats);
  const queueJourneys = results?.summary?.queueJourneys;
  const hasQueueJourneys = !!queueJourneys && Object.keys(queueJourneys).length > 0;

  // Replication count for avg-per-run display in sections and journey panels
  const storedRepCountRW = Array.isArray(results?.replications)
    ? results.replications.length
    : (typeof results?.replications === 'number' && results.replications > 1 ? results.replications : null);
  const repCountRW = replicationResults.length > 0
    ? replicationResults.length
    : (results?.summary?.numReplications ?? results?.runtimeMetrics?.replications ?? storedRepCountRW ?? 1);

  // ── Shared responsive grid style used by all three chart sections ───────────
  const CHART_GRID = {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 320px), 1fr))",
    gap: 16,
    minWidth: 0,
  };

  if (!chartModel.hasTimeSeries && !hasWaitDistributions && !hasAnalysisInputs) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
        <KeyFindingsBanner healthFlags={healthFlags} C={C} FONT={FONT} />
        <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
          <SectionHeader id="summary" label="Results Summary" isOpen={sectionsOpen.summary} onToggle={toggleSection} />
          <div id="results-section-summary" style={{ display: sectionsOpen.summary ? "block" : "none", paddingTop: 14 }}>
            <SummaryCardGrid results={results} replicationResults={replicationResults} model={model} />
          </div>
        </div>
        {queuePeaks.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
            <SectionHeader id="bottlenecks" label="Queue Analysis" isOpen={sectionsOpen.bottlenecks} onToggle={toggleSection} />
            <div id="results-section-bottlenecks" style={{ display: sectionsOpen.bottlenecks ? "flex" : "none", flexDirection: "column", gap: 6, paddingTop: 14 }}>
              <div style={{ fontSize: 9, color: C.muted, fontFamily: FONT, letterSpacing: 1, fontWeight: 700 }}>
                PEAK QUEUE LENGTH BY QUEUE
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))", gap: 6 }}>
                {queuePeaks.map(entry => {
                  const high = entry.depth > 20;
                  return (
                    <div key={entry.queueName} style={{
                      background: C.bg,
                      border: `1px solid ${high ? alpha(C.amber, 0.35) : C.border}`,
                      borderRadius: 6,
                      padding: "7px 10px",
                    }}>
                      <div style={{ fontSize: 9, color: C.muted, fontFamily: FONT, marginBottom: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {entry.queueName}
                      </div>
                      <div style={{ fontSize: 17, color: high ? C.amber : C.text, fontFamily: FONT, fontWeight: 700, lineHeight: 1 }}>
                        {formatNumber(entry.depth, 0)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
        {hasSectionResults && (
          <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
            <SectionHeader id="sections" label="Sections" isOpen={sectionsOpen.sections} onToggle={toggleSection} />
            <div id="results-section-sections" style={{ display: sectionsOpen.sections ? "block" : "none", paddingTop: 14 }}>
              <SectionResultsPanel
                sectionsDef={model.sections}
                sectionStats={sectionStats}
                journeys={sectionJourneys}
                waitDist={results.waitDist}
                perQueue={results.perQueue}
                queues={model.queues}
                repCount={repCountRW}
                C={C}
                FONT={FONT}
              />
            </div>
          </div>
        )}
        {hasQueueJourneys && (
          <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
            <SectionHeader id="journeys" label="Entity Journeys" isOpen={sectionsOpen.journeys} onToggle={toggleSection} />
            <div id="results-section-journeys" style={{ display: sectionsOpen.journeys ? "block" : "none", paddingTop: 14 }}>
              <div style={{ fontSize: 11, color: C.muted, fontFamily: FONT, lineHeight: 1.6, marginBottom: 10 }}>
                Top queue paths taken by entities through the model, ranked by frequency.
                Named sinks show the completion event; <strong style={{ color: C.reneged }}>Reneged</strong> entities left before finishing;
                <strong style={{ color: C.amber }}> Incomplete</strong> entities were still in the system when the simulation ended.
              </div>
              <JourneysPanel queueJourneys={queueJourneys} queueNames={new Set((model.queues || []).map(q => q.name))} repCount={repCountRW} C={C} FONT={FONT} />
            </div>
          </div>
        )}
        <div style={{ color: C.muted, fontFamily: FONT, fontSize: 12, padding: 8 }}>
          Turn on <strong style={{ color: C.accent }}>Keep chart data during the run</strong> in Run setup, then run the model to see charts.
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
          <SectionHeader id="runtime" label="Run Effort" isOpen={sectionsOpen.runtime} onToggle={toggleSection} />
          <div id="results-section-runtime" style={{ display: sectionsOpen.runtime ? "block" : "none", paddingTop: 14 }}>
            <RuntimeMetricsSection runtimeMetrics={chartModel.runtimeMetrics} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
      <KeyFindingsBanner healthFlags={healthFlags} C={C} FONT={FONT} />
      {/* ── 1. Headline KPIs ───────────────────────────────────────────────── */}
      <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
        <SectionHeader id="summary" label="Results Summary" isOpen={sectionsOpen.summary} onToggle={toggleSection} />
        <div id="results-section-summary" style={{ display: sectionsOpen.summary ? "block" : "none", paddingTop: 14 }}>
          <SummaryCardGrid results={results} replicationResults={replicationResults} model={model} />
          </div>
        </div>

      {/* ── 1b. System-level trends — whole-system charts, not queue/resource-specific ── */}
      {(hasWaitByArrival || hasWip || hasThroughput || hasSystemSojourn) && (
        <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
          <SectionHeader id="systemTrends" label="System-Level Trends" isOpen={sectionsOpen.systemTrends} onToggle={toggleSection} />
          <div id="results-section-systemTrends" style={{ display: sectionsOpen.systemTrends ? "block" : "none", paddingTop: 10, paddingBottom: 14 }}>
            <ChartSectionShell section={{
              question: "How is the system behaving as a whole?",
              title: "System-level trends",
              method: "Whole-system measures — not scoped to a single queue or resource.",
            }}>
              <div aria-label="System trends chart grid" style={CHART_GRID}>
                {hasWip && wipSection.series.map((series, idx) => {
                  const color = CHART_COLORS[idx % CHART_COLORS.length];
                  return (
                    <ChartCard
                      key={series.id}
                      title={series.label}
                      color={color}
                      sourceLabel={series.sourceLabel}
                      statItems={lineSeriesStats(series, "entities", color)}
                      dataPreview={<SeriesDataPreview series={series} />}
                    >
                      <MiniLineChart title="" ariaTitle={series.label} points={series.chartPoints || series.points} color={color} yLabel="entities" />
                    </ChartCard>
                  );
                })}
                {hasThroughput && throughputSection.series.map((series, idx) => {
                  const color = CHART_COLORS[(idx + 1) % CHART_COLORS.length];
                  return (
                    <ChartCard
                      key={series.id}
                      title={series.label}
                      color={color}
                      sourceLabel={series.sourceLabel}
                      statItems={lineSeriesStats(series, "completions", color)}
                      dataPreview={<SeriesDataPreview series={series} />}
                    >
                      <MiniLineChart title="" ariaTitle={series.label} points={series.chartPoints || series.points} color={color} yLabel="completions" />
                    </ChartCard>
                  );
                })}
                {hasWaitByArrival && (() => {
                  const waitByArrivalSeries = { id: "wait-by-arrival", label: "Total wait vs. arrival time", points: waitByArrivalSection.series };
                  return (
                    <ChartCard
                      title="Total wait vs. arrival time"
                      color={C.purple}
                      statItems={lineSeriesStats(waitByArrivalSeries, "total wait", C.purple)}
                      dataPreview={<SeriesDataPreview series={waitByArrivalSeries} />}
                    >
                      <MiniLineChart
                        title=""
                        ariaTitle="Wait by arrival time"
                        points={waitByArrivalSection.series}
                        color={C.purple}
                        yLabel="total wait"
                      />
                    </ChartCard>
                  );
                })()}
                {hasSystemSojourn && systemSojournSection.distributions.map((dist, idx) => {
                  const color = CHART_COLORS[(idx + 2) % CHART_COLORS.length];
                  return (
                    <ChartCard
                      key={dist.label}
                      title={dist.label}
                      color={color}
                      sourceLabel={dist.sourceLabel}
                      dataPreview={<WaitValuesPreview dist={dist} />}
                    >
                      <WaitHistogram dist={dist} color={color} />
                    </ChartCard>
                  );
                })}
              </div>
            </ChartSectionShell>
          </div>
        </div>
      )}

        {/* ── Section filter ──────────────────────────────────────────────── */}
        {model?.sections?.length > 0 && (
          <div style={{ padding: "4px 0 8px 0" }}>
            <SectionFilterTabs sections={model.sections} activeIds={activeSectionIds} onToggle={setActiveSectionIds} />
          </div>
        )}

        {/* ── 2. Bottleneck section — header + nested collapsible charts ─────── */}
      {(chartModel.hasTimeSeries || hasWaitDistributions || queuePeaks.length > 0) && (
        <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
          <SectionHeader id="bottlenecks" label="Where Are the Bottlenecks?" isOpen={sectionsOpen.bottlenecks} onToggle={toggleSection} />
          <div id="results-section-bottlenecks" style={{ display: sectionsOpen.bottlenecks ? "flex" : "none", flexDirection: "column", gap: 0, paddingTop: 8 }}>

            {/* 1. Server utilisation — which resources are saturated? */}
            {chartModel.hasTimeSeries && serverSection?.series.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                <SectionHeader id="serverUtil" label="How busy are resources?" isOpen={sectionsOpen.serverUtil} onToggle={toggleSection} />
                <div id="results-section-serverUtil" style={{ display: sectionsOpen.serverUtil ? "block" : "none", paddingTop: 10, paddingBottom: 14 }}>
                  <ChartSectionShell section={serverSection}>
                    <div aria-label="Server utilisation chart grid" style={CHART_GRID}>
                      {serverSection.series.map((series, idx) => {
                        const color = CHART_COLORS[(idx + 3) % CHART_COLORS.length];
                        const fmtPct = v => `${Math.round(v ?? 0)}%`;
                        return (
                          <ChartCard
                            key={series.id}
                            title={series.label}
                            color={color}
                            sourceLabel={series.sourceLabel}
                            statItems={lineSeriesStats(series, "% busy", color, fmtPct)}
                            dataPreview={<SeriesDataPreview series={series} />}
                          >
                            <MiniLineChart title="" ariaTitle={series.label} points={series.points} color={color} yLabel="% busy" formatY={fmtPct} />
                            {seriesHasVariation(series.capacitySeries) && (
                              <MiniLineChart title="Resources available over time" ariaTitle={`${series.label} capacity`} points={series.capacitySeries} color={C.muted} yLabel="servers" />
                            )}
                          </ChartCard>
                        );
                      })}
                    </div>
                  </ChartSectionShell>
                </div>
              </div>
            )}

            {/* 2. Peak queue tiles + queue depth over time — how deep did they get? */}
            {queuePeaks.length > 0 && (
              <div aria-label="Peak queue lengths" style={{ display: "flex", flexDirection: "column", gap: 6, paddingTop: 10, paddingBottom: 14 }}>
                <div style={{ fontSize: 9, color: C.muted, fontFamily: FONT, letterSpacing: 1, fontWeight: 700 }}>
                  PEAK QUEUE LENGTH BY QUEUE
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))", gap: 6 }}>
                  {queuePeaks.map(entry => {
                    const high = entry.depth > 20;
                    return (
                      <div key={entry.queueName} style={{
                        background: C.bg,
                        border: `1px solid ${high ? alpha(C.amber, 0.35) : C.border}`,
                        borderRadius: 6,
                        padding: "7px 10px",
                      }}>
                        <div style={{ fontSize: 9, color: C.muted, fontFamily: FONT, marginBottom: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {entry.queueName}
                        </div>
                        <div style={{ fontSize: 17, color: high ? C.amber : C.text, fontFamily: FONT, fontWeight: 700, lineHeight: 1 }}>
                          {formatNumber(entry.depth, 0)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {chartModel.hasTimeSeries && queueSection?.series.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                <SectionHeader id="queueDepth" label="Queue depth over time" isOpen={sectionsOpen.queueDepth} onToggle={toggleSection} />
                <div id="results-section-queueDepth" style={{ display: sectionsOpen.queueDepth ? "block" : "none", paddingTop: 10, paddingBottom: 14 }}>
                  <ChartSectionShell section={queueSection}>
                    <div aria-label="Queue depth chart grid" style={CHART_GRID}>
                      {queueSection.series.map((series, idx) => {
                        const color = CHART_COLORS[idx % CHART_COLORS.length];
                        const title = series.source === "type-fallback"
                          ? `${series.label} (type-level)`
                          : series.label;
                        return (
                          <ChartCard
                            key={series.id}
                            title={title}
                            color={color}
                            sourceLabel={series.sourceLabel}
                            statItems={lineSeriesStats(series, "depth", color)}
                            dataPreview={<SeriesDataPreview series={series} />}
                          >
                            <MiniLineChart title="" ariaTitle={title} points={series.points} color={color} yLabel="depth" />
                          </ChartCard>
                        );
                      })}
                    </div>
                  </ChartSectionShell>
                </div>
              </div>
            )}

            {/* 3. Wait-time distributions — what did entities experience? */}
            {hasWaitDistributions && (
              <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                <SectionHeader id="waitDist" label="How much time is spent queueing?" isOpen={sectionsOpen.waitDist} onToggle={toggleSection} />
                <div id="results-section-waitDist" style={{ display: sectionsOpen.waitDist ? "block" : "none", paddingTop: 10, paddingBottom: 14 }}>
                  <ChartSectionShell section={waitSection}>
                    <div aria-label="Wait-time distribution grid" style={CHART_GRID}>
                      {waitSection.distributions.map((dist, idx) => {
                        const color = CHART_COLORS[idx % CHART_COLORS.length];
                        return (
                          <ChartCard
                            key={dist.label}
                            title={dist.label}
                            color={color}
                            sourceLabel={dist.sourceLabel}
                            dataPreview={<WaitValuesPreview dist={dist} />}
                          >
                            <WaitHistogram dist={dist} color={color} />
                          </ChartCard>
                        );
                      })}
                    </div>
                  </ChartSectionShell>
                </div>
              </div>
            )}

            {chartModel.hasTimeSeries && hasWaitTimeSeries && (
              <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                <SectionHeader id="waitOverTime" label="When did waits get longer?" isOpen={sectionsOpen.waitOverTime} onToggle={toggleSection} />
                <div id="results-section-waitOverTime" style={{ display: sectionsOpen.waitOverTime ? "block" : "none", paddingTop: 10, paddingBottom: 14 }}>
                  <ChartSectionShell section={waitTimeSection}>
                    <div aria-label="Average wait over time chart grid" style={CHART_GRID}>
                      {waitTimeSection.series.map((series, idx) => {
                        const color = CHART_COLORS[idx % CHART_COLORS.length];
                        return (
                          <ChartCard
                            key={series.id}
                            title={series.label}
                            color={color}
                            sourceLabel={series.sourceLabel}
                            statItems={lineSeriesStats(series, "avg wait", color)}
                            dataPreview={<SeriesDataPreview series={series} />}
                          >
                            <MiniLineChart title="" ariaTitle={series.label} points={series.points} color={color} yLabel="avg wait" />
                          </ChartCard>
                        );
                      })}
                    </div>
                  </ChartSectionShell>
                </div>
              </div>
            )}

          </div>
        </div>
      )}

      {/* ── 3. Per-section results ─────────────────────────────────────────── */}
      {hasSectionResults && (
        <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
          <SectionHeader id="sections" label="Sections" isOpen={sectionsOpen.sections} onToggle={toggleSection} />
          <div id="results-section-sections" style={{ display: sectionsOpen.sections ? "block" : "none", paddingTop: 14 }}>
            <SectionResultsPanel
              sectionsDef={model.sections}
              sectionStats={sectionStats}
              journeys={sectionJourneys}
              waitDist={results.waitDist}
              perQueue={results.perQueue}
              queues={model.queues}
              repCount={repCountRW}
              C={C}
              FONT={FONT}
            />
          </div>
        </div>
      )}

      {/* ── 4. Entity Journeys ────────────────────────────────────────────────── */}
      {hasQueueJourneys && (
        <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
          <SectionHeader id="journeys" label="Entity Journeys" isOpen={sectionsOpen.journeys} onToggle={toggleSection} />
          <div id="results-section-journeys" style={{ display: sectionsOpen.journeys ? "block" : "none", paddingTop: 14 }}>
            <div style={{ fontSize: 11, color: C.muted, fontFamily: FONT, lineHeight: 1.6, marginBottom: 10 }}>
              Top queue paths taken by entities through the model, ranked by frequency.
              Named sinks show the completion event; <strong style={{ color: C.reneged }}>Reneged</strong> entities left before finishing;
              <strong style={{ color: C.amber }}> Incomplete</strong> entities were still in the system when the simulation ended.
            </div>
            <JourneysPanel queueJourneys={queueJourneys} queueNames={new Set((model.queues || []).map(q => q.name))} repCount={repCountRW} C={C} FONT={FONT} />
          </div>
        </div>
      )}

      {/* ── 5. Cost summary (only when model tracks costs) ──────────────────── */}
      {Number.isFinite(results?.summary?.totalCost) && results.summary.totalCost > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
          <SectionHeader id="cost" label="Cost Summary" isOpen={sectionsOpen.cost} onToggle={toggleSection} />
          <div id="results-section-cost" style={{ display: sectionsOpen.cost ? "block" : "none", paddingTop: 14 }}>
            <section aria-label="Cost summary" style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: 14, display: "flex", flexDirection: "column", gap: 10, minWidth: 0 }}>
              <StatCards items={[
                { label: "Total cost", value: formatNumber(results.summary.totalCost), color: C.accent },
                { label: "Cost / served", value: results.summary.costPerServed != null ? formatNumber(results.summary.costPerServed) : "—", color: C.amber },
                { label: "Served", value: formatNumber(results.summary.served ?? 0, 0) },
              ]} />
            </section>
          </div>
        </div>
      )}

      {/* ── 4. Reliability analysis ─────────────────────────────────────────── */}
      <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
        <SectionHeader id="analysis" label="Statistical Analysis" isOpen={sectionsOpen.analysis} onToggle={toggleSection} />
        <div id="results-section-analysis" style={{ display: sectionsOpen.analysis ? "block" : "none", paddingTop: 14 }}>
          <ResultsAnalysisPanel results={results} replicationResults={replicationResults} warmupDetection={warmupDetection} />
        </div>
      </div>

      {/* ── 5. Run effort — computational stats, least urgent for the user ───── */}
      <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
        <SectionHeader id="runtime" label="Run Effort" isOpen={sectionsOpen.runtime} onToggle={toggleSection} />
        <div id="results-section-runtime" style={{ display: sectionsOpen.runtime ? "block" : "none", paddingTop: 14 }}>
          <RuntimeMetricsSection runtimeMetrics={chartModel.runtimeMetrics} />
        </div>
      </div>
    </div>
  );
}
