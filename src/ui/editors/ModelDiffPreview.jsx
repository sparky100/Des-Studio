import { useMemo, useState } from "react";
import { validateModel } from "../../engine/validation.js";
import { C, FONT } from "../shared/tokens.js";
import { Btn, Empty, SH, Tag } from "../shared/components.jsx";

const SECTION_META = [
  { key: "entityTypes", label: "Entity Classes" },
  { key: "bEvents", label: "B-Events" },
  { key: "cEvents", label: "C-Events" },
  { key: "queues", label: "Queues" },
  { key: "stateVariables", label: "State Variables" },
];

function itemKey(item = {}) {
  return item.id || item.name || JSON.stringify(item);
}

function sectionDiff(currentItems = [], proposedItems = []) {
  const current = new Map(currentItems.map(item => [itemKey(item), item]));
  const proposed = new Map(proposedItems.map(item => [itemKey(item), item]));
  const added = [];
  const removed = [];
  const modified = [];
  const unchanged = [];

  for (const [key, item] of proposed) {
    if (!current.has(key)) {
      added.push(item);
    } else if (JSON.stringify(current.get(key)) !== JSON.stringify(item)) {
      modified.push({ before: current.get(key), after: item });
    } else {
      unchanged.push(item);
    }
  }

  for (const [key, item] of current) {
    if (!proposed.has(key)) removed.push(item);
  }

  return { added, removed, modified, unchanged };
}

export function buildModelDiff(currentModel = {}, proposedModel = {}) {
  return SECTION_META.map(section => ({
    ...section,
    diff: sectionDiff(currentModel[section.key] || [], proposedModel[section.key] || []),
  }));
}

function mergeSections(currentModel, proposedModel, selectedSections) {
  return SECTION_META.reduce((merged, section) => ({
    ...merged,
    [section.key]: selectedSections.includes(section.key)
      ? (proposedModel[section.key] || [])
      : (currentModel[section.key] || []),
  }), { ...currentModel });
}

function ChangeList({ title, items, color, renderItem }) {
  if (!items.length) return null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <Tag label={`${title}: ${items.length}`} color={color} />
      {items.map((item, index) => (
        <div key={index} style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 6, padding: 8, color: C.text, fontFamily: FONT, fontSize: 11 }}>
          {renderItem(item)}
        </div>
      ))}
    </div>
  );
}

function friendlyValue(value) {
  if (Array.isArray(value)) return `${value.length} item${value.length === 1 ? "" : "s"}`;
  if (value && typeof value === "object") {
    if (value.dist || value.type) {
      const dist = value.dist || value.type;
      const params = value.distParams || value.params || value.parameters || {};
      const paramText = Object.entries(params)
        .map(([key, paramValue]) => `${key} ${Array.isArray(paramValue) ? `${paramValue.length} values` : paramValue}`)
        .join(", ");
      return paramText ? `${dist} (${paramText})` : dist;
    }
    return value.name || value.id || `${Object.keys(value).length} fields`;
  }
  if (value === true) return "yes";
  if (value === false) return "no";
  if (value == null || value === "") return "blank";
  return String(value);
}

function changedFields(before = {}, after = {}) {
  const keys = Array.from(new Set([...Object.keys(before || {}), ...Object.keys(after || {})]))
    .filter(key => JSON.stringify(before?.[key]) !== JSON.stringify(after?.[key]));
  return keys.filter(key => !["id"].includes(key));
}

function renderItemSummary(item) {
  return item.name || item.id || "Unnamed";
}

function renderModifiedSummary(item) {
  const before = item.before || {};
  const after = item.after || {};
  const title = after.name || before.name || after.id || before.id || "Unnamed";
  const fields = changedFields(before, after);
  if (!fields.length) return <div>{title}</div>;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      <div style={{ color: C.text, fontWeight: 700 }}>{title}</div>
      {fields.slice(0, 5).map(field => (
        <div key={field} style={{ color: C.muted }}>
          <span style={{ color: C.amber }}>{field}</span>: {friendlyValue(before[field])} to {friendlyValue(after[field])}
        </div>
      ))}
      {fields.length > 5 && <div style={{ color: C.muted }}>{fields.length - 5} more field changes</div>}
    </div>
  );
}

