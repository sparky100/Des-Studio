// A side panel docked beside a canvas: it takes its width from the row
// instead of floating over the page, slides open and closed by animating
// that width, and has a resize handle on its left edge. Used by the Draw
// inspector and the Run inspector so the two behave the same way.
//
// `overlay` is for narrow screens, where docking would squeeze the canvas
// to nothing: the panel then sits over the canvas's right edge, inside the
// row (the row must be `position: relative`), never over the page header.
import { useState } from "react";
import { useTheme } from "./ThemeContext.jsx";
import { ResizeHandle } from "./ResizeHandle.jsx";

/**
 * @param {{
 *   open: boolean,
 *   size: { width: number, setWidth: Function, reset: () => void, min: number, max: number },
 *   resizeLabel: string,
 *   overlay?: boolean,
 *   children: import("react").ReactNode,
 * }} props
 */
export function DockedSidePanel({ open, size, resizeLabel, overlay = false, children }) {
  const { C } = useTheme();
  const [dragging, setDragging] = useState(false);

  if (overlay) {
    if (!open) return null;
    return (
      <div style={{
        position: "absolute", top: 0, right: 0, bottom: 0, zIndex: 5,
        width: `min(${size.width}px, 100%)`,
        borderLeft: `1px solid ${C.border}`,
        background: C.panel,
        display: "flex", flexDirection: "column",
      }}>
        {children}
      </div>
    );
  }

  return (
    <div style={{
      flexShrink: 0,
      position: "relative",
      width: open ? size.width : 0,
      transition: dragging ? "none" : "width 220ms cubic-bezier(0.4,0,0.2,1)",
      overflow: "hidden",
    }}>
      {open && (
        <div style={{ position: "absolute", left: 4, top: 0, bottom: 0 }}>
          <ResizeHandle {...size} label={resizeLabel} onDragChange={setDragging} />
        </div>
      )}
      {/* Fixed inner width prevents content reflow during the slide animation */}
      <div style={{ width: size.width, borderLeft: `1px solid ${C.border}`, height: "100%", display: "flex", flexDirection: "column" }}>
        {children}
      </div>
    </div>
  );
}
