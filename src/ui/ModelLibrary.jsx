// ui/ModelLibrary.jsx — Model library: My Models / Templates / Public / Community tabs
import { useState, useRef, useMemo, useEffect } from "react";
import { SHADOW, RADIUS, Z } from "./shared/tokens.js";
import { Tag, Avatar, Btn, Field, Empty } from "./shared/components.jsx";
import { TEMPLATES } from "../engine/templates.js";
import { validateModel } from "../engine/validation.js";
import { useTheme } from "./shared/ThemeContext.jsx";
import { useToast } from "./shared/ToastContext.jsx";
import { WelcomeDialog } from "./WelcomeDialog.jsx";
import { buildLLMSchemaPromptPack } from "../llm/bundleExport.js";
import { downloadTextFile } from "./shared/utils.js";

// --- filter/sort helpers ---

const SORT_OPTIONS = [
  { value: "updated", label: "Last modified" },
  { value: "name",    label: "Name A→Z" },
  { value: "runs",    label: "Most runs" },
  { value: "version", label: "Version" },
];

const BLANK_FILTER = { search: "", sort: "updated", tags: [] };

function filterAndSort(models, { search, sort, tags }) {
  let result = models;
  const q = search.trim().toLowerCase();
  if (q) result = result.filter(m =>
    m.name.toLowerCase().includes(q) ||
    (m.description || "").toLowerCase().includes(q) ||
    (m.tags || []).some(t => t.includes(q))
  );
  if (tags.length > 0) result = result.filter(m =>
    (m.tags || []).some(t => tags.includes(t))
  );
  const out = [...result];
  if (sort === "name")    out.sort((a, b) => a.name.localeCompare(b.name));
  else if (sort === "runs")    out.sort((a, b) => (b.stats?.runs || 0) - (a.stats?.runs || 0));
  else if (sort === "version") out.sort((a, b) => (b.latestVersion || 0) - (a.latestVersion || 0));
  else out.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  return out;
}

// --- LibraryControls: search bar + sort dropdown + tag chips ---

