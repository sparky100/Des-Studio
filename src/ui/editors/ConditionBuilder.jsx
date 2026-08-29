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

// A state variable's condition token may be stored with the documented `state.<name>`
// prefix (docs/model-schema-for-llm.md) or as a bare name — both are valid, independently
// engine-evaluable forms (src/engine/conditions.js resolveVariable handles both) — so a
// stored `state.repairsInProgress` must still match the dropdown's bare-name
// `repairsInProgress` entry rather than being treated as unrecognized.
const findMatchingToken = (rawToken, tokens) => {
  const bare = String(rawToken || '').replace(/^state\./, '');
  return tokens.find(token => token.value === rawToken) || tokens.find(token => token.value === bare);
};

const parseConditionStr = (value, tokens) => {
  const baseRows = predicateToRows(value);
  return baseRows.map(row => {
    const knownToken = findMatchingToken(row.token, tokens);
    return {
      ...row,
      id: row.id || `r${crypto.randomUUID()}`,
      // Matched (possibly via the state.<name>/bare-name equivalence above): normalize
      // to the dropdown's own recognized form so the rendered <select> actually
      // highlights it — row.token alone (the old behavior) only worked when the match
      // was already an exact string match. Genuinely unmatched (e.g. a queue that was
      // renamed/deleted since the condition was saved) still falls back to tokens[0] —
      // an intentional, tested recovery (C8) for stale references with no real match at
      // all, distinct from the state.<name> case fixed above, which now has one.
      token: knownToken ? knownToken.value : (tokens[0]?.value || ''),
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

const ConditionBuilder = ({value, onChange, entityTypes=[], stateVariables=[], queues=[], containers=[]}) => {
  const { C, FONT } = useTheme();
  // useMemo ensures dropdown rebuilds whenever entityTypes, stateVariables, queues, or containers change (C8 fix)
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
      { label:'Is weekday — true Mon-Fri (requires epoch)', value:'isWeekday', valueType:'boolean' },
      { label:'Is weekend — true Sat-Sun (requires epoch)', value:'isWeekend', valueType:'boolean' },
      { label:'Hour of day — 0-23 (requires epoch)', value:'hourOfDay', valueType:'number' },
      { label:'Day of week — 0=Sun, 1=Mon, ..., 6=Sat (requires epoch)', value:'dayOfWeek', valueType:'number' },
    ];
    const stateVarTokens = (stateVariables||[]).filter(sv=>sv.name).map(sv=>({
      label: `${sv.name} — ${sv.description||'state variable'}`,
      value: sv.name,
      valueType: 'number',
    }));
    // Container tokens — "Tank — current level", "Tank — capacity"
    const containerTokens = (containers||[]).filter(ct=>ct.id).flatMap(ct=>([
      { label: `${ct.id} — current level`, value: `container(${ct.id}).level`, valueType: 'number' },
      { label: `${ct.id} — capacity`,      value: `container(${ct.id}).capacity`, valueType: 'number' },
    ]));
    return [...queueTokens, ...entityTypeTokens, ...serverTokens, ...builtInTokens, ...stateVarTokens, ...containerTokens];
  }, [entityTypes, stateVariables, queues, containers]);

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
  // A sentinel (never `===` to any real prop value, including '') so the
  // very first effect run always takes the `externalChanged` branch below —
  // that branch is the one that can tell a real repair apart from harmless
  // reshaping (see comment below), which matters because mount is exactly
  // when a persisted condition most needs that check.
  const lastPropValue = useRef();
  if (lastPropValue.current === undefined) lastPropValue.current = Symbol('unset');
  const lastTokenSignature = useRef(null);

  // Keep local rows aligned with the canonical condition string and token list.
  // If an old persisted token no longer exists, the visible fallback is written
  // back through onChange so validation and the editor do not diverge.
  //
  // `predicateToRows`/`rowsToPredicate` can only represent a flat, single-level
  // condition — a genuinely nested one (e.g. `(A AND B) OR C`, which the engine
  // fully supports) always comes back reshaped after a round-trip even when
  // nothing needs repairing. Comparing the raw incoming value (or a
  // previously-repaired `rows`) against that rebuild would treat every render
  // of an already-nested condition as an edit and write the flattened version
  // back — including right after a Discard, which restores the same nested
  // value and re-triggers the same "edit", trapping the user in an
  // unbreakable unsaved-changes loop. So both branches below gate `onChange`
  // on whether parsing actually repaired a row (stale token / invalid
  // operator / missing value) — the one thing this effect is meant to fix —
  // never on whether the round-trip preserved nesting.
  useEffect(() => {
    const externalValue = value || '';
    const externalChanged = externalValue !== lastPropValue.current;
    const tokensChanged = tokenSignature !== lastTokenSignature.current;

    if (externalChanged) {
      // Compare against a fully unrepaired parse of the incoming value (not
      // against `rows`, which may already be repaired — e.g. right at mount,
      // where `rows`'s own initializer already ran this same repair once).
      const rawRows = predicateToRows(externalValue);
      const parsed = parseConditionStr(externalValue, tokens);
      setRows(prev => sameConditionRows(prev, parsed) ? prev : parsed);
      // The state.<name> ↔ <name> dialect equivalence (see findMatchingToken
      // above) is intentional recognition, not a repair worth writing back —
      // compare against each raw row's bare token so only a genuine repair
      // (an unrecognized/stale token falling back to tokens[0], an invalid
      // operator, or a defaulted value) trips onChange here.
      const bareRawRows = rawRows.map(row => ({ ...row, token: row.token.replace(/^state\./i, "") }));
      const leavesRepaired = !sameConditionRows(bareRawRows, parsed);
      if (leavesRepaired) {
        const normalized = rowsToCompoundPredicate(parsed);
        if (normalized) onChange(normalized);
      }
    } else if (tokensChanged) {
      // The value itself hasn't changed — only the token list has (e.g. an
      // unrelated entity-type edit) — so patch the *currently displayed*
      // rows (which may include a local edit not yet round-tripped through
      // the parent) rather than re-deriving from the external value.
      const normalizedRows = rows.map(row => {
        const knownToken = findMatchingToken(row.token, tokens);
        return { ...row, token: knownToken ? knownToken.value : (tokens[0]?.value || '') };
      });
      const rowsRepaired = !sameConditionRows(rows, normalizedRows);
      setRows(prev => rowsRepaired ? normalizedRows : prev);
      if (rowsRepaired) {
        const normalized = rowsToCompoundPredicate(normalizedRows);
        if (normalized) onChange(normalized);
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
    padding:'6px 8px', ...extra,
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
            {/* Value input — widget depends on valueType. Number-type rows can compare
                against either a literal or another dynamic token (e.g. queue(A).length <
                queue(B).length for shortest-queue routing) — see conditions.js RHS resolution. */}
            {valueType==='number' && (() => {
              const numberTokens = tokens.filter(t => t.valueType === 'number');
              const isDynamic = numberTokens.some(t => t.value === row.value);
              return (
                <>
                  {numberTokens.length > 0 && (
                    <select value={isDynamic ? '__dynamic__' : '__literal__'}
                      onChange={e => updRow(idx, { value: e.target.value === '__dynamic__' ? (numberTokens[0]?.value || '0') : '0' })}
                      style={{...sel(), width:75}}>
                      <option value="__literal__">Number</option>
                      <option value="__dynamic__">Dynamic</option>
                    </select>
                  )}
                  {isDynamic ? (
                    <select value={row.value} onChange={e=>updRow(idx,{value:e.target.value})}
                      style={{...sel(), flex:1, minWidth:160}}>
                      {numberTokens.map(t=><option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                  ) : (
                    <input type="number" value={row.value}
                      onChange={e=>updRow(idx,{value:e.target.value})}
                      placeholder="0"
                      style={{width:60,background:'transparent',border:`1px solid ${C.border}`,
                        borderRadius:4,color:C.amber,fontFamily:FONT,fontSize:12,
                        padding:'5px 8px'}}/>
                  )}
                </>
              );
            })()}
            {valueType==='string' && (
              <input type="text" value={row.value}
                onChange={e=>updRow(idx,{value:e.target.value})}
                placeholder="value"
                style={{width:100,background:'transparent',border:`1px solid ${C.border}`,
                  borderRadius:4,color:C.amber,fontFamily:FONT,fontSize:12,
                  padding:'5px 8px'}}/>
            )}
            {valueType==='boolean' && (
              <select value={row.value} onChange={e=>updRow(idx,{value:e.target.value})}
                style={{width:80,background:C.bg,border:`1px solid ${C.border}`,
                  borderRadius:4,color:C.amber,fontFamily:FONT,fontSize:12,
                  padding:'5px 8px'}}>
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
