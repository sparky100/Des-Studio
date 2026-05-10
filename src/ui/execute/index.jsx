// ui/execute/index.jsx — CustomerToken, VisualView, ExecutePanel
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
const ExecuteCanvas = lazy(() => import("./ExecuteCanvas.jsx").then(m => ({ default: m.ExecuteCanvas })));
import { C, FONT, TOKEN_COLORS } from "../shared/tokens.js";
import { Tag, PhaseTag, Btn, SH, InfoBox, Empty } from "../shared/components.jsx";
import { buildEngine } from "../../engine/index.js";
import { runReplications } from "../../engine/replication-runner.js";
import { compareScenarios, detectWarmupWelch, summarizeReplicationResults } from "../../engine/statistics.js";
import { fetchRunHistory, saveSimulationRun, fetchUserSettings, saveUserSettings, createShareLink, listShareLinks, revokeShareLink } from "../../db/models.js";
import { saveLocalRun, fetchLocalRunHistory } from "../../db/local.js";
import { BottomPanel } from "./BottomPanel.jsx";
import { DEFAULT_KPI_SLOTS } from "./execute-constants.js";
import { validateModel } from "../../engine/validation.js";
import { enumerateSweepableParams, generate2DSweepValues } from "../../engine/sweep-params.js";
import { runSweep, run2DSweep } from "../../engine/sweep-runner.js";
import { ConditionBuilder } from "../editors/index.jsx";
import { streamNarrative } from "../../llm/apiClient.js";
import { qrSvg } from "../share/qr.js";
import { buildCiResults, buildComparisonPrompt, buildNarrativePrompt, buildResultsQueryPrompt, buildSensitivityPrompt, buildSuggestionPrompt } from "../../llm/prompts.js";

const tokenColor = (id) => TOKEN_COLORS[(id - 1) % TOKEN_COLORS.length];
const CI_METRICS = ["summary.avgWait", "summary.avgSvc", "summary.avgSojourn", "summary.served", "summary.reneged"];
const METRIC_LABELS = {
  "summary.avgWait": "Avg wait",
  "summary.avgSvc": "Avg service",
  "summary.avgSojourn": "Avg sojourn",
  "summary.served": "Served",
  "summary.reneged": "Reneged",
};

const fmt = (value, digits = 0) => Number.isFinite(value) ? value.toFixed(digits) : "—";
const makeBatchId = () => {
  const cryptoApi = globalThis.crypto;
  if (typeof cryptoApi?.randomUUID === "function") {
    return cryptoApi.randomUUID();
  }
  return `batch-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
};

function makeBatchResult(replicationPayloads, aggregateStats, maxTime, warmupPeriod) {
  const summaries = replicationPayloads.map(payload => payload.result?.summary || {});
  const total = summaries.reduce((sum, summary) => sum + (summary.total || 0), 0);
  const served = summaries.reduce((sum, summary) => sum + (summary.served || 0), 0);
  const reneged = summaries.reduce((sum, summary) => sum + (summary.reneged || 0), 0);
  const finalTime = Math.max(...replicationPayloads.map(payload => payload.result?.finalTime || 0), 0);

  // Use the last completed replication's time series and wait dist for Charts tab
  const lastResult = replicationPayloads.filter(Boolean).pop()?.result;

  return {
    snap: { clock: finalTime },
    timeSeries: lastResult?.timeSeries,
    waitDist: lastResult?.waitDist,
    summary: {
      total,
      served,
      reneged,
      avgWait: aggregateStats["summary.avgWait"]?.mean ?? null,
      avgSvc: aggregateStats["summary.avgSvc"]?.mean ?? null,
      avgSojourn: aggregateStats["summary.avgSojourn"]?.mean ?? null,
      warmupPeriod,
      maxSimTime: maxTime,
    },
  };
}

function slugifyResultName(name = "model") {
  const slug = String(name || "model")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "model";
}

function timestampForFilename(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, "-");
}

function buildResultsExportPayload({
  model,
  results,
  replicationResults = [],
  aggregateStats = {},
  config = {},
  batchStatus = "idle",
  exportedAt = new Date().toISOString(),
} = {}) {
  return {
    schema: "des-studio.results.v1",
    exportedAt,
    status: results ? "complete" : "partial",
    batchStatus,
    model: {
      id: config.modelId ?? null,
      name: model?.name ?? "Untitled model",
    },
    experiment: {
      runLabel: config.runLabel ?? null,
      seed: config.seed ?? null,
      replications: config.replications ?? Math.max(replicationResults.length, results ? 1 : 0),
      warmupPeriod: config.warmupPeriod ?? 0,
      maxSimTime: config.maxSimTime ?? null,
      terminationMode: config.terminationMode ?? "time",
      terminationCondition: config.terminationCondition ?? null,
    },
    results: results ?? null,
    replications: replicationResults.map(payload => ({
      replicationIndex: payload.replicationIndex,
      seed: payload.seed,
      summary: payload.result?.summary ?? payload.summary ?? {},
      finalTime: payload.result?.finalTime ?? payload.finalTime ?? payload.result?.snap?.clock ?? null,
    })),
    aggregateStats,
  };
}

function csvEscape(value) {
  if (value == null) return "";
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function buildResultsCsv({ results, replicationResults = [], aggregateStats = {}, config = {} } = {}) {
  const rows = [["runLabel", "replicationIndex", "seed", "served", "reneged", "avgWait", "avgSvc", "avgSojourn", "finalTime"]];

  const resultRows = replicationResults.length
    ? replicationResults.map(payload => ({
        replicationIndex: payload.replicationIndex,
        runLabel: payload.run_label || payload.label || config.runLabel || "",
        seed: payload.seed,
        summary: payload.result?.summary ?? payload.summary ?? {},
        finalTime: payload.result?.finalTime ?? payload.finalTime ?? payload.result?.snap?.clock ?? null,
      }))
    : results
      ? [{
          replicationIndex: 0,
          runLabel: config.runLabel || "",
          seed: config.seed ?? null,
          summary: results.summary ?? {},
          finalTime: results.finalTime ?? results.snap?.clock ?? null,
        }]
      : [];

  for (const row of resultRows) {
    rows.push([
      row.runLabel,
      row.replicationIndex,
      row.seed,
      row.summary.served,
      row.summary.reneged,
      row.summary.avgWait,
      row.summary.avgSvc,
      row.summary.avgSojourn,
      row.finalTime,
    ]);
  }

  const aggregateRows = Object.entries(aggregateStats)
    .filter(([, stat]) => stat && stat.n > 0)
    .map(([metric, stat]) => [
      metric,
      stat.n,
      stat.mean,
      stat.lower,
      stat.upper,
      stat.halfWidth,
    ]);

  if (aggregateRows.length) {
    rows.push([]);
    rows.push(["metric", "n", "mean", "lower95", "upper95", "halfWidth"]);
    rows.push(...aggregateRows);
  }

  return rows.map(row => row.map(csvEscape).join(",")).join("\n");
}

function downloadTextFile(content, filename, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

const CustomerToken = ({ entity, size = 36, showId = true }) => {
  const col = tokenColor(entity.id);
  const statusBorder = { waiting: C.waiting, serving: C.serving, done: C.served, reneged: C.reneged, idle: C.green, busy: C.amber }[entity.status] || C.muted;
  return (
    <div title={`#${entity.id} ${entity.type} — ${entity.status}\narrived t=${entity.arrivalTime?.toFixed?.(2)}`}
      style={{
        width: size, height: size, borderRadius: "50%", background: col + "22", border: `2.5px solid ${statusBorder}`,
        display: "flex", alignItems: "center", justifyContent: "center", fontFamily: FONT, fontSize: size * 0.28,
        fontWeight: 700, color: col, flexShrink: 0, cursor: "default", transition: "all .2s",
        boxShadow: entity.status === "serving" ? `0 0 8px ${col}66` : "none"
      }}>
      {showId ? `#${entity.id}` : ""}
    </div>
  );
};

const ServerBay = ({ server, customers }) => {
  const servingCust = customers.find(e => e.id === server.currentCustId);
  const isB = server.status === "busy";
  const borderCol = isB ? C.busy : C.idle;
  return (
    <div style={{
      background: C.panel, border: `2px solid ${borderCol}44`, borderRadius: 10, padding: 14,
      display: "flex", flexDirection: "column", gap: 10, minWidth: 160, position: "relative"
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "space-between" }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 12, color: "#a78bfa", fontFamily: FONT }}>Server #{server.id}</div>
          <div style={{ fontSize: 10, color: "#9ca3af", fontFamily: FONT }}>{server.type}</div>
        </div>
        <Tag label={server.status} color={isB ? C.amber : C.green} />
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, justifyContent: "center" }}>
        <div style={{
          width: 48, height: 48, borderRadius: 8, background: "#a78bfa18", border: `2px solid #a78bfa55`,
          display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0
        }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <rect x="3" y="6" width="18" height="4" rx="1" stroke="#a78bfa" strokeWidth="1.5" />
            <rect x="3" y="13" width="18" height="4" rx="1" stroke="#a78bfa" strokeWidth="1.5" />
            <circle cx="6.5" cy="8" r="1" fill={isB ? C.amber : C.green} />
          </svg>
        </div>
        {servingCust ? (
          <><div style={{ fontSize: 18, color: "#4b5563" }}>→</div><CustomerToken entity={servingCust} size={44} /></>
        ) : (
          <div style={{ fontSize: 11, color: "#4b5563", fontFamily: FONT, fontStyle: "italic" }}>idle</div>
        )}
      </div>
    </div>
  );
};

const VisualView = ({ snap, model, summary }) => {
  if (!snap) return <Empty icon="▶" msg="Run or step the simulation to see the visual view." />;

  const allEntities = snap.entities || [];
  const servers = allEntities.filter(e => e.role === "server");
  const customers = allEntities.filter(e => e.role !== "server");
  const waiting = customers.filter(e => e.status === "waiting");
  const definedQueues = model.queues || [];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {summary?.warmupPeriod > 0 && (
        <div style={{ background: "#78350f22", border: `1px solid ${C.amber}44`, borderRadius: 8, padding: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", gap: 16 }}>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <span style={{ fontSize: 9, color: "#888", fontWeight: 700 }}>WARM-UP DURATION</span>
              <span style={{ fontSize: 14, color: C.amber, fontWeight: 700 }}>{summary.warmupPeriod}</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <span style={{ fontSize: 9, color: "#888", fontWeight: 700 }}>OBS. EXCLUDED</span>
              <span style={{ fontSize: 14, color: C.reneged, fontWeight: 700 }}>{summary.excludedCount || 0}</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <span style={{ fontSize: 9, color: "#888", fontWeight: 700 }}>OBS. INCLUDED</span>
              <span style={{ fontSize: 14, color: C.served, fontWeight: 700 }}>{summary.total || 0}</span>
            </div>
          </div>
          <div style={{ fontSize: 10, color: C.amber, fontWeight: 700, fontFamily: FONT, letterSpacing: 1 }}>WARM-UP AUDIT TRAIL</div>
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: 16, alignItems: "start" }}>
        <div style={{ background: "#111", border: `2px solid #a855f744`, borderRadius: 12, padding: "20px 28px", textAlign: "center", minWidth: 140 }}>
          <div style={{ fontSize: 10, color: "#9ca3af", fontFamily: FONT, letterSpacing: 2, marginBottom: 6 }}>SIM CLOCK</div>
          <div style={{ fontSize: 42, fontWeight: 300, color: "#fff", fontFamily: FONT, lineHeight: 1 }}>
            {parseFloat(snap.clock).toFixed(0)}
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8 }}>
          {[
            { label: "Arrived", value: customers.length, color: "#38bdf8" },
            { label: "Served", value: snap.served || 0, color: "#10b981" },
            { label: "Reneged", value: snap.reneged || 0, color: "#ef4444" },
            { label: "Waiting", value: waiting.length, color: "#f59e0b" },
          ].map(s => (
            <div key={s.label} style={{ background: "#1a1a1a", border: `1px solid #333`, borderRadius: 8, padding: 10, textAlign: "center" }}>
              <div style={{ fontSize: 9, color: "#888", fontWeight: 700, marginBottom: 4 }}>{s.label.toUpperCase()}</div>
              <div style={{ fontSize: 20, color: s.color, fontWeight: 700 }}>{s.value}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        {servers.map(srv => <ServerBay key={srv.id} server={srv} customers={customers} />)}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ fontSize: 10, color: "#9ca3af", fontFamily: FONT, letterSpacing: 1.5, fontWeight: 700 }}>QUEUE LANES</div>
        {definedQueues.length > 0 ? (
          definedQueues.map((qDef, idx) => {
            const qName = qDef.name;
            const qEntities = waiting.filter(e => e.queue === qName || (idx === 0 && !e.queue));
            return (
              <div key={qName} style={{ background: "#111", border: `1px solid #333`, borderLeft: `4px solid ${C.cEvent || '#8b5cf6'}`, borderRadius: 8, padding: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: "#fff", fontFamily: FONT }}>{qName.toUpperCase()}</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: qEntities.length > 0 ? "#f59e0b" : "#fff", fontFamily: FONT }}>{qEntities.length}</span>
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', minHeight: 40 }}>
                  {qEntities.length === 0 ? <span style={{ fontSize: 11, color: "#444", fontStyle: "italic" }}>empty</span> : qEntities.map(e => <CustomerToken key={e.id} entity={e} size={32} />)}
                </div>
              </div>
            );
          })
        ) : (
          <div style={{ background: "#111", border: `1px solid #333`, borderRadius: 8, padding: 12 }}>
            <div style={{ fontSize: 11, color: "#f59e0b", fontWeight: 700, marginBottom: 8 }}>GENERAL QUEUE</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{waiting.map(e => <CustomerToken key={e.id} entity={e} size={32} />)}</div>
          </div>
        )}
      </div>
    </div>
  );
};

function makeRunLabel(payload) {
  if (!payload) return "Run";
  if (payload.run_label) return payload.run_label;
  if (payload.label) return payload.label;
  if (payload.replicationIndex != null) return `Replication ${payload.replicationIndex + 1} (seed ${payload.seed ?? "?"})`;
  return "Completed run";
}

