// ui/execute/NodeDetailSidebar.jsx — Detail sidebar for queue and activity nodes
import { Fragment, useEffect, useCallback, useMemo } from "react";
import { useTheme } from "../shared/ThemeContext.jsx";
import { deriveActivityLiveData } from "./activityLiveData.js";

// Spacing and radius tokens (mirrors tokens.js for test compatibility)
const SPACE = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 };
const RADIUS = { sm: 4, md: 6, lg: 10 };

function deriveQueueLiveData(snap, label, model) {
  if (!snap) return null;
  const entities = snap.entities || [];
  const waiting = entities.filter(e => e.status === "waiting");
  const queueEntities = waiting.filter(e => e.queue === label);
  const qDef = (model.queues || []).find(q => q.name === label);
  const cap = qDef?.capacity ? parseInt(qDef.capacity, 10) : null;
  return {
    depth: queueEntities.length,
    capacity: Number.isFinite(cap) && cap > 0 ? cap : null,
    entities: queueEntities,
    discipline: qDef?.discipline ?? null,
    clock: snap.clock,
  };
}

function QueueDetail({ label, liveData, onEntitySelect }) {
  const { C, FONT } = useTheme();
  const { depth, capacity, entities = [], discipline, clock } = liveData || {};
  const sorted = [...entities].sort((a, b) => {
    if (discipline === "LIFO") return b.arrivalTime - a.arrivalTime;
    if (discipline === "PRIORITY") {
      const pa = a.attrs?.priority ?? Infinity;
      const pb = b.attrs?.priority ?? Infinity;
      if (pa !== pb) return pa - pb;
      return a.arrivalTime - b.arrivalTime;
    }
    return a.arrivalTime - b.arrivalTime;
  });

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: SPACE.sm, marginBottom: SPACE.md }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: C.text, fontFamily: FONT }}>{label}</span>
        <span style={{
          fontSize: 10, fontWeight: 700, color: C.cEvent, background: `${C.cEvent}18`,
          padding: "2px 6px", borderRadius: RADIUS.sm, fontFamily: FONT,
        }}>
          {discipline || "FIFO"}
        </span>
        <span style={{ fontSize: 11, color: C.muted, fontFamily: FONT }}>
          {depth}{capacity != null ? ` / ${capacity}` : ""}
        </span>
      </div>
      {sorted.length === 0 ? (
        <div style={{ fontSize: 11, color: C.muted, fontFamily: FONT, fontStyle: "italic", padding: SPACE.lg, textAlign: "center" }}>
          Queue is empty
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
          {sorted.map((entity, i) => {
            const waitTime = clock - (entity.waitingSince ?? entity.arrivalTime);
            return (
              <div
                key={entity.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "28px 1fr auto auto",
                  gap: SPACE.sm,
                  alignItems: "center",
                  padding: `${SPACE.sm}px ${SPACE.sm}px`,
                  background: i % 2 === 0 ? "transparent" : `${C.surface}80`,
                  borderRadius: RADIUS.sm,
                  cursor: "pointer",
                }}
                onClick={() => onEntitySelect?.(entity.id)}
                title={`Click to inspect entity #${entity.id}`}
              >
                <span style={{ fontSize: 10, color: C.muted, fontFamily: FONT, fontWeight: 700 }}>
                  #{i + 1}
                </span>
                <span style={{ fontSize: 11, color: C.text, fontFamily: FONT }}>
                  #{entity.id}
                  {entity.attrs?.entityId != null && (
                    <span style={{ color: C.muted }}> ({entity.attrs.entityId})</span>
                  )}{" "}
                  <span style={{ color: C.muted }}>{entity.type}</span>
                </span>
                <span style={{ fontSize: 10, color: C.amber, fontFamily: FONT }}>
                  t={waitTime.toFixed(1)}
                </span>
                {entity.attrs?.priority != null && (
                  <span style={{
                    fontSize: 9, color: C.purple, background: `${C.purple}18`,
                    padding: "1px 4px", borderRadius: RADIUS.sm, fontFamily: FONT,
                  }}>
                    P={entity.attrs.priority}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ActivityResourceBlock({ typeStats, clock, onEntitySelect }) {
  const { C, FONT } = useTheme();
  const {
    capacity, busyCount, activityBusyCount, idleCount, failedCount, suspendedCount = 0,
    utilisation, servers = [],
  } = typeStats || {};

  const statusColor = { busy: C.busy, idle: C.idle, failed: C.red, suspended: C.muted };
  const statusBg = { busy: `${C.busy}18`, idle: `${C.idle}18`, failed: `${C.red}18`, suspended: `${C.muted}18` };

  const activeServers = servers.filter(s => !s.suspended);
  const suspendedServers = servers.filter(s => s.suspended);

  // If activityBusyCount is provided, show activity-split stats; otherwise show aggregate stats
  const hasActivitySplit = activityBusyCount !== undefined;
  const busyElsewhere = hasActivitySplit ? (busyCount - activityBusyCount) : null;

  const statCards = hasActivitySplit ? [
    { label: "Total capacity", value: capacity, color: C.text },
    { label: "Busy here", value: activityBusyCount, color: C.busy },
    { label: "Busy elsewhere", value: busyElsewhere, color: busyElsewhere > 0 ? C.amber : C.muted },
    { label: "Idle", value: idleCount, color: C.idle },
  ] : [
    { label: "Capacity", value: capacity, color: C.text },
    { label: "Busy", value: busyCount, color: C.busy },
    { label: "Idle", value: idleCount, color: C.idle },
    { label: "Failed", value: failedCount, color: C.red },
  ];

  return (
    <div>
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: SPACE.sm,
        marginBottom: SPACE.sm,
      }}>
        {statCards.map(stat => (
          <div key={stat.label} style={{
            background: C.surface, borderRadius: RADIUS.sm, padding: `${SPACE.sm}px`,
            textAlign: "center",
          }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: stat.color, fontFamily: FONT }}>{stat.value}</div>
            <div style={{ fontSize: 9, color: C.muted, fontFamily: FONT, textTransform: "uppercase", letterSpacing: 1 }}>{stat.label}</div>
          </div>
        ))}
      </div>
      {suspendedCount > 0 && (
        <div style={{
          display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: SPACE.sm,
          marginBottom: SPACE.sm,
        }}>
          <div style={{
            background: `${C.muted}12`, borderRadius: RADIUS.sm, padding: `${SPACE.sm}px`,
            textAlign: "center", gridColumn: "span 4",
          }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: C.muted, fontFamily: FONT }}>{suspendedCount}</div>
            <div style={{ fontSize: 9, color: C.muted, fontFamily: FONT, textTransform: "uppercase", letterSpacing: 1 }}>Suspended (shift change)</div>
          </div>
        </div>
      )}
      <div style={{
        height: 4, background: C.surface, borderRadius: RADIUS.sm, marginBottom: SPACE.sm, overflow: "hidden",
      }}>
        <div style={{
          height: "100%", width: `${Math.min(utilisation, 100)}%`,
          background: utilisation > 90 ? C.red : utilisation > 70 ? C.amber : C.green,
          borderRadius: RADIUS.sm, transition: "width 200ms",
        }} />
      </div>
      <div style={{ fontSize: 10, color: C.muted, fontFamily: FONT, marginBottom: SPACE.sm }}>
        Utilisation: {utilisation.toFixed(0)}%
      </div>
      {activeServers.length === 0 && suspendedServers.length === 0 ? (
        <div style={{ fontSize: 11, color: C.muted, fontFamily: FONT, fontStyle: "italic", padding: SPACE.lg, textAlign: "center" }}>
          No servers configured
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: SPACE.sm }}>
          {activeServers.map(srv => {
            const elapsed = srv.serviceStart != null ? clock - srv.serviceStart : null;
            const remaining = srv.scheduledDuration != null && elapsed != null
              ? Math.max(0, srv.scheduledDuration - elapsed)
              : null;
            return (
              <div
                key={srv.id}
                style={{
                  background: C.surface, borderRadius: RADIUS.md,
                  padding: `${SPACE.sm}px ${SPACE.md}px`,
                  border: `1px solid ${statusBg[srv.status] || C.border}`,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: SPACE.sm, marginBottom: 4 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: C.text, fontFamily: FONT }}>
                    Server #{srv.id}
                  </span>
                  <span style={{
                    fontSize: 9, fontWeight: 700, color: statusColor[srv.status] || C.muted,
                    background: statusBg[srv.status] || `${C.muted}18`,
                    padding: "1px 5px", borderRadius: RADIUS.sm, fontFamily: FONT,
                    textTransform: "uppercase",
                  }}>
                    {srv.status}
                  </span>
                </div>
                {srv.status === "busy" && srv.customerId != null && (
                  <div style={{
                    fontSize: 10, color: C.muted, fontFamily: FONT,
                    display: "flex", gap: SPACE.md, flexWrap: "wrap",
                  }}>
                    <span>
                      Serving <span
                        style={{ color: C.accent, cursor: "pointer", textDecoration: "underline" }}
                        onClick={() => onEntitySelect?.(srv.customerId)}
                      >
                        #{srv.customerId}
                        {srv.customerEntityId != null ? ` (${srv.customerEntityId})` : ""}
                      </span>
                      {srv.customerType ? ` (${srv.customerType})` : ""}
                    </span>
                    {elapsed != null && <span>Elapsed: t={elapsed.toFixed(1)}</span>}
                    {remaining != null && <span>Remaining: t={remaining.toFixed(1)}</span>}
                  </div>
                )}
                {srv.status === "idle" && srv.starvationTime > 0 && (
                  <div style={{ fontSize: 10, color: C.amber, fontFamily: FONT }}>
                    Idle for t={srv.starvationTime.toFixed(1)}
                  </div>
                )}
                {srv.status === "failed" && srv.downtime > 0 && (
                  <div style={{ fontSize: 10, color: C.red, fontFamily: FONT }}>
                    Downtime: t={srv.downtime.toFixed(1)}
                  </div>
                )}
                {srv.busyTime > 0 && (
                  <div style={{ fontSize: 9, color: C.muted, fontFamily: FONT, marginTop: 2 }}>
                    Total busy: t={srv.busyTime.toFixed(1)}
                  </div>
                )}
              </div>
            );
          })}
          {suspendedServers.length > 0 && (
            <div style={{ marginTop: SPACE.sm }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: C.muted, fontFamily: FONT, textTransform: "uppercase", letterSpacing: 1, marginBottom: SPACE.sm }}>
                Suspended by shift change
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: SPACE.sm }}>
                {suspendedServers.map(srv => (
                  <div
                    key={srv.id}
                    style={{
                      background: `${C.muted}08`, borderRadius: RADIUS.md,
                      padding: `${SPACE.sm}px ${SPACE.md}px`,
                      border: `1px dashed ${C.muted}40`,
                      opacity: 0.6,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: SPACE.sm, marginBottom: 4 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: C.muted, fontFamily: FONT }}>
                        Server #{srv.id}
                      </span>
                      <span style={{
                        fontSize: 9, fontWeight: 700, color: C.muted,
                        background: `${C.muted}18`,
                        padding: "1px 5px", borderRadius: RADIUS.sm, fontFamily: FONT,
                        textTransform: "uppercase",
                      }}>
                        suspended
                      </span>
                      {srv.status === "busy" && srv.customerId != null && (
                        <span style={{ fontSize: 10, color: C.muted, fontFamily: FONT }}>
                          was serving #{srv.customerId}
                          {srv.customerEntityId != null ? ` (${srv.customerEntityId})` : ""}
                        </span>
                      )}
                    </div>
                    {srv.busyTime > 0 && (
                      <div style={{ fontSize: 9, color: C.muted, fontFamily: FONT }}>
                        Total busy before suspension: t={srv.busyTime.toFixed(1)}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// DELAY activities claim no server, so ActivityResourceBlock's capacity/
// utilisation/server-list layout doesn't apply (utilisation is null here —
// rendering that block would crash on `.toFixed()`). Mirrors QueueDetail's
// entity-list style instead: a count plus a click-through list of who's
// actually held in delay right now.
function DelayActivityDetail({ label, typeStats, clock, onEntitySelect }) {
  const { C, FONT } = useTheme();
  const { activityBusyCount = 0, delayedEntities = [] } = typeStats || {};
  const sorted = [...delayedEntities].sort((a, b) => (a.serviceStart ?? 0) - (b.serviceStart ?? 0));

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: SPACE.sm, marginBottom: SPACE.md }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: C.text, fontFamily: FONT }}>{label}</span>
        <span style={{
          fontSize: 10, fontWeight: 700, color: C.cEvent, background: `${C.cEvent}18`,
          padding: "2px 6px", borderRadius: RADIUS.sm, fontFamily: FONT,
        }}>
          DELAY
        </span>
        <span style={{ fontSize: 11, color: C.muted, fontFamily: FONT }}>
          {activityBusyCount} in delay
        </span>
      </div>
      {sorted.length === 0 ? (
        <div style={{ fontSize: 11, color: C.muted, fontFamily: FONT, fontStyle: "italic", padding: SPACE.lg, textAlign: "center" }}>
          Nothing currently held in delay
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
          {sorted.map((entity, i) => {
            const elapsed = clock - (entity.serviceStart ?? entity.arrivalTime);
            return (
              <div
                key={entity.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "28px 1fr auto",
                  gap: SPACE.sm,
                  alignItems: "center",
                  padding: `${SPACE.sm}px ${SPACE.sm}px`,
                  background: i % 2 === 0 ? "transparent" : `${C.surface}80`,
                  borderRadius: RADIUS.sm,
                  cursor: "pointer",
                }}
                onClick={() => onEntitySelect?.(entity.id)}
                title={`Click to inspect entity #${entity.id}`}
              >
                <span style={{ fontSize: 10, color: C.muted, fontFamily: FONT, fontWeight: 700 }}>
                  #{i + 1}
                </span>
                <span style={{ fontSize: 11, color: C.text, fontFamily: FONT }}>
                  #{entity.id}
                  {entity.attrs?.entityId != null && (
                    <span style={{ color: C.muted }}> ({entity.attrs.entityId})</span>
                  )}{" "}
                  <span style={{ color: C.muted }}>{entity.type}</span>
                </span>
                <span style={{ fontSize: 10, color: C.amber, fontFamily: FONT }}>
                  t={elapsed.toFixed(1)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function ActivityDetail({ label, liveData, onEntitySelect }) {
  const { C, FONT } = useTheme();

  // No snapshot until the run is reset or stepped; there are no resource
  // stats to show yet.
  if (!liveData) {
    return (
      <div>
        <div style={{ fontSize: 14, fontWeight: 700, color: C.text, fontFamily: FONT, marginBottom: SPACE.sm }}>{label}</div>
        <div style={{ fontSize: 11, color: C.muted, fontFamily: FONT, fontStyle: "italic", padding: SPACE.lg, textAlign: "center" }}>
          No live data yet. Step or run the model to see this activity.
        </div>
      </div>
    );
  }

  const blocks = liveData.perType?.length > 1 ? liveData.perType : [liveData];
  const single = blocks.length === 1 ? blocks[0] : null;

  if (single?.isDelay) {
    return <DelayActivityDetail label={label} typeStats={single} clock={liveData?.clock} onEntitySelect={onEntitySelect} />;
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: SPACE.sm, marginBottom: SPACE.sm }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: C.text, fontFamily: FONT }}>{label}</span>
        {single?.serverTypeName && (
          <span style={{ fontSize: 10, color: C.server, fontFamily: FONT }}>{single.serverTypeName}</span>
        )}
      </div>
      {blocks.map((block, i) => (
        <div key={block.serverTypeName ?? i} style={{ marginBottom: i < blocks.length - 1 ? SPACE.lg : 0 }}>
          {blocks.length > 1 && (
            <div style={{ fontSize: 11, fontWeight: 700, color: C.server, fontFamily: FONT, marginBottom: SPACE.sm }}>
              {block.serverTypeName}
            </div>
          )}
          <ActivityResourceBlock typeStats={block} clock={liveData?.clock} onEntitySelect={onEntitySelect} />
        </div>
      ))}
    </div>
  );
}

const fmtNumber = n => (Number.isInteger(n) ? String(n) : n.toFixed(1));

// A section card's inspector: what the section is for, and its live numbers. Entities and
// resource lists stay with the detail nodes, which the Detail view shows.
function SectionDetail({ name, description, stats, timeUnit }) {
  const { C, FONT } = useTheme();
  const rows = [
    ["In section now", stats ? stats.inNow : "—"],
    ["Entered so far", stats ? stats.entered : "—"],
    ["Left so far", stats ? stats.left : "—"],
    ["Average stay", stats?.avgTime != null ? `${fmtNumber(stats.avgTime)} ${timeUnit || ""}`.trim() : "no completed stays yet"],
    ["Busiest resource", stats?.busiest ? `${stats.busiest.name} ${Math.round(stats.busiest.utilisation)}%` : "—"],
  ];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: SPACE.md, fontFamily: FONT }}>
      <div>
        <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>{name}</div>
        {description && <p style={{ margin: `${SPACE.xs}px 0 0`, fontSize: 12, color: C.muted, lineHeight: 1.5 }}>{description}</p>}
      </div>
      <dl style={{ margin: 0, display: "grid", gridTemplateColumns: "auto 1fr", gap: `${SPACE.xs}px ${SPACE.md}px`, fontSize: 12 }}>
        {rows.map(([label, value]) => (
          <Fragment key={label}>
            <dt style={{ color: C.muted }}>{label}</dt>
            <dd style={{ margin: 0, color: C.text, fontWeight: 600 }}>{value}</dd>
          </Fragment>
        ))}
      </dl>
    </div>
  );
}

export function NodeDetailSidebar({ selectedNode, onClose, onEntitySelect, snap, serverTypeIndex, model, sectionDetail = null }) {
  const { C, FONT } = useTheme();

  const liveData = useMemo(() => {
    if (!selectedNode || !snap) return null;
    const { nodeType, label, refId } = selectedNode;
    if (nodeType === "queueNode") return deriveQueueLiveData(snap, label, model);
    if (nodeType === "activityNode") return deriveActivityLiveData(snap, refId, serverTypeIndex, model);
    return null;
  }, [selectedNode, snap, serverTypeIndex, model]);

  const handleEsc = useCallback(e => {
    if (e.key === "Escape") onClose?.();
  }, [onClose]);

  useEffect(() => {
    if (selectedNode) {
      document.addEventListener("keydown", handleEsc);
      return () => document.removeEventListener("keydown", handleEsc);
    }
  }, [selectedNode, handleEsc]);

  if (!selectedNode) return null;

  const { nodeType, label } = selectedNode;
  const isSection = nodeType === "sectionNode";
  const nodeTypeTag = isSection ? "Section" : nodeType === "queueNode" ? "Queue" : "Activity";
  const nodeTagColor = isSection ? C.accent : nodeType === "queueNode" ? C.cEvent : C.purple;

  return (
    <div style={{
      flex: 1, minHeight: 0, background: C.panel,
      display: "flex", flexDirection: "column",
      overflow: "hidden",
    }}>
      {/* Header — matches VisualNodeInspector */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "12px 14px",
        borderBottom: `1px solid ${C.border}`,
        flexShrink: 0,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: SPACE.sm }}>
          <span style={{
            fontSize: 10, fontWeight: 700, letterSpacing: "1.8px",
            color: C.accent, fontFamily: FONT, textTransform: "uppercase",
          }}>
            Inspector
          </span>
          <span style={{
            fontSize: 10, fontWeight: 700, color: nodeTagColor,
            background: `${nodeTagColor}18`,
            padding: "2px 6px", borderRadius: RADIUS.sm, fontFamily: FONT,
          }}>
            {nodeTypeTag}
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          style={{
            background: C.surface,
            border: `1px solid ${C.border}`,
            borderRadius: RADIUS.sm,
            color: C.text,
            cursor: "pointer",
            fontFamily: FONT,
            fontSize: 12,
            fontWeight: 700,
            lineHeight: 1,
            padding: "4px 10px",
          }}
          onMouseEnter={e => { e.currentTarget.style.background = C.border; }}
          onMouseLeave={e => { e.currentTarget.style.background = C.surface; }}
          title="Close (Esc)"
        >
          ✕
        </button>
      </div>
      <div style={{
        flex: 1, overflowY: "auto", padding: 14,
      }}>
        {isSection ? (
          <SectionDetail name={label} description={sectionDetail?.description} stats={sectionDetail?.stats} timeUnit={sectionDetail?.timeUnit} />
        ) : nodeType === "queueNode" ? (
          <QueueDetail label={label} liveData={liveData} onEntitySelect={onEntitySelect} />
        ) : nodeType === "activityNode" ? (
          <ActivityDetail label={label} liveData={liveData} onEntitySelect={onEntitySelect} />
        ) : null}
      </div>
    </div>
  );
}
