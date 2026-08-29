// Saved Experiments tab, extracted from execute/index.jsx (expert review C-11
// tranche). Owns the whole experiment-CRUD state cluster — the list and its
// load lifecycle, the New/Edit form fields, expand/collapse and filter state —
// which previously lived as 12 useState hooks in ExecutePanel with the DB
// calls inline in JSX onClick handlers.
//
// Boundary (semantic props, not setter pairs — the ExecuteCanvas convention):
// - `runConfig` is a read-only snapshot of the shell's current run settings,
//   captured into an experiment's config on Save. Editing those settings from
//   the form still goes through the shell's own state via `renderRunSettings`
//   (a render prop, so the shell keeps sole ownership of run-config state and
//   the form keeps its by-design coupling to the global Run Setup).
// - `onLoadExperiment(config, { runLabel })` performs every outward write
//   (run-config setters, activeExpOverrides resolution, section switch).
// - `formSeed` + `onFormSeedConsumed` let the Run tab's "Save as Experiment…"
//   button pre-fill and open the New form from outside.
// - `visible` keeps the component mounted across section switches (rendered
//   display:none, the same pattern ModelDetail uses for ExecutePanel) so
//   list/filter/expansion state survives tabbing away, exactly as it did when
//   the state lived in the shell.
import { useEffect, useState } from "react";
import { fetchExperiments, saveExperiment, updateExperiment, cloneExperiment, deleteExperiment } from "../../db/models.js";
import { Btn } from "./../shared/components.jsx";
import { paramColor } from "../shared/ParamBrowserPanel.jsx";
import { alpha, RADIUS } from "../shared/tokens.js";
import { useTheme } from "../shared/ThemeContext.jsx";
import { useConfirm } from "../shared/useConfirm.jsx";
import { OverrideChipList } from "./OverrideChipList.jsx";

