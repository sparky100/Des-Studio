// ui/AppNavBar.jsx — Top navigation bar for the authenticated app shell
import { useState } from "react";
import { useTheme } from "./shared/ThemeContext.jsx";
import { FeedbackModal } from "./FeedbackModal.jsx";
import { AboutModal }    from "./AboutModal.jsx";
import { HeaderAccountMenu } from "./HeaderAccountMenu.jsx";
import { KeyboardShortcutsModal } from "./shared/KeyboardShortcutsModal.jsx";
import { useViewport } from "./shared/hooks.js";

// Inline SVG icon for settings (gear)
// Shared simmodlr header pattern (same in Loop, flow, Lens, Compass, Atlas):
//   [? Help] [avatar + name] [gear Settings] [••• More]
// Identical at every width; at <=640px only the name text is dropped.
export const HEADER_BUTTON_SIZE = 40;
export const HEADER_ICON_SIZE = 18;
export const HEADER_NAME_BREAKPOINT = 640;

function HelpIcon() {
  return (
    <svg width={HEADER_ICON_SIZE} height={HEADER_ICON_SIZE} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}

function GearIcon() {
  return (
    <svg width={HEADER_ICON_SIZE} height={HEADER_ICON_SIZE} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

export function AppNavBar({
  profile,
  isAdmin,
  onHelpOpen,
  onSettings,
  onAdmin,
  onSignOut,
  userId,
  currentPage,
}) {
  const { C, FONT } = useTheme();
  const { width } = useViewport();
  const showName = width > HEADER_NAME_BREAKPOINT;
  const iconBtnStyle = {
    width: HEADER_BUTTON_SIZE,
    height: HEADER_BUTTON_SIZE,
    minWidth: HEADER_BUTTON_SIZE,
    borderRadius: "50%",
    background: "none",
    border: `1px solid ${C.border}`,
    color: C.muted,
    cursor: "pointer",
    padding: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  };
  const [feedbackOpen,   setFeedbackOpen]   = useState(false);
  const [aboutOpen,      setAboutOpen]      = useState(false);
  const [shortcutsOpen,  setShortcutsOpen]  = useState(false);

  return (
    <>
      <div style={{
        background: C.surface,
        borderBottom: `1px solid ${C.border}`,
        padding: "6px 16px",
        display: "flex",
        alignItems: "center",
        flexWrap: "wrap",
        gap: 8,
        minHeight: 52,
      }}>
        {/* Brand */}
        <div>
          <div style={{ fontWeight: 700, fontSize: 17, color: C.accent, letterSpacing: 2, fontFamily: FONT, lineHeight: 1.1 }}>flow</div>
        </div>

        <div style={{ flex: 1 }} />

        <button type="button" aria-label="Help" title="Help" onClick={onHelpOpen} style={iconBtnStyle}>
          <HelpIcon />
        </button>

        {/* Avatar (+ name on desktop) — filled with the shared profile
            colour, white initials, so it matches the sibling apps. */}
        {profile && (
          <div title={profile.full_name} style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
            <div
              aria-label={profile.full_name}
              data-testid="header-avatar"
              style={{
                width: 28, height: 28, borderRadius: "50%",
                background: profile.color || C.accent,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 11, fontWeight: 700, color: "#fff", fontFamily: FONT,
              }}
            >
              {profile.initials || "?"}
            </div>
            {showName && profile.full_name && (
              <span style={{ fontSize: 13, color: C.text, fontFamily: FONT, whiteSpace: "nowrap" }}>{profile.full_name}</span>
            )}
          </div>
        )}

        {/* Settings keeps its own gear; it never goes in the ••• menu. */}
        <button type="button" aria-label="Settings" title="Settings" onClick={onSettings} style={iconBtnStyle}>
          <GearIcon />
        </button>

        {/* Feedback/About/Keyboard shortcuts/Admin/Sign Out live behind ••• */}
        <HeaderAccountMenu
          appName="flow"
          isAdmin={isAdmin}
          onFeedback={() => setFeedbackOpen(true)}
          onAbout={() => setAboutOpen(true)}
          onShortcuts={() => setShortcutsOpen(true)}
          onAdminPanel={onAdmin}
          onSignOut={onSignOut}
        />
      </div>

      {/* Modals rendered outside the navbar flow */}
      <FeedbackModal
        isOpen={feedbackOpen}
        onClose={() => setFeedbackOpen(false)}
        userId={userId ?? null}
        currentPage={currentPage}
      />
      <AboutModal
        isOpen={aboutOpen}
        onClose={() => setAboutOpen(false)}
      />
      {shortcutsOpen && (
        <KeyboardShortcutsModal onClose={() => setShortcutsOpen(false)} />
      )}
    </>
  );
}