function LibraryControls({ models, filter, onFilterChange }) {
  const { C, FONT } = useTheme();
  const allTags = useMemo(
    () => [...new Set(models.flatMap(m => m.tags || []))].sort(),
    [models]
  );
  return (
    <div style={{ marginBottom: 14, display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ position: "relative", flex: "1 1 160px", minWidth: 120 }}>
          <input
            type="search"
            placeholder="Search models…"
            value={filter.search}
            onChange={e => onFilterChange({ ...filter, search: e.target.value })}
            style={{ width: "100%", padding: "5px 28px 5px 10px", background: C.panel, border: `1px solid ${C.border}`, borderRadius: 4, color: C.text, fontFamily: FONT, fontSize: 12, outline: "none", boxSizing: "border-box" }}
          />
          {filter.search && (
            <button type="button" aria-label="Clear search"
              onClick={() => onFilterChange({ ...filter, search: "" })}
              style={{ position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: C.muted, cursor: "pointer", fontSize: 12, lineHeight: 1, padding: 2 }}>✕</button>
          )}
        </div>
        <select
          value={filter.sort}
          onChange={e => onFilterChange({ ...filter, sort: e.target.value })}
          aria-label="Sort order"
          style={{ padding: "5px 8px", background: C.panel, border: `1px solid ${C.border}`, borderRadius: 4, color: C.text, fontFamily: FONT, fontSize: 12, outline: "none", cursor: "pointer" }}>
          {SORT_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
      </div>
      {allTags.length > 0 && (
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ fontSize: 10, color: C.muted, fontFamily: FONT, marginRight: 2 }}>tags:</span>
          {allTags.map(tag => {
            const active = filter.tags.includes(tag);
            return (
              <button key={tag} type="button"
                onClick={() => onFilterChange({ ...filter, tags: active ? filter.tags.filter(t => t !== tag) : [...filter.tags, tag] })}
                style={{ padding: "3px 9px", borderRadius: 10, border: `1px solid ${active ? C.accent : C.border}`, background: active ? C.accent + "22" : "transparent", color: active ? C.accent : C.muted, fontFamily: FONT, fontSize: 11, cursor: "pointer", fontWeight: active ? 700 : 400 }}>
                {tag}
              </button>
            );
          })}
          {filter.tags.length > 0 && (
            <button type="button" onClick={() => onFilterChange({ ...filter, tags: [] })}
              style={{ padding: "3px 9px", borderRadius: 10, border: `1px solid ${C.border}`, background: "transparent", color: C.muted, fontFamily: FONT, fontSize: 11, cursor: "pointer" }}>
              Clear tags
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// --- FilterEmpty: shown when filter yields no results but source has models ---

function FilterEmpty({ onClear }) {
  const { C, FONT } = useTheme();
  return (
    <div style={{ padding: "32px 0", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
      <div style={{ fontSize: 13, color: C.muted, fontFamily: FONT }}>No models match your filters.</div>
      <button type="button" onClick={onClear}
        style={{ padding: "5px 14px", borderRadius: 6, border: `1px solid ${C.border}`, background: "transparent", color: C.accent, fontFamily: FONT, fontSize: 12, cursor: "pointer" }}>
        Clear filters
      </button>
    </div>
  );
}

// --- ModelCard ---

export const ModelCard = ({ model, onOpen, onDelete, onCopy, onTagClick, onTagsChange, profiles = [], currentUserId, currentVersion, scenarioCount = 0, isScenario = false }) => {
  const { C, FONT } = useTheme();
  const owner = (profiles || []).find(p => p.id === model.owner_id) || null;
  const fmtDate = iso => { try { return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }); } catch (e) { return ''; } };
  const runCount = model.stats?.runs;
  const isOwner = model.owner_id === currentUserId;
  const validation = useMemo(() => validateModel(model), [model]);
  const hasErrors = validation.errors.length > 0;
  const hasWarnings = validation.warnings.length > 0;
  const healthLabel = hasErrors ? "Validation Errors" : hasWarnings ? "Validation Warnings" : "Ready";
  const healthColor = hasErrors ? C.red : hasWarnings ? C.amber : C.green;
  const cardTags = model.tags || [];
  const visibleTags = cardTags.slice(0, 3);
  const overflowCount = cardTags.length - visibleTags.length;
  const openFromKeyboard = e => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen?.(); }
  };
  return (
    <div role="button" tabIndex={0} onClick={onOpen} onKeyDown={openFromKeyboard} aria-label={`Open model ${model.name}`}
      style={{ background: C.panel, border: `1px solid ${C.border}`, borderLeft: `3px solid ${model.visibility === "public" ? C.green : C.accent}`, borderRadius: 8, padding: 16, cursor: "pointer", display: "flex", flexDirection: "column", gap: 10, textAlign: "left", color: "inherit", width: "100%", transition: "border-color 0.1s" }}
      onMouseEnter={e => { e.currentTarget.style.borderRightColor = C.accent; e.currentTarget.style.borderTopColor = C.accent; e.currentTarget.style.borderBottomColor = C.accent; }}
      onMouseLeave={e => { e.currentTarget.style.borderRightColor = C.border; e.currentTarget.style.borderTopColor = C.border; e.currentTarget.style.borderBottomColor = C.border; }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
        <div style={{ fontWeight: 700, fontSize: 14, color: C.text, fontFamily: FONT, lineHeight: 1.3 }}>
          {model.name}
        </div>
        <div style={{ display: "flex", gap: 5, flexShrink: 0, flexWrap: "wrap" }}>
          {isOwner && onCopy && <Btn small variant="ghost" onClick={e => { e.stopPropagation(); onCopy(model); }}>Copy</Btn>}
          {isOwner && onDelete && <Btn small variant="danger" onClick={e => { e.stopPropagation(); onDelete(model); }}>Delete</Btn>}
          <Tag label={model.visibility} color={model.visibility === "public" ? C.green : C.accent} />
          {currentVersion > 0 && <Tag label={`V${currentVersion}`} color={C.purple} />}
          {isScenario && <Tag label="Scenario" color={C.purple} />}
          {scenarioCount > 0 && <Tag label={`${scenarioCount} scenario${scenarioCount !== 1 ? "s" : ""}`} color={C.purple} />}
        </div>
      </div>
      {/* model.notes is intentionally excluded here — it's internal-only, surfaced on the Overview tab instead */}
      <div style={{ fontSize: 12, color: C.muted, fontFamily: FONT, lineHeight: 1.5 }}>{model.description}</div>
      {isOwner && onTagsChange ? (
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center" }} onClick={e => e.stopPropagation()}>
          {cardTags.map(tag => (
            <span key={tag} role="button" tabIndex={0} aria-label={`Remove tag ${tag}`} title="Click to remove tag"
              onClick={e => { e.stopPropagation(); onTagsChange(model, cardTags.filter(t => t !== tag)); }}
              onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); onTagsChange(model, cardTags.filter(t => t !== tag)); } }}
              style={{ padding: "2px 8px", borderRadius: 8, border: `1px solid ${C.border}`, background: "transparent", color: C.muted, fontFamily: FONT, fontSize: 10, cursor: "pointer", lineHeight: 1.4 }}>
              {tag} ×
            </span>
          ))}
          <input
            type="text"
            placeholder="+ tag"
            aria-label={`Add tag to ${model.name}`}
            onClick={e => e.stopPropagation()}
            onKeyDown={async e => {
              if ((e.key === "Enter" || e.key === ",") && e.target.value.trim()) {
                e.stopPropagation();
                const inputEl = e.target;
                const tag = inputEl.value.trim().toLowerCase().replace(/[^a-z0-9-]/g, "");
                if (!tag) { inputEl.value = ""; return; }
                const next = [...new Set([...cardTags, tag])];
                const result = await onTagsChange(model, next);
                if (result?.ok !== false) inputEl.value = "";
              }
            }}
            style={{ background: "transparent", border: `1px solid ${C.border}`, borderRadius: 8, color: C.muted, fontFamily: FONT, fontSize: 10, padding: "2px 8px", outline: "none", width: 56 }}
          />
        </div>
      ) : visibleTags.length > 0 && (
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center" }}>
          {visibleTags.map(tag => (
            <button key={tag} type="button" aria-label={`Filter by tag ${tag}`}
              onClick={e => { e.stopPropagation(); onTagClick?.(tag); }}
              style={{ padding: "2px 8px", borderRadius: 8, border: `1px solid ${C.border}`, background: "transparent", color: C.muted, fontFamily: FONT, fontSize: 10, cursor: onTagClick ? "pointer" : "default", lineHeight: 1.4 }}
              onMouseEnter={e => { if (onTagClick) { e.currentTarget.style.borderColor = C.accent; e.currentTarget.style.color = C.accent; } }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.color = C.muted; }}>
              {tag}
            </button>
          ))}
          {overflowCount > 0 && (
            <span style={{ fontSize: 10, color: C.muted, fontFamily: FONT }}>+{overflowCount} more</span>
          )}
        </div>
      )}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <Tag label={healthLabel} color={healthColor} />
        {model.statsLoading && <Tag label="— runs" color={C.muted} />}
        {!model.statsLoading && model.statsError && <Tag label="runs —" color={C.muted} />}
        {!model.statsLoading && !model.statsError && Number.isFinite(runCount) && runCount > 0 && <Tag label={`${runCount} runs`} color={C.green} />}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          {owner && <Avatar u={owner} size={22} />}
          <span style={{ fontSize: 11, color: C.muted, fontFamily: FONT }}>{owner?.full_name}</span>
        </div>
        <span style={{ fontSize: 11, color: C.muted, fontFamily: FONT }}>{fmtDate(model.updatedAt)}</span>
      </div>
    </div>
  );
};

