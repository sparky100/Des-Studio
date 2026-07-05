import { Btn } from "../shared/components.jsx";
import { ConditionBuilder } from "../editors/index.jsx";
import { useTheme } from "../shared/ThemeContext.jsx";
import { VISUAL_NODE_TYPES } from "./graph.js";
import { extractReleaseTarget } from "../../model/macroParser.js";
import {
  updateProbabilisticBranchProbability,
  updateProbabilisticBranchQueueTarget,
  updateConditionalBranch,
  updateDefaultQueueName,
  addBlankRoutingBranch,
  removeRoutingBranch,
  applyBEventRoutingMode,
} from "./graph-operations.js";

// Resolves the completion B-event an edge represents. Multi-branch edges (derived
// from a routing/probabilisticRouting array) carry bEventId directly (set by
// graph.js). A plain single-branch edge doesn't, so fall back to the activity's
// cSchedules — matching by implicit RELEASE target (or direct sink id) rather
// than always taking cSchedules[0], since an activity can have more than one
// schedule (the V29 attribute-conditional `when` case).
function resolveBEventId(model, graph, edge) {
  if (edge.bEventId != null) return edge.bEventId;
  const fromNode = (graph.nodes || []).find(n => n.id === edge.from);
  const toNode = (graph.nodes || []).find(n => n.id === edge.to);
  const cEvent = (model.cEvents || []).find(ce => ce.id === fromNode?.refId);
  const schedules = (cEvent?.cSchedules || []).filter(s => !s.when);
  if (toNode?.type === VISUAL_NODE_TYPES.SINK) {
    const direct = schedules.find(s => s.eventId === toNode.refId);
    if (direct) return direct.eventId;
  }
  for (const s of schedules) {
    const be = (model.bEvents || []).find(b => b.id === s.eventId);
    if (!be) continue;
    const implicit = extractReleaseTarget(be.effect);
    if (implicit && toNode?.label && implicit.trim().toLowerCase() === toNode.label.trim().toLowerCase()) return be.id;
  }
  return schedules[0]?.eventId ?? null;
}

