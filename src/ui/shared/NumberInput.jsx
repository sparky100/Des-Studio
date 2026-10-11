// ui/shared/NumberInput.jsx — a number field that never rewrites what the user
// is typing.
//
// The common pattern `value={n} onChange={e => set(parseInt(e.target.value) || 1)}`
// replaces the field mid-edit: clearing it to type "5" puts the fallback back
// ("15"), a clamp (Math.max(5, …)) turns "2" of "20" into 5, and a fallback of
// 0.3 makes 0 impossible to enter. PRs #553/#556 fixed this field by field with
// local draft strings; this is the shared version.
//
// While focused, the field shows the typed text. A value is reported
// (onValueChange) only when the text parses to a finite number within
// [min, max]. On blur the text is settled: out-of-range values are clamped,
// an empty or invalid field takes `fallback` if given, otherwise it reverts to
// the last value.

import { useState } from "react";

/**
 * @param {{
 *   value: number | string | null | undefined,
 *   onValueChange: (value: number) => void,
 *   integer?: boolean,
 *   min?: number,
 *   max?: number,
 *   fallback?: number,
 *   [prop: string]: any,
 * }} props  other props (aria-label, style, step, placeholder, disabled …) go to the <input>
 */
export function NumberInput({ value, onValueChange, integer = false, min, max, fallback, onBlur, onFocus, ...inputProps }) {
  const [draft, setDraft] = useState(/** @type {string|null} */ (null));

  const parse = (/** @type {string} */ text) => {
    if (String(text).trim() === "") return null;
    const n = integer ? parseInt(text, 10) : parseFloat(text);
    return Number.isFinite(n) ? n : null;
  };
  const inRange = (/** @type {number} */ n) => (min == null || n >= min) && (max == null || n <= max);
  const clamp = (/** @type {number} */ n) => Math.min(max ?? Infinity, Math.max(min ?? -Infinity, n));

  const shown = draft ?? (value == null || (typeof value === "number" && Number.isNaN(value)) ? "" : String(value));

  return (
    <input
      type="number"
      min={min}
      max={max}
      step={integer ? 1 : inputProps.step}
      {...inputProps}
      value={shown}
      onFocus={e => { setDraft(shown); onFocus?.(e); }}
      onChange={e => {
        const text = e.target.value;
        setDraft(text);
        const n = parse(text);
        if (n != null && inRange(n)) onValueChange(n);
      }}
      onBlur={e => {
        if (draft != null) {
          const n = parse(draft);
          if (n != null) {
            const settled = clamp(n);
            if (settled !== Number(value)) onValueChange(settled);
          } else if (fallback !== undefined && fallback !== Number(value)) {
            onValueChange(fallback);
          }
        }
        setDraft(null);
        onBlur?.(e);
      }}
    />
  );
}
