import { useState, useEffect, useRef } from "react";
;
import { Btn } from "../shared/components.jsx";
import { useTheme } from "../shared/ThemeContext.jsx";

const _parseFilterValue = (s) => {
  if (s === 'true') return true;
  if (s === 'false') return false;
  const n = Number(s);
  return s !== '' && !isNaN(n) ? n : s;
};

const _predicateToFilterRows = (pred) => {
  if (!pred) return [];
  if (pred.operator === 'AND' || pred.operator === 'OR') {
    const join = pred.operator;
    return (pred.clauses || []).map((c, idx) => ({
      id: 'ef' + idx,
      variable: c.variable || '',
      operator: c.operator || '==',
      value: String(c.value ?? ''),
      join: idx === 0 ? 'AND' : join,
    }));
  }
  return [{ id: 'ef0', variable: pred.variable || '', operator: pred.operator || '==', value: String(pred.value ?? ''), join: 'AND' }];
};

const _rowsToFilterPredicate = (rows) => {
  if (!rows || rows.length === 0) return null;
  if (rows.length === 1) {
    const r = rows[0];
    return { variable: r.variable, operator: r.operator, value: _parseFilterValue(r.value) };
  }
  const join = rows[1]?.join || 'AND';
  return {
    operator: join,
    clauses: rows.map(r => ({ variable: r.variable, operator: r.operator, value: _parseFilterValue(r.value) })),
  };
};

const _getFilterOps = (valueType) => {
  if (valueType === 'boolean' || valueType === 'string') return ['==', '!='];
  return ['==', '!=', '<', '>', '<=', '>='];
};

