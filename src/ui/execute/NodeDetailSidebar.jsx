// ui/execute/NodeDetailSidebar.jsx — Detail sidebar for queue and activity nodes
import { useEffect, useCallback } from "react";
import { C, FONT, SPACE, RADIUS, Z } from "../shared/tokens.js";

const SIDEBAR_WIDTH = 380;

function QueueDetail({ label, liveData, onEntitySelect }) {
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

function ActivityDetail({ label, liveData, onEntitySelect }) {
  const {
    serverTypeName, capacity, busyCount, idleCount, failedCount,
    utilisation, servers = [], clock,
  } = liveData || {};

  const statusColor = { busy: C.busy, idle: C.idle, failed: C.red };
  const statusBg = { busy: `${C.busy}18`, idle: `${C.idle}18`, failed: `${C.red}18` };

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
        marginBottom: SPACE.md,
      }}>
        {[
          { label: "Capacity", value: capacity, color: C.text },
          { label: "Busy", value: busyCount, color: C.busy },
          { label: "Idle", value: idleCount, color: C.idle },
          { label: "Failed", value: failedCount, color: C.red },
        ].map(stat => (
          <div key={stat.label} style={{
            background: C.surface, borderRadius: RADIUS.sm, padding: `${SPACE.sm}px`,
            textAlign: "center",
          }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: stat.color, fontFamily: FONT }}>{stat.value}</div>
            <div style={{ fontSize: 9, color: C.muted, fontFamily: FONT, textTransform: "uppercase", letterSpacing: 1 }}>{stat.label}</div>
          </div>
        ))}
      </div>
      <div style={{
        height: 4, background: C.surface, borderRadius: RADIUS.sm, marginBottom: SPACE.md, overflow: "hidden",
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
      {servers.length === 0 ? (
        <div style={{ fontSize: 11, color: C.muted, fontFamily: FONT, fontStyle: "italic", padding: SPACE.lg, textAlign: "center" }}>
          No servers configured
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: SPACE.sm }}>
          {servers.map(srv => {
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
        </div>
      )}
    </div>
  );
}

export function NodeDetailSidebar({ selectedNode, onClose, onEntitySelect }) {
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

  const { nodeType, label, liveData } = selectedNode;

  return (
    <div style={{
      position: "absolute", top: 0, right: 0, bottom: 0,
      width: SIDEBAR_WIDTH, background: C.panel,
      borderLeft: `1px solid ${C.border}`,
      boxShadow: "-8px 0 32px rgba(0,0,0,0.6)",
      zIndex: Z.overlay,
      display: "flex", flexDirection: "column",
      animation: "slideIn 200ms ease",
    }}>
      <style>{`
        @keyframes slideIn {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
      `}</style>
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: `${SPACE.md}px ${SPACE.lg}px`,
        borderBottom: `1px solid ${C.border}`,
      }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: C.muted, fontFamily: FONT, textTransform: "uppercase", letterSpacing: 1 }}>
          {nodeType === "queueNode" ? "Queue Members" : "Server Pool"}
        </span>
        <button
          type="button"
          onClick={onClose}
          style={{
            background: "transparent", border: "none", color: C.muted,
            cursor: "pointer", fontSize: 16, fontFamily: FONT, padding: "2px 6px",
            borderRadius: RADIUS.sm,
          }}
          title="Close (Esc)"
        >
          ×
        </button>
      </div>
      <div style={{
        flex: 1, overflow: "auto", padding: `${SPACE.md}px ${SPACE.lg}px`,
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
