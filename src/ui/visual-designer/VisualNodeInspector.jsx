import { useId } from "react";
import { C, FONT } from "../shared/tokens.js";
import { Btn, DistPicker, Field, SH, Tag } from "../shared/components.jsx";
import { ConditionBuilder, EntityFilterBuilder } from "../editors/index.jsx";
import { VISUAL_NODE_TYPES } from "./graph.js";

function effectValue(effect = "", pattern) {
  return String(effect || "").match(pattern)?.[1]?.trim() || "";
}

function SelectField({ label, value, onChange, children, disabled }) {
  const id = `visual-select-${useId()}`;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      <label htmlFor={id} style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.5, color: C.muted, textTransform: "uppercase", fontFamily: FONT }}>
        {label}
      </label>
      <select
        id={id}
        value={value || ""}
        onChange={e => onChange?.(e.target.value)}
        disabled={disabled}
        style={{
          background: C.bg,
          border: `1px solid ${C.border}`,
          borderRadius: 5,
          color: C.text,
          fontFamily: FONT,
          fontSize: 12,
          padding: "8px 10px",
          outline: "none",
          opacity: disabled ? 0.5 : 1,
        }}
      >
        {children}
      </select>
    </div>
  );
}

export function VisualNodeInspector({ model, graph, selectedNodeId, canEdit, onPatchNode }) {
  const node = (graph.nodes || []).find(item => item.id === selectedNodeId);
  const customers = (model.entityTypes || []).filter(type => type.role === "customer");
  const servers = (model.entityTypes || []).filter(type => type.role === "server");
  const queues = model.queues || [];

  if (!node) {
    return (
      <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 6, padding: 14 }}>
        <SH label="Inspector" color={C.muted} />
        <div style={{ color: C.muted, fontFamily: FONT, fontSize: 12, lineHeight: 1.6 }}>
          Select a node to review or edit its canonical model fields.
        </div>
      </div>
    );
  }

  const bEvent = (model.bEvents || []).find(event => event.id === node.refId);
  const cEvent = (model.cEvents || []).find(event => event.id === node.refId);
  const queue = (model.queues || []).find(item => item.id === node.refId);
  const sourceCustomer = effectValue(bEvent?.effect, /ARRIVE\(([^,)]+)/i);
  const sourceQueue = effectValue(bEvent?.effect, /ARRIVE\([^,]+,\s*([^)]+)\)/i);
  const sinkMacro = String(bEvent?.effect || "").toUpperCase().includes("RENEGE") ? "RENEGE" : "COMPLETE";
  const sourceSchedule = bEvent?.schedules?.[0] || {};
  const activitySchedule = cEvent?.cSchedules?.[0] || {};
  const activityServer = effectValue(cEvent?.effect, /ASSIGN\([^,)]+,\s*([^)]+)\)/i);

  return (
    <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 6, padding: 14, display: "flex", flexDirection: "column", gap: 12 }}>
      <SH label="Inspector" color={C.accent}>
        <Tag label={node.type} color={node.type === VISUAL_NODE_TYPES.SINK ? C.red : node.type === VISUAL_NODE_TYPES.ACTIVITY ? C.purple : node.type === VISUAL_NODE_TYPES.QUEUE ? C.cEvent : C.green} />
      </SH>

      {node.type === VISUAL_NODE_TYPES.SOURCE && bEvent && (
        <>
          <Field label="Source name" value={bEvent.name} onChange={canEdit ? value => onPatchNode(node, { name: value }) : null} />
          <SelectField label="Customer type" value={sourceCustomer} disabled={!canEdit} onChange={value => onPatchNode(node, { customerType: value })}>
            {customers.map(type => <option key={type.id || type.name} value={type.name}>{type.name}</option>)}
          </SelectField>
          <SelectField label="Target queue" value={sourceQueue} disabled={!canEdit} onChange={value => onPatchNode(node, { queueName: value })}>
            <option value="">No queue selected</option>
            {queues.map(item => <option key={item.id || item.name} value={item.name}>{item.name}</option>)}
          </SelectField>
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.5, color: C.muted, textTransform: "uppercase", fontFamily: FONT }}>
              Inter-arrival time
            </div>
            <DistPicker
              value={{ dist: sourceSchedule.dist || "Exponential", distParams: sourceSchedule.distParams || { mean: "1" } }}
              onChange={canEdit ? value => onPatchNode(node, { interarrival: value }) : () => {}}
              compact
            />
          </div>
        </>
      )}

      {node.type === VISUAL_NODE_TYPES.QUEUE && queue && (
        <>
          <Field label="Queue name" value={queue.name} onChange={canEdit ? value => onPatchNode(node, { name: value }) : null} />
          <SelectField label="Customer type" value={queue.customerType} disabled={!canEdit} onChange={value => onPatchNode(node, { customerType: value })}>
            {customers.map(type => <option key={type.id || type.name} value={type.name}>{type.name}</option>)}
          </SelectField>
          <SelectField label="Discipline" value={queue.discipline || "FIFO"} disabled={!canEdit} onChange={value => onPatchNode(node, { discipline: value })}>
            <option value="FIFO">FIFO</option>
            <option value="LIFO">LIFO</option>
            <option value="PRIORITY">Priority</option>
          </SelectField>
        </>
      )}

      {node.type === VISUAL_NODE_TYPES.ACTIVITY && cEvent && (
        <>
          <Field label="Activity name" value={cEvent.name} onChange={canEdit ? value => onPatchNode(node, { name: value }) : null} />
          <Field label="Priority" value={String(cEvent.priority || 1)} onChange={canEdit ? value => onPatchNode(node, { priority: value }) : null} />
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.5, color: C.muted, textTransform: "uppercase", fontFamily: FONT }}>
              Condition
            </div>
            <ConditionBuilder
              value={cEvent.condition || ""}
              onChange={canEdit ? value => onPatchNode(node, { condition: value }) : () => {}}
              entityTypes={model.entityTypes || []}
              stateVariables={model.stateVariables || []}
              queues={model.queues || []}
            />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.5, color: C.muted, textTransform: "uppercase", fontFamily: FONT }}>
                Entity Filter
              </div>
              <span style={{ fontSize: 10, color: C.muted, fontFamily: FONT, fontStyle: "italic" }}>optional</span>
            </div>
            <EntityFilterBuilder
              entityTypes={model.entityTypes || []}
              value={cEvent.entityFilter || null}
              onChange={canEdit ? value => onPatchNode(node, { entityFilter: value }) : () => {}}
            />
          </div>
          <SelectField label="Server type" value={activityServer} disabled={!canEdit} onChange={value => onPatchNode(node, { serverType: value })}>
            {servers.length === 0
              ? <option value="">No server types defined</option>
              : servers.map(type => <option key={type.id || type.name} value={type.name}>{type.name}</option>)
            }
          </SelectField>
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.5, color: C.muted, textTransform: "uppercase", fontFamily: FONT }}>
              Service time
            </div>
            <DistPicker
              value={{ dist: activitySchedule.dist || "Fixed", distParams: activitySchedule.distParams || { value: "1" } }}
              onChange={canEdit ? value => onPatchNode(node, { serviceTime: value }) : () => {}}
              compact
            />
          </div>
        </>
      )}

      {node.type === VISUAL_NODE_TYPES.SINK && bEvent && (
        <>
          <Field label="Sink name" value={bEvent.name} onChange={canEdit ? value => onPatchNode(node, { name: value }) : null} />
          <SelectField label="Terminal macro" value={sinkMacro} disabled={!canEdit} onChange={value => onPatchNode(node, { terminalMacro: value })}>
            <option value="COMPLETE">COMPLETE</option>
            <option value="RENEGE">RENEGE</option>
          </SelectField>
        </>
      )}

      {!canEdit && <Btn small variant="ghost" disabled>Read-only</Btn>}
    </div>
  );
}
