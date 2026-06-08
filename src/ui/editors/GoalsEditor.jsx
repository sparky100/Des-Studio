import { alpha } from "../shared/tokens.js";
import { Btn, SH, InfoBox, Empty } from "../shared/components.jsx";
import { useTheme } from "../shared/ThemeContext.jsx";

const METRICS = [
  { value: "summary.avgWait",        label: "Average wait time",           unit: "time units", type: "time",      scope: "queue" },
  { value: "summary.avgSvc",         label: "Average service time",        unit: "time units", type: "time",      scope: null },
  { value: "summary.avgSojourn",     label: "Average sojourn time",        unit: "time units", type: "time",      scope: null },
  { value: "summary.avgWIP",         label: "Average queue depth",         unit: "entities",   type: "queue",     scope: "queue" },
  { value: "summary.maxWIP",         label: "Maximum queue depth",         unit: "entities",   type: "queue",     scope: "queue" },
  { value: "summary.served",         label: "Customers served",            unit: "entities",   type: "count",     scope: "queue" },
  { value: "summary.reneged",        label: "Customers reneged",           unit: "entities",   type: "count",     scope: "queue" },
  { value: "summary.totalCost",      label: "Total cost",                  unit: "cost units", type: "cost",      scope: null },
  { value: "summary.costPerServed",  label: "Cost per served entity",      unit: "cost units", type: "cost",      scope: null },
  { value: "resource.utilisation",   label: "Resource utilisation",        unit: "%",          type: "resource",  scope: "resource" },
  { value: "container.minLevel",     label: "Minimum container level",     unit: "units",      type: "container", scope: "container" },
  { value: "container.avgLevel",     label: "Average container level",     unit: "units",      type: "container", scope: "container" },
  { value: "container.maxLevel",     label: "Maximum container level",     unit: "units",      type: "container", scope: "container" },
];

const METRIC_BY_VALUE = Object.fromEntries(METRICS.map(m => [m.value, m]));

const OPERATORS = [
  { value: "<",  label: "<"  },
  { value: "<=", label: "≤"  },
  { value: ">",  label: ">"  },
  { value: ">=", label: "≥"  },
];

const PERCENTILE_OPS = [
  { value: "p50", label: "p50 <" },
  { value: "p75", label: "p75 <" },
  { value: "p90", label: "p90 <" },
  { value: "p95", label: "p95 <" },
  { value: "p99", label: "p99 <" },
];

const COUNT_METRICS = new Set(["summary.served", "summary.reneged", "summary.avgWIP", "summary.maxWIP"]);

const METRIC_LEGACY = {
  avgWait:    "summary.avgWait",
  avgSvc:     "summary.avgSvc",
  avgSojourn: "summary.avgSojourn",
  avgWIP:     "summary.avgWIP",
  served:     "summary.served",
  reneged:    "summary.reneged",
  totalCost:  "summary.totalCost",
  maxWait:    "summary.avgWait",
  renegeRate: "summary.reneged",
  utilisation:"summary.avgSvc",
};

const normaliseMetric = v => METRIC_LEGACY[v] || v;

function operatorsFor(metricValue) {
  const m = METRIC_BY_VALUE[metricValue];
  if (m?.type === "time") return [...OPERATORS, ...PERCENTILE_OPS];
  return OPERATORS;
}

function describeGoal(g, metricDef) {
  if (!metricDef) return null;
  const scopeName = g.scope?.name;
  const prefix = scopeName ? `${scopeName} ` : "";
  const op = g.operator?.startsWith("p")
    ? `${g.operator.replace("p", "")}th percentile <`
    : g.operator;
  return `${prefix}${metricDef.label}: ${op} ${g.target} ${metricDef.unit}`;
}

