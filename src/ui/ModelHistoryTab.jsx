// ui/ModelHistoryTab.jsx — Run history tab extracted from ModelDetail
import { useState } from "react";
import { C, FONT, alpha } from "./shared/tokens.js";
import { Btn, Empty } from "./shared/components.jsx";
import { useToast } from "./shared/ToastContext.jsx";
import { fetchRunHistory, getRun, updateRunLabel, updateRunTags, archiveRun, unarchiveRun, deleteSimulationRun, revokeShareLink, createShareLink, fetchModelSchedules, buildSchedulesMap } from "../db/models.js";
import { fetchLocalRunHistory } from "../db/local.js";
import { buildEngine } from "../engine/index.js";
import { compareResults } from "../db/runRecord.js";
import { compareScenarios } from "../engine/statistics.js";
import { CI_METRICS, METRIC_LABELS, fmt } from "./execute/executeHelpers.js";
import { buildModelDiff, ModelDiffPreview } from "./editors/ModelDiffPreview.jsx";

function slugifyModelName(name = "") {
  return (name || "untitled")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "untitled";
}

function csvEscape(value) {
  if (value == null) return "";
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function downloadTextFile(content, filename, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  try { link.click(); } finally { link.remove(); URL.revokeObjectURL(url); }
}

function downloadJsonFile(payload, filename) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  try { link.click(); } finally { link.remove(); URL.revokeObjectURL(url); }
}

function buildRunHistoryCsv(rows = []) {
  const table = [[
    "runLabel","ranAt","seed","replications","warmupPeriod","maxSimulationTime",
    "totalArrived","totalServed","totalReneged","renegeRate","avgWaitTime","avgServiceTime","durationMs",
  ]];
  for (const row of rows) {
    table.push([
      row.run_label || "", row.ran_at, row.seed ?? "", row.replications ?? 1,
      row.warmup_period ?? "", row.max_simulation_time ?? "",
      row.total_arrived ?? 0, row.total_served ?? 0, row.total_reneged ?? 0,
      row.renege_rate ?? "", row.avg_wait_time ?? "", row.avg_service_time ?? "",
      row.duration_ms ?? "",
    ]);
  }
  return table.map(row => row.map(csvEscape).join(",")).join("\n");
}

function buildRunHistoryExportPayload(model, rows = [], exportedAt = new Date().toISOString()) {
  return {
    schema: "des-studio.run-history.v1",
    exportedAt,
    model: { id: model?.id ?? null, name: model?.name ?? "Untitled model" },
    runs: rows.map(row => ({
      id: row.id,
      runLabel: row.run_label || "",
      ranAt: row.ran_at,
      seed: row.seed ?? null,
      replications: row.replications ?? 1,
      warmupPeriod: row.warmup_period ?? null,
      maxSimulationTime: row.max_simulation_time ?? null,
      totalArrived: row.total_arrived ?? 0,
      totalServed: row.total_served ?? 0,
      totalReneged: row.total_reneged ?? 0,
      renegeRate: row.renege_rate ?? null,
      avgWaitTime: row.avg_wait_time ?? null,
      avgServiceTime: row.avg_service_time ?? null,
      durationMs: row.duration_ms ?? null,
      resultsJson: row.results_json ?? null,
    })),
  };
}

const hasResultsPayload = row => {
  const json = row?.results_json;
  return !!(json && typeof json === "object" && (json.summary || json.timeSeries || json.waitDist));
};

function formatRunDate(value) {
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return "Unknown";
  return `${dt.toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'})} ${dt.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})}`;
}

const formatPercent = value => Number.isFinite(value) ? `${value.toFixed(1)}%` : "—";
const formatTime = value => value != null && Number.isFinite(Number(value)) ? `${Number(value).toFixed(2)}t` : "—";

