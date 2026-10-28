// ui/editors/EvidenceEditor.jsx — the Evidence tab in Design. Records are
// created and edited here; links say which element or parameter each record
// backs. The three views are the registers (evidence, assumptions) and a
// coverage table over every backable element and parameter.

import { useMemo, useState } from "react";
import {
  EVIDENCE_TYPES, backingStatus, backingTargetLabel, buildBackableUnits,
  coverageSummary, findBrokenLinks, recordDisplayName,
} from "../../engine/backing-links.js";
import { useTheme } from "../shared/ThemeContext.jsx";
import { useConfirm } from "../shared/useConfirm.jsx";
import { BackingTargetPicker } from "./BackingTargetPicker.jsx";
import {
  LEVEL_LABELS, LEVEL_VALUES, addAssumption, addEvidence, attach, deleteRecord, detach,
  levelOf, removeBrokenLinks, updateRecord,
} from "./evidenceModelOps.js";

const SANS = "Inter,'Segoe UI',Arial,sans-serif";
const STATUS_LABEL = { evidenced: "Evidenced", assumed: "Assumption only", unbacked: "Unbacked" };

/** @param {Record<string, any>} model */
const optionsFor = model => ({ schedules: model.schedules || [] });

/**
 * @param {{ model: Record<string, any>, canEdit: boolean, onChange: (next: Record<string, any>) => void }} props
 */
