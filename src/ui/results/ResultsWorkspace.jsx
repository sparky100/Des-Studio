import { useMemo } from "react";
import { C, FONT } from "../shared/tokens.js";
import { buildResultsViewModel } from "./resultsViewModel.js";

const HIST_W = 360;
const HIST_H = 90;
const HIST_BINS = 16;
const CHART_W = 400;
const CHART_H = 120;
const CHART_COLORS = [C.accent, C.bEvent, C.purple, C.green, C.red, C.server];

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
  return rounded.replace(/\.?0+$/, "");
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

function SeriesDataSummary({ series, valueLabel }) {
  const points = Array.isArray(series?.points) ? series.points : [];
  if (!points.length) return null;
  const first = points[0];
  const last = points[points.length - 1];
  const peak = Math.max(...points.map(p => Number(p.value) || 0));
  return (
    <MetricStrip
      items={[
        { label: "points", value: points.length },
        { label: "first", value: `t=${formatNumber(first.t)} -> ${formatNumber(first.value)}` },
        { label: "last", value: `t=${formatNumber(last.t)} -> ${formatNumber(last.value)}` },
        { label: `peak ${valueLabel}`, value: formatNumber(peak), color: C.accent },
      ]}
    />
  );
}

function WaitDataSummary({ dist }) {
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

function previewRows(rows, headCount = 6, tailCount = 4) {
  if (rows.length <= headCount + tailCount + 1) return rows.map((row, index) => ({ row, index, gap: false }));
  return [
    ...rows.slice(0, headCount).map((row, index) => ({ row, index, gap: false })),
    { row: null, index: "gap", gap: true },
    ...rows.slice(-tailCount).map((row, offset) => ({ row, index: rows.length - tailCount + offset, gap: false })),
  ];
}

function DataPreviewShell({ summary, onExport, children }) {
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
  const points = Array.isArray(series?.points) ? series.points : [];
  if (!points.length) return null;
  const th = label => <th key={label} style={{ padding: "4px 8px", textAlign: "right", color: C.muted, fontFamily: FONT, fontSize: 9, fontWeight: 700 }}>{label}</th>;
  const td = (label, value, color = C.text) => <td key={label} style={{ padding: "4px 8px", textAlign: "right", color, fontFamily: FONT, fontSize: 10 }}>{value}</td>;
  const filename = `des-studio-chart-${slugify(series.label)}.csv`;
  return (
    <DataPreviewShell summary={`View chart data (${points.length} points)`} onExport={() => downloadTextFile(buildSeriesCsv(series), filename)}>
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
  const values = Array.isArray(dist?.values) ? dist.values : [];
  if (!values.length) return null;
  const th = label => <th key={label} style={{ padding: "4px 8px", textAlign: "right", color: C.muted, fontFamily: FONT, fontSize: 9, fontWeight: 700 }}>{label}</th>;
  const td = (label, value, color = C.text) => <td key={label} style={{ padding: "4px 8px", textAlign: "right", color, fontFamily: FONT, fontSize: 10 }}>{value}</td>;
  const filename = `des-studio-wait-samples-${slugify(dist.label)}.csv`;
  return (
    <DataPreviewShell summary={`View wait samples (${values.length} values)`} onExport={() => downloadTextFile(buildWaitValuesCsv(dist), filename)}>
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
  const PAD = { top: 14, right: 6, bottom: 16, left: 36 };
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
        viewBox={`0 0 ${HIST_W} ${HIST_H}`} style={{ display: "block", width: "100%", overflow: "visible" }}>
        {yTicks.map((t, i) => {
          const y = PAD.top + h - (t / maxCount) * h;
          return (
            <g key={`${t}-${i}`}>
              <line x1={PAD.left} y1={y} x2={PAD.left + w} y2={y}
                stroke={C.border} strokeWidth={0.5} strokeDasharray="3,3" />
              <text x={PAD.left - 4} y={y + 3} textAnchor="end" fontSize={7}
                fill={C.muted} fontFamily="monospace">{t}</text>
            </g>
          );
        })}
        {counts.map((cnt, i) => {
          const barH = (cnt / maxCount) * h;
          return (
            <rect key={i}
              x={barToX(i) + 1} y={PAD.top + h - barH}
              width={Math.max(barW - 2, 1)} height={barH}
              fill={color} fillOpacity={0.4} rx={1}
            />
          );
        })}
        {markers.map(m => {
          const x = toX(m.value);
          if (x < PAD.left || x > PAD.left + w) return null;
          return (
            <g key={m.label}>
              <line x1={x} y1={PAD.top} x2={x} y2={PAD.top + h}
                stroke={m.color} strokeWidth={1.5} strokeDasharray="3,2" />
              <text x={x + 2} y={PAD.top - 2} fontSize={7} fill={m.color} fontFamily="monospace">{m.label}</text>
            </g>
          );
        })}
        <text x={PAD.left} y={HIST_H - 2} fontSize={7} fill={C.muted} fontFamily="monospace">{Math.round(minV)}</text>
        <text x={PAD.left + w - 28} y={HIST_H - 2} fontSize={7} fill={C.muted} fontFamily="monospace">{Math.round(maxV)}</text>
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

export function MiniLineChart({ title, points, color, yLabel }) {
  if (!points || points.length < 2) return null;
  const maxY = Math.max(...points.map(p => p.value), 1);
  const maxT = points[points.length - 1].t || 1;
  const PAD = { top: 6, right: 6, bottom: 16, left: 36 };
  const w = CHART_W - PAD.left - PAD.right;
  const h = CHART_H - PAD.top - PAD.bottom;
  const toX = t => PAD.left + (t / maxT) * w;
  const toY = v => PAD.top + h - (v / maxY) * h;
  const linePts = points.map(p => `${toX(p.t).toFixed(1)},${toY(p.value).toFixed(1)}`).join(" ");
  const fillPts = [
    ...points.map(p => `${toX(p.t).toFixed(1)},${toY(p.value).toFixed(1)}`),
    `${toX(maxT)},${PAD.top + h}`, `${PAD.left},${PAD.top + h}`,
  ].join(" ");
  const yTicks = [0, Math.round(maxY / 2) || 1, maxY];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span style={{ fontSize: 11, color, fontFamily: FONT, fontWeight: 700 }}>{title}</span>
        <span style={{ fontSize: 9, color: C.muted, fontFamily: FONT }}>{yLabel} · max {Math.round(maxY)}</span>
      </div>
      <svg width={CHART_W} height={CHART_H} style={{ display: "block", width: "100%", minWidth: 0, minHeight: 100 }}
        viewBox={`0 0 ${CHART_W} ${CHART_H}`} preserveAspectRatio="xMidYMid meet" aria-hidden="true">
        {yTicks.map((t, i) => {
          const y = toY(t);
          return (
            <g key={`${t}-${i}`}>
              <line x1={PAD.left} y1={y} x2={PAD.left + w} y2={y}
                stroke={C.border} strokeWidth={0.5} strokeDasharray="3,3" />
              <text x={PAD.left - 4} y={y + 3} textAnchor="end" fontSize={8}
                fill={C.muted} fontFamily="monospace">{Math.round(t)}</text>
            </g>
          );
        })}
        <polygon points={fillPts} fill={color} fillOpacity={0.1} />
        <polyline points={linePts} fill="none" stroke={color} strokeWidth="1.5"
          strokeLinejoin="round" strokeLinecap="round" />
        <text x={PAD.left + w / 2} y={CHART_H - 2} textAnchor="middle" fontSize={8}
          fill={C.muted} fontFamily="monospace">simulation time</text>
      </svg>
    </div>
  );
}

export function ResultsWorkspace({ results, model }) {
  const chartModel = useMemo(() => buildResultsViewModel(results, model), [results, model]);
  const queueSection = chartModel.chartSections.find(section => section.id === "queue-depth");
  const serverSection = chartModel.chartSections.find(section => section.id === "server-utilization");
  const waitSection = chartModel.chartSections.find(section => section.id === "wait-distribution");
  const hasWaitDistributions = (waitSection?.distributions || []).length > 0;

  if (!chartModel.hasTimeSeries && !hasWaitDistributions) {
    return (
      <div style={{ color: C.muted, fontFamily: FONT, fontSize: 12, padding: 8 }}>
        Enable <strong style={{ color: C.accent }}>Detailed output</strong> in the controls bar and run the simulation to see charts.
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, minWidth: 0 }}>
      {chartModel.hasTimeSeries && queueSection?.series.length > 0 && (
        <ChartSectionShell section={queueSection}>
          <div aria-label="Queue depth chart grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 320px), 1fr))", gap: 16, minWidth: 0 }}>
            {queueSection.series.map((series, idx) => (
              <div key={series.id} style={{ display: "flex", flexDirection: "column", gap: 5, minWidth: 0 }}>
                <MiniLineChart
                  title={series.source === "type-fallback" ? `${series.label} (type-level)` : series.label}
                  points={series.points}
                  color={CHART_COLORS[idx % CHART_COLORS.length]}
                  yLabel="depth"
                />
                <div style={{ fontSize: 9, color: series.source === "type-fallback" ? C.amber : C.muted, fontFamily: FONT }}>
                  Data: {series.sourceLabel}
                </div>
                <SeriesDataSummary series={series} valueLabel="depth" />
                <SeriesDataPreview series={series} />
              </div>
            ))}
          </div>
        </ChartSectionShell>
      )}

      {chartModel.hasTimeSeries && serverSection?.series.length > 0 && (
        <ChartSectionShell section={serverSection}>
          <div aria-label="Server utilisation chart grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 320px), 1fr))", gap: 16, minWidth: 0 }}>
            {serverSection.series.map((series, idx) => (
              <div key={series.id} style={{ display: "flex", flexDirection: "column", gap: 5, minWidth: 0 }}>
                <MiniLineChart
                  title={series.label}
                  points={series.points}
                  color={CHART_COLORS[(idx + 3) % CHART_COLORS.length]}
                  yLabel="utilisation"
                />
                <div style={{ fontSize: 9, color: C.muted, fontFamily: FONT }}>
                  Data: {series.sourceLabel}
                </div>
                <SeriesDataSummary series={series} valueLabel="utilisation" />
                <SeriesDataPreview series={series} />
              </div>
            ))}
          </div>
        </ChartSectionShell>
      )}

      {hasWaitDistributions && (
        <ChartSectionShell section={waitSection}>
          <div style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>
            {waitSection.distributions.map(dist => (
              <div key={dist.label} style={{ minWidth: 0 }}>
                <div style={{ fontSize: 11, color: C.cEvent, fontFamily: FONT, fontWeight: 700, marginBottom: 6 }}>{dist.label}</div>
                <WaitHistogram dist={dist} color={C.amber} />
                <div style={{ fontSize: 9, color: C.muted, fontFamily: FONT, marginTop: 5 }}>
                  Data: {dist.sourceLabel}
                </div>
                <div style={{ marginTop: 8 }}>
                  <WaitDataSummary dist={dist} />
                </div>
                <WaitValuesPreview dist={dist} />
              </div>
            ))}
          </div>
        </ChartSectionShell>
      )}
    </div>
  );
}
