// ui/editors/GoalsEditor.jsx — Performance goals editor
import { C, FONT, alpha } from "../shared/tokens.js";
import { Btn, SH, InfoBox, Empty } from "../shared/components.jsx";

// Values must match aggregateStats keys used by buildGoalGaps in prompts.js
const METRICS = [
  { value: "summary.avgWait",    label: "Average wait time",      unit: "time units" },
  { value: "summary.avgSvc",     label: "Average service time",   unit: "time units" },
  { value: "summary.avgSojourn", label: "Average sojourn time",   unit: "time units" },
  { value: "summary.served",     label: "Customers served",       unit: "entities"   },
  { value: "summary.reneged",    label: "Customers reneged",      unit: "entities"   },
  { value: "summary.totalCost",  label: "Total cost",             unit: "cost units" },
];

// Backward-compat: old short keys → new full keys
const METRIC_LEGACY = {
  avgWait:    "summary.avgWait",
  avgSvc:     "summary.avgSvc",
  avgSojourn: "summary.avgSojourn",
  served:     "summary.served",
  reneged:    "summary.reneged",
  totalCost:  "summary.totalCost",
  maxWait:    "summary.avgWait",
  renegeRate: "summary.reneged",
  utilisation:"summary.avgSvc",
};

const normaliseMetric = v => METRIC_LEGACY[v] || v;

const OPERATORS = [
  { value: "<",  label: "<  (at most)" },
  { value: "<=", label: "<= (at most)" },
  { value: ">",  label: ">  (at least)" },
  { value: ">=", label: ">= (at least)" },
];

export function GoalsEditor({ goals = [], onChange }) {
  const add = () => onChange([...goals, {
    id: "g" + Date.now(),
    metric: "summary.avgWait",
    target: "",
    operator: "<",
    label: "",
  }]);
  const upd = (i, patch) => {
    const n = [...goals];
    n[i] = { ...n[i], ...patch };
    onChange(n);
  };
  const rem = (i) => onChange(goals.filter((_, idx) => idx !== i));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <SH label="Performance Goals" color={C.purple}>
        <Btn small variant="ghost" onClick={add}>+ Add Goal</Btn>
      </SH>
      <InfoBox color={C.purple}>
        Set target KPIs for your model. The AI analysis panel will compare simulation
        results against these targets when generating insights.
      </InfoBox>
      {goals.length === 0 && (
        <Empty icon="🎯" msg="No targets set yet. Add a target if you want the tool to judge whether results are good enough."
          action={{ label: "+ Add Goal", onClick: add }} />
      )}
      {goals.map((g, i) => {
        const normMetric = normaliseMetric(g.metric);
        const metricDef = METRICS.find(m => m.value === normMetric);
        const target = parseFloat(g.target);
        const isValid = !isNaN(target) && target > 0;
        return (
          <div key={g.id} style={{
            background: C.bg, border: `1px solid ${alpha(C.purple, 0.27)}`,
            borderRadius: 6, padding: 12, display: "flex",
            flexDirection: "column", gap: 8,
          }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <select value={normMetric} onChange={e => upd(i, { metric: e.target.value })}
                style={{ background: C.bg, border: `1px solid ${alpha(C.purple, 0.33)}`, borderRadius: 4,
                  color: C.purple, fontFamily: FONT, fontSize: 12, padding: "5px 8px", outline: "none" }}>
                {METRICS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
              <select value={g.operator} onChange={e => upd(i, { operator: e.target.value })}
                style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 4,
                  color: C.text, fontFamily: FONT, fontSize: 12, padding: "5px 8px", outline: "none", width: 90 }}>
                {OPERATORS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              <input type="number" min="0" step="0.1" value={g.target}
                aria-label="Target value"
                onChange={e => upd(i, { target: e.target.value })} placeholder="Target value"
                style={{ width: 100, background: "transparent", border: `1px solid ${isValid ? C.amber : C.border}`,
                  borderRadius: 4, color: C.amber, fontFamily: FONT, fontSize: 12,
                  padding: "5px 8px", outline: "none" }} />
              {metricDef && <span style={{ fontSize: 11, color: C.muted, fontFamily: FONT }}>{metricDef.unit}</span>}
              <input value={g.label} onChange={e => upd(i, { label: e.target.value })}
                aria-label="Goal label (optional)"
                placeholder="Short label (optional)" maxLength={60}
                style={{ flex: 1, minWidth: 140, background: "transparent", border: `1px solid ${alpha(C.border, 0.25)}`,
                  borderRadius: 4, color: C.muted, fontFamily: FONT, fontSize: 11,
                  padding: "5px 8px", outline: "none" }} />
              <Btn small variant="danger" ariaLabel={`Remove goal ${i + 1}`} onClick={() => rem(i)}>✕</Btn>
            </div>
            {g.label && isValid && (
              <div style={{ fontSize: 11, color: C.muted, fontFamily: FONT }}>
                → <span style={{ color: C.purple }}>{g.label}</span>{' '}
                ({metricDef?.label || normMetric} {g.operator} {g.target} {metricDef?.unit || ""})
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
