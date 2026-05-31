// ui/execute/VisualView.jsx — CustomerToken, ServerBay, VisualView

import { TOKEN_COLORS } from "../shared/tokens.js";
import { Tag, PhaseTag, Btn, Empty } from "../shared/components.jsx";
import { tokenColor } from "./executeHelpers.js";
import { formatSimWallTime } from "../../engine/clockUtils.js";
import { useTheme } from "../shared/ThemeContext.jsx";

export const CustomerToken = ({ entity, size = 36, showId = true }) => {
  const { C, FONT } = useTheme();
  const col = tokenColor(entity.id);
  const statusBorder = { waiting: C.waiting, serving: C.serving, done: C.served, reneged: C.reneged, idle: C.green, busy: C.amber }[entity.status] || C.muted;
  return (
    <div title={`#${entity.id} ${entity.type} — ${entity.status}\narrived t=${entity.arrivalTime?.toFixed?.(2)}`}
      style={{
        width: size, height: size, borderRadius: "50%", background: col + "22", border: `2.5px solid ${statusBorder}`,
        display: "flex", alignItems: "center", justifyContent: "center", fontFamily: FONT, fontSize: size * 0.28,
        fontWeight: 700, color: col, flexShrink: 0, cursor: "default", transition: "all .2s",
        boxShadow: entity.status === "serving" ? `0 0 8px ${col}66` : "none"
      }}>
      {showId ? `#${entity.id}` : ""}
    </div>
  );
};

const ServerBay = ({ server, customers }) => {
  const servingCust = customers.find(e => e.id === server.currentCustId);
  const isB = server.status === "busy";
  const borderCol = isB ? C.busy : C.idle;
  return (
    <div style={{
      background: C.panel, border: `2px solid ${borderCol}44`, borderRadius: 10, padding: 14,
      display: "flex", flexDirection: "column", gap: 10, minWidth: 160, position: "relative"
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "space-between" }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 12, color: C.server, fontFamily: FONT }}>Server #{server.id}</div>
          <div style={{ fontSize: 10, color: C.label, fontFamily: FONT }}>{server.type}</div>
        </div>
        <Tag label={server.status} color={isB ? C.amber : C.green} />
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, justifyContent: "center" }}>
        <div style={{
          width: 48, height: 48, borderRadius: 8, background: `${C.server}18`, border: `2px solid ${C.server}55`,
          display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0
        }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <rect x="3" y="6" width="18" height="4" rx="1" stroke={C.server} strokeWidth="1.5" />
            <rect x="3" y="13" width="18" height="4" rx="1" stroke={C.server} strokeWidth="1.5" />
            <circle cx="6.5" cy="8" r="1" fill={isB ? C.amber : C.green} />
          </svg>
        </div>
        {servingCust ? (
          <><div style={{ fontSize: 18, color: C.muted }}>→</div><CustomerToken entity={servingCust} size={44} /></>
        ) : (
          <div style={{ fontSize: 11, color: C.muted, fontFamily: FONT, fontStyle: "italic" }}>idle</div>
        )}
      </div>
    </div>
  );
};

