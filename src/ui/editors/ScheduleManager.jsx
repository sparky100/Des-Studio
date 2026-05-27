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

import { useState, useEffect, useCallback } from "react";
import { C, FONT } from "../shared/tokens.js";
import { Btn, SH, InfoBox, Empty } from "../shared/components.jsx";
import {
  fetchModelSchedules,
  saveModelSchedule,
  deleteModelSchedule,
  setDefaultSchedule,
  extractInlineSchedule,
} from "../../db/models.js";

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatMinutes(minutes) {
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
        display: "grid",
        gridTemplateColumns: "1.5rem 1fr 80px 1fr auto",
        alignItems: "center",
        gap: 8,
        padding: "10px 12px",
        background: isSelected ? `${C.blue}18` : "transparent",
        borderLeft: isSelected ? `3px solid ${C.blue}` : "3px solid transparent",
        cursor: "pointer",
        borderBottom: `1px solid ${C.border}`,
        transition: "background 0.1s",
      }}
    >
      {/* Default star */}
      <span
        title={sched.isDefault ? "Default schedule" : "Set as default"}
        onClick={e => { e.stopPropagation(); canEdit && onSetDefault(sched.id); }}
        style={{ color: sched.isDefault ? C.amber : C.muted, fontSize: 16, cursor: canEdit ? "pointer" : "default" }}
      >
        {sched.isDefault ? "★" : "☆"}
      </span>

      {/* Name + description */}
      <div>
        <div style={{ fontWeight: 600, fontSize: FONT.sm, color: C.text }}>{sched.name}</div>
        {sched.description && (
          <div style={{ fontSize: FONT.xs, color: C.muted, marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {sched.description}
          </div>
        )}
      </div>

      {/* Row count */}
      <div style={{ fontSize: FONT.sm, color: C.muted, textAlign: "right" }}>
        {rowCount.toLocaleString()} rows
      </div>

      {/* Used by */}
      <div style={{ fontSize: FONT.xs, color: C.muted }}>
        {usedByEvents.length === 0
          ? <span style={{ color: C.warn }}>Not linked</span>
          : `${usedByEvents.length} arrival event${usedByEvents.length === 1 ? "" : "s"}`
        }
      </div>

      {/* Actions */}
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
  );
}

// ── ScheduleDetail: view/edit a single schedule ───────────────────────────────

function ScheduleDetail({ sched, onBack, onSave, canEdit, bEvents, epoch, timeUnit }) {
  const [name, setName] = useState(sched.name);
  const [description, setDescription] = useState(sched.description || "");
  const [saving, setSaving] = useState(false);
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 50;

  // Flatten all rows across all eventId entries for display
  const allRows = (sched.scheduleJson || []).flatMap(entry =>
    (entry.rows || []).map(r => ({ ...r, _eventId: entry.eventId }))
  );
  const totalRows = allRows.length;
  const pageRows = allRows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalPages = Math.ceil(totalRows / PAGE_SIZE);

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
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Back button */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Btn size="sm" variant="ghost" onClick={onBack}>← Schedules</Btn>
        {sched.isDefault && (
          <span style={{ fontSize: FONT.xs, color: C.amber, fontWeight: 600 }}>★ Default</span>
        )}
      </div>

      {/* Name + description */}
      {canEdit ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div>
            <div style={{ fontSize: FONT.xs, color: C.muted, marginBottom: 4 }}>Name</div>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              style={{ width: "100%", padding: "6px 10px", border: `1px solid ${C.border}`, borderRadius: 4, fontSize: FONT.sm, background: C.surface, color: C.text }}
            />
          </div>
          <div>
            <div style={{ fontSize: FONT.xs, color: C.muted, marginBottom: 4 }}>Description</div>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={2}
              style={{ width: "100%", padding: "6px 10px", border: `1px solid ${C.border}`, borderRadius: 4, fontSize: FONT.sm, background: C.surface, color: C.text, resize: "vertical" }}
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
          {description && <div style={{ fontSize: FONT.sm, color: C.muted }}>{description}</div>}
        </div>
      )}

      {/* Stats bar */}
      <div style={{ display: "flex", gap: 16, padding: "8px 12px", background: C.panelBg || C.surface, borderRadius: 6, fontSize: FONT.sm, color: C.muted, flexWrap: "wrap" }}>
        <span>{totalRows.toLocaleString()} rows</span>
        <span>{(sched.scheduleJson || []).length} event{(sched.scheduleJson || []).length !== 1 ? "s" : ""}</span>
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
      </div>

      {/* Rows table */}
      {totalRows === 0 ? (
        <Empty>No schedule rows — this schedule is empty.</Empty>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: FONT.sm }}>
            <thead>
              <tr style={{ background: C.panelBg || C.surface }}>
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
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", fontSize: FONT.sm, color: C.muted }}>
              <span>Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, totalRows)} of {totalRows.toLocaleString()}</span>
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

