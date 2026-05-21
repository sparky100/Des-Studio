// ui/ModelTabBar.jsx — Two-level tab navigation: mode selector bar + contextual sub-tab bar
import { C, FONT, RADIUS, Z, alpha } from "./shared/tokens.js";

export function ModelTabBar({
  tab, setTab,
  DISPLAY_MODES, activeMode, visibleSelectableTabs,
  validation, tabIssueCounts,
  isCompactLayout,
  showMoreTabs, setShowMoreTabs,
}) {
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
        }}
      >
        <span>{t.label}</span>
        {tabIssueCounts[t.id]?.errors > 0 && (
          <span aria-hidden="true" title={tabIssueTooltip(t.id)} style={{ background: C.errorBg, border: `1px solid ${C.danger}66`, borderRadius: 10, color: C.error, fontSize: 9, fontWeight: 700, padding: "1px 5px" }}>
            {tabIssueCounts[t.id].errors}
          </span>
        )}
        {!tabIssueCounts[t.id]?.errors && tabIssueCounts[t.id]?.warnings > 0 && (
          <span aria-hidden="true" title={tabIssueTooltip(t.id)} style={{ background: C.warmup, border: `1px solid ${C.amber}66`, borderRadius: 10, color: C.warnBg, fontSize: 9, fontWeight: 700, padding: "1px 5px" }}>
            {tabIssueCounts[t.id].warnings}
          </span>
        )}
      </button>
    );
  };

  return (
    <>
      {/* Mode selector bar */}
      <div aria-label={isCompactLayout ? "Mobile model workflow" : "Model workflow modes"} style={{ display: "flex", alignItems: "stretch", gap: 8, padding: "8px 20px", borderBottom: `1px solid ${C.border}`, background: C.bg, overflowX: "auto", flexShrink: 0 }}>
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
                <span aria-hidden="true" style={{ background: C.errorBg, border: `1px solid ${C.danger}66`, borderRadius: 10, color: C.error, fontSize: 9, padding: "1px 5px" }}>
                  {modeCounts.errors}
                </span>
              )}
              {!modeCounts.errors && modeCounts.warnings > 0 && (
                <span aria-hidden="true" style={{ background: C.warmup, border: `1px solid ${C.amber}66`, borderRadius: 10, color: C.warnBg, fontSize: 9, padding: "1px 5px" }}>
                  {modeCounts.warnings}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Contextual sub-tab bar */}
      {visibleSelectableTabs.length > 1 && (
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
