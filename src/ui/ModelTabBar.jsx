// ui/ModelTabBar.jsx — Two-level tab navigation: mode selector bar + contextual sub-tab bar
import { RADIUS, Z, alpha } from "./shared/tokens.js";
import { useTheme } from "./shared/ThemeContext.jsx";

// ── Inline SVG icons ─────────────────────────────────────────────────────────

const ic = (w, h, children) => (
  <svg width={w} height={h} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
);

// Primary bar — 13×13
const IconDraw     = () => ic(13, 13, <><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></>);
const IconDescribe = () => ic(13, 13, <><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/><path d="M5 3v4"/><path d="M3 5h4"/><path d="M19 17v4"/><path d="M17 19h4"/></>);
const IconDefine   = () => ic(13, 13, <><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></>);
const IconHealth   = () => ic(13, 13, <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>);

// Sub-bar — 11×11
const IconEntities  = () => ic(11, 11, <><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></>);
const IconQueues    = () => ic(11, 11, <><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></>);
const IconBEvents   = () => ic(11, 11, <><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></>);
const IconCEvents   = () => ic(11, 11, <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>);
const IconSections  = () => ic(11, 11, <><rect x="3" y="4" width="18" height="5" rx="1"/><rect x="3" y="15" width="18" height="5" rx="1"/><line x1="7" y1="9" x2="7" y2="15"/><line x1="17" y1="9" x2="17" y2="15"/></>);
const IconSchedules = () => ic(11, 11, <><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></>);
const IconModelData = () => ic(11, 11, <><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></>);
const IconGoals     = () => ic(11, 11, <><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></>);
const IconContainer = () => ic(11, 11, <><path d="M5 4h14l-1 16a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 4Z"/><line x1="4" y1="4" x2="20" y2="4"/><line x1="9" y1="11" x2="15" y2="11"/></>);

const SUB_ICONS = {
  entities: <IconEntities />,
  queues:   <IconQueues />,
  bevents:  <IconBEvents />,
  cevents:  <IconCEvents />,
  sections: <IconSections />,
  schedules:<IconSchedules />,
  goals:    <IconGoals />,
  state:    <IconModelData />,
  containers: <IconContainer />,
};

// ─────────────────────────────────────────────────────────────────────────────

const DEFINE_TAB_IDS = ["entities", "queues", "containers", "bevents", "cevents", "sections", "schedules", "goals", "state"];