export function EvidenceEditor({ model, canEdit, onChange }) {
  const { C, FONT } = useTheme();
  const { confirm, confirmDialog } = useConfirm();
  const [view, setView] = useState("evidence");
  const [expanded, setExpanded] = useState(null);
  const [attachTarget, setAttachTarget] = useState({});
  const [coverageFilter, setCoverageFilter] = useState("all");
  const [coverageRecord, setCoverageRecord] = useState({});

  const opts = useMemo(() => optionsFor(model), [model]);
  const units = useMemo(() => buildBackableUnits(model, opts), [model, opts]);
  const summary = useMemo(() => coverageSummary(model, opts), [model, opts]);
  const broken = useMemo(() => findBrokenLinks(model, opts), [model, opts]);
  const links = model.backingLinks || [];
  const evidence = model.evidence || [];
  const assumptions = model.assumptions || [];

  const write = next => { if (canEdit) onChange(next); };

  const unitFor = link => units.find(u => u.targetType === link.targetType
    && String(u.targetId) === String(link.targetId)
    && (u.targetPath || "") === (link.targetPath || ""));
  const labelFor = link => {
    const u = unitFor(link);
    if (!u) return `${backingTargetLabel(link.targetType)} (missing)`;
    return u.kind === "parameter" ? `${u.label} · ${u.paramLabel}` : u.label;
  };
  const linksFor = (recordType, id) => links.filter(l => l.recordType === recordType && String(l.recordId) === String(id));

  const inputStyle = {
    background: "transparent", border: `1px solid ${C.border}`, borderRadius: 4,
    color: C.text, fontFamily: FONT, fontSize: 12, padding: "5px 8px", width: "100%", boxSizing: "border-box",
  };
  const button = (label, onClick, disabled = false) => (
    <button type="button" onClick={onClick} disabled={disabled}
      style={{ ...inputStyle, width: "auto", cursor: disabled ? "default" : "pointer", color: disabled ? C.muted : C.text, padding: "5px 10px" }}>
      {label}
    </button>
  );

  const removeRecord = async (recordType, id, name) => {
    const count = linksFor(recordType, id).length;
    const ok = await confirm(
      `Delete "${name}"? ${count ? `Its ${count} attachment${count === 1 ? "" : "s"} will also be removed. ` : ""}This cannot be undone once saved.`,
      { title: "Delete record", confirmLabel: "Delete", variant: "danger" },
    );
    if (!ok) return;
    write(deleteRecord(model, recordType, id));
    setExpanded(null);
  };

  const recordFormFields = (recordType, r) => {
    const set = patch => write(updateRecord(model, recordType, r.id, patch));
    const field = (label, control) => (
      <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 11, color: C.muted, fontFamily: SANS }}>
        {label}{control}
      </label>
    );
    const levelSelect = (value, onPick) => (
      <select value={levelOf(value)} disabled={!canEdit} style={inputStyle}
        onChange={e => onPick(LEVEL_VALUES[e.target.value])}>
        {Object.keys(LEVEL_VALUES).map(k => <option key={k} value={k}>{LEVEL_LABELS[k]}</option>)}
      </select>
    );
    const text = (value, key, multiline = false) => multiline
      ? <textarea value={value || ""} disabled={!canEdit} rows={3} style={{ ...inputStyle, resize: "vertical" }}
          onChange={e => set({ [key]: e.target.value })} />
      : <input value={value || ""} disabled={!canEdit} style={inputStyle}
          onChange={e => set({ [key]: e.target.value })} />;

    if (recordType === "evidence") {
      return (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          {field("Name", text(r.name, "name"))}
          {field("Type", (
            <select value={r.type} disabled={!canEdit} style={inputStyle} onChange={e => set({ type: e.target.value })}>
              {EVIDENCE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          ))}
          <div style={{ gridColumn: "1 / -1" }}>{field("Description", text(r.description, "description", true))}</div>
          {field("Source", text(r.source, "source"))}
          {field("Strength", levelSelect(r.strength, v => set({ strength: v })))}
          {field("Date captured", text(r.dateCaptured, "dateCaptured"))}
          {field("Last verified", text(r.lastVerified, "lastVerified"))}
        </div>
      );
    }
    return (
      <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 10 }}>
        {field("Name", text(r.name, "name"))}
        {field("Assumption", text(r.text, "text", true))}
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: C.text, fontFamily: SANS }}>
          <input type="checkbox" checked={!!r.contested} disabled={!canEdit} onChange={e => set({ contested: e.target.checked })} />
          Contested (stakeholders disagree)
        </label>
        {field("Confidence", levelSelect(r.confidence, v => set({ confidence: v })))}
      </div>
    );
  };

  const attachControls = (recordType, r) => {
    const key = `${recordType}:${r.id}`;
    const target = attachTarget[key] || null;
    const attachNow = () => {
      if (!target) return;
      write(attach(model, { recordType, recordId: r.id, ...target }));
      setAttachTarget(prev => ({ ...prev, [key]: null }));
    };
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ fontSize: 11, color: C.muted, fontFamily: SANS }}>Attached to</div>
        {linksFor(recordType, r.id).length === 0 && (
          <div style={{ fontSize: 12, color: C.amber, fontFamily: SANS }}>Not attached to anything yet.</div>
        )}
        {linksFor(recordType, r.id).map(l => (
          <div key={l.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: C.text, fontFamily: SANS }}>
            <span style={{ flex: 1 }}>{labelFor(l)}</span>
            {canEdit && button("Remove", () => write(detach(model, l.id)))}
          </div>
        ))}
        {canEdit && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <BackingTargetPicker units={units} value={target} onChange={t => setAttachTarget(prev => ({ ...prev, [key]: t }))} />
            {target && button("Attach", attachNow)}
          </div>
        )}
      </div>
    );
  };

  const recordList = (recordType, records) => (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {records.map(r => {
        const open = expanded === `${recordType}:${r.id}`;
        const name = recordDisplayName(r);
        const backs = linksFor(recordType, r.id).length;
        const level = levelOf(recordType === "evidence" ? r.strength : r.confidence);
        return (
          <div key={r.id} style={{ border: `1px solid ${C.border}`, borderRadius: 6, background: C.panel }}>
            <button type="button" onClick={() => setExpanded(open ? null : `${recordType}:${r.id}`)}
              style={{ ...inputStyle, border: "none", display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 12px", cursor: "pointer", textAlign: "left" }}>
              <span style={{ fontWeight: 600, color: C.text }}>{name}</span>
              <span style={{ fontSize: 11, color: C.muted, fontFamily: SANS }}>
                {recordType === "evidence"
                  ? EVIDENCE_TYPES.find(t => t.value === r.type)?.label || r.type
                  : (r.contested ? "Contested assumption" : "Assumption")}
                {" · "}{LEVEL_LABELS[level]}{" · "}
                {backs ? `backs ${backs}` : "not attached"}
              </span>
            </button>
            {open && (
              <div style={{ padding: "4px 12px 14px", display: "flex", flexDirection: "column", gap: 14 }}>
                {recordFormFields(recordType, r)}
                {attachControls(recordType, r)}
                {canEdit && (
                  <div>{button("Delete", () => removeRecord(recordType, r.id, name))}</div>
                )}
              </div>
            )}
          </div>
        );
      })}
      {records.length === 0 && (
        <div style={{ fontSize: 12, color: C.muted, fontFamily: SANS }}>
          {recordType === "evidence" ? "No evidence recorded yet." : "No assumptions recorded yet."}
        </div>
      )}
      {canEdit && button(recordType === "evidence" ? "Add evidence" : "Add assumption", () => {
        const values = recordType === "evidence"
          ? { name: "", type: "literature", description: "", source: "", strength: LEVEL_VALUES.medium, dateCaptured: "" }
          : { name: "", text: "", contested: false, confidence: LEVEL_VALUES.medium };
        const next = recordType === "evidence" ? addEvidence(model, values) : addAssumption(model, values);
        write(next.model);
        setExpanded(`${recordType}:${next.record.id}`);
      })}
    </div>
  );

  const statusOf = u => backingStatus(links, u.targetType, u.targetId, u.targetPath);
  const rows = units.filter(u => coverageFilter === "all" || statusOf(u) === coverageFilter);
  const allRecords = [
    ...evidence.map(r => ({ key: `evidence:${r.id}`, recordType: "evidence", record: r })),
    ...assumptions.map(r => ({ key: `assumption:${r.id}`, recordType: "assumption", record: r })),
  ];

  const attachFromCoverage = (u) => {
    const pick = coverageRecord[u.key];
    if (!pick) return;
    const [recordType, recordId] = pick.split(":");
    write(attach(model, {
      recordType: recordType === "evidence" ? "evidence" : "assumption",
      recordId: pick.slice(pick.indexOf(":") + 1),
      targetType: u.targetType,
      targetId: u.targetId,
      ...(u.targetPath ? { targetPath: u.targetPath } : {}),
    }));
    setCoverageRecord(prev => ({ ...prev, [u.key]: "" }));
  };

  const tabStyle = active => ({
    ...inputStyle, width: "auto", cursor: "pointer", padding: "6px 12px",
    background: active ? C.panel : "transparent", fontWeight: active ? 600 : 400,
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, fontFamily: SANS }}>
      <div>
        <div style={{ fontSize: 18, fontWeight: 700, color: C.text }}>Evidence and assumptions</div>
        <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>
          {summary.total === 0
            ? "Nothing in this model can be backed yet."
            : `${summary.evidenced} of ${summary.total} elements and parameters evidenced, ${summary.assumed} assumption only, ${summary.unbacked} unbacked.`}
        </div>
      </div>

      <div style={{ display: "flex", gap: 6 }} role="tablist">
        <button type="button" role="tab" aria-selected={view === "evidence"} style={tabStyle(view === "evidence")} onClick={() => setView("evidence")}>Evidence ({evidence.length})</button>
        <button type="button" role="tab" aria-selected={view === "assumptions"} style={tabStyle(view === "assumptions")} onClick={() => setView("assumptions")}>Assumptions ({assumptions.length})</button>
        <button type="button" role="tab" aria-selected={view === "coverage"} style={tabStyle(view === "coverage")} onClick={() => setView("coverage")}>Coverage</button>
      </div>

      {broken.length > 0 && view === "coverage" && (
        <div style={{ border: `1px solid ${C.amber}`, borderRadius: 6, padding: "10px 12px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 12, color: C.text }}>
            {broken.length} backing link{broken.length === 1 ? "" : "s"} point at something that no longer exists.
          </span>
          {canEdit && button("Remove broken links", () => write(removeBrokenLinks(model, opts)))}
        </div>
      )}

      {view === "evidence" && recordList("evidence", evidence)}
      {view === "assumptions" && recordList("assumption", assumptions)}

      {view === "coverage" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <label style={{ fontSize: 12, color: C.muted, display: "flex", gap: 8, alignItems: "center" }}>
            Show
            <select value={coverageFilter} onChange={e => setCoverageFilter(e.target.value)} style={{ ...inputStyle, width: "auto" }}>
              <option value="all">All</option>
              <option value="unbacked">Unbacked</option>
              <option value="assumed">Assumption only</option>
              <option value="evidenced">Evidenced</option>
            </select>
          </label>
          {rows.length === 0 && <div style={{ fontSize: 12, color: C.muted }}>Nothing matches this filter.</div>}
          {rows.map(u => {
            const key = `${u.targetType}|${u.targetId}|${u.targetPath || ""}`;
            const status = statusOf(u);
            const pickValue = coverageRecord[key] ?? "";
            return (
              <div key={key} style={{ display: "grid", gridTemplateColumns: "minmax(0,2fr) 110px minmax(0,2fr)", gap: 10, alignItems: "center", paddingLeft: u.kind === "parameter" ? 18 : 0, fontSize: 12 }}>
                <span style={{ color: u.kind === "element" ? C.text : C.muted, fontWeight: u.kind === "element" ? 600 : 400 }}>
                  {u.kind === "parameter" ? u.paramLabel : u.label}
                </span>
                <span style={{ color: status === "evidenced" ? C.text : C.muted }}>{STATUS_LABEL[status]}</span>
                {canEdit ? (
                  <span style={{ display: "flex", gap: 6 }}>
                    <select value={pickValue} onChange={e => setCoverageRecord(prev => ({ ...prev, [key]: e.target.value }))} style={{ ...inputStyle, flex: 1 }}>
                      <option value="">Attach a record…</option>
                      {allRecords.map(r => <option key={r.key} value={r.key}>{recordDisplayName(r.record)}</option>)}
                    </select>
                    {pickValue && button("Attach", () => attachFromCoverage({ ...u, key }))}
                  </span>
                ) : <span />}
              </div>
            );
          })}
        </div>
      )}
      {confirmDialog}
    </div>
  );
}
