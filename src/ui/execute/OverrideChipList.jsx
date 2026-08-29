// Moved verbatim out of execute/index.jsx (expert review C-11 tranche).
/** Editable list of {path, value} parameter overrides, with a "+ Add" picker
 * over the full sweepable-param universe. Shared by the saved-experiment
 * New/Edit forms and the Run tab's ad-hoc "Adjust parameters" panel — all
 * three used to carry an identical ~20-line copy of this JSX. */
import { Btn } from "../shared/components.jsx";
import { ParamBrowserPanel, paramColor } from "../shared/ParamBrowserPanel.jsx";
import { alpha, RADIUS } from "../shared/tokens.js";
import { useTheme } from "../shared/ThemeContext.jsx";

export function OverrideChipList({ overrides, setOverrides, sweepParams, pickerOpen, setPickerOpen, extraAlreadyAdded }) {
  const { C, FONT } = useTheme();
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: 10, color: C.label, fontFamily: FONT, letterSpacing: 1.2, fontWeight: 700 }}>PARAMETER OVERRIDES</span>
        <Btn small variant="ghost" onClick={() => setPickerOpen(o => !o)}>{pickerOpen ? "Done" : "+ Add"}</Btn>
      </div>
      {overrides.length > 0 && (
        <div style={{ maxHeight: 220, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
          {overrides.map((ov, idx) => {
            const param = sweepParams.find(p => p.path === ov.path);
            const chipColor = paramColor(param?.type, C);
            return (
              <div key={idx} style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <div style={{ flex: 2, display: "flex", flexDirection: "column", gap: 1, background: alpha(chipColor, 0.09), border: `1px solid ${alpha(chipColor, 0.27)}`, borderRadius: RADIUS.sm, padding: "3px 8px", minWidth: 0 }}>
                  <span style={{ fontSize: 11, color: chipColor, fontFamily: FONT, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{param?.label ?? ov.path}</span>
                  {param?.subLabel && <span style={{ fontSize: 10, color: C.muted, fontFamily: FONT }}>{param.subLabel}</span>}
                </div>
                <input aria-label={`Override value ${idx + 1}`} type="number" value={ov.value} onChange={e => setOverrides(prev => prev.map((o, i) => i === idx ? { ...o, value: e.target.value } : o))} placeholder="value"
                  style={{ width: 80, background: "transparent", border: `1px solid ${C.border}`, borderRadius: RADIUS.sm, color: C.amber, fontFamily: FONT, fontSize: 11, padding: "4px 6px", flexShrink: 0 }} />
                <Btn small variant="ghost" ariaLabel={`Remove override ${idx + 1}`} onClick={() => setOverrides(prev => prev.filter((_, i) => i !== idx))}>×</Btn>
              </div>
            );
          })}
        </div>
      )}
      {pickerOpen && (
        <ParamBrowserPanel params={sweepParams} alreadyAdded={new Set([...overrides.map(o => o.path), ...(extraAlreadyAdded || [])].filter(Boolean))}
          onSelect={path => { const found = sweepParams.find(p => p.path === path); const cv = found?.currentValue; const defaultVal = (cv !== undefined && Number.isFinite(cv)) ? String(cv) : ""; setOverrides(prev => [...prev, { path, value: defaultVal }]); }}
          onClose={() => setPickerOpen(false)} />
      )}
    </div>
  );
}
