// ui/AppNavBar.jsx — Top navigation bar for the authenticated app shell
import { C, FONT } from "./shared/tokens.js";

export function AppNavBar({ profile, isAdmin, isAdminActive, onHelpOpen, onSettings, onAdmin, onSignOut }) {
  return (
    <div style={{ background: C.surface, borderBottom: `1px solid ${C.border}`, padding: "0 24px", display: "flex", alignItems: "center", gap: 16, height: 52 }}>
      <div>
        <div style={{ fontWeight: 700, fontSize: 14, color: C.accent, letterSpacing: 2 }}>DES STUDIO</div>
        <div style={{ fontSize: 9, color: C.muted, letterSpacing: 0.5 }}>a simmodlr.app</div>
      </div>
      <div style={{ flex: 1 }} />
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
      <button
        type="button"
        aria-label="Help"
        title="Help"
        onClick={onHelpOpen}
        style={{
          background: "#ffffff08",
          border: `1px solid ${C.border}`,
          borderRadius: 5,
          color: C.muted,
          fontFamily: FONT,
          fontSize: 11,
          padding: "5px 12px",
          cursor: "pointer",
          fontWeight: 600,
        }}
      >
        ?
      </button>
      <button type="button" onClick={onSettings}
        style={{ background: "#ffffff08", border: `1px solid ${C.border}`, borderRadius: 5, color: C.muted, fontFamily: FONT, fontSize: 11, padding: "5px 12px", cursor: "pointer", fontWeight: 600 }}>
        Settings
      </button>
      {isAdmin && (
        <button type="button" onClick={onAdmin}
          style={{ background: isAdminActive ? C.accent + "33" : "#ffffff08", border: `1px solid ${isAdminActive ? C.accent : C.border}`, borderRadius: 5, color: isAdminActive ? C.accent : C.muted, fontFamily: FONT, fontSize: 11, padding: "5px 12px", cursor: "pointer", fontWeight: 600 }}>
          Admin
        </button>
      )}
      <button type="button" onClick={onSignOut}
        style={{ background: "#ffffff08", border: `1px solid ${C.border}`, borderRadius: 5, color: C.muted, fontFamily: FONT, fontSize: 11, padding: "5px 12px", cursor: "pointer", fontWeight: 600 }}>
        Sign Out
      </button>
    </div>
  );
}
