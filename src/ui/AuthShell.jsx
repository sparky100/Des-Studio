// ui/AuthShell.jsx — Authentication forms (sign-in, sign-up, password recovery)
import { useState, useCallback } from "react";
import { C, FONT, GOOGLE_FONT_URL } from "./shared/tokens.js";
import { supabase } from "../db/supabase.js";

export function AuthShell({ isRecoverySession, onRecoveryComplete, signOut }) {
  const [showAuth, setShowAuth] = useState(false);
  const [authMode, setAuthMode] = useState("signin");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [showResetSent, setShowResetSent] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [newPasswordConfirm, setNewPasswordConfirm] = useState("");

  const handleAuth = useCallback(async () => {
    setAuthError("");
    try {
      if (authMode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email: authEmail, password: authPassword });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signUp({ email: authEmail, password: authPassword });
        if (error) throw error;
      }
    } catch (e) { setAuthError(e.message); }
  }, [authMode, authEmail, authPassword]);

  const handleForgotPassword = useCallback(async () => {
    setAuthError("");
    if (!authEmail) { setAuthError("Enter your email address first."); return; }
    try {
      const redirectTo = window.location.origin + window.location.pathname;
      const { error } = await supabase.auth.resetPasswordForEmail(authEmail, { redirectTo });
      if (error) throw error;
      setShowResetSent(true);
    } catch (e) { setAuthError(e.message); }
  }, [authEmail]);

  const handlePasswordReset = useCallback(async () => {
    setAuthError("");
    if (newPassword.length < 8) { setAuthError("Password must be at least 8 characters."); return; }
    if (newPassword !== newPasswordConfirm) { setAuthError("Passwords do not match."); return; }
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      onRecoveryComplete?.();
      setNewPassword(""); setNewPasswordConfirm("");
    } catch (e) { setAuthError(e.message); }
  }, [newPassword, newPasswordConfirm, onRecoveryComplete]);

  const navBar = (
    <div style={{ background: C.surface, borderBottom: `1px solid ${C.border}`, padding: "0 24px", display: "flex", alignItems: "center", gap: 16, height: 52 }}>
      <div style={{ fontWeight: 700, fontSize: 14, color: C.accent, letterSpacing: 2 }}>DES STUDIO</div>
      <div style={{ fontSize: 11, color: C.muted, borderLeft: `1px solid ${C.border}`, paddingLeft: 16 }}>Three-Phase · Entities · Servers</div>
      <div style={{ flex: 1 }} />
    </div>
  );

  if (isRecoverySession) {
    return (
      <div style={{ background: C.bg, minHeight: "100vh", color: C.text, fontFamily: FONT }}>
        <style>{`*{box-sizing:border-box;margin:0;padding:0;}@import url('${GOOGLE_FONT_URL}');`}</style>
        <div style={{ background: C.surface, borderBottom: `1px solid ${C.border}`, padding: "0 24px", display: "flex", alignItems: "center", height: 52 }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: C.accent, letterSpacing: 2 }}>DES STUDIO</div>
        </div>
        <div style={{ maxWidth: 400, margin: "0 auto", padding: "60px 24px" }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: C.text, marginBottom: 20 }}>Set new password</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <input type="password" placeholder="New password (min 8 chars)" value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 4, color: C.text, fontFamily: FONT, fontSize: 13, padding: "8px 10px", outline: "none" }} />
            <input type="password" placeholder="Confirm new password" value={newPasswordConfirm}
              onChange={e => setNewPasswordConfirm(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") handlePasswordReset(); }}
              style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 4, color: C.text, fontFamily: FONT, fontSize: 13, padding: "8px 10px", outline: "none" }} />
            {authError && <div style={{ fontSize: 11, color: C.red }}>{authError}</div>}
            <button type="button" onClick={handlePasswordReset}
              style={{ background: C.accent, color: "#fff", border: "none", borderRadius: 4, fontFamily: FONT, fontSize: 13, padding: "8px 16px", cursor: "pointer", fontWeight: 600 }}>
              Update Password
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ background: C.bg, minHeight: "100vh", color: C.text, fontFamily: FONT }}>
      <style>{`*{box-sizing:border-box;margin:0;padding:0;}::-webkit-scrollbar{width:6px;}::-webkit-scrollbar-track{background:${C.bg};}::-webkit-scrollbar-thumb{background:${C.border};border-radius:3px;}@import url('${GOOGLE_FONT_URL}');`}</style>
      {navBar}
      <div style={{ maxWidth: 400, margin: "0 auto", padding: "60px 24px", textAlign: "center" }}>
        <div style={{ fontSize: 20, fontWeight: 700, color: C.text, marginBottom: 12 }}>DES Studio</div>
        <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.6, marginBottom: 24 }}>
          Discrete-event simulation modelling tool. Sign in to build, run, and share models.
        </div>
        {!showAuth ? (
          <button type="button" onClick={() => setShowAuth(true)}
            style={{ background: C.accent, color: "#fff", border: "none", borderRadius: 6, fontFamily: FONT, fontSize: 14, padding: "10px 28px", cursor: "pointer", fontWeight: 700 }}>
            Sign In / Sign Up
          </button>
        ) : (
          <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 8, padding: 20, textAlign: "left" }}>
            <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
              <button type="button" onClick={() => { setAuthMode("signin"); setAuthError(""); }}
                style={{ flex: 1, background: authMode === "signin" ? C.accent + "18" : "none", border: authMode === "signin" ? `1px solid ${C.accent}44` : `1px solid ${C.border}`, borderRadius: 4, color: authMode === "signin" ? C.accent : C.muted, fontFamily: FONT, fontSize: 12, padding: "6px 12px", cursor: "pointer", fontWeight: 600 }}>Sign In</button>
              <button type="button" onClick={() => { setAuthMode("signup"); setAuthError(""); }}
                style={{ flex: 1, background: authMode === "signup" ? C.accent + "18" : "none", border: authMode === "signup" ? `1px solid ${C.accent}44` : `1px solid ${C.border}`, borderRadius: 4, color: authMode === "signup" ? C.accent : C.muted, fontFamily: FONT, fontSize: 12, padding: "6px 12px", cursor: "pointer", fontWeight: 600 }}>Sign Up</button>
            </div>
            {showResetSent ? (
              <div style={{ fontSize: 12, color: C.green, lineHeight: 1.6 }}>
                Password reset email sent. Check your inbox and click the link to set a new password.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <input type="email" placeholder="Email" value={authEmail} onChange={e => setAuthEmail(e.target.value)}
                  style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 4, color: C.text, fontFamily: FONT, fontSize: 13, padding: "8px 10px", outline: "none" }} />
                <input type="password" placeholder="Password" value={authPassword} onChange={e => setAuthPassword(e.target.value)} onKeyDown={e => { if (e.key === "Enter") handleAuth(); }}
                  style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 4, color: C.text, fontFamily: FONT, fontSize: 13, padding: "8px 10px", outline: "none" }} />
                {authError && <div style={{ fontSize: 11, color: C.red }}>{authError}</div>}
                <button type="button" onClick={handleAuth}
                  style={{ background: C.accent, color: "#fff", border: "none", borderRadius: 4, fontFamily: FONT, fontSize: 13, padding: "8px 16px", cursor: "pointer", fontWeight: 600 }}>
                  {authMode === "signin" ? "Sign In" : "Sign Up"}
                </button>
                {authMode === "signin" && (
                  <button type="button" onClick={handleForgotPassword}
                    style={{ background: "none", border: "none", color: C.muted, fontFamily: FONT, fontSize: 11, cursor: "pointer", textAlign: "left", padding: 0 }}>
                    Forgot password?
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