export const NewModelModal = ({ onClose, onStartDesign, onUseTemplate, onImportFile, onPasteJson, onUseAi }) => {
  const { C, FONT } = useTheme();
  const toast = useToast();
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [mode, setMode] = useState("choose");
  const [pasteText, setPasteText] = useState("");
  const [pasteStatus, setPasteStatus] = useState(null);
  const fileInputRef = useRef(null);
  const nameInputRef = useRef(null);
  const requireName = () => {
    if (name.trim()) return true;
    toast.error("Please enter a model name first.");
    nameInputRef.current?.focus();
    return false;
  };
  const startDesign = async () => { if (!requireName()) return; setSaving(true); try { await onStartDesign?.(name.trim(), ""); } finally { setSaving(false); } onClose(); };
  const triggerImport = () => { fileInputRef.current?.click(); };
  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => { onImportFile?.(reader.result, "", ""); onClose(); };
    reader.readAsText(file);
  };
  const handlePasteSubmit = () => {
    if (!pasteText.trim()) { toast.error("Please paste model JSON first."); return; }
    setPasteStatus({ state: "loading", message: "Validating JSON..." });
    onPasteJson?.(pasteText, "", "",
      () => { onClose(); },
      (msg) => { setPasteStatus({ state: "error", message: msg }); }
    );
  };
  const useTemplate = () => { onUseTemplate?.("", ""); onClose(); };
  const useAi = async () => { if (saving) return; setSaving(true); try { await onUseAi?.("", ""); } finally { setSaving(false); } onClose(); };
  const goPaste = () => { setMode("paste"); };
  const goDraw = () => { setMode("draw"); };
  const inputStyle = { width: "100%", background: C.bg, border: `1px solid ${C.border}`, borderRadius: 5, color: C.text, fontFamily: FONT, fontSize: 12, padding: "8px 10px", outline: "none", boxSizing: "border-box" };
  const optionBtn = { background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, padding: "14px 16px", cursor: "pointer", display: "flex", alignItems: "flex-start", gap: 10, textAlign: "left", color: "inherit", fontFamily: FONT };
  const iconBox = { width: 30, height: 30, background: C.border + "44", borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 };
  const importBtn = { background: C.bg, border: `1px solid ${C.border}`, borderRadius: 6, padding: "10px 12px", cursor: "pointer", display: "flex", alignItems: "center", gap: 8, textAlign: "left", color: "inherit", fontFamily: FONT };
  if (mode === "draw") {
    return (
      <div style={{ position: "fixed", inset: 0, background: C.overlay, display: "flex", alignItems: "center", justifyContent: "center", zIndex: Z.modal }}>
        <div role="dialog" aria-modal="true" aria-labelledby="draw-model-title" style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 12, padding: 28, width: 520, maxWidth: "95vw", fontFamily: FONT, display: "flex", flexDirection: "column", gap: 16 }}>
          <div id="draw-model-title" style={{ fontSize: 16, fontWeight: 700, color: C.text }}>Name your model</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <label style={{ fontSize: 10, color: C.muted, fontFamily: FONT, letterSpacing: 1, fontWeight: 700 }}>NAME *</label>
            <input ref={nameInputRef} value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Queue with Reneging" autoFocus style={inputStyle} onKeyDown={e => { if (e.key === "Enter") startDesign(); }} />
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
            <Btn variant="ghost" onClick={() => setMode("choose")}>Back</Btn>
            <Btn variant="primary" disabled={saving} onClick={startDesign}>
              {saving ? "Starting…" : "Start Drawing"}
            </Btn>
          </div>
        </div>
      </div>
    );
  }
  if (mode === "paste") {
    return (
      <div style={{ position: "fixed", inset: 0, background: C.overlay, display: "flex", alignItems: "center", justifyContent: "center", zIndex: Z.modal }}>
        <div role="dialog" aria-modal="true" aria-labelledby="paste-model-title" style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 12, padding: 28, width: 520, maxWidth: "95vw", fontFamily: FONT, display: "flex", flexDirection: "column", gap: 16 }}>
          <div id="paste-model-title" style={{ fontSize: 16, fontWeight: 700, color: C.text }}>Paste Model JSON</div>
          <textarea aria-label="Model JSON" value={pasteText} onChange={e => setPasteText(e.target.value)} placeholder={'{\n  "name": "My Model",\n  "entityTypes": [...],\n  ...\n}'} spellCheck={false} style={{ ...inputStyle, height: 200, resize: "vertical", fontFamily: "'JetBrains Mono',monospace" }} />
          {pasteStatus && pasteStatus.state !== "loading" && (
            <div style={{ background: pasteStatus.state === "error" ? C.red + "18" : C.green + "18", border: `1px solid ${pasteStatus.state === "error" ? C.red + "44" : C.green + "44"}`, borderRadius: 5, color: pasteStatus.state === "error" ? C.red : C.green, fontSize: 12, fontFamily: FONT, padding: "8px 10px" }}>
              {pasteStatus.message}
            </div>
          )}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
            <Btn variant="ghost" onClick={() => setMode("choose")}>Back</Btn>
            <Btn variant="primary" disabled={pasteStatus?.state === "loading"} onClick={handlePasteSubmit}>
              {pasteStatus?.state === "loading" ? "Importing…" : "Import Model"}
            </Btn>
          </div>
        </div>
      </div>
    );
  }
  return (
    <div style={{ position: "fixed", inset: 0, background: C.overlay, display: "flex", alignItems: "center", justifyContent: "center", zIndex: Z.modal }}>
      <div role="dialog" aria-modal="true" aria-labelledby="new-model-title" style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 12, padding: 28, width: 520, maxWidth: "95vw", fontFamily: FONT, display: "flex", flexDirection: "column", gap: 18, maxHeight: "90vh", overflowY: "auto" }}>
        <div id="new-model-title" style={{ fontSize: 16, fontWeight: 700, color: C.text }}>New Model</div>
        <div style={{ fontSize: 10, color: C.muted, fontFamily: FONT, letterSpacing: 1, fontWeight: 700 }}>START WITH</div>
        <button type="button" onClick={useAi} style={{ background: C.bg, border: `2px solid ${C.accent}`, borderRadius: 8, padding: "14px 16px", cursor: "pointer", display: "flex", alignItems: "flex-start", gap: 12, textAlign: "left", color: "inherit", fontFamily: FONT, width: "100%" }}>
          <div style={{ width: 36, height: 36, background: C.accent + "22", borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .962 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.582a.5.5 0 0 1 0 .962L15.5 14.063A2 2 0 0 0 14.063 15.5l-1.582 6.135a.5.5 0 0 1-.962 0z"/></svg>
          </div>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.text }}>Model assistant</div>
              <div style={{ fontSize: 10, color: C.accent, background: C.accent + "18", borderRadius: 4, padding: "1px 6px", fontWeight: 600 }}>Recommended</div>
            </div>
            <div style={{ fontSize: 10, color: C.muted }}>Helps the model assistant start to build your model</div>
          </div>
        </button>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <button type="button" onClick={goDraw} style={optionBtn}>
            <div style={iconBox}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.muted} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
            </div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.text }}>Draw</div>
              <div style={{ fontSize: 10, color: C.muted }}>Build from a blank canvas — you'll name it next</div>
            </div>
          </button>
          <button type="button" onClick={useTemplate} style={optionBtn}>
            <div style={iconBox}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.muted} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/></svg>
            </div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.text }}>Use a template</div>
              <div style={{ fontSize: 10, color: C.muted }}>Start from a pre-built scenario</div>
            </div>
          </button>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ flex: 1, height: 1, background: C.border }} />
          <div style={{ fontSize: 10, color: C.muted, fontFamily: FONT, letterSpacing: 1 }}>OR IMPORT</div>
          <div style={{ flex: 1, height: 1, background: C.border }} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <button type="button" onClick={triggerImport} style={importBtn}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.muted} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.text }}>Import a file</div>
              <div style={{ fontSize: 10, color: C.muted }}>Upload a .json model — keeps its name</div>
            </div>
          </button>
          <button type="button" onClick={goPaste} style={importBtn}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.muted} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}><rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/></svg>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.text }}>Paste model</div>
              <div style={{ fontSize: 10, color: C.muted }}>JSON from clipboard — keeps its name</div>
            </div>
          </button>
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        </div>
        <input ref={fileInputRef} type="file" accept=".json,application/json" style={{ display: "none" }} onChange={handleFileSelect} />
      </div>
    </div>
  );
};

