// ui/DataSourcesEditor.jsx — the model's live data sources editor (Data tab),
// moved verbatim out of ModelDetail.jsx (max-lines ratchet, expert review C-11).

import { useState } from "react";
import { Btn } from "./shared/components.jsx";
import { SANS } from "./shared/tokens.js";
import { useTheme } from "./shared/ThemeContext.jsx";

// ── Data Sources Editor ──────────────────────────────────────────────────────

const BLANK_SOURCE = () => ({
  id: `ds_${Date.now()}`,
  label: '',
  type: 'rest',
  url: '',
  authHeader: '',
  authSecret: '',
  entityType: '',
  targetBEventId: '',
  timeField: 'time',
  attrMap: '{}',
});

export function DataSourcesEditor({ sources, onChange, canEdit }) {
  const { C, FONT } = useTheme();
  const [expanded, setExpanded] = useState(null);

  const update = (idx, patch) => {
    const next = sources.map((s, i) => i === idx ? { ...s, ...patch } : s);
    onChange(next);
  };

  const add = () => {
    const blank = BLANK_SOURCE();
    onChange([...sources, blank]);
    setExpanded(sources.length);
  };

  const remove = (idx) => {
    const next = sources.filter((_, i) => i !== idx);
    onChange(next);
    setExpanded(null);
  };

  const S = { row: { display:'flex', alignItems:'center', gap:6, padding:'6px 8px', borderRadius:4, background:C.surface, cursor:'pointer', userSelect:'none' },
               label: { flex:1, fontSize:12, color:C.text, fontFamily:FONT },
               badge: { fontSize:10, padding:'2px 6px', borderRadius:3, background:C.border, color:C.muted, fontFamily:FONT },
               field: { display:'flex', flexDirection:'column', gap:3 },
               fieldLabel: { fontSize:10, fontWeight:600, color:C.muted, letterSpacing:'1.2px', textTransform:'uppercase', fontFamily:FONT },
               input: { background:C.bg, border:`1px solid ${C.border}`, borderRadius:4, color:C.text, fontFamily:FONT, fontSize:12, padding:'4px 7px' } };

  return (
    <div style={{display:'flex', flexDirection:'column', gap:8}}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 2 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700, color: C.text, fontFamily: SANS }}>Data Sources</div>
          <div style={{ fontSize: 12, color: C.muted, fontFamily: SANS, marginTop: 2 }}>
            {sources.length > 0 ? `${sources.length} source${sources.length !== 1 ? "s" : ""} connected` : "Connect live data feeds to drive arrivals or entity attributes"}
          </div>
        </div>
        {canEdit && <Btn variant="primary" onClick={add}>+ Add source</Btn>}
      </div>

      {sources.length === 0 && (
        <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 10, padding: "40px 24px", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
          <div style={{ fontSize: 32, lineHeight: 1 }}>🔗</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: C.text, fontFamily: SANS }}>No data sources connected</div>
          <div style={{ fontSize: 13, color: C.muted, fontFamily: SANS, lineHeight: 1.6, maxWidth: 380 }}>
            Connect a live data feed to drive arrivals or entity attributes from an external REST API or schedule file.
          </div>
          {canEdit && (
            <Btn variant="primary" onClick={add}>Connect first source</Btn>
          )}
        </div>
      )}

      {sources.map((src, idx) => (
        <div key={src.id} style={{border:`1px solid ${C.border}`, borderRadius:6, overflow:'hidden'}}>
          <div style={S.row} onClick={() => setExpanded(expanded === idx ? null : idx)}>
            <span style={S.label}>{src.label || src.id || `Source ${idx + 1}`}</span>
            <span style={S.badge}>{src.type}</span>
            <span style={{fontSize:10, color:C.muted, fontFamily:FONT}}>{expanded === idx ? '▲' : '▼'}</span>
          </div>

          {expanded === idx && (
            <div style={{padding:'10px 12px', display:'flex', flexDirection:'column', gap:8, borderTop:`1px solid ${C.border}`}}>
              <div style={{display:'flex', gap:8}}>
                <div style={{...S.field, flex:1}}>
                  <span style={S.fieldLabel}>ID</span>
                  <input style={S.input} value={src.id} disabled readOnly/>
                </div>
                <div style={{...S.field, flex:2}}>
                  <span style={S.fieldLabel}>Label</span>
                  <input style={S.input} value={src.label||''} disabled={!canEdit}
                    onChange={e => update(idx, { label: e.target.value })}/>
                </div>
                <div style={{...S.field}}>
                  <span style={S.fieldLabel}>Type</span>
                  <select style={S.input} value={src.type} disabled={!canEdit}
                    onChange={e => update(idx, { type: e.target.value })}>
                    <option value="rest">rest</option>
                    <option value="scheduleFeed">scheduleFeed</option>
                    <option value="actualsStream">actualsStream</option>
                    <option value="openSky">openSky (live aircraft)</option>
                  </select>
                </div>
              </div>

              <div style={S.field}>
                <span style={S.fieldLabel}>URL</span>
                <input style={{...S.input, width:'100%'}} value={src.url||''} disabled={!canEdit}
                  onChange={e => update(idx, { url: e.target.value })}/>
              </div>

              <div style={{display:'flex', gap:8}}>
                <div style={{...S.field, flex:1}}>
                  <span style={S.fieldLabel}>Auth header</span>
                  <input style={S.input} value={src.authHeader||''} disabled={!canEdit} placeholder="e.g. Authorization"
                    onChange={e => update(idx, { authHeader: e.target.value })}/>
                </div>
                <div style={{...S.field, flex:2}}>
                  <span style={S.fieldLabel}>Auth secret (env placeholder)</span>
                  <input style={S.input} value={src.authSecret||''} disabled={!canEdit} placeholder="{{env.MY_TOKEN}}"
                    onChange={e => update(idx, { authSecret: e.target.value })}/>
                </div>
              </div>

              {src.type === 'scheduleFeed' && (<>
                <div style={{display:'flex', gap:8}}>
                  <div style={{...S.field, flex:1}}>
                    <span style={S.fieldLabel}>Entity type</span>
                    <input style={S.input} value={src.entityType||''} disabled={!canEdit}
                      onChange={e => update(idx, { entityType: e.target.value })}/>
                  </div>
                  <div style={{...S.field, flex:1}}>
                    <span style={S.fieldLabel}>Arrival event to populate</span>
                    <input style={S.input} value={src.targetBEventId||''} disabled={!canEdit}
                      onChange={e => update(idx, { targetBEventId: e.target.value })}/>
                  </div>
                  <div style={{...S.field, flex:1}}>
                    <span style={S.fieldLabel}>Time field in the incoming data</span>
                    <input style={S.input} value={src.timeField||'time'} disabled={!canEdit}
                      onChange={e => update(idx, { timeField: e.target.value })}/>
                  </div>
                </div>
                <div style={S.field}>
                  <span style={S.fieldLabel}>Match incoming fields to model fields</span>
                  <textarea rows={3}
                    style={{...S.input, fontFamily:'monospace', fontSize:11, resize:'vertical', width:'100%'}}
                    value={typeof src.attrMap === 'object' ? JSON.stringify(src.attrMap, null, 2) : (src.attrMap||'{}')}
                    disabled={!canEdit}
                    onChange={e => {
                      try { update(idx, { attrMap: JSON.parse(e.target.value) }); } catch { /* keep raw string while typing */ }
                    }}/>
                  <span style={{fontSize:10, color:C.muted, fontFamily:FONT}}>
                    Map each incoming field to the model field it should fill. Advanced format example: <code>{'{"patientName": "entityId"}'}</code>.
                  </span>
                </div>
              </>)}

              {src.type === 'openSky' && (<>
                <div style={{display:'flex', gap:8}}>
                  <div style={{...S.field, flex:1}}>
                    <span style={S.fieldLabel}>Airport ICAO code</span>
                    <input style={S.input} value={src.airportIcao||'EGLL'} disabled={!canEdit} placeholder="e.g. EGLL, KJFK"
                      onChange={e => update(idx, { airportIcao: e.target.value.toUpperCase().slice(0, 4) })}/>
                  </div>
                  <div style={{...S.field, flex:1}}>
                    <span style={S.fieldLabel}>Radius (nautical miles)</span>
                    <input style={S.input} type="number" value={src.radiusNm||50} disabled={!canEdit}
                      onChange={e => update(idx, { radiusNm: Math.max(5, parseInt(e.target.value) || 50) })}/>
                  </div>
                </div>
                <div style={{fontSize:10, color:C.muted, fontFamily:FONT, lineHeight:1.5}}>
                  Polls the OpenSky Network API for arriving aircraft near the airport.
                  No API key required. Detects descending aircraft within the radius and computes inter-arrival times.
                  Supported airports: EGLL (Heathrow), KJFK, KLAX, KORD, EDDF, RJTT, YSSY, LFPG.
                </div>
              </>)}

              {canEdit && (
                <div style={{display:'flex', justifyContent:'flex-end'}}>
                  <Btn small variant="ghost" onClick={() => remove(idx)} style={{color:C.red}}>Remove</Btn>
                </div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
