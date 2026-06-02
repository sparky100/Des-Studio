import { useMemo, useState } from "react";
import { alpha } from "../shared/tokens.js";
import { Btn } from "../shared/components.jsx";
import { batchMeansCI, computePercentiles, computeSummaryStats } from "../../engine/statistics.js";
import { buildResultsViewModel } from "./resultsViewModel.js";
import { useTheme } from "../shared/ThemeContext.jsx";

const HIST_W = 360;
const HIST_H = 140;
const HIST_BINS = 20;
const CHART_W = 400;
const CHART_H = 140;

const SECTION_DEFAULTS = { summary: true, bottlenecks: true, cost: true, analysis: true, runtime: true };

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

function csvEscape(value) {
  if (value == null) return "";
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function slugify(value = "") {
  return String(value || "data")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "data";
}

function formatNumber(value, digits = 2) {
  if (!Number.isFinite(Number(value))) return "0";
  const rounded = Number(value).toFixed(digits);
  return rounded.includes(".") ? rounded.replace(/\.?0+$/, "") : rounded;
}

function formatMetricValue(value, digits = 2, suffix = "") {
  if (!Number.isFinite(Number(value))) return "—";
  return `${formatNumber(value, digits)}${suffix}`;
}

const ANALYSIS_METRICS = [
  { path: "summary.avgWait", label: "Average wait" },
  { path: "summary.avgSvc", label: "Average service time" },
  { path: "summary.avgSojourn", label: "Average time in system" },
  { path: "summary.served", label: "Customers served" },
  { path: "summary.totalCost", label: "Total cost" },
  { path: "summary.costPerServed", label: "Cost per served customer" },
];

function getPathValue(source, path) {
  const parts = path.split(".");
  let value = source?.result || source;
  for (const part of parts) value = value?.[part];
  return value;
}

function normaliseReplicationResults(replicationResults, results) {
  if (Array.isArray(replicationResults) && replicationResults.length) return replicationResults;
  if (Array.isArray(results?.replicationResults) && results.replicationResults.length) return results.replicationResults;
  if (Array.isArray(results?.replications) && results.replications.length) {
    return results.replications.map(row => ({ result: { summary: row.summary || {} }, ...row }));
  }
  return [];
}

function downloadTextFile(content, filename, type = "text/csv;charset=utf-8") {
  if (typeof document === "undefined" || typeof URL === "undefined") return;
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  try {
    link.click();
  } finally {
    link.remove();
    URL.revokeObjectURL(url);
  }
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

function SummaryCardGrid({ results, replicationResults = [] }) {
  const { C, FONT } = useTheme();
  const summary = results?.summary || {};
  // Derive replication count: prefer explicit replicationResults array length,
  // fall back to single run (1). Used to show per-run averages alongside totals.
  const repCount = replicationResults.length > 0 ? replicationResults.length : 1;
  const isMultiRep = repCount > 1;

  const totalArrived = Number(summary.total ?? summary.arrived ?? summary.totalArrived ?? 0);
  const served = Number(summary.served ?? 0);
  const reneged = Number(summary.reneged ?? summary.totalReneged ?? 0);
  const leftRate = totalArrived > 0 ? (reneged / totalArrived) * 100 : null;

  // For count metrics, compute the per-run average when running multi-rep (integer).
  const avgPerRun = (total) =>
    isMultiRep && total > 0 ? Math.round(total / repCount) : null;

  const cards = [
    {
      label: "Average wait",
      value: formatMetricValue(summary.avgWait),
      note: Number(summary.avgWait) > 0 ? "Time an entity waited before service." : "No waiting recorded.",
      color: C.amber,
    },
    {
      label: "Average time in system",
      value: formatMetricValue(summary.avgSojourn),
      note: "Total time from arrival to exit.",
      color: C.accent,
    },
    {
      label: "Customers arriving",
      value: totalArrived > 0 ? formatMetricValue(totalArrived, 0) : "—",
      avg: avgPerRun(totalArrived),
      note: totalArrived > 0
        ? isMultiRep ? `Total — avg per run across ${repCount} replications.` : "Total arrivals."
        : "No arrivals recorded.",
      color: C.text,
    },
    {
      label: "Customers served",
      value: formatMetricValue(served, 0),
      avg: avgPerRun(served),
      note: served > 0
        ? isMultiRep ? `Total — avg per run across ${repCount} replications.` : "Completed successfully."
        : "No completed entities yet.",
      color: C.served,
    },
    {
      label: "Customers who left before service",
      value: leftRate == null ? "—" : `${formatNumber(leftRate, 1)}%`,
      note: reneged > 0 ? `${reneged} left before being served.` : "No customers left early.",
      color: reneged > 0 ? C.reneged : C.green,
    },
  ];
  if (Number.isFinite(summary.totalCost) && summary.totalCost > 0) {
    cards.push({
      label: "Total cost",
      value: formatMetricValue(summary.totalCost),
      note: summary.costPerServed != null ? `About ${formatMetricValue(summary.costPerServed)} per served customer.` : "Cost captured for this run.",
      color: C.purple,
    });
  }
  const perResourceEntries = Object.entries(summary.perResource || {});
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
  const utilPct = v => `${formatNumber(v * 100, 1)}%`;
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
            {card.avg != null ? (
              <div style={{ marginBottom: 5 }}>
                <div style={{ fontSize: 18, color: card.color, fontFamily: FONT, fontWeight: 700, lineHeight: 1.2 }}>{card.value}</div>
                <div style={{ fontSize: 11, color: C.muted, fontFamily: FONT, marginTop: 3 }}>avg {card.avg.toLocaleString()} per run</div>
              </div>
            ) : (
              <div style={{ fontSize: 18, color: card.color, fontFamily: FONT, fontWeight: 700, marginBottom: 5 }}>
                {card.value}
              </div>
            )}
            <div style={{ fontSize: 11, color: C.muted, fontFamily: FONT, lineHeight: 1.5 }}>
              {card.note}
            </div>
          </div>
        ))}
      </div>
      {outcomeEntries.length > 0 && (
        <>
          <div style={{ fontSize: 10, color: C.accent, fontFamily: FONT, letterSpacing: 1.2, fontWeight: 700, marginTop: 4 }}>
            JOURNEY OUTCOMES
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
            {outcomeEntries.map(outcome => {
              const outcomeAvg = avgPerRun(outcome.count);
              return (
                <div key={outcome.routeId} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6, padding: 12 }}>
                  <div style={{ fontSize: 10, color: C.muted, fontFamily: FONT, letterSpacing: 1.1, fontWeight: 700, marginBottom: 5 }}>
                    {outcome.routeLabel.toUpperCase()}
                  </div>
                  {outcomeAvg != null ? (
                    <div style={{ marginBottom: 5 }}>
                      <div style={{ fontSize: 18, color: outcome.status === "reneged" ? C.reneged : C.served, fontFamily: FONT, fontWeight: 700, lineHeight: 1.2 }}>
                        {formatMetricValue(outcome.count, 0)}
                      </div>
                      <div style={{ fontSize: 11, color: C.muted, fontFamily: FONT, marginTop: 3 }}>avg {outcomeAvg.toLocaleString()} per run</div>
                    </div>
                  ) : (
                    <div style={{ fontSize: 18, color: outcome.status === "reneged" ? C.reneged : C.served, fontFamily: FONT, fontWeight: 700, marginBottom: 5 }}>
                      {formatMetricValue(outcome.count, 0)}
                    </div>
                  )}
                  <div style={{ fontSize: 11, color: C.muted, fontFamily: FONT, lineHeight: 1.5 }}>
                    {outcome.status === "reneged" ? "Left before completion." : "Completed on this route."}
                    {outcome.endedBy ? ` Source: ${outcome.endedBy}.` : ""}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
      {perResourceEntries.length > 0 && (
        <>
          <div style={{ fontSize: 10, color: C.accent, fontFamily: FONT, letterSpacing: 1.2, fontWeight: 700, marginTop: 4 }}>
            RESOURCE UTILISATION
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10 }}>
            {perResourceEntries.map(([name, r]) => (
              <div key={name} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6, padding: 12 }}>
                <div style={{ fontSize: 10, color: C.muted, fontFamily: FONT, letterSpacing: 1.1, fontWeight: 700, marginBottom: 5 }}>
                  {name.toUpperCase()}
                </div>
                <div style={{ fontSize: 18, color: utilColor(r.utilisation ?? 0), fontFamily: FONT, fontWeight: 700, marginBottom: 5 }}>
                  {utilPct(r.utilisation ?? 0)}
                </div>
                <div style={{ fontSize: 11, color: C.muted, fontFamily: FONT, lineHeight: 1.5 }}>
                  {r.total ?? 1} resource{(r.total ?? 1) !== 1 ? "s" : ""}. Average % of capacity in use.
                </div>
              </div>
            ))}
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
  const filename = `des-studio-chart-${slugify(series.label)}.csv`;
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
  const filename = `des-studio-wait-samples-${slugify(dist.label)}.csv`;
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
  const vals = dist.values;
  const minV = vals[0];
  const maxV = vals[vals.length - 1];
  if (maxV === minV) return null;

  const binWidth = (maxV - minV) / HIST_BINS;
  const counts = Array(HIST_BINS).fill(0);
  for (const v of vals) {
    const i = Math.min(Math.floor((v - minV) / binWidth), HIST_BINS - 1);
    counts[i]++;
  }
  const maxCount = Math.max(...counts, 1);
  const barW = HIST_W / HIST_BINS;
  const PAD = { top: 14, right: 6, bottom: 20, left: 40 };
  const w = HIST_W - PAD.left - PAD.right;
  const h = HIST_H - PAD.top - PAD.bottom;
  const toX = v => PAD.left + ((v - minV) / (maxV - minV)) * w;
  const barToX = i => PAD.left + (i / HIST_BINS) * w;
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
          const binLo = minV + i * binWidth;
          const binHi = minV + (i + 1) * binWidth;
          return (
            <rect key={i}
              x={bx} y={by}
              width={bw} height={barH}
              fill={alpha(color, 0.85)} rx={4} ry={4}
              style={{ cursor: "crosshair" }}
              onMouseEnter={() => setTip({ x: bx + bw / 2, y: by, label: `${binLo.toFixed(1)} – ${binHi.toFixed(1)}`, value: `count: ${cnt}` })}
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
          { label: "avg", value: dist.mean, color: C.accent, desc: "mean wait" },
          { label: "p50", value: dist.p50, color: C.green, desc: "median" },
          { label: "p90", value: dist.p90, color: C.amber, desc: "90th %ile" },
          { label: "p95", value: dist.p95, color: C.amber, desc: "95th %ile" },
          { label: "p99", value: dist.p99, color: C.red, desc: "99th %ile" },
        ].map(s => (
          <div key={s.label} style={{ background: C.bg, border: `1px solid ${s.color}44`, borderRadius: 5, padding: "6px 8px", textAlign: "center" }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: s.color, fontFamily: FONT, letterSpacing: 1, marginBottom: 2 }}>{s.label.toUpperCase()}</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.text, fontFamily: FONT }}>{typeof s.value === "number" ? Math.round(s.value) : s.value}</div>
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
            fill={C.muted} fontFamily="monospace">{formatNumber(t)}</text>
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
      percentiles: computePercentiles(values),
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
          <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap", marginBottom: 8 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1, minWidth: 140 }}>
              <span style={{ fontSize: 10, color: C.muted, fontFamily: FONT }}>Result to assess</span>
              <select
                aria-label="Batch-means metric"
                value={batchMetric}
                onChange={e => { setBatchMetric(e.target.value); setBatchResult(null); }}
                style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 4, color: C.text, fontFamily: FONT, fontSize: 12, padding: "5px 8px", outline: "none" }}
              >
                {ANALYSIS_METRICS.map(metric => (
                  <option key={metric.path} value={metric.path}>{metric.label}</option>
                ))}
              </select>
            </div>
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
                  { label: "n", value: batchResult.n },
                  { label: "mean", value: formatNumber(batchResult.mean), color: C.accent },
                  { label: "lower bound", value: formatNumber(batchResult.lower) },
                  { label: "upper bound", value: formatNumber(batchResult.upper) },
                  { label: "lag-1 rho", value: formatNumber(batchResult.lag1Rho), color: C.amber },
                ]}
              />
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
      </div>
    </ChartSectionShell>
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
  const toggleSection = id => setSectionsOpen(prev => {
    const next = { ...prev, [id]: !prev[id] };
    try { localStorage.setItem("des.results.sections", JSON.stringify(next)); } catch {}
    return next;
  });

  const chartModel = useMemo(() => buildResultsViewModel(results, model), [results, model]);
  const queueSection = chartModel.chartSections.find(section => section.id === "queue-depth");
  const serverSection = chartModel.chartSections.find(section => section.id === "server-utilization");
  const waitSection = chartModel.chartSections.find(section => section.id === "wait-distribution");
  const hasWaitDistributions = (waitSection?.distributions || []).length > 0;
  const queuePeaks = Array.isArray(chartModel.runtimeMetrics?.metrics?.maxQueueLengthByQueue)
    ? chartModel.runtimeMetrics.metrics.maxQueueLengthByQueue
    : [];
  const analysisInputs = normaliseReplicationResults(replicationResults, results);
  const hasAnalysisInputs = analysisInputs.length > 0 || (warmupDetection?.series || []).length > 0 || results?.aggregateStats;

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
        <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
          <SectionHeader id="summary" label="Results Summary" isOpen={sectionsOpen.summary} onToggle={toggleSection} />
          <div id="results-section-summary" style={{ display: sectionsOpen.summary ? "block" : "none", paddingTop: 14 }}>
            <SummaryCardGrid results={results} replicationResults={replicationResults} />
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

  const bottleneckBadge = (queueSection?.series.length ?? 0) + (serverSection?.series.length ?? 0) + (waitSection?.distributions.length ?? 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>

      {/* ── 1. Headline KPIs ───────────────────────────────────────────────── */}
      <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
        <SectionHeader id="summary" label="Results Summary" isOpen={sectionsOpen.summary} onToggle={toggleSection} />
        <div id="results-section-summary" style={{ display: sectionsOpen.summary ? "block" : "none", paddingTop: 14 }}>
          <SummaryCardGrid results={results} replicationResults={replicationResults} />
        </div>
      </div>

      {/* ── 2. Bottleneck section — header + peak-queue strip + charts ──────── */}
      {(chartModel.hasTimeSeries || hasWaitDistributions || queuePeaks.length > 0) && (
        <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
          <SectionHeader id="bottlenecks" label="Where Are the Bottlenecks?" badge={bottleneckBadge} isOpen={sectionsOpen.bottlenecks} onToggle={toggleSection} />
          <div id="results-section-bottlenecks" style={{ display: sectionsOpen.bottlenecks ? "flex" : "none", flexDirection: "column", gap: 14, paddingTop: 14 }}>

            {/* Subtitle */}
            <div style={{ fontSize: 11, color: C.muted, fontFamily: FONT, lineHeight: 1.6 }}>
              Use these charts to see where queues build up, how busy resources are, and how uneven waiting times become.
            </div>

            {/* Peak queue strip */}
            {queuePeaks.length > 0 && (
              <div aria-label="Peak queue lengths" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
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

            {/* Queue depth charts */}
            {chartModel.hasTimeSeries && queueSection?.series.length > 0 && (
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
            )}

            {/* Server utilisation charts */}
            {chartModel.hasTimeSeries && serverSection?.series.length > 0 && (
              <ChartSectionShell section={serverSection}>
                <div aria-label="Server utilisation chart grid" style={CHART_GRID}>
                  {serverSection.series.map((series, idx) => {
                    const color = CHART_COLORS[(idx + 3) % CHART_COLORS.length];
                    const fmtPct = v => `${formatNumber(v, 1)}%`;
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
                      </ChartCard>
                    );
                  })}
                </div>
              </ChartSectionShell>
            )}

            {/* Wait-time distributions */}
            {hasWaitDistributions && (
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
            )}
          </div>
        </div>
      )}

      {/* ── 3. Cost summary (only when model tracks costs) ──────────────────── */}
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