export function ModelTabBar({
  tab, setTab,
  DISPLAY_MODES, activeMode, visibleSelectableTabs,
  validation, tabIssueCounts,
  isCompactLayout,
  showMoreTabs, setShowMoreTabs,
  aiSidebarOpen = false, onToggleAiSidebar = null,
  onPrintDefinition = null,
}) {
  const { C, FONT } = useTheme();

  const tabIssueLabel = tabId => {
    const counts = tabIssueCounts[tabId];
    if (!counts) return "";
    const parts = [];
    if (counts.errors) parts.push(`${counts.errors} error${counts.errors === 1 ? "" : "s"}`);
    if (counts.warnings) parts.push(`${counts.warnings} warning${counts.warnings === 1 ? "" : "s"}`);
    return parts.join(", ");
  };

  const tabIssueTooltip = tabId => {
    const errs = (validation.errors || []).filter(e => (e.tab || "overview") === tabId).slice(0, 2);
    const warns = (validation.warnings || []).filter(w => (w.tab || "overview") === tabId).slice(0, errs.length < 2 ? 2 - errs.length : 0);
    return [...errs.map(e => `Needs fixing: ${e.message}`), ...warns.map(w => `Worth checking: ${w.message}`)].join(" | ");
  };

  const isDesignMode = activeMode?.id === "design";
  const defineActive = DEFINE_TAB_IDS.includes(tab);

  const btnTabStyle = (active) => ({
    background: active ? C.accent : C.surface,
    border: `1px solid ${active ? C.accent : C.border}`,
    borderRadius: RADIUS.md,
    color: active ? C.bg : C.text,
    cursor: "pointer",
    display: "inline-flex", alignItems: "center", gap: 6,
    fontFamily: FONT, fontSize: 11, fontWeight: 600,
    padding: "5px 12px", whiteSpace: "nowrap",
  });

  const renderIssueBadge = (counts, tabId) => {
    if (counts?.errors > 0) return (
      <span
        aria-hidden="true"
        title={tabIssueTooltip(tabId)}
        onClick={(e) => { e.stopPropagation(); setTab("validate"); }}
        style={{
          background: C.errorBg, border: `1px solid ${C.danger}66`, borderRadius: 10,
          color: C.error, fontSize: 9, fontWeight: 700, padding: "1px 5px", cursor: "pointer",
        }}
      >
        {counts.errors}
      </span>
    );
    if (counts?.warnings > 0) return (
      <span
        aria-hidden="true"
        title={tabIssueTooltip(tabId)}
        onClick={(e) => { e.stopPropagation(); setTab("validate"); }}
        style={{
          background: alpha(C.amber, 0.15), border: `1px solid ${alpha(C.amber, 0.4)}`,
          borderRadius: 10, color: C.amber, fontSize: 9, fontWeight: 700, padding: "1px 5px", cursor: "pointer",
        }}
      >
        {counts.warnings}
      </span>
    );
    return null;
  };

  const COMPACT_HIDDEN = ["access", "history", "validate", "versions"];
  const primaryTabs = isCompactLayout ? visibleSelectableTabs.filter(t => !COMPACT_HIDDEN.includes(t.id)) : visibleSelectableTabs;
  const moreTabs = isCompactLayout ? visibleSelectableTabs.filter(t => COMPACT_HIDDEN.includes(t.id)) : [];
  const activeInMore = moreTabs.some(t => t.id === tab);

  const renderTab = t => {
    if (t.disabled) return (
      <div key={t.id} style={{ fontSize: 9, color: C.muted, fontFamily: FONT, letterSpacing: 1.2, fontWeight: 700, padding: "10px 8px", whiteSpace: "nowrap", userSelect: "none", opacity: 0.5 }}>
        {t.label}
      </div>
    );
    const accessibleLabel = t.id === "ai" ? "AI Designer" : t.label;
    const issueCounts = tabIssueCounts[t.id];
    return (
      <button key={t.id} type="button" role="tab" aria-selected={tab === t.id}
        aria-label={`${accessibleLabel}${tabIssueLabel(t.id) ? `, ${tabIssueLabel(t.id)}` : ""}`}
        onClick={() => { setTab(t.id); setShowMoreTabs(false); }}
        style={{
          background: "none", border: "none", whiteSpace: "nowrap",
          borderBottom: tab === t.id ? `2px solid ${C.accent}` : "2px solid transparent",
          color: tab === t.id ? C.accent : C.muted, fontFamily: FONT, fontSize: 12,
          padding: "10px 16px", cursor: "pointer", fontWeight: tab === t.id ? 700 : 400,
          display: "inline-flex", alignItems: "center", gap: 6,
          position: "relative",
        }}
      >
        <span>{t.label}</span>
        {renderIssueBadge(issueCounts, t.id)}
      </button>
    );
  };

  // Design mode: icon pill buttons + Define sub-bar
  const renderDesignBar = () => {
    const drawTab     = visibleSelectableTabs.find(t => t.id === "visual");
    const describeTab = visibleSelectableTabs.find(t => t.id === "ai");
    const defineTabs  = visibleSelectableTabs.filter(t => DEFINE_TAB_IDS.includes(t.id));
    const validateTab = visibleSelectableTabs.find(t => t.id === "validate");
    const firstDefineTab = defineTabs[0];

    return (
      <>
        {/* Primary Design bar */}
        <div style={{
          display: "flex", alignItems: "center", gap: 6,
          padding: "8px 16px",
          borderBottom: defineActive ? "none" : `1px solid ${C.border}`,
          background: C.surface, flexShrink: 0, flexWrap: "wrap",
        }}>
          {drawTab && (
            <button type="button" aria-pressed={tab === "visual"}
              onClick={() => setTab("visual")}
              style={btnTabStyle(tab === "visual")}
            >
              <IconDraw />
              Draw
            </button>
          )}
          {describeTab && (
            <button type="button" aria-pressed={tab === "ai"}
              onClick={() => setTab("ai")}
              style={btnTabStyle(tab === "ai")}
            >
              <IconDescribe />
              Describe
            </button>
          )}
          {defineTabs.length > 0 && (
            <button type="button" aria-pressed={defineActive}
              onClick={() => { if (!defineActive && firstDefineTab) setTab(firstDefineTab.id); }}
              style={btnTabStyle(defineActive)}
            >
              <IconDefine />
              Define
            </button>
          )}
          {validateTab && (
            <button type="button" aria-pressed={tab === "validate"}
              onClick={() => setTab("validate")}
              style={btnTabStyle(tab === "validate")}
            >
              <IconHealth />
              Model Health
              {renderIssueBadge(tabIssueCounts["validate"], "validate")}
            </button>
          )}
          <div style={{ flex: 1 }} />
          {onPrintDefinition && (
            <button type="button" title="View model definition" onClick={onPrintDefinition}
              style={btnTabStyle(false)}>
              View definition
            </button>
          )}
        </div>

        {/* Define sub-bar — shown when any define tab is active */}
        {defineActive && defineTabs.length > 0 && (
          <div style={{
            display: "flex", alignItems: "center", gap: 4,
            padding: "5px 16px 5px 32px",
            borderBottom: `1px solid ${C.border}`,
            background: C.bg, flexShrink: 0, flexWrap: "wrap",
          }}>
            {defineTabs.map(t => {
              const issueCounts = tabIssueCounts[t.id];
              const isActive = tab === t.id;
              return (
                <button key={t.id} type="button" aria-pressed={isActive}
                  onClick={() => setTab(t.id)}
                  style={{
                    background: isActive ? C.panel : "transparent",
                    border: `1px solid ${isActive ? C.border : "transparent"}`,
                    borderRadius: RADIUS.md,
                    color: isActive ? C.text : C.muted,
                    cursor: "pointer",
                    display: "inline-flex", alignItems: "center", gap: 5,
                    fontFamily: FONT, fontSize: 11, fontWeight: isActive ? 600 : 400,
                    padding: "4px 9px", whiteSpace: "nowrap",
                  }}
                >
                  {SUB_ICONS[t.id]}
                  <span>{t.label}</span>
                  {renderIssueBadge(issueCounts, t.id)}
                </button>
              );
            })}
          </div>
        )}
      </>
    );
  };

  return (
    <>
      {/* Mode selector bar */}
      <div aria-label={isCompactLayout ? "Mobile model workflow" : "Model workflow modes"} style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 6, padding: "8px 16px", borderBottom: `1px solid ${C.border}`, background: C.bg, flexShrink: 0 }}>
        {DISPLAY_MODES.map(mode => {
          const selected = activeMode.id === mode.id;
          const modeCounts = mode.tabs.filter(t => t !== "validate").reduce((acc, tabId) => {
            const counts = tabIssueCounts[tabId] || {};
            return { errors: acc.errors + (counts.errors || 0), warnings: acc.warnings + (counts.warnings || 0) };
          }, { errors: 0, warnings: 0 });
          return (
            <button
              key={mode.id} type="button" aria-pressed={selected}
              onClick={() => setTab(mode.primaryTab)}
              style={{
                background: selected ? C.panel : C.surface,
                border: `1px solid ${selected ? C.accent : C.border}`,
                borderRadius: 6, color: selected ? C.accent : C.text,
                cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6,
                flexShrink: 0, fontFamily: FONT, fontSize: 11, fontWeight: 700,
                padding: "7px 10px", whiteSpace: "nowrap",
              }}
            >
              <span>{mode.label}</span>
              {modeCounts.errors > 0 && (
                <span
                  aria-hidden="true"
                  title={`${modeCounts.errors} error${modeCounts.errors !== 1 ? "s" : ""} in ${mode.label} mode — click to view details`}
                  onClick={(e) => { e.stopPropagation(); setTab("validate"); }}
                  style={{
                    background: C.errorBg, border: `1px solid ${C.danger}66`,
                    borderRadius: 10, color: C.error, fontSize: 9, padding: "1px 5px",
                    cursor: "pointer",
                  }}
                >
                  {modeCounts.errors}
                </span>
              )}
              {!modeCounts.errors && modeCounts.warnings > 0 && (
                <span
                  aria-hidden="true"
                  title={`${modeCounts.warnings} warning${modeCounts.warnings !== 1 ? "s" : ""} in ${mode.label} mode — click to view details`}
                  onClick={(e) => { e.stopPropagation(); setTab("validate"); }}
                  style={{
                    background: alpha(C.amber, 0.15), border: `1px solid ${alpha(C.amber, 0.4)}`,
                    borderRadius: 10, color: C.amber, fontSize: 9, padding: "1px 5px",
                    cursor: "pointer",
                  }}
                >
                  {modeCounts.warnings}
                </span>
              )}
            </button>
          );
        })}
        {onToggleAiSidebar && (
          <>
            <div style={{ width: 1, background: C.border, margin: "6px 4px", alignSelf: "stretch" }} />
            <button
              type="button"
              aria-pressed={aiSidebarOpen}
              onClick={onToggleAiSidebar}
              title="Simulation Assistant — ask for help building or improving this model"
              style={{
                background: aiSidebarOpen ? C.panel : C.surface,
                border: `1px solid ${aiSidebarOpen ? C.accent : C.border}`,
                borderRadius: 6, color: aiSidebarOpen ? C.accent : C.text,
                cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6,
                flexShrink: 0, fontFamily: FONT, fontSize: 11, fontWeight: 700,
                padding: "7px 10px", whiteSpace: "nowrap",
              }}
            >
              <span aria-hidden="true">✨</span>
              Simulation Assistant
            </button>
          </>
        )}
      </div>

      {/* Contextual sub-tab bar */}
      {isDesignMode ? (
        renderDesignBar()
      ) : visibleSelectableTabs.length > 1 && (
        <div style={{ display: "flex", alignItems: "stretch", borderBottom: `1px solid ${C.border}`, background: C.surface, flexShrink: 0, minWidth: 0 }}>
          <div role="tablist" aria-label="Model sections" style={{ display: "flex", paddingLeft: 12, flex: 1, minWidth: 0, overflowX: "auto" }}>
            {primaryTabs.map(renderTab)}
            {moreTabs.length > 0 && (
              <div style={{ position: "relative" }}>
                <button type="button"
                  aria-expanded={showMoreTabs} aria-haspopup="true"
                  onClick={() => setShowMoreTabs(v => !v)}
                  style={{
                    background: "none", border: "none", whiteSpace: "nowrap",
                    borderBottom: activeInMore ? `2px solid ${C.accent}` : "2px solid transparent",
                    color: activeInMore ? C.accent : C.muted, fontFamily: FONT, fontSize: 12,
                    padding: "10px 16px", cursor: "pointer", fontWeight: activeInMore ? 700 : 400,
                  }}>
                  More sections ▾
                </button>
                {showMoreTabs && (
                  <div role="listbox" style={{
                    position: "absolute", top: "100%", right: 0,
                    background: C.panel, border: `1px solid ${C.border}`, borderRadius: RADIUS.md,
                    zIndex: Z.dropdown, minWidth: 140, boxShadow: "0 4px 12px rgba(0,0,0,0.3)", padding: 4,
                  }}>
                    {moreTabs.map(t => (
                      <button key={t.id} type="button" role="option" aria-selected={tab === t.id}
                        onClick={() => { setTab(t.id); setShowMoreTabs(false); }}
                        style={{
                          display: "block", width: "100%", textAlign: "left",
                          background: tab === t.id ? alpha(C.accent, 0.1) : "transparent",
                          border: "none", borderRadius: RADIUS.sm,
                          color: tab === t.id ? C.accent : C.text,
                          fontFamily: FONT, fontSize: 12, padding: "8px 12px", cursor: "pointer",
                        }}>
                        {t.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
