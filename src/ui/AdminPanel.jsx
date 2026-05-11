// ui/AdminPanel.jsx — Platform administration (admin role only)
import { useState, useEffect, useCallback, Fragment } from "react";
import { C, FONT } from "./shared/tokens.js";
import { Btn, Tag, SH, InfoBox } from "./shared/components.jsx";
import { getPlatformConfig, setPlatformConfig, fetchAllUsers, updateUserRole } from "../db/models.js";

const LLM_PROVIDERS = [
  { value: "anthropic",    label: "Anthropic" },
  { value: "openai",       label: "OpenAI" },
  { value: "opencode-go",  label: "OpenCode Go" },
];

const LLM_MODELS = {
  anthropic:   ["claude-sonnet-4-20250514", "claude-haiku-4-20250514", "claude-opus-4-20250514"],
  openai:      ["gpt-5.1-codex", "gpt-5.1-codex-mini", "gpt-5.1-codex-max"],
  "opencode-go": ["opencode-go/deepseek-v4-pro", "opencode-go/deepseek-v4-flash"],
};

function AdminPanel({ userId, isAdmin, onClose }) {
  const [tab, setTab] = useState("llm");
  const [llmConfig, setLlmConfig] = useState(null);
  const [limits, setLimits] = useState(null);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState(null);
  const [showKey, setShowKey] = useState(false);

  // LLM form state
  const [provider, setProvider] = useState("anthropic");
  const [model, setModel] = useState("claude-sonnet-4-20250514");
  const [apiKey, setApiKey] = useState("");
  const [temperature, setTemperature] = useState(0.3);
  const [maxTokens, setMaxTokens] = useState(450);
  const [rateLimit, setRateLimit] = useState(25);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [llmCfg, limitsCfg, allUsers] = await Promise.all([
        getPlatformConfig("llm"),
        getPlatformConfig("limits"),
        fetchAllUsers(),
      ]);
      setLlmConfig(llmCfg);
      setLimits(limitsCfg);
      setUsers(allUsers || []);
      if (llmCfg) {
        setProvider(llmCfg.provider || "anthropic");
        setModel(llmCfg.model || "claude-sonnet-4-20250514");
        setApiKey(llmCfg.apiKey || "");
        setTemperature(llmCfg.temperature ?? 0.3);
        setMaxTokens(llmCfg.maxTokensPerRun ?? 450);
        setRateLimit(llmCfg.rateLimitPerHour ?? 25);
      }
    } catch (err) {
      setSaveStatus({ state: "error", message: err.message });
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // ── Limits form state ──
  const [maxModels, setMaxModels] = useState(100);
  const [maxRuns, setMaxRuns] = useState(500);
  const [maxReplications, setMaxReplications] = useState(50);
  const [maxSweepPoints, setMaxSweepPoints] = useState(50);
  const [maxSimTime, setMaxSimTime] = useState(100000);

  useEffect(() => {
    if (limits) {
      setMaxModels(limits.maxModelsPerUser ?? 100);
      setMaxRuns(limits.maxRunsPerModel ?? 500);
      setMaxReplications(limits.maxReplications ?? 50);
      setMaxSweepPoints(limits.maxSweepPoints ?? 50);
      setMaxSimTime(limits.maxSimTime ?? 100000);
    }
  }, [limits]);

  const handleSaveLlm = async () => {
    setSaving(true); setSaveStatus(null);
    try {
      const value = { provider, model, temperature, maxTokensPerRun: maxTokens, rateLimitPerHour: rateLimit };
      if (apiKey) value.apiKey = apiKey;
      await setPlatformConfig("llm", value, userId);
      setSaveStatus({ state: "success", message: "LLM configuration saved." });
    } catch (err) {
      setSaveStatus({ state: "error", message: err.message });
    }
    setSaving(false);
  };

  const handleSaveLimits = async () => {
    setSaving(true); setSaveStatus(null);
    try {
      await setPlatformConfig("limits", {
        maxModelsPerUser: maxModels, maxRunsPerModel: maxRuns,
        maxReplications, maxSweepPoints, maxSimTime,
      }, userId);
      setSaveStatus({ state: "success", message: "Limits saved." });
    } catch (err) {
      setSaveStatus({ state: "error", message: err.message });
    }
    setSaving(false);
  };

  const handleRoleChange = async (targetId, role) => {
    try {
      await updateUserRole(targetId, role);
      setUsers(prev => prev.map(u => u.id === targetId ? { ...u, role } : u));
    } catch (err) {
      setSaveStatus({ state: "error", message: err.message });
    }
  };

  const inp = (extra = {}) => ({
    background: C.bg, border: `1px solid ${C.border}`, borderRadius: 4,
    color: C.text, fontFamily: FONT, fontSize: 12,
    padding: "6px 10px", outline: "none", ...extra,
  });

  const TABS = [
    { id: "llm",    label: "LLM Provider" },
    { id: "limits", label: "Platform Limits" },
    { id: "users",  label: "Users" },
  ];

  if (!isAdmin) {
    return (
      <div style={{ color: C.muted, fontFamily: FONT, fontSize: 12, padding: 24, textAlign: "center" }}>
        Admin access required.
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: "20px 24px", display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        {onClose && <Btn small variant="ghost" onClick={onClose}>← Back</Btn>}
        <div style={{ fontSize: 18, fontWeight: 700, color: C.text, fontFamily: FONT }}>Admin Panel</div>
      </div>

      {/* Tabs */}
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

      {/* Status banner */}
      {saveStatus && (
        <div role="alert" style={{
          fontSize: 11, color: saveStatus.state === "error" ? C.red : C.green,
          fontFamily: FONT, background: saveStatus.state === "error" ? C.red + "12" : C.green + "12",
          border: `1px solid ${saveStatus.state === "error" ? C.red + "44" : C.green + "44"}`,
          borderRadius: 4, padding: "8px 12px",
        }}>{saveStatus.message}</div>
      )}

      {loading ? (
        <div style={{ color: C.muted, fontFamily: FONT, fontSize: 12 }}>Loading...</div>
      ) : (
        <>
          {/* ── LLM CONFIG ── */}
          {tab === "llm" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <SH label="LLM Provider Configuration" color={C.accent} />
              <InfoBox color={C.accent}>
                Configure the AI provider used for all AI analysis features (narrative, suggestions, queries, model building).
                Changes take effect immediately on the next AI request.
              </InfoBox>
              <div style={{ display: "grid", gridTemplateColumns: "180px 1fr", gap: 12, alignItems: "center" }}>
                <span style={{ fontSize: 11, color: C.muted, fontFamily: FONT }}>Provider</span>
                <select value={provider} onChange={e => { setProvider(e.target.value); setModel(LLM_MODELS[e.target.value]?.[0] || ""); }}
                  style={{ ...inp({ color: C.accent }), width: 240 }}>
                  {LLM_PROVIDERS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select>

                <span style={{ fontSize: 11, color: C.muted, fontFamily: FONT }}>Model</span>
                <select value={model} onChange={e => setModel(e.target.value)}
                  style={{ ...inp({ color: C.accent }), width: 300 }}>
                  {(LLM_MODELS[provider] || []).map(m => <option key={m} value={m}>{m}</option>)}
                </select>

                <span style={{ fontSize: 11, color: C.muted, fontFamily: FONT }}>API Key</span>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <input type={showKey ? "text" : "password"} value={apiKey} onChange={e => setApiKey(e.target.value)}
                    placeholder="sk-..." style={{ ...inp(), flex: 1, maxWidth: 320 }} />
                  <Btn small variant="ghost" onClick={() => setShowKey(s => !s)}>{showKey ? "Hide" : "Show"}</Btn>
                </div>

                <span style={{ fontSize: 11, color: C.muted, fontFamily: FONT }}>Temperature</span>
                <input type="number" min="0" max="1" step="0.05" value={temperature}
                  onChange={e => setTemperature(parseFloat(e.target.value) || 0.3)}
                  style={{ ...inp({ color: C.amber, width: 100 })}}
                />

                <span style={{ fontSize: 11, color: C.muted, fontFamily: FONT }}>Max tokens per analysis</span>
                <input type="number" min="50" max="4000" step="50" value={maxTokens}
                  onChange={e => setMaxTokens(parseInt(e.target.value) || 450)}
                  style={{ ...inp({ color: C.amber, width: 120 })}}
                />

                <span style={{ fontSize: 11, color: C.muted, fontFamily: FONT }}>Rate limit (reqs/hour)</span>
                <input type="number" min="1" max="500" step="1" value={rateLimit}
                  onChange={e => setRateLimit(parseInt(e.target.value) || 25)}
                  style={{ ...inp({ color: C.amber, width: 100 })}}
                />
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <Btn variant="primary" onClick={handleSaveLlm} disabled={saving}>
                  {saving ? "Saving..." : "Save Configuration"}
                </Btn>
              </div>
            </div>
          )}

          {/* ── LIMITS ── */}
          {tab === "limits" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <SH label="Platform Limits" color={C.amber} />
              <InfoBox color={C.amber}>
                Set maximum usage limits per user. Current enforcement is informational (UI-level; hard limits require edge function updates).
              </InfoBox>
              <div style={{ display: "grid", gridTemplateColumns: "200px 1fr", gap: 12, alignItems: "center" }}>
                {[
                  { l: "Max models per user", v: maxModels, s: setMaxModels },
                  { l: "Max runs per model", v: maxRuns, s: setMaxRuns },
                  { l: "Max replications", v: maxReplications, s: setMaxReplications },
                  { l: "Max sweep points", v: maxSweepPoints, s: setMaxSweepPoints },
                  { l: "Max simulation time", v: maxSimTime, s: setMaxSimTime },
                ].map(item => (
                  <Fragment key={item.l}>
                    <span style={{ fontSize: 11, color: C.muted, fontFamily: FONT }}>{item.l}</span>
                    <input type="number" min="1" step="1" value={item.v}
                      onChange={e => item.s(parseInt(e.target.value) || 1)}
                      style={{ ...inp({ color: C.amber, width: 120 })}}
                    />
                  </Fragment>
                ))}
              </div>
              <Btn variant="primary" onClick={handleSaveLimits} disabled={saving}>
                {saving ? "Saving..." : "Save Limits"}
              </Btn>
            </div>
          )}

          {/* ── USERS ── */}
          {tab === "users" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <SH label="User Management" color={C.server} />
              {users.length === 0 ? (
                <div style={{ fontSize: 12, color: C.muted, fontFamily: FONT, fontStyle: "italic" }}>No users found.</div>
              ) : (
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, fontFamily: FONT }}>
                  <thead>
                    <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                      {["User", "Role", "Actions"].map(h => (
                        <th key={h} style={{ textAlign: "left", padding: "6px 10px", color: C.muted, fontWeight: 700, fontSize: 10, letterSpacing: 1 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {users.map(u => (
                      <tr key={u.id} style={{ borderBottom: `1px solid ${C.border}30` }}>
                        <td style={{ padding: "6px 10px", color: C.text }}>
                          <div>{u.username || u.email || u.id?.slice(0, 8)}</div>
                          <div style={{ fontSize: 9, color: C.muted }}>{u.id}</div>
                        </td>
                        <td style={{ padding: "6px 10px" }}>
                          <Tag label={u.role || "user"} color={u.isAdmin ? C.accent : C.muted} />
                        </td>
                        <td style={{ padding: "6px 10px" }}>
                          <div style={{ display: "flex", gap: 6 }}>
                            {u.isAdmin ? (
                              <Btn small variant="ghost" onClick={() => handleRoleChange(u.id, "user")}>Demote to User</Btn>
                            ) : (
                              <Btn small variant="ghost" onClick={() => handleRoleChange(u.id, "admin")}>Promote to Admin</Btn>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export { AdminPanel };