export const VisualView = ({ snap, model, summary }) => {
  const { C, FONT } = useTheme();
  if (!snap) return <Empty icon="▶" msg="Run or step the simulation to see the visual view." />;

  const allEntities = snap.entities || [];
  const servers = allEntities.filter(e => e.role === "server");
  const customers = allEntities.filter(e => e.role !== "server");
  const waiting = customers.filter(e => e.status === "waiting");
  const totalArrived = summary?.total ?? customers.length;
  const totalServed = summary?.served ?? snap.served ?? 0;
  const totalReneged = summary?.reneged ?? snap.reneged ?? 0;
  const definedQueues = model.queues || [];
  const wallClock = model?.epoch ? formatSimWallTime(snap.clock, model.epoch, model.timeUnit || "minutes") : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {summary?.warmupPeriod > 0 && (
        <div style={{ background: `${C.warmup}22`, border: `1px solid ${C.amber}44`, borderRadius: 8, padding: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", gap: 16 }}>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <span style={{ fontSize: 9, color: C.label, fontWeight: 700 }}>WARM-UP DURATION</span>
              <span style={{ fontSize: 14, color: C.amber, fontWeight: 700 }}>{summary.warmupPeriod}</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <span style={{ fontSize: 9, color: C.label, fontWeight: 700 }}>OBS. EXCLUDED</span>
              <span style={{ fontSize: 14, color: C.reneged, fontWeight: 700 }}>{summary.excludedCount || 0}</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <span style={{ fontSize: 9, color: C.label, fontWeight: 700 }}>OBS. INCLUDED</span>
              <span style={{ fontSize: 14, color: C.served, fontWeight: 700 }}>{summary.total || 0}</span>
            </div>
          </div>
          <div style={{ fontSize: 10, color: C.amber, fontWeight: 700, fontFamily: FONT, letterSpacing: 1 }}>WARM-UP AUDIT TRAIL</div>
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: 16, alignItems: "start" }}>
        <div style={{ background: C.bg, border: `2px solid ${C.purple}44`, borderRadius: 12, padding: "20px 28px", textAlign: "center", minWidth: 140 }}>
          <div style={{ fontSize: 10, color: C.label, fontFamily: FONT, letterSpacing: 2, marginBottom: 6 }}>SIM CLOCK</div>
          <div style={{ fontSize: 42, fontWeight: 300, color: "#fff", fontFamily: FONT, lineHeight: 1 }}>
            {parseFloat(snap.clock).toFixed(0)}
          </div>
          {wallClock && (
            <div style={{ marginTop: 10, fontSize: 13, color: C.accent, fontFamily: FONT, fontWeight: 600, lineHeight: 1.4, maxWidth: 180 }}>
              {wallClock}
            </div>
          )}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8 }}>
          {[
            { label: "Arrived", value: totalArrived, color: C.kpiArr },
            { label: "Served", value: totalServed, color: C.kpiSvc },
            { label: "Reneged", value: totalReneged, color: C.danger },
            { label: "Waiting now", value: waiting.length, color: C.bEvent },
          ].map(s => (
            <div key={s.label} style={{ background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 8, padding: 10, textAlign: "center" }}>
              <div style={{ fontSize: 9, color: C.label, fontWeight: 700, marginBottom: 4 }}>{s.label.toUpperCase()}</div>
              <div style={{ fontSize: 20, color: s.color, fontWeight: 700 }}>{s.value}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        {servers.map(srv => <ServerBay key={srv.id} server={srv} customers={customers} />)}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ fontSize: 10, color: C.label, fontFamily: FONT, letterSpacing: 1.5, fontWeight: 700 }}>QUEUE LANES</div>
        {definedQueues.length > 0 ? (
          definedQueues.map((qDef, idx) => {
            const qName = qDef.name;
            const qEntities = waiting.filter(e => e.queue === qName || (idx === 0 && !e.queue));
            return (
              <div key={qName} style={{ background: C.bg, border: `1px solid ${C.border}`, borderLeft: `4px solid ${C.cEvent || C.purple}`, borderRadius: 8, padding: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: "#fff", fontFamily: FONT }}>{qName.toUpperCase()}</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: qEntities.length > 0 ? C.bEvent : "#fff", fontFamily: FONT }}>{qEntities.length}</span>
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', minHeight: 40 }}>
                  {qEntities.length === 0 ? <span style={{ fontSize: 11, color: C.muted, fontStyle: "italic" }}>empty</span> : qEntities.map(e => <CustomerToken key={e.id} entity={e} size={32} />)}
                </div>
              </div>
            );
          })
        ) : (
          <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, padding: 12 }}>
            <div style={{ fontSize: 11, color: C.bEvent, fontWeight: 700, marginBottom: 8 }}>GENERAL QUEUE</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{waiting.map(e => <CustomerToken key={e.id} entity={e} size={32} />)}</div>
          </div>
        )}
      </div>
    </div>
  );
};