export function ModelHistoryTab({
  historyRows, setHistoryRows,
  historyLoading, setHistoryLoading,
  historyError, setHistoryError,
  historyShowArchived, setHistoryShowArchived,
  shareLinksMap, setShareLinksMap,
  modelId, userId, model, baseUrl,
  onExplainRun, onViewResults, onCreateReport,
}) {
  const toast = useToast();
  const [historySearch, setHistorySearch] = useState("");
  const [historySelected, setHistorySelected] = useState(new Set());
  const [historyEditLabelId, setHistoryEditLabelId] = useState(null);
  const [historyEditLabelVal, setHistoryEditLabelVal] = useState("");
  const [reproduceState, setReproduceState] = useState({});
  const [snapshotDiffRow, setSnapshotDiffRow] = useState(null);
  const [snapshotDiffLoading, setSnapshotDiffLoading] = useState(false);
  const [moreMenuId, setMoreMenuId] = useState(null);
  const [moreMenuPos, setMoreMenuPos] = useState({ top: 0, right: 0 });
  const [selectedComparison, setSelectedComparison] = useState(null);
  const runHistoryFetcher = (filters = {}) => (
    userId ? fetchRunHistory(modelId, filters) : Promise.resolve(fetchLocalRunHistory(modelId))
  );

  const handleReproduce = async (rowId) => {
    setReproduceState(prev => ({ ...prev, [rowId]: { status: 'running', message: '' } }));
    try {
      const run = await getRun(rowId);
      const modelForReproduce = run.model_snapshot ?? run.version_model;
      if (!modelForReproduce) {
        setReproduceState(prev => ({ ...prev, [rowId]: {
          status: 'fail',
          message: '✗ No model snapshot or saved version linked to this run. Re-run to enable reproducibility checking.',
        } }));
        return;
      }
      const modelSource = run.model_snapshot
        ? 'embedded snapshot'
        : `version ${run.version_number ?? '?'}${run.version_name ? ` "${run.version_name}"` : ''}`;

      // Fetch schedule data so timetable models resolve correctly
      let schedulesMap = {};
      try {
        const scheduleRows = await fetchModelSchedules(modelForReproduce.id || modelId);
        schedulesMap = buildSchedulesMap(scheduleRows);
      } catch { /* no schedule data — model will run with empty rows */ }

      const engine = buildEngine(
        modelForReproduce,
        run.base_seed,
        run.experiment_config.warmupPeriod ?? 0,
        run.experiment_config.maxSimTime   ?? 500,
        null,
        5000, 500,
        false,
        undefined,
        { schedulesMap }
      );
      const newResult = engine.runAll();
      const replications = Number(run.experiment_config.replications ?? 1);

      if (replications > 1) {
        // Stored summary is the N-replication average — not comparable to a single run.
        // Verify the model ran and produced a plausible result instead.
        const served = newResult.summary?.served ?? 0;
        const storedServed = run.results_json?.summary?.served ?? 0;
        const plausible = served > 0 || storedServed === 0;
        setReproduceState(prev => ({ ...prev, [rowId]: {
          status: plausible ? 'pass' : 'fail',
          message: plausible
            ? `✓ Snapshot valid — model ran successfully using ${modelSource} (${served} entities served in single-replication check; original was ${replications}-replication average).`
            : `✗ Reproduce produced 0 results using ${modelSource}. The snapshot may be incomplete or the schedule data unavailable.`,
        } }));
      } else {
        // Single-rep run — exact comparison is meaningful
        const storedResult = { summary: run.results_json?.summary || {} };
        if (compareResults(newResult, storedResult)) {
          setReproduceState(prev => ({ ...prev, [rowId]: {
            status: 'pass',
            message: `✓ Reproduce confirmed — results match (using ${modelSource}).`,
          } }));
        } else {
          const cv = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_ENGINE_VERSION) || '55a';
          setReproduceState(prev => ({ ...prev, [rowId]: {
            status: 'fail',
            message: `✗ Reproduce failed (using ${modelSource}). Engine: stored v${run.engine_version || '?'}, current v${cv}. Results differ — engine or model may have changed.`,
          } }));
        }
      }
    } catch (e) {
      setReproduceState(prev => ({ ...prev, [rowId]: {
        status: 'fail',
        message: `✗ Reproduce error: ${e.message}`,
      } }));
    }
  };

  const handleViewDiff = async (rowId) => {
    setSnapshotDiffLoading(true);
    setMoreMenuId(null);
    try {
      const run = await getRun(rowId);
      // Prefer embedded snapshot (full-detail saves); fall back to linked model version.
      const modelForDiff = run.model_snapshot ?? run.version_model;
      if (!modelForDiff) {
        toast.error("No model snapshot or saved version linked to this run. Tag a version before running to enable diff.");
        return;
      }
      const sourceLabel = run.model_snapshot
        ? 'snapshot'
        : `version ${run.version_number ?? '?'}${run.version_name ? ` "${run.version_name}"` : ''}`;
      setSnapshotDiffRow({ rowId, snapshot: modelForDiff, sourceLabel });
    } catch (e) {
      toast.error(`Could not load model for diff: ${e.message}`);
    } finally {
      setSnapshotDiffLoading(false);
    }
  };

  const exportRunHistoryJson = () => {
    const payload = buildRunHistoryExportPayload(model, historyRows);
    downloadJsonFile(payload, `des-studio-run-history-${slugifyModelName(model?.name)}.json`);
    toast.success(`Exported ${historyRows.length} run${historyRows.length !== 1 ? "s" : ""} as JSON`);
  };

  const exportRunHistoryCsv = () => {
    const csv = buildRunHistoryCsv(historyRows);
    downloadTextFile(csv, `des-studio-run-history-${slugifyModelName(model?.name)}.csv`, "text/csv;charset=utf-8");
    toast.success(`Exported ${historyRows.length} run${historyRows.length !== 1 ? "s" : ""} as CSV`);
  };

  const exportSelectedCsv = () => {
    const rows = historyRows.filter(r => historySelected.has(r.id));
    const csv = buildRunHistoryCsv(rows);
    downloadTextFile(csv, `des-studio-selected-runs-${slugifyModelName(model?.name)}.csv`, "text/csv;charset=utf-8");
    toast.success(`Exported ${rows.length} selected run${rows.length !== 1 ? "s" : ""} as CSV`);
  };

  const archiveSelected = async () => {
    if (!userId) return;
    const ids = [...historySelected];
    await Promise.all(ids.map(id => archiveRun(id, userId).catch(() => {})));
    if (!historyShowArchived) setHistoryRows(prev => prev.filter(r => !historySelected.has(r.id)));
    else setHistoryRows(prev => prev.map(r => historySelected.has(r.id) ? { ...r, archived: true } : r));
    setHistorySelected(new Set());
    toast.success(`Archived ${ids.length} run${ids.length !== 1 ? "s" : ""}`);
  };

  const unarchiveSelected = async () => {
    if (!userId) return;
    const ids = [...historySelected];
    await Promise.all(ids.map(id => unarchiveRun(id, userId).catch(() => {})));
    setHistoryRows(prev => prev.map(r => historySelected.has(r.id) ? { ...r, archived: false } : r));
    setHistorySelected(new Set());
    toast.success(`Unarchived ${ids.length} run${ids.length !== 1 ? "s" : ""}`);
  };

  const deleteSelected = async () => {
    if (!userId) return;
    if (!confirm(`Delete ${historySelected.size} selected run${historySelected.size !== 1 ? "s" : ""}? This cannot be undone.`)) return;
    const ids = [...historySelected];
    await Promise.all(ids.map(id => deleteSimulationRun(id, userId).catch(() => {})));
    setHistoryRows(prev => prev.filter(r => !historySelected.has(r.id)));
    setHistorySelected(new Set());
    toast.success(`Deleted ${ids.length} run${ids.length !== 1 ? "s" : ""}`);
  };

  const compareSelected = () => {
    const selectedRows = historyRows.filter(row => historySelected.has(row.id));
    if (selectedRows.length !== 2) {
      setSelectedComparison({ error: "Select exactly 2 runs to compare." });
      return;
    }
    const [rowA, rowB] = selectedRows;
    const repsA = rowA?.results_json?.replicationResults || [];
    const repsB = rowB?.results_json?.replicationResults || [];
    if (repsA.length < 2 || repsB.length < 2) {
      setSelectedComparison({ error: `Both runs must have at least 2 replications. Run A: ${repsA.length}, Run B: ${repsB.length}.` });
      return;
    }
    const labelA = rowA.run_label || formatRunDate(rowA.ran_at);
    const labelB = rowB.run_label || formatRunDate(rowB.ran_at);
    const result = compareScenarios(repsA, repsB, CI_METRICS, { labelA, labelB });
    const meansA = {};
    const meansB = {};
    for (const metric of CI_METRICS) {
      const parts = metric.split(".");
      const valsA = repsA.map(r => { let v = r?.result || r; for (const p of parts) v = v?.[p]; return v; }).filter(Number.isFinite);
      const valsB = repsB.map(r => { let v = r?.result || r; for (const p of parts) v = v?.[p]; return v; }).filter(Number.isFinite);
      meansA[metric] = valsA.length ? valsA.reduce((s, v) => s + v, 0) / valsA.length : null;
      meansB[metric] = valsB.length ? valsB.reduce((s, v) => s + v, 0) / valsB.length : null;
    }
    setSelectedComparison({ ...result, meansA, meansB });
  };

  const latest = historyRows[0];
  const arrived = Number(latest?.total_arrived || 0);
  const reneged = Number(latest?.total_reneged || 0);
  const renegeRate = arrived > 0 ? (reneged / arrived) * 100 : null;

  const filteredRows = historyRows.filter(row => {
    if (!historySearch.trim()) return true;
    return (row.run_label || "").toLowerCase().includes(historySearch.toLowerCase());
  });

  return (
    <div style={{ maxWidth: 1200 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
        <div style={{ fontSize: 10, color: C.muted, fontFamily: FONT, letterSpacing: 1.5, fontWeight: 700, flex: 1, minWidth: 180 }}>RECENT RUNS</div>
        <input
          aria-label="Search run history"
          type="text"
          value={historySearch}
          onChange={e => setHistorySearch(e.target.value)}
          placeholder="Search runs…"
          style={{ background: "transparent", border: `1px solid ${C.border}`, borderRadius: 4, color: C.text, fontFamily: FONT, fontSize: 11, padding: "4px 8px", outline: "none", width: 160 }}
        />
        <Btn small variant={historyShowArchived ? "primary" : "ghost"} onClick={() => {
          const next = !historyShowArchived;
          setHistoryShowArchived(next);
          setHistoryLoading(true); setHistoryError("");
          runHistoryFetcher({ archived: next })
            .then(rows => setHistoryRows(rows))
            .catch(e => setHistoryError(e.message))
            .finally(() => setHistoryLoading(false));
        }}>{historyShowArchived ? "Hide archived" : "Show archived"}</Btn>
        <Btn small variant="ghost" onClick={exportRunHistoryJson} disabled={!historyRows.length}>Export run list</Btn>
        <Btn small variant="ghost" onClick={exportRunHistoryCsv} disabled={!historyRows.length}>Export run list as CSV</Btn>
      </div>

      {historyLoading && <div style={{ color: C.muted, fontFamily: FONT, fontSize: 12 }}>Loading...</div>}
      {historyError && <div style={{ color: C.red, fontFamily: FONT, fontSize: 12 }}>{historyError}</div>}
      {!historyLoading && !historyError && historyRows.length === 0 && (
        <Empty icon="📊" msg="No runs yet. Open Run to try this model." />
      )}

      {historySelected.size > 0 && (
        <div style={{ background: alpha(C.accent, 0.08), border: `1px solid ${alpha(C.accent, 0.3)}`, borderRadius: 6, padding: "8px 12px", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 4 }}>
          <span style={{ fontSize: 12, fontFamily: FONT, color: C.text }}>{historySelected.size} run{historySelected.size !== 1 ? "s" : ""} selected</span>
          <Btn small variant="ghost" onClick={exportSelectedCsv}>Export as CSV</Btn>
          <Btn small variant="ghost" onClick={compareSelected} disabled={historySelected.size !== 2}>Compare selected</Btn>
          {userId && (
            <>
              <Btn small variant="ghost" onClick={archiveSelected}>Archive</Btn>
              <Btn small variant="ghost" onClick={unarchiveSelected}>Unarchive</Btn>
              <Btn small variant="ghost" onClick={deleteSelected} style={{ color: C.red }}>Delete</Btn>
            </>
          )}
          <Btn small variant="ghost" onClick={() => setHistorySelected(new Set())}>Clear selection</Btn>
        </div>
      )}

      {selectedComparison?.error && (
        <div style={{ fontSize: 12, color: C.red, fontFamily: FONT, marginBottom: 8 }}>{selectedComparison.error}</div>
      )}
      {selectedComparison && !selectedComparison.error && (
        <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 8, padding: 14, display: "flex", flexDirection: "column", gap: 12, marginBottom: 12 }}>
          <span style={{ fontSize: 10, color: C.muted, fontFamily: FONT, letterSpacing: 1.2, fontWeight: 700 }}>RUN COMPARISON</span>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", color: C.text, fontSize: 12, textAlign: "left" }}>
              <thead>
                <tr style={{ color: C.muted, borderBottom: `1px solid ${C.border}` }}>
                  <th scope="col" style={{ padding: "6px 8px" }}>KPI</th>
                  <th scope="col" style={{ padding: "6px 8px", textAlign: "right" }}>{selectedComparison.labels?.a}</th>
                  <th scope="col" style={{ padding: "6px 8px", textAlign: "right" }}>{selectedComparison.labels?.b}</th>
                  <th scope="col" style={{ padding: "6px 8px", textAlign: "right" }}>Difference</th>
                  <th scope="col" style={{ padding: "6px 8px", textAlign: "right" }}>95% CI</th>
                  <th scope="col" style={{ padding: "6px 8px" }}>Significant?</th>
                </tr>
              </thead>
              <tbody>
                {selectedComparison.comparisons?.map((c, i) => {
                  const mA = selectedComparison.meansA?.[c.metric];
                  const mB = selectedComparison.meansB?.[c.metric];
                  return (
                    <tr key={i} style={{ borderBottom: `1px solid ${C.border}` }}>
                      <td style={{ padding: "6px 8px", color: C.accent }}>{METRIC_LABELS[c.metric] || c.metric}</td>
                      <td style={{ padding: "6px 8px", textAlign: "right" }}>{mA != null ? fmt(mA) : "—"}</td>
                      <td style={{ padding: "6px 8px", textAlign: "right" }}>{mB != null ? fmt(mB) : "—"}</td>
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
                        ) : <span style={{ color: C.muted }}>No</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!historyLoading && historyRows.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div aria-label="Run history summary" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
            {[
              { label: "Latest run", value: latest.run_label || formatRunDate(latest.ran_at), color: C.accent },
              { label: "Customers served", value: latest.total_served || 0, color: C.served },
              { label: "Left before service", value: formatPercent(renegeRate), color: reneged > 0 ? C.reneged : C.muted },
              { label: "Average wait", value: formatTime(latest.avg_wait_time), color: C.amber },
            ].map(cell => (
              <div key={cell.label} style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 6, padding: "10px 12px" }}>
                <div style={{ fontSize: 9, color: C.muted, fontFamily: FONT, letterSpacing: 1.1, fontWeight: 700, marginBottom: 4 }}>{cell.label.toUpperCase()}</div>
                <div style={{ fontSize: 14, color: cell.color, fontFamily: FONT, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={String(cell.value)}>{cell.value}</div>
              </div>
            ))}
          </div>

          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: FONT, fontSize: 11 }}>
              <thead>
                <tr>
                  <th scope="col" style={{ padding: "6px 8px", borderBottom: `1px solid ${C.border}`, width: 32 }}>
                    <input type="checkbox" aria-label="Select all runs"
                      checked={historySelected.size > 0 && historyRows.every(r => historySelected.has(r.id))}
                      onChange={e => {
                        if (e.target.checked) setHistorySelected(new Set(historyRows.map(r => r.id)));
                        else setHistorySelected(new Set());
                      }}
                    />
                  </th>
                  {["Date / Time", "Label", "Version", "Runs", "Avg Served", "Reneged", "Avg Wait", "Tags", "Actions"].map(h => (
                    <th key={h} scope="col" style={{ textAlign: "left", padding: "6px 12px", color: C.muted, borderBottom: `1px solid ${C.border}`, fontSize: 11, letterSpacing: 1, fontWeight: 700, whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row, i) => {
                  const dt = new Date(row.ran_at);
                  const dateStr = dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
                  const timeStr = dt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
                  const insight = row.ai_insights?.summary || null;
                  const isEditingLabel = historyEditLabelId === row.id;
                  return (
                    <tr key={row.id} style={{ background: historySelected.has(row.id) ? alpha(C.accent, 0.06) : i % 2 === 0 ? C.surface + "60" : "transparent", opacity: row.archived ? 0.55 : 1 }}>
                      <td style={{ padding: "6px 8px" }}>
                        <input type="checkbox" aria-label={`Select run ${row.run_label || dateStr}`}
                          checked={historySelected.has(row.id)}
                          onChange={e => {
                            setHistorySelected(prev => {
                              const next = new Set(prev);
                              e.target.checked ? next.add(row.id) : next.delete(row.id);
                              return next;
                            });
                          }}
                        />
                      </td>
                      <td style={{ padding: "6px 12px", color: C.muted, whiteSpace: "nowrap" }}>{dateStr} {timeStr}</td>
                      <td style={{ padding: "6px 12px", minWidth: 120 }}>
                        {isEditingLabel ? (
                          <input
                            aria-label="Edit run label"
                            type="text"
                            value={historyEditLabelVal}
                            onChange={e => setHistoryEditLabelVal(e.target.value)}
                            onBlur={async () => {
                              if (userId) {
                                await updateRunLabel(row.id, userId, historyEditLabelVal).catch(() => {});
                                setHistoryRows(prev => prev.map(r => r.id === row.id ? { ...r, run_label: historyEditLabelVal } : r));
                              }
                              setHistoryEditLabelId(null);
                            }}
                            onKeyDown={e => { if (e.key === "Enter") e.target.blur(); if (e.key === "Escape") setHistoryEditLabelId(null); }}
                            autoFocus
                            style={{ background: "transparent", border: `1px solid ${C.border}`, borderRadius: 3, color: C.text, fontFamily: FONT, fontSize: 11, padding: "2px 6px", outline: "none", width: "100%" }}
                          />
                        ) : (
                          <span
                            onClick={() => { setHistoryEditLabelId(row.id); setHistoryEditLabelVal(row.run_label || ""); }}
                            style={{ color: row.run_label ? C.text : C.muted, cursor: "text", fontSize: 12, fontFamily: FONT }}
                            title="Click to edit label"
                          >{row.run_label || "—"}</span>
                        )}
                      </td>
                      <td style={{ padding: "6px 12px", whiteSpace: "nowrap" }}>
                        {row.model_versions ? (
                          <span style={{ fontSize: 10, fontWeight: 700, color: C.purple, background: `${C.purple}15`, border: `1px solid ${C.purple}33`, borderRadius: 999, padding: "2px 8px" }}>
                            V{row.model_versions.version}
                          </span>
                        ) : (
                          <span style={{ fontSize: 10, color: C.muted }}>—</span>
                        )}
                      </td>
                      <td style={{ padding: "6px 12px", textAlign: "center" }}>
                        <span style={{
                          fontSize: 10,
                          fontFamily: FONT,
                          fontWeight: 700,
                          color: row.replications > 1 ? C.accent : C.muted,
                          background: row.replications > 1 ? `${C.accent}15` : "transparent",
                          border: `1px solid ${row.replications > 1 ? `${C.accent}33` : C.border}`,
                          borderRadius: 999,
                          padding: "2px 8px",
                        }}>
                          {row.replications ?? 1}
                        </span>
                      </td>
                      <td style={{ padding: "6px 12px", color: C.served, fontWeight: 700 }}>
                        {(() => {
                          const total = row.total_served || 0;
                          const reps = row.replications || 1;
                          const avg = reps > 1 ? (total / reps) : total;
                          const label = reps > 1 ? `${avg.toFixed(1)} avg` : total;
                          return (
                            <span title={reps > 1 ? `${total} total across ${reps} replications` : undefined}>
                              {label}
                            </span>
                          );
                        })()}
                      </td>
                      <td style={{ padding: "6px 12px", color: row.total_reneged > 0 ? C.reneged : C.muted }}>{row.total_reneged || 0}</td>
                      <td style={{ padding: "6px 12px", color: C.amber }}>
                        {row.avg_wait_time != null ? row.avg_wait_time.toFixed(2) : "—"}t
                        {(() => {
                          const ci = row.results_json?.aggregateStats?.["summary.avgWait"];
                          if (!ci || ci.halfWidth == null || ci.mean == null || !Number.isFinite(ci.mean) || ci.mean === 0) return null;
                          const relHw = (ci.halfWidth / Math.abs(ci.mean)) * 100;
                          const conf = Math.max(0, Math.min(100, 100 - relHw));
                          const color = relHw < 10 ? C.green : relHw < 25 ? C.amber : C.red;
                          return (
                            <span
                              title={`${conf.toFixed(0)}% confidence (±${ci.halfWidth.toFixed(2)}, n=${ci.n})`}
                              style={{ marginLeft: 6, fontSize: 9, fontWeight: 700, color, background: `${color}18`, border: `1px solid ${color}44`, borderRadius: 999, padding: "1px 5px" }}
                            >{conf.toFixed(0)}%</span>
                          );
                        })()}
                      </td>
                      <td style={{ padding: "6px 12px" }}>
                        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center" }}>
                          {(row.tags || []).map(tag => (
                            <span key={tag} style={{ background: C.border, borderRadius: 999, padding: "2px 7px", fontSize: 10, color: C.text, fontFamily: FONT, cursor: "pointer" }}
                              onClick={async () => {
                                if (!userId) return;
                                const next = (row.tags || []).filter(t => t !== tag);
                                await updateRunTags(row.id, userId, next).catch(() => {});
                                setHistoryRows(prev => prev.map(r => r.id === row.id ? { ...r, tags: next } : r));
                              }}
                              title="Click to remove tag"
                            >#{tag} ×</span>
                          ))}
                          <input
                            aria-label={`Add tag to run ${row.id}`}
                            type="text"
                            placeholder="+ tag"
                            style={{ background: "transparent", border: `1px solid ${C.border}`, borderRadius: 999, color: C.muted, fontFamily: FONT, fontSize: 10, padding: "2px 7px", outline: "none", width: 56 }}
                            onKeyDown={async (e) => {
                              if ((e.key === "Enter" || e.key === ",") && e.target.value.trim() && userId) {
                                const tag = e.target.value.trim().toLowerCase().replace(/[^a-z0-9-]/g, "");
                                if (!tag) { e.target.value = ""; return; }
                                const next = [...(row.tags || []).filter(t => t !== tag), tag];
                                await updateRunTags(row.id, userId, next).catch(() => {});
                                setHistoryRows(prev => prev.map(r => r.id === row.id ? { ...r, tags: next } : r));
                                e.target.value = "";
                              }
                            }}
                          />
                        </div>
                      </td>
                      <td style={{ padding: "6px 12px", whiteSpace: "nowrap" }}>
                        <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                          {hasResultsPayload(row) && (
                            <button
                              onClick={() => onViewResults(row)}
                              style={{ background: C.accent, color: "#fff", border: "none", borderRadius: 999, padding: "4px 12px", fontSize: 11, fontFamily: FONT, fontWeight: 600, cursor: "pointer" }}
                            >View Results</button>
                          )}
                          <button
                            onClick={() => onExplainRun?.(row)}
                            style={{ background: C.purple + "22", color: C.purple, border: `1px solid ${C.purple}44`, borderRadius: 999, padding: "4px 12px", fontSize: 11, fontFamily: FONT, fontWeight: 600, cursor: "pointer" }}
                          >Explain</button>
                          {onCreateReport && hasResultsPayload(row) && (
                            <button
                              onClick={() => onCreateReport(row)}
                              style={{ background: C.accent + "22", color: C.accent, border: `1px solid ${C.accent}44`, borderRadius: 999, padding: "4px 12px", fontSize: 11, fontFamily: FONT, fontWeight: 600, cursor: "pointer" }}
                            >Create Report</button>
                          )}
                          <div style={{ position: "relative" }}>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                const rect = e.currentTarget.getBoundingClientRect();
                                setMoreMenuPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
                                setMoreMenuId(moreMenuId === row.id ? null : row.id);
                              }}
                              aria-label="More actions"
                              style={{ background: "transparent", color: C.muted, border: `1px solid ${C.border}`, borderRadius: 999, padding: "4px 8px", fontSize: 11, fontFamily: FONT, cursor: "pointer", lineHeight: 1 }}
                              title="More actions"
                            >⋯</button>
                            {moreMenuId === row.id && (
                              <>
                                <div style={{ position: "fixed", inset: 0, zIndex: 999 }} onClick={() => setMoreMenuId(null)} />
                                <div style={{ position: "fixed", top: moreMenuPos.top, right: moreMenuPos.right, background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 8, padding: 4, minWidth: 180, boxShadow: "0 4px 16px rgba(0,0,0,0.4)", zIndex: 1000 }}>
                                  <button
                                    onClick={() => handleViewDiff(row.id)}
                                    disabled={snapshotDiffLoading}
                                    style={{ display: "block", width: "100%", textAlign: "left", background: "transparent", border: "none", padding: "6px 10px", fontSize: 12, fontFamily: FONT, color: C.text, cursor: "pointer", borderRadius: 4 }}
                                  >View model at this run</button>
                                  <button
                                    onClick={() => { handleReproduce(row.id); }}
                                    disabled={reproduceState[row.id]?.status === 'running'}
                                    style={{ display: "block", width: "100%", textAlign: "left", background: "transparent", border: "none", padding: "6px 10px", fontSize: 12, fontFamily: FONT, color: C.text, cursor: "pointer", borderRadius: 4 }}
                                  >{reproduceState[row.id]?.status === 'running' ? 'Running…' : 'Reproduce'}</button>
                                  {userId && (
                                    <button
                                      onClick={async () => {
                                        if (row.archived) { await unarchiveRun(row.id, userId).catch(() => {}); setHistoryRows(prev => prev.map(r => r.id === row.id ? { ...r, archived: false } : r)); }
                                        else { await archiveRun(row.id, userId).catch(() => {}); if (!historyShowArchived) setHistoryRows(prev => prev.filter(r => r.id !== row.id)); else setHistoryRows(prev => prev.map(r => r.id === row.id ? { ...r, archived: true } : r)); }
                                        setMoreMenuId(null);
                                      }}
                                      style={{ display: "block", width: "100%", textAlign: "left", background: "transparent", border: "none", padding: "6px 10px", fontSize: 12, fontFamily: FONT, color: C.text, cursor: "pointer", borderRadius: 4, borderTop: `1px solid ${C.border}` }}
                                    >{row.archived ? "Unarchive" : "Archive"}</button>
                                  )}
                                  {userId && (
                                    <button
                                      onClick={async () => {
                                        if (!confirm("Delete this run? This cannot be undone.")) return;
                                        await deleteSimulationRun(row.id, userId).catch(() => {});
                                        setHistoryRows(prev => prev.filter(r => r.id !== row.id));
                                      }}
                                      style={{ display: "block", width: "100%", textAlign: "left", background: "transparent", border: "none", padding: "6px 10px", fontSize: 12, fontFamily: FONT, color: C.red, cursor: "pointer", borderRadius: 4 }}
                                    >Delete</button>
                                  )}
                                </div>
                              </>
                            )}
                          </div>
                        </div>
                        {reproduceState[row.id] && reproduceState[row.id].status !== 'running' && (
                          <div
                            data-testid={`reproduce-result-${row.id}`}
                            style={{
                              marginTop: 4,
                              fontSize: 10,
                              color: reproduceState[row.id].status === 'pass' ? C.green : C.red,
                              fontFamily: FONT,
                            }}
                          >
                            {reproduceState[row.id].message}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {snapshotDiffRow && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1100, padding: 16 }}>
          <div style={{ background: "#1a1a1a", border: "1px solid #333", borderRadius: 12, padding: 20, width: "min(680px, 100%)", maxHeight: "85vh", overflowY: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: "#e0e0e0", fontFamily: "JetBrains Mono, monospace" }}>Model at this run vs. current</span>
              <button onClick={() => setSnapshotDiffRow(null)} style={{ background: "transparent", border: "none", color: "#888", fontSize: 18, cursor: "pointer" }}>✕</button>
            </div>
            <ModelDiffPreview
              currentModel={model}
              proposedModel={snapshotDiffRow.snapshot}
              onDiscard={() => setSnapshotDiffRow(null)}
              readOnly
            />
          </div>
        </div>
      )}
    </div>
  );
}