const PATTERNS_GUIDE = [
  { id: "p1", title: "Single-Queue Service (M/M/c)", macros: ["ARRIVE", "ASSIGN", "COMPLETE"],
    summary: "A pool of identical servers draws from one shared queue. Covers call centres, tellers, compute hosts.",
    snippet: "ARRIVE(Customer, Queue)\nASSIGN(Queue, Server)\nCOMPLETE()",
    templates: ["mm1", "call-center", "bank-branch", "data-center", "port-berth"] },
  { id: "p2", title: "Multi-Stage Sequential Routing", macros: ["ARRIVE", "ASSIGN", "RELEASE", "COMPLETE"],
    summary: "Customers move through two or more stages in sequence.",
    snippet: "ARRIVE(Customer, StageA)\nASSIGN(StageA, ServerA)\nRELEASE(ServerA, StageB)\nASSIGN(StageB, ServerB)\nCOMPLETE()",
    templates: ["er-triage", "outpatient-clinic", "fast-food", "construction", "ward-admission", "airport"] },
  { id: "p3", title: "Batching and Assembly", macros: ["ARRIVE", "BATCH", "ASSIGN", "COMPLETE"],
    summary: "Individual items accumulate until N are present, then merge into one batch entity.",
    snippet: "ARRIVE(Item, Items)\nBATCH(Items, N)\nASSIGN(Items, Worker)\nCOMPLETE()",
    templates: ["factory", "warehouse"] },
  { id: "p4", title: "Reneging and Abandonment", macros: ["ARRIVE", "RENEGE", "ASSIGN", "COMPLETE"],
    summary: "Customers waiting beyond their patience time self-remove.",
    snippet: "ARRIVE(Customer, Queue)\n  ↳ schedule RENEGE timer  isRenege:true\nRENEGE(ctx)\nASSIGN(Queue, Server)\nCOMPLETE()",
    templates: ["call-center"] },
  { id: "p5", title: "Finite Capacity and Balking", macros: ["ARRIVE"],
    summary: "Set a capacity on the queue. ARRIVE silently discards customers when the queue is full.",
    snippet: "Queue: WaitingArea  capacity=20\nARRIVE(Customer, WaitingArea)  ← balks if full",
    templates: ["airport", "ward-admission", "retail-checkout"] },
  { id: "p6", title: "Priority Queue", macros: ["ARRIVE", "ASSIGN", "COMPLETE"],
    summary: "Set discipline=PRIORITY on the queue and add a numeric priority attribute. Lower number = higher urgency.",
    snippet: "EntityType: Customer  attrDefs: [priority dist=Uniform(1,5)]\nQueue: Queue  discipline=PRIORITY\nASSIGN(Queue, Server)",
    templates: ["er-triage", "bank-branch", "priority-ed-balking"] },
  { id: "p7", title: "Server Failures and Repair", macros: ["FAIL", "REPAIR"],
    summary: "Set mtbfDist and mttrDist on server entity types. Choose per-unit (independent) or pool (all-at-once) failure scope.",
    snippet: "EntityType: Machine  mtbfDist=Exponential{mean:120}  mttrDist=Exponential{mean:20}  failureScope=unit\nEach server fails and recovers independently.",
    templates: ["machine-shop-failures"] },
  { id: "p8", title: "Cost Tracking", macros: ["COST"],
    summary: "Add COST(amount) to any B-event effect. Costs accumulate in totalCost.",
    snippet: 'B-event: Call Handled  effect: ["COMPLETE()", "COST(5)"]\nGoal: totalCost < 500',
    templates: ["cost-call-centre"] },
];

