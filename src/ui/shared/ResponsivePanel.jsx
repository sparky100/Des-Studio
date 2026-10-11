// ui/shared/ResponsivePanel.jsx — a panel opened from a button: an anchored
// popover on wide screens, a bottom sheet on phones.
//
// Popovers used to be `position: absolute` next to their button (e.g. right: 0).
// On a phone the toolbar wraps, the button lands near the left edge, and a
// right-anchored 360px panel ran off the left of the screen. This component
// renders into document.body (so no ancestor can clip it) and:
//   - at or below SHEET_BREAKPOINT px wide, or SHEET_HEIGHT_BREAKPOINT px tall
//     (a phone in landscape): a bottom sheet — full width, up to
//     85% of the viewport tall, a pinned header with the title and Done, its
//     own scrolling body, a backdrop, safe-area padding, and it sits above the
//     on-screen keyboard (window.visualViewport);
//   - wider: a popover below the button (above it when there is more room
//     there), shifted so it stays 8px inside the viewport, width capped at
//     min(width, 100vw − 16px).

import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useTheme } from "./ThemeContext.jsx";
import { SHADOW } from "./tokens.js";

export const SHEET_BREAKPOINT = 640;
// A phone held sideways is 740–930px wide but only ~360–430px tall; with the
// keyboard up an anchored popover there has almost no room.
export const SHEET_HEIGHT_BREAKPOINT = 480;
const VIEWPORT_MARGIN = 8;
const ANCHOR_GAP = 6;
const MIN_COMFORTABLE_HEIGHT = 240;

/**
 * Where an anchored popover goes. Pure, for testing.
 * @param {{ left: number, right: number, top: number, bottom: number }} anchor  anchor's client rect
 * @param {{ width: number, height: number }} viewport
 * @param {{ width: number, align?: "start"|"end" }} options  preferred width; align the panel's left ("start") or right ("end") edge with the anchor's
 * @returns {{ left: number, width: number, maxHeight: number, top?: number, bottom?: number, placement: "below"|"above" }}
 */
export function computePopoverPosition(anchor, viewport, { width, align = "end" }) {
  const w = Math.max(0, Math.min(width, viewport.width - 2 * VIEWPORT_MARGIN));
  const preferredLeft = align === "end" ? anchor.right - w : anchor.left;
  const left = Math.min(Math.max(preferredLeft, VIEWPORT_MARGIN), viewport.width - VIEWPORT_MARGIN - w);
  const spaceBelow = viewport.height - anchor.bottom - ANCHOR_GAP - VIEWPORT_MARGIN;
  const spaceAbove = anchor.top - ANCHOR_GAP - VIEWPORT_MARGIN;
  if (spaceBelow < MIN_COMFORTABLE_HEIGHT && spaceAbove > spaceBelow) {
    return { left, width: w, bottom: viewport.height - anchor.top + ANCHOR_GAP, maxHeight: Math.max(0, spaceAbove), placement: "above" };
  }
  return { left, width: w, top: anchor.bottom + ANCHOR_GAP, maxHeight: Math.max(0, spaceBelow), placement: "below" };
}

/** True while the viewport is at most SHEET_BREAKPOINT px wide or SHEET_HEIGHT_BREAKPOINT px tall. */
export function useIsSheetViewport() {
  const query = `(max-width: ${SHEET_BREAKPOINT}px), (max-height: ${SHEET_HEIGHT_BREAKPOINT}px)`;
  const read = () => (typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia(query).matches
    : false);
  const [isSheet, setIsSheet] = useState(read);
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return undefined;
    const mql = window.matchMedia(query);
    const onChange = () => setIsSheet(mql.matches);
    onChange();
    mql.addEventListener?.("change", onChange);
    return () => mql.removeEventListener?.("change", onChange);
  }, [query]);
  return isSheet;
}

// The part of the layout viewport the on-screen keyboard covers, and the
// visible height — so a bottom sheet can sit on top of the keyboard. Android
// Chrome and iOS Safari overlay the keyboard on the layout viewport rather
// than resizing it, which leaves `bottom: 0` hidden behind the keys.
function useVisualViewportInsets() {
  const read = () => {
    if (typeof window === "undefined") return { bottomInset: 0, visibleHeight: null };
    const vv = window.visualViewport;
    if (!vv) return { bottomInset: 0, visibleHeight: window.innerHeight };
    return {
      bottomInset: Math.max(0, Math.round(window.innerHeight - (vv.height + vv.offsetTop))),
      visibleHeight: vv.height,
    };
  };
  const [insets, setInsets] = useState(read);
  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const vv = window.visualViewport;
    const update = () => setInsets(read());
    vv?.addEventListener("resize", update);
    vv?.addEventListener("scroll", update);
    window.addEventListener("resize", update);
    return () => {
      vv?.removeEventListener("resize", update);
      vv?.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);
  return insets;
}

/**
 * @param {{
 *   open: boolean,
 *   onClose: () => void,
 *   anchorRef: { current: HTMLElement|null },
 *   title: string,
 *   children: any,
 *   footer?: any,
 *   width?: number,
 *   align?: "start"|"end",
 *   showHeaderOnPopover?: boolean,
 *   testId?: string,
 * }} props
 */
