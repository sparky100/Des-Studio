import { C, FONT } from "../shared/tokens.js";
import { SH, Btn, InfoBox, Empty } from "../shared/components.jsx";

const ContainerEditor = ({ containers, onChange }) => {
  const add = () => onChange([
    ...containers,
    { id: "ct" + Date.now(), capacity: "1000", initialLevel: "0" },
  ]);
  const upd = (i, f, v) => { const n = [...containers]; n[i] = { ...n[i], [f]: v }; onChange(n); };
  const rem = (i) => onChange(containers.filter((_, idx) => idx !== i));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <SH label="Containers" color={C.cyan}>
        <Btn small variant="ghost" onClick={add}>+ Add Container</Btn>
      </SH>
      <InfoBox color={C.cyan}>
        A container is a named continuous-level store (tank, buffer, inventory).{" "}
        <strong style={{ color: C.cyan }}>FILL</strong> adds to it (B-event);{" "}
        <strong style={{ color: C.cyan }}>DRAIN</strong> subtracts when level ≥ amount (C-event).
      </InfoBox>
      {containers.length === 0 && (
        <Empty icon="Container" msg="No containers defined. Use FILL/DRAIN macros to model tanks, buffers, or inventory." />
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
