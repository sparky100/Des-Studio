import { useId } from "react";
;
import { Btn, CommitInput, DistPicker, SH, Tag } from "../shared/components.jsx";
import { ConditionBuilder, EntityFilterBuilder } from "../editors/index.jsx";
import { reorderCEventByPriority } from "../editors/helpers.jsx";
import { VISUAL_NODE_TYPES, conditionLabel } from "./graph.js";
import { classifyActivityEffect, macroCalls } from "../../model/macroParser.js";
import { describeBalking, describeReneging, hasBalking, hasReneging } from "../../model/balkRenegeFormat.js";
import { summarizeBEventEffect } from "../../model/effectSummary.js";
import { summarizePattern } from "../../engine/schedule-pattern.js";
import { useTheme } from "../shared/ThemeContext.jsx";
import { disciplineAttr, disciplineBase } from "../shared/utils.js";

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
function CommitField({ label, value, onChange, disabled, transform, placeholder, multiline }) {
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
        multiline={multiline}
        style={{
          background: C.bg,
          border: `1px solid ${C.border}`,
          borderRadius: 5,
          color: C.text,
          fontFamily: FONT,
          fontSize: 12,
          padding: "8px 10px",
          width: "100%",
          boxSizing: "border-box",
          opacity: disabled ? 0.5 : 1,
          ...(multiline ? { resize: "vertical", lineHeight: 1.5 } : {}),
        }}
      />
    </div>
  );
}

// DefinePointer — the canvas's "point to Define" convention for a field Draw
// intentionally doesn't edit (the Inspector is a deliberate quick-edit
// subset, not full parity with the Define tabs — see
// docs/reviews/visual-designer-inspector-review.md). Was previously
// duplicated ad hoc per field (delay/advanced-effect/shift-schedule/failure-
// model boxes); consolidated here so every gap — including balking,
// reneging, description, and the Source/Sink effect/routing fields — renders
// identically instead of reinventing the box each time.
function DefinePointer({ label, status, summary, tab, color, onGoTo }) {
  const { C, FONT } = useTheme();
  const c = color || C.muted;
  return (
    <div style={{ background: `${c}10`, border: `1px solid ${c}33`, borderRadius: 6, padding: "8px 10px", display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: c, fontFamily: FONT }}>{label}</span>
        {status != null && (
          <span style={{ fontSize: 9, color: c, fontFamily: FONT, background: `${c}22`, borderRadius: 3, padding: "1px 5px" }}>{status}</span>
        )}
      </div>
      {summary && (
        <div style={{ fontSize: 10, color: C.text, fontFamily: FONT, lineHeight: 1.5 }}>{summary}</div>
      )}
      {onGoTo ? (
        <button
          type="button"
          onClick={onGoTo}
          style={{
            background: "none",
            border: "none",
            padding: 0,
            margin: 0,
            fontSize: 9,
            color: c,
            fontFamily: FONT,
            fontStyle: "italic",
            textDecoration: "underline",
            cursor: "pointer",
            textAlign: "left",
            alignSelf: "flex-start",
          }}
        >
          Edit in the {tab} tab →
        </button>
      ) : (
        <div style={{ fontSize: 9, color: C.muted, fontFamily: FONT, fontStyle: "italic" }}>
          Edit in the {tab} tab.
        </div>
      )}
    </div>
  );
}

// Gaps shared by Source and Sink nodes — both are backed by the same BEvent
// schema (description/effect/routing/loopConfig), so one component avoids
// two copies of the same three pointers drifting apart.
function BEventPointers({ bEvent, onGoToDefine, onPatchNode, node, canEdit }) {
  const { C } = useTheme();
  if (!bEvent) return null;
  const hasRouting = (Array.isArray(bEvent.routing) && bEvent.routing.length > 0)
    || (Array.isArray(bEvent.probabilisticRouting) && bEvent.probabilisticRouting.length > 0);
  const loop = bEvent.loopConfig;
  const goToBEvent = goTo(onGoToDefine, "Bound Events", bEvent.id);
  return (
    <>
      <CommitField label="Description" value={bEvent.description} disabled={!canEdit} multiline
        placeholder="Not set." onChange={value => onPatchNode(node, { description: value })} />
      <DefinePointer label="Effect" color={hasRouting ? C.amber : C.muted}
        summary={summarizeBEventEffect(bEvent) || "No effect configured"}
        tab="Bound Events" onGoTo={goToBEvent} />
      <DefinePointer label="Loop Guard" color={loop ? C.amber : C.muted}
        summary={loop ? `Max ${loop.maxLoopCount ?? "N"} loops → ${loop.exitQueueName || "exit system"}` : "Not configured — no recirculation limit."}
        tab="Bound Events" onGoTo={goToBEvent} />
    </>
  );
}

