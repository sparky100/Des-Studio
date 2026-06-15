import { SH, Btn, InfoBox, Empty } from "../shared/components.jsx";
import { useTheme } from "../shared/ThemeContext.jsx";

const SANS = "Inter,'Segoe UI',Arial,sans-serif";

const ContainerEditor = ({ containers, onChange }) => {
  const { C, FONT } = useTheme();
  const add = () => onChange([
    ...containers,
    { id: "ct" + Date.now(), capacity: "1000", initialLevel: "0" },
  ]);
  const upd = (i, f, v) => { const n = [...containers]; n[i] = { ...n[i], [f]: v }; onChange(n); };
  const rem = (i) => onChange(containers.filter((_, idx) => idx !== i));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:12}}>
        <div>
          <div style={{fontSize:18,fontWeight:700,color:C.text,fontFamily:SANS}}>Containers</div>
          <div style={{fontSize:12,color:C.muted,fontFamily:SANS,marginTop:2}}>Continuous-level stores for tanks, buffers, and inventory</div>
        </div>
        <Btn variant="primary" onClick={add}>+ Add Container</Btn>
      </div>
      <InfoBox color={C.cyan}>
        A container is a named continuous-level store (tank, buffer, inventory).{" "}
        <strong style={{ color: C.cyan }}>FILL</strong> adds to it (B-event);{" "}
        <strong style={{ color: C.cyan }}>DRAIN</strong> subtracts when level ≥ amount (C-event).
      </InfoBox>
      {containers.length === 0 && (
        <div style={{background:C.panel,border:`1px solid ${C.border}`,borderRadius:10,padding:"40px 24px",textAlign:"center",display:"flex",flexDirection:"column",alignItems:"center",gap:12}}>
          <div style={{fontSize:32,lineHeight:1}}>🗄️</div>
          <div style={{fontSize:14,fontWeight:600,color:C.text,fontFamily:SANS}}>No containers yet</div>
          <div style={{fontSize:13,color:C.muted,fontFamily:SANS,lineHeight:1.6,maxWidth:380}}>Add a container to model a tank, buffer, or inventory level — use FILL and DRAIN macros in B-events and C-events.</div>
          <Btn variant="primary" onClick={add}>+ Add Container</Btn>
        </div>
      )}
      {containers.map((ct, i) => (
        <div key={ct.id || i} style={{
          background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6,
          padding: 10, display: "flex", flexDirection: "column", gap: 8,
        }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input
              value={ct.id}
              onChange={e => upd(i, "id", e.target.value)}
              placeholder="ContainerName"
              style={{
                width: 160, background: "transparent", border: `1px solid ${C.cyan}44`,
                borderRadius: 4, color: C.cyan, fontFamily: FONT, fontSize: 12,
                padding: "5px 8px", outline: "none",
              }}
            />
            <span style={{ fontSize: 11, color: C.muted, fontFamily: FONT }}>capacity</span>
            <input
              type="number" min="1" step="1"
              value={ct.capacity}
              onChange={e => upd(i, "capacity", e.target.value)}
              placeholder="1000"
              style={{
                width: 90, background: "transparent", border: `1px solid ${C.border}`,
                borderRadius: 4, color: C.amber, fontFamily: FONT, fontSize: 12,
                padding: "5px 8px", outline: "none",
              }}
            />
            <span style={{ fontSize: 11, color: C.muted, fontFamily: FONT }}>initial level</span>
            <input
              type="number" min="0" step="1"
              value={ct.initialLevel}
              onChange={e => upd(i, "initialLevel", e.target.value)}
              placeholder="0"
              style={{
                width: 90, background: "transparent", border: `1px solid ${C.border}`,
                borderRadius: 4, color: C.green, fontFamily: FONT, fontSize: 12,
                padding: "5px 8px", outline: "none",
              }}
            />
            <Btn small variant="danger" ariaLabel={`Remove container ${ct.id || i + 1}`} onClick={() => rem(i)}>✕</Btn>
          </div>
        </div>
      ))}
    </div>
  );
};

export { ContainerEditor };
