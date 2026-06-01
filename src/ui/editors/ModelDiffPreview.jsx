import { useMemo, useState } from "react";
import { validateModel } from "../../engine/validation.js";
import { Btn, Empty, SH, Tag } from "../shared/components.jsx";
import { useTheme } from "../shared/ThemeContext.jsx";

const SECTION_META = [
  { key: "entityTypes", label: "Entity Classes" },
  { key: "bEvents", label: "B-Events" },
  { key: "cEvents", label: "C-Events" },
  { key: "queues", label: "Queues" },
  { key: "stateVariables", label: "Model Data" },
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
  const { C, FONT } = useTheme();
  if (!items.length) return null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <Tag label={`${title}: ${items.length}`} color={color} />
      {items.map((item, index) => (
        <div key={index} style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 6, padding: 10, color: C.text, fontFamily: FONT, fontSize: 11, lineHeight: 1.6 }}>
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

function ModifiedSummaryItem({ item }) {
  const { C } = useTheme();
  const before = item.before || {};
  const after = item.after || {};
  const title = after.name || before.name || after.id || before.id || "Unnamed";
  const fields = changedFields(before, after);
  if (!fields.length) return <div>{title}</div>;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      <div style={{ color: C.text, fontWeight: 700 }}>{title}</div>
      {fields.slice(0, 5).map(field => (
        <div key={field} style={{ color: C.muted, display: "flex", alignItems: "baseline", gap: 6, flexWrap: "wrap" }}>
          <span style={{ color: C.amber, fontWeight: 700 }}>{field}</span>
          <span>{friendlyValue(before[field])}</span>
          <span style={{ color: C.accent }}>to</span>
          <span style={{ color: C.text }}>{friendlyValue(after[field])}</span>
        </div>
      ))}
      {fields.length > 5 && <div style={{ color: C.muted }}>{fields.length - 5} more field changes</div>}
    </div>
  );
}

function deriveSimulationSummary(proposedModel = {}) {
  const entityTypes = Array.isArray(proposedModel.entityTypes) ? proposedModel.entityTypes : [];
  const queues = Array.isArray(proposedModel.queues) ? proposedModel.queues : [];
  const bEvents = Array.isArray(proposedModel.bEvents) ? proposedModel.bEvents : [];
  const cEvents = Array.isArray(proposedModel.cEvents) ? proposedModel.cEvents : [];
  const experimentDefaults = proposedModel.experimentDefaults || {};

  const customerType = entityTypes.find(e => e.role === "customer");
  const serverTypes = entityTypes.filter(e => e.role === "server");
  const entityName = customerType?.name || "entities";

  // WHO ARRIVES — full sentence from arrival B-event
  let arrivalText = null;
  const arrivalEvent = bEvents.find(ev => {
    const eff = Array.isArray(ev.effect) ? ev.effect.join(";") : String(ev.effect || "");
    return /\bARRIVE\(/i.test(eff);
  });
  if (arrivalEvent) {
    const schedule = Array.isArray(arrivalEvent.schedules) ? arrivalEvent.schedules[0] : null;
    if (schedule) {
      const dist = schedule.dist || schedule.type || "";
      const params = schedule.distParams || {};
      if (/exponential/i.test(dist) && params.mean) {
        const mean = parseFloat(params.mean);
        if (mean > 0) arrivalText = `${entityName} arrive approximately every ${mean} time units (Exponential distribution)`;
      } else if (/fixed/i.test(dist) && params.value) {
        arrivalText = `${entityName} arrive every ${params.value} time units (Fixed)`;
      } else if (/triangular/i.test(dist) && params.mode) {
        arrivalText = `${entityName} arrive approximately every ${params.mode} time units (Triangular distribution)`;
      } else if (dist) {
        arrivalText = `${entityName} arrive (${dist} distribution)`;
      }
    }
  }

  // HOW THEY FLOW — per-stage flow path derived from queues + C-events + B-events
  const flowLines = queues.map(queue => {
    const discipline = queue.discipline || "FIFO";
    // Find C-event that ASSIGNs from this queue
    const assignEvent = cEvents.find(ce => {
      const eff = Array.isArray(ce.effect) ? ce.effect.join(";") : String(ce.effect || "");
      return new RegExp(`ASSIGN\\(${queue.name}`, "i").test(eff) ||
        (ce.cSchedules && ce.cSchedules.length > 0 && new RegExp(`ASSIGN.*${queue.name}`, "i").test(eff));
    });
    let serverInfo = "";
    if (assignEvent) {
      // Extract server type from ASSIGN(queue, server)
      const eff = Array.isArray(assignEvent.effect) ? assignEvent.effect.join(";") : String(assignEvent.effect || "");
      const assignMatch = eff.match(/ASSIGN\([^,]+,\s*([^)]+)\)/i);
      if (assignMatch) {
        const serverName = assignMatch[1].trim();
        const serverEntity = serverTypes.find(s => s.name === serverName);
        const count = serverEntity?.count || 1;
        // Find service distribution from cSchedules
        const sched = Array.isArray(assignEvent.cSchedules) ? assignEvent.cSchedules[0] : null;
        if (sched) {
          const dist = sched.dist || sched.type || "";
          const params = sched.distParams || {};
          const mean = params.mean || params.value || params.mode || "";
          const distDesc = mean ? `${dist}, mean ~${mean}` : dist;
          serverInfo = ` → ${count}× ${serverName} (service: ${distDesc})`;
        } else {
          serverInfo = ` → ${count}× ${serverName}`;
        }
      }
    }
    return `→ ${queue.name} (${discipline})${serverInfo}`;
  });
  if (flowLines.length) flowLines.push("→ exit");

  // Reneging annotation
  const renegeEvent = bEvents.find(ev => {
    const eff = Array.isArray(ev.effect) ? ev.effect.join(";") : String(ev.effect || "");
    return /\bRENEGE\(/i.test(eff);
  });
  let renegeText = null;
  if (renegeEvent) {
    const sched = Array.isArray(renegeEvent.schedules) ? renegeEvent.schedules[0] : null;
    const mean = sched?.distParams?.mean || sched?.distParams?.value || "";
    renegeText = mean
      ? `Entities who wait more than ~${mean} time units without service will leave`
      : "Entities may abandon the queue if waiting too long";
  }

  // RESOURCES — per server type
  const resourceLines = serverTypes.map(s => `${s.name}: ${s.count || 1} available`);

  // EXPERIMENT SETTINGS
  const duration = experimentDefaults.maxSimTime;
  const warmup = experimentDefaults.warmupPeriod;
  const reps = experimentDefaults.replications;
  const experimentParts = [];
  if (duration) experimentParts.push(`duration ${duration}`);
  if (warmup) experimentParts.push(`warmup ${warmup}`);
  if (reps) experimentParts.push(`${reps} replication${reps === 1 ? "" : "s"}`);
  const experimentText = experimentParts.length ? experimentParts.join(", ") : null;

  // GOALS
  const goalsArr = Array.isArray(proposedModel.goals) ? proposedModel.goals
    : Array.isArray(experimentDefaults.goals) ? experimentDefaults.goals : [];
  const goals = goalsArr.filter(Boolean);

  return { entityName, arrivalText, flowLines, renegeText, resourceLines, experimentText, goals };
}

function SimulationSummaryCard({ proposedModel }) {
  const { C, FONT } = useTheme();
  const { entityName, arrivalText, flowLines, renegeText, resourceLines, experimentText, goals } = deriveSimulationSummary(proposedModel);

  const hasContent = arrivalText || flowLines.length > 0 || resourceLines.length > 0 || experimentText || goals.length > 0;
  if (!hasContent) return null;

  const sectionLabel = { color: C.muted, fontFamily: FONT, fontSize: 9, fontWeight: 700, letterSpacing: 1, marginBottom: 4, textTransform: "uppercase" };
  const rowStyle = { color: C.text, fontFamily: FONT, fontSize: 11, lineHeight: 1.6 };

  return (
    <div
      aria-label="Simulation summary"
      style={{ background: C.bg, border: `1px solid ${C.accent}44`, borderRadius: 8, padding: "12px 14px", display: "flex", flexDirection: "column", gap: 10 }}
    >
      <div style={{ color: C.accent, fontFamily: FONT, fontSize: 11, fontWeight: 700, letterSpacing: 0.5 }}>
        What this model simulates
      </div>
      <div style={{ color: C.text, fontFamily: FONT, fontSize: 12, fontWeight: 600 }}>
        {entityName} flowing through the system
      </div>

      {arrivalText && (
        <div>
          <div style={sectionLabel}>Who arrives</div>
          <div style={rowStyle}>{arrivalText}</div>
        </div>
      )}

      {flowLines.length > 0 && (
        <div>
          <div style={sectionLabel}>How they flow</div>
          {flowLines.map((line, i) => (
            <div key={i} style={rowStyle}>{line}</div>
          ))}
          {renegeText && <div style={{ ...rowStyle, color: C.muted, marginTop: 4, fontStyle: "italic" }}>{renegeText}</div>}
        </div>
      )}

      {resourceLines.length > 0 && (
        <div>
          <div style={sectionLabel}>Resources</div>
          {resourceLines.map((line, i) => (
            <div key={i} style={rowStyle}>{line}</div>
          ))}
        </div>
      )}

      {experimentText && (
        <div>
          <div style={sectionLabel}>Experiment</div>
          <div style={rowStyle}>{experimentText}</div>
        </div>
      )}

      {goals.length > 0 && (
        <div>
          <div style={sectionLabel}>Goals</div>
          {goals.map((goal, i) => {
            const text = typeof goal === "string" ? goal
              : goal.metric && goal.target ? `${goal.metric}: ${goal.target}`
              : goal.metric || JSON.stringify(goal);
            return <div key={i} style={rowStyle}>{text}</div>;
          })}
        </div>
      )}
    </div>
  );
}

export function ModelDiffPreview({ currentModel = {}, proposedModel = {}, onApply, onApplyAndSave, onDiscard, onRefine, allowDraftApply = false, readOnly = false, llmExplanation = null, isNewModel = false }) {
  const { C, FONT } = useTheme();
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState(SECTION_META.map(section => section.key));
  const [validation, setValidation] = useState(null);
  const [saveError, setSaveError] = useState("");
  const [saving, setSaving] = useState(false);
  const [showTechnical, setShowTechnical] = useState(false);
  const diff = useMemo(() => buildModelDiff(currentModel, proposedModel), [currentModel, proposedModel]);
  const orderedDiff = useMemo(() => {
    return [...diff].sort((a, b) => {
      const aChanged = a.diff.added.length + a.diff.modified.length + a.diff.removed.length;
      const bChanged = b.diff.added.length + b.diff.modified.length + b.diff.removed.length;
      if (!!aChanged === !!bChanged) return 0;
      return aChanged ? -1 : 1;
    });
  }, [diff]);
  const summary = useMemo(() => {
    return diff.reduce((acc, section) => {
      acc.added += section.diff.added.length;
      acc.removed += section.diff.removed.length;
      acc.modified += section.diff.modified.length;
      if (section.diff.added.length || section.diff.removed.length || section.diff.modified.length) {
        acc.changedSections += 1;
      }
      return acc;
    }, { added: 0, removed: 0, modified: 0, changedSections: 0 });
  }, [diff]);

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
        <div>
          <SH label="Model Proposal" />
          <div style={{ color: C.muted, fontFamily: FONT, fontSize: 12, lineHeight: 1.6, marginTop: 4 }}>
            {isNewModel ? "Review the model before saving it to your library." : "Review what will change before applying it to the model."}
          </div>
        </div>
        <Btn small variant="ghost" onClick={onDiscard}>Discard</Btn>
      </div>

      {llmExplanation && (
        <div style={{ color: C.muted, fontFamily: FONT, fontSize: 11, fontStyle: "italic", lineHeight: 1.6, borderLeft: `2px solid ${C.accent}44`, paddingLeft: 10 }}>
          {llmExplanation}
        </div>
      )}

      <SimulationSummaryCard proposedModel={proposedModel} />

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

      <div>
        <button
          type="button"
          onClick={() => setShowTechnical(prev => !prev)}
          style={{ background: "none", border: "none", cursor: "pointer", color: C.muted, fontFamily: FONT, fontSize: 11, padding: 0, display: "flex", alignItems: "center", gap: 5 }}
        >
          <span style={{ fontSize: 9 }}>{showTechnical ? "▼" : "▶"}</span>
          Show technical changes
        </button>
      </div>

      {showTechnical && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))", gap: 8 }}>
            {[
              { label: "Sections changed", value: summary.changedSections, color: summary.changedSections ? C.accent : C.muted },
              { label: "Modified", value: summary.modified, color: summary.modified ? C.amber : C.muted },
              { label: "Added", value: summary.added, color: summary.added ? C.green : C.muted },
              { label: "Removed", value: summary.removed, color: summary.removed ? C.red : C.muted },
            ].map(item => (
              <div key={item.label} style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 6, padding: "9px 10px" }}>
                <div style={{ color: C.muted, fontFamily: FONT, fontSize: 9, fontWeight: 700, marginBottom: 4, letterSpacing: 1 }}>
                  {item.label}
                </div>
                <div style={{ color: item.color, fontFamily: FONT, fontSize: 18, fontWeight: 700 }}>
                  {item.value}
                </div>
              </div>
            ))}
          </div>

          {orderedDiff.map(section => {
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
                  {hasChanges && <Tag label="Changed" color={C.accent} />}
                  {hasChanges && (
                    <div style={{ color: C.muted, fontFamily: FONT, fontSize: 11 }}>
                      {[added.length ? `${added.length} added` : "", modified.length ? `${modified.length} modified` : "", removed.length ? `${removed.length} removed` : ""].filter(Boolean).join("  ·  ")}
                    </div>
                  )}
                </div>
                <ChangeList title="Added" items={added} color={C.green} renderItem={renderItemSummary} />
                <ChangeList title="Removed" items={removed} color={C.red} renderItem={renderItemSummary} />
                <ChangeList title="Modified" items={modified} color={C.amber} renderItem={(item) => <ModifiedSummaryItem item={item} />} />
                {!hasChanges && (
                  <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 6, padding: "8px 10px", color: C.muted, fontFamily: FONT, fontSize: 10 }}>
                    {unchanged.length} item{unchanged.length === 1 ? "" : "s"} unchanged
                  </div>
                )}
              </section>
            );
          })}
        </>
      )}

      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
        {!readOnly && (
          <>
            {isNewModel ? (
              <>
                {onApplyAndSave && <Btn variant="primary" onClick={() => applyModel("all", true)} disabled={saving}>{saving ? "Saving..." : "Apply & Save"}</Btn>}
                <Btn variant="primary" onClick={() => applyModel("all")} disabled={saving}>Apply (draft)</Btn>
              </>
            ) : (
              <>
                {onRefine && <Btn variant="ghost" onClick={onRefine} disabled={saving}>Refine this</Btn>}
                {!selecting && <Btn variant="ghost" onClick={() => setSelecting(true)} disabled={saving}>Apply Selected</Btn>}
                {selecting && <Btn variant="ghost" onClick={() => applyModel("selected")} disabled={!selected.length || saving}>Apply Selected</Btn>}
                {selecting && onApplyAndSave && <Btn variant="primary" onClick={() => applyModel("selected", true)} disabled={!selected.length || saving}>{saving ? "Saving..." : "Apply & Save Selected"}</Btn>}
                <Btn variant="primary" onClick={() => applyModel("all")} disabled={saving}>Apply model</Btn>
                {onApplyAndSave && <Btn variant="primary" onClick={() => applyModel("all", true)} disabled={saving}>{saving ? "Saving..." : "Apply & Save All"}</Btn>}
              </>
            )}
          </>
        )}
        <Btn variant="ghost" onClick={onDiscard}>{isNewModel ? "Discard" : "Close"}</Btn>
      </div>
    </div>
  );
}