export function RouteEdgeDialog({ edgeId, model, graph, canEdit, onApply, onClose, onDeleteEdge }) {
  const { C, FONT } = useTheme();
  const edge = (graph.edges || []).find(e => e.id === edgeId);
  const bEventId = edge ? resolveBEventId(model, graph, edge) : null;
  const bEvent = (model.bEvents || []).find(b => b.id === bEventId);

  if (!edge || !bEvent) return null;

  const queues = model.queues || [];
  const entityTypes = model.entityTypes || [];
  const stateVariables = model.stateVariables || [];
  const containers = model.containerTypes || [];

  const hasRouting = Array.isArray(bEvent.routing) && bEvent.routing.length > 0;
  const hasProb = Array.isArray(bEvent.probabilisticRouting) && bEvent.probabilisticRouting.length > 0;
  const mode = hasRouting ? "conditional" : hasProb ? "probabilistic" : "none";

  const apply = nextModel => { if (canEdit) onApply(nextModel); };
  const setMode = nextMode => apply(applyBEventRoutingMode(model, bEvent.id, nextMode));
  const addBranch = () => apply(addBlankRoutingBranch(model, bEvent.id, mode === "conditional" ? "conditional" : "probabilistic"));
  const removeBranch = idx => apply(removeRoutingBranch(model, bEvent.id, idx));
  const updateProbability = (idx, probability) => apply(updateProbabilisticBranchProbability(model, { bEventId: bEvent.id, branchIndex: idx }, probability));
  const updateProbQueue = (idx, queueNameOrNull) => apply(updateProbabilisticBranchQueueTarget(model, { bEventId: bEvent.id, branchIndex: idx }, queueNameOrNull));
  const updateCondRow = (idx, patch) => apply(updateConditionalBranch(model, bEvent.id, idx, patch));
  const updateDefault = queueNameOrNull => apply(updateDefaultQueueName(model, bEvent.id, queueNameOrNull));

  const probTotal = parseFloat(((bEvent.probabilisticRouting || []).reduce((s, b) => s + (parseFloat(b.probability) || 0), 0)).toFixed(4));

  const selectStyle = color => ({
    flex: 1, minWidth: 100, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 4,
    color: color || C.text, fontFamily: FONT, fontSize: 11, padding: "4px 6px", outline: "none",
  });

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Edit route"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: "fixed", inset: 0, background: C.overlay, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999 }}
    >
      <div style={{
        background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: 20,
        maxWidth: 520, width: "92%", maxHeight: "80vh", overflowY: "auto",
        display: "flex", flexDirection: "column", gap: 12, fontFamily: FONT,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ color: C.text, fontSize: 14, fontWeight: 700 }}>{bEvent.name || bEvent.id} — routing</div>
          <Btn small variant="ghost" ariaLabel="Close" onClick={onClose}>✕</Btn>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 10, color: C.muted, fontFamily: FONT }}>Mode:</span>
          <select
            value={mode}
            disabled={!canEdit}
            onChange={e => setMode(e.target.value)}
            style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 4, color: C.text, fontFamily: FONT, fontSize: 11, padding: "4px 8px", outline: "none" }}
          >
            <option value="none">Single queue (no routing)</option>
            <option value="conditional">Conditional routing</option>
            <option value="probabilistic">Probabilistic routing</option>
          </select>
        </div>

        {mode === "probabilistic" && (
          <>
            {(bEvent.probabilisticRouting || []).map((row, idx) => (
              <div key={idx} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", background: C.bg, border: `1px solid ${C.border}`, borderRadius: 4, padding: "8px 10px" }}>
                <input
                  type="number" min="0" max="100" step="1" disabled={!canEdit}
                  value={Math.round((row.probability ?? 0) * 100)}
                  onChange={e => updateProbability(idx, (parseFloat(e.target.value) || 0) / 100)}
                  aria-label={`Probability for route ${idx + 1}`}
                  style={{ width: 60, background: "transparent", border: `1px solid ${C.border}`, borderRadius: 4, color: C.amber, fontFamily: FONT, fontSize: 11, padding: "4px 6px", outline: "none" }}
                />
                <span style={{ fontSize: 10, color: C.muted, fontFamily: FONT }}>% →</span>
                <select
                  disabled={!canEdit}
                  value={row.queueName == null ? "__EXIT__" : (row.queueName || "")}
                  onChange={e => updateProbQueue(idx, e.target.value === "__EXIT__" ? null : e.target.value)}
                  style={selectStyle(row.queueName == null ? C.green : undefined)}
                >
                  <option value="">— queue —</option>
                  <option value="__EXIT__">Exit system (discharge)</option>
                  {queues.map(q => <option key={q.id || q.name} value={q.name}>{q.name}</option>)}
                </select>
                {canEdit && <Btn small variant="danger" ariaLabel={`Remove branch ${idx + 1}`} onClick={() => removeBranch(idx)}>✕</Btn>}
              </div>
            ))}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              {canEdit && <Btn small variant="ghost" onClick={addBranch}>+ Add branch</Btn>}
              <span style={{ fontSize: 11, fontFamily: FONT, fontWeight: 700, color: Math.abs(probTotal - 1) > 0.001 ? C.red : C.green }}>
                Total: {probTotal.toFixed(3)}{Math.abs(probTotal - 1) > 0.001 ? " ≠ 1.0 ✗" : " ✓"}
              </span>
            </div>
          </>
        )}

        {mode === "conditional" && (
          <>
            {(bEvent.routing || []).map((row, idx) => (
              <div key={idx} style={{ display: "flex", flexDirection: "column", gap: 6, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 4, padding: "8px 10px" }}>
                <div style={{ display: "flex", gap: 6, alignItems: "flex-start" }}>
                  <span style={{ fontSize: 10, color: C.muted, fontFamily: FONT, paddingTop: 4 }}>IF</span>
                  <div style={{ flex: 1 }}>
                    <ConditionBuilder
                      value={row.condition || ""}
                      onChange={canEdit ? value => updateCondRow(idx, { condition: value }) : () => {}}
                      entityTypes={entityTypes}
                      stateVariables={stateVariables}
                      queues={queues}
                      containers={containers}
                    />
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <span style={{ fontSize: 10, color: C.muted, fontFamily: FONT }}>→</span>
                  <select
                    disabled={!canEdit}
                    value={row.queueName == null ? "__EXIT__" : (row.queueName || "")}
                    onChange={e => updateCondRow(idx, { queueName: e.target.value === "__EXIT__" ? null : e.target.value })}
                    style={selectStyle(row.queueName == null ? C.green : undefined)}
                  >
                    <option value="">— queue —</option>
                    <option value="__EXIT__">Exit system (leave)</option>
                    {queues.map(q => <option key={q.id || q.name} value={q.name}>{q.name}</option>)}
                  </select>
                  {canEdit && <Btn small variant="danger" ariaLabel={`Remove condition ${idx + 1}`} onClick={() => removeBranch(idx)}>✕</Btn>}
                </div>
              </div>
            ))}
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 10, color: C.muted, fontFamily: FONT, whiteSpace: "nowrap" }}>DEFAULT →</span>
              <select
                disabled={!canEdit}
                value={bEvent.defaultQueueName == null ? "__EXIT__" : (bEvent.defaultQueueName || "")}
                onChange={e => updateDefault(e.target.value === "__EXIT__" ? null : e.target.value)}
                style={selectStyle(bEvent.defaultQueueName == null ? C.green : undefined)}
              >
                <option value="">— queue or exit system —</option>
                <option value="__EXIT__">Exit system (leave)</option>
                {queues.map(q => <option key={q.id || q.name} value={q.name}>{q.name}</option>)}
              </select>
            </div>
            {canEdit && <Btn small variant="ghost" onClick={addBranch}>+ Add condition</Btn>}
          </>
        )}

        {mode === "none" && (
          <div style={{ fontSize: 11, color: C.muted, fontFamily: FONT, lineHeight: 1.6 }}>
            This route has a single destination. Switch the mode above to add conditional or probability-weighted branches.
          </div>
        )}

        <div style={{ display: "flex", justifyContent: mode === "none" ? "space-between" : "flex-end" }}>
          {mode === "none" && canEdit && (
            <Btn small variant="danger" onClick={() => onDeleteEdge?.(edgeId)}>Delete connection</Btn>
          )}
          <Btn small variant="primary" onClick={onClose}>Done</Btn>
        </div>
      </div>
    </div>
  );
}