function makeRunPromptPayload(label, payload) {
  const summary = payload?.result?.summary || payload?.summary || payload?.results?.summary || {};
  return {
    label,
    experimentConfig: payload?.experiment || payload?.experimentConfig || {},
    kpis: {
      served: summary.served ?? null,
      reneged: summary.reneged ?? null,
      totalEntities: summary.total ?? null,
      avgWait: summary.avgWait ?? null,
      avgService: summary.avgSvc ?? null,
      avgSojourn: summary.avgSojourn ?? null,
    },
    finalTime: payload?.result?.finalTime ?? payload?.finalTime ?? payload?.results?.snap?.clock ?? null,
  };
}

function makeSavedRunPromptPayload(row) {
  const summary = row?.results_json?.summary || {};
  return {
    label: row?.run_label || row?.label || row?.ran_at || "Saved run",
    experimentConfig: {
      warmupPeriod: row?.warmup_period ?? null,
      maxSimTime: row?.max_simulation_time ?? row?.results_json?.summary?.maxSimTime ?? null,
      replications: row?.replications ?? 1,
      seed: row?.seed ?? null,
    },
    kpis: {
      served: row?.total_served ?? summary.served ?? null,
      reneged: row?.total_reneged ?? summary.reneged ?? null,
      totalEntities: row?.total_arrived ?? summary.total ?? null,
      avgWait: row?.avg_wait_time ?? summary.avgWait ?? null,
      avgService: row?.avg_service_time ?? summary.avgSvc ?? null,
      avgSojourn: summary.avgSojourn ?? null,
      renegeRate: row?.renege_rate ?? null,
    },
    finalTime: row?.results_json?.clock ?? row?.results_json?.summary?.finalTime ?? null,
  };
}

function SweepChart({ results, metric, paramLabel }) {
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

  // Y-axis ticks (5 ticks)
  const yTicks = Array.from({ length: 5 }, (_, i) => {
    const frac = i / 4;
    return (yMin - yPad) + frac * (yRange + 2 * yPad);
  });

  return (
    <div style={{ background: C.bg, borderRadius: 6, border: `1px solid ${C.border}`, padding: 12, overflow: "hidden" }}>
      <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" style={{ display: "block" }}>
        {/* Y-axis gridlines + labels */}
        {yTicks.map((tick, i) => (
          <g key={i}>
            <line x1={PAD.left} y1={yScale(tick)} x2={W - PAD.right} y2={yScale(tick)}
              stroke="#333" strokeWidth={1} />
            <text x={PAD.left - 6} y={yScale(tick) + 3} textAnchor="end" fill="#9ca3af" fontSize={9} fontFamily="monospace">
              {tick.toFixed(1)}
            </text>
          </g>
        ))}
        {/* CI ribbon */}
        <path d={ciPolygon} fill="#06b6d422" />
        {/* CI bounds (dashed) */}
        <path d={ciUpperPath} fill="none" stroke="#06b6d466" strokeWidth={1} strokeDasharray="4,3" />
        <path d={[...vValues].reverse().map((v, i) => {
          const idx = vValues.length - 1 - i;
          return `${i === 0 ? "M" : "L"}${xScale(vValues[idx]).toFixed(1)},${yScale(vLowers[idx]).toFixed(1)}`;
        }).join(" ")} fill="none" stroke="#06b6d466" strokeWidth={1} strokeDasharray="4,3" />
        {/* Mean line */}
        <path d={linePath} fill="none" stroke={C.accent} strokeWidth={2} />
        {/* Data points */}
        {vValues.map((v, i) => (
          <circle key={i} cx={xScale(v)} cy={yScale(vMeans[i])} r={3} fill={C.accent} stroke="#111" strokeWidth={1} />
        ))}
        {/* X-axis label */}
        <text x={W / 2} y={H - 2} textAnchor="middle" fill="#9ca3af" fontSize={9} fontFamily={FONT}>
          {paramLabel || "Parameter value"}
        </text>
        {/* Y-axis label */}
        <text x={8} y={H / 2} textAnchor="middle" fill="#9ca3af" fontSize={9} fontFamily={FONT}
          transform={`rotate(-90, 8, ${H / 2})`}>
          {METRIC_LABELS[metric] || metric}
        </text>
      </svg>
    </div>
  );
}

function WarmupChart({ series, truncationPoint, width = 320, height = 100 }) {
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
            <line x1={PAD.left} y1={yScale(tick)} x2={W - PAD.right} y2={yScale(tick)} stroke="#333" strokeWidth={1} />
            <text x={PAD.left - 4} y={yScale(tick) + 2} textAnchor="end" fill="#5c7a99" fontSize={8} fontFamily="monospace">
              {tick.toFixed(1)}
            </text>
          </g>
        ))}
        <path d={linePath} fill="none" stroke={C.accent} strokeWidth={1.5} />
        <line x1={kneeX} y1={PAD.top} x2={kneeX} y2={H - PAD.bottom} stroke={C.amber} strokeWidth={1} strokeDasharray="3,2" />
        <text x={kneeX + 3} y={PAD.top + 8} fill={C.amber} fontSize={8} fontFamily="monospace">
          knee t={Math.round(truncationPoint)}
        </text>
        <text x={W / 2} y={H - 2} textAnchor="middle" fill="#5c7a99" fontSize={8} fontFamily="monospace">
          Time
        </text>
      </svg>
    </div>
  );
}

function Sweep2DGrid({ results, metric, paramLabelA, paramLabelB, onCellClick }) {
  if (!results?.length) return null;

  // Build grid: rows = unique valueA, cols = unique valueB
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
    // cool → warm: cyan (#06b6d4) → amber (#f0883e) → red (#f85149)
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
                        color: "#111",
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
      {/* Color legend */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10, color: C.muted, fontFamily: FONT }}>
        <span>Low</span>
        <div style={{ width: 120, height: 10, background: "linear-gradient(to right, #06b6d4, #f0883e, #f85149)", borderRadius: 2 }} />
        <span>High</span>
        <span style={{ marginLeft: 8 }}>{METRIC_LABELS[metric] || metric}</span>
      </div>
    </div>
  );
}

const AiAssistantPanel = ({
  model,
  results,
  exportConfig,
  aggregateStats,
  comparisonRuns,
  comparisonLoading,
  comparisonError,
  onClose,
}) => {
  const [response, setResponse] = useState("");
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");
  const [selectedRunId, setSelectedRunId] = useState(comparisonRuns[0]?.id || "");
  const [queryText, setQueryText] = useState("");
  const [conversationHistory, setConversationHistory] = useState([]);
  const abortRef = useRef(null);
  const responseAreaRef = useRef(null);
  const ciResults = useMemo(() => buildCiResults(aggregateStats), [aggregateStats]);
  const sensitivityReady = ciResults.some(item => item.n >= 5);
  const isStreaming = status === "loading" || status === "streaming";
  const selectedRun = comparisonRuns.find(run => run.id === selectedRunId);

  useEffect(() => {
    if (!selectedRunId && comparisonRuns[0]) setSelectedRunId(comparisonRuns[0].id);
  }, [comparisonRuns, selectedRunId]);

  useEffect(() => () => abortRef.current?.abort(), []);

  useEffect(() => {
    if (responseAreaRef.current) {
      responseAreaRef.current.scrollTop = responseAreaRef.current.scrollHeight;
    }
  }, [response, conversationHistory]);

  const runPrompt = useCallback((prompt) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setResponse("");
    setError("");
    setStatus("loading");

    streamNarrative(prompt, {
      signal: controller.signal,
      onToken: token => {
        setStatus("streaming");
        setResponse(prev => `${prev}${token}`);
      },
      onComplete: () => {
        abortRef.current = null;
        setStatus("complete");
      },
      onError: err => {
        abortRef.current = null;
        setError(err?.message || "Analysis unavailable");
        setStatus("error");
      },
    });
  }, []);

  const runQuery = useCallback((question) => {
    if (!question.trim() || !results) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setError("");
    setStatus("streaming");

    const userEntry = { role: "user", content: question };
    setConversationHistory(prev => [...prev, userEntry]);
    setQueryText("");

    const prompt = buildResultsQueryPrompt(
      question,
      model,
      { ...results, aggregateStats },
      conversationHistory
    );

    let accumulated = "";
    streamNarrative(prompt, {
      signal: controller.signal,
      onToken: token => {
        accumulated += token;
        setResponse(accumulated);
      },
      onComplete: () => {
        abortRef.current = null;
        setConversationHistory(prev => [...prev, { role: "assistant", content: accumulated }]);
        setResponse("");
        setStatus("complete");
      },
      onError: err => {
        abortRef.current = null;
        setError(err?.message || "Query unavailable");
        setStatus("error");
      },
    });
  }, [model, results, aggregateStats, conversationHistory]);

  const stopStream = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setStatus(response ? "complete" : "idle");
  };

  const copyResponse = () => {
    const textToCopy = response || conversationHistory.map(e =>
      `${e.role === "user" ? "Q" : "A"}: ${e.content}`
    ).join("\n\n");
    if (!textToCopy || !navigator.clipboard?.writeText) return;
    navigator.clipboard.writeText(textToCopy);
  };

  const clearConversation = () => {
    setConversationHistory([]);
    setResponse("");
    setStatus("idle");
    setError("");
  };

  const explainResults = () => {
    runPrompt(buildNarrativePrompt(model, exportConfig, {
      ...results,
      aggregateStats,
    }));
  };

  const compareRuns = () => {
    if (!selectedRun) return;
    const comparisonPayload = selectedRun.source === "saved"
      ? makeSavedRunPromptPayload(selectedRun.payload)
      : makeRunPromptPayload(selectedRun.label, selectedRun.payload);

    runPrompt(buildComparisonPrompt(
      model.name,
      makeRunPromptPayload("Current completed run", { results, experiment: exportConfig }),
      comparisonPayload
    ));
  };

  const explainSensitivity = () => {
    runPrompt(buildSensitivityPrompt(model.name, exportConfig, ciResults));
  };

  const suggestChanges = () => {
    runPrompt(buildSuggestionPrompt(model, exportConfig, {
      ...results,
      aggregateStats,
    }));
  };

  const handleQueryKeyDown = (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      runQuery(queryText);
    }
  };

  const panelButtonStyle = { width: "100%", justifyContent: "center" };

  const renderContent = () => {
    if (conversationHistory.length > 0) {
      return conversationHistory.map((entry, i) => (
        <div key={i} style={{ marginBottom: 10 }}>
          <div style={{
            color: entry.role === "user" ? C.accent : C.primary,
            fontFamily: FONT,
            fontWeight: 700,
            fontSize: 10,
            letterSpacing: 1,
            marginBottom: 4,
          }}>
            {entry.role === "user" ? "YOU" : "AI"}
          </div>
          <div style={{ color: C.text, fontFamily: FONT, fontSize: 12, lineHeight: 1.7, whiteSpace: "pre-wrap" }}>
            {entry.content}
          </div>
        </div>
      ));
    }
    if (status === "loading") return "Waiting for analysis...";
    if (response) return response;
    return "Run the model to generate insights.";
  };

  return (
    <aside aria-label="AI assistant" style={{
      width: 320,
      flex: "0 0 320px",
      background: C.panel,
      border: `1px solid ${C.border}`,
      borderRadius: 8,
      padding: 14,
      display: "flex",
      flexDirection: "column",
      gap: 12,
      minHeight: 520,
      alignSelf: "stretch",
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, borderBottom: `1px solid ${C.border}`, paddingBottom: 10 }}>
        <div>
          <div style={{ fontSize: 13, color: C.text, fontFamily: FONT, fontWeight: 700 }}>AI Assistant</div>
          <div style={{ fontSize: 10, color: C.muted, fontFamily: FONT }}>Results analysis + natural language queries</div>
        </div>
        <Btn small variant="ghost" onClick={onClose} ariaLabel="Close AI assistant">x</Btn>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <Btn variant="primary" onClick={explainResults} disabled={!results || isStreaming} style={panelButtonStyle}>
          Explain results
        </Btn>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label htmlFor="compare-run" style={{ fontSize: 10, color: C.muted, fontFamily: FONT, letterSpacing: 1.2, fontWeight: 700 }}>COMPARE RUNS</label>
          <select
            id="compare-run"
            value={selectedRunId}
            onChange={event => setSelectedRunId(event.target.value)}
            disabled={!comparisonRuns.length || isStreaming}
            style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 5, color: C.text, fontFamily: FONT, fontSize: 12, padding: "7px 8px" }}
          >
            {!comparisonRuns.length && <option value="">{comparisonLoading ? "Loading saved runs..." : "No comparison runs"}</option>}
            {comparisonRuns.map(run => <option key={run.id} value={run.id}>{run.label}</option>)}
          </select>
          {comparisonError && (
            <div role="status" style={{ color: C.amber, fontFamily: FONT, fontSize: 10 }}>
              Saved runs unavailable: {comparisonError}
            </div>
          )}
          <Btn variant="ghost" onClick={compareRuns} disabled={!results || !selectedRun || isStreaming} style={panelButtonStyle}>
            Compare
          </Btn>
        </div>
        <Btn variant="amber" onClick={explainSensitivity} disabled={!sensitivityReady || isStreaming} style={panelButtonStyle}>
          Sensitivity
        </Btn>
        <Btn variant="primary" onClick={suggestChanges} disabled={!results || isStreaming} style={panelButtonStyle}>
          Suggest model changes
        </Btn>
      </div>

      {status === "error" && (
        <div role="alert" style={{ background: C.amber + "18", border: `1px solid ${C.amber}44`, borderRadius: 6, padding: 10, color: C.amber, fontFamily: FONT, fontSize: 11 }}>
          Analysis unavailable - try again. {error}
        </div>
      )}

      <div ref={responseAreaRef} style={{
        flex: 1,
        background: C.bg,
        border: `1px solid ${C.border}`,
        borderRadius: 6,
        padding: 12,
        overflowY: "auto",
        color: response ? C.text : C.muted,
        fontFamily: FONT,
        fontSize: 12,
        lineHeight: 1.7,
        whiteSpace: "pre-wrap",
      }}>
        {renderContent()}
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {isStreaming && <Btn small variant="danger" onClick={stopStream}>Stop</Btn>}
        {status === "complete" && (response || conversationHistory.length > 0) && <Btn small variant="ghost" onClick={copyResponse}>Copy</Btn>}
        {conversationHistory.length > 0 && !isStreaming && <Btn small variant="ghost" onClick={clearConversation}>Clear</Btn>}
      </div>

      <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 10 }}>
        <label htmlFor="query-input" style={{ fontSize: 10, color: C.muted, fontFamily: FONT, letterSpacing: 1.2, fontWeight: 700, display: "block", marginBottom: 6 }}>
          ASK A QUESTION
        </label>
        <div style={{ display: "flex", gap: 6 }}>
          <input
            id="query-input"
            type="text"
            value={queryText}
            onChange={event => setQueryText(event.target.value)}
            onKeyDown={handleQueryKeyDown}
            disabled={!results || isStreaming}
            placeholder={results ? "e.g. Which queue had the longest wait?" : "Run the model first..."}
            style={{
              flex: 1,
              background: C.bg,
              border: `1px solid ${C.border}`,
              borderRadius: 5,
              color: C.text,
              fontFamily: FONT,
              fontSize: 12,
              padding: "7px 8px",
            }}
          />
          <Btn
            small
            variant="primary"
            onClick={() => runQuery(queryText)}
            disabled={!results || !queryText.trim() || isStreaming}
            ariaLabel="Ask question"
          >
            Ask
          </Btn>
        </div>
      </div>
    </aside>
  );
};