const thStyle = {
  padding: "6px 10px",
  textAlign: "left",
  fontWeight: 600,
  fontSize: "11px",
  borderBottom: `1px solid ${C.border}`,
  whiteSpace: "nowrap",
};

const tdStyle = {
  padding: "5px 10px",
  fontSize: "12px",
  whiteSpace: "nowrap",
};

// ── NewScheduleForm ───────────────────────────────────────────────────────────

function NewScheduleForm({ modelId, userId, onCreated, onCancel }) {
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
        <div style={{ fontSize: FONT.xs, color: C.muted, marginBottom: 4 }}>Name</div>
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          autoFocus
          style={{ width: "100%", padding: "6px 10px", border: `1px solid ${C.border}`, borderRadius: 4, fontSize: FONT.sm, background: C.bg || "#fff", color: C.text }}
        />
      </div>
      <div>
        <div style={{ fontSize: FONT.xs, color: C.muted, marginBottom: 4 }}>Description (optional)</div>
        <input
          value={description}
          onChange={e => setDescription(e.target.value)}
          style={{ width: "100%", padding: "6px 10px", border: `1px solid ${C.border}`, borderRadius: 4, fontSize: FONT.sm, background: C.bg || "#fff", color: C.text }}
        />
      </div>
      {error && <div style={{ color: C.danger, fontSize: FONT.xs }}>{error}</div>}
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
          <div style={{ fontSize: FONT.sm, fontWeight: 600, color: C.text, marginBottom: 4 }}>
            Timetable rows stored inline
          </div>
          <div style={{ fontSize: FONT.sm, color: C.muted, lineHeight: 1.5 }}>
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
              fontSize: FONT.sm,
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
          <span style={{ fontSize: FONT.xs, color: C.muted, alignSelf: "center" }}>
            The model will be saved automatically after moving.
          </span>
        </div>
      )}

      {error && (
        <div style={{ fontSize: FONT.xs, color: C.danger }}>{error}</div>
      )}
    </div>
  );
}

// ── ScheduleManager (exported) ────────────────────────────────────────────────

export function ScheduleManager({ modelId, userId, canEdit, bEvents = [], epoch, timeUnit = "minutes", onBEventsExtracted }) {
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
    return <div style={{ padding: 24, color: C.muted, fontSize: FONT.sm }}>Loading schedules…</div>;
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
          epoch={epoch}
          timeUnit={timeUnit}
          canEdit={canEdit}
          onBack={() => setSelectedId(null)}
          onSave={handleSaveDetail}
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
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", borderBottom: `1px solid ${C.border}` }}>
        <SH>Schedules</SH>
        {canEdit && !showNewForm && (
          <Btn size="sm" onClick={() => setShowNewForm(true)}>+ New Schedule</Btn>
        )}
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

      {/* Table header */}
      {schedules.length > 0 && (
        <div style={{
          display: "grid",
          gridTemplateColumns: "1.5rem 1fr 80px 1fr auto",
          gap: 8,
          padding: "6px 12px",
          background: C.panelBg || C.surface,
          borderBottom: `1px solid ${C.border}`,
          fontSize: FONT.xs,
          color: C.muted,
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: "0.05em",
        }}>
          <span />
          <span>Name</span>
          <span style={{ textAlign: "right" }}>Rows</span>
          <span>Used by</span>
          <span />
        </div>
      )}

      {/* Schedule rows */}
      {schedules.length === 0 ? (
        <Empty style={{ margin: 24 }}>
          No schedules yet.
          {canEdit && " Create one to store timetable data separately from the DES logic."}
        </Empty>
      ) : (
        schedules.map(sched => (
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
        ))
      )}

      {/* Footer info */}
      {schedules.length > 0 && (
        <div style={{ padding: "8px 16px", fontSize: FONT.xs, color: C.muted, borderTop: `1px solid ${C.border}` }}>
          ★ = default schedule (used when none is selected at run time). Click a row to view details.
        </div>
      )}
    </div>
  );
}
