// ui/UserSettingsPanel.jsx — User preferences (stored in user_settings table)
import { useState, useEffect, useCallback } from "react";
import { Btn, SH, InfoBox } from "./shared/components.jsx";
import { fetchUserSettings, saveUserSettings } from "../db/models.js";
import { useTheme, THEME_OPTIONS } from "./shared/ThemeContext.jsx";

const TABS = [
  { id: "execute", label: "Simulation" },
  { id: "ai",      label: "AI" },
  { id: "ui",      label: "UI" },
];

function PlanBadge({ plan }) {
  const { C } = useTheme();
  const isPro = plan === "pro";
  const color = isPro ? C.accent : C.muted;
  return (
    <span style={{
      display: "inline-flex",
      alignItems: "center",
      fontSize: 9,
      fontWeight: 700,
      fontFamily: "inherit",
      letterSpacing: 1.2,
      padding: "2px 7px",
      borderRadius: 3,
      background: color + (isPro ? "22" : "18"),
      color,
      border:     `1px solid ${color}${isPro ? "44" : "33"}`,
      textTransform: "uppercase",
      userSelect: "none",
    }}>
      {isPro ? "PRO" : "FREE"}
    </span>
  );
}

function UserSettingsPanel({ userId, plan, onClose, onThemeChange }) {
  const { C, FONT } = useTheme();
  const [tab, setTab] = useState("execute");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState(null);

  const [defaultReplications, setDefaultReplications] = useState(1);
  const [defaultWarmup, setDefaultWarmup] = useState(0);
  const [defaultMaxSimTime, setDefaultMaxSimTime] = useState(1000);

  const [responseStyle, setResponseStyle] = useState("balanced");
  const [autoProposeTemplate, setAutoProposeTemplate] = useState(false);

  const [theme, setTheme] = useState("system");
  const [schemaVersion, setSchemaVersion] = useState(1);

  const load = useCallback(async () => {
    if (!userId) { setLoading(false); return; }
    setLoading(true);
    try {
      const { settings, schemaVersion: sv } = await fetchUserSettings(userId);
      const ex = settings.execute || {};
      const ai = settings.ai || {};
      const ui = settings.ui || {};
      setDefaultReplications(ex.defaultReplications ?? 1);
      setDefaultWarmup(ex.defaultWarmup ?? 0);
      setDefaultMaxSimTime(ex.defaultMaxSimTime ?? 1000);
      setResponseStyle(ai.responseStyle ?? "balanced");
      setAutoProposeTemplate(ai.autoProposeTemplate ?? false);
      const savedTheme = ui.theme ?? "system";
      setTheme(savedTheme);
      onThemeChange?.(savedTheme);
      setSchemaVersion(sv ?? 1);
    } catch (err) {
      setStatus({ state: "error", message: err.message });
    }
    setLoading(false);
  }, [userId, onThemeChange]);

  useEffect(() => { load(); }, [load]);

  const buildSettings = (nextTheme = theme) => ({
    execute: { defaultReplications, defaultWarmup, defaultMaxSimTime },
    ai:      { responseStyle, autoProposeTemplate },
    ui:      { theme: nextTheme },
  });

  const persistSettings = async (nextTheme = theme, successMessage = "Settings saved.") => {
    setSaving(true); setStatus(null);
    try {
      await saveUserSettings(userId, buildSettings(nextTheme), schemaVersion);
      setStatus({ state: "success", message: successMessage });
    } catch (err) {
      setStatus({ state: "error", message: err.message });
    }
    setSaving(false);
  };

  const handleSave = () => persistSettings();

  const handleThemeChange = (nextTheme) => {
    setTheme(nextTheme);
    onThemeChange?.(nextTheme);
    persistSettings(nextTheme, "Theme saved.");
  };

  const inp = (extra = {}) => ({
    background: C.bg, border: `1px solid ${C.border}`, borderRadius: 4,
    color: C.text, fontFamily: FONT, fontSize: 12,
    padding: "6px 10px", outline: "none", ...extra,
  });

  const gridRow = { display: "grid", gridTemplateColumns: "200px 1fr", gap: 12, alignItems: "center" };
  const lbl = { fontSize: 11, color: C.muted, fontFamily: FONT };

  return (
    <div style={{ maxWidth: 680, margin: "0 auto", padding: "20px 24px", display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        {onClose && <Btn small variant="ghost" onClick={onClose}>← Back</Btn>}
        <div style={{ fontSize: 18, fontWeight: 700, color: C.text, fontFamily: FONT }}>Settings</div>
        <PlanBadge plan={plan} />
      </div>

      <div role="tablist" style={{ display: "flex", gap: 2, background: C.surface, borderRadius: 6, padding: 2, width: "fit-content" }}>
        {TABS.map(t => (
          <button key={t.id} role="tab" aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            style={{ background: tab === t.id ? C.panel : "transparent", border: "none", borderRadius: 4,
              color: tab === t.id ? C.text : C.muted, fontFamily: FONT, fontSize: 11, fontWeight: 700,
              padding: "7px 16px", cursor: "pointer" }}>
            {t.label}
          </button>
        ))}
      </div>

      {status && (
        <div role="alert" style={{
          fontSize: 11, color: status.state === "error" ? C.red : C.green, fontFamily: FONT,
          background: status.state === "error" ? C.red + "12" : C.green + "12",
          border: `1px solid ${status.state === "error" ? C.red + "44" : C.green + "44"}`,
          borderRadius: 4, padding: "8px 12px",
        }}>{status.message}</div>
      )}

      {loading ? (
        <div style={{ color: C.muted, fontFamily: FONT, fontSize: 12 }}>Loading...</div>
      ) : (
        <>
          {tab === "execute" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <SH label="Simulation Defaults" color={C.accent} />
              <InfoBox color={C.accent}>
                These defaults pre-fill run settings when you open a model.
                You can still override them per-run.
              </InfoBox>
              <div style={gridRow}>
                <span style={lbl}>Default replications</span>
                <input type="number" min="1" max="1000" step="1" value={defaultReplications}
                  onChange={e => setDefaultReplications(parseInt(e.target.value) || 1)}
                  style={{ ...inp({ width: 100 }) }} />

                <span style={lbl}>Default warm-up period</span>
                <input type="number" min="0" step="1" value={defaultWarmup}
                  onChange={e => setDefaultWarmup(parseFloat(e.target.value) || 0)}
                  style={{ ...inp({ width: 100 }) }} />

                <span style={lbl}>Default max simulation time</span>
                <input type="number" min="1" step="1" value={defaultMaxSimTime}
                  onChange={e => setDefaultMaxSimTime(parseFloat(e.target.value) || 1000)}
                  style={{ ...inp({ width: 120 }) }} />
              </div>
            </div>
          )}

          {tab === "ai" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <SH label="AI Preferences" color={C.accent} />
              <div style={gridRow}>
                <span style={lbl}>Response style</span>
                <select value={responseStyle} onChange={e => setResponseStyle(e.target.value)}
                  style={{ ...inp({ color: C.accent, width: 200 }) }}>
                  <option value="concise">Concise — shorter answers</option>
                  <option value="balanced">Balanced (default)</option>
                  <option value="detailed">Detailed — fuller explanations</option>
                </select>

                <span style={lbl}>Auto-propose template</span>
                <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                  <input type="checkbox" checked={autoProposeTemplate}
                    onChange={e => setAutoProposeTemplate(e.target.checked)} />
                  <span style={{ fontSize: 11, color: C.muted, fontFamily: FONT }}>
                    Suggest a matching template when starting a new AI model
                  </span>
                </label>
              </div>
            </div>
          )}

          {tab === "ui" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <SH label="Interface" color={C.accent} />
              <div style={gridRow}>
                <span style={lbl}>Theme</span>
                <select value={theme} onChange={e => handleThemeChange(e.target.value)}
                  style={{ ...inp({ color: C.accent, width: 200 }) }}>
                  {THEME_OPTIONS.map(opt => (
                    <option key={opt.id} value={opt.id}>{opt.label}</option>
                  ))}
                </select>
              </div>
            </div>
          )}

          <Btn variant="primary" onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save Settings"}
          </Btn>
        </>
      )}
    </div>
  );
}

export { UserSettingsPanel };