export function GoalsEditor({ goals = [], onChange, queues = [], entityTypes = [], containerTypes = [] }) {
  const { C, FONT } = useTheme();

  const scopeList = (scopeType) => {
    if (!scopeType) return [];
    if (scopeType === "queue") return [
      { value: "", id: "", name: "", label: "All queues" },
      ...(queues || []).map(q => ({ value: q.id, id: q.id, name: q.name, label: q.name })),
    ];
    if (scopeType === "resource") return (entityTypes || []).map(et => ({
      value: et.id, id: et.id, name: et.name, label: et.name,
    }));
    if (scopeType === "container") return (containerTypes || []).map(ct => ({
      value: ct.id, id: ct.id, name: ct.name, label: ct.name,
    }));
    return [];
  };

  const add = () => onChange([...goals, {
    id: "g" + Date.now(),
    metric: "summary.avgWait",
    target: "",
    operator: "<",
    label: "",
    scope: null,
  }]);

  const upd = (i, patch) => {
    const n = [...goals];
    n[i] = { ...n[i], ...patch };
    onChange(n);
  };

  const setMetric = (i, value) => {
    const def = METRIC_BY_VALUE[value];
    const patch = { metric: value };
    if (def?.scope === "queue") {
      patch.scope = null;
    } else if (def?.scope === "resource" || def?.scope === "container") {
      const options = scopeList(def.scope);
      const first = options[0];
      patch.scope = first ? { type: def.scope, id: first.id, name: first.name } : null;
    } else {
      patch.scope = null;
    }
    upd(i, patch);
  };

  const setScope = (i, scopeType, scopeValue) => {
    if (!scopeValue) {
      upd(i, { scope: null });
      return;
    }
    const options = scopeList(scopeType);
    const sel = options.find(o => o.id === scopeValue);
    upd(i, { scope: sel ? { type: scopeType, id: sel.id, name: sel.name } : null });
  };

  const rem = i => onChange(goals.filter((_, idx) => idx !== i));

  const selectStyle = {
    background: C.bg, border: `1px solid ${C.border}`, borderRadius: 4,
    color: C.text, fontFamily: FONT, fontSize: 12, padding: "5px 7px", outline: "none",
  };
  const inputStyle = (valid) => ({
    background: "transparent", border: `1px solid ${valid ? C.amber : C.border}`,
    borderRadius: 4, color: valid ? C.amber : C.text, fontFamily: FONT, fontSize: 12,
    padding: "5px 8px", outline: "none",
  });

  const hasResources = (entityTypes || []).length > 0;
  const hasContainers = (containerTypes || []).length > 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <SH label="Performance Goals" color={C.purple}>
        <Btn small variant="ghost" onClick={add}>+ Add Goal</Btn>
      </SH>
      <InfoBox color={C.purple}>
        Set target KPIs for your model. The AI analysis panel will compare simulation results against
        these targets when generating insights. Time metrics support percentile operators (e.g. p90 {"<"} 10 means
        the 90th percentile is below the target).
      </InfoBox>
      {goals.length === 0 && (
        <Empty icon="🎯" msg="No targets set yet. Add a target if you want the tool to judge whether results are good enough."
          action={{ label: "+ Add Goal", onClick: add }} />
      )}
      {goals.map((g, i) => {
        const normMetric = normaliseMetric(g.metric);
        const def = METRIC_BY_VALUE[normMetric];
        const target = parseFloat(g.target);
        const isValid = !isNaN(target) && target > 0;
        const ops = operatorsFor(normMetric);
        const scope = def?.scope;
        const scopeOpts = scopeList(scope);
        const needsScope = scope && (scope === "resource" || scope === "container");
        const desc = describeGoal(g, def);
        return (
          <div key={g.id} style={{
            background: C.bg, border: `1px solid ${alpha(C.purple, 0.27)}`,
            borderRadius: 6, padding: 12, display: "flex", flexDirection: "column", gap: 8,
          }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <select value={normMetric} onChange={e => setMetric(i, e.target.value)}
                style={{ ...selectStyle, maxWidth: 200, color: C.purple, borderColor: alpha(C.purple, 0.33) }}>
                {METRICS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
              {scopeOpts.length > 0 && (
                <select
                  value={g.scope?.id || ""}
                  onChange={e => setScope(i, scope, e.target.value)}
                  disabled={scopeOpts.length === 0}
                  style={{ ...selectStyle, maxWidth: 160, color: needsScope ? C.accent : C.text }}>
                  {!needsScope && <option value="">All</option>}
                  {scopeOpts.filter(o => o.value !== "" || !needsScope).map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              )}
              <select value={g.operator} onChange={e => upd(i, { operator: e.target.value })}
                style={{ ...selectStyle, width: 80, fontVariantNumeric: "tabular-nums" }}>
                {ops.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              <input type="number" min="0" step="0.1" value={g.target}
                aria-label="Target value"
                onChange={e => upd(i, { target: e.target.value })} placeholder="Target"
                style={{ ...inputStyle(isValid), width: 90 }} />
              {def && <span style={{ fontSize: 11, color: C.muted, fontFamily: FONT, whiteSpace: "nowrap" }}>{def.unit}</span>}
              <input value={g.label} onChange={e => upd(i, { label: e.target.value })}
                aria-label="Goal label (optional)"
                placeholder="Label (optional)" maxLength={60}
                style={{ ...inputStyle(false), flex: 1, minWidth: 120, color: C.muted, fontSize: 11,
                  borderColor: alpha(C.border, 0.25) }} />
              <Btn small variant="danger" ariaLabel={`Remove goal ${i + 1}`} onClick={() => rem(i)}>✕</Btn>
            </div>
            {desc && (
              <div style={{ fontSize: 11, color: C.muted, fontFamily: FONT, lineHeight: 1.5 }}>
                →{" "}
                <span style={{ color: C.purple, fontWeight: 600 }}>
                  {g.scope?.name ? `${g.scope.name} ` : ""}
                  {def?.label || normMetric}
                </span>
                {": "}
                {g.operator?.startsWith("p")
                  ? `${g.operator.replace("p", "")}th percentile < ${g.target}`
                  : `${g.operator} ${g.target}`}
                {" "}{def?.unit || ""}
              </div>
            )}
            {g.scope && needsScope && scopeOpts.length === 0 && (
              <div style={{ fontSize: 10, color: C.amber, fontFamily: FONT, fontStyle: "italic" }}>
                Define at least one {scope} in the model to use this goal type.
              </div>
            )}
            {COUNT_METRICS.has(normMetric) && !needsScope && (
              <div style={{ fontSize: 10, color: C.muted, fontFamily: FONT, fontStyle: "italic" }}>
                In batch mode this goal is evaluated against the average per replication, not the total.
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