// Maps a DefinePointer's display tab label to the Define tab id ModelDetail's
// goToDefine dispatcher expects, and returns a bound click handler — or
// undefined when no onGoToDefine was supplied, so DefinePointer falls back to
// its plain-text footer.
const DEFINE_TAB_IDS = { Queues: "queues", "Bound Events": "bevents", "Conditional Events": "cevents", "Entity Types": "entities" };
function goTo(onGoToDefine, tabLabel, entityId) {
  const tabId = DEFINE_TAB_IDS[tabLabel];
  return onGoToDefine && tabId ? () => onGoToDefine(tabId, entityId) : undefined;
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

// Coerces to a positive number string, or "" (unlimited) when blank/invalid — like
// optionalPositiveIntTransform but allows decimals, for container capacity/level.
function optionalPositiveNumberTransform(raw) {
  const trimmed = String(raw || "").trim();
  if (!trimmed) return "";
  const n = parseFloat(trimmed);
  return Number.isFinite(n) && n > 0 ? String(n) : "";
}

// Coerces to a non-negative number string, falling back to "0" when blank/invalid.
function nonNegativeNumberTransform(raw) {
  const trimmed = String(raw || "").trim();
  if (!trimmed) return "0";
  const n = parseFloat(trimmed);
  return Number.isFinite(n) && n >= 0 ? String(n) : "0";
}

export function VisualNodeInspector({ model, graph, selectedNodeId, canEdit, onPatchNode, onDeleteNode, onClose, onGoToDefine }) {
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
  const containerType = (model.containerTypes || []).find(item => item.id === node.refId);
  const bEventCalls = macroCalls(bEvent?.effect || "");
  const sourceArrive = bEventCalls.find(call => call.macro === "ARRIVE");
  const sourceCustomer = sourceArrive?.args[0] || "";
  const sourceQueue = sourceArrive?.args[1] || "";
  const sinkMacro = bEventCalls.some(call => call.macro === "RENEGE") ? "RENEGE" : "COMPLETE";
  const sourceSchedule = bEvent?.schedules?.[0] || {};
  const activityCSchedules = cEvent?.cSchedules || [];
  const activitySchedule = activityCSchedules[0] || {};
  // A single-server ASSIGN (with or without a skill/container gate) keeps its
  // server editable here; an effect with no ASSIGN at all (COSEIZE, BATCH,
  // MATCH, …) has no server the canvas can honestly offer to change.
  const activityAssignCall = macroCalls(cEvent?.effect || "").find(call => call.macro === "ASSIGN");
  const activityServer = activityAssignCall?.args[1] || "";
  const activityEffectKind = classifyActivityEffect(cEvent?.effect).kind;
  const isDelayActivity = activityEffectKind === "delay";
  const isAdvancedActivity = activityEffectKind === "advanced" && !activityAssignCall;

  const sections = model.sections || [];
  // bEventRefId already strips the route-exit: prefix, and equals node.refId for
  // queue/activity nodes too — i.e. the same id used as a section memberId.
  const currentSectionId = sections.find(section => (section.memberIds || []).includes(bEventRefId))?.id || "";

  return (
    <div style={{ background: C.panel, display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 14px", borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
        <SH label="Inspector" color={C.accent}>
          <Tag label={node.type} color={node.type === VISUAL_NODE_TYPES.SINK ? C.red : node.type === VISUAL_NODE_TYPES.ACTIVITY ? C.purple : node.type === VISUAL_NODE_TYPES.QUEUE ? C.cEvent : node.type === VISUAL_NODE_TYPES.CONTAINER ? C.amber : C.green} />
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
          <BEventPointers bEvent={bEvent} node={node} onPatchNode={onPatchNode} canEdit={canEdit} onGoToDefine={onGoToDefine} />
          <DefinePointer label="Schedule rows" color={(bEvent.schedules || []).length > 1 ? C.amber : C.muted}
            summary={`${(bEvent.schedules || []).length || 0} row${(bEvent.schedules || []).length === 1 ? "" : "s"} configured. Jitter, linked live-data schedules, and the reneging-timer flag are edited in Bound Events.`}
            tab="Bound Events" onGoTo={goTo(onGoToDefine, "Bound Events", bEvent.id)} />
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
          <CommitField label="Description" value={queue.description} disabled={!canEdit} multiline
            placeholder="Not set." onChange={value => onPatchNode(node, { description: value })} />
          <DefinePointer
            label="Balking" color={hasBalking(queue) ? C.amber : C.muted}
            summary={hasBalking(queue) ? describeBalking(queue) : "Not configured — all arrivals join."}
            tab="Queues"
            onGoTo={goTo(onGoToDefine, "Queues", queue.id)}
          />
          <DefinePointer
            label="Reneging" color={hasReneging(queue) ? C.amber : C.muted}
            summary={hasReneging(queue) ? `Abandons after ${describeReneging(queue)}` : "Not configured — entities never abandon this queue."}
            tab="Queues"
            onGoTo={goTo(onGoToDefine, "Queues", queue.id)}
          />
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
            // Priority isn't a single-event field — array order is the source of truth and
            // priority is densely renumbered 1..n (same invariant CEventEditor's drag reorder
            // maintains). Compute the reordered+renumbered array with the shared helper and
            // hand it back whole via patch.cEvents, rather than writing the number in place.
            onChange={value => onPatchNode(node, { cEvents: reorderCEventByPriority(model.cEvents || [], cEvent.id, value) })}
          />
          <CommitField label="Description" value={cEvent.description} disabled={!canEdit} multiline
            placeholder="Not set." onChange={value => onPatchNode(node, { description: value })} />
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
              containers={model.containerTypes || []}
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
            <DefinePointer label="Activity Type" status="Delay" color={C.amber}
              summary="Entity held for a sampled duration with no resource claimed. Switch to Service in the Conditional Events tab."
              tab="Conditional Events" onGoTo={goTo(onGoToDefine, "Conditional Events", cEvent.id)} />
          ) : isAdvancedActivity ? (
            <DefinePointer label="Activity Type" status="Advanced" color={C.amber}
              summary="This activity uses an advanced effect (e.g. co-seizing several servers) that the canvas can't edit. Switch to Service or Delay in the Conditional Events tab."
              tab="Conditional Events" onGoTo={goTo(onGoToDefine, "Conditional Events", cEvent.id)} />
          ) : (
            <>
              <DefinePointer label="Activity Type" status="Service" color={C.accent}
                summary="Claims a server for a sampled duration. Switch to Delay, or use an advanced effect (co-seize/batch/match/split), in the Conditional Events tab."
                tab="Conditional Events" onGoTo={goTo(onGoToDefine, "Conditional Events", cEvent.id)} />
              <SelectField label="Server type" value={activityServer} disabled={!canEdit} onChange={value => onPatchNode(node, { serverType: value })}>
                {servers.length === 0
                  ? <option value="">No server types defined</option>
                  : servers.map(type => <option key={type.id || type.name} value={type.name}>{type.name}</option>)
                }
              </SelectField>
              {(() => {
                const selServer = servers.find(s => s.name === activityServer);
                // A weekly schedulePattern is a second, separate way this
                // resource's capacity can vary over time (alongside
                // shiftSchedule below) — checked first since the engine
                // treats it as taking priority when both are present.
                if (selServer && Array.isArray(selServer.schedulePattern?.periods) && selServer.schedulePattern.periods.length > 0) {
                  return (
                    <DefinePointer label="Shift Schedule" color={C.server}
                      status="weekly pattern"
                      summary={`Pool size varies on a recurring weekly schedule: ${summarizePattern(selServer.schedulePattern)}.`}
                      tab="Entity Types" onGoTo={goTo(onGoToDefine, "Entity Types", selServer.id)} />
                  );
                }
                const ss = selServer && Array.isArray(selServer.shiftSchedule) && selServer.shiftSchedule.length > 0 ? selServer.shiftSchedule : null;
                if (!ss) return null;
                const firstCap = parseInt(ss[0]?.capacity, 10) || 1;
                const lastCap = parseInt(ss[ss.length - 1]?.capacity, 10) || 1;
                const range = firstCap === lastCap ? `${firstCap}` : `${firstCap}-${lastCap}`;
                return (
                  <DefinePointer label="Shift Schedule" color={C.server}
                    status={`${ss.length} period${ss.length !== 1 ? "s" : ""}`}
                    summary={`Pool size varies: ${range} across ${ss.length} shift${ss.length !== 1 ? "s" : ""}.`}
                    tab="Entity Types" onGoTo={goTo(onGoToDefine, "Entity Types", selServer.id)} />
                );
              })()}
              {(() => {
                const selServer = servers.find(s => s.name === activityServer);
                if (!selServer?.mtbfDist) return null;
                const scope = selServer.failureScope || "unit";
                return (
                  <DefinePointer label="Failure Model" color={C.red}
                    status={scope === "unit" ? "per unit" : "pool"}
                    summary={`MTBF: ${selServer.mtbfDist}(${Object.values(selServer.mtbfDistParams || {}).join(", ")}) · MTTR: ${selServer.mttrDist}(${Object.values(selServer.mttrDistParams || {}).join(", ")})`}
                    tab="Entity Types" onGoTo={goTo(onGoToDefine, "Entity Types", selServer.id)} />
                );
              })()}
              <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.5, color: C.muted, textTransform: "uppercase", fontFamily: FONT }}>
                  Service time
                </div>
                {activityCSchedules.length <= 1 ? (
                  <>
                    {(() => {
                      const targetBEvent = activitySchedule.eventId ? (model.bEvents || []).find(b => b.id === activitySchedule.eventId) : null;
                      return targetBEvent ? (
                        <div style={{ fontSize: 10, color: C.muted, fontFamily: FONT, fontStyle: "italic" }}>
                          Schedules "{targetBEvent.name || targetBEvent.id}"
                        </div>
                      ) : (
                        <div style={{ fontSize: 10, color: C.amber, fontFamily: FONT, fontStyle: "italic" }}>
                          No completion event configured yet
                        </div>
                      );
                    })()}
                    <DistPicker
                      value={{ dist: activitySchedule.dist || "Fixed", distParams: activitySchedule.distParams || { value: "1" } }}
                      onChange={canEdit ? value => onPatchNode(node, { serviceTime: value }) : () => {}}
                      compact
                      allowDistance
                      queues={queues}
                      entityTypes={model.entityTypes || []}
                    />
                  </>
                ) : (
                  // Genuinely parallel, attribute-conditional schedules (V29) — each `when`
                  // branch fires independently with its own delay, so show and edit them
                  // separately instead of silently only reading/writing index 0.
                  activityCSchedules.map((schedule, idx) => {
                    const targetBEvent = (model.bEvents || []).find(b => b.id === schedule.eventId);
                    return (
                      <div key={idx} style={{ display: "flex", flexDirection: "column", gap: 4, border: `1px solid ${C.border}`, borderRadius: 5, padding: "6px 8px" }}>
                        <div style={{ fontSize: 10, color: C.muted, fontFamily: FONT, fontStyle: "italic" }}>
                          {schedule.when ? `If ${conditionLabel(schedule.when)}` : "Otherwise"} → schedules "{targetBEvent?.name || targetBEvent?.id || "?"}"
                        </div>
                        <DistPicker
                          value={{ dist: schedule.dist || "Fixed", distParams: schedule.distParams || { value: "1" } }}
                          onChange={canEdit ? value => onPatchNode(node, { serviceTime: value, serviceTimeIndex: idx }) : () => {}}
                          compact
                          allowDistance
                          queues={queues}
                          entityTypes={model.entityTypes || []}
                        />
                      </div>
                    );
                  })
                )}
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
          <BEventPointers bEvent={bEvent} node={node} onPatchNode={onPatchNode} canEdit={canEdit} onGoToDefine={onGoToDefine} />
        </>
      )}

      {node.type === VISUAL_NODE_TYPES.CONTAINER && containerType && (
        <>
          <CommitField label="Container ID" value={containerType.id} disabled={!canEdit} onChange={value => onPatchNode(node, { id: value })} />
          <CommitField
            label="Capacity (blank = unbounded)"
            value={containerType.capacity ?? ""}
            disabled={!canEdit}
            transform={optionalPositiveNumberTransform}
            onChange={value => onPatchNode(node, { capacity: value === "" ? null : value })}
          />
          <CommitField
            label="Initial level"
            value={containerType.initialLevel ?? 0}
            disabled={!canEdit}
            transform={nonNegativeNumberTransform}
            onChange={value => onPatchNode(node, { initialLevel: value })}
          />
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
