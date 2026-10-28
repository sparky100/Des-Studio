// ui/editors/BackingTargetPicker.jsx — choose an element, and optionally one
// parameter inside it, as the target of a backing link. Units come from
// buildBackableUnits, so the choices always match what the engine can back.

import { backingTargetPlural } from "../../engine/backing-links.js";
import { useTheme } from "../shared/ThemeContext.jsx";

const SANS = "Inter,'Segoe UI',Arial,sans-serif";

/** Key for an element unit: "targetType|targetId". */
export const elementKey = u => `${u.targetType}|${u.targetId}`;

/**
 * @param {{ units: any[], value: { targetType: string, targetId: string, targetPath?: string } | null, onChange: (target: any) => void, disabled?: boolean }} props
 */
export function BackingTargetPicker({ units, value, onChange, disabled = false }) {
  const { C, FONT } = useTheme();
  const elements = units.filter(u => u.kind === "element");
  const current = value ? `${value.targetType}|${value.targetId}` : "";
  const params = value ? units.filter(u => u.kind === "parameter" && elementKey(u) === current) : [];

  // Group elements by type, in the order the units list them.
  const groups = new Map();
  for (const el of elements) {
    const key = el.targetType;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(el);
  }

  const select = {
    background: "transparent", border: `1px solid ${C.border}`, borderRadius: 4,
    color: C.text, fontFamily: FONT, fontSize: 12, padding: "5px 8px", maxWidth: "100%",
  };

  const pickElement = (key) => {
    if (!key) return onChange(null);
    const [targetType, targetId] = key.split("|");
    onChange({ targetType, targetId });
  };

  const pickParam = (path) => {
    if (!value) return;
    onChange({ targetType: value.targetType, targetId: value.targetId, ...(path ? { targetPath: path } : {}) });
  };

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
      <select
        aria-label="Element"
        value={current}
        disabled={disabled}
        onChange={e => pickElement(e.target.value)}
        style={{ ...select, minWidth: 200 }}
      >
        <option value="">Choose an element…</option>
        {[...groups.entries()].map(([type, els]) => (
          <optgroup key={type} label={backingTargetPlural(type)}>
            {els.map(el => <option key={elementKey(el)} value={elementKey(el)}>{el.label}</option>)}
          </optgroup>
        ))}
      </select>
      {value && params.length > 0 && (
        <select
          aria-label="Parameter"
          value={value.targetPath || ""}
          disabled={disabled}
          onChange={e => pickParam(e.target.value)}
          style={{ ...select, minWidth: 200 }}
        >
          <option value="">Whole element</option>
          {params.map(p => <option key={p.targetPath} value={p.targetPath}>{p.paramLabel}</option>)}
        </select>
      )}
      {value && <span style={{ fontSize: 11, color: C.muted, fontFamily: SANS }}>{value.targetPath ? "one parameter" : "element and all its parameters"}</span>}
    </div>
  );
}