const EntityFilterBuilder = ({ entityTypes = [], value, onChange }) => {
  const { C, FONT } = useTheme();
  const tokens = (entityTypes || [])
    .filter(e => e.role === 'customer')
    .flatMap(e => (e.attrDefs || [])
      .filter(a => a.name)
      .map(a => ({
        label:     `Entity.${a.name}`,
        variable:  `Entity.${a.name}`,
        valueType: a.valueType || 'number',
      }))
    );

  const [rows, setRows] = useState(() => _predicateToFilterRows(value));
  const prevValueRef = useRef(value);
  useEffect(() => {
    if (prevValueRef.current !== value) {
      prevValueRef.current = value;
      setRows(_predicateToFilterRows(value));
    }
  }, [value]);

  const updateRows = (newRows) => {
    setRows(newRows);
    onChange(_rowsToFilterPredicate(newRows));
  };

  const addRow = () => {
    const defVar  = tokens[0]?.variable || '';
    const defType = tokens[0]?.valueType || 'number';
    updateRows([...rows, { id: 'ef' + Date.now(), variable: defVar, operator: _getFilterOps(defType)[0], value: '', join: 'AND' }]);
  };

  const removeRow = (idx) => updateRows(rows.filter((_, i) => i !== idx));

  const updRow = (idx, patch) => {
    const n = [...rows];
    if (patch.variable) {
      const tok  = tokens.find(t => t.variable === patch.variable);
      const ops  = _getFilterOps(tok?.valueType || 'number');
      if (!ops.includes(n[idx].operator)) patch.operator = ops[0];
    }
    n[idx] = { ...n[idx], ...patch };
    updateRows(n);
  };

  const selSt = (extra = {}) => ({
    background: C.bg, border: `1px solid ${C.cEvent}55`, borderRadius: 4,
    color: C.cEvent, fontFamily: FONT, fontSize: 12, padding: '5px 8px', outline: 'none',
    ...extra,
  });

  if (tokens.length === 0) {
    if (value) {
      return (
        <div style={{ fontSize: 11, color: C.amber, fontFamily: FONT, background: C.surface, borderRadius: 4, padding: '6px 10px' }}>
          Cannot display condition — no customer entity attributes defined. Raw: <code style={{ color: C.text }}>{JSON.stringify(value)}</code>
        </div>
      );
    }
    return (
      <div style={{ fontSize: 11, color: C.muted, fontFamily: FONT, fontStyle: 'italic' }}>
        Define customer entity types with attributes to enable entity filtering.
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {rows.length === 0 && value && (
        <div style={{ fontSize: 11, color: C.amber, fontFamily: FONT, background: C.surface, borderRadius: 4, padding: '6px 10px' }}>
          Could not parse condition. Raw: <code style={{ color: C.text }}>{JSON.stringify(value)}</code>
        </div>
      )}
      {rows.length === 0 && !value && (
        <div style={{ fontSize: 11, color: C.muted, fontFamily: FONT, fontStyle: 'italic' }}>
          No filter — all entities in queue are eligible. Add a clause to restrict.
        </div>
      )}
      {rows.map((row, idx) => {
        const tok  = tokens.find(t => t.variable === row.variable) || tokens[0];
        const ops  = _getFilterOps(tok?.valueType || 'number');
        const vt   = tok?.valueType || 'number';
        return (
          <div key={row.id} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {idx > 0 && (
              <div style={{ display: 'flex', gap: 6, paddingLeft: 8 }}>
                {['AND', 'OR'].map(j => (
                  <button key={j} onClick={() => updRow(idx, { join: j })} style={{
                    background: row.join === j ? C.cEvent + '33' : 'transparent',
                    border: `1px solid ${row.join === j ? C.cEvent : C.border}`,
                    borderRadius: 4, color: row.join === j ? C.cEvent : C.muted,
                    fontFamily: FONT, fontSize: 11, fontWeight: 700,
                    padding: '3px 12px', cursor: 'pointer',
                  }}>{j}</button>
                ))}
              </div>
            )}
            <div style={{
              display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap',
              background: C.bg, border: `1px solid ${C.cEvent}22`,
              borderRadius: 6, padding: '8px 10px',
            }}>
              <select value={row.variable} onChange={e => updRow(idx, { variable: e.target.value })}
                style={{ ...selSt(), flex: 2, minWidth: 160 }}
                aria-label="Entity attribute">
                {tokens.map(t => (
                  <option key={t.variable} value={t.variable}>{t.label}</option>
                ))}
              </select>
              <select value={row.operator} onChange={e => updRow(idx, { operator: e.target.value })}
                style={{ ...selSt(), width: 60 }}
                aria-label="Operator">
                {ops.map(op => <option key={op} value={op}>{op}</option>)}
              </select>
              {vt === 'boolean' ? (
                <select value={row.value} onChange={e => updRow(idx, { value: e.target.value })}
                  style={{ ...selSt({ color: C.amber }), width: 80 }}>
                  <option value="true">true</option>
                  <option value="false">false</option>
                </select>
              ) : vt === 'string' ? (
                <input type="text" value={row.value} onChange={e => updRow(idx, { value: e.target.value })}
                  placeholder="value"
                  style={{ width: 100, background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 4, color: C.amber, fontFamily: FONT, fontSize: 12, padding: '5px 8px', outline: 'none' }}/>
              ) : (
                <input type="number" value={row.value} onChange={e => updRow(idx, { value: e.target.value })}
                  placeholder="0"
                  style={{ width: 70, background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 4, color: C.amber, fontFamily: FONT, fontSize: 12, padding: '5px 8px', outline: 'none' }}/>
              )}
              <Btn small variant="danger" ariaLabel={`Remove entity filter clause ${idx + 1}`} onClick={() => removeRow(idx)}>✕</Btn>
            </div>
          </div>
        );
      })}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <Btn small variant="ghost" onClick={addRow}>+ Add Filter Clause</Btn>
        {rows.length > 0 && (
          <Btn small variant="ghost" onClick={() => { setRows([]); onChange(null); }}>Clear Filter</Btn>
        )}
        {rows.length > 0 && (
          <div style={{ fontSize: 10, color: C.muted, fontFamily: FONT, background: C.surface, borderRadius: 4, padding: '4px 10px', flex: 1 }}>
            <span style={{ color: C.cEvent }}>{rows.map((r, i) => (i > 0 ? ` ${r.join} ` : '') + `${r.variable} ${r.operator} ${r.value || '?'}`).join('')}</span>
          </div>
        )}
      </div>
    </div>
  );
};

export { _parseFilterValue, _predicateToFilterRows, _rowsToFilterPredicate, _getFilterOps, EntityFilterBuilder };
