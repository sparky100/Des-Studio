// ui/ModelHistoryTab.jsx — Run history tab extracted from ModelDetail
import { useState } from "react";
import { C, FONT, alpha } from "./shared/tokens.js";
import { Btn, Empty } from "./shared/components.jsx";
import { useToast } from "./shared/ToastContext.jsx";
import { fetchRunHistory, getRun, updateRunLabel, updateRunTags, archiveRun, unarchiveRun, deleteSimulationRun, revokeShareLink, createShareLink } from "../db/models.js";
import { buildEngine } from "../engine/index.js";
import { compareResults } from "../db/runRecord.js";

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
  onAnalyseRun, onViewResults,
}) {
  const toast = useToast();
  const [historySearch, setHistorySearch] = useState("");
  const [historySelected, setHistorySelected] = useState(new Set());
  const [historyEditLabelId, setHistoryEditLabelId] = useState(null);
  const [historyEditLabelVal, setHistoryEditLabelVal] = useState("");
  const [reproduceState, setReproduceState] = useState({});
  const [moreMenuId, setMoreMenuId] = useState(null);
  const [moreMenuPos, setMoreMenuPos] = useState({ top: 0, right: 0 });

  const handleReproduce = async (rowId) => {
    setReproduceState(prev => ({ ...prev, [rowId]: { status: 'running', message: '' } }));
    try {
      const run = await getRun(rowId);
      if (!run.model_snapshot) {
        setReproduceState(prev => ({ ...prev, [rowId]: {
          status: 'fail',
          message: '✗ No model snapshot stored for this run. Re-run to enable reproducibility checking.',
        } }));
        return;
      }
      const engine = buildEngine(
        run.model_snapshot,
        run.base_seed,
        run.experiment_config.warmupPeriod ?? 0,
        run.experiment_config.maxSimTime   ?? 500,
        null,
        5000, 500,
        false
      );
      const newResult = engine.runAll();
      const storedResult = { summary: run.results_json?.summary || {} };
      const currentVersion = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_ENGINE_VERSION) || '55a';
      if (compareResults(newResult, storedResult)) {
        setReproduceState(prev => ({ ...prev, [rowId]: {
          status: 'pass',
          message: '✓ Reproduce confirmed — results are bit-identical.',
        } }));
      } else {
        setReproduceState(prev => ({ ...prev, [rowId]: {
          status: 'fail',
          message: `✗ Reproduce failed. Stored engine: v${run.engine_version || 'unknown'}, current: v${currentVersion}. Results may differ due to engine changes.`,
        } }));
      }
    } catch (e) {
      setReproduceState(prev => ({ ...prev, [rowId]: {
        status: 'fail',
        message: `✗ Reproduce error: ${e.message}`,
      } }));
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
          fetchRunHistory(modelId, { archived: next })
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
                  {["Date / Time", "Label", "Runs", "Served", "Reneged", "Avg Wait", "Tags", "Actions"].map(h => (
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
                      <td style={{ padding: "6px 12px", color: C.served, fontWeight: 700 }}>{row.total_served || 0}</td>
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
                            onClick={() => onAnalyseRun(row)}
                            style={{ background: C.purple + "22", color: C.purple, border: `1px solid ${C.purple}44`, borderRadius: 999, padding: "4px 12px", fontSize: 11, fontFamily: FONT, fontWeight: 600, cursor: "pointer" }}
                          >Analyse</button>
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
                                    onClick={() => { handleReproduce(row.id); }}
                                    disabled={reproduceState[row.id]?.status === 'running'}
                                    style={{ display: "block", width: "100%", textAlign: "left", background: "transparent", border: "none", padding: "6px 10px", fontSize: 12, fontFamily: FONT, color: C.text, cursor: "pointer", borderRadius: 4 }}
                                  >{reproduceState[row.id]?.status === 'running' ? 'Running…' : 'Reproduce'}</button>
                                  {shareLinksMap[row.id] ? (
                                    <button
                                      onClick={() => { navigator.clipboard.writeText(`${baseUrl}/#share/${shareLinksMap[row.id].token}`); toast.success("Link copied"); setMoreMenuId(null); }}
                                      style={{ display: "block", width: "100%", textAlign: "left", background: "transparent", border: "none", padding: "6px 10px", fontSize: 12, fontFamily: FONT, color: C.text, cursor: "pointer", borderRadius: 4 }}
                                    >📋 Copy share link</button>
                                  ) : userId && (
                                    <button
                                      onClick={async () => {
                                        try {
                                          const link = await createShareLink(row.id, userId);
                                          setShareLinksMap(prev => ({ ...prev, [row.id]: link }));
                                          toast.success("Share link created");
                                        } catch { toast.error("Failed to create share link"); }
                                        setMoreMenuId(null);
                                      }}
                                      style={{ display: "block", width: "100%", textAlign: "left", background: "transparent", border: "none", padding: "6px 10px", fontSize: 12, fontFamily: FONT, color: C.text, cursor: "pointer", borderRadius: 4 }}
                                    >Share</button>
                                  )}
                                  {shareLinksMap[row.id] && userId && (
                                    <button
                                      onClick={async () => {
                                        if (!window.confirm("Revoke this share link?")) return;
                                        try { await revokeShareLink(shareLinksMap[row.id].id, userId); setShareLinksMap(prev => { const next = { ...prev }; delete next[row.id]; return next; }); toast.success("Share link revoked"); } catch { toast.error("Failed to revoke"); }
                                        setMoreMenuId(null);
                                      }}
                                      style={{ display: "block", width: "100%", textAlign: "left", background: "transparent", border: "none", padding: "6px 10px", fontSize: 12, fontFamily: FONT, color: C.red, cursor: "pointer", borderRadius: 4 }}
                                    >✕ Unshare</button>
                                  )}
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
    </div>
  );
}
