import { useState, useRef, useMemo, useEffect } from "react";
import { toTitleCase, normTypeName } from "../shared/tokens.js";
import { Tag, Btn, Field, SH, InfoBox, Empty } from "../shared/components.jsx";
import { buildConditionString, rowsToPredicate, parseConditionString, predicateToRows } from "../../model/conditionFormat.js";
import { useTheme } from "../shared/ThemeContext.jsx";

const defaultConditionValueForType = (valueType) => {

  if (valueType === 'boolean') return 'true';
  if (valueType === 'string') return 'value';
  return '0';
};

const rowsToCompoundPredicate = rowsToPredicate;

const parseConditionStr = (value, tokens) => {
  const baseRows = predicateToRows(value);
  return baseRows.map(row => {
    const knownToken = tokens.find(token => token.value === row.token);
    return {
      ...row,
      id: row.id || `r${crypto.randomUUID()}`,
      token: knownToken ? row.token : (tokens[0]?.value || ''),
      operator: ['>=','<=','==','!=','>','<'].includes(row.operator) ? row.operator : '>',
      value: row.value || defaultConditionValueForType(knownToken?.valueType || tokens[0]?.valueType || 'number'),
    };
  });
};

const sameConditionRows = (a = [], b = []) => {
  if (a.length !== b.length) return false;
  return a.every((row, idx) => {
    const other = b[idx];
    return row.token === other.token &&
      row.operator === other.operator &&
      row.value === other.value &&
      row.join === other.join;
  });
};

