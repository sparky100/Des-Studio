import { useId } from "react";
;
import { Btn, CommitInput, DistPicker, SH, Tag } from "../shared/components.jsx";
import { ConditionBuilder, EntityFilterBuilder } from "../editors/index.jsx";
import { VISUAL_NODE_TYPES } from "./graph.js";
import { useTheme } from "../shared/ThemeContext.jsx";
import { disciplineAttr, disciplineBase } from "../shared/utils.js";

function effectValue(effect = "", pattern) {

  return String(effect || "").match(pattern)?.[1]?.trim() || "";
}

function SelectField({ label, value, onChange, children, disabled }) {
  const { C, FONT } = useTheme();
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

// Commits on blur/Enter rather than every keystroke — matches every other model editor
// (QueueEditor, BEventEditor, etc.) and avoids flooding the model's 20-entry undo stack
// with one entry per character typed.
function CommitField({ label, value, onChange, disabled, transform, placeholder }) {
  const { C, FONT } = useTheme();
  const id = `visual-commit-${useId()}`;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      <label htmlFor={id} style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.5, color: C.muted, textTransform: "uppercase", fontFamily: FONT }}>
        {label}
      </label>
      <CommitInput
        value={value}
        onCommit={onChange}
        transform={transform}
        disabled={disabled}
        placeholder={placeholder}
        ariaLabel={label}
        style={{
          background: C.bg,
          border: `1px solid ${C.border}`,
          borderRadius: 5,
          color: C.text,
          fontFamily: FONT,
          fontSize: 12,
          padding: "8px 10px",
          outline: "none",
          width: "100%",
          boxSizing: "border-box",
          opacity: disabled ? 0.5 : 1,
        }}
      />
    </div>
  );
}

// Coerces to a positive integer string, falling back to fallback when the input is empty/invalid.
function positiveIntTransform(fallback) {
  return raw => {
    const n = parseInt(String(raw || "").trim(), 10);
    return Number.isFinite(n) && n > 0 ? String(n) : fallback;
  };
}

// Coerces to a positive integer string, or "" (unlimited) when blank/invalid.
function optionalPositiveIntTransform(raw) {
  const trimmed = String(raw || "").trim();
  if (!trimmed) return "";
  const n = parseInt(trimmed, 10);
  return Number.isFinite(n) && n > 0 ? String(n) : "";
}

