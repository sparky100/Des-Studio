// ui/HeaderAccountMenu.jsx — Collapsed "•••" overflow menu for header support/account actions
//
// Implements the shared HeaderAccountMenu spec (two tiers: Support / Account,
// divider between). Settings/theme is intentionally excluded — it stays on
// its own gear icon in the header, per spec ("this menu is navigation-only,
// not app-state").
//
// Note: the spec assumes a React + Tailwind stack. This codebase uses plain
// inline styles driven by the shared theme tokens (see ./shared/tokens.js,
// ./shared/ThemeContext.jsx), so the spec's styling tokens are reproduced
// here as literal values / theme colors rather than Tailwind classes.
import { useEffect, useRef, useState } from "react";
import { useTheme } from "./shared/ThemeContext.jsx";
import { SPACE, TYPO, Z, SHADOW } from "./shared/tokens.js";

function FeedbackIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function InfoIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="16" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12.01" y2="8" />
    </svg>
  );
}

function HelpIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}

function KeyboardIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="2" y="6" width="20" height="12" rx="2" />
      <line x1="6" y1="10" x2="6" y2="10" />
      <line x1="10" y1="10" x2="10" y2="10" />
      <line x1="14" y1="10" x2="14" y2="10" />
      <line x1="18" y1="10" x2="18" y2="10" />
      <line x1="8" y1="14" x2="16" y2="14" />
    </svg>
  );
}

const MENU_ITEM_HEIGHT = 44; // --menu-item-height
const MENU_RADIUS = 12;      // --menu-radius

/**
 * @param {{
 *   appName: string,
 *   userInitial?: string,
 *   isAdmin: boolean,
 *   onFeedback: () => void,
 *   onAbout: () => void,
 *   onHelp: () => void,
 *   onShortcuts: () => void,
 *   onAdminPanel?: () => void,
 *   onSignOut: () => void,
 * }} props
 */
export function HeaderAccountMenu({
  appName,
  isAdmin,
  onFeedback,
  onAbout,
  onHelp,
  onShortcuts,
  onAdminPanel,
  onSignOut,
}) {
  const { C, FONT } = useTheme();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef(null);
  const menuRef = useRef(null);

  // Click-outside, Escape-to-close, and a simple focus trap while open.
  useEffect(() => {
    if (!open) return;

    const getFocusable = () =>
      Array.from(menuRef.current?.querySelectorAll('button, a[href]') || []);

    const onKeyDown = (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
        triggerRef.current?.focus();
        return;
      }
      if (e.key === "Tab") {
        const focusables = getFocusable();
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    const onPointerDown = (e) => {
      if (menuRef.current?.contains(e.target) || triggerRef.current?.contains(e.target)) return;
      setOpen(false);
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("mousedown", onPointerDown);

    const raf = requestAnimationFrame(() => {
      getFocusable()[0]?.focus();
    });

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("mousedown", onPointerDown);
      cancelAnimationFrame(raf);
    };
  }, [open]);

  const closeThen = (fn) => (...args) => {
    setOpen(false);
    fn?.(...args);
  };

  const supportItemStyle = {
    display: "flex",
    alignItems: "center",
    gap: SPACE.sm,
    width: "100%",
    boxSizing: "border-box",
    minHeight: MENU_ITEM_HEIGHT,
    padding: "10px 16px",
    background: "none",
    border: "none",
    cursor: "pointer",
    color: C.text,
    fontFamily: FONT,
    fontSize: 12,
    textAlign: "left",
  };

  const dividerColor = C.border;

  return (
    <div style={{ position: "relative", display: "inline-flex" }}>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="More options"
        title="More options"
        onClick={() => setOpen((o) => !o)}
        // Sized to match its header siblings (the settings gear's navBtnStyle
        // recipe and the 28px avatar) — it previously stood out at 40x40.
        style={{
          height: 28,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: C.surfaceHover,
          border: `1px solid ${open ? C.accent : C.border}`,
          borderRadius: 5,
          color: open ? C.accent : C.muted,
          cursor: "pointer",
          fontSize: 12,
          fontWeight: 700,
          letterSpacing: 1,
          lineHeight: 1,
          padding: "5px 10px",
          fontFamily: FONT,
        }}
      >
        •••
      </button>

      {open && (
        <div
          ref={menuRef}
          role="menu"
          aria-label="Account menu"
          style={{
            position: "absolute",
            top: "calc(100% + 8px)",
            right: 0,
            minWidth: 240,
            maxWidth: "70vw",
            background: C.panel,
            border: `1px solid ${C.border}`,
            borderRadius: MENU_RADIUS,
            boxShadow: SHADOW.dropdown,
            overflow: "hidden",
            zIndex: Z.dropdown,
          }}
        >
          {/* Support tier */}
          <div style={{ ...TYPO.label, color: C.muted, padding: "10px 16px 4px", fontFamily: FONT }}>
            Support
          </div>
          <button role="menuitem" type="button" style={supportItemStyle} onClick={closeThen(onFeedback)}>
            <FeedbackIcon /> Feedback
          </button>
          <button role="menuitem" type="button" style={supportItemStyle} onClick={closeThen(onAbout)}>
            <InfoIcon /> About {appName}
          </button>
          <button role="menuitem" type="button" style={supportItemStyle} onClick={closeThen(onHelp)}>
            <HelpIcon /> Help
          </button>
          <button role="menuitem" type="button" style={supportItemStyle} onClick={closeThen(onShortcuts)}>
            <KeyboardIcon /> Keyboard shortcuts
          </button>

          {/* Divider */}
          <div style={{ borderTop: `1px solid ${dividerColor}`, margin: "4px 0" }} />

          {/* Account tier */}
          <div style={{ ...TYPO.label, color: C.muted, padding: "6px 16px 4px", fontFamily: FONT }}>
            Account
          </div>
          <div style={{ padding: "4px 16px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
            {isAdmin && (
              <button
                role="menuitem"
                type="button"
                onClick={closeThen(onAdminPanel)}
                style={{
                  background: "none",
                  border: "none",
                  color: C.accent,
                  textAlign: "left",
                  cursor: "pointer",
                  fontFamily: FONT,
                  fontSize: 12,
                  fontWeight: 600,
                  padding: "8px 0",
                }}
              >
                Admin panel
              </button>
            )}
            <button
              role="menuitem"
              type="button"
              onClick={closeThen(onSignOut)}
              style={{
                background: "none",
                border: `1px solid ${C.border}`,
                color: C.muted,
                textAlign: "center",
                cursor: "pointer",
                fontFamily: FONT,
                fontSize: 12,
                fontWeight: 600,
                padding: "8px 12px",
                borderRadius: 6,
                minHeight: MENU_ITEM_HEIGHT,
              }}
            >
              Sign Out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