export function SavedExperimentsTab({
  visible, modelId, userId,
  sweepParams, ensureSweepParams,
  runConfig, renderRunSettings,
  onLoadExperiment,
  formSeed, onFormSeedConsumed,
}) {
  const { C, FONT } = useTheme();
  const { confirm, confirmDialog } = useConfirm();
  const [experiments, setExperiments] = useState([]);
  const [experimentsStatus, setExperimentsStatus] = useState("idle");
  const [experimentsError, setExperimentsError] = useState("");
  const [expFormOpen, setExpFormOpen] = useState(false);
  const [expEditId, setExpEditId] = useState(null);
  const [expFormName, setExpFormName] = useState("");
  const [expFormDesc, setExpFormDesc] = useState("");
  const [expFormOverrides, setExpFormOverrides] = useState([]);
  const [expFormPickerOpen, setExpFormPickerOpen] = useState(false);
  const [expFormSaving, setExpFormSaving] = useState(false);
  const [expandedExpIds, setExpandedExpIds] = useState(new Set());
  const [expFilterText, setExpFilterText] = useState("");

  // F28.1: load experiments when the tab is opened
  useEffect(() => {
    if (!visible || !modelId || !userId) return;
    let cancelled = false;
    setExperimentsStatus("loading");
    setExperimentsError("");
    fetchExperiments(modelId)
      .then(rows => {
        if (cancelled) return;
        setExperiments(rows || []);
        setExperimentsStatus("loaded");
      })
      .catch(err => {
        if (cancelled) return;
        setExperiments([]);
        setExperimentsError(err?.message || "Could not load experiments");
        setExperimentsStatus("error");
      });
    return () => { cancelled = true; };
  }, [visible, modelId, userId]);

  // External seeding: the Run tab's "Save as Experiment…" pre-fills the New form.
  useEffect(() => {
    if (!formSeed) return;
    setExpEditId(null);
    setExpFormName("");
    setExpFormDesc("");
    setExpFormOverrides(formSeed.overrides || []);
    setExpFormPickerOpen(false);
    setExpFormOpen(true);
    onFormSeedConsumed?.();
  }, [formSeed, onFormSeedConsumed]);

  const openNewForm = () => {
    setExpEditId(null); setExpFormName(""); setExpFormDesc(""); setExpFormOverrides([]);
    setExpFormPickerOpen(false);
    ensureSweepParams();
    setExpFormOpen(true);
  };

  const buildFormConfig = () => ({
    ...runConfig,
    terminationCondition: runConfig.terminationMode === "condition" ? runConfig.terminationCondition : null,
    overrides: expFormOverrides.filter(o => o.path && o.value !== "").map(o => ({ path: o.path, value: Number(o.value) })),
  });

  const handleCreate = async () => {
    setExpFormSaving(true);
    try {
      const created = await saveExperiment({ modelId, userId, name: expFormName.trim(), description: expFormDesc.trim() || null, config: buildFormConfig() });
      setExperiments(prev => [created, ...prev]);
      setExpFormOpen(false);
    } catch (err) { setExperimentsError(err?.message || "Save failed"); } finally { setExpFormSaving(false); }
  };

  const handleUpdate = async (expId) => {
    setExpFormSaving(true);
    try {
      const updated = await updateExperiment(expId, { name: expFormName.trim(), description: expFormDesc.trim() || null, config: buildFormConfig() });
      setExperiments(prev => prev.map(e => e.id === expId ? updated : e));
      setExpEditId(null); setExpFormPickerOpen(false);
    } catch (err) { setExperimentsError(err?.message || "Save failed"); } finally { setExpFormSaving(false); }
  };

  const handleDelete = async (exp) => {
    if (!(await confirm(`Delete "${exp.name}"?`))) return;
    try {
      await deleteExperiment(exp.id);
      setExperiments(prev => prev.filter(e => e.id !== exp.id));
      setExpandedExpIds(prev => { const n = new Set(prev); n.delete(exp.id); return n; });
    } catch (err) { setExperimentsError(err?.message || "Delete failed"); }
  };

  const handleClone = async (exp) => {
    try { const cloned = await cloneExperiment(exp.id, userId); setExperiments(prev => [cloned, ...prev]); }
    catch (err) { setExperimentsError(err?.message || "Clone failed"); }
  };

  return (
    <div style={{ maxWidth: 1120, margin: "0 auto", display: visible ? "flex" : "none", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700, color: C.text, fontFamily: FONT }}>Experiments</div>
          <div style={{ fontSize: 12, color: C.muted, fontFamily: FONT, marginTop: 2 }}>Saved run configurations to replay or compare</div>
        </div>
        {userId && (
          <Btn variant="primary" onClick={openNewForm}>+ New Experiment</Btn>
        )}
      </div>
      {/* Filter row */}
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <input
          value={expFilterText}
          onChange={e => setExpFilterText(e.target.value)}
          placeholder="Filter by name…"
          style={{ flex: 1, background: "transparent", border: `1px solid ${C.border}`, borderRadius: 4, color: C.text, fontFamily: FONT, fontSize: 12, padding: "5px 8px" }}
        />
        {experiments.length > 1 && (
          <>
            <Btn small variant="ghost" onClick={() => setExpandedExpIds(new Set(experiments.map(e => e.id)))}>Expand all</Btn>
            <Btn small variant="ghost" onClick={() => { setExpandedExpIds(new Set()); setExpEditId(null); }}>Collapse all</Btn>
          </>
        )}
      </div>

      {/* New experiment form */}
      {expFormOpen && !expEditId && (
        <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 8, padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
            <span style={{ fontSize: 10, color: C.accent, fontFamily: FONT, letterSpacing: 1.2, fontWeight: 700 }}>NEW EXPERIMENT</span>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={{ fontSize: 10, color: C.muted, fontFamily: FONT }}>Name *</span>
              <input aria-label="Experiment name" type="text" value={expFormName} onChange={e => setExpFormName(e.target.value)} placeholder="e.g. High-load scenario"
                style={{ background: "transparent", border: `1px solid ${C.border}`, borderRadius: 4, color: C.text, fontFamily: FONT, fontSize: 12, padding: "6px 8px" }} />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={{ fontSize: 10, color: C.muted, fontFamily: FONT }}>Description</span>
              <input aria-label="Experiment description" type="text" value={expFormDesc} onChange={e => setExpFormDesc(e.target.value)} placeholder="Optional notes"
                style={{ background: "transparent", border: `1px solid ${C.border}`, borderRadius: 4, color: C.text, fontFamily: FONT, fontSize: 12, padding: "6px 8px" }} />
            </div>
            {renderRunSettings()}
            {/* Parameter overrides */}
            <OverrideChipList overrides={expFormOverrides} setOverrides={setExpFormOverrides} sweepParams={sweepParams}
              pickerOpen={expFormPickerOpen} setPickerOpen={setExpFormPickerOpen} />
            <div style={{ display: "flex", gap: 8 }}>
              <Btn small variant="primary" disabled={!expFormName.trim() || expFormSaving} onClick={handleCreate}>{expFormSaving ? "Saving…" : "Save"}</Btn>
              <Btn small variant="ghost" onClick={() => setExpFormOpen(false)}>Cancel</Btn>
            </div>
        </div>
      )}

      {/* Status + empty state */}
      {experimentsStatus === "loading" && (
        <span style={{ fontSize: 12, color: C.muted, fontFamily: FONT }}>Loading…</span>
      )}
      {experimentsStatus === "error" && (
        <span style={{ fontSize: 12, color: C.red, fontFamily: FONT }}>{experimentsError}</span>
      )}
      {experimentsStatus === "loaded" && experiments.length === 0 && !expFormOpen && (
        <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 10, padding: "40px 24px", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
          <div style={{ fontSize: 32, lineHeight: 1 }}>🧪</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: C.text, fontFamily: FONT }}>No saved experiments yet</div>
          <div style={{ fontSize: 13, color: C.muted, fontFamily: FONT, lineHeight: 1.6, maxWidth: 380 }}>Save a named configuration — replications, seed, run length, and parameter overrides — to replay or compare later.</div>
          {userId && <Btn variant="primary" onClick={openNewForm}>+ New Experiment</Btn>}
        </div>
      )}

      {/* Experiment cards — B-Events style */}
      {(() => {
        const lcFilter = expFilterText.toLowerCase();
        const filtered = lcFilter ? experiments.filter(e => e.name.toLowerCase().includes(lcFilter)) : experiments;
        return filtered.map((exp) => {
          const isExpanded = expandedExpIds.has(exp.id);
              const isEditing = expEditId === exp.id;
              const cfg = exp.config;
              const summaryLine = `${cfg.replications} repl · seed ${cfg.seed} · warm-up ${cfg.warmupPeriod} · ${cfg.terminationMode === "time" ? `duration ${cfg.maxSimTime}` : "condition stop"}${cfg.overrides?.length > 0 ? ` · ${cfg.overrides.length} override${cfg.overrides.length > 1 ? "s" : ""}` : ""}`;

              const toggleExpand = () => {
                if (isExpanded) {
                  setExpandedExpIds(prev => { const n = new Set(prev); n.delete(exp.id); return n; });
                  if (isEditing) { setExpEditId(null); setExpFormPickerOpen(false); }
                } else {
                  setExpandedExpIds(prev => new Set([...prev, exp.id]));
                }
              };

              const startEdit = () => {
                setExpEditId(exp.id);
                setExpFormName(exp.name);
                setExpFormDesc(exp.description || "");
                setExpFormOverrides((cfg.overrides || []).map(o => ({ path: o.path, value: String(o.value) })));
                ensureSweepParams();
                setExpFormPickerOpen(false);
                setExpFormOpen(false);
                if (!isExpanded) setExpandedExpIds(prev => new Set([...prev, exp.id]));
              };

              const loadCfg = () => onLoadExperiment(cfg);
              const runCfg = () => onLoadExperiment(cfg, { runLabel: exp.name });

              return (
                <div key={exp.id} style={{ background: C.bg, border: `1px solid ${C.accent}33`, borderLeft: `3px solid ${C.accent}`, borderRadius: 6, padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
                  {/* Collapsed header — always visible */}
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <button
                      onClick={toggleExpand}
                      style={{ background: "none", border: "none", cursor: "pointer", padding: "2px 3px", color: isExpanded ? C.accent : C.muted, fontFamily: FONT, fontSize: 11, lineHeight: 1, flexShrink: 0 }}
                      aria-label={isExpanded ? "Collapse" : "Expand"}
                    >{isExpanded ? "▾" : "▸"}</button>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, color: C.text, fontFamily: FONT, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{exp.name}</div>
                      {!isExpanded && <div style={{ fontSize: 10, color: C.muted, fontFamily: FONT, marginTop: 2 }}>{summaryLine}</div>}
                    </div>
                    {!isExpanded && (
                      <div style={{ display: "flex", gap: 4, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                        <Btn small variant="primary" onClick={loadCfg}>Load</Btn>
                        <Btn small variant="ghost" onClick={runCfg}>Run</Btn>
                        <Btn small variant="danger" ariaLabel={`Delete experiment ${exp.name}`} onClick={() => handleDelete(exp)}>✕</Btn>
                      </div>
                    )}
                  </div>

                  {/* Expanded body */}
                  {isExpanded && (
                    <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 12, display: "flex", flexDirection: "column", gap: 12 }}>
                      {isEditing ? (
                        <>
                          {/* Edit mode */}
                          <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 12 }}>
                            <span style={{ fontSize: 10, color: C.muted, fontFamily: FONT }}>Name *</span>
                            <input aria-label="Experiment name" type="text" value={expFormName} onChange={e => setExpFormName(e.target.value)}
                              style={{ background: "transparent", border: `1px solid ${C.border}`, borderRadius: 4, color: C.text, fontFamily: FONT, fontSize: 12, padding: "6px 8px" }} />
                          </div>
                          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                            <span style={{ fontSize: 10, color: C.muted, fontFamily: FONT }}>Description</span>
                            <input aria-label="Experiment description" type="text" value={expFormDesc} onChange={e => setExpFormDesc(e.target.value)} placeholder="Optional notes"
                              style={{ background: "transparent", border: `1px solid ${C.border}`, borderRadius: 4, color: C.text, fontFamily: FONT, fontSize: 12, padding: "6px 8px" }} />
                          </div>
                          {renderRunSettings()}
                          {/* Parameter overrides */}
                          <OverrideChipList overrides={expFormOverrides} setOverrides={setExpFormOverrides} sweepParams={sweepParams}
                            pickerOpen={expFormPickerOpen} setPickerOpen={setExpFormPickerOpen} />
                          <div style={{ display: "flex", gap: 8 }}>
                            <Btn small variant="primary" disabled={!expFormName.trim() || expFormSaving} onClick={() => handleUpdate(exp.id)}>{expFormSaving ? "Saving…" : "Save"}</Btn>
                            <Btn small variant="ghost" onClick={() => { setExpEditId(null); setExpFormPickerOpen(false); }}>Cancel</Btn>
                          </div>
                        </>
                      ) : (
                        <>
                          {/* View mode */}
                          {exp.description && <div style={{ fontSize: 12, color: C.muted, fontFamily: FONT, marginTop: 8 }}>{exp.description}</div>}
                          <div style={{ fontSize: 11, color: C.muted, fontFamily: FONT, marginTop: exp.description ? 0 : 8 }}>{summaryLine}</div>
                          {cfg.overrides?.length > 0 && (
                            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                              <span style={{ fontSize: 10, color: C.label, fontFamily: FONT, letterSpacing: 1.2, fontWeight: 700 }}>PARAMETER OVERRIDES</span>
                              {cfg.overrides.map((ov, i2) => {
                                const param = sweepParams.find(p => p.path === ov.path);
                                const chipColor = paramColor(param?.type, C);
                                return (
                                  <div key={i2} style={{ display: "flex", gap: 6, alignItems: "center" }}>
                                    <div style={{ flex: 1, background: alpha(chipColor, 0.09), border: `1px solid ${alpha(chipColor, 0.27)}`, borderRadius: RADIUS.sm, padding: "3px 8px" }}>
                                      <span style={{ fontSize: 11, color: chipColor, fontFamily: FONT }}>{param?.label ?? ov.path}</span>
                                    </div>
                                    <span style={{ fontSize: 11, color: C.amber, fontFamily: FONT, flexShrink: 0 }}>{ov.value}</span>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                            <Btn small variant="primary" onClick={loadCfg}>Load</Btn>
                            <Btn small variant="ghost" onClick={runCfg}>Run</Btn>
                            <Btn small variant="ghost" onClick={startEdit}>Edit</Btn>
                            <Btn small variant="ghost" onClick={() => handleClone(exp)}>Clone</Btn>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
        });
      })()}
      {confirmDialog}
    </div>
  );
}