export function VisualNodeInspector({ model, graph, selectedNodeId, canEdit, onPatchNode, onDeleteNode, onClose }) {
  const { C, FONT } = useTheme();
  const node = (graph.nodes || []).find(item => item.id === selectedNodeId);
  const customers = (model.entityTypes || []).filter(type => type.role === "customer");
  const servers = (model.entityTypes || []).filter(type => type.role === "server");
  const queues = model.queues || [];

  if (!node) {
    return (
      <div style={{ background: C.panel, display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 14px", borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
          <SH label="Inspector" color={C.muted} />
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: 14 }}>
          <div style={{ color: C.muted, fontFamily: FONT, fontSize: 12, lineHeight: 1.6 }}>
            Select a node to review or edit its canonical model fields.
          </div>
        </div>
      </div>
    );
  }

  const bEventRefId = node.refId?.startsWith("route-exit:") ? node.refId.slice("route-exit:".length) : node.refId;
  const bEvent = (model.bEvents || []).find(event => event.id === bEventRefId);
  const cEvent = (model.cEvents || []).find(event => event.id === node.refId);
  const queue = (model.queues || []).find(item => item.id === node.refId);
  const sourceCustomer = effectValue(bEvent?.effect, /ARRIVE\(([^,)]+)/i);
  const sourceQueue = effectValue(bEvent?.effect, /ARRIVE\([^,]+,\s*([^)]+)\)/i);
  const sinkMacro = String(bEvent?.effect || "").toUpperCase().includes("RENEGE") ? "RENEGE" : "COMPLETE";
  const sourceSchedule = bEvent?.schedules?.[0] || {};
  const activitySchedule = cEvent?.cSchedules?.[0] || {};
  const activityServer = effectValue(cEvent?.effect, /ASSIGN\([^,)]+,\s*([^)]+)\)/i);
  const isDelayActivity = /DELAY\(/i.test(String(cEvent?.effect || ""));

  const sections = model.sections || [];
  // bEventRefId already strips the route-exit: prefix, and equals node.refId for
  // queue/activity nodes too — i.e. the same id used as a section memberId.
  const currentSectionId = sections.find(section => (section.memberIds || []).includes(bEventRefId))?.id || "";

  return (
    <div style={{ background: C.panel, display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 14px", borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
        <SH label="Inspector" color={C.accent}>
          <Tag label={node.type} color={node.type === VISUAL_NODE_TYPES.SINK ? C.red : node.type === VISUAL_NODE_TYPES.ACTIVITY ? C.purple : node.type === VISUAL_NODE_TYPES.QUEUE ? C.cEvent : C.green} />
        </SH>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            title="Close inspector"
            aria-label="Close inspector"
            style={{
              background: C.surface,
              border: `1px solid ${C.border}`,
              borderRadius: 4,
              color: C.text,
              cursor: "pointer",
              fontFamily: FONT,
              fontSize: 12,
              fontWeight: 700,
              lineHeight: 1,
              padding: "4px 10px",
            }}
          >✕</button>
        )}
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: 14, display: "flex", flexDirection: "column", gap: 12 }}>

      {node.type === VISUAL_NODE_TYPES.SOURCE && bEvent && (
        <>
          <CommitField label="Source name" value={bEvent.name} disabled={!canEdit} onChange={value => onPatchNode(node, { name: value })} />
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
          <CommitField label="Queue name" value={queue.name} disabled={!canEdit} onChange={value => onPatchNode(node, { name: value })} />
          <SelectField label="Customer type" value={queue.customerType} disabled={!canEdit} onChange={value => onPatchNode(node, { customerType: value })}>
            {customers.map(type => <option key={type.id || type.name} value={type.name}>{type.name}</option>)}
          </SelectField>
          <SelectField
            label="Discipline"
            value={disciplineBase(queue.discipline)}
            disabled={!canEdit}
            onChange={value => onPatchNode(node, {
              discipline: value === "PRIORITY_ATTR" ? `PRIORITY(${disciplineAttr(queue.discipline) || "priority"})` : value,
            })}
          >
            <option value="FIFO">FIFO — First In, First Out</option>
            <option value="LIFO">LIFO — Last In, First Out</option>
            <option value="PRIORITY">Priority (uses "priority" attr)</option>
            <option value="PRIORITY_ATTR">Priority (custom attribute)…</option>
            <option value="SPT">SPT — Shortest Processing Time</option>
            <option value="EDD">EDD — Earliest Due Date</option>
          </SelectField>
          {disciplineBase(queue.discipline) === "PRIORITY_ATTR" && (
            <CommitField
              label="Priority attribute"
              value={disciplineAttr(queue.discipline)}
              disabled={!canEdit}
              placeholder="e.g. severity"
              onChange={value => onPatchNode(node, { discipline: `PRIORITY(${value || "priority"})` })}
            />
          )}
          <CommitField
            label="Max queue length (blank = unlimited)"
            value={queue.capacity || ""}
            disabled={!canEdit}
            transform={optionalPositiveIntTransform}
            onChange={value => onPatchNode(node, { capacity: value || null })}
          />
          {queue.capacity && (
            <SelectField
              label="When full — send to"
              value={queue.overflowDestination || ""}
              disabled={!canEdit}
              onChange={value => onPatchNode(node, { overflowDestination: value || null })}
            >
              <option value="">Exit system (reject arrival)</option>
              {(model.queues || [])
                .filter(q => q.id !== queue.id)
                .map(q => <option key={q.id || q.name} value={q.name}>{q.name}</option>)}
            </SelectField>
          )}
        </>
      )}

      {node.type === VISUAL_NODE_TYPES.ACTIVITY && cEvent && (
        <>
          <CommitField label="Activity name" value={cEvent.name} disabled={!canEdit} onChange={value => onPatchNode(node, { name: value })} />
          <CommitField
            label="Priority"
            value={String(cEvent.priority || 1)}
            disabled={!canEdit}
            transform={positiveIntTransform(String(cEvent.priority || 1))}
            onChange={value => onPatchNode(node, { priority: value })}
          />
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
          {isDelayActivity ? (
            <div style={{ background: "#fef3c710", border: "1px solid #d9770640", borderRadius: 6, padding: "8px 10px", fontSize: 11, color: "#d97706", fontFamily: FONT, lineHeight: 1.5 }}>
              Delay activity — entity held for a sampled duration with no resource claimed.
            </div>
          ) : (
            <>
              <SelectField label="Server type" value={activityServer} disabled={!canEdit} onChange={value => onPatchNode(node, { serverType: value })}>
                {servers.length === 0
                  ? <option value="">No server types defined</option>
                  : servers.map(type => <option key={type.id || type.name} value={type.name}>{type.name}</option>)
                }
              </SelectField>
              {(() => {
                const selServer = servers.find(s => s.name === activityServer);
                const ss = selServer && Array.isArray(selServer.shiftSchedule) && selServer.shiftSchedule.length > 0 ? selServer.shiftSchedule : null;
                if (!ss) return null;
                const firstCap = parseInt(ss[0]?.capacity, 10) || 1;
                const lastCap = parseInt(ss[ss.length - 1]?.capacity, 10) || 1;
                const range = firstCap === lastCap ? `${firstCap}` : `${firstCap}-${lastCap}`;
                return (
                  <div style={{ background: `${C.server}10`, border: `1px solid ${C.server}33`, borderRadius: 6, padding: "8px 10px", display: "flex", flexDirection: "column", gap: 4 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontSize: 10, fontWeight: 700, color: C.server, fontFamily: FONT }}>Shift Schedule</span>
                      <span style={{ fontSize: 9, color: C.server, fontFamily: FONT, background: `${C.server}22`, borderRadius: 3, padding: "1px 5px" }}>{ss.length} period{ss.length !== 1 ? "s" : ""}</span>
                    </div>
                    <div style={{ fontSize: 10, color: C.text, fontFamily: FONT, lineHeight: 1.5 }}>
                      Pool size varies: {range} across {ss.length} shift{ss.length !== 1 ? "s" : ""}.
                    </div>
                    <div style={{ fontSize: 9, color: C.muted, fontFamily: FONT, fontStyle: "italic" }}>
                      Manage shift periods in the Forms/Tabs Entity Types editor.
                    </div>
                  </div>
                );
              })()}
              {(() => {
                const selServer = servers.find(s => s.name === activityServer);
                if (!selServer?.mtbfDist) return null;
                const scope = selServer.failureScope || "unit";
                return (
                  <div style={{ background: `${C.red}10`, border: `1px solid ${C.red}33`, borderRadius: 6, padding: "8px 10px", display: "flex", flexDirection: "column", gap: 4 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontSize: 10, fontWeight: 700, color: C.red, fontFamily: FONT }}>Failure Model</span>
                      <span style={{ fontSize: 9, color: C.red, fontFamily: FONT, background: `${C.red}22`, borderRadius: 3, padding: "1px 5px" }}>
                        {scope === "unit" ? "per unit" : "pool"}
                      </span>
                    </div>
                    <div style={{ fontSize: 10, color: C.text, fontFamily: FONT, lineHeight: 1.5 }}>
                      MTBF: {selServer.mtbfDist}({Object.values(selServer.mtbfDistParams || {}).join(", ")}) · MTTR: {selServer.mttrDist}({Object.values(selServer.mttrDistParams || {}).join(", ")})
                    </div>
                    <div style={{ fontSize: 9, color: C.muted, fontFamily: FONT, fontStyle: "italic" }}>
                      Manage failure settings in the Forms/Tabs Entity Types editor.
                    </div>
                  </div>
                );
              })()}
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
        </>
      )}

      {node.type === VISUAL_NODE_TYPES.SINK && bEvent && (
        <>
          <CommitField label="Sink name" value={bEvent.name} disabled={!canEdit} onChange={value => onPatchNode(node, { name: value })} />
          {!node.refId?.startsWith("route-exit:") && (
            <SelectField label="Terminal macro" value={sinkMacro} disabled={!canEdit} onChange={value => onPatchNode(node, { terminalMacro: value })}>
              <option value="COMPLETE">COMPLETE</option>
              <option value="RENEGE">RENEGE</option>
            </SelectField>
          )}
        </>
      )}

      {sections.length > 0 && (
        <SelectField
          label="Section"
          value={currentSectionId}
          disabled={!canEdit}
          onChange={value => onPatchNode(node, { sectionId: value || null })}
        >
          <option value="">Unassigned</option>
          {sections.map(section => <option key={section.id} value={section.id}>{section.name || "Section"}</option>)}
        </SelectField>
      )}

      {!canEdit && <Btn small variant="ghost" disabled>Read-only</Btn>}

      {canEdit && (
        <div style={{ marginTop: 4, borderTop: `1px solid ${C.border}`, paddingTop: 12 }}>
          <Btn small variant="danger" full onClick={() => onDeleteNode?.(node)}>Delete node</Btn>
        </div>
      )}

      </div>
    </div>
  );
}
