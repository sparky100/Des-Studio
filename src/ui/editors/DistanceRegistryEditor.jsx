import { Btn, InfoBox } from "../shared/components.jsx";
import { useTheme } from "../shared/ThemeContext.jsx";

const SANS = "Inter,'Segoe UI',Arial,sans-serif";

const DistanceRegistryEditor = ({ distances, queues = [], onChange }) => {
  const { C, FONT } = useTheme();
  const add = () => onChange([
    ...distances,
    { id: "dist" + Date.now(), fromQueue: "", toQueue: "", distance: "10" },
  ]);
  const upd = (i, f, v) => { const n = [...distances]; n[i] = { ...n[i], [f]: v }; onChange(n); };
  const rem = (i) => onChange(distances.filter((_, idx) => idx !== i));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:12}}>
        <div>
          <div style={{fontSize:18,fontWeight:700,color:C.text,fontFamily:SANS}}>Distances</div>
          <div style={{fontSize:12,color:C.muted,fontFamily:SANS,marginTop:2}}>Named distances between queue pairs, used by the Distance distribution for travel time</div>
        </div>
        <Btn variant="primary" onClick={add}>+ Add Distance</Btn>
      </div>
      <InfoBox color={C.accent}>
        A distance is an <strong style={{ color: C.accent }}>undirected</strong> entry between two queues —
        one entry covers travel in either direction. Used by a C-event's schedule when its delay
        distribution is set to <strong style={{ color: C.accent }}>Distance</strong>: duration = distance ÷
        a speed attribute read from the matched server or arriving entity.
      </InfoBox>
      {distances.length === 0 && (
        <div style={{background:C.panel,border:`1px solid ${C.border}`,borderRadius:10,padding:"40px 24px",textAlign:"center",display:"flex",flexDirection:"column",alignItems:"center",gap:12}}>
          <div style={{fontSize:32,lineHeight:1}}>🗺️</div>
          <div style={{fontSize:14,fontWeight:600,color:C.text,fontFamily:SANS}}>No distances yet</div>
          <div style={{fontSize:13,color:C.muted,fontFamily:SANS,lineHeight:1.6,maxWidth:380}}>Add a distance between two queues to model travel time — pick "Distance" as a C-event schedule's delay distribution to use it.</div>
          <Btn variant="primary" onClick={add}>+ Add Distance</Btn>
        </div>
      )}
      {distances.map((d, i) => (
        <div key={d.id || i} style={{
          background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6,
          padding: 10, display: "flex", flexDirection: "column", gap: 8,
        }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <select
              aria-label={`Distance ${i + 1} from queue`}
              value={d.fromQueue || ""}
              onChange={e => upd(i, "fromQueue", e.target.value)}
              style={{
                background: "transparent", border: `1px solid ${C.accent}44`,
                borderRadius: 4, color: C.accent, fontFamily: FONT, fontSize: 12,
                padding: "5px 8px", outline: "none",
              }}
            >
              <option value="">— select queue —</option>
              {queues.map(q => <option key={q.id} value={q.name}>{q.name}</option>)}
            </select>
            <span style={{ fontSize: 11, color: C.muted, fontFamily: FONT }}>↔</span>
            <select
              aria-label={`Distance ${i + 1} to queue`}
              value={d.toQueue || ""}
              onChange={e => upd(i, "toQueue", e.target.value)}
              style={{
                background: "transparent", border: `1px solid ${C.accent}44`,
                borderRadius: 4, color: C.accent, fontFamily: FONT, fontSize: 12,
                padding: "5px 8px", outline: "none",
              }}
            >
              <option value="">— select queue —</option>
              {queues.map(q => <option key={q.id} value={q.name}>{q.name}</option>)}
            </select>
            <span style={{ fontSize: 11, color: C.muted, fontFamily: FONT }}>distance</span>
            <input
              type="number" min="0" step="1"
              value={d.distance}
              onChange={e => upd(i, "distance", e.target.value)}
              placeholder="10"
              style={{
                width: 90, background: "transparent", border: `1px solid ${C.border}`,
                borderRadius: 4, color: C.amber, fontFamily: FONT, fontSize: 12,
                padding: "5px 8px", outline: "none",
              }}
            />
            <Btn small variant="danger" ariaLabel={`Remove distance ${i + 1}`} onClick={() => rem(i)}>✕</Btn>
          </div>
        </div>
      ))}
    </div>
  );
};

export { DistanceRegistryEditor };
