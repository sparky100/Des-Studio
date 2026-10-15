// A draggable vertical edge for resizing a side panel (used by the Draw
// inspector). Pointer drag, keyboard (←/→ by 16px, Shift for 64px, Home/End
// to the limits) and double-click to reset. The width is remembered per
// storageKey in localStorage when available.
import { useCallback, useEffect, useRef, useState } from "react";
import { useTheme } from "./ThemeContext.jsx";

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

/**
 * Width state for a resizable side panel.
 * @param {{ storageKey: string, defaultWidth: number, min: number, max: number }} opts
 */
export function useResizableWidth({ storageKey, defaultWidth, min, max }) {
  const [width, setWidthState] = useState(() => {
    try {
      const saved = Number(localStorage.getItem(storageKey));
      if (Number.isFinite(saved) && saved > 0) return clamp(saved, min, max);
    } catch { /* storage unavailable — use the default */ }
    return defaultWidth;
  });
  // Re-clamp when the allowed range changes (e.g. the window got narrower).
  useEffect(() => { setWidthState(w => clamp(w, min, max)); }, [min, max]);
  const setWidth = useCallback((next) => {
    setWidthState(prev => {
      const value = clamp(typeof next === "function" ? next(prev) : next, min, max);
      try { localStorage.setItem(storageKey, String(Math.round(value))); } catch { /* non-critical */ }
      return value;
    });
  }, [storageKey, min, max]);
  const reset = useCallback(() => setWidth(defaultWidth), [setWidth, defaultWidth]);
  return { width, setWidth, reset, min, max };
}

/**
 * The handle sits on the panel's LEFT edge: dragging left widens the panel.
 * @param {{ width: number, setWidth: (w: number | ((w: number) => number)) => void, reset: () => void, min: number, max: number, label: string, onDragChange?: (dragging: boolean) => void }} props
 */
export function ResizeHandle({ width, setWidth, reset, min, max, label, onDragChange }) {
  const { C } = useTheme();
  const [active, setActive] = useState(false);
  const start = useRef(null);

  const onPointerDown = (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    start.current = { x: e.clientX, width };
    setActive(true);
    onDragChange?.(true);
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e) => {
    if (!start.current) return;
    setWidth(start.current.width + (start.current.x - e.clientX));
  };
  const end = (e) => {
    if (!start.current) return;
    start.current = null;
    setActive(false);
    onDragChange?.(false);
    e.currentTarget.releasePointerCapture?.(e.pointerId);
  };
  const onKeyDown = (e) => {
    const step = e.shiftKey ? 64 : 16;
    if (e.key === "ArrowLeft") { e.preventDefault(); setWidth(w => w + step); }
    else if (e.key === "ArrowRight") { e.preventDefault(); setWidth(w => w - step); }
    else if (e.key === "Home") { e.preventDefault(); setWidth(max); }
    else if (e.key === "End") { e.preventDefault(); setWidth(min); }
  };

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuenow={Math.round(width)}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={0}
      title="Drag to resize · double-click to reset"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={end}
      onPointerCancel={end}
      onDoubleClick={reset}
      onKeyDown={onKeyDown}
      style={{
        position: "absolute", left: -4, top: 0, bottom: 0, width: 8, zIndex: 5,
        cursor: "col-resize", touchAction: "none",
        background: active ? `${C.accent}55` : "transparent",
      }}
      onMouseEnter={e => { if (!active) e.currentTarget.style.background = `${C.accent}33`; }}
      onMouseLeave={e => { if (!active) e.currentTarget.style.background = "transparent"; }}
    />
  );
}