const PatternsGuidePanel = ({ onClose }) => {
  const { C, FONT } = useTheme();
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="patterns-guide-title" style={{ position: "fixed", top: 0, right: 0, bottom: 0, width: 480, maxWidth: "95vw", background: C.surface, borderLeft: `1px solid ${C.border}`, zIndex: Z.modal, display: "flex", flexDirection: "column", boxShadow: SHADOW.panel }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 18px", borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
        <div>
          <div id="patterns-guide-title" style={{ fontSize: 13, fontWeight: 700, color: C.text }}>Modelling Patterns</div>
          <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>6 reusable patterns for simmodlr models</div>
        </div>
        <button type="button" aria-label="Close patterns guide" onClick={onClose} style={{ background: "none", border: "none", color: C.muted, fontSize: 18, cursor: "pointer", lineHeight: 1 }}>✕</button>
      </div>
      <div style={{ overflowY: "auto", flex: 1, padding: "12px 18px", display: "flex", flexDirection: "column", gap: 14 }}>
        {PATTERNS_GUIDE.map((p, i) => (
          <div key={p.id} style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 6, padding: 14 }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 6 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: C.accent, background: C.accent + "22", borderRadius: 10, padding: "2px 7px", flexShrink: 0 }}>P{i + 1}</div>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.text, lineHeight: 1.3 }}>{p.title}</div>
            </div>
            <div style={{ fontSize: 10, color: C.muted, lineHeight: 1.5, marginBottom: 8 }}>{p.summary}</div>
            <pre style={{ fontSize: 9, color: C.green, background: C.bg, borderRadius: 4, padding: "8px 10px", overflowX: "auto", margin: "0 0 8px", lineHeight: 1.6, fontFamily: "'JetBrains Mono',monospace" }}>{p.snippet}</pre>
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center" }}>
              <span style={{ fontSize: 9, color: C.muted, marginRight: 2 }}>macros:</span>
              {p.macros.map(m => <span key={m} style={{ fontSize: 9, color: C.accent, background: C.accent + "18", borderRadius: 3, padding: "1px 5px", fontFamily: "monospace" }}>{m}</span>)}
            </div>
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center", marginTop: 5 }}>
              <span style={{ fontSize: 9, color: C.muted, marginRight: 2 }}>templates:</span>
              {p.templates.map(t => <span key={t} style={{ fontSize: 9, color: C.muted, background: C.border + "66", borderRadius: 3, padding: "1px 5px" }}>{t}</span>)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

const FirstRunPanel = ({ onCreateBlank, onBrowseTemplates }) => {
  const { C, FONT } = useTheme();
  return (
    <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 8, padding: 18, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
      <div>
        <div style={{ fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 4 }}>Start your first model</div>
        <div style={{ fontSize: 12, color: C.muted }}>Create a model from scratch or start from one of the built-in templates.</div>
      </div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <Btn variant="ghost" onClick={onBrowseTemplates}>Use a Template</Btn>
        <Btn variant="primary" onClick={onCreateBlank}>Create a Model</Btn>
      </div>
    </div>
  );
};

function ModelGrid({
  models, tabKey, filter, onFilterChange, source, emptyIcon, emptyMsg, firstRun,
  onOpenModel, onDeleteModel, onCopyModel, onTagClick, onTagsChange,
  currentUserId, profiles,
  onCreateBlank, onBrowseTemplates,
}) {

  if (source.length === 0) {
    return firstRun ? null : <Empty icon={emptyIcon} msg={emptyMsg} />;
  }
  const scenarioCounts = {};
  for (const m of source) {
    if (m.parentModelId) scenarioCounts[m.parentModelId] = (scenarioCounts[m.parentModelId] || 0) + 1;
  }
  return (
    <div>
      <LibraryControls models={source} filter={filter} onFilterChange={onFilterChange} />
      {models.length === 0
        ? <FilterEmpty onClear={() => onFilterChange(BLANK_FILTER)} />
        : <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(340px,1fr))", gap: 14 }}>
          {models.map(m => (
            <ModelCard key={m.id} model={m}
              onOpen={() => onOpenModel(m)}
              onDelete={onDeleteModel}
              onCopy={onCopyModel}
              onTagClick={onTagClick}
              onTagsChange={onTagsChange}
              currentUserId={currentUserId}
              profiles={profiles}
              currentVersion={m.latestVersion}
              scenarioCount={scenarioCounts[m.id] || 0}
              isScenario={!!m.parentModelId} />
          ))}
        </div>
      }
    </div>
  );
}

