// ui/editors/ScheduleManager.jsx
// ADR-016: Schedule Manager panel — view, create, edit and delete named
// timetable schedules attached to this model.
//
// Props:
//   modelId       string — current model's UUID
//   userId        string — authenticated user (null = read-only)
//   canEdit       boolean
//   bEvents       array  — model's bEvents (for "used by" linking)
//   epoch         string|null — model epoch for time display
//   timeUnit      string — model time unit (e.g. 'minutes')

import { useState, useEffect, useCallback, useRef } from "react";
;
import { Btn, SH, InfoBox, Empty } from "../shared/components.jsx";
import {
  fetchModelSchedules,
  saveModelSchedule,
  deleteModelSchedule,
  setDefaultSchedule,
  extractInlineSchedule,
} from "../../db/models.js";
import { parsePlanCsv } from "../shared/planCsvParser.js";
import { parseXlsx } from "../shared/xlsxParser.js";
import { mergeScheduleRows, linkBEventToSchedule, unlinkBEventFromSchedule, partitionScheduleBEvents } from "./scheduleHelpers.js";
import { useTheme } from "../shared/ThemeContext.jsx";

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatMinutes(minutes) {
  const { C, FONT } = useTheme();
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function scheduleRowCount(sched) {
  if (!sched || !Array.isArray(sched.scheduleJson)) return 0;
  return sched.scheduleJson.reduce((sum, e) => sum + (Array.isArray(e.rows) ? e.rows.length : 0), 0);
}

function scheduleUsedBy(sched, bEvents = []) {
  if (!sched?.id) return [];
  return bEvents.filter(be =>
    (be.schedules || []).some(s => s.scheduleRef === sched.id)
  );
}

// ── ScheduleRow: one row in the schedule list ─────────────────────────────────

function ScheduleRow({ sched, bEvents, isSelected, onSelect, onSetDefault, onDelete, canEdit }) {
  const { C, FONT } = useTheme();
  const rowCount = scheduleRowCount(sched);
  const usedByEvents = scheduleUsedBy(sched, bEvents);
  const [confirming, setConfirming] = useState(false);

  const handleDelete = () => {
    if (!confirming) { setConfirming(true); return; }
    setConfirming(false);
    onDelete(sched.id);
  };

  return (
    <div
      onClick={() => onSelect(sched.id)}
      style={{
        background: C.bg,
        border: `1px solid ${C.accent}33`,
        borderLeft: `3px solid ${C.accent}`,
        borderRadius: 6,
        padding: 12,
        display: "flex",
        flexDirection: "column",
        gap: 8,
        cursor: "pointer",
        transition: "border-color 0.1s",
      }}
    >
      {/* Header row: star · name · row count · delete */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span
          title={sched.isDefault ? "Default schedule" : "Set as default"}
          onClick={e => { e.stopPropagation(); canEdit && onSetDefault(sched.id); }}
          style={{ color: sched.isDefault ? C.amber : C.muted, fontSize: 16, cursor: canEdit ? "pointer" : "default", lineHeight: 1 }}
        >
          {sched.isDefault ? "★" : "☆"}
        </span>
        <span style={{ fontWeight: 600, fontSize: 13, color: C.text, flex: 1 }}>{sched.name}</span>
        <span style={{ fontSize: 11, color: C.muted }}>{rowCount.toLocaleString()} rows</span>
        <div style={{ display: "flex", gap: 4 }} onClick={e => e.stopPropagation()}>
          {canEdit && (
            confirming
              ? <>
                  <Btn size="xs" variant="danger" onClick={handleDelete}>Confirm delete</Btn>
                  <Btn size="xs" onClick={() => setConfirming(false)}>Cancel</Btn>
                </>
              : <Btn size="xs" variant="ghost" onClick={handleDelete}>✕</Btn>
          )}
        </div>
      </div>

      {/* Meta row: description + used-by */}
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {sched.description && (
          <div style={{ fontSize: 11, color: C.muted }}>{sched.description}</div>
        )}
        <div style={{ fontSize: 11 }}>
          {usedByEvents.length === 0
            ? <span style={{ color: C.amber }}>⚠ Not linked to any B-events</span>
            : <span style={{ color: C.muted }}>Used by: {usedByEvents.map(e => e.name || e.id).join(", ")}</span>
          }
        </div>
      </div>
    </div>
  );
}

// ── ScheduleDetail: view/edit a single schedule ───────────────────────────────

function ScheduleDetail({ sched, onBack, onSave, canEdit, bEvents, dataSources = [], epoch, timeUnit, onUpdateBEvents, onGoToBEvent }) {
  const { C, FONT } = useTheme();
  const thStyle = {
    padding: "6px 10px", textAlign: "left", fontWeight: 600, fontSize: "11px",
    color: C.muted, borderBottom: `1px solid ${C.border}`, whiteSpace: "nowrap",
  };
  const tdStyle = { padding: "5px 10px", fontSize: "12px", color: C.text, whiteSpace: "nowrap" };
  const [name, setName] = useState(sched.name);
  const [description, setDescription] = useState(sched.description || "");
  const [saving, setSaving] = useState(false);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(15);
  const aboveRef = useRef(null);

  // Dynamically compute how many rows fit in the visible viewport so the
  // pagination controls are always reachable without scrolling.
  useEffect(() => {
    const ROW_H = 30;        // px per data row (12px text + 10px padding + 1px border ≈ 30)
    const TABLE_HEADER_H = 32;
    const PAGINATION_H = 44;
    const BOTTOM_PAD = 20;

    const compute = () => {
      const el = aboveRef.current;
      if (!el) return;
      const bottom = el.getBoundingClientRect().bottom;
      const available = window.innerHeight - bottom - TABLE_HEADER_H - PAGINATION_H - BOTTOM_PAD;
      setPageSize(Math.max(5, Math.floor(available / ROW_H)));
    };

    const obs = new ResizeObserver(compute);
    if (aboveRef.current) obs.observe(aboveRef.current);
    window.addEventListener('resize', compute);
    compute();
    return () => { obs.disconnect(); window.removeEventListener('resize', compute); };
  }, []);

  // Reset to first page if a resize makes the current page out of bounds.
  useEffect(() => { setPage(0); }, [pageSize]);

  // Import state
  const importRef = useRef(null);
  const [importPreview, setImportPreview] = useState(null);   // single-event preview
  const [multiImportPreview, setMultiImportPreview] = useState(null); // multi-event preview
  const [importError, setImportError] = useState(null);
  const [importing, setImporting] = useState(false);
  const [importTargetEventId, setImportTargetEventId] = useState(null);

  // Flatten all rows across all eventId entries for display
  const allRows = (sched.scheduleJson || []).flatMap(entry =>
    (entry.rows || []).map(r => ({ ...r, _eventId: entry.eventId }))
  );
  const totalRows = allRows.length;
  const pageRows = allRows.slice(page * pageSize, (page + 1) * pageSize);
  const totalPages = Math.ceil(totalRows / pageSize);

  // Collect attribute names from first few rows
  const attrHeaders = totalRows > 0
    ? Object.keys(allRows[0].attrs || {})
    : [];

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await onSave({ ...sched, name: name.trim(), description: description.trim() });
    } finally {
      setSaving(false);
    }
  };

  const matchBEvent = (eventId) =>
    bEvents.find(be => be.id === eventId) ??
    bEvents.find(be => be.name === eventId) ??
    bEvents.find(be => be.name?.toLowerCase() === eventId?.toLowerCase()) ??
    null;

  const handleImportFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setImportError(null);
    setImportPreview(null);
    setMultiImportPreview(null);
    try {
      let result;
      if (/\.(xlsx|xls|ods)$/i.test(file.name)) {
        const buf = await file.arrayBuffer();
        result = parseXlsx(buf, { epoch, timeUnit });
      } else {
        const text = await file.text();
        result = parsePlanCsv(text, { epoch, timeUnit });
      }
      if (result.error) { setImportError(result.error); return; }

      if (result.format === 'multi') {
        if (!result.groups.length) { setImportError("No data rows found in file."); return; }
        const matched = result.groups.map(g => ({ ...g, bEvent: matchBEvent(g.eventId) }));
        setMultiImportPreview({ matched, attrHeaders: result.attrHeaders, skipped: result.skipped, fileName: file.name });
      } else {
        if (!result.rows.length) { setImportError("No data rows found in file."); return; }
        const existing = sched.scheduleJson?.[0];
        const defaultEventId = importTargetEventId ?? existing?.eventId ?? bEvents[0]?.id ?? null;
        setImportTargetEventId(defaultEventId);
        setImportPreview({ rows: result.rows, attrHeaders: result.attrHeaders, skipped: result.skipped, fileName: file.name });
      }
    } catch (err) {
      setImportError(err.message || "Failed to parse file");
    }
  };

  const handleConfirmMultiImport = async (createStubs) => {
    if (!multiImportPreview) return;
    setImporting(true);
    setImportError(null);
    try {
      let newJson = sched.scheduleJson ?? [];
      let updatedBEvents = [...bEvents];
      const newStubs = [];
      for (const mg of multiImportPreview.matched) {
        if (mg.bEvent) {
          const targetId = mg.bEvent.id;
          newJson = mergeScheduleRows(newJson, targetId, mg.rows);
          // Ensure scheduleRef is set so the engine can resolve rows at run time
          updatedBEvents = linkBEventToSchedule(updatedBEvents, mg.bEvent.id, sched.id);
        } else if (createStubs) {
          const stubId = 'b' + Date.now() + Math.random().toString(36).slice(2, 6);
          newJson = mergeScheduleRows(newJson, stubId, mg.rows);
          newStubs.push({
            id: stubId,
            name: mg.eventId,
            scheduledTime: '0',
            effect: [],
            schedules: [{ eventId: stubId, scheduleRef: sched.id, rows: [] }],
            description: 'Created from schedule import — add arrival effect and queue',
          });
        }
      }
      await onSave({ ...sched, scheduleJson: newJson });
      const bEventsChanged = updatedBEvents !== bEvents || newStubs.length > 0;
      if (bEventsChanged && onUpdateBEvents) {
        await onUpdateBEvents([...updatedBEvents, ...newStubs]);
      }
      setMultiImportPreview(null);
    } catch (err) {
      setImportError(err.message || "Failed to save imported rows");
    } finally {
      setImporting(false);
    }
  };

  const handleConfirmImport = async () => {
    if (!importPreview || !importTargetEventId) return;
    setImporting(true);
    setImportError(null);
    try {
      const { rows } = importPreview;
      const newJson = mergeScheduleRows(sched.scheduleJson, importTargetEventId, rows);
      await onSave({ ...sched, scheduleJson: newJson });
      setImportPreview(null);
    } catch (err) {
      setImportError(err.message || "Failed to save imported rows");
    } finally {
      setImporting(false);
    }
  };

  const handleExportCsv = () => {
    if (totalRows === 0) return;
    const cols = ["eventId", "time", ...attrHeaders];
    const lines = [cols.join(",")];
    for (const row of allRows) {
      const vals = [
        row._eventId || "",
        row.time,
        ...attrHeaders.map(h => {
          const v = row.attrs?.[h];
          if (v == null) return "";
          return typeof v === "string" && v.includes(",") ? `"${v}"` : v;
        }),
      ];
      lines.push(vals.join(","));
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `schedule-${sched.name.replace(/[^a-z0-9]/gi, "-").toLowerCase()}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, color: C.text }}>
      {/* Everything above the rows table — measured so we know how many rows fit in the viewport */}
      <div ref={aboveRef} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Back button */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Btn size="sm" variant="ghost" onClick={onBack}>← Schedules</Btn>
        {sched.isDefault && (
          <span style={{ fontSize: 11, color: C.amber, fontWeight: 600 }}>★ Default</span>
        )}
      </div>

      {/* Name + description */}
      {canEdit ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div>
            <div style={{ fontSize: 11, color: C.muted, marginBottom: 4 }}>Name</div>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              style={{ width: "100%", padding: "6px 10px", border: `1px solid ${C.border}`, borderRadius: 4, fontSize: 13, background: C.surface, color: C.text }}
            />
          </div>
          <div>
            <div style={{ fontSize: 11, color: C.muted, marginBottom: 4 }}>Description</div>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={2}
              style={{ width: "100%", padding: "6px 10px", border: `1px solid ${C.border}`, borderRadius: 4, fontSize: 13, background: C.surface, color: C.text, resize: "vertical" }}
            />
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <Btn size="sm" onClick={handleSave} disabled={saving || !name.trim()}>
              {saving ? "Saving…" : "Save changes"}
            </Btn>
            <Btn size="sm" variant="ghost" onClick={onBack}>Cancel</Btn>
          </div>
        </div>
      ) : (
        <div>
          <SH style={{ marginBottom: 4 }}>{sched.name}</SH>
          {description && <div style={{ fontSize: 13, color: C.muted }}>{description}</div>}
        </div>
      )}

      {/* Stats bar */}
      <div style={{ display: "flex", gap: 16, padding: "8px 12px", background: C.panel, borderRadius: 6, fontSize: 13, color: C.muted, flexWrap: "wrap" }}>
        <span>{totalRows.toLocaleString()} rows</span>
        <span>{bEvents.filter(be => (be.schedules || []).some(s => s.scheduleRef === sched.id)).length} linked</span>
        {totalRows > 0 && (
          <>
            <span>
              First: {timeUnit === "minutes" ? formatMinutes(allRows[0].time) : allRows[0].time}
            </span>
            <span>
              Last: {timeUnit === "minutes" ? formatMinutes(allRows[allRows.length - 1].time) : allRows[allRows.length - 1].time}
            </span>
          </>
        )}
        <Btn size="xs" variant="ghost" onClick={handleExportCsv} disabled={totalRows === 0}>↑ Export CSV</Btn>
        {canEdit && (
          <>
            <Btn size="xs" variant="ghost" onClick={() => importRef.current?.click()}>↓ Import CSV/Excel</Btn>
            <input
              ref={importRef}
              type="file"
              accept=".csv,.xlsx,.xls,.ods"
              style={{ display: "none" }}
              onChange={handleImportFile}
            />
          </>
        )}
      </div>

      {/* Import error */}
      {importError && (
        <div style={{ fontSize: 12, color: C.danger, background: `${C.danger}18`, border: `1px solid ${C.danger}44`, borderRadius: 4, padding: "8px 12px" }}>
          {importError}
        </div>
      )}

      {/* Multi-event import preview */}
      {multiImportPreview && (() => {
        const unmatched = multiImportPreview.matched.filter(mg => !mg.bEvent);
        const totalRows = multiImportPreview.matched.reduce((s, mg) => s + mg.rows.length, 0);
        return (
          <div style={{ border: `1px solid ${C.accent}44`, borderRadius: 6, padding: "12px 14px", background: `${C.accent}08`, display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>
              Multi-event import — {multiImportPreview.fileName}
            </div>
            <div style={{ fontSize: 12, color: C.muted }}>
              {multiImportPreview.matched.length} event group{multiImportPreview.matched.length !== 1 ? "s" : ""} · {totalRows.toLocaleString()} rows total
              {multiImportPreview.skipped > 0 && ` · ${multiImportPreview.skipped} skipped`}
              {multiImportPreview.attrHeaders.length > 0 && ` · Attrs: ${multiImportPreview.attrHeaders.join(", ")}`}
            </div>
            {/* Per-event match table */}
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ background: C.panel }}>
                  <th style={thStyle}>Event (from file)</th>
                  <th style={thStyle}>Rows</th>
                  <th style={thStyle}>Status</th>
                </tr>
              </thead>
              <tbody>
                {multiImportPreview.matched.map((mg, idx) => (
                  <tr key={idx} style={{ borderBottom: `1px solid ${C.border}` }}>
                    <td style={tdStyle}>{mg.eventId}</td>
                    <td style={tdStyle}>{mg.rows.length}</td>
                    <td style={tdStyle}>
                      {mg.bEvent
                        ? <span style={{ color: C.green }}>✓ {mg.bEvent.name}</span>
                        : <span style={{ color: C.amber }}>⚠ No matching B-event</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {unmatched.length > 0 && (
              <div style={{ fontSize: 12, color: C.amber, background: `${C.amber}12`, border: `1px solid ${C.amber}33`, borderRadius: 4, padding: "8px 10px" }}>
                {unmatched.length} event{unmatched.length !== 1 ? "s" : ""} not found in this model.
                You can skip them, or create stub B-events (fire at start, no effect — add effects after import).
              </div>
            )}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Btn size="sm" onClick={() => handleConfirmMultiImport(false)} disabled={importing}>
                {importing ? "Importing…" : unmatched.length > 0 ? `Import (skip ${unmatched.length} unmatched)` : "Confirm import"}
              </Btn>
              {unmatched.length > 0 && onUpdateBEvents && (
                <Btn size="sm" variant="ghost" onClick={() => handleConfirmMultiImport(true)} disabled={importing}>
                  Import + create {unmatched.length} stub B-event{unmatched.length !== 1 ? "s" : ""}
                </Btn>
              )}
              <Btn size="sm" variant="ghost" onClick={() => setMultiImportPreview(null)}>Cancel</Btn>
            </div>
          </div>
        );
      })()}

      {/* Single-event import preview */}
      {importPreview && (
        <div style={{ border: `1px solid ${C.accent}44`, borderRadius: 6, padding: "12px 14px", background: `${C.accent}08`, display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>
            Import preview — {importPreview.fileName}
          </div>
          <div style={{ fontSize: 12, color: C.muted }}>
            {importPreview.rows.length.toLocaleString()} rows
            {importPreview.skipped > 0 && ` (${importPreview.skipped} skipped)`}
            {importPreview.attrHeaders.length > 0 && ` · Attributes: ${importPreview.attrHeaders.join(", ")}`}
          </div>
          {/* Target event selector */}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 12, color: C.muted }}>Assign to event:</span>
            <select
              value={importTargetEventId ?? ""}
              onChange={e => setImportTargetEventId(e.target.value || null)}
              style={{ padding: "4px 8px", border: `1px solid ${C.border}`, borderRadius: 4, fontSize: 12, background: C.surface, color: C.text }}
            >
              {/* Events already in the schedule */}
              {(sched.scheduleJson || []).map(e => (
                <option key={e.eventId} value={e.eventId}>
                  {bEvents.find(b => b.id === e.eventId)?.name ?? e.eventId} (in schedule)
                </option>
              ))}
              {/* Linked bEvents not yet in scheduleJson */}
              {bEvents
                .filter(be => !(sched.scheduleJson || []).some(e => e.eventId === be.id))
                .filter(be => (be.schedules || []).some(s => s.scheduleRef === sched.id || s.dist === "Schedule"))
                .map(be => (
                  <option key={be.id} value={be.id}>{be.name ?? be.id}</option>
                ))
              }
              {/* Any other bEvent if nothing found above */}
              {bEvents
                .filter(be =>
                  !(sched.scheduleJson || []).some(e => e.eventId === be.id) &&
                  !(be.schedules || []).some(s => s.scheduleRef === sched.id || s.dist === "Schedule")
                )
                .map(be => (
                  <option key={be.id} value={be.id}>{be.name ?? be.id}</option>
                ))
              }
            </select>
          </div>
          {/* Mini sample table */}
          <div style={{ overflowX: "auto", maxHeight: 160 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
              <thead>
                <tr style={{ background: C.panel }}>
                  <th style={thStyle}>Time</th>
                  {importPreview.attrHeaders.map(h => <th key={h} style={thStyle}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {importPreview.rows.slice(0, 5).map((row, i) => (
                  <tr key={i} style={{ borderBottom: `1px solid ${C.border}` }}>
                    <td style={tdStyle}>{timeUnit === "minutes" ? formatMinutes(row.time) : row.time}</td>
                    {importPreview.attrHeaders.map(h => (
                      <td key={h} style={tdStyle}>{String(row.attrs?.[h] ?? "")}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {importPreview.rows.length > 5 && (
              <div style={{ fontSize: 11, color: C.muted, padding: "4px 6px" }}>…and {importPreview.rows.length - 5} more rows</div>
            )}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <Btn size="sm" onClick={handleConfirmImport} disabled={importing || !importTargetEventId}>
              {importing ? "Importing…" : `Import ${importPreview.rows.length.toLocaleString()} rows`}
            </Btn>
            <Btn size="sm" variant="ghost" onClick={() => setImportPreview(null)}>Cancel</Btn>
          </div>
        </div>
      )}

      {/* Event links section */}
      {canEdit && onUpdateBEvents && (() => {
        const { linked, unlinked } = partitionScheduleBEvents(bEvents, sched.id, sched.scheduleJson);
        if (linked.length === 0 && unlinked.length === 0) return null;
        return (
          <div style={{ borderBottom: `1px solid ${C.border}`, paddingBottom: 12, display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ fontSize: 11, color: C.muted, fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase" }}>Event links</div>
            {linked.map(be => (
              <div key={be.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
                <span style={{ color: C.green }}>●</span>
                <span
                  style={{ color: C.text, flex: 1, cursor: onGoToBEvent ? "pointer" : "default", textDecoration: onGoToBEvent ? "underline dotted" : "none" }}
                  title={onGoToBEvent ? "Go to B-event" : ""}
                  onClick={() => onGoToBEvent?.(be.id)}
                >{be.name ?? be.id}</span>
                <span style={{ fontSize: 11, color: C.muted }}>→</span>
                <Btn size="xs" variant="ghost" onClick={() => {
                  onUpdateBEvents(unlinkBEventFromSchedule(bEvents, be.id, sched.id));
                }}>Unlink</Btn>
              </div>
            ))}
            {unlinked.map(be => (
              <div key={be.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
                <span style={{ color: C.amber }}>○</span>
                <span style={{ color: C.muted, flex: 1 }}>{be.name ?? be.id} — not linked</span>
                <Btn size="xs" onClick={() => {
                  onUpdateBEvents(linkBEventToSchedule(bEvents, be.id, sched.id));
                }}>Link</Btn>
              </div>
            ))}
          </div>
        );
      })()}

      </div>{/* end aboveRef */}

      {/* Rows table */}
      {totalRows === 0 ? (
        <Empty>No schedule rows — this schedule is empty.</Empty>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: C.panel }}>
                <th style={thStyle}>Event</th>
                <th style={thStyle}>Time</th>
                {attrHeaders.map(h => (
                  <th key={h} style={thStyle}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pageRows.map((row, i) => (
                <tr key={i} style={{ borderBottom: `1px solid ${C.border}` }}>
                  <td style={tdStyle}>{row._eventId}</td>
                  <td style={tdStyle}>
                    {timeUnit === "minutes" ? formatMinutes(row.time) : row.time}
                  </td>
                  {attrHeaders.map(h => (
                    <td key={h} style={tdStyle}>{String(row.attrs?.[h] ?? "")}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {totalPages > 1 && (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", fontSize: 13, color: C.muted }}>
              <span>Showing {page * pageSize + 1}–{Math.min((page + 1) * pageSize, totalRows)} of {totalRows.toLocaleString()}</span>
              <div style={{ display: "flex", gap: 4 }}>
                <Btn size="xs" variant="ghost" disabled={page === 0} onClick={() => setPage(p => p - 1)}>‹ Prev</Btn>
                <Btn size="xs" variant="ghost" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>Next ›</Btn>
              </div>
            </div>
          )}
        </div>
      )}

    </div>
  );
}

// ── NewScheduleForm ───────────────────────────────────────────────────────────

function NewScheduleForm({ modelId, userId, onCreated, onCancel }) {
  const { C, FONT } = useTheme();
  const [name, setName] = useState("New Schedule");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const handleCreate = async () => {
    if (!name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const saved = await saveModelSchedule({
        modelId,
        name: name.trim(),
        description: description.trim(),
        scheduleJson: [],
        isDefault: false,
      }, userId);
      onCreated(saved);
    } catch (err) {
      setError(err?.message || "Failed to create schedule");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ padding: 16, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6, display: "flex", flexDirection: "column", gap: 10 }}>
      <SH>New Schedule</SH>
      <div>
        <div style={{ fontSize: 11, color: C.muted, marginBottom: 4 }}>Name</div>
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          autoFocus
          style={{ width: "100%", padding: "6px 10px", border: `1px solid ${C.border}`, borderRadius: 4, fontSize: 13, background: C.bg, color: C.text }}
        />
      </div>
      <div>
        <div style={{ fontSize: 11, color: C.muted, marginBottom: 4 }}>Description (optional)</div>
        <input
          value={description}
          onChange={e => setDescription(e.target.value)}
          style={{ width: "100%", padding: "6px 10px", border: `1px solid ${C.border}`, borderRadius: 4, fontSize: 13, background: C.bg, color: C.text }}
        />
      </div>
      {error && <div style={{ color: C.danger, fontSize: 11 }}>{error}</div>}
      <div style={{ display: "flex", gap: 8 }}>
        <Btn size="sm" onClick={handleCreate} disabled={saving || !name.trim()}>
          {saving ? "Creating…" : "Create"}
        </Btn>
        <Btn size="sm" variant="ghost" onClick={onCancel}>Cancel</Btn>
      </div>
    </div>
  );
}

// ── Inline-rows detection ─────────────────────────────────────────────────────

/** Returns bEvents that have inline rows[] with no scheduleRef set. */
function bEventsWithInlineRows(bEvents = []) {
  return bEvents.filter(be =>
    (be.schedules || []).some(s =>
      Array.isArray(s.rows) && s.rows.length > 0 && !s.scheduleRef
    )
  );
}

function totalInlineRowCount(bEvents = []) {
  return bEvents.reduce((sum, be) =>
    sum + (be.schedules || []).reduce((s2, s) =>
      s2 + (Array.isArray(s.rows) && !s.scheduleRef ? s.rows.length : 0), 0
    ), 0
  );
}

// ── InlineRowsBanner ──────────────────────────────────────────────────────────

function InlineRowsBanner({ modelId, userId, bEvents, onExtracted }) {
  const { C, FONT } = useTheme();
  const [migrating, setMigrating] = useState(false);
  const [error, setError] = useState(null);
  const [scheduleName, setScheduleName] = useState("Default Schedule");
  const [showNameInput, setShowNameInput] = useState(false);

  const affectedEvents = bEventsWithInlineRows(bEvents);
  const rowCount = totalInlineRowCount(bEvents);

  const handleExtract = async () => {
    if (!scheduleName.trim()) return;
    setMigrating(true);
    setError(null);
    try {
      const { savedSchedule, updatedBEvents } = await extractInlineSchedule(
        { id: modelId, bEvents },
        userId,
        scheduleName.trim()
      );
      onExtracted(updatedBEvents, savedSchedule);
    } catch (err) {
      setError(err?.message || "Failed to move schedule data");
    } finally {
      setMigrating(false);
    }
  };

  return (
    <div style={{
      margin: "12px 16px",
      padding: "12px 14px",
      background: `${C.amber}18`,
      border: `1px solid ${C.amber}`,
      borderRadius: 6,
      display: "flex",
      flexDirection: "column",
      gap: 10,
    }}>
      <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
        <span style={{ fontSize: 18, lineHeight: 1 }}>⚠️</span>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 4 }}>
            Timetable rows stored inline
          </div>
          <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.5 }}>
            {rowCount.toLocaleString()} arrival rows across{" "}
            {affectedEvents.length} event{affectedEvents.length !== 1 ? "s" : ""} (
            {affectedEvents.map(e => e.name || e.id).join(", ")}) are stored
            inside the model. Moving them to a named schedule reduces model size and
            lets you switch timetables at run time.
          </div>
        </div>
      </div>

      {showNameInput ? (
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <input
            value={scheduleName}
            onChange={e => setScheduleName(e.target.value)}
            placeholder="Schedule name"
            autoFocus
            style={{
              flex: 1,
              minWidth: 160,
              padding: "5px 9px",
              border: `1px solid ${C.border}`,
              borderRadius: 4,
              fontSize: 13,
              background: C.surface,
              color: C.text,
            }}
          />
          <Btn
            size="sm"
            onClick={handleExtract}
            disabled={migrating || !scheduleName.trim()}
          >
            {migrating ? "Moving…" : "Move to schedule"}
          </Btn>
          <Btn size="sm" variant="ghost" onClick={() => setShowNameInput(false)}>Cancel</Btn>
        </div>
      ) : (
        <div style={{ display: "flex", gap: 8 }}>
          <Btn size="sm" onClick={() => setShowNameInput(true)} disabled={migrating}>
            Move to a named schedule
          </Btn>
          <span style={{ fontSize: 11, color: C.muted, alignSelf: "center" }}>
            The model will be saved automatically after moving.
          </span>
        </div>
      )}

      {error && (
        <div style={{ fontSize: 11, color: C.danger }}>{error}</div>
      )}
    </div>
  );
}

const SANS = "Inter,'Segoe UI',Arial,sans-serif";

// ── ScheduleManager (exported) ────────────────────────────────────────────────

export function ScheduleManager({ modelId, userId, canEdit, bEvents = [], dataSources = [], epoch, timeUnit = "minutes", onBEventsExtracted, onUpdateBEvents, focusScheduleId, onFocusHandled, onGoToBEvent }) {
  const { C, FONT } = useTheme();
  const [schedules, setSchedules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [showNewForm, setShowNewForm] = useState(false);

  const reload = useCallback(() => {
    if (!modelId) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    fetchModelSchedules(modelId)
      .then(result => {
        setSchedules(result);
        if (result.length > 0 && !selectedId) {
          setSelectedId(result.find(s => s.isDefault)?.id ?? result[0]?.id);
        }
      })
      .catch(err => setError(err?.message || "Failed to load schedules"))
      .finally(() => setLoading(false));
  }, [modelId]);

  useEffect(() => { reload(); }, [reload]);

  useEffect(()=>{
    if(!focusScheduleId)return;
    setSelectedId(focusScheduleId);
    setShowNewForm(false);
    onFocusHandled?.();
  },[focusScheduleId]);

  const selectedSched = schedules.find(s => s.id === selectedId) ?? null;

  const handleSetDefault = async (schedId) => {
    try {
      await setDefaultSchedule(schedId, modelId);
      setSchedules(prev => prev.map(s => ({ ...s, isDefault: s.id === schedId })));
    } catch (err) {
      console.error("Failed to set default schedule:", err);
    }
  };

  const handleDelete = async (schedId) => {
    try {
      const result = await deleteModelSchedule(schedId, userId);
      if (result.ok) {
        setSchedules(prev => prev.filter(s => s.id !== schedId));
        if (selectedId === schedId) setSelectedId(null);
      } else {
        console.error("Delete failed:", result.error);
      }
    } catch (err) {
      console.error("Failed to delete schedule:", err);
    }
  };

  const handleSaveDetail = async (updatedSched) => {
    try {
      const saved = await saveModelSchedule(updatedSched, userId);
      setSchedules(prev => prev.map(s => s.id === saved.id ? saved : s));
      return saved;
    } catch (err) {
      console.error("Failed to save schedule:", err);
      throw err;
    }
  };

  const handleCreated = (newSched) => {
    setSchedules(prev => [...prev, newSched]);
    setSelectedId(newSched.id);
    setShowNewForm(false);
  };

  if (loading) {
    return <div style={{ padding: 24, color: C.muted, fontSize: 13 }}>Loading schedules…</div>;
  }

  if (error) {
    return (
      <InfoBox type="warn" style={{ margin: 16 }}>
        <div>Could not load schedules: {error}</div>
        <Btn size="xs" onClick={reload} style={{ marginTop: 6 }}>Retry</Btn>
      </InfoBox>
    );
  }

  // Schedule detail view
  if (selectedSched) {
    return (
      <div style={{ padding: 16 }}>
        <ScheduleDetail
          sched={selectedSched}
          bEvents={bEvents}
          dataSources={dataSources}
          epoch={epoch}
          timeUnit={timeUnit}
          canEdit={canEdit}
          onBack={() => setSelectedId(null)}
          onSave={handleSaveDetail}
          onUpdateBEvents={onUpdateBEvents}
          onGoToBEvent={onGoToBEvent}
        />
      </div>
    );
  }

  // Schedule list view
  const hasInline = canEdit && bEventsWithInlineRows(bEvents).length > 0;

  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {/* Inline-rows migration banner */}
      {hasInline && (
        <InlineRowsBanner
          modelId={modelId}
          userId={userId}
          bEvents={bEvents}
          onExtracted={(updatedBEvents, savedSchedule) => {
            onBEventsExtracted?.(updatedBEvents);
            reload();
          }}
        />
      )}

      {/* Header */}
      <div style={{ padding: "12px 16px 0" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, color: C.text, fontFamily: SANS }}>Schedules</div>
            <div style={{ fontSize: 12, color: C.muted, fontFamily: SANS, marginTop: 2 }}>
              {schedules.length === 0 ? "No schedules yet" : `${schedules.length} schedule${schedules.length !== 1 ? "s" : ""}`}
            </div>
          </div>
          {canEdit && !showNewForm && (
            <Btn variant="primary" onClick={() => setShowNewForm(true)}>+ New Schedule</Btn>
          )}
        </div>
      </div>

      {/* New schedule form */}
      {showNewForm && (
        <div style={{ padding: "12px 16px", borderBottom: `1px solid ${C.border}` }}>
          <NewScheduleForm
            modelId={modelId}
            userId={userId}
            onCreated={handleCreated}
            onCancel={() => setShowNewForm(false)}
          />
        </div>
      )}

      {/* Schedule cards */}
      {schedules.length === 0 ? (
        <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 10, padding: "40px 24px", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 12, margin: "12px 16px 16px" }}>
          <div style={{ fontSize: 32, lineHeight: 1 }}>📅</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: C.text, fontFamily: SANS }}>No schedules yet</div>
          <div style={{ fontSize: 13, color: C.muted, fontFamily: SANS, lineHeight: 1.6, maxWidth: 380 }}>
            Create a named timetable to store arrival data separately from the simmodlr model — switch timetables at run time.
          </div>
          {canEdit && !showNewForm && (
            <Btn variant="primary" onClick={() => setShowNewForm(true)}>Create first schedule</Btn>
          )}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "0 16px 16px" }}>
          {schedules.map(sched => (
            <ScheduleRow
              key={sched.id}
              sched={sched}
              bEvents={bEvents}
              isSelected={sched.id === selectedId}
              onSelect={setSelectedId}
              onSetDefault={handleSetDefault}
              onDelete={handleDelete}
              canEdit={canEdit}
            />
          ))}
        </div>
      )}
    </div>
  );
}
