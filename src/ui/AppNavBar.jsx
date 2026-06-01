// ui/AppNavBar.jsx — Top navigation bar for the authenticated app shell
import { useState } from "react";
import { useTheme } from "./shared/ThemeContext.jsx";
import { FeedbackModal } from "./FeedbackModal.jsx";
import { AboutModal }    from "./AboutModal.jsx";

// Inline SVG icon for feedback (speech bubble / message)
function FeedbackIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

// Inline SVG icon for info (i in circle)
function InfoIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="16" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12.01" y2="8" />
    </svg>
  );
}

export function AppNavBar({
  profile,
  isAdmin,
  isAdminActive,
  onHelpOpen,
  onSettings,
  onAdmin,
  onSignOut,
  userId,
  currentPage,
}) {
  const { C, FONT } = useTheme();
  const navBtnStyle = {
    background: C.surfaceHover,
    border: `1px solid ${C.border}`,
    borderRadius: 5,
    color: C.muted,
    fontFamily: FONT,
    fontSize: 11,
    padding: "5px 12px",
    cursor: "pointer",
    fontWeight: 600,
    display: "flex",
    alignItems: "center",
    gap: 5,
  };
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [aboutOpen,    setAboutOpen]    = useState(false);

  return (
    <>
      <div style={{
        background: C.surface,
        borderBottom: `1px solid ${C.border}`,
        padding: "0 24px",
        display: "flex",
        alignItems: "center",
        gap: 16,
        height: 52,
      }}>
        {/* Brand */}
        <div>
          <div style={{ fontWeight: 700, fontSize: 14, color: C.accent, letterSpacing: 2, fontFamily: FONT, lineHeight: 1.1 }}>DES STUDIO</div>
          <div style={{ fontSize: 9, color: C.muted, letterSpacing: 0.5, fontFamily: FONT, lineHeight: 1.1 }}>a simmodlr.app</div>
        </div>

        <div style={{ flex: 1 }} />

        {/* User profile */}
        {profile && (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{
              width: 28, height: 28, borderRadius: "50%",
              background: (profile.color || C.accent) + "22",
              border: `1.5px solid ${profile.color || C.accent}55`,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 11, fontWeight: 700, color: profile.color || C.accent,
            }}>
              {profile.initials || "?"}
            </div>
            <span style={{ fontSize: 12, color: C.muted }}>{profile.full_name}</span>
          </div>
        )}

        {/* Feedback button — opens FeedbackModal */}
        <button
          type="button"
          aria-label="Submit feedback"
          title="Submit feedback"
          onClick={() => setFeedbackOpen(true)}
          style={navBtnStyle}
        >
          <FeedbackIcon />
        </button>

        {/* Info / About button — opens AboutModal */}
        <button
          type="button"
          aria-label="About DES Studio"
          title="About DES Studio"
          onClick={() => setAboutOpen(true)}
          style={navBtnStyle}
        >
          <InfoIcon />
        </button>

        {/* Help (?) button */}
        <button
          type="button"
          aria-label="Help"
          title="Help"
          onClick={onHelpOpen}
          style={navBtnStyle}
        >
          ?
        </button>

        <button type="button" onClick={onSettings} style={navBtnStyle}>
          Settings
        </button>

        {isAdmin && (
          <button
            type="button"
            onClick={onAdmin}
            style={{
              ...navBtnStyle,
              background: isAdminActive ? C.accent + "33" : C.surfaceHover,
              border: `1px solid ${isAdminActive ? C.accent : C.border}`,
              color: isAdminActive ? C.accent : C.muted,
            }}
          >
            Admin
          </button>
        )}

        <button type="button" onClick={onSignOut} style={navBtnStyle}>
          Sign Out
        </button>
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
    </>
  );
}
