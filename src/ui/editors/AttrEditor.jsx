import { useState } from "react";
import { C, FONT } from "../shared/tokens.js";
import { Btn, DistPicker } from "../shared/components.jsx";

const VALUE_TYPES = [
  { value: "number",  label: "Number" },
  { value: "string",  label: "String" },
  { value: "boolean", label: "Boolean" },
];

function CommitInput({ value, onCommit, placeholder, style }) {
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

const AttrEditor = ({attrs=[], onChange, role='customer'}) => {
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
        return (
          <div key={a.id} style={{background:C.surface,borderRadius:6,padding:'8px 10px',
            border:`1px solid ${role==='server'?C.server+'33':C.cEvent+'33'}`,
            display:'flex',flexDirection:'column',gap:6}}>
            {/* Row 1: name + value type + input */}
            <div style={{display:'flex',gap:6,alignItems:'center',flexWrap:'wrap'}}>
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
                <CommitInput value={a.defaultValue||''} onCommit={v=>upd(i,{defaultValue:v})}
                  placeholder="e.g. Gold" style={{...inpStyle(C.green),flex:1,minWidth:100}}/>
              ) : (
                <select value={a.defaultValue==='true'?'true':'false'} onChange={e=>upd(i,{defaultValue:e.target.value})}
                  style={{...selStyle(C.amber),width:80}}>
                  <option value="true">true</option>
                  <option value="false">false</option>
                </select>
              )}
              <Btn small variant="danger" ariaLabel={`Remove attribute ${a.name || i + 1}`} onClick={()=>rem(i)}>✕</Btn>
            </div>
            {/* Preview */}
            {a.name&&(
              <div style={{fontSize:10,color:C.muted,fontFamily:FONT}}>
                → <span style={{color:C.accent}}>{a.name}</span>
                {vt === 'number'
                  ? <> sampled from <span style={{color:C.amber}}>{a.dist||'Fixed'}({Object.values(a.distParams||{}).join(', ')})</span></>
                  : <> = <span style={{color:C.green}}>{String(a.defaultValue??'')}</span></>
                }
                {' '}on each {role==='customer'?'arrival':'server creation'}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export { AttrEditor };
