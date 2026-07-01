import { useState } from "react";
;
import { Btn, DistPicker } from "../shared/components.jsx";
import { useTheme } from "../shared/ThemeContext.jsx";

const VALUE_TYPES = [
  { value: "number",  label: "Number" },
  { value: "string",  label: "String" },
  { value: "boolean", label: "Boolean" },
];

function CommitInput({ value, onCommit, placeholder, style }) {
  const { C, FONT } = useTheme();
  const [local, setLocal] = useState(value);
  const commit = () => { if (local !== value) onCommit(local); };
  return (
    <input
      value={local}
      placeholder={placeholder}
      style={style}
      onChange={e => setLocal(e.target.value)}
      onBlur={commit}
      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); commit(); e.target.blur(); } }}
    />
  );
}

function CategoricalBar({ options = [], C, FONT }) {
  const totalWeight = options.reduce((s, o) => s + Math.max(0, Number(o.weight) || 0), 0);
  const max = Math.max(totalWeight, 100);
  const colors = [C.accent, C.purple, C.green, C.amber, C.red, C.coral, C.server, C.cEvent];
  let accumulated = 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginTop: 2 }}>
      <div style={{
        height: 8, borderRadius: 4, overflow: 'hidden', background: C.border + '44',
        display: 'flex', width: '100%',
      }}>
        {options.map((opt, i) => {
          const w = Math.max(0, Number(opt.weight) || 0);
          const pct = max > 0 ? (w / max) * 100 : 0;
          if (pct <= 0) return null;
          const segment = (
            <div key={i} style={{
              width: `${pct}%`, height: '100%',
              background: colors[i % colors.length],
              minWidth: pct > 0 ? 2 : 0,
            }} />
          );
          accumulated += pct;
          return segment;
        })}
        {accumulated < 100 && (
          <div style={{
            width: `${100 - accumulated}%`, height: '100%',
            background: C.border + '66',
          }} />
        )}
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', fontSize: 9, fontFamily: FONT, color: C.muted }}>
        {options.map((opt, i) => {
          const w = Math.max(0, Number(opt.weight) || 0);
          const pct = max > 0 ? (w / max) * 100 : 0;
          if (pct <= 0) return null;
          const label = opt.hasOwnProperty("value") && opt.value != null ? String(opt.value) : "No requirement";
          return (
            <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: colors[i % colors.length], display: 'inline-block', flexShrink: 0 }} />
              {label} {pct.toFixed(0)}%
            </span>
          );
        })}
        {accumulated < 100 && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: C.border + '66', display: 'inline-block', flexShrink: 0 }} />
            No requirement {Math.max(0, 100 - accumulated).toFixed(0)}%
          </span>
        )}
      </div>
    </div>
  );
}

function WeightedOptionsEditor({ options = [], onChange, allowedValues, C, FONT }) {
  const addOption = () => {
    const newOpts = [...options, { value: allowedValues?.[0] || "", weight: 50 }];
    onChange(newOpts);
  };
  const updOption = (i, patch) => {
    const n = options.map((o, idx) => idx === i ? { ...o, ...patch } : o);
    onChange(n);
  };
  const remOption = (i) => onChange(options.filter((_, idx) => idx !== i));

  const inpStyle = {
    background: 'transparent', border: `1px solid ${C.border}`,
    borderRadius: 4, color: C.text, fontFamily: FONT, fontSize: 10,
    padding: '3px 5px', outline: 'none',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minWidth: 200 }}>
      {options.map((opt, i) => {
        const isNullOption = opt.value === null || opt.value === undefined;
        return (
          <div key={i} style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            {allowedValues && allowedValues.length > 0 ? (
              <select
                value={isNullOption ? '__null__' : String(opt.value ?? '')}
                onChange={e => {
                  const v = e.target.value === '__null__' ? null : e.target.value;
                  updOption(i, { value: v });
                }}
                style={{ ...inpStyle, flex: 1, minWidth: 80, color: isNullOption ? C.muted : C.text }}
              >
                {allowedValues.map(av => (
                  <option key={av} value={av}>{av}</option>
                ))}
                <option value="__null__">(no requirement)</option>
              </select>
            ) : (
              <CommitInput
                value={isNullOption ? '' : String(opt.value ?? '')}
                onCommit={v => {
                  const val = v.trim() === '' ? null : v;
                  updOption(i, { value: val });
                }}
                placeholder="value"
                style={{ ...inpStyle, flex: 1, minWidth: 80, color: isNullOption ? C.muted : C.text }}
              />
            )}
            <input
              type="number"
              value={opt.weight ?? 50}
              min={0}
              onChange={e => updOption(i, { weight: Math.max(0, Number(e.target.value) || 0) })}
              style={{ ...inpStyle, width: 45, textAlign: 'center' }}
            />
            <Btn small variant="danger" ariaLabel="Remove option" onClick={() => remOption(i)}>✕</Btn>
          </div>
        );
      })}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <Btn small variant="ghost" onClick={addOption}>+ Add option</Btn>
        <span style={{ fontSize: 9, color: C.muted, fontFamily: FONT }}>
          Weights are relative. Remainder = no requirement.
        </span>
      </div>
    </div>
  );
}