export function ModelLibrary({
  myModels, pubModels, communityModels,
  profiles, currentUserId,
  onOpenModel, onDeleteModel, onCopyModel, onStartTemplate,
  onTagsChange,
  onCreateNewModel,
  onImportFile,
  onPasteJsonImport,
  tab, onTabChange,
  modelsLoading,
  onHelpOpen,
  signedInThisSession,
  onWelcomeShown,
}) {
  const { C, FONT } = useTheme();
  const setTab = onTabChange;
  const [showNew, setShowNew] = useState(false);
  const [showWelcome, setShowWelcome] = useState(false);
  const [tmplSearch, setTmplSearch] = useState("");
  const [tmplDomain, setTmplDomain] = useState("All");
  const [showPatternsGuide, setShowPatternsGuide] = useState(false);
  const pendingTemplateDraftRef = useRef(null);
  const welcomeShownRef = useRef(false);

  useEffect(() => {
    if (!modelsLoading && signedInThisSession && !welcomeShownRef.current) {
      welcomeShownRef.current = true;
      onWelcomeShown?.();
      setShowWelcome(true);
    }
  }, [modelsLoading, signedInThisSession]);

  // per-tab filter state
  const [myFilter, setMyFilter]   = useState(BLANK_FILTER);
  const [pubFilter, setPubFilter]  = useState(BLANK_FILTER);
  const [commFilter, setCommFilter] = useState(BLANK_FILTER);

  const DOMAIN_COLORS = { Academic: "#7c6fcd", Healthcare: "#3b9e78", "Service Systems": "#c0813a", Manufacturing: "#3a82c0", Logistics: "#9e3b7a", Technology: "#3a9ec0", Transport: "#6a8fa0" };
  const allDomains = ["All", ...Array.from(new Set(TEMPLATES.map(t => t.domain)))];

  // filtered/sorted results for each tab
  const visibleMy   = useMemo(() => filterAndSort(myModels, myFilter),   [myModels, myFilter]);
  const visiblePub  = useMemo(() => filterAndSort(pubModels, pubFilter),  [pubModels, pubFilter]);
  const visibleComm = useMemo(() => filterAndSort(communityModels, commFilter), [communityModels, commFilter]);

  // add a tag to the current tab's filter (called from ModelCard chip click)
  const addTagFilter = (tabKey, tag) => {
    if (tabKey === "my")        setMyFilter(f   => f.tags.includes(tag) ? f : { ...f, tags: [...f.tags, tag] });
    else if (tabKey === "public")    setPubFilter(f  => f.tags.includes(tag) ? f : { ...f, tags: [...f.tags, tag] });
    else if (tabKey === "community") setCommFilter(f => f.tags.includes(tag) ? f : { ...f, tags: [...f.tags, tag] });
  };

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "28px 24px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: C.text, marginBottom: 4 }}>Model Library</h1>
          <p style={{ fontSize: 12, color: C.muted }}>Build and share discrete-event simulation models.</p>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <Btn variant="ghost" onClick={() => downloadTextFile(buildLLMSchemaPromptPack(), "simmodlr-ai-prompt-pack.md", "text/markdown")}>↓ AI Prompt Pack</Btn>
          <Btn variant="primary" onClick={() => { pendingTemplateDraftRef.current = null; setShowNew(true); }}>+ New Model</Btn>
        </div>
      </div>

      <div role="tablist" aria-label="Model library sections" style={{ display: "flex", borderBottom: `1px solid ${C.border}`, marginBottom: 24 }}>
        {[
          { id: "my",        label: `My Models (${myModels.length})` },
          { id: "templates", label: `Templates (${TEMPLATES.length})` },
          { id: "public",    label: `Public Library (${pubModels.length})` },
          { id: "community", label: `Community (${communityModels.length})` },
        ].map(t => (
          <button key={t.id} type="button" role="tab" aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            style={{ background: "none", border: "none", borderBottom: tab === t.id ? `2px solid ${C.accent}` : "2px solid transparent", color: tab === t.id ? C.accent : C.muted, fontFamily: FONT, fontSize: 12, padding: "10px 18px", cursor: "pointer", fontWeight: tab === t.id ? 700 : 400 }}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "templates" && (() => {
        const q = tmplSearch.trim().toLowerCase();
        const visible = TEMPLATES.filter(t => {
          if (tmplDomain !== "All" && t.domain !== tmplDomain) return false;
          if (q && !t.name.toLowerCase().includes(q) && !t.description.toLowerCase().includes(q) && !(t.templateMeta?.scenarioType || "").toLowerCase().includes(q)) return false;
          return true;
        });
        return (
          <div>
            <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}>
              <input type="search" placeholder="Search templates…" value={tmplSearch} onChange={e => setTmplSearch(e.target.value)} style={{ flex: "1 1 160px", minWidth: 120, padding: "5px 10px", background: C.panel, border: `1px solid ${C.border}`, borderRadius: 4, color: C.text, fontFamily: FONT, fontSize: 12, outline: "none" }} />
              <button type="button" onClick={() => setShowPatternsGuide(true)} style={{ padding: "5px 12px", borderRadius: 4, border: `1px solid ${C.border}`, background: "transparent", color: C.muted, fontFamily: FONT, fontSize: 11, cursor: "pointer", whiteSpace: "nowrap" }} onMouseEnter={e => e.currentTarget.style.color = C.accent} onMouseLeave={e => e.currentTarget.style.color = C.muted}>Patterns Guide</button>
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                {allDomains.map(d => (
                  <button key={d} type="button" onClick={() => setTmplDomain(d)} style={{ padding: "4px 10px", borderRadius: 12, border: `1px solid ${tmplDomain === d ? (DOMAIN_COLORS[d] || C.accent) : C.border}`, background: tmplDomain === d ? (DOMAIN_COLORS[d] || C.accent) + "22" : "transparent", color: tmplDomain === d ? (DOMAIN_COLORS[d] || C.accent) : C.muted, fontFamily: FONT, fontSize: 11, cursor: "pointer", fontWeight: tmplDomain === d ? 700 : 400 }}>{d}</button>
                ))}
              </div>
            </div>
            {visible.length === 0
              ? <div style={{ color: C.muted, fontSize: 12, padding: "24px 0", textAlign: "center" }}>No templates match your search.</div>
              : <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))", gap: 12 }}>
                {visible.map(t => {
                  const dc = DOMAIN_COLORS[t.domain] || C.accent;
                  const startTemplate = () => {
                    const pendingTemplateDraft = pendingTemplateDraftRef.current;
                    const draftedTemplate = pendingTemplateDraft
                      ? { ...t, name: pendingTemplateDraft.name || t.name, description: pendingTemplateDraft.desc || t.description }
                      : t;
                    onStartTemplate(draftedTemplate);
                    pendingTemplateDraftRef.current = null;
                  };
                  return (
                    <div key={t.id} role="button" tabIndex={0} aria-label={`Try ${t.name}`}
                      onClick={startTemplate} onKeyDown={e => { if (e.key === "Enter") startTemplate(); }}
                      style={{ background: C.panel, border: `1px solid ${C.border}`, borderLeft: `3px solid ${dc}`, borderRadius: 8, padding: "14px 16px", cursor: "pointer", display: "flex", flexDirection: "column", gap: 8, transition: "border-color 0.1s" }}
                      onMouseEnter={e => e.currentTarget.style.borderColor = dc}
                      onMouseLeave={e => e.currentTarget.style.borderColor = C.border}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 6 }}>
                        <div style={{ fontSize: 14, fontWeight: 700, color: C.text, lineHeight: 1.3 }}>{t.name}</div>
                        <div style={{ fontSize: 9, fontWeight: 700, color: dc, background: dc + "22", borderRadius: 8, padding: "2px 7px", whiteSpace: "nowrap", flexShrink: 0 }}>{t.domain}</div>
                      </div>
                      {t.templateMeta?.scenarioType && (
                        <div style={{ fontSize: 11, color: C.accent, fontWeight: 600, lineHeight: 1.2 }}>{t.templateMeta.scenarioType}</div>
                      )}
                      <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.5, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{t.description}</div>
                      {t.templateMeta?.keyMacros?.length > 0 && (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 3, marginTop: "auto", paddingTop: 4 }}>
                          {t.templateMeta.keyMacros.map(m => <span key={m} style={{ fontSize: 9, color: C.muted, background: C.border + "66", borderRadius: 3, padding: "1px 5px", fontFamily: "monospace" }}>{m}</span>)}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            }
          </div>
        );
      })()}

      {tab === "my" && (
        <ModelGrid
          models={visibleMy} tabKey="my"
          filter={myFilter} onFilterChange={setMyFilter}
          source={myModels} firstRun={!modelsLoading}
          emptyIcon="📁" emptyMsg="No models yet."
          onOpenModel={onOpenModel} onDeleteModel={onDeleteModel} onCopyModel={onCopyModel}
          onTagClick={tag => addTagFilter("my", tag)}
          onTagsChange={onTagsChange}
          currentUserId={currentUserId} profiles={profiles}
          onCreateBlank={() => setShowNew(true)} onBrowseTemplates={() => setTab("templates")} />
      )}
      {tab === "public" && (
        <ModelGrid
          models={visiblePub} tabKey="public"
          filter={pubFilter} onFilterChange={setPubFilter}
          source={pubModels}
          emptyIcon="🌐" emptyMsg="No public models available."
          onOpenModel={onOpenModel} onDeleteModel={onDeleteModel} onCopyModel={onCopyModel}
          onTagClick={tag => addTagFilter("public", tag)}
          currentUserId={currentUserId} profiles={profiles} />
      )}
      {tab === "community" && (
        <ModelGrid
          models={visibleComm} tabKey="community"
          filter={commFilter} onFilterChange={setCommFilter}
          source={communityModels}
          emptyIcon="🌐" emptyMsg="No community models shared yet."
          onOpenModel={onOpenModel} onDeleteModel={onDeleteModel} onCopyModel={onCopyModel}
          onTagClick={tag => addTagFilter("community", tag)}
          currentUserId={currentUserId} profiles={profiles} />
      )}

      {showNew && (
        <NewModelModal
          onClose={() => setShowNew(false)}
          onStartDesign={async (name, desc) => { await onCreateNewModel(name, desc, null, { initialTab: "visual", showStarterGuide: false }); }}
          onUseTemplate={(name, desc) => {
            pendingTemplateDraftRef.current = { name: name.trim(), desc: desc.trim() };
            setTab("templates");
          }}
          onImportFile={(jsonText, name, desc) => { setShowNew(false); onImportFile(jsonText, name, desc); }}
          onPasteJson={(pasteText, name, desc, onSuccess, onError) => { onPasteJsonImport(pasteText, name, desc, onSuccess, onError); }}
          onUseAi={(name, desc) => {
            onCreateNewModel(name, desc, null, { initialTab: "ai", showStarterGuide: false }).then(() => { setShowNew(false); });
          }}
        />
      )}
      {showPatternsGuide && <PatternsGuidePanel onClose={() => setShowPatternsGuide(false)} />}
      {showWelcome && (
        <WelcomeDialog
          onClose={() => setShowWelcome(false)}
          onCreateModel={() => { setShowWelcome(false); setShowNew(true); }}
          onOpenLibrary={() => { setShowWelcome(false); setTab("my"); }}
          onHelp={() => { setShowWelcome(false); onHelpOpen?.(); }}
          onExportSchema={() => {
            downloadTextFile(buildLLMSchemaPromptPack(), "simmodlr-ai-prompt-pack.md", "text/markdown");
            setShowWelcome(false);
          }}
        />
      )}
    </div>
  );
}