const ConditionBuilder = ({value, onChange, entityTypes=[], stateVariables=[], queues=[]}) => {
  const { C, FONT } = useTheme();
  // useMemo ensures dropdown rebuilds whenever entityTypes, stateVariables, or queues change (C8 fix)
  const tokens = useMemo(() => {
    // Named queue tokens — "Number of Patients in Triage Queue"
    const queueTokens = (queues||[]).map(q => ({
      label: q.customerType
        ? `Number of ${normTypeName(q.customerType)} in ${q.name}`
        : `Number waiting in ${q.name}`,
      value: `queue(${q.name}).length`,
      valueType: 'number',
    }));
    // Customer entity-type tokens — counts across all queues for that type
    const entityTypeTokens = (entityTypes||[]).filter(e=>e.role==='customer').map(e=>({
      label: `Number of ${normTypeName(e.name)} waiting (any queue)`,
      value: `queue(${normTypeName(e.name)}).length`,
      valueType: 'number',
    }));
    // Server tokens — "Number of available Nurses", "Number of busy Nurses"
    const serverTokens = (entityTypes||[]).filter(e=>e.role==='server').flatMap(e=>{
      const name = normTypeName(e.name);
      return [
        { label:`Number of available ${name}`, value:`idle(${name}).count`, valueType:'number' },
        { label:`Number of busy ${name}`,      value:`busy(${name}).count`, valueType:'number' },
        ...(e.attrDefs||[]).filter(a=>a.name).map(a=>({
          label: `${name} — ${a.name} attribute`,
          value: `attr(${name}, ${a.name})`,
          valueType: a.valueType||'number',
        })),
      ];
    });
    const builtInTokens = [
      { label:'Served — total who have completed service', value:'served', valueType:'number' },
      { label:'Reneged — total who abandoned the queue',  value:'reneged', valueType:'number' },
    ];
    const stateVarTokens = (stateVariables||[]).filter(sv=>sv.name).map(sv=>({
      label: `${sv.name} — ${sv.description||'state variable'}`,
      value: sv.name,
      valueType: 'number',
    }));
    return [...queueTokens, ...entityTypeTokens, ...serverTokens, ...builtInTokens, ...stateVarTokens];
  }, [entityTypes, stateVariables, queues]);

  // Filter operators by valueType
  const getOperatorsForType = (valueType) => {
    switch(valueType) {
      case 'number': return ['==', '!=', '<', '>', '<=', '>='];
      case 'string': return ['==', '!='];
      case 'boolean': return ['==', '!='];
      default: return ['==', '!='];
    }
  };

  const [rows, setRows] = useState(()=>parseConditionStr(value, tokens));
  const tokenSignature = useMemo(() => tokens.map(t => t.value).join('\u001f'), [tokens]);
  const lastPropValue = useRef(value || '');
  const lastTokenSignature = useRef(null);

  // Keep local rows aligned with the canonical condition string and token list.
  // If an old persisted token no longer exists, the visible fallback is written
  // back through onChange so validation and the editor do not diverge.
  useEffect(() => {
    const externalValue = value || '';
    const externalChanged = externalValue !== lastPropValue.current;
    const tokensChanged = tokenSignature !== lastTokenSignature.current;

    if (externalChanged) {
      const parsed = parseConditionStr(externalValue, tokens);
      setRows(prev => sameConditionRows(prev, parsed) ? prev : parsed);
      const normalized = rowsToCompoundPredicate(parsed);
      if (normalized && JSON.stringify(externalValue) !== JSON.stringify(normalized)) onChange(normalized);
    } else if (tokensChanged) {
      const normalizedRows = rows.map(row => ({
        ...row,
        token: tokens.find(t => t.value === row.token) ? row.token : (tokens[0]?.value || ''),
      }));
      const normalized = rowsToCompoundPredicate(normalizedRows);
      setRows(prev => sameConditionRows(prev, normalizedRows) ? prev : normalizedRows);
      if (normalized && JSON.stringify(externalValue) !== JSON.stringify(normalized)) {
        onChange(normalized);
      }
    }

    lastPropValue.current = externalValue;
    lastTokenSignature.current = tokenSignature;
  }, [value, tokenSignature, tokens, rows, onChange]);

  // Sync rows → condition string whenever rows change
  const updateRows = (newRows) => {
    setRows(newRows);
    onChange(rowsToCompoundPredicate(newRows));
  };

  const addRow = () => {
    const defaultToken = tokens[0]?.value||'';
    const defaultType = tokens[0]?.valueType||'number';
    const defaultOperator = defaultType === 'number' ? '>' : getOperatorsForType(defaultType)[0];
    updateRows([...rows, {
      id:'r'+Date.now(), token:defaultToken,
      operator:defaultOperator, value:defaultConditionValueForType(defaultType), join:'AND',
    }]);
  };

  const removeRow = (idx) => updateRows(rows.filter((_,i)=>i!==idx));

  const updRow = (idx, patch) => {
    const n = [...rows];
    const selectedToken = tokens.find(t=>t.value===patch.token) || tokens.find(t=>t.value===n[idx].token);
    const newType = selectedToken?.valueType || 'number';
    const allowedOps = getOperatorsForType(newType);

    // If changing token and operator isn't valid for new type, reset to first valid operator
    if(patch.token && !allowedOps.includes(n[idx].operator)) {
      patch.operator = allowedOps[0];
    }
    if(patch.token && (n[idx].value === '' || n[idx].value == null)) {
      patch.value = defaultConditionValueForType(newType);
    }

    n[idx] = {...n[idx], ...patch};
    updateRows(n);
  };

  const sel = (extra={}) => ({
    background:C.bg, border:`1px solid ${C.cEvent}55`, borderRadius:4,
    color:C.cEvent, fontFamily:FONT, fontSize:12,
    padding:'6px 8px', outline:'none', ...extra,
  });

  if(tokens.length===0) return (
    <div style={{fontSize:11,color:C.muted,fontFamily:FONT,fontStyle:'italic',padding:'6px 0'}}>
      Define entity types and model data first — they appear here as condition options.
    </div>
  );

  return (
    <div style={{display:'flex',flexDirection:'column',gap:8}}>
      {rows.length===0 && (
        <div style={{fontSize:11,color:C.muted,fontFamily:FONT,fontStyle:'italic'}}>
          No conditions yet — tap + Add Clause to build a condition.
        </div>
      )}
      {rows.map((row,idx)=>{
        const selectedToken = tokens.find(t=>t.value===row.token);
        const valueType = selectedToken?.valueType || 'number';
        const allowedOps = getOperatorsForType(valueType);

        return (
        <div key={row.id} style={{display:'flex',flexDirection:'column',gap:6}}>
          {/* AND/OR join (not shown for first row) */}
          {idx>0&&(
            <div style={{display:'flex',gap:6,paddingLeft:8}}>
              {['AND','OR'].map(j=>(
                <button key={j} onClick={()=>updRow(idx,{join:j})} style={{
                  background: row.join===j ? C.cEvent+'33' : 'transparent',
                  border:`1px solid ${row.join===j ? C.cEvent : C.border}`,
                  borderRadius:4, color:row.join===j?C.cEvent:C.muted,
                  fontFamily:FONT, fontSize:11, fontWeight:700,
                  padding:'3px 12px', cursor:'pointer',
                }}>{j}</button>
              ))}
            </div>
          )}
          {/* Clause row: token + operator + value + remove */}
          <div style={{display:'flex',gap:6,alignItems:'center',flexWrap:'wrap',
            background:C.bg,border:`1px solid ${C.cEvent}22`,
            borderRadius:6,padding:'8px 10px'}}>
            {/* Token dropdown */}
            <select value={row.token} onChange={e=>updRow(idx,{token:e.target.value})}
              style={{...sel(),flex:2,minWidth:180}}>
              {tokens.map(t=>(
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
            {/* Operator dropdown — filtered by valueType */}
            <select value={row.operator} onChange={e=>updRow(idx,{operator:e.target.value})}
              style={{...sel(),width:60}}>
              {allowedOps.map(op=><option key={op} value={op}>{op}</option>)}
            </select>
            {/* Value input — widget depends on valueType */}
            {valueType==='number' && (
              <input type="number" value={row.value}
                onChange={e=>updRow(idx,{value:e.target.value})}
                placeholder="0"
                style={{width:60,background:'transparent',border:`1px solid ${C.border}`,
                  borderRadius:4,color:C.amber,fontFamily:FONT,fontSize:12,
                  padding:'5px 8px',outline:'none'}}/>
            )}
            {valueType==='string' && (
              <input type="text" value={row.value}
                onChange={e=>updRow(idx,{value:e.target.value})}
                placeholder="value"
                style={{width:100,background:'transparent',border:`1px solid ${C.border}`,
                  borderRadius:4,color:C.amber,fontFamily:FONT,fontSize:12,
                  padding:'5px 8px',outline:'none'}}/>
            )}
            {valueType==='boolean' && (
              <select value={row.value} onChange={e=>updRow(idx,{value:e.target.value})}
                style={{width:80,background:C.bg,border:`1px solid ${C.border}`,
                  borderRadius:4,color:C.amber,fontFamily:FONT,fontSize:12,
                  padding:'5px 8px',outline:'none'}}>
                <option value="true">true</option>
                <option value="false">false</option>
              </select>
            )}
            {/* Remove */}
            <Btn small variant="danger" ariaLabel={`Remove condition clause ${idx + 1}`} onClick={()=>removeRow(idx)}>✕</Btn>
          </div>
        </div>
      );
      })}
      {/* Add clause */}
      <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>
        <Btn small variant="ghost" onClick={addRow}>+ Add Clause</Btn>
      </div>
    </div>
  );
};

const buildConditionStr = buildConditionString;

export { buildConditionStr, defaultConditionValueForType, rowsToCompoundPredicate, parseConditionStr, sameConditionRows, ConditionBuilder };