export function ResponsivePanel({ open, onClose, anchorRef, title, children, footer = null, width = 420, align = "end", showHeaderOnPopover = false, testId }) {
  const { C, FONT } = useTheme();
  const isSheet = useIsSheetViewport();
  const { bottomInset, visibleHeight } = useVisualViewportInsets();
  const [pos, setPos] = useState(/** @type {ReturnType<typeof computePopoverPosition>|null} */ (null));

  const place = useCallback(() => {
    const el = anchorRef?.current;
    if (!el || typeof window === "undefined") return;
    const r = el.getBoundingClientRect();
    setPos(computePopoverPosition(
      { left: r.left, right: r.right, top: r.top, bottom: r.bottom },
      { width: document.documentElement.clientWidth || window.innerWidth, height: window.innerHeight },
      { width, align },
    ));
  }, [anchorRef, width, align]);

  useLayoutEffect(() => {
    if (!open || isSheet) return undefined;
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, isSheet, place]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (/** @type {KeyboardEvent} */ e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  // Landscape phone with the keyboard up: ~150px to work with, so a slimmer header.
  const compact = isSheet && (visibleHeight ?? window.innerHeight) < 260;
  const header = (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
      padding: isSheet ? (compact ? "4px 16px" : "12px 16px 10px") : "0 0 4px", borderBottom: isSheet ? `1px solid ${C.border}` : "none",
      flexShrink: 0,
    }}>
      <span style={{ fontSize: isSheet ? 14 : 12, fontWeight: 700, color: C.text, fontFamily: FONT }}>{title}</span>
      <button type="button" onClick={onClose}
        style={{
          background: isSheet ? C.accent : "none", color: isSheet ? "#fff" : C.muted,
          border: isSheet ? "none" : `1px solid ${C.border}`, borderRadius: 6,
          padding: isSheet ? (compact ? "4px 14px" : "8px 14px") : "2px 8px", minHeight: isSheet ? (compact ? 30 : 36) : undefined,
          fontSize: isSheet ? 13 : 11, fontWeight: 700, fontFamily: FONT, cursor: "pointer",
        }}>
        Done
      </button>
    </div>
  );

  if (isSheet) {
    const visible = visibleHeight ?? window.innerHeight;
    return createPortal(
      <>
        <div data-testid={testId ? `${testId}-backdrop` : undefined} onClick={onClose}
          style={{ position: "fixed", inset: 0, zIndex: 300, background: C.overlay }} />
        <div role="dialog" aria-modal="true" aria-label={title} data-testid={testId} data-layout="sheet"
          style={{
            position: "fixed", left: 0, right: 0, bottom: bottomInset, zIndex: 301,
            maxHeight: Math.floor(Math.min(window.innerHeight * 0.85, visible - 8)),
            display: "flex", flexDirection: "column",
            background: C.panel, borderTop: `1px solid ${C.border}`,
            borderRadius: "14px 14px 0 0", boxShadow: SHADOW.overlay,
            // Above the keyboard the home-indicator inset does not apply.
            paddingBottom: bottomInset > 0 ? 0 : "env(safe-area-inset-bottom)",
          }}>
          {header}
          {/* No top padding on the scroller itself, so content that sticks to
              its top (the parameter search) sits flush under the header. */}
          <div data-panel-scroll style={{ overflowY: "auto", overscrollBehavior: "contain", padding: "0 16px 12px", flex: 1, minHeight: 0, WebkitOverflowScrolling: "touch" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, paddingTop: 12 }}>
              {children}
            </div>
          </div>
          {/* While the keyboard is up every pixel goes to the list being
              searched; the footer's actions come back when it closes. */}
          {footer && bottomInset === 0 && (
            <div style={{ padding: "10px 16px", borderTop: `1px solid ${C.border}`, flexShrink: 0 }}>{footer}</div>
          )}
        </div>
      </>,
      document.body,
    );
  }

  return createPortal(
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 300 }} />
      <div role="dialog" aria-label={title} data-testid={testId} data-layout="popover" data-placement={pos?.placement}
        style={{
          position: "fixed", zIndex: 301,
          left: pos?.left ?? VIEWPORT_MARGIN, width: pos?.width ?? width,
          ...(pos?.placement === "above" ? { bottom: pos.bottom } : { top: pos?.top ?? 0 }),
          maxHeight: pos?.maxHeight, visibility: pos ? "visible" : "hidden",
          display: "flex", flexDirection: "column",
          background: C.panel, border: `1px solid ${C.border}`, borderRadius: 8,
          padding: 12, gap: 8, boxShadow: SHADOW.dropdown, boxSizing: "border-box",
        }}>
        {showHeaderOnPopover && header}
        <div data-panel-scroll style={{ overflowY: "auto", display: "flex", flexDirection: "column", gap: 8, minHeight: 0 }}>
          {children}
        </div>
        {footer}
      </div>
    </>,
    document.body,
  );
}
