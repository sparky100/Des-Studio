// ui/AdminPanel.jsx — Platform administration (admin role only)
import { useState, useEffect, useCallback, Fragment } from "react";
;
import { Btn, Tag, SH, InfoBox, SectionPanel } from "./shared/components.jsx";
import { useViewport } from "./shared/hooks.js";
import { getPlatformConfig, setPlatformConfig, updateUserRole,
         suspendUser, unsuspendUser, logAdminAction, fetchAuditLog,
         fetchAdminUserStats, fetchPlatformStats, fetchSignupCounts,
         updateUserPlan, fetchFeedback, updateFeedbackStatus } from "../db/models.js";
import { RUN_ADMISSION_TIERS } from "../engine/run-admission.js";
import { useTheme } from "./shared/ThemeContext.jsx";

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

// ── Helpers ───────────────────────────────────────────────────────────────────

function relativeTime(isoDate) {
  const { C, FONT } = useTheme();
  if (!isoDate) return "Never";
  const diff = Date.now() - new Date(isoDate).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

function fullDate(isoDate) {
  if (!isoDate) return "";
  return new Date(isoDate).toLocaleString();
}

function sortUsers(users, col, dir) {
  const mul = dir === "asc" ? 1 : -1;
  return [...users].sort((a, b) => {
    let va = a[col]; let vb = b[col];
    if (va == null) return 1;
    if (vb == null) return -1;
    if (typeof va === "string") return mul * va.localeCompare(vb);
    return mul * (va < vb ? -1 : va > vb ? 1 : 0);
  });
}

function PlanBadge({ plan }) {
  const isPro = plan === "pro";
  return (
    <span style={{
      display: "inline-flex", alignItems: "center",
      fontSize: 9, fontWeight: 700, fontFamily: FONT,
      letterSpacing: 1.2, padding: "2px 7px", borderRadius: 3,
      background: isPro ? C.accent + "22" : C.muted + "18",
      color:      isPro ? C.accent         : C.muted,
      border:     `1px solid ${isPro ? C.accent + "44" : C.muted + "33"}`,
      textTransform: "uppercase", userSelect: "none",
    }}>
      {isPro ? "PRO" : "FREE"}
    </span>
  );
}

// ── Signups Bar Chart (inline SVG — no external chart library needed) ─────────
function SignupsBarChart({ data }) {
  if (!data || data.length === 0) {
    return (
      <div style={{ color: C.muted, fontFamily: FONT, fontSize: 11, fontStyle: "italic" }}>
        No signup data available for the past 30 days.
      </div>
    );
  }
  const max = Math.max(...data.map(d => d.count), 1);
  const chartH = 100;
  const barGap = 2;
  const totalW = 600;
  const barW = Math.max(3, Math.floor((totalW - data.length * barGap) / data.length));
  const svgW = data.length * (barW + barGap);

  return (
    <div style={{ overflowX: "auto" }}>
      <svg
        width="100%"
        viewBox={`0 0 ${svgW} ${chartH + 22}`}
        style={{ display: "block", minWidth: Math.min(svgW, totalW) }}
        aria-label="Daily signups bar chart"
      >
        {/* Y-axis label */}
        <text x="0" y="9" fontSize="8" fill={C.muted} fontFamily={FONT}>
          New users
        </text>
        {/* Bars */}
        {data.map((d, i) => {
          const h = Math.max(2, Math.round((d.count / max) * chartH));
          const x = i * (barW + barGap);
          const y = chartH - h;
          return (
            <g key={d.day}>
              <rect
                x={x} y={y}
                width={barW} height={h}
                fill={C.accent} opacity={0.75}
                rx={1}
              />
              <title>{d.day}: {d.count} signup{d.count !== 1 ? "s" : ""}</title>
              {/* Day label every ~5 bars to avoid clutter */}
              {i % 5 === 0 && (
                <text
                  x={x + barW / 2} y={chartH + 14}
                  fontSize="7" fill={C.muted} fontFamily={FONT}
                  textAnchor="middle"
                >
                  {d.day?.slice(5)} {/* MM-DD */}
                </text>
              )}
            </g>
          );
        })}
        {/* Baseline */}
        <line x1="0" y1={chartH} x2={svgW} y2={chartH} stroke={C.border} strokeWidth="1" />
      </svg>
    </div>
  );
}

// ── User detail drawer ────────────────────────────────────────────────────────
function UserDrawer({ user, currentUserId, onClose, onRoleChange, onPlanChange, onSuspend, onUnsuspend }) {
  if (!user) return null;
  const isSelf = user.id === currentUserId;

  const row = (label, value) => (
    <div style={{ display: "grid", gridTemplateColumns: "130px 1fr", gap: 8, padding: "5px 0", borderBottom: `1px solid ${C.border}20` }}>
      <span style={{ fontSize: 10, color: C.muted, fontFamily: FONT }}>{label}</span>
      <span style={{ fontSize: 11, color: C.text, fontFamily: FONT, wordBreak: "break-all" }}>{value ?? "—"}</span>
    </div>
  );

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: "fixed", inset: 0, zIndex: 199,
          background: "rgba(0,0,0,0.45)",
        }}
      />
      {/* Drawer */}
      <div style={{
        position: "fixed", top: 0, right: 0, bottom: 0,
        width: 340, zIndex: 200,
        background: C.panel,
        borderLeft: `1px solid ${C.border}`,
        display: "flex", flexDirection: "column",
        overflowY: "auto",
      }}>
        <div style={{ padding: "16px 20px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ flex: 1, fontSize: 13, fontWeight: 700, color: C.text, fontFamily: FONT }}>User Details</div>
          <Btn small variant="ghost" onClick={onClose}>✕</Btn>
        </div>

        <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 6 }}>
          {row("Email",        user.email || "—")}
          {row("Role",         user.role)}
          {row("Plan",         <PlanBadge plan={user.plan} />)}
          {row("Status",       user.suspended ? <Tag label="suspended" color={C.red} /> : <Tag label="active" color={C.green} />)}
          {row("Signed up",    user.signupAt   ? <span title={fullDate(user.signupAt)}>{relativeTime(user.signupAt)}</span>   : "—")}
          {row("Last active",  user.lastActiveAt ? <span title={fullDate(user.lastActiveAt)}>{relativeTime(user.lastActiveAt)}</span> : "Never")}
          {row("Models",       user.modelCount)}
          {row("Runs (30d)",   user.runsLast30d)}
          {row("Total runs",   user.runCount)}
          {row("ID",           <span style={{ fontSize: 9, color: C.muted }}>{user.id}</span>)}
        </div>

        {!isSelf && (
          <div style={{ padding: "12px 20px", display: "flex", flexDirection: "column", gap: 12, borderTop: `1px solid ${C.border}` }}>
            <SH label="Admin Actions" color={C.amber} />

            {/* Change Plan */}
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span style={{ fontSize: 10, color: C.muted, fontFamily: FONT }}>Change Plan</span>
              <div style={{ display: "flex", gap: 6 }}>
                {["free", "standard", "pro"].map(p => (
                  <Btn key={p} small variant={user.plan === p ? "primary" : "ghost"}
                    onClick={() => onPlanChange(user.id, p)}>
                    {p.toUpperCase()}
                  </Btn>
                ))}
              </div>
            </div>

            {/* Change Role */}
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span style={{ fontSize: 10, color: C.muted, fontFamily: FONT }}>Change Role</span>
              <div style={{ display: "flex", gap: 6 }}>
                {user.isAdmin ? (
                  <Btn small variant="ghost" onClick={() => onRoleChange(user.id, "user")}>Demote to User</Btn>
                ) : (
                  <Btn small variant="ghost" onClick={() => onRoleChange(user.id, "admin")}>Promote to Admin</Btn>
                )}
              </div>
            </div>

            {/* Suspend / Unsuspend */}
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span style={{ fontSize: 10, color: C.muted, fontFamily: FONT }}>Suspension</span>
              {user.suspended ? (
                <Btn small variant="ghost" onClick={() => onUnsuspend(user.id)}>Unsuspend User</Btn>
              ) : (
                <Btn small variant="ghost" onClick={() => onSuspend(user.id)}>
                  <span style={{ color: C.red }}>Suspend User</span>
                </Btn>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
}

// ── Main AdminPanel ───────────────────────────────────────────────────────────
function AdminPanel({ userId, isAdmin, onClose }) {
  const { isMobile, isCompact } = useViewport();
  const narrowLayout = isMobile || isCompact;
  const [tab, setTab] = useState("llm");
  const [llmConfig, setLlmConfig] = useState(null);
  const [users, setUsers] = useState([]);
  const [auditLog, setAuditLog] = useState([]);
  const [platformStats, setPlatformStats] = useState(null);
  const [signupCounts, setSignupCounts] = useState([]);
  const [feedback, setFeedback] = useState([]);
  const [feedbackFilter, setFeedbackFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState(null);
  const [showKey, setShowKey] = useState(false);

  // User list UI state
  const [sortCol, setSortCol] = useState("signupAt");
  const [sortDir, setSortDir] = useState("desc");
  const [userSearch, setUserSearch] = useState("");
  const [selectedUser, setSelectedUser] = useState(null);

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
      const [llmCfg, tierData, allUsers, log, stats, signups, fb] = await Promise.all([
        getPlatformConfig("llm"),
        getPlatformConfig("tier_policies"),
        fetchAdminUserStats(),
        fetchAuditLog(100),
        fetchPlatformStats().catch(() => null),
        fetchSignupCounts(30).catch(() => []),
        fetchFeedback({ limit: 200 }).catch(() => []),
      ]);
      setLlmConfig(llmCfg);
      if (tierData) {
        setTierPoliciesData(tierData);
        setTierPoliciesDraft(tierData);
      }
      setUsers(allUsers || []);
      setAuditLog(log || []);
      setPlatformStats(stats);
      setSignupCounts(signups || []);
      setFeedback(fb || []);
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

  // ── Tier policies state ──
  const [tierPoliciesData, setTierPoliciesData] = useState(null);
  const [tierPoliciesDraft, setTierPoliciesDraft] = useState(null);

  const handleSaveLlm = async () => {
    setSaving(true); setSaveStatus(null);
    try {
      const value = { provider, model, temperature, maxTokensPerRun: maxTokens, rateLimitPerHour: rateLimit };
      if (apiKey) value.apiKey = apiKey;
      await setPlatformConfig("llm", value, userId);
      await logAdminAction("update_config", null, "llm");
      setSaveStatus({ state: "success", message: "LLM configuration saved." });
    } catch (err) {
      setSaveStatus({ state: "error", message: err.message });
    }
    setSaving(false);
  };

  const handleSaveTierPolicies = async () => {
    setSaving(true); setSaveStatus(null);
    try {
      await setPlatformConfig("tier_policies", tierPoliciesDraft, userId);
      await logAdminAction("update_config", null, "tier_policies");
      setTierPoliciesData(tierPoliciesDraft);
      setSaveStatus({ state: "success", message: "Tier policies saved." });
    } catch (err) {
      setSaveStatus({ state: "error", message: err.message });
    }
    setSaving(false);
  };

  const handleRoleChange = async (targetId, role) => {
    try {
      const prev = users.find(u => u.id === targetId);
      await updateUserRole(targetId, role);
      await logAdminAction(role === "admin" ? "promote" : "demote", targetId, null, prev?.role, role);
      setUsers(us => us.map(u => u.id === targetId ? { ...u, role, isAdmin: role === "admin" } : u));
      setSelectedUser(su => su?.id === targetId ? { ...su, role, isAdmin: role === "admin" } : su);
    } catch (err) {
      setSaveStatus({ state: "error", message: err.message });
    }
  };

  const handlePlanChange = async (targetId, plan) => {
    try {
      const prev = users.find(u => u.id === targetId);
      await updateUserPlan(targetId, plan);
      await logAdminAction("update_plan", targetId, null, prev?.plan, plan);
      setUsers(us => us.map(u => u.id === targetId ? { ...u, plan } : u));
      setSelectedUser(su => su?.id === targetId ? { ...su, plan } : su);
    } catch (err) {
      setSaveStatus({ state: "error", message: err.message });
    }
  };

  const handleSuspend = async (targetId) => {
    try {
      await suspendUser(targetId);
      await logAdminAction("suspend", targetId);
      setUsers(us => us.map(u => u.id === targetId ? { ...u, suspended: true } : u));
      setSelectedUser(su => su?.id === targetId ? { ...su, suspended: true } : su);
    } catch (err) {
      setSaveStatus({ state: "error", message: err.message });
    }
  };

  const handleUnsuspend = async (targetId) => {
    try {
      await unsuspendUser(targetId);
      await logAdminAction("unsuspend", targetId);
      setUsers(us => us.map(u => u.id === targetId ? { ...u, suspended: false } : u));
      setSelectedUser(su => su?.id === targetId ? { ...su, suspended: false } : su);
    } catch (err) {
      setSaveStatus({ state: "error", message: err.message });
    }
  };

  const inp = (extra = {}) => ({
    background: C.bg, border: `1px solid ${C.border}`, borderRadius: 4,
    color: C.text, fontFamily: FONT, fontSize: 12,
    padding: "6px 10px", outline: "none", ...extra,
  });

  const newFeedbackCount = feedback.filter(f => f.status === "new").length;
  const TABS = [
    { id: "llm",      label: "LLM Provider" },
    { id: "limits",   label: "Tier Policies" },
    { id: "users",    label: "Users" },
    { id: "usage",    label: "Usage" },
    { id: "feedback", label: `Feedback${newFeedbackCount ? ` (${newFeedbackCount})` : ""}` },
    { id: "auditlog", label: "Audit Log" },
  ];

  if (!isAdmin) {
    return (
      <div style={{ color: C.muted, fontFamily: FONT, fontSize: 12, padding: 24, textAlign: "center" }}>
        Admin access required.
      </div>
    );
  }

  // Derived: filtered + sorted user list
  const filteredUsers = sortUsers(
    users.filter(u => !userSearch || (u.email || "").toLowerCase().startsWith(userSearch.toLowerCase())),
    sortCol,
    sortDir,
  );

  const SortTh = ({ col, label }) => {
    const active = sortCol === col;
    return (
      <th
        scope="col"
        onClick={() => { if (active) setSortDir(d => d === "asc" ? "desc" : "asc"); else { setSortCol(col); setSortDir("desc"); } }}
        style={{
          textAlign: "left", padding: "6px 10px",
          color: active ? C.accent : C.muted,
          fontWeight: 700, fontSize: 10, letterSpacing: 1,
          cursor: "pointer", userSelect: "none", whiteSpace: "nowrap",
        }}
      >
        {label}{active ? (sortDir === "asc" ? " ▲" : " ▼") : ""}
      </th>
    );
  };

  const kpiTileStyle = {
    background: C.surface, border: `1px solid ${C.border}`,
    borderRadius: 8, padding: "14px 18px",
    display: "flex", flexDirection: "column", gap: 4, flex: "1 1 120px",
  };

  return (
    <div style={{ maxWidth: 960, margin: "0 auto", padding: "20px 24px", display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        {onClose && <Btn small variant="ghost" onClick={onClose}>← Back</Btn>}
        <div style={{ fontSize: 18, fontWeight: 700, color: C.text, fontFamily: FONT }}>Admin Panel</div>
      </div>

      {/* Tabs */}
      <div role="tablist" style={{ display: "flex", flexWrap: isMobile ? "wrap" : "nowrap", gap: 2, background: C.surface, borderRadius: 6, padding: 2, width: isMobile ? "100%" : "fit-content" }}>
        {TABS.map(t => (
          <button key={t.id} role="tab" aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            style={{ background: tab === t.id ? C.panel : "transparent", border: "none", borderRadius: 4,
              color: tab === t.id ? C.text : C.muted, fontFamily: FONT, fontSize: 11, fontWeight: 700,
              padding: "7px 16px", cursor: "pointer", flex: isMobile ? "1 1 auto" : "none", textAlign: "center" }}>
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
              <div style={{ display: "grid", gridTemplateColumns: narrowLayout ? "1fr" : "180px 1fr", gap: narrowLayout ? 8 : 12, alignItems: narrowLayout ? "stretch" : "center" }}>
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
              {/* ── Tier Run Limits ── */}
              <SH label="Tier Run Limits" color={C.accent} />
              <InfoBox color={C.accent}>
                All limits are stored in Supabase (platform_config → tier_policies) and override the code defaults on a field-by-field basis. Changes take effect for new sessions immediately after saving.
              </InfoBox>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, fontFamily: FONT }}>
                  <thead>
                    <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                      {["Tier", "Max Replications", "Max C-event Scans", "Max Planned Rows", "Max Sim Time", "Disable Charts At"].map(h => (
                        <th key={h} style={{ textAlign: "left", padding: "6px 10px", color: C.muted, fontWeight: 700, fontSize: 10, letterSpacing: 1, whiteSpace: "nowrap" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {["free", "standard", "pro"].map(tierId => {
                      const defaults = RUN_ADMISSION_TIERS[tierId];
                      const draft = tierPoliciesDraft?.[tierId] || {};
                      const numFields = [
                        { key: "maxReplications", def: defaults.maxReplications },
                        { key: "maxScans",        def: defaults.maxScans },
                        { key: "maxPlannedRows",  def: defaults.maxPlannedRows },
                        { key: "maxSimTime",      def: defaults.maxSimTime },
                      ];
                      const tierColors = { free: C.muted, standard: C.accent, pro: C.server };
                      return (
                        <tr key={tierId} style={{ borderBottom: `1px solid ${C.border}30` }}>
                          <td style={{ padding: "6px 10px" }}>
                            <Tag label={tierId} color={tierColors[tierId] || C.muted} />
                          </td>
                          {numFields.map(({ key, def }) => (
                            <td key={key} style={{ padding: "4px 6px" }}>
                              <input
                                type="number"
                                min="1"
                                step="1"
                                value={draft[key] ?? def}
                                onChange={e => {
                                  const val = parseInt(e.target.value) || def;
                                  setTierPoliciesDraft(prev => ({
                                    ...RUN_ADMISSION_TIERS,
                                    ...(prev || {}),
                                    [tierId]: {
                                      ...RUN_ADMISSION_TIERS[tierId],
                                      ...((prev || {})[tierId] || {}),
                                      [key]: val,
                                    },
                                  }));
                                }}
                                style={{ ...inp({ color: C.accent, width: 100 }) }}
                              />
                            </td>
                          ))}
                          <td style={{ padding: "4px 6px" }}>
                            <select
                              value={draft.disableTimeSeriesAt ?? defaults.disableTimeSeriesAt}
                              onChange={e => {
                                const val = e.target.value;
                                setTierPoliciesDraft(prev => ({
                                  ...RUN_ADMISSION_TIERS,
                                  ...(prev || {}),
                                  [tierId]: {
                                    ...RUN_ADMISSION_TIERS[tierId],
                                    ...((prev || {})[tierId] || {}),
                                    disableTimeSeriesAt: val,
                                  },
                                }));
                              }}
                              style={{ ...inp({ color: C.accent, width: 110 }), cursor: "pointer" }}
                            >
                              <option value="medium">medium</option>
                              <option value="large">large</option>
                              <option value="too_large">too_large</option>
                              <option value="never">never</option>
                            </select>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* ── Plan → Tier Mapping ── */}
              <SH label="Plan → Tier Mapping" color={C.accent} />
              <InfoBox color={C.muted}>
                Controls which run tier each user plan receives. Admins always get Pro regardless of this mapping.
              </InfoBox>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {["free", "standard", "pro", "enterprise", "pro_plus"].map(planKey => {
                  const defaultMap = { free: "free", standard: "standard", pro: "standard", enterprise: "pro", pro_plus: "pro" };
                  const currentMap = tierPoliciesDraft?.plan_tier_map || {};
                  const current = currentMap[planKey] ?? defaultMap[planKey] ?? "free";
                  const tierColors = { free: C.muted, standard: C.accent, pro: C.server };
                  return (
                    <div key={planKey} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <div style={{ width: 110, fontSize: 11, fontFamily: FONT, color: C.text, fontWeight: 600 }}>
                        {planKey}
                      </div>
                      <div style={{ fontSize: 11, fontFamily: FONT, color: C.muted }}>→</div>
                      <div style={{ display: "flex", gap: 6 }}>
                        {["free", "standard", "pro"].map(tierId => (
                          <button
                            key={tierId}
                            onClick={() => setTierPoliciesDraft(prev => ({
                              ...(prev || {}),
                              plan_tier_map: {
                                free: "free", standard: "standard", pro: "standard", enterprise: "pro", pro_plus: "pro",
                                ...((prev || {}).plan_tier_map || {}),
                                [planKey]: tierId,
                              },
                            }))}
                            style={{
                              padding: "4px 12px",
                              borderRadius: 6,
                              border: `1px solid ${current === tierId ? tierColors[tierId] : C.border}`,
                              background: current === tierId ? `${tierColors[tierId]}20` : "transparent",
                              color: current === tierId ? tierColors[tierId] : C.muted,
                              fontFamily: FONT,
                              fontSize: 11,
                              fontWeight: current === tierId ? 700 : 400,
                              cursor: "pointer",
                            }}
                          >
                            {tierId}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>

              <Btn variant="primary" onClick={handleSaveTierPolicies} disabled={saving}>
                {saving ? "Saving…" : "Save Tier Policies"}
              </Btn>
            </div>
          )}

          {/* ── USERS ── */}
          {tab === "users" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <SH label="User Management" color={C.server} />

              {/* Search */}
              <input
                type="text"
                placeholder="Filter by email…"
                value={userSearch}
                onChange={e => setUserSearch(e.target.value)}
                style={{ ...inp(), maxWidth: 260 }}
                aria-label="Filter users by email"
              />

              {filteredUsers.length === 0 ? (
                <div style={{ fontSize: 12, color: C.muted, fontFamily: FONT, fontStyle: "italic" }}>No users found.</div>
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, fontFamily: FONT }}>
                    <thead>
                      <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                        <SortTh col="email"        label="Email" />
                        <SortTh col="role"         label="Role" />
                        <SortTh col="plan"         label="Plan" />
                        <SortTh col="signupAt"     label="Signed Up" />
                        <SortTh col="lastActiveAt" label="Last Active" />
                        <SortTh col="modelCount"   label="Models" />
                        <SortTh col="runsLast30d"  label="Runs (30d)" />
                        <SortTh col="runCount"     label="Total Runs" />
                        <th scope="col" style={{ padding: "6px 10px", color: C.muted, fontWeight: 700, fontSize: 10, letterSpacing: 1 }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredUsers.map(u => (
                        <tr
                          key={u.id}
                          onClick={() => setSelectedUser(u)}
                          style={{
                            borderBottom: `1px solid ${C.border}30`,
                            opacity: u.suspended ? 0.6 : 1,
                            cursor: "pointer",
                          }}
                          onMouseEnter={e => e.currentTarget.style.background = C.surfaceHover}
                          onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                        >
                          <td style={{ padding: "6px 10px", color: C.text, maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {u.email || u.id?.slice(0, 8)}
                          </td>
                          <td style={{ padding: "6px 10px" }}>
                            <Tag label={u.role || "user"} color={u.isAdmin ? C.accent : C.muted} />
                          </td>
                          <td style={{ padding: "6px 10px" }}>
                            <PlanBadge plan={u.plan} />
                          </td>
                          <td style={{ padding: "6px 10px", color: C.muted, whiteSpace: "nowrap" }}>
                            <span title={fullDate(u.signupAt)}>{relativeTime(u.signupAt)}</span>
                          </td>
                          <td style={{ padding: "6px 10px", color: C.muted, whiteSpace: "nowrap" }}>
                            <span title={fullDate(u.lastActiveAt)}>{relativeTime(u.lastActiveAt)}</span>
                          </td>
                          <td style={{ padding: "6px 10px", color: C.text, textAlign: "right" }}>{u.modelCount}</td>
                          <td style={{ padding: "6px 10px", color: C.text, textAlign: "right" }}>{u.runsLast30d}</td>
                          <td style={{ padding: "6px 10px", color: C.text, textAlign: "right" }}>{u.runCount}</td>
                          <td style={{ padding: "6px 10px" }} onClick={e => e.stopPropagation()}>
                            <div style={{ display: "flex", gap: 6 }}>
                              {u.id !== userId && (u.isAdmin ? (
                                <Btn small variant="ghost" onClick={() => handleRoleChange(u.id, "user")}>Demote</Btn>
                              ) : (
                                <Btn small variant="ghost" onClick={() => handleRoleChange(u.id, "admin")}>Promote</Btn>
                              ))}
                              {u.id !== userId && (u.suspended ? (
                                <Btn small variant="ghost" onClick={() => handleUnsuspend(u.id)}>Unsuspend</Btn>
                              ) : (
                                <Btn small variant="ghost" onClick={() => handleSuspend(u.id)}>Suspend</Btn>
                              ))}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ── USAGE ── */}
          {tab === "usage" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              <SH label="Platform Usage" color={C.accent} />

              {/* Section 1: KPI tiles */}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
                {[
                  { label: "Total users",       value: platformStats?.total_users  ?? "—", color: C.accent },
                  { label: "Active (7 days)",   value: platformStats?.active_7d    ?? "—", color: C.green },
                  { label: "Active (30 days)",  value: platformStats?.active_30d   ?? "—", color: C.amber },
                  { label: "Total models",      value: platformStats?.total_models ?? "—", color: C.server },
                ].map(tile => (
                  <div key={tile.label} style={kpiTileStyle}>
                    <div style={{ fontSize: 9, color: C.muted, fontFamily: FONT, letterSpacing: 1, textTransform: "uppercase" }}>{tile.label}</div>
                    <div style={{ fontSize: 26, fontWeight: 700, color: tile.color, fontFamily: FONT }}>{tile.value}</div>
                  </div>
                ))}
              </div>

              {/* Section 2: Usage table */}
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, fontFamily: FONT, letterSpacing: 1, textTransform: "uppercase" }}>
                  User Activity (sorted by runs last 30 days)
                </div>
                {users.length === 0 ? (
                  <div style={{ fontSize: 12, color: C.muted, fontFamily: FONT, fontStyle: "italic" }}>No users found.</div>
                ) : (
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, fontFamily: FONT }}>
                      <thead>
                        <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                          {["Email", "Plan", "Models", "Runs (30d)", "Total Runs", "Last Active"].map(h => (
                            <th key={h} scope="col" style={{ textAlign: "left", padding: "6px 10px", color: C.muted, fontWeight: 700, fontSize: 10, letterSpacing: 1 }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {[...users].sort((a, b) => (b.runsLast30d ?? 0) - (a.runsLast30d ?? 0)).map(u => (
                          <tr key={u.id} style={{ borderBottom: `1px solid ${C.border}20` }}>
                            <td style={{ padding: "6px 10px", color: C.text, maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {u.email || u.id?.slice(0, 8)}
                            </td>
                            <td style={{ padding: "6px 10px" }}><PlanBadge plan={u.plan} /></td>
                            <td style={{ padding: "6px 10px", color: C.text, textAlign: "right" }}>{u.modelCount}</td>
                            <td style={{ padding: "6px 10px", color: C.text, textAlign: "right" }}>{u.runsLast30d}</td>
                            <td style={{ padding: "6px 10px", color: C.text, textAlign: "right" }}>{u.runCount}</td>
                            <td style={{ padding: "6px 10px", color: C.muted, whiteSpace: "nowrap" }}>
                              <span title={fullDate(u.lastActiveAt)}>{relativeTime(u.lastActiveAt)}</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Section 3: Signups over time */}
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, fontFamily: FONT, letterSpacing: 1, textTransform: "uppercase" }}>
                  Signups — Last 30 Days
                </div>
                <SignupsBarChart data={signupCounts} />
              </div>
            </div>
          )}

          {/* ── FEEDBACK ── (from PR #115: feedback triage tab) */}
          {tab === "feedback" && (() => {
            const STATUS_COLORS = {
              new:       C.accent,
              reviewed:  C.amber,
              actioned:  C.green,
              dismissed: C.muted,
            };
            const CATEGORY_COLORS = {
              bug:      C.red,
              feature:  C.accent,
              question: C.amber,
              other:    C.muted,
            };
            const ALL_STATUSES = ["new", "reviewed", "actioned", "dismissed"];
            const filtered = feedbackFilter === "all"
              ? feedback
              : feedback.filter(f => f.status === feedbackFilter);
            const contactForFeedback = (fb) => {
              const matchedUser = fb.userId ? users.find(u => u.id === fb.userId) : null;
              return {
                primary: fb.replyEmail || fb.accountEmail || matchedUser?.email || (fb.userId ? `${fb.userId.slice(0, 8)}…` : "(anon)"),
                secondary: fb.replyEmail
                  ? (fb.accountEmail || matchedUser?.email || null)
                  : (fb.userId ? `${fb.userId.slice(0, 8)}…` : null),
              };
            };

            const handleStatusChange = async (id, status) => {
              try {
                await updateFeedbackStatus(id, status);
                setFeedback(prev => prev.map(f => f.id === id ? { ...f, status } : f));
              } catch (err) {
                setSaveStatus({ state: "error", message: err.message });
              }
            };

            return (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <SH label="Feedback Triage" color={C.accent} />
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                  <span style={{ fontSize: 11, color: C.muted, fontFamily: FONT }}>Filter:</span>
                  {["all", ...ALL_STATUSES].map(s => (
                    <button key={s} type="button" onClick={() => setFeedbackFilter(s)} style={{
                      background: feedbackFilter === s ? C.accent + "22" : "transparent",
                      border: `1px solid ${feedbackFilter === s ? C.accent : C.border}`,
                      borderRadius: 4, color: feedbackFilter === s ? C.accent : C.muted,
                      fontFamily: FONT, fontSize: 11, fontWeight: 600,
                      padding: "4px 10px", cursor: "pointer",
                    }}>
                      {s === "all"
                        ? `All (${feedback.length})`
                        : `${s} (${feedback.filter(f => f.status === s).length})`}
                    </button>
                  ))}
                  <button type="button" onClick={async () => {
                    setLoading(true);
                    try { const fb = await fetchFeedback({ limit: 200 }); setFeedback(fb || []); }
                    catch (err) { setSaveStatus({ state: "error", message: err.message }); }
                    setLoading(false);
                  }} style={{ marginLeft: "auto", background: "transparent", border: `1px solid ${C.border}`,
                    borderRadius: 4, color: C.muted, fontFamily: FONT, fontSize: 11,
                    padding: "4px 10px", cursor: "pointer" }}>↻ Refresh</button>
                </div>
                {filtered.length === 0 ? (
                  <div style={{ fontSize: 12, color: C.muted, fontFamily: FONT, fontStyle: "italic" }}>
                    No feedback submissions{feedbackFilter !== "all" ? ` with status "${feedbackFilter}"` : ""}.
                  </div>
                ) : (
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, fontFamily: FONT }}>
                    <thead>
                      <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                        {["Category", "Message", "Contact", "Version", "Date", "Status"].map(h => (
                          <th key={h} scope="col" style={{ textAlign: "left", padding: "6px 10px",
                            color: C.muted, fontWeight: 700, fontSize: 11, letterSpacing: 1 }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map(fb => {
                        const contact = contactForFeedback(fb);
                        return (
                        <tr key={fb.id} style={{ borderBottom: `1px solid ${C.border}20` }}>
                          <td style={{ padding: "6px 10px", whiteSpace: "nowrap" }}>
                            <Tag label={fb.category || "—"} color={CATEGORY_COLORS[fb.category] || C.muted} />
                          </td>
                          <td style={{ padding: "6px 10px", maxWidth: 320 }}>
                            <div style={{ color: C.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 300 }} title={fb.message}>{fb.message}</div>
                            {fb.pageContext && (<div style={{ fontSize: 9, color: C.muted, marginTop: 2 }}>{fb.pageContext}</div>)}
                          </td>
                          <td style={{ padding: "6px 10px", maxWidth: 220 }}>
                            <div style={{ color: C.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={contact.primary}>
                              {contact.primary}
                            </div>
                            {contact.secondary && (
                              <div style={{ fontSize: 9, color: C.muted, marginTop: 2 }} title={contact.secondary}>
                                {contact.secondary}
                              </div>
                            )}
                          </td>
                          <td style={{ padding: "6px 10px", color: C.muted, whiteSpace: "nowrap" }}>{fb.appVersion || "—"}</td>
                          <td style={{ padding: "6px 10px", color: C.muted, whiteSpace: "nowrap" }}>
                            {new Date(fb.createdAt).toLocaleDateString()}
                          </td>
                          <td style={{ padding: "6px 10px", whiteSpace: "nowrap" }}>
                            <select value={fb.status} onChange={e => handleStatusChange(fb.id, e.target.value)} style={{
                              background: C.bg, border: `1px solid ${STATUS_COLORS[fb.status] || C.border}`,
                              borderRadius: 4, color: STATUS_COLORS[fb.status] || C.text,
                              fontFamily: FONT, fontSize: 11, padding: "3px 6px", cursor: "pointer",
                            }}>
                              {ALL_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                          </td>
                        </tr>
                      )})}
                    </tbody>
                  </table>
                )}
              </div>
            );
          })()}

          {/* ── AUDIT LOG ── */}
          {tab === "auditlog" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <SH label="Admin Audit Log" color={C.amber} />
              <div style={{ fontSize: 11, color: C.muted, fontFamily: FONT }}>Last 100 admin actions.</div>
              {auditLog.length === 0 ? (
                <div style={{ fontSize: 12, color: C.muted, fontFamily: FONT, fontStyle: "italic" }}>No actions recorded yet.</div>
              ) : (
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, fontFamily: FONT }}>
                  <thead>
                    <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                      {["Time", "Action", "Target", "Detail"].map(h => (
                        <th key={h} scope="col" style={{ textAlign: "left", padding: "6px 10px", color: C.muted, fontWeight: 700, fontSize: 11, letterSpacing: 1 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {auditLog.map(entry => (
                      <tr key={entry.id} style={{ borderBottom: `1px solid ${C.border}20` }}>
                        <td style={{ padding: "6px 10px", color: C.muted, whiteSpace: "nowrap" }}>
                          {new Date(entry.createdAt).toLocaleString()}
                        </td>
                        <td style={{ padding: "6px 10px" }}>
                          <Tag label={entry.action} color={
                            entry.action === "suspend"     ? C.red    :
                            entry.action === "unsuspend"   ? C.green  :
                            entry.action === "promote"     ? C.accent :
                            entry.action === "update_plan" ? C.server : C.muted
                          } />
                        </td>
                        <td style={{ padding: "6px 10px", color: C.muted, fontSize: 10 }}>
                          {entry.targetId?.slice(0, 8) || entry.targetKey || "—"}
                        </td>
                        <td style={{ padding: "6px 10px", color: C.text }}>
                          {entry.oldValue && entry.newValue
                            ? `${entry.oldValue} → ${entry.newValue}`
                            : entry.oldValue || entry.newValue || "—"}
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

      {/* User detail drawer */}
      {selectedUser && (
        <UserDrawer
          user={selectedUser}
          currentUserId={userId}
          onClose={() => setSelectedUser(null)}
          onRoleChange={handleRoleChange}
          onPlanChange={handlePlanChange}
          onSuspend={handleSuspend}
          onUnsuspend={handleUnsuspend}
        />
      )}
    </div>
  );
}

export { AdminPanel };
