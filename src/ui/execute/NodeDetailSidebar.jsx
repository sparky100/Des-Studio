// ui/execute/NodeDetailSidebar.jsx — Detail sidebar for queue and activity nodes
import { useEffect, useCallback, useMemo } from "react";
import { useTheme } from "../shared/ThemeContext.jsx";

// Spacing, radius, and z-index tokens (mirrors tokens.js for test compatibility)
const SPACE = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 };
const RADIUS = { sm: 4, md: 6, lg: 10 };
const Z = { dropdown: 100, tooltip: 150, overlay: 180, modal: 200 };

const SIDEBAR_WIDTH = 380;

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

function deriveActivityLiveData(snap, refId, serverTypeIndex, model) {
  if (!snap) return null;
  const entities = snap.entities || [];
  const servers = entities.filter(e => e.role === "server");
  const meta = serverTypeIndex.get(refId);
  const serverType = meta?.serverType;
  const relevant = serverType
    ? servers.filter(e => e.type.trim().toLowerCase() === serverType.trim().toLowerCase())
    : servers;
  const busyCount = relevant.filter(e => e.status === "busy" && !e._suspended).length;
  const idleCount = relevant.filter(e => e.status === "idle" && !e._suspended).length;
  const failedCount = relevant.filter(e => e.status === "failed").length;
  const suspendedCount = relevant.filter(e => e._suspended).length;
  const actualCapacity = relevant.length;
  const customers = entities.filter(e => e.role !== "server");
  const cEvent = (model?.cEvents || []).find(ce => ce.id === refId);
  const cEventName = cEvent?.name ?? null;
  const activityBusyCount = relevant.filter(e => {
    if (e.status !== "busy") return false;
    const cust = e.currentCustId != null ? customers.find(c => c.id === e.currentCustId) : null;
    return cust?.ceventName === cEventName;
  }).length;
  const serverDetails = relevant.map(srv => {
    const cust = srv.currentCustId != null
      ? customers.find(c => c.id === srv.currentCustId)
      : null;
    return {
      id: srv.id,
      status: srv.status,
      suspended: !!srv._suspended,
      busyTime: srv._busyTime ?? 0,
      starvationTime: srv._starvationTime ?? 0,
      downtime: srv._downtime ?? 0,
      scheduledDuration: srv._scheduledDuration ?? null,
      serviceStart: srv._busyStart ?? null,
      customerId: srv.currentCustId ?? null,
      customerType: cust?.type ?? null,
      customerArrivalTime: cust?.arrivalTime ?? null,
      ceventName: cust?.ceventName ?? null,
    };
  });
  return {
    serverTypeName: serverType ?? null,
    capacity: actualCapacity,
    busyCount,
    activityBusyCount,
    idleCount,
    failedCount,
    suspendedCount,
    utilisation: actualCapacity > 0 ? (busyCount / actualCapacity) * 100 : 0,
    completionSignal: snap.served,
    servers: serverDetails,
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
                  #{entity.id} <span style={{ color: C.muted }}>{entity.type}</span>
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

export function ActivityDetail({ label, liveData, onEntitySelect }) {
  const { C, FONT } = useTheme();
  const {
    serverTypeName, capacity, busyCount, activityBusyCount, idleCount, failedCount, suspendedCount = 0,
    utilisation, servers = [], clock,
  } = liveData || {};

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
      <div style={{ display: "flex", alignItems: "center", gap: SPACE.sm, marginBottom: SPACE.sm }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: C.text, fontFamily: FONT }}>{label}</span>
        {serverTypeName && (
          <span style={{ fontSize: 10, color: C.server, fontFamily: FONT }}>{serverTypeName}</span>
        )}
      </div>
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
                      </span>
                      {srv.customerType ? ` (${srv.customerType})` : ""}
                    </span>
                    {elapsed != null && <span>Elapsed: t={elapsed.toFixed(1)}</span>}
                    {remaining != null && <span>Remaining: t={remaining.toFixed(1)}</span>}
                  </div>
                )}
                {srv.status === "idle" && srv.starvationTime > 0 && (
                  <div style={{ fontSize: 10, color: C.amber, fontFamily: FONT }}>
                    Starvation: t={srv.starvationTime.toFixed(1)}
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

export function NodeDetailSidebar({ selectedNode, onClose, onEntitySelect, snap, serverTypeIndex, model }) {
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
  const nodeTypeTag = nodeType === "queueNode" ? "Queue" : "Activity";
  const nodeTagColor = nodeType === "queueNode" ? C.cEvent : C.purple;

  return (
    <div style={{
      position: "absolute", top: 0, right: 0, bottom: 0,
      width: SIDEBAR_WIDTH, background: C.panel,
      borderLeft: `1px solid ${C.border}`,
      boxShadow: "-8px 0 32px rgba(0,0,0,0.4)",
      zIndex: Z.overlay,
      display: "flex", flexDirection: "column",
      overflow: "hidden",
      animation: "slideIn 200ms ease",
    }}>
      <style>{`
        @keyframes slideIn {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
      `}</style>
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
        {nodeType === "queueNode" ? (
          <QueueDetail label={label} liveData={liveData} onEntitySelect={onEntitySelect} />
        ) : nodeType === "activityNode" ? (
          <ActivityDetail label={label} liveData={liveData} onEntitySelect={onEntitySelect} />
        ) : null}
      </div>
    </div>
  );
}
