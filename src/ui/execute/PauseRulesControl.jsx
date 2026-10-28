// "Pause when…" button and panel for Auto Run (roadmap #6). The rules
// themselves are checked in ExecutePanel's Auto Run tick; see pauseRules.js.
import { useCallback, useEffect, useRef, useState } from "react";
import { Btn } from "../shared/components.jsx";
import { useTheme } from "../shared/ThemeContext.jsx";
import { ResponsivePanel } from "../shared/ResponsivePanel.jsx";
import { PAUSE_RULE_KINDS, describeRule, isRuleReady, loadPauseRules, newRuleId, savePauseRules } from "./pauseRules.js";

/** The model's pause rules, loaded from and saved to this browser. */
export function usePauseRules(modelId) {
  const [rules, setRulesState] = useState(() => loadPauseRules(modelId));
  const rulesRef = useRef(rules);
  useEffect(() => {
    const loaded = loadPauseRules(modelId);
    rulesRef.current = loaded;
    setRulesState(loaded);
  }, [modelId]);
  const setRules = useCallback(next => {
    rulesRef.current = next;
    setRulesState(next);
    savePauseRules(modelId, next);
  }, [modelId]);
  return { rules, setRules, rulesRef };
}

export { createPauseWatcher } from "./pauseRules.js";

/** Why Auto Run last stopped on a pause condition. */
export function PauseHitBanner({ hit, onDismiss }) {
  const { C, FONT } = useTheme();
  if (!hit) return null;
  return (
    <div role="status" data-testid="pause-hit-banner" style={{ background: C.accent + "18", border: `1px solid ${C.accent}55`, borderRadius: 8, padding: "8px 12px", display: "flex", gap: 10, alignItems: "center", fontSize: 12, color: C.text, fontFamily: FONT }}>
      <span style={{ flex: 1, minWidth: 0, overflowWrap: "anywhere" }}>⏸ {hit.message} Press Auto Run to carry on.</span>
      <Btn small variant="ghost" ariaLabel="Dismiss pause message" onClick={onDismiss}>✕</Btn>
    </div>
  );
}

export function PauseRulesControl({ model, rules, setRules, small = false }) {
  const queueNames = (model?.queues || []).map(q => q?.name).filter(Boolean);
  const { C, FONT } = useTheme();
  const [open, setOpen] = useState(false);
  const anchorRef = useRef(null);
  const close = useCallback(() => setOpen(false), []);
  const activeCount = rules.filter(isRuleReady).length;

  const update = (id, patch) => setRules(rules.map(r => (r.id === id ? { ...r, ...patch } : r)));
  const remove = id => setRules(rules.filter(r => r.id !== id));
  const add = () => setRules([...rules, { id: newRuleId(), kind: "enter", queue: queueNames[0] || "", count: 5, time: "", enabled: true }]);

  const field = { padding: "4px 6px", border: `1px solid ${C.border}`, borderRadius: 4, fontSize: 12, background: C.surface, color: C.text, fontFamily: FONT, minWidth: 0 };

  return (
    <div ref={anchorRef} style={{ position: "relative" }}>
      <Btn small={small} variant={activeCount ? "primary" : "ghost"} onClick={() => setOpen(v => !v)}
        title="Stop Auto Run automatically when something happens in the model">
        {activeCount ? `⏸ Pause when… (${activeCount})` : "⏸ Pause when…"}
      </Btn>
      <ResponsivePanel open={open} onClose={close} anchorRef={anchorRef} title="Pause Auto Run when…" testId="pause-rules-panel"
        footer={
          <div style={{ display: "flex", gap: 8, justifyContent: "space-between", flexWrap: "wrap" }}>
            <Btn small variant="ghost" onClick={add}>+ Add condition</Btn>
            <Btn small variant="ghost" disabled={!rules.length} onClick={() => setRules([])}>Clear all</Btn>
          </div>
        }>
        <div style={{ fontSize: 11, color: C.muted, fontFamily: FONT, lineHeight: 1.5 }}>
          Auto Run stops as soon as any condition below becomes true. Press Auto Run again to carry on. Conditions are saved in this browser for this model and do not change the model.
        </div>
        {rules.length === 0 && (
          <div style={{ fontSize: 12, color: C.muted, fontFamily: FONT }}>No conditions yet.</div>
        )}
        {rules.map(rule => (
          <div key={rule.id} data-testid="pause-rule" style={{ border: `1px solid ${C.border}`, borderRadius: 6, padding: 8, display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <input type="checkbox" aria-label={`Use condition: ${describeRule(rule)}`} checked={rule.enabled !== false}
                onChange={e => update(rule.id, { enabled: e.target.checked })} />
              <select aria-label="Condition type" value={rule.kind} style={{ ...field, flex: 1 }}
                onChange={e => update(rule.id, { kind: e.target.value })}>
                {PAUSE_RULE_KINDS.map(k => <option key={k.value} value={k.value}>{k.label}</option>)}
              </select>
              <Btn small variant="ghost" title="Remove condition" ariaLabel="Remove condition" onClick={() => remove(rule.id)}>✕</Btn>
            </div>
            <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
              {rule.kind !== "time" && (
                <select aria-label="Queue" value={rule.queue || ""} style={{ ...field, flex: "1 1 140px" }}
                  onChange={e => update(rule.id, { queue: e.target.value })}>
                  <option value="">Choose a queue…</option>
                  {queueNames.map(q => <option key={q} value={q}>{q}</option>)}
                </select>
              )}
              {rule.kind === "depth" && (
                <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12, color: C.text, fontFamily: FONT }}>
                  at least
                  <input type="number" min={1} step={1} aria-label="Queue length" value={rule.count ?? ""} style={{ ...field, width: 64 }}
                    onChange={e => update(rule.id, { count: e.target.value === "" ? "" : Math.max(1, Math.round(Number(e.target.value))) })} />
                  waiting
                </label>
              )}
              {rule.kind === "time" && (
                <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12, color: C.text, fontFamily: FONT }}>
                  t =
                  <input type="number" min={0} aria-label="Simulation time" value={rule.time ?? ""} style={{ ...field, width: 96 }}
                    onChange={e => update(rule.id, { time: e.target.value })} />
                </label>
              )}
            </div>
          </div>
        ))}
      </ResponsivePanel>
    </div>
  );
}