const ExecutePanel = ({ model, modelId, userId, onRunSaved, autoRun = false }) => {
  const [mode, setMode] = useState("idle");
  const [currentSnap, setCurrentSnap] = useState(null);
  const [log, setLog] = useState([]);
  const [view, setView] = useState("visual");
  const [autoSpeed, setAutoSpeed] = useState(400);
  const [autoRunning, setAutoRunning] = useState(false);
  const [saveStatus, setSaveStatus] = useState(null);
  const [phaseCTruncated, setPhaseCTruncated] = useState(false);
  const [results, setResults] = useState(null);
  const [batchStatus, setBatchStatus] = useState("idle");
  const [batchProgress, setBatchProgress] = useState(null);
  const [replicationResults, setReplicationResults] = useState([]);
  const [aggregateStats, setAggregateStats] = useState({});
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 1e9));
  const [warmupPeriod, setWarmupPeriod] = useState(0);
  const [warmupDetection, setWarmupDetection] = useState(null);
  const [maxSimTime, setMaxSimTime] = useState(500);
  const [terminationMode, setTerminationMode] = useState("time");
  const [terminationCondition, setTerminationCondition] = useState(null);
  const [replications, setReplications] = useState(1);
  const [runLabel, setRunLabel] = useState("");
  const [aiPanelOpen, setAiPanelOpen] = useState(false);
  const [savedRunHistory, setSavedRunHistory] = useState([]);
  const [runHistoryStatus, setRunHistoryStatus] = useState("idle");
  const [runHistoryError, setRunHistoryError] = useState("");
  const [sweepOpen, setSweepOpen] = useState(false);
  const [sweepParams, setSweepParams] = useState([]);
  const [sweepSelectedParam, setSweepSelectedParam] = useState(null);
  const [sweepMin, setSweepMin] = useState(1);
  const [sweepMax, setSweepMax] = useState(5);
  const [sweepStep, setSweepStep] = useState(1);
  const [sweepStatus, setSweepStatus] = useState("idle");
  const [sweepResults, setSweepResults] = useState(null);
  const [sweepProgress, setSweepProgress] = useState(null);
  const [sweepKpiMetric, setSweepKpiMetric] = useState("summary.avgWait");
  const [sweepMode, setSweepMode] = useState("1d"); // "1d" | "2d"
  const [sweepSelectedParamB, setSweepSelectedParamB] = useState(null);
  const [sweepMinB, setSweepMinB] = useState(1);
  const [sweepMaxB, setSweepMaxB] = useState(5);
  const [sweepStepB, setSweepStepB] = useState(1);
  const [sweepGridError, setSweepGridError] = useState(null);
  const [selectedCell, setSelectedCell] = useState(null);
  const [comparisonIdxA, setComparisonIdxA] = useState(0);
  const [comparisonIdxB, setComparisonIdxB] = useState(null);
  const [comparisonResult, setComparisonResult] = useState(null);
  const sweepRunnerRef = useRef(null);
  const runSeedRef = useRef(seed);
  const engineRef = useRef(null);
  const autoRef = useRef(null);
  const runnerRef = useRef(null);
  const saveInProgressRef = useRef(false);
  // F9C.6 — animation toggle
  const [animationEnabled, setAnimationEnabled] = useState(true);
  // F10.4 — detailed time-series output (default off — zero engine overhead)
  const [collectTimeSeries, setCollectTimeSeries] = useState(true);
  // F9C.7 — configurable KPI slots
  const [kpiSlots, setKpiSlots] = useState(DEFAULT_KPI_SLOTS);
  // F9C.10 — speed multiplier (1× = 400ms interval, 10× = 40ms, 0.5× = 800ms)
  const [speedMultiplier, setSpeedMultiplier] = useState(1);
  // F9C.11 — node filter for bottom panel log
  const [selectedNodeLabel, setSelectedNodeLabel] = useState(null);
  // F15 — share link state
  const [shareLinks, setShareLinks] = useState([]);
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareConfig, setShareConfig] = useState(() => ({
    title: "",
    pinnedWidgets: ["summary", "queues", "resources", "charts"],
  }));
  const [shareSaving, setShareSaving] = useState(false);
  const [justCreatedLink, setJustCreatedLink] = useState(null);
  const [shareLinksLoading, setShareLinksLoading] = useState(false);
  const [qrToken, setQrToken] = useState(null);
  const qrRef = useRef(null);
  const [latestRunId, setLatestRunId] = useState(null);
  // F9C.10 — effective auto-step delay (must be declared before the autoRef useEffect)
  const effectiveAutoSpeed = useMemo(
    () => Math.max(40, Math.round(400 / speedMultiplier)),
    [speedMultiplier]
  );

  const validation = useMemo(() => {
    const v = validateModel({
      ...model,
      maxSimTime: terminationMode === 'time' ? maxSimTime : 0,
      terminationCondition: terminationMode === 'condition' ? terminationCondition : null
    });
    
    // F3.4 Additional Validations
    if (terminationMode === 'time' && warmupPeriod >= maxSimTime) {
      v.errors.push({ code: 'V14', message: 'Warm-up period must be less than the run duration.', tab: 'execute' });
    }
    if (!Number.isInteger(replications) || replications < 1) {
      v.errors.push({ code: 'V15', message: 'Replication count must be a positive integer.', tab: 'execute' });
    }
    
    return v;
  }, [model, warmupPeriod, maxSimTime, terminationMode, terminationCondition, replications]);
  const hasErrors = validation.errors.length > 0;

  const initEngine = useCallback(() => {
    if (hasErrors) return;
    runSeedRef.current = seed;
    engineRef.current = buildEngine(
      model,
      seed,
      warmupPeriod,
      terminationMode === 'time' ? maxSimTime : null,
      terminationMode === 'condition' ? terminationCondition : null,
      5000, 500,
      collectTimeSeries
    );
    setCurrentSnap(engineRef.current.getSnap());
    setLog([{ phase: "INIT", time: 0, message: `Simulation initialized  (seed: ${seed}, warmup: ${warmupPeriod})` }]);
    setMode("stepping");
    setSaveStatus(null);
    setPhaseCTruncated(false);
    setResults(null);
    setBatchStatus("idle");
    setBatchProgress(null);
    setReplicationResults([]);
    setAggregateStats({});
  }, [model, seed, hasErrors, warmupPeriod, maxSimTime, terminationMode, terminationCondition, collectTimeSeries]);

  const stopAuto = useCallback(() => {
    if (autoRef.current) {
      clearInterval(autoRef.current);
      autoRef.current = null;
      setAutoRunning(false);
    }
  }, []);

  const doStep = useCallback(() => {
    if (!engineRef.current) return;
    const r = engineRef.current.step();
    setCurrentSnap(r.snap);
    setLog(prev => [...prev, ...(r.cycleLog || [])]);
    if (r.phaseCTruncated) setPhaseCTruncated(true);

    if (r.done) {
      setMode("done");
      stopAuto();
      const summary = engineRef.current.getSummary();
      const fullResult = {
        snap: r.snap,
        summary: {
          ...summary,
          total: r.snap?.entities?.filter(e => e.role !== 'server').length || 0,
          served: r.snap?.served || 0,
          reneged: r.snap?.reneged || 0,
        },
        timeSeries:    engineRef.current.getTimeSeries?.(),
        waitDist:      engineRef.current.getWaitDist?.(),
        entitySummary: engineRef.current.getEntitySummary?.(),
      };
      setResults(fullResult);
      if (modelId) {
        setSaveStatus({ state: 'saving', message: 'Saving results...' });
        setLog(prev => [...prev, { phase: "SAVE", time: r.snap.clock, message: "💾 Auto-saving simulation results..." }]);
        const config = { seed: runSeedRef.current, runLabel, warmupPeriod, maxTime: terminationMode === 'time' ? maxSimTime : null };
        const save = userId ? saveSimulationRun(modelId, userId, fullResult, config) : saveLocalRun(modelId, fullResult, config);
        save
          .then((runId) => {
            if (runId) setLatestRunId(runId);
            setSaveStatus({ state: 'success', message: '✓ Saved successfully!' });
            setLog(prev => [...prev, { phase: "SAVE", time: r.snap.clock, message: "✅ History record completed." }]);
            onRunSaved?.();
          })
          .catch(e => {
            setSaveStatus({ state: 'error', message: `✗ Save failed: ${e.message}` });
            setLog(prev => [...prev, { phase: "ERROR", time: r.snap.clock, message: `❌ Save error: ${e.message}` }]);
          });
      }
    }
  }, [userId, modelId, runLabel, warmupPeriod, maxSimTime, terminationMode, stopAuto, onRunSaved]);

  const handleDetectWarmup = useCallback(() => {
    if (!replicationResults || replicationResults.length === 0) {
      setWarmupDetection({
        truncationPoint: warmupPeriod,
        explanation: "No replication results available. Run at least one replication first.",
        series: [],
        confidence: "low",
      });
      return;
    }
    const defaultMetrics = ["summary.avgWait", "summary.avgSvc", "summary.avgSojourn"];
    let result = null;
    for (const metric of defaultMetrics) {
      result = detectWarmupWelch(replicationResults, metric, { minWarmup: warmupPeriod });
      if (result.series.length > 0) break;
    }
    if (!result || result.series.length === 0) {
      setWarmupDetection({
        truncationPoint: warmupPeriod,
        explanation: "Could not detect warm-up — no time-series data found in replication results.",
        series: [],
        confidence: "low",
      });
      return;
    }
    setWarmupDetection(result);
  }, [replicationResults, warmupPeriod]);

  const doRunAll = useCallback(async () => {
    stopAuto();
    if (hasErrors) return;
    if (saveInProgressRef.current) return;
    if (!modelId) {
      setSaveStatus({ state: 'error', message: '✗ No model to run' });
      return;
    }

    const runSeed = seed;
    const maxTimeForRun = terminationMode === 'time' ? maxSimTime : null;
    const stopConditionForRun = terminationMode === 'condition' ? terminationCondition : null;

    if (replications > 1) {
      const batchId = makeBatchId();
      const completedPayloads = [];

      setMode("running");
      setCurrentSnap(null);
      setResults(null);
      setLog([{ phase: "INIT", time: 0, message: `Replication batch started  (N=${replications}, base seed: ${runSeed})` }]);
      setSaveStatus(null);
      setPhaseCTruncated(false);
      setBatchStatus("running");
      setBatchProgress({ completed: 0, total: replications, running: 0, pending: replications, cancelled: false, workerCount: 0 });
      setReplicationResults([]);
      setAggregateStats({});

      runnerRef.current = runReplications({
        model,
        replications,
        baseSeed: runSeed,
        warmupPeriod,
        maxSimTime: maxTimeForRun,
        terminationCondition: stopConditionForRun,
        collectTimeSeries,
        onProgress: progress => setBatchProgress(progress),
        onReplicationComplete: payload => {
          completedPayloads[payload.replicationIndex] = payload;
          const ordered = completedPayloads.filter(Boolean);
          const nextStats = summarizeReplicationResults(ordered, CI_METRICS);

          setReplicationResults(ordered);
          setAggregateStats(nextStats);
          setCurrentSnap(payload.result?.snap || null);
          setLog(prev => [
            ...prev,
            {
              phase: "REP",
              time: payload.result?.finalTime || 0,
              message: `Replication ${payload.replicationIndex + 1}/${replications} complete  (seed: ${payload.seed})`,
            },
          ]);
          if (payload.result?.summary?.phaseCTruncated) setPhaseCTruncated(true);
        },
        onComplete: async payloads => {
          saveInProgressRef.current = true;
          try {
            const ordered = payloads.filter(Boolean);
            const stats = summarizeReplicationResults(ordered, CI_METRICS);
            const batchResult = makeBatchResult(ordered, stats, maxTimeForRun, warmupPeriod);

            setBatchStatus("complete");
            setResults(batchResult);
            setAggregateStats(stats);
            setSaveStatus({ state: 'saving', message: 'Saving replication batch...' });

            try {
              const batchConfig = {
                seed: runSeed, runLabel, replications, warmupPeriod, maxTime: maxTimeForRun, batchId,
                aggregateStats: stats,
                replicationResults: ordered.map(payload => ({
                  replicationIndex: payload.replicationIndex, seed: payload.seed,
                  summary: payload.result?.summary || {}, finalTime: payload.result?.finalTime,
                })),
              };
              if (userId) {
                const runId = await saveSimulationRun(modelId, userId, batchResult, batchConfig);
                if (runId) setLatestRunId(runId);
              } else {
                saveLocalRun(modelId, batchResult, batchConfig);
              }
              setSaveStatus({ state: 'success', message: '✓ Replication batch saved successfully!' });
              setLog(prev => [...prev, { phase: "SAVE", time: batchResult.snap.clock, message: "Replication batch saved." }]);
              onRunSaved?.();
            } catch (saveError) {
              setSaveStatus({ state: 'error', message: `✗ Failed to save batch: ${saveError.message}` });
              setLog(prev => [...prev, { phase: "ERROR", time: batchResult.snap.clock, message: `❌ Database error: ${saveError.message}` }]);
            }
          } catch (setupError) {
            setBatchStatus("complete");
            setSaveStatus({ state: 'error', message: `✗ Batch error: ${setupError.message}` });
          } finally {
            saveInProgressRef.current = false;
            runnerRef.current = null;
            setMode("done");
          }
        },
        onError: error => {
          setBatchStatus("error");
          setSaveStatus({ state: 'error', message: `✗ Replication failed: ${error.message}` });
          setLog(prev => [...prev, { phase: "ERROR", time: 0, message: `Replication ${error.replicationIndex + 1} failed: ${error.message}` }]);
          runnerRef.current = null;
          setMode("idle");
        },
        onCancelled: () => {
          setBatchStatus("cancelled");
          setSaveStatus({ state: 'error', message: 'Replication batch cancelled. Results were not saved.' });
          setLog(prev => [...prev, { phase: "CANCEL", time: 0, message: "Replication batch cancelled." }]);
          runnerRef.current = null;
          setMode("idle");
        },
      });
      return;
    }

    setResults(null);
    setSaveStatus(null);
    setPhaseCTruncated(false);
    setLog([{ phase: "INIT", time: 0, message: `Run started  (seed: ${runSeed})` }]);
    setMode("running");

    const engine = buildEngine(
      model,
      runSeed,
      warmupPeriod,
      maxTimeForRun,
      stopConditionForRun,
      5000, 500,
      collectTimeSeries
    );
    const result = engine.runAll();

    setCurrentSnap(result.snap);
    setResults(result);
    setLog(result.log);
    setMode("done");
    if (result.summary?.phaseCTruncated) setPhaseCTruncated(true);

    saveInProgressRef.current = true;
    setSaveStatus({ state: 'saving', message: 'Saving results...' });
    setLog(prev => [...prev, { phase: "SAVE", time: result.snap.clock, message: "💾 Committing simulation history to database..." }]);

    try {
      const config = { seed: runSeed, runLabel, replications: 1, warmupPeriod, maxTime: maxTimeForRun };
      const save = userId ? saveSimulationRun(modelId, userId, result, config) : saveLocalRun(modelId, result, config);
      const runId = await save;
      if (runId) setLatestRunId(runId);
      setSaveStatus({ state: 'success', message: '✓ History saved successfully!' });
      setLog(prev => [...prev, { phase: "SAVE", time: result.snap.clock, message: "✅ History commit complete." }]);
      onRunSaved?.();
    } catch (e) {
      setSaveStatus({ state: 'error', message: `✗ Failed to save: ${e.message}` });
      setLog(prev => [...prev, { phase: "ERROR", time: result.snap.clock, message: `❌ Database error: ${e.message}` }]);
    } finally {
      saveInProgressRef.current = false;
    }
  }, [model, userId, modelId, seed, runLabel, hasErrors, warmupPeriod, maxSimTime, terminationMode, terminationCondition, replications, collectTimeSeries, stopAuto, onRunSaved]);

  const cancelBatch = useCallback(() => {
    if (!runnerRef.current) return;
    setBatchStatus("cancelling");
    runnerRef.current.cancel();
  }, []);

  const toggleAuto = () => {
    if (autoRunning) {
      stopAuto();
    } else {
      if (mode === "idle") initEngine();
      setAutoRunning(true);
    }
  };

  useEffect(() => {
    if (!autoRunning) return;
    autoRef.current = setInterval(doStep, effectiveAutoSpeed);
    return () => {
      if (autoRef.current) {
        clearInterval(autoRef.current);
        autoRef.current = null;
      }
    };
  }, [autoRunning, effectiveAutoSpeed, doStep]);

  useEffect(() => {
    return () => runnerRef.current?.cancel();
  }, []);

  // Auto-run on mount (used by template quick-start)
  const autoRunRef = useRef(false);
  useEffect(() => {
    if (autoRun && !autoRunRef.current && !hasErrors && modelId) {
      autoRunRef.current = true;
      doRunAll();
    }
  }, [autoRun, hasErrors, modelId, doRunAll]);

  // Load execute preferences (animation toggle, KPI slots) on mount
  useEffect(() => {
    if (!userId) return;
    fetchUserSettings(userId)
      .then(({ settings }) => {
        if (settings?.execute?.animateTokens !== undefined) {
          setAnimationEnabled(settings.execute.animateTokens !== false);
        }
        if (Array.isArray(settings?.execute?.kpiSlots)) {
          setKpiSlots(settings.execute.kpiSlots);
        }
      })
      .catch(() => {}); // keep defaults on error
  }, [userId]);

  const saveExecuteSetting = useCallback(async (patch) => {
    if (!userId) return;
    try {
      const current = await fetchUserSettings(userId);
      await saveUserSettings(userId, {
        ...current.settings,
        execute: { ...current.settings?.execute, ...patch },
      });
    } catch {} // silently ignore
  }, [userId]);

  const toggleAnimation = useCallback(() => {
    const next = !animationEnabled;
    setAnimationEnabled(next);
    saveExecuteSetting({ animateTokens: next });
  }, [animationEnabled, saveExecuteSetting]);

  const handleKpiSlotChange = useCallback((slotIndex, newKey) => {
    setKpiSlots(prev => {
      const next = [...prev];
      next[slotIndex] = newKey;
      saveExecuteSetting({ kpiSlots: next });
      return next;
    });
  }, [saveExecuteSetting]);

  useEffect(() => {
    if (!aiPanelOpen || !modelId) return;
    let cancelled = false;
    setRunHistoryStatus("loading");
    setRunHistoryError("");
    const fetcher = userId ? fetchRunHistory : fetchLocalRunHistory;
    fetcher(modelId)
      .then(rows => {
        if (cancelled) return;
        setSavedRunHistory(rows || []);
        setRunHistoryStatus("loaded");
      })
      .catch(error => {
        if (cancelled) return;
        setSavedRunHistory([]);
        setRunHistoryError(error?.message || "could not load run history");
        setRunHistoryStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [aiPanelOpen, modelId]);

  const batchActive = batchStatus === "running" || batchStatus === "cancelling";
  const partialBatchStatus = batchStatus === "cancelled" || batchStatus === "error";
  const canExportResults = Boolean(results || (partialBatchStatus && replicationResults.length));
  const exportConfig = useMemo(() => ({
    modelId,
    seed: runSeedRef.current,
    runLabel: runLabel.trim() || null,
    replications,
    warmupPeriod,
    maxSimTime: terminationMode === "time" ? maxSimTime : null,
    terminationMode,
    terminationCondition: terminationMode === "condition" ? terminationCondition : null,
  }), [modelId, runLabel, replications, warmupPeriod, maxSimTime, terminationMode, terminationCondition]);
  const exportPartial = partialBatchStatus && replicationResults.length > 0;
  const resultFilenameBase = `des-studio-results-${slugifyResultName(model.name)}${exportPartial ? "-partial" : ""}-${timestampForFilename()}`;
  const comparisonRuns = useMemo(() => {
    const savedRuns = savedRunHistory.map(row => ({
      id: `saved-${row.id}`,
      label: row.run_label || `Saved ${row.ran_at ? new Date(row.ran_at).toLocaleString() : row.id}`,
      payload: row,
      source: "saved",
    }));
    const currentReplications = replicationResults.map(payload => ({
      id: `rep-${payload.replicationIndex}`,
      label: makeRunLabel(payload),
      payload,
      source: "session",
    }));
    return [...savedRuns, ...currentReplications];
  }, [savedRunHistory, replicationResults]);

  const exportResultsJson = useCallback(() => {
    const payload = buildResultsExportPayload({
      model,
      results,
      replicationResults,
      aggregateStats,
      config: exportConfig,
      batchStatus,
    });
    downloadTextFile(
      JSON.stringify(payload, null, 2),
      `${resultFilenameBase}.json`,
      "application/json"
    );
  }, [model, results, replicationResults, aggregateStats, exportConfig, batchStatus, resultFilenameBase]);

  const exportResultsCsv = useCallback(() => {
    const csv = buildResultsCsv({
      results,
      replicationResults,
      aggregateStats,
      config: exportConfig,
    });
    downloadTextFile(
      csv,
      `${resultFilenameBase}.csv`,
      "text/csv;charset=utf-8"
    );
  }, [results, replicationResults, aggregateStats, exportConfig, resultFilenameBase]);

  const loadShareLinks = useCallback(async () => {
    if (!modelId) return;
    setShareLinksLoading(true);
    try {
      const links = await listShareLinks(modelId);
      setShareLinks(links);
    } catch { setShareLinks([]); }
    finally { setShareLinksLoading(false); }
  }, [modelId]);

  const handleCreateShareLink = useCallback(async () => {
    if (!userId || !results || !latestRunId) return;
    setShareSaving(true);
    try {
      const result = await createShareLink(latestRunId, userId, shareConfig);
      setJustCreatedLink(result);
      await loadShareLinks();
    } catch (e) {
      setSaveStatus({ state: "error", message: `Share link failed: ${e.message}` });
    } finally { setShareSaving(false); }
  }, [userId, results, latestRunId, shareConfig, loadShareLinks]);

  const handleRevokeShareLink = useCallback(async (id) => {
    if (!userId) return;
    try {
      await revokeShareLink(id, userId);
      await loadShareLinks();
    } catch (e) {
      setSaveStatus({ state: "error", message: `Revoke failed: ${e.message}` });
    }
  }, [userId, loadShareLinks]);

  const toggleWidget = useCallback((key) => {
    setShareConfig(prev => ({
      ...prev,
      pinnedWidgets: prev.pinnedWidgets.includes(key)
        ? prev.pinnedWidgets.filter(w => w !== key)
        : [...prev.pinnedWidgets, key],
    }));
  }, []);

  const canShare = userId && results && latestRunId && !shareSaving;

  const handleRunSweep = useCallback(() => {
    if (hasErrors) return;
    if (sweepMode === "1d" && !sweepSelectedParam) return;
    if (sweepMode === "2d" && (!sweepSelectedParam || !sweepSelectedParamB)) return;

    setSweepStatus("running");
    setSweepResults(null);
    setSweepProgress(null);
    setSweepGridError(null);

    if (sweepMode === "2d") {
      // Validate grid size before running
      try {
        generate2DSweepValues(
          { min: sweepMin, max: sweepMax, step: sweepStep },
          { min: sweepMinB, max: sweepMaxB, step: sweepStepB }
        );
      } catch (err) {
        setSweepGridError(err.message);
        setSweepStatus("idle");
        return;
      }

      sweepRunnerRef.current = run2DSweep({
        model,
        paramConfigs: [sweepSelectedParam, sweepSelectedParamB],
        ranges: [
          { min: sweepMin, max: sweepMax, step: sweepStep },
          { min: sweepMinB, max: sweepMaxB, step: sweepStepB },
        ],
        replications,
        baseSeed: seed,
        warmupPeriod,
        maxSimTime: terminationMode === "time" ? maxSimTime : null,
        terminationCondition: terminationMode === "condition" ? terminationCondition : null,
        collectTimeSeries,
        onProgress(progress) {
          setSweepProgress(progress);
        },
        onPointComplete(pointResult) {
          setSweepResults(prev => [...(prev || []), pointResult]);
        },
        onError(error) {
          setSweepStatus("error");
          setSaveStatus({ state: "error", message: `Sweep error at point ${error.pointIndex}: ${error.message}` });
        },
        onComplete(results) {
          setSweepStatus("complete");
          setSweepResults(results);
          setSaveStatus({ state: "success", message: `Sweep complete: ${results.length} points run.` });
        },
        onCancelled(partial) {
          setSweepStatus("complete");
          setSweepResults(partial.results);
          setSaveStatus({ state: "success", message: `Sweep cancelled after ${partial.completedPoints} points.` });
        },
      });
    } else {
      sweepRunnerRef.current = runSweep({
        model,
        paramConfig: sweepSelectedParam,
        min: sweepMin,
        max: sweepMax,
        step: sweepStep,
        replications,
        baseSeed: seed,
        warmupPeriod,
        maxSimTime: terminationMode === "time" ? maxSimTime : null,
        terminationCondition: terminationMode === "condition" ? terminationCondition : null,
        collectTimeSeries,
        onProgress(progress) {
          setSweepProgress(progress);
        },
        onPointComplete(pointResult) {
          setSweepResults(prev => [...(prev || []), pointResult]);
        },
        onError(error) {
          setSweepStatus("error");
          setSaveStatus({ state: "error", message: `Sweep error at point ${error.pointIndex}: ${error.message}` });
        },
        onComplete(results) {
          setSweepStatus("complete");
          setSweepResults(results);
          setSaveStatus({ state: "success", message: `Sweep complete: ${results.length} points run.` });
        },
        onCancelled(partial) {
          setSweepStatus("complete");
          setSweepResults(partial.results);
          setSaveStatus({ state: "success", message: `Sweep cancelled after ${partial.completedPoints} points.` });
        },
      });
    }
  }, [model, sweepMode, sweepSelectedParam, sweepSelectedParamB, sweepMin, sweepMax, sweepStep,
      sweepMinB, sweepMaxB, sweepStepB, replications, seed, warmupPeriod, maxSimTime,
      terminationMode, terminationCondition, collectTimeSeries, hasErrors]);

  const handleCancelSweep = useCallback(() => {
    sweepRunnerRef.current?.cancel();
  }, []);

  const baseUrl = window.location.origin + window.location.pathname.replace(/\/+$/, "");
  const copyToClipboard = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      setSaveStatus({ state: 'success', message: '✓ Copied to clipboard!' });
    } catch {
      setSaveStatus({ state: 'error', message: 'Failed to copy to clipboard.' });
    }
  };

  useEffect(() => {
    if (qrRef.current && qrToken) {
      qrRef.current.innerHTML = qrSvg(`${baseUrl}/#share/${qrToken}`, 180);
    }
  }, [qrToken, baseUrl]);

  return (
    <div style={{ display: "flex", alignItems: "stretch", gap: 14 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14, flex: 1, minWidth: 0 }}>
      {/* Experiment Controls Section */}
      <div style={{ background: "#1a1a1a", border: `1px solid #333`, borderRadius: 8, padding: 16, display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 10, color: "#9ca3af", fontFamily: FONT, letterSpacing: 1.2, fontWeight: 700 }}>WARM-UP PERIOD</span>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <input
                aria-label="Warm-up period"
                type="number"
                value={warmupPeriod}
                onChange={e => { setWarmupPeriod(parseFloat(e.target.value) || 0); setWarmupDetection(null); }}
                style={{ width: 80, background: "transparent", border: `1px solid ${C.border}`,
                  borderRadius: 4, color: C.amber, fontFamily: FONT, fontSize: 12,
                  padding: "6px 8px", outline: "none" }}
              />
              <Btn small variant="ghost" onClick={handleDetectWarmup} disabled={replicationResults.length === 0}>
                Detect
              </Btn>
            </div>
            {warmupDetection && warmupDetection.series.length > 0 && (
              <div style={{ marginTop: 4, display: "flex", flexDirection: "column", gap: 4 }}>
                <div style={{ fontSize: 10, color: C.accent, fontFamily: FONT }}>
                  {warmupDetection.explanation}
                </div>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <Btn small variant="primary" onClick={() => {
                    setWarmupPeriod(Math.round(warmupDetection.truncationPoint));
                    setWarmupDetection(null);
                  }}>
                    Apply t={Math.round(warmupDetection.truncationPoint)}
                  </Btn>
                  <Btn small variant="ghost" onClick={() => setWarmupDetection(null)}>Dismiss</Btn>
                </div>
                {warmupDetection.series.length > 1 && (
                  <WarmupChart series={warmupDetection.series} truncationPoint={warmupDetection.truncationPoint} />
                )}
              </div>
            )}
            {warmupDetection && warmupDetection.series.length === 0 && (
              <div style={{ marginTop: 4, fontSize: 10, color: C.muted, fontFamily: FONT }}>
                {warmupDetection.explanation}
              </div>
            )}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 10, color: "#9ca3af", fontFamily: FONT, letterSpacing: 1.2, fontWeight: 700 }}>REPLICATIONS</span>
            <input
              aria-label="Replication count"
              type="number"
              value={replications}
              onChange={e => setReplications(parseInt(e.target.value) || 0)}
              style={{ width: 80, background: "transparent", border: `1px solid ${C.border}`,
                borderRadius: 4, color: C.amber, fontFamily: FONT, fontSize: 12,
                padding: "6px 8px", outline: "none" }}
            />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 10, color: "#9ca3af", fontFamily: FONT, letterSpacing: 1.2, fontWeight: 700 }}>SEED</span>
            <div style={{ display: "flex", gap: 6 }}>
              <input
                aria-label="Simulation seed"
                type="number"
                value={seed}
                onChange={e => setSeed(parseInt(e.target.value) || 0)}
                style={{ width: 120, background: "transparent", border: `1px solid ${C.border}`,
                  borderRadius: 4, color: C.amber, fontFamily: FONT, fontSize: 12,
                  padding: "6px 8px", outline: "none" }}
              />
              <Btn small variant="ghost" onClick={() => setSeed(Math.floor(Math.random() * 1e9))}>rand</Btn>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 10, color: "#9ca3af", fontFamily: FONT, letterSpacing: 1.2, fontWeight: 700 }}>RUN LABEL</span>
            <input
              aria-label="Run label"
              value={runLabel}
              onChange={e => setRunLabel(e.target.value)}
              placeholder="Baseline"
              style={{ width: 160, background: "transparent", border: `1px solid ${C.border}`,
                borderRadius: 4, color: C.text, fontFamily: FONT, fontSize: 12,
                padding: "6px 8px", outline: "none" }}
            />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 10, color: "#9ca3af", fontFamily: FONT, letterSpacing: 1.2, fontWeight: 700 }}>TERMINATION MODE</span>
            <div style={{ display: "flex", gap: 12, alignItems: "center", height: 32 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 12, color: C.text, fontFamily: FONT }}>
                <input type="radio" name="terminationMode" checked={terminationMode === "time"} onChange={() => setTerminationMode("time")} />
                Time-based
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 12, color: C.text, fontFamily: FONT }}>
                <input type="radio" name="terminationMode" checked={terminationMode === "condition"} onChange={() => setTerminationMode("condition")} />
                Condition-based
              </label>
            </div>
          </div>

          {terminationMode === "time" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={{ fontSize: 10, color: "#9ca3af", fontFamily: FONT, letterSpacing: 1.2, fontWeight: 700 }}>RUN DURATION</span>
              <input
                aria-label="Run duration"
                type="number"
                value={maxSimTime}
                onChange={e => setMaxSimTime(parseFloat(e.target.value) || 0)}
                style={{ width: 100, background: "transparent", border: `1px solid ${C.border}`,
                  borderRadius: 4, color: C.amber, fontFamily: FONT, fontSize: 12,
                  padding: "6px 8px", outline: "none" }}
              />
            </div>
          )}
        </div>

        {terminationMode === "condition" && (
          <div style={{ borderTop: `1px solid #333`, paddingTop: 14 }}>
            <span style={{ fontSize: 10, color: "#9ca3af", fontFamily: FONT, letterSpacing: 1.2, fontWeight: 700, display: "block", marginBottom: 8 }}>STOP CONDITION</span>
            <ConditionBuilder 
              condition={terminationCondition}
              entityTypes={model.entityTypes}
              stateVariables={model.stateVariables}
              queues={model.queues}
              onChange={setTerminationCondition}
            />
          </div>
        )}
      </div>

      {/* Parametric Sweep Section */}
      <div style={{ background: "#1a1a1a", border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden" }}>
        <div
          onClick={() => {
            if (!sweepOpen) setSweepParams(enumerateSweepableParams(model));
            setSweepOpen(o => !o);
          }}
          style={{ padding: "12px 16px", cursor: "pointer", display: "flex", alignItems: "center", gap: 10, userSelect: "none" }}>
          <span style={{ fontSize: 14, color: sweepOpen ? C.accent : C.muted }}>{sweepOpen ? "▼" : "▶"}</span>
          <span style={{ fontSize: 10, color: C.muted, fontFamily: FONT, letterSpacing: 1.2, fontWeight: 700 }}>PARAMETRIC SWEEP</span>
          {sweepStatus === "running" && (
            <span style={{ fontSize: 10, color: C.amber, fontFamily: FONT }}>Running sweep…</span>
          )}
          {sweepStatus === "complete" && (
            <span style={{ fontSize: 10, color: C.green, fontFamily: FONT }}>Complete ({sweepResults?.length} points)</span>
          )}
          {sweepStatus === "error" && (
            <span style={{ fontSize: 10, color: C.red, fontFamily: FONT }}>Error</span>
          )}
        </div>
        {sweepOpen && (
          <div style={{ padding: "0 16px 16px", display: "flex", flexDirection: "column", gap: 12, borderTop: `1px solid ${C.border}` }}>
            {/* Mode toggle */}
            <div style={{ display: "flex", gap: 2, background: C.bg, borderRadius: 5, padding: 2, width: "fit-content" }}>
              <button
                onClick={() => { setSweepMode("1d"); setSweepResults(null); setComparisonResult(null); }}
                style={{ background: sweepMode === "1d" ? "#333" : "transparent", border: "none", borderRadius: 4, color: sweepMode === "1d" ? C.text : C.muted, cursor: "pointer", fontFamily: FONT, fontSize: 11, padding: "5px 12px" }}>
                1D Sweep
              </button>
              <button
                onClick={() => { setSweepMode("2d"); setSweepResults(null); setComparisonResult(null); }}
                style={{ background: sweepMode === "2d" ? "#333" : "transparent", border: "none", borderRadius: 4, color: sweepMode === "2d" ? C.text : C.muted, cursor: "pointer", fontFamily: FONT, fontSize: 11, padding: "5px 12px" }}>
                2D Sweep
              </button>
            </div>

            {/* Parameter picker(s) */}
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={{ fontSize: 10, color: "#9ca3af", fontFamily: FONT, letterSpacing: 1.2, fontWeight: 700 }}>{sweepMode === "2d" ? "PARAMETER X" : "PARAMETER"}</span>
              <select
                aria-label={sweepMode === "2d" ? "Sweep parameter X" : "Sweep parameter"}
                value={sweepSelectedParam ? `${sweepSelectedParam.type}|${sweepSelectedParam.targetId}|${sweepSelectedParam.paramKey || ""}` : ""}
                onChange={e => {
                  const val = e.target.value;
                  if (!val) { setSweepSelectedParam(null); return; }
                  const [type, targetId, paramKey] = val.split("|");
                  const found = sweepParams.find(p => p.type === type && p.targetId === targetId && (p.paramKey || "") === paramKey);
                  setSweepSelectedParam(found || null);
                  if (found) {
                    const cv = typeof found.currentValue === "number" ? found.currentValue : 1;
                    setSweepMin(cv);
                    setSweepMax(cv * 3);
                    setSweepStep(cv > 0 ? cv : 1);
                  }
                }}
                style={{ background: "#111", border: `1px solid ${C.border}`, borderRadius: 4, color: C.text, fontFamily: FONT, fontSize: 12, padding: "7px 8px", outline: "none", width: "100%" }}>
                <option value="">Select a parameter…</option>
                <optgroup label="Entity Type Count">
                  {sweepParams.filter(p => p.type === "entityTypeCount").map(p => (
                    <option key={p.path} value={`${p.type}|${p.targetId}|`}>{p.label} ({p.currentValue})</option>
                  ))}
                </optgroup>
                <optgroup label="Queue Capacity">
                  {sweepParams.filter(p => p.type === "queueCapacity").map(p => (
                    <option key={p.path} value={`${p.type}|${p.targetId}|`}>{p.label} ({p.currentValue === Infinity ? "∞" : p.currentValue})</option>
                  ))}
                </optgroup>
                <optgroup label="Distribution Parameters (B-Events)">
                  {sweepParams.filter(p => p.type === "bEventDistParam").map(p => (
                    <option key={p.path} value={`${p.type}|${p.targetId}|${p.paramKey || ""}`}>{p.label} ({p.currentValue})</option>
                  ))}
                </optgroup>
                <optgroup label="Distribution Parameters (C-Events)">
                  {sweepParams.filter(p => p.type === "cEventDistParam").map(p => (
                    <option key={p.path} value={`${p.type}|${p.targetId}|${p.paramKey || ""}`}>{p.label} ({p.currentValue})</option>
                  ))}
                </optgroup>
                <optgroup label="State Variables">
                  {sweepParams.filter(p => p.type === "stateVarInit").map(p => (
                    <option key={p.path} value={`${p.type}|${p.targetId}|`}>{p.label} ({p.currentValue})</option>
                  ))}
                </optgroup>
              </select>
            </div>

            {sweepMode === "2d" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={{ fontSize: 10, color: "#9ca3af", fontFamily: FONT, letterSpacing: 1.2, fontWeight: 700 }}>PARAMETER Y</span>
                <select
                  aria-label="Sweep parameter Y"
                  value={sweepSelectedParamB ? `${sweepSelectedParamB.type}|${sweepSelectedParamB.targetId}|${sweepSelectedParamB.paramKey || ""}` : ""}
                  onChange={e => {
                    const val = e.target.value;
                    if (!val) { setSweepSelectedParamB(null); return; }
                    const [type, targetId, paramKey] = val.split("|");
                    const found = sweepParams.find(p => p.type === type && p.targetId === targetId && (p.paramKey || "") === paramKey);
                    setSweepSelectedParamB(found || null);
                    if (found) {
                      const cv = typeof found.currentValue === "number" ? found.currentValue : 1;
                      setSweepMinB(cv);
                      setSweepMaxB(cv * 3);
                      setSweepStepB(cv > 0 ? cv : 1);
                    }
                  }}
                  style={{ background: "#111", border: `1px solid ${C.border}`, borderRadius: 4, color: C.text, fontFamily: FONT, fontSize: 12, padding: "7px 8px", outline: "none", width: "100%" }}>
                  <option value="">Select a parameter…</option>
                  <optgroup label="Entity Type Count">
                    {sweepParams.filter(p => p.type === "entityTypeCount").map(p => (
                      <option key={p.path + "_b"} value={`${p.type}|${p.targetId}|`}>{p.label} ({p.currentValue})</option>
                    ))}
                  </optgroup>
                  <optgroup label="Queue Capacity">
                    {sweepParams.filter(p => p.type === "queueCapacity").map(p => (
                      <option key={p.path + "_b"} value={`${p.type}|${p.targetId}|`}>{p.label} ({p.currentValue === Infinity ? "∞" : p.currentValue})</option>
                    ))}
                  </optgroup>
                  <optgroup label="Distribution Parameters (B-Events)">
                    {sweepParams.filter(p => p.type === "bEventDistParam").map(p => (
                      <option key={p.path + "_b"} value={`${p.type}|${p.targetId}|${p.paramKey || ""}`}>{p.label} ({p.currentValue})</option>
                    ))}
                  </optgroup>
                  <optgroup label="Distribution Parameters (C-Events)">
                    {sweepParams.filter(p => p.type === "cEventDistParam").map(p => (
                      <option key={p.path + "_b"} value={`${p.type}|${p.targetId}|${p.paramKey || ""}`}>{p.label} ({p.currentValue})</option>
                    ))}
                  </optgroup>
                  <optgroup label="State Variables">
                    {sweepParams.filter(p => p.type === "stateVarInit").map(p => (
                      <option key={p.path + "_b"} value={`${p.type}|${p.targetId}|`}>{p.label} ({p.currentValue})</option>
                    ))}
                  </optgroup>
                </select>
              </div>
            )}

            {/* Range config */}
            {sweepSelectedParam && (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1, minWidth: 80 }}>
                    <span style={{ fontSize: 10, color: "#9ca3af", fontFamily: FONT, letterSpacing: 1.2, fontWeight: 700 }}>MIN {sweepMode === "2d" ? "X" : ""}</span>
                    <input type="number" aria-label="Sweep min" value={sweepMin}
                      onChange={e => setSweepMin(parseFloat(e.target.value) || 0)}
                      style={{ background: "transparent", border: `1px solid ${C.border}`, borderRadius: 4, color: C.amber, fontFamily: FONT, fontSize: 12, padding: "6px 8px", outline: "none", width: "100%" }} />
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1, minWidth: 80 }}>
                    <span style={{ fontSize: 10, color: "#9ca3af", fontFamily: FONT, letterSpacing: 1.2, fontWeight: 700 }}>MAX {sweepMode === "2d" ? "X" : ""}</span>
                    <input type="number" aria-label="Sweep max" value={sweepMax}
                      onChange={e => setSweepMax(parseFloat(e.target.value) || 0)}
                      style={{ background: "transparent", border: `1px solid ${C.border}`, borderRadius: 4, color: C.amber, fontFamily: FONT, fontSize: 12, padding: "6px 8px", outline: "none", width: "100%" }} />
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1, minWidth: 80 }}>
                    <span style={{ fontSize: 10, color: "#9ca3af", fontFamily: FONT, letterSpacing: 1.2, fontWeight: 700 }}>STEP {sweepMode === "2d" ? "X" : ""}</span>
                    <input type="number" aria-label="Sweep step" value={sweepStep}
                      onChange={e => setSweepStep(parseFloat(e.target.value) || 0)}
                      style={{ background: "transparent", border: `1px solid ${C.border}`, borderRadius: 4, color: C.amber, fontFamily: FONT, fontSize: 12, padding: "6px 8px", outline: "none", width: "100%" }} />
                  </div>
                </div>

                {sweepMode === "2d" && sweepSelectedParamB && (
                  <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1, minWidth: 80 }}>
                      <span style={{ fontSize: 10, color: "#9ca3af", fontFamily: FONT, letterSpacing: 1.2, fontWeight: 700 }}>MIN Y</span>
                      <input type="number" aria-label="Sweep min Y" value={sweepMinB}
                        onChange={e => setSweepMinB(parseFloat(e.target.value) || 0)}
                        style={{ background: "transparent", border: `1px solid ${C.border}`, borderRadius: 4, color: C.amber, fontFamily: FONT, fontSize: 12, padding: "6px 8px", outline: "none", width: "100%" }} />
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1, minWidth: 80 }}>
                      <span style={{ fontSize: 10, color: "#9ca3af", fontFamily: FONT, letterSpacing: 1.2, fontWeight: 700 }}>MAX Y</span>
                      <input type="number" aria-label="Sweep max Y" value={sweepMaxB}
                        onChange={e => setSweepMaxB(parseFloat(e.target.value) || 0)}
                        style={{ background: "transparent", border: `1px solid ${C.border}`, borderRadius: 4, color: C.amber, fontFamily: FONT, fontSize: 12, padding: "6px 8px", outline: "none", width: "100%" }} />
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1, minWidth: 80 }}>
                      <span style={{ fontSize: 10, color: "#9ca3af", fontFamily: FONT, letterSpacing: 1.2, fontWeight: 700 }}>STEP Y</span>
                      <input type="number" aria-label="Sweep step Y" value={sweepStepB}
                        onChange={e => setSweepStepB(parseFloat(e.target.value) || 0)}
                        style={{ background: "transparent", border: `1px solid ${C.border}`, borderRadius: 4, color: C.amber, fontFamily: FONT, fontSize: 12, padding: "6px 8px", outline: "none", width: "100%" }} />
                    </div>
                  </div>
                )}

                {/* 2D point counter + validation */}
                {sweepMode === "2d" && sweepSelectedParamB && (
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 11, color: C.muted, fontFamily: FONT }}>
                      {(() => {
                        try {
                          const grid = generate2DSweepValues(
                            { min: sweepMin, max: sweepMax, step: sweepStep },
                            { min: sweepMinB, max: sweepMaxB, step: sweepStepB }
                          );
                          const rows = Math.round(grid.length / (grid.filter(p => p.valueA === grid[0].valueA).length || 1));
                          const cols = grid.filter(p => p.valueA === grid[0].valueA).length;
                          return `${rows} x ${cols} = ${grid.length} points`;
                        } catch (err) {
                          return err.message;
                        }
                      })()}
                    </span>
                  </div>
                )}

                {sweepGridError && (
                  <div style={{ fontSize: 11, color: C.red, fontFamily: FONT, background: C.red + "12", border: `1px solid ${C.red}44`, borderRadius: 4, padding: "6px 10px" }}>
                    {sweepGridError}
                  </div>
                )}

                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <Btn variant="primary" onClick={handleRunSweep}
                    disabled={sweepStatus === "running" || hasErrors || (sweepMode === "2d" && (!sweepSelectedParam || !sweepSelectedParamB))}>
                    {sweepStatus === "running" ? "Running…" : "Run Sweep"}
                  </Btn>
                  {sweepStatus === "running" && (
                    <Btn variant="danger" onClick={handleCancelSweep}>Cancel</Btn>
                  )}
                </div>
              </div>
            )}

            {/* Sweep progress */}
            {sweepStatus === "running" && sweepProgress && (
              <div style={{ fontSize: 11, color: C.muted, fontFamily: FONT }}>
                Point {sweepProgress.currentPoint + 1} / {sweepProgress.totalPoints}
                {sweepMode === "2d" && sweepProgress.gridSize && (
                  <span> — Grid: {sweepProgress.gridSize.rows} x {sweepProgress.gridSize.cols}</span>
                )}
                {sweepProgress.pointReplications && (
                  <span> — Replications: {sweepProgress.pointReplications.completed}/{sweepProgress.pointReplications.total}</span>
                )}
              </div>
            )}

            {/* Sweep results */}
            {sweepStatus === "complete" && sweepResults && sweepResults.length > 0 && (
              <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 12, display: "flex", flexDirection: "column", gap: 12 }}>
                {/* KPI metric picker */}
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 10, color: "#9ca3af", fontFamily: FONT, letterSpacing: 1.2, fontWeight: 700 }}>KPI</span>
                  <select aria-label="Sweep KPI metric"
                    value={sweepKpiMetric}
                    onChange={e => setSweepKpiMetric(e.target.value)}
                    style={{ background: "#111", border: `1px solid ${C.border}`, borderRadius: 4, color: C.text, fontFamily: FONT, fontSize: 12, padding: "5px 8px", outline: "none" }}>
                    {CI_METRICS.map(m => (
                      <option key={m} value={m}>{METRIC_LABELS[m]}</option>
                    ))}
                  </select>
                </div>

                {/* 1D results: line chart + table */}
                {sweepMode === "1d" && (
                  <>
                    <SweepChart results={sweepResults} metric={sweepKpiMetric} paramLabel={sweepSelectedParam?.label || ""} />
                    <div style={{ overflowX: "auto" }}>
                      <table style={{ width: "100%", borderCollapse: "collapse", color: C.text, fontSize: 12, textAlign: "left" }}>
                        <thead>
                          <tr style={{ color: C.muted, borderBottom: `1px solid ${C.border}` }}>
                            <th style={{ padding: "6px 8px" }}>{sweepSelectedParam?.label || "Value"}</th>
                            <th style={{ padding: "6px 8px" }}>Served</th>
                            <th style={{ padding: "6px 8px" }}>Avg wait</th>
                            <th style={{ padding: "6px 8px" }}>Avg service</th>
                            <th style={{ padding: "6px 8px" }}>Avg sojourn</th>
                            <th style={{ padding: "6px 8px" }}>Reneged</th>
                            <th style={{ padding: "6px 8px" }}>Reps</th>
                          </tr>
                        </thead>
                        <tbody>
                          {sweepResults.map((pt, i) => (
                            <tr key={i} style={{ borderBottom: `1px solid ${C.border}` }}>
                              <td style={{ padding: "6px 8px", color: C.amber, fontWeight: 700 }}>{pt.value}</td>
                              <td style={{ padding: "6px 8px" }}>{fmt(pt.aggregateStats["summary.served"]?.mean)}</td>
                              <td style={{ padding: "6px 8px" }}>{fmt(pt.aggregateStats["summary.avgWait"]?.mean)}</td>
                              <td style={{ padding: "6px 8px" }}>{fmt(pt.aggregateStats["summary.avgSvc"]?.mean)}</td>
                              <td style={{ padding: "6px 8px" }}>{fmt(pt.aggregateStats["summary.avgSojourn"]?.mean)}</td>
                              <td style={{ padding: "6px 8px" }}>{fmt(pt.aggregateStats["summary.reneged"]?.mean)}</td>
                              <td style={{ padding: "6px 8px" }}>{pt.replications?.length || 0}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}

                {/* 2D results: grid table with color */}
                {sweepMode === "2d" && (
                  <>
                    <Sweep2DGrid
                      results={sweepResults}
                      metric={sweepKpiMetric}
                      paramLabelA={sweepSelectedParam?.label || "X"}
                      paramLabelB={sweepSelectedParamB?.label || "Y"}
                      onCellClick={cell => setSelectedCell(cell)}
                    />
                    {selectedCell && (
                      <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 6, padding: 12 }}>
                        <div style={{ fontSize: 10, color: C.accent, fontFamily: FONT, letterSpacing: 1.2, fontWeight: 700, marginBottom: 8 }}>
                          CELL STATS — {sweepSelectedParam?.label || "X"}={fmt(selectedCell.valueA)}, {sweepSelectedParamB?.label || "Y"}={fmt(selectedCell.valueB)}
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 6 }}>
                          {CI_METRICS.map(m => {
                            const s = selectedCell.aggregateStats[m];
                            return (
                              <div key={m} style={{ background: "#111", border: `1px solid ${C.border}`, borderRadius: 4, padding: "4px 6px", textAlign: "center" }}>
                                <div style={{ fontSize: 8, color: C.muted, fontFamily: FONT, marginBottom: 2 }}>{METRIC_LABELS[m] || m}</div>
                                <div style={{ fontSize: 11, fontWeight: 700, color: C.accent, fontFamily: FONT }}>{s?.mean != null ? fmt(s.mean) : "—"}</div>
                                <div style={{ fontSize: 9, color: C.muted, fontFamily: FONT }}>n={s?.n || 0}</div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </>
                )}

                {/* Scenario comparison — 2D cell selector */}
                {sweepMode === "2d" && sweepResults && sweepResults.length > 0 && (
                  <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 12, display: "flex", flexDirection: "column", gap: 10 }}>
                    <span style={{ fontSize: 10, color: C.muted, fontFamily: FONT, letterSpacing: 1.2, fontWeight: 700 }}>SCENARIO COMPARISON</span>
                    <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
                      <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1, minWidth: 120 }}>
                        <span style={{ fontSize: 10, color: "#9ca3af", fontFamily: FONT }}>Cell A</span>
                        <select aria-label="Cell A" value={comparisonIdxA}
                          onChange={e => { setComparisonIdxA(parseInt(e.target.value)); setComparisonResult(null); }}
                          style={{ background: "#111", border: `1px solid ${C.border}`, borderRadius: 4, color: C.text, fontFamily: FONT, fontSize: 12, padding: "5px 8px", outline: "none" }}>
                          {sweepResults.map((pt, i) => (
                            <option key={i} value={i}>
                              {sweepSelectedParam?.label || "X"}={fmt(pt.valueA)}, {sweepSelectedParamB?.label || "Y"}={fmt(pt.valueB)}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1, minWidth: 120 }}>
                        <span style={{ fontSize: 10, color: "#9ca3af", fontFamily: FONT }}>Cell B</span>
                        <select aria-label="Cell B" value={comparisonIdxB ?? ""}
                          onChange={e => { setComparisonIdxB(parseInt(e.target.value) || null); setComparisonResult(null); }}
                          style={{ background: "#111", border: `1px solid ${C.border}`, borderRadius: 4, color: C.text, fontFamily: FONT, fontSize: 12, padding: "5px 8px", outline: "none" }}>
                          <option value="">Select…</option>
                          {sweepResults.map((pt, i) => (
                            i !== comparisonIdxA ? (
                              <option key={i} value={i}>
                                {sweepSelectedParam?.label || "X"}={fmt(pt.valueA)}, {sweepSelectedParamB?.label || "Y"}={fmt(pt.valueB)}
                              </option>
                            ) : null
                          ))}
                        </select>
                      </div>
                      <Btn variant="primary" onClick={() => {
                        if (comparisonIdxB == null) return;
                        const repsA = sweepResults[comparisonIdxA]?.replications || [];
                        const repsB = sweepResults[comparisonIdxB]?.replications || [];
                        const ptA = sweepResults[comparisonIdxA];
                        const ptB = sweepResults[comparisonIdxB];
                        const result = compareScenarios(repsA, repsB, CI_METRICS, {
                          labelA: `${sweepSelectedParam?.label || "X"}=${fmt(ptA.valueA)}, ${sweepSelectedParamB?.label || "Y"}=${fmt(ptA.valueB)}`,
                          labelB: `${sweepSelectedParam?.label || "X"}=${fmt(ptB.valueA)}, ${sweepSelectedParamB?.label || "Y"}=${fmt(ptB.valueB)}`,
                        });
                        const meansA = {}; const meansB = {};
                        for (const m of CI_METRICS) {
                          const valsA = repsA.map(r => { const parts = m.split("."); let v = r?.result || r; for (const p of parts) v = v?.[p]; return v; }).filter(Number.isFinite);
                          const valsB = repsB.map(r => { const parts = m.split("."); let v = r?.result || r; for (const p of parts) v = v?.[p]; return v; }).filter(Number.isFinite);
                          meansA[m] = valsA.length > 0 ? valsA.reduce((s, v) => s + v, 0) / valsA.length : null;
                          meansB[m] = valsB.length > 0 ? valsB.reduce((s, v) => s + v, 0) / valsB.length : null;
                        }
                        setComparisonResult({ ...result, meansA, meansB });
                      }} disabled={comparisonIdxB == null}>
                        Compare
                      </Btn>
                    </div>

                    {comparisonResult && (
                      <div style={{ overflowX: "auto" }}>
                        <table style={{ width: "100%", borderCollapse: "collapse", color: C.text, fontSize: 12, textAlign: "left" }}>
                          <thead>
                            <tr style={{ color: C.muted, borderBottom: `1px solid ${C.border}` }}>
                              <th style={{ padding: "6px 8px" }}>KPI</th>
                              <th style={{ padding: "6px 8px", textAlign: "right" }}>{comparisonResult.labels.a}</th>
                              <th style={{ padding: "6px 8px", textAlign: "right" }}>{comparisonResult.labels.b}</th>
                              <th style={{ padding: "6px 8px", textAlign: "right" }}>Difference</th>
                              <th style={{ padding: "6px 8px", textAlign: "right" }}>95% CI</th>
                              <th style={{ padding: "6px 8px" }}>Significant?</th>
                            </tr>
                          </thead>
                          <tbody>
                            {comparisonResult.comparisons.map((c, i) => {
                              const meanA = comparisonResult.meansA?.[c.metric];
                              const meanB = comparisonResult.meansB?.[c.metric];
                              return (
                                <tr key={i} style={{ borderBottom: `1px solid ${C.border}` }}>
                                  <td style={{ padding: "6px 8px", color: C.accent }}>{METRIC_LABELS[c.metric] || c.metric}</td>
                                  <td style={{ padding: "6px 8px", textAlign: "right" }}>{meanA != null ? fmt(meanA) : "—"}</td>
                                  <td style={{ padding: "6px 8px", textAlign: "right" }}>{meanB != null ? fmt(meanB) : "—"}</td>
                                  <td style={{ padding: "6px 8px", textAlign: "right", fontWeight: 700, color: c.significant95 ? (c.meanDiff > 0 ? C.green : C.red) : C.muted }}>
                                    {c.meanDiff != null ? (c.meanDiff > 0 ? "+" : "") + fmt(c.meanDiff) : "—"}
                                  </td>
                                  <td style={{ padding: "6px 8px", textAlign: "right", color: C.muted, fontSize: 11 }}>
                                    {c.lower != null && c.upper != null ? `[${fmt(c.lower)}, ${fmt(c.upper)}]` : "—"}
                                  </td>
                                  <td style={{ padding: "6px 8px" }}>
                                    {c.significant95 ? (
                                      <span style={{ color: c.significant99 ? C.green : C.amber, fontWeight: 700 }}>
                                        {c.significant99 ? "Yes (99%)" : "Yes (95%)"}
                                      </span>
                                    ) : (
                                      <span style={{ color: C.muted }}>No</span>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}

                {/* Scenario comparison — 1D flat index */}
                {sweepMode === "1d" && (
                  <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 12, display: "flex", flexDirection: "column", gap: 10 }}>
                    <span style={{ fontSize: 10, color: C.muted, fontFamily: FONT, letterSpacing: 1.2, fontWeight: 700 }}>SCENARIO COMPARISON</span>
                    <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
                      <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1, minWidth: 120 }}>
                        <span style={{ fontSize: 10, color: "#9ca3af", fontFamily: FONT }}>Scenario A</span>
                        <select aria-label="Scenario A" value={comparisonIdxA}
                          onChange={e => { setComparisonIdxA(parseInt(e.target.value)); setComparisonResult(null); }}
                          style={{ background: "#111", border: `1px solid ${C.border}`, borderRadius: 4, color: C.text, fontFamily: FONT, fontSize: 12, padding: "5px 8px", outline: "none" }}>
                          {sweepResults.map((pt, i) => (
                            <option key={i} value={i}>{sweepSelectedParam?.label || "Value"} = {pt.value}</option>
                          ))}
                        </select>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1, minWidth: 120 }}>
                        <span style={{ fontSize: 10, color: "#9ca3af", fontFamily: FONT }}>Scenario B</span>
                        <select aria-label="Scenario B" value={comparisonIdxB ?? ""}
                          onChange={e => { setComparisonIdxB(parseInt(e.target.value) || null); setComparisonResult(null); }}
                          style={{ background: "#111", border: `1px solid ${C.border}`, borderRadius: 4, color: C.text, fontFamily: FONT, fontSize: 12, padding: "5px 8px", outline: "none" }}>
                          <option value="">Select…</option>
                          {sweepResults.map((pt, i) => (
                            i !== comparisonIdxA ? <option key={i} value={i}>{sweepSelectedParam?.label || "Value"} = {pt.value}</option> : null
                          ))}
                        </select>
                      </div>
                      <Btn variant="primary" onClick={() => {
                        if (comparisonIdxB == null) return;
                        const repsA = sweepResults[comparisonIdxA]?.replications || [];
                        const repsB = sweepResults[comparisonIdxB]?.replications || [];
                        const result = compareScenarios(repsA, repsB, CI_METRICS, {
                          labelA: `${sweepSelectedParam?.label || "Value"} = ${sweepResults[comparisonIdxA].value}`,
                          labelB: `${sweepSelectedParam?.label || "Value"} = ${sweepResults[comparisonIdxB].value}`,
                        });
                        const meansA = {}; const meansB = {};
                        for (const m of CI_METRICS) {
                          const valsA = repsA.map(r => { const parts = m.split("."); let v = r?.result || r; for (const p of parts) v = v?.[p]; return v; }).filter(Number.isFinite);
                          const valsB = repsB.map(r => { const parts = m.split("."); let v = r?.result || r; for (const p of parts) v = v?.[p]; return v; }).filter(Number.isFinite);
                          meansA[m] = valsA.length > 0 ? valsA.reduce((s, v) => s + v, 0) / valsA.length : null;
                          meansB[m] = valsB.length > 0 ? valsB.reduce((s, v) => s + v, 0) / valsB.length : null;
                        }
                        setComparisonResult({ ...result, meansA, meansB });
                      }} disabled={comparisonIdxB == null}>
                        Compare
                      </Btn>
                    </div>

                    {comparisonResult && (
                      <div style={{ overflowX: "auto" }}>
                        <table style={{ width: "100%", borderCollapse: "collapse", color: C.text, fontSize: 12, textAlign: "left" }}>
                          <thead>
                            <tr style={{ color: C.muted, borderBottom: `1px solid ${C.border}` }}>
                              <th style={{ padding: "6px 8px" }}>KPI</th>
                              <th style={{ padding: "6px 8px", textAlign: "right" }}>{comparisonResult.labels.a}</th>
                              <th style={{ padding: "6px 8px", textAlign: "right" }}>{comparisonResult.labels.b}</th>
                              <th style={{ padding: "6px 8px", textAlign: "right" }}>Difference</th>
                              <th style={{ padding: "6px 8px", textAlign: "right" }}>95% CI</th>
                              <th style={{ padding: "6px 8px" }}>Significant?</th>
                            </tr>
                          </thead>
                          <tbody>
                            {comparisonResult.comparisons.map((c, i) => {
                              const meanA = comparisonResult.meansA?.[c.metric];
                              const meanB = comparisonResult.meansB?.[c.metric];
                              return (
                                <tr key={i} style={{ borderBottom: `1px solid ${C.border}` }}>
                                  <td style={{ padding: "6px 8px", color: C.accent }}>{METRIC_LABELS[c.metric] || c.metric}</td>
                                  <td style={{ padding: "6px 8px", textAlign: "right" }}>{meanA != null ? fmt(meanA) : "—"}</td>
                                  <td style={{ padding: "6px 8px", textAlign: "right" }}>{meanB != null ? fmt(meanB) : "—"}</td>
                                  <td style={{ padding: "6px 8px", textAlign: "right", fontWeight: 700, color: c.significant95 ? (c.meanDiff > 0 ? C.green : C.red) : C.muted }}>
                                    {c.meanDiff != null ? (c.meanDiff > 0 ? "+" : "") + fmt(c.meanDiff) : "—"}
                                  </td>
                                  <td style={{ padding: "6px 8px", textAlign: "right", color: C.muted, fontSize: 11 }}>
                                    {c.lower != null && c.upper != null ? `[${fmt(c.lower)}, ${fmt(c.upper)}]` : "—"}
                                  </td>
                                  <td style={{ padding: "6px 8px" }}>
                                    {c.significant95 ? (
                                      <span style={{ color: c.significant99 ? C.green : C.amber, fontWeight: 700 }}>
                                        {c.significant99 ? "Yes (99%)" : "Yes (95%)"}
                                      </span>
                                    ) : (
                                      <span style={{ color: C.muted }}>No</span>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <div style={{ background: "#1a1a1a", border: `1px solid #333`, borderRadius: 8, padding: 14, display: "flex", gap: 10, rowGap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <Btn variant="primary" onClick={initEngine} disabled={hasErrors || batchActive}>⟳ Reset</Btn>
        <Btn variant="success" onClick={doStep} disabled={mode === "done" || hasErrors || batchActive}>⏭ Step</Btn>
        <Btn variant={autoRunning ? "danger" : "amber"} onClick={toggleAuto} disabled={hasErrors || batchActive}>{autoRunning ? "Stop Auto" : "Auto Run"}</Btn>
        <Btn variant="ghost" onClick={doRunAll} disabled={hasErrors || batchActive || saveStatus?.state === 'saving' || saveInProgressRef.current}>⚡ Run All</Btn>
        <Btn variant="ghost" onClick={exportResultsJson} disabled={!canExportResults}>Export Results</Btn>
        <Btn variant="ghost" onClick={exportResultsCsv} disabled={!canExportResults}>Export Results CSV</Btn>
        <Btn variant="ghost" onClick={() => { setShowShareModal(true); loadShareLinks(); }} disabled={!canShare}>Share</Btn>
        <Btn variant={aiPanelOpen ? "primary" : "ghost"} onClick={() => setAiPanelOpen(open => !open)}>AI Insights</Btn>
        <Btn variant="ghost" onClick={toggleAnimation} title="Toggle entity token animation">
          {animationEnabled ? "● Animate" : "○ Animate"}
        </Btn>
        <label style={{ display: "flex", alignItems: "center", gap: 5, cursor: "pointer", fontSize: 11, color: collectTimeSeries ? C.accent : "#9ca3af", fontFamily: FONT }}
          title="Disable to reduce memory on long runs (charts won't have queue depth / utilisation)">
          <input type="checkbox" checked={collectTimeSeries} onChange={e => setCollectTimeSeries(e.target.checked)} style={{ accentColor: C.accent }}/>
          Collect time-series
        </label>
        {batchActive && <Btn variant="danger" onClick={cancelBatch} disabled={batchStatus === "cancelling"}>Cancel Batch</Btn>}
        <div style={{ flex: 1, minWidth: 12 }} />
        {/* Speed slider (F9C.10) */}
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 10, color: "#9ca3af", fontFamily: FONT, whiteSpace: "nowrap" }}>
            Speed {speedMultiplier.toFixed(1)}×
          </span>
          <input
            aria-label="Animation speed multiplier"
            type="range"
            min={0.5} max={10} step={0.5}
            value={speedMultiplier}
            onChange={e => setSpeedMultiplier(parseFloat(e.target.value))}
            style={{ width: 80, accentColor: "#06b6d4" }}
          />
        </div>
      </div>

      {validation.errors.length > 0 && (
        <div role="alert" style={{ background: '#7f1d1d', border: '1px solid #dc2626', borderRadius: 6,
          padding: 12, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#fca5a5', fontFamily: FONT, marginBottom: 4 }}>
            Model has {validation.errors.length} blocking error{validation.errors.length > 1 ? 's' : ''} — fix before running:
          </div>
          {validation.errors.map((e, i) => (
            <div key={i} style={{ fontSize: 12, color: '#fca5a5', fontFamily: FONT }}>
              [{e.code}] {e.message}
            </div>
          ))}
        </div>
      )}

      {validation.errors.length === 0 && validation.warnings.length > 0 && (
        <div style={{ background: '#78350f', border: '1px solid #d97706', borderRadius: 6, padding: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#fde68a', fontFamily: FONT, marginBottom: 4 }}>
            {validation.warnings.length} warning{validation.warnings.length > 1 ? 's' : ''} — run will proceed:
          </div>
          {validation.warnings.map((w, i) => (
            <div key={i} style={{ fontSize: 12, color: '#fde68a', fontFamily: FONT }}>
              [{w.code}] {w.message}
            </div>
          ))}
        </div>
      )}

      {phaseCTruncated && model.maxCPasses && (
        <div style={{ background: C.amber + '18', border: `1px solid ${C.amber}44`, borderRadius: 6, padding: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: C.amber, fontFamily: FONT }}>
            Phase C scan hit the {model.maxCPasses}-pass cap — model may have an unstable or conflicting C-event condition
          </div>
          <div style={{ fontSize: 11, color: C.amber, fontFamily: FONT, marginTop: 4, opacity: 0.8 }}>
            Check your C-event conditions for cycles or conditions that never become false.
          </div>
        </div>
      )}

      {saveStatus && (
        <div style={{
          background: saveStatus.state === 'error' ? '#7f1d1d' : saveStatus.state === 'success' ? '#1b4332' : '#1f2937',
          border: `1px solid ${saveStatus.state === 'error' ? '#dc2626' : saveStatus.state === 'success' ? '#31a24c' : '#4b5563'}`,
          borderRadius: 6, padding: 12, color: saveStatus.state === 'error' ? '#fca5a5' : saveStatus.state === 'success' ? '#86efac' : '#e5e7eb',
          fontSize: 12, fontFamily: FONT,
        }}>
          {saveStatus.message}
        </div>
      )}

      {runLabel.trim() && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 10, color: C.muted, fontFamily: FONT, letterSpacing: 1.2, fontWeight: 700 }}>RUN LABEL</span>
          <Tag label={runLabel.trim()} color={C.accent} />
        </div>
      )}

      {(batchStatus !== "idle" || replicationResults.length > 0) && (
        <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 8, padding: 14, display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
            <div style={{ fontSize: 10, color: C.muted, fontFamily: FONT, letterSpacing: 1.2, fontWeight: 700 }}>REPLICATION BATCH</div>
            <Tag label={batchStatus} color={batchStatus === "complete" ? C.green : batchStatus === "error" || batchStatus === "cancelled" ? C.red : C.amber} />
            <div style={{ fontSize: 12, color: C.text, fontFamily: FONT }}>
              {batchStatus === "complete"
                ? `${replicationResults.length} replications complete`
                : `Running ${batchProgress?.completed || replicationResults.length}/${batchProgress?.total || replications}`}
            </div>
            {batchStatus !== "complete" && (
              <div style={{ fontSize: 12, color: C.muted, fontFamily: FONT }}>
                Pool: {batchProgress?.workerCount || "—"} · Running: {batchProgress?.running || 0} · Pending: {batchProgress?.pending || 0}
              </div>
            )}
          </div>

          {/* Aggregate KPI summary — shown prominently at the top only when complete */}
          {batchStatus === "complete" && Object.values(aggregateStats).some(stat => stat.n >= 2) && (
            <div style={{
              background: `${C.green}0d`,
              border: `1px solid ${C.green}44`,
              borderRadius: 6,
              padding: 14,
              display: "flex",
              flexDirection: "column",
              gap: 12,
            }}>
              <div style={{ fontSize: 10, color: C.green, fontFamily: FONT, letterSpacing: 1.5, fontWeight: 700 }}>
                AGGREGATE RESULTS — {replicationResults.length} REPLICATIONS
              </div>
              <div style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
                gap: 10,
              }}>
                {CI_METRICS.map(metric => {
                  const stat = aggregateStats[metric];
                  if (!stat || stat.n < 2) return null;
                  return (
                    <div key={metric} style={{
                      background: C.surface,
                      border: `1px solid ${C.border}`,
                      borderRadius: 5,
                      padding: "10px 12px",
                    }}>
                      <div style={{ fontSize: 10, color: C.muted, fontFamily: FONT, marginBottom: 4 }}>
                        {METRIC_LABELS[metric]}
                      </div>
                      <div style={{ fontSize: 18, fontWeight: 700, color: C.accent, fontFamily: FONT }}>
                        {fmt(stat.mean)}
                      </div>
                      <div style={{ fontSize: 10, color: C.muted, fontFamily: FONT, marginTop: 2 }}>
                        ±{fmt(stat.halfWidth)} (95% CI)
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Individual replication rows */}
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", color: C.text, fontSize: 12, textAlign: "left", tableLayout: "fixed" }}>
              <thead>
                <tr style={{ color: C.muted, borderBottom: `1px solid ${C.border}` }}>
                  <th style={{ padding: 8 }}>Rep #</th>
                  <th style={{ padding: 8 }}>Seed</th>
                  <th style={{ padding: 8 }}>Served</th>
                  <th style={{ padding: 8 }}>Avg wait</th>
                  <th style={{ padding: 8 }}>Avg service</th>
                  <th style={{ padding: 8 }}>Avg sojourn</th>
                  <th style={{ padding: 8 }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {replicationResults.map(payload => (
                  <tr key={payload.replicationIndex} style={{ borderBottom: `1px solid ${C.border}` }}>
                    <td style={{ padding: 8 }}>{payload.replicationIndex + 1}</td>
                    <td style={{ padding: 8, color: C.amber }}>{payload.seed}</td>
                    <td style={{ padding: 8 }}>{payload.result?.summary?.served ?? "—"}</td>
                    <td style={{ padding: 8 }}>{fmt(payload.result?.summary?.avgWait)}</td>
                    <td style={{ padding: 8 }}>{fmt(payload.result?.summary?.avgSvc)}</td>
                    <td style={{ padding: 8 }}>{fmt(payload.result?.summary?.avgSojourn)}</td>
                    <td style={{ padding: 8 }}><Tag label="complete" color={C.green} /></td>
                  </tr>
                ))}
                {!replicationResults.length && (
                  <tr>
                    <td colSpan={7} style={{ padding: 8, color: C.muted }}>Waiting for first replication result...</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* CI confidence-interval table — live-updates as reps complete, always shown when n≥2 */}
          {Object.values(aggregateStats).some(stat => stat.n >= 2) && (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", color: C.text, fontSize: 12, textAlign: "left", tableLayout: "fixed" }}>
                <thead>
                  <tr style={{ color: C.muted, borderBottom: `1px solid ${C.border}` }}>
                    <th style={{ padding: 8 }}>Metric</th>
                    <th style={{ padding: 8 }}>Mean</th>
                    <th style={{ padding: 8 }}>Lower 95%</th>
                    <th style={{ padding: 8 }}>Upper 95%</th>
                    <th style={{ padding: 8 }}>Half-width</th>
                    <th style={{ padding: 8 }}>n</th>
                  </tr>
                </thead>
                <tbody>
                  {CI_METRICS.map(metric => {
                    const stat = aggregateStats[metric];
                    if (!stat || stat.n < 2) return null;
                    return (
                      <tr key={metric} style={{ borderBottom: `1px solid ${C.border}` }}>
                        <td style={{ padding: 8 }}>{METRIC_LABELS[metric]}</td>
                        <td style={{ padding: 8, color: C.accent }}>{fmt(stat.mean)}</td>
                        <td style={{ padding: 8 }}>{fmt(stat.lower)}</td>
                        <td style={{ padding: 8 }}>{fmt(stat.upper)}</td>
                        <td style={{ padding: 8, color: C.amber }}>{fmt(stat.halfWidth)}</td>
                        <td style={{ padding: 8 }}>{stat.n}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {view === "visual" && (() => {
        const hasDerivableGraph = !!(model.queues?.length || model.bEvents?.length || model.cEvents?.length);
        if (hasDerivableGraph) {
          return (
            <>
              <Suspense fallback={<VisualView snap={currentSnap} model={model} summary={results?.summary} />}>
                <ExecuteCanvas
                  snap={currentSnap}
                  model={model}
                  summary={results?.summary}
                  animationEnabled={animationEnabled}
                  kpiSlots={kpiSlots}
                  onKpiSlotChange={handleKpiSlotChange}
                  onNodeSelect={setSelectedNodeLabel}
                />
              </Suspense>
              <BottomPanel
                log={log}
                snap={currentSnap}
                model={model}
                results={results}
                selectedNodeLabel={selectedNodeLabel}
                onClearFilter={() => setSelectedNodeLabel(null)}
                replicationResults={replicationResults}
                warmupDetection={warmupDetection}
              />
            </>
          );
        }
        return <VisualView snap={currentSnap} model={model} summary={results?.summary} />;
      })()}

      {view === "log" && (
        <div style={{ background: "#050505", border: `1px solid #333`, borderRadius: 6, padding: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, paddingBottom: 10, borderBottom: `1px solid #333` }}>
            <div style={{ fontSize: 10, color: "#9ca3af", fontFamily: FONT, letterSpacing: 1.5, fontWeight: 700 }}>SIMULATION LOG (NEWEST FIRST)</div>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#a78bfa", fontFamily: FONT }}>
              Steps: {log.length} | Clock: {currentSnap?.clock?.toFixed(0) || '—'}
            </div>
          </div>
          <div style={{ maxHeight: 350, overflowY: 'auto' }}>
            {log.length === 0 ? <div style={{ color: "#444", fontSize: 12 }}>Log empty. Run simulation to see events.</div> :
              [...log].reverse().map((r, i) => (
                <div key={i}>
                  {r.phase === "WARMUP" && (
                    <div style={{ padding: "12px 0", borderBottom: "1px solid #333", borderTop: "1px solid #333", margin: "8px 0", textAlign: "center", color: C.amber, fontSize: 11, fontWeight: 700, letterSpacing: 1.5, background: "#78350f22" }}>
                      ──── WARM-UP ENDED AT T={r.time?.toFixed(0)} ────
                    </div>
                  )}
                  <div style={{ fontSize: 12, fontFamily: "monospace", color: r.phase === "WARMUP" ? C.amber : "#10b981", borderBottom: "1px solid #1a1a1a", padding: "4px 0" }}>
                    <span style={{ color: "#666" }}>[t={r.time?.toFixed(0)}]</span> <PhaseTag phase={r.phase} /> {r.message}
                  </div>
                </div>
              ))
            }
          </div>
        </div>
      )}

      {view === "entities" && currentSnap && (
        <div style={{ background: "#050505", border: `1px solid #333`, borderRadius: 6, padding: 14 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", color: "#fff", fontSize: 12, textAlign: "left" }}>
            <thead>
              <tr style={{ color: "#888", borderBottom: "2px solid #333" }}>
                <th style={{ padding: 8 }}>Entity</th><th style={{ padding: 8 }}>Type</th><th style={{ padding: 8 }}>Status</th><th style={{ padding: 8 }}>Queue</th>
              </tr>
            </thead>
            <tbody>
              {currentSnap.entities.map(e => (
                <tr key={e.id} style={{ borderBottom: "1px solid #1a1a1a" }}>
                  <td style={{ padding: 8, color: "#38bdf8" }}>#{e.id}</td>
                  <td style={{ padding: 8 }}>{e.type}</td>
                  <td style={{ padding: 8 }}><Tag label={e.status} color={e.status === 'waiting' ? "#f59e0b" : "#10b981"} /></td>
                  <td style={{ padding: 8, color: "#666" }}>{e.queue || "None"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      </div>

      {aiPanelOpen && (
        <AiAssistantPanel
          model={model}
          results={results}
          exportConfig={exportConfig}
          aggregateStats={aggregateStats}
          comparisonRuns={comparisonRuns}
          comparisonLoading={runHistoryStatus === "loading"}
          comparisonError={runHistoryError}
          onClose={() => setAiPanelOpen(false)}
        />
      )}

      {/* Share Modal */}
      {showShareModal && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "#000000aa", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}
          onClick={() => { setShowShareModal(false); setQrToken(null); }}>
          <div role="dialog" aria-modal="true" aria-labelledby="share-modal-title"
            onClick={e => e.stopPropagation()}
            style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 10, width: 520, maxWidth: "95vw", maxHeight: "90vh", overflowY: "auto", padding: 24, display: "flex", flexDirection: "column", gap: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h2 id="share-modal-title" style={{ fontSize: 16, fontWeight: 700, color: C.text, fontFamily: FONT }}>Share Results</h2>
              <button type="button" onClick={() => { setShowShareModal(false); setQrToken(null); }}
                style={{ background: "none", border: "none", color: C.muted, fontSize: 18, cursor: "pointer", fontFamily: FONT, padding: "0 4px" }}>✕</button>
            </div>

            {/* Widget picker */}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ fontSize: 10, color: C.muted, fontFamily: FONT, letterSpacing: 1.2, fontWeight: 700 }}>VISIBLE WIDGETS</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {[
                  { key: "summary", label: "Summary KPIs" },
                  { key: "queues", label: "Queue table" },
                  { key: "resources", label: "Server table" },
                  { key: "charts", label: "Charts & histograms" },
                ].map(w => (
                  <label key={w.key} style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 11, color: shareConfig.pinnedWidgets.includes(w.key) ? C.accent : C.muted, fontFamily: FONT }}>
                    <input type="checkbox" checked={shareConfig.pinnedWidgets.includes(w.key)} onChange={() => toggleWidget(w.key)} style={{ accentColor: C.accent }} />
                    {w.label}
                  </label>
                ))}
              </div>
            </div>

            {/* Create link */}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ fontSize: 10, color: C.muted, fontFamily: FONT, letterSpacing: 1.2, fontWeight: 700 }}>CREATE SHARE LINK</div>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  aria-label="Share title"
                  placeholder="Optional title..."
                  value={shareConfig.title}
                  onChange={e => setShareConfig(prev => ({ ...prev, title: e.target.value }))}
                  style={{ flex: 1, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 4, color: C.text, fontFamily: FONT, fontSize: 12, padding: "7px 10px", outline: "none" }}
                />
                <Btn variant="primary" onClick={handleCreateShareLink} disabled={shareSaving}>
                  {shareSaving ? "Creating..." : "Create Link"}
                </Btn>
              </div>
            </div>

            {/* Existing links */}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ fontSize: 10, color: C.muted, fontFamily: FONT, letterSpacing: 1.2, fontWeight: 700 }}>ACTIVE LINKS</div>
                {shareLinksLoading && <span style={{ fontSize: 10, color: C.muted, fontFamily: FONT }}>Loading...</span>}
              </div>
              {shareLinks.length === 0 && !shareLinksLoading && (
                <div style={{ fontSize: 11, color: C.muted, fontFamily: FONT, fontStyle: "italic" }}>No share links yet.</div>
              )}
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {shareLinks.filter(l => l.isActive).map(link => {
                  const url = `${baseUrl}/#share/${link.token}`;
                  return (
                    <div key={link.id} style={{ display: "flex", alignItems: "center", gap: 8, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 5, padding: "8px 10px" }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 11, color: C.text, fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{link.token.slice(0, 8)}…</div>
                        <div style={{ fontSize: 9, color: C.muted, fontFamily: FONT }}>{new Date(link.createdAt).toLocaleString()}</div>
                      </div>
                      {justCreatedLink?.token === link.token && (
                        <span style={{ fontSize: 9, color: C.green, fontFamily: FONT, fontWeight: 700 }}>NEW</span>
                      )}
                      <button type="button" onClick={() => copyToClipboard(url)}
                        title="Copy link"
                        style={{ background: "none", border: `1px solid ${C.border}`, borderRadius: 4, color: C.muted, fontFamily: FONT, fontSize: 10, padding: "4px 8px", cursor: "pointer" }}>
                        Copy
                      </button>
                      <button type="button" onClick={() => setQrToken(qrToken === link.token ? null : link.token)}
                        title="Show QR code"
                        style={{ background: "none", border: `1px solid ${qrToken === link.token ? C.accent : C.border}`, borderRadius: 4, color: qrToken === link.token ? C.accent : C.muted, fontFamily: FONT, fontSize: 10, padding: "4px 8px", cursor: "pointer" }}>
                        QR
                      </button>
                      <button type="button" onClick={() => handleRevokeShareLink(link.id)}
                        title="Revoke share link"
                        style={{ background: "none", border: `1px solid ${C.red}44`, borderRadius: 4, color: C.red, fontFamily: FONT, fontSize: 10, padding: "4px 8px", cursor: "pointer" }}>
                        Revoke
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* QR code */}
            {qrToken && (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, padding: 12 }}>
                <div style={{ fontSize: 10, color: C.muted, fontFamily: FONT, letterSpacing: 1.2, fontWeight: 700 }}>QR CODE</div>
                <div ref={qrRef}
                  style={{ width: 180, height: 180, background: "#fff", borderRadius: 6, padding: 8 }} />
                <div style={{ fontSize: 9, color: C.muted, fontFamily: FONT, textAlign: "center", wordBreak: "break-all" }}>
                  {`${baseUrl}/#share/${qrToken}`}
                </div>
                <button type="button" onClick={() => copyToClipboard(`${baseUrl}/#share/${qrToken}`)}
                  style={{ background: "none", border: `1px solid ${C.border}`, borderRadius: 4, color: C.accent, fontFamily: FONT, fontSize: 10, padding: "5px 16px", cursor: "pointer", fontWeight: 600 }}>
                  Copy URL
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export {
  buildResultsCsv,
  buildResultsExportPayload,
  CustomerToken,
  ExecutePanel,
  slugifyResultName,
  timestampForFilename,
  VisualView,
};