const AttrEditor = ({attrs=[], onChange, role='customer'}) => {
  const { C, FONT } = useTheme();
  const add = () => onChange([...attrs, {
    id:'a'+Date.now(), name:'', valueType:'number', dist:'Fixed', distParams:{value:'1'}
  }]);
  const upd = (i, patch) => {
    const n=[...attrs]; n[i]={...n[i],...patch}; onChange(n);
  };
  const rem = (i) => onChange(attrs.filter((_,idx)=>idx!==i));

  const inpStyle = (color) => ({
    background:'transparent', border:`1px solid ${color||C.border}`,
    borderRadius:4, color:C.text, fontFamily:FONT, fontSize:11,
    padding:'4px 7px', outline:'none',
  });

  const selStyle = (color) => ({
    background:C.bg, border:`1px solid ${color||C.border}`,
    borderRadius:4, color:color||C.text, fontFamily:FONT, fontSize:11,
    padding:'4px 7px', outline:'none',
  });

  return (
    <div style={{display:'flex',flexDirection:'column',gap:6}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
        <span style={{fontSize:10,color:C.muted,fontFamily:FONT,letterSpacing:1.2,fontWeight:700}}>
          ATTRIBUTES {role==='customer'?'(sampled per arrival)':'(fixed per server)'}
        </span>
        <Btn small variant="ghost" onClick={add}>+ Add Attr</Btn>
      </div>
      {attrs.length===0&&(
        <span style={{fontSize:11,color:C.muted,fontFamily:FONT,fontStyle:'italic'}}>
          No attributes. {role==='customer'
            ? 'Add e.g. patience with Uniform distribution for reneging.'
            : 'Add e.g. serviceTime=3 (Fixed) for service duration.'}
        </span>
      )}
      {attrs.map((a,i)=>{
        const vt = a.valueType || 'number';
        const isCategorical = a.dist === 'Categorical';
        const catOptions = isCategorical ? (Array.isArray(a.distParams?.options) ? a.distParams.options : []) : [];
        return (
          <div key={a.id} style={{background:C.surface,borderRadius:6,padding:'8px 10px',
            border:`1px solid ${role==='server'?C.server+'33':C.cEvent+'33'}`,
            display:'flex',flexDirection:'column',gap:6}}>
            {/* Row 1: name + value type + input */}
            <div style={{display:'flex',gap:6,alignItems:'flex-start',flexWrap:'wrap'}}>
              <CommitInput value={a.name} onCommit={v=>upd(i,{name:v})}
                placeholder="attrName" style={{...inpStyle(C.amber),width:100}}/>
              <select value={vt} onChange={e=>upd(i,{valueType:e.target.value})}
                style={{...selStyle(C.purple),width:80}}>
                {VALUE_TYPES.map(t=><option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
              {vt === 'number' ? (
                <>
                  <span style={{fontSize:10,color:C.muted,fontFamily:FONT}}>~</span>
                  <div style={{flex:1}}>
                    <DistPicker value={{dist:a.dist,distParams:a.distParams,sourceFile:a.sourceFile,column:a.column,_csvStats:a._csvStats}}
                      onChange={v=>upd(i,v)} compact allowPiecewise={false}/>
                  </div>
                </>
              ) : vt === 'string' ? (
                <div style={{display:'flex',flexDirection:'column',gap:4,flex:1,minWidth:200}}>
                  {/* Toggle: Fixed value vs Weighted options */}
                  <div style={{display:'flex',gap:4,alignItems:'center',fontSize:10,fontFamily:FONT}}>
                    <label style={{
                      display:'flex',alignItems:'center',gap:3,cursor:'pointer',
                      color:!isCategorical?C.green:C.muted,
                    }}>
                      <input type="radio" checked={!isCategorical}
                        onChange={() => {
                          if (isCategorical) {
                            upd(i, { dist: undefined, distParams: undefined, defaultValue: '' });
                          }
                        }}
                        style={{margin:0}}/>
                      Static
                    </label>
                    <label style={{
                      display:'flex',alignItems:'center',gap:3,cursor:'pointer',
                      color:isCategorical?C.purple:C.muted,
                    }}>
                      <input type="radio" checked={isCategorical}
                        onChange={() => {
                          if (!isCategorical) {
                            upd(i, { dist: 'Categorical', distParams: { options: [] }, defaultValue: undefined });
                          }
                        }}
                        style={{margin:0}}/>
                      Weighted
                    </label>
                  </div>
                  {isCategorical ? (
                    <WeightedOptionsEditor
                      options={catOptions}
                      onChange={opts => upd(i, { distParams: { options: opts } })}
                      allowedValues={a.allowedValues}
                      C={C} FONT={FONT}
                    />
                  ) : (
                    <CommitInput value={a.defaultValue||''} onCommit={v=>upd(i,{defaultValue:v})}
                      placeholder="e.g. Gold" style={{...inpStyle(C.green),flex:1,minWidth:100}}/>
                  )}
                </div>
              ) : (
                <select value={a.defaultValue==='true'?'true':'false'} onChange={e=>upd(i,{defaultValue:e.target.value})}
                  style={{...selStyle(C.amber),width:80}}>
                  <option value="true">true</option>
                  <option value="false">false</option>
                </select>
              )}
              <label style={{display:'flex',alignItems:'center',gap:3,fontSize:10,color:C.muted,fontFamily:FONT,cursor:'pointer',userSelect:'none'}}>
                <input type="checkbox" checked={a.mutable!==false} onChange={e=>upd(i,{mutable:e.target.checked})}/>
                mutable
              </label>
              <Btn small variant="danger" ariaLabel={`Remove attribute ${a.name || i + 1}`} onClick={()=>rem(i)}>✕</Btn>
            </div>
            {/* Preview */}
            {a.name&&(
              <div style={{fontSize:10,color:C.muted,fontFamily:FONT}}>
                → <span style={{color:C.accent}}>{a.name}</span>
                {vt === 'number'
                  ? <> sampled from <span style={{color:C.amber}}>{a.dist||'Fixed'}({Object.values(a.distParams||{}).join(', ')})</span></>
                  : vt === 'string' && isCategorical
                    ? <> set from weighted options on each arrival</>
                      : <> = <span style={{color:C.green}}>{String(a.defaultValue || '')}</span></>
                }
                {' '}on each {role==='customer'?'arrival':'server creation'}
              </div>
            )}
            {/* Categorical bar for string weighted options */}
            {(vt === 'string' && isCategorical && catOptions.length > 0) && (
              <CategoricalBar options={catOptions} C={C} FONT={FONT} />
            )}
          </div>
        );
      })}
    </div>
  );
};

export { AttrEditor };