export function ModelDiffPreview({ currentModel = {}, proposedModel = {}, onApply, onApplyAndSave, onDiscard, allowDraftApply = false }) {
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState(SECTION_META.map(section => section.key));
  const [validation, setValidation] = useState(null);
  const [saveError, setSaveError] = useState("");
  const [saving, setSaving] = useState(false);
  const diff = useMemo(() => buildModelDiff(currentModel, proposedModel), [currentModel, proposedModel]);

  const applyModel = async (mode, save = false) => {
    if (saving) return;
    const nextModel = mode === "selected" ? mergeSections(currentModel, proposedModel, selected) : proposedModel;
    const result = validateModel(nextModel);
    setValidation(result);
    setSaveError("");
    if (result.errors.length && !allowDraftApply) return;
    try {
      if (save) {
        setSaving(true);
        await onApplyAndSave?.(nextModel, result);
      } else {
        onApply?.(nextModel, result);
      }
    } catch (error) {
      setSaveError(error?.message || "Could not save the applied proposal.");
    } finally {
      if (save) setSaving(false);
    }
  };

  const toggleSection = key => setSelected(prev => prev.includes(key) ? prev.filter(item => item !== key) : [...prev, key]);

  return (
    <div aria-label="Model proposal preview" style={{ display: "flex", flexDirection: "column", gap: 12, background: C.panel, border: `1px solid ${C.border}`, borderRadius: 8, padding: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
        <SH label="Model Proposal" />
        <Btn small variant="ghost" onClick={onDiscard}>Discard</Btn>
      </div>

      {validation?.errors?.length > 0 && (
        <div role="alert" style={{ background: C.red + "22", border: `1px solid ${C.red}`, borderRadius: 6, padding: 10, color: C.text, fontFamily: FONT, fontSize: 12 }}>
          {allowDraftApply && <div style={{ marginBottom: 6, color: C.amber }}>Applied as a draft is allowed, but this model must be fixed before it can run.</div>}
          {validation.errors.map(error => <div key={`${error.code}-${error.message}`}>[{error.code}] {error.message}</div>)}
        </div>
      )}
      {saveError && (
        <div role="alert" style={{ background: C.red + "22", border: `1px solid ${C.red}`, borderRadius: 6, padding: 10, color: C.text, fontFamily: FONT, fontSize: 12 }}>
          {saveError}
        </div>
      )}
      {validation?.warnings?.length > 0 && !validation.errors.length && (
        <div style={{ background: C.amber + "22", border: `1px solid ${C.amber}`, borderRadius: 6, padding: 10, color: C.text, fontFamily: FONT, fontSize: 12 }}>
          {validation.warnings.map(warning => <div key={`${warning.code}-${warning.message}`}>[{warning.code}] {warning.message}</div>)}
        </div>
      )}

      {diff.map(section => {
        const { added, modified, removed, unchanged } = section.diff;
        const hasChanges = added.length || modified.length || removed.length;
        return (
          <section key={section.key} style={{ display: "flex", flexDirection: "column", gap: 8, borderTop: `1px solid ${C.border}`, paddingTop: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              {selecting && (
                <input
                  type="checkbox"
                  aria-label={`Apply ${section.label}`}
                  checked={selected.includes(section.key)}
                  onChange={() => toggleSection(section.key)}
                />
              )}
              <div style={{ color: C.text, fontFamily: FONT, fontSize: 13, fontWeight: 700 }}>{section.label}</div>
              <Tag label={hasChanges ? "Changed" : "Unchanged"} color={hasChanges ? C.accent : C.muted} />
            </div>
            <ChangeList title="Added" items={added} color={C.green} renderItem={renderItemSummary} />
            <ChangeList title="Removed" items={removed} color={C.red} renderItem={renderItemSummary} />
            <ChangeList title="Modified" items={modified} color={C.amber} renderItem={renderModifiedSummary} />
            {!hasChanges && <Empty icon="=" msg={`${unchanged.length} unchanged`} />}
          </section>
        );
      })}

      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
        {!selecting && <Btn variant="ghost" onClick={() => setSelecting(true)} disabled={saving}>Apply Selected</Btn>}
        {selecting && <Btn variant="ghost" onClick={() => applyModel("selected")} disabled={!selected.length || saving}>Apply Selected</Btn>}
        {selecting && onApplyAndSave && <Btn variant="primary" onClick={() => applyModel("selected", true)} disabled={!selected.length || saving}>{saving ? "Saving..." : "Apply & Save Selected"}</Btn>}
        <Btn variant="primary" onClick={() => applyModel("all")} disabled={saving}>Apply All</Btn>
        {onApplyAndSave && <Btn variant="primary" onClick={() => applyModel("all", true)} disabled={saving}>{saving ? "Saving..." : "Apply & Save All"}</Btn>}
      </div>
    </div>
  );
}
