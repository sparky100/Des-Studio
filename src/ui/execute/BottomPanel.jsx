// ui/execute/BottomPanel.jsx — collapsible tabbed detail area below the Execute canvas
// Tabs: Step Log | Entities | Stage KPIs | Charts | Analysis (Sprint 17)
// F9C.8 + F9C.9 + F9C.11 node-filtered log
import { useState, useMemo } from "react";
import { C, FONT } from "../shared/tokens.js";
import { Tag, PhaseTag, Btn } from "../shared/components.jsx";
import { batchMeansCI, computePercentiles, computeSummaryStats } from "../../engine/statistics.js";
import { MiniLineChart, ResultsWorkspace } from "../results/ResultsWorkspace.jsx";

const fmt = (v, d = 0) => Number.isFinite(v) ? v.toFixed(d) : "—";

const TABS = [
  { id: "log",       label: "Step Log" },
  { id: "entities",  label: "Entities" },
  { id: "stagekpis", label: "Stage KPIs" },
  { id: "charts",    label: "Charts" },
  { id: "analysis",  label: "Analysis" },
];

// ── Stage KPIs ────────────────────────────────────────────────────────────────

function EventCountsTable({ snap, model }) {
  const counts = snap?.eventCounts ?? {};
  const bEvents = (model.bEvents || []).filter(b => parseFloat(b.scheduledTime) < 900 || Object.prototype.hasOwnProperty.call(counts, b.id));
  const cEvents = model.cEvents || [];
  if (bEvents.length === 0 && cEvents.length === 0) return null;

  const thStyle = { padding: "4px 8px", textAlign: "left", fontWeight: 600, color: C.muted, fontFamily: FONT, fontSize: 10, letterSpacing: 0.8 };
  const tdStyle = (color) => ({ padding: "4px 8px", fontFamily: FONT, fontSize: 11, color: color || C.text });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {bEvents.length > 0 && (
        <div>
          <div style={{ fontSize: 10, color: C.bEvent, fontFamily: FONT, letterSpacing: 1.2, fontWeight: 700, marginBottom: 6 }}>
            B-EVENTS (BOUND) — TIMES FIRED
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr style={{ borderBottom: `1px solid ${C.border}` }}>
              <th style={thStyle}>Event</th>
              <th style={{ ...thStyle, textAlign: "right" }}>Count</th>
            </tr></thead>
            <tbody>
              {bEvents.map(b => (
                <tr key={b.id} style={{ borderBottom: `1px solid ${C.border}` }}>
                  <td style={tdStyle(C.bEvent)}>{b.name || b.id}</td>
                  <td style={{ ...tdStyle(counts[b.id] ? C.text : C.muted), textAlign: "right", fontWeight: counts[b.id] ? 700 : 400 }}>
                    {counts[b.id] || 0}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {cEvents.length > 0 && (
        <div>
          <div style={{ fontSize: 10, color: C.cEvent, fontFamily: FONT, letterSpacing: 1.2, fontWeight: 700, marginBottom: 6 }}>
            C-EVENTS (CONDITIONAL) — TIMES FIRED
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr style={{ borderBottom: `1px solid ${C.border}` }}>
              <th style={thStyle}>Event</th>
              <th style={{ ...thStyle, textAlign: "right" }}>Count</th>
            </tr></thead>
            <tbody>
              {cEvents.map(c => (
                <tr key={c.id} style={{ borderBottom: `1px solid ${C.border}` }}>
                  <td style={tdStyle(C.cEvent)}>{c.name || c.id}</td>
                  <td style={{ ...tdStyle(counts[c.id] ? C.text : C.muted), textAlign: "right", fontWeight: counts[c.id] ? 700 : 400 }}>
                    {counts[c.id] || 0}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function StageKpisTable({ snap, model }) {
  if (!snap) {
    return (
      <div style={{ color: C.muted, fontFamily: FONT, fontSize: 12, padding: 8 }}>
        Run the simulation to see stage KPIs.
      </div>
    );
  }

  const entities    = snap.entities || [];
  const queues      = model.queues || [];
  const serverTypes = (model.entityTypes || []).filter(et => et.role === "server");

  const th = (label, right = false) => (
    <th key={label} style={{ padding: "4px 8px", textAlign: right ? "right" : "left", fontWeight: 600,
      color: C.muted, fontFamily: FONT, fontSize: 10, letterSpacing: 0.8 }}>
      {label}
    </th>
  );
  const td = (val, color, right = false) => (
    <td style={{ padding: "4px 8px", textAlign: right ? "right" : "left",
      color: color || C.text, fontFamily: FONT, fontSize: 11 }}>
      {val}
    </td>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Queue rows */}
      {queues.length > 0 && (
        <div>
          <div style={{ fontSize: 10, color: C.cEvent, fontFamily: FONT, letterSpacing: 1.2, fontWeight: 700, marginBottom: 6 }}>
            QUEUES
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                {[
                  th("Queue"),
                  th("Depth", true),
                  th("Mean wait", true),
                  th("Max wait", true),
                  th("Arrivals", true),
                  th("Reneged", true),
                ]}
              </tr>
            </thead>
            <tbody>
              {queues.map(q => {
                const inQueue  = entities.filter(e => e.role !== "server" && (e.queue === q.name || e.lastQueue === q.name));
                const waiting  = entities.filter(e => e.role !== "server" && e.queue === q.name && e.status === "waiting");
                const now = snap.clock || 0;
                const currentWaits = waiting.map(e => now - (e.arrivalTime || 0)).filter(Number.isFinite);
                const meanWait = currentWaits.length ? currentWaits.reduce((a, b) => a + b, 0) / currentWaits.length : null;
                const maxWait  = currentWaits.length ? Math.max(...currentWaits) : null;
                return (
                  <tr key={q.name} style={{ borderBottom: `1px solid ${C.border}` }}>
                    {td(q.name, C.cEvent)}
                    {td(waiting.length, waiting.length > 0 ? C.amber : C.text, true)}
                    {td(fmt(meanWait, 1), null, true)}
                    {td(fmt(maxWait, 1),  null, true)}
                    {td(inQueue.length, null, true)}
                    {td(snap.reneged || 0, C.reneged, true)}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Server rows */}
      {serverTypes.length > 0 && (
        <div>
          <div style={{ fontSize: 10, color: C.purple, fontFamily: FONT, letterSpacing: 1.2, fontWeight: 700, marginBottom: 6 }}>
            SERVERS
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                {[
                  th("Server type"),
                  th("Capacity", true),
                  th("Busy", true),
                  th("Utilisation", true),
                  th("Mean svc", true),
                  th("Completions", true),
                ]}
              </tr>
            </thead>
            <tbody>
              {serverTypes.map(et => {
                const capacity = parseInt(et.count || "1", 10) || 1;
                const servers  = entities.filter(e => e.role === "server" && e.type === et.name);
                const busy     = servers.filter(e => e.status === "busy").length;
                const util     = ((busy / capacity) * 100).toFixed(0);
                const done     = entities.filter(e => e.role !== "server" &&
                  e.completionTime != null && e.serviceStart != null);
                const svcTimes = done.map(e => e.completionTime - e.serviceStart).filter(Number.isFinite);
                const meanSvc  = svcTimes.length
                  ? svcTimes.reduce((a, b) => a + b, 0) / svcTimes.length : null;
                return (
                  <tr key={et.name} style={{ borderBottom: `1px solid ${C.border}` }}>
                    {td(et.name, C.purple)}
                    {td(capacity, null, true)}
                    {td(busy, busy > 0 ? C.amber : C.text, true)}
                    {td(`${util}%`, null, true)}
                    {td(fmt(meanSvc, 1), null, true)}
                    {td(snap.served || 0, C.served, true)}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Log tab ───────────────────────────────────────────────────────────────────

function LogTab({ log, selectedNodeLabel, onClearFilter }) {
  const filtered = useMemo(
    () => selectedNodeLabel
      ? log.filter(e => e.message?.includes(selectedNodeLabel))
      : log,
    [log, selectedNodeLabel]
  );

  return (
    <div>
      {selectedNodeLabel && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <span style={{ fontSize: 10, color: C.accent, fontFamily: FONT }}>
            Filter: {selectedNodeLabel}
          </span>
          <button
            onClick={onClearFilter}
            style={{ background: "none", border: `1px solid ${C.border}`, borderRadius: 4,
              color: C.muted, cursor: "pointer", fontFamily: FONT, fontSize: 10, padding: "2px 8px" }}
          >
            Show all
          </button>
        </div>
      )}
      {filtered.length === 0
        ? <div style={{ color: C.muted, fontFamily: FONT, fontSize: 12 }}>
            {selectedNodeLabel ? "No events match this node." : "Log empty. Run simulation to see events."}
          </div>
        : [...filtered].reverse().map((r, i) => (
          <div key={i}>
            {r.phase === "WARMUP" && (
              <div style={{ padding: "8px 0", borderBottom: `1px solid ${C.border}`,
                textAlign: "center", color: C.amber, fontSize: 11, fontWeight: 700,
                letterSpacing: 1.5, background: `${C.warmup}22` }}>
                ──── WARM-UP ENDED AT T={r.time?.toFixed(0)} ────
              </div>
            )}
            <div style={{ fontSize: 11, fontFamily: "monospace", color: C.kpiSvc,
              borderBottom: `1px solid ${C.bg}`, padding: "3px 0" }}>
              <span style={{ color: C.muted }}>[t={r.time?.toFixed(0)}]</span>{" "}
              <PhaseTag phase={r.phase} /> {r.message}
            </div>
          </div>
        ))
      }
    </div>
  );
}

// ── Entities tab ──────────────────────────────────────────────────────────────

function EntitiesTab({ snap }) {
  if (!snap) {
    return <div style={{ color: C.muted, fontFamily: FONT, fontSize: 12 }}>No snapshot yet.</div>;
  }
  const entities = (snap.entities || [])
    .filter(e => e.role !== "server" && e.status !== "done" && e.status !== "reneged");
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ fontSize: 10, color: C.muted, fontFamily: FONT }}>
        {entities.length} active {entities.length === 1 ? "entity" : "entities"}
      </div>
      {entities.length === 0 ? (
        <div style={{ fontSize: 11, color: C.muted, fontFamily: FONT, fontStyle: "italic" }}>
          No active customer entities.
        </div>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse", color: C.text, fontSize: 11 }}>
          <thead>
            <tr style={{ color: C.muted, borderBottom: `2px solid ${C.border}` }}>
              <th style={{ padding: "4px 8px", textAlign: "left" }}>ID</th>
              <th style={{ padding: "4px 8px", textAlign: "left" }}>Type</th>
              <th style={{ padding: "4px 8px", textAlign: "left" }}>Attrs</th>
              <th style={{ padding: "4px 8px", textAlign: "left" }}>Status</th>
              <th style={{ padding: "4px 8px", textAlign: "left" }}>Location</th>
              <th style={{ padding: "4px 8px", textAlign: "right" }}>Journey</th>
            </tr>
          </thead>
          <tbody>
            {entities.map(e => {
              const journey = snap.clock != null ? snap.clock - (e.arrivalTime || 0) : null;
              const attrStr = e.attrs
                ? Object.entries(e.attrs).filter(([k]) => k !== "priority").map(([k, v]) => `${k}=${v}`).join(" ")
                : "";
              const location = e.status === "waiting"
                ? (e.queue || "queue")
                : e.status === "serving"
                  ? (e.ceventName || e.lastQueue || "serving")
                  : e.queue || e.lastQueue || "—";
              return (
                <tr key={e.id} style={{ borderBottom: `1px solid ${C.bg}` }}>
                  <td style={{ padding: "4px 8px", color: C.kpiArr, fontFamily: FONT, fontWeight: 700 }}>#{e.id}</td>
                  <td style={{ padding: "4px 8px", fontFamily: FONT }}>{e.type}</td>
                  <td style={{ padding: "4px 8px", fontSize: 10, color: C.label, fontFamily: FONT, maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{attrStr || "—"}</td>
                  <td style={{ padding: "4px 8px" }}>
                    <Tag label={e.status} color={e.status === "waiting" ? C.amber : e.status === "serving" ? C.accent : C.green} />
                  </td>
                  <td style={{ padding: "4px 8px", color: C.cEvent, fontFamily: FONT }}>{location}</td>
                  <td style={{ padding: "4px 8px", textAlign: "right", color: C.amber, fontFamily: FONT, fontWeight: 700 }}>
                    {journey != null ? `${journey.toFixed(1)}t` : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ── BottomPanel ───────────────────────────────────────────────────────────────

// ── Analysis tab (Sprint 17) ───────────────────────────────────────────────────

const ANALYSIS_METRICS = [
  { path: "summary.avgWait", label: "Avg wait" },
  { path: "summary.avgSvc", label: "Avg service" },
  { path: "summary.avgSojourn", label: "Avg sojourn" },
  { path: "summary.served", label: "Served" },
];

function AnalysisTab({ results, replicationResults, warmupDetection }) {
  const [batchMetric, setBatchMetric] = useState("summary.avgWait");
  const [batchResult, setBatchResult] = useState(null);

  // Extract values for a metric from replication results
  const extractValues = (path) => {
    if (!replicationResults || replicationResults.length === 0) return [];
    return replicationResults
      .map(r => {
        const parts = path.split(".");
        let v = r?.result || r;
        for (const p of parts) v = v?.[p];
        return v;
      })
      .filter(Number.isFinite);
  };

  const runBatchMeans = () => {
    const values = extractValues(batchMetric);
    if (values.length < 2) return;
    const ci = batchMeansCI(values);
    setBatchResult(ci);
  };

  const summaryStats = useMemo(() => {
    if (!replicationResults || replicationResults.length === 0) return null;
    const values = extractValues("summary.avgWait");
    if (values.length < 3) return null;
    return {
      avgWait: computeSummaryStats(values),
      percentiles: computePercentiles(values),
    };
  }, [replicationResults]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Warm-up detection section */}
      <div>
        <div style={{ fontSize: 10, color: C.amber, fontFamily: FONT, letterSpacing: 1.2, fontWeight: 700, marginBottom: 8 }}>
          WARM-UP DETECTION
        </div>
        {warmupDetection && warmupDetection.series.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ fontSize: 11, color: C.text, fontFamily: FONT, lineHeight: 1.6 }}>
              {warmupDetection.explanation}
            </div>
            {warmupDetection.series.length > 1 && (
              <div style={{ background: C.bg, borderRadius: 4, border: `1px solid ${C.border}`, padding: 8 }}>
                <MiniLineChart
                  title="Ensemble average trajectory"
                  points={warmupDetection.series}
                  color={C.accent}
                  yLabel="metric"
                />
              </div>
            )}
          </div>
        ) : (
          <div style={{ fontSize: 11, color: C.muted, fontFamily: FONT }}>
            Run a replication batch and press <strong style={{ color: C.accent }}>Detect</strong> in the warm-up input to see Welch's method results here.
          </div>
        )}
      </div>

      {/* Batch-means CI section */}
      <div>
        <div style={{ fontSize: 10, color: C.green, fontFamily: FONT, letterSpacing: 1.2, fontWeight: 700, marginBottom: 8 }}>
          BATCH-MEANS CONFIDENCE INTERVAL
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap", marginBottom: 8 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1, minWidth: 120 }}>
            <span style={{ fontSize: 10, color: C.label, fontFamily: FONT }}>Metric</span>
            <select aria-label="Batch-means metric" value={batchMetric}
              onChange={e => { setBatchMetric(e.target.value); setBatchResult(null); }}
              style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 4, color: C.text, fontFamily: FONT, fontSize: 12, padding: "5px 8px", outline: "none" }}>
              {ANALYSIS_METRICS.map(m => (
                <option key={m.path} value={m.path}>{m.label}</option>
              ))}
            </select>
          </div>
          <Btn small variant="primary" onClick={runBatchMeans} disabled={!replicationResults || replicationResults.length < 2}>
            Compute
          </Btn>
        </div>
        {batchResult && (
          <div>
            <div style={{ fontSize: 11, color: C.muted, fontFamily: FONT, lineHeight: 1.8, marginBottom: 6 }}>
              Batch-means accounts for autocorrelation by grouping observations into <strong>{batchResult.batchCount}</strong> batches of size <strong>{batchResult.batchSize}</strong>.
              The batch means are approximately independent, so a standard t-confidence interval on them is valid.
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 6 }}>
              {[
                { label: "n",    value: batchResult.n,          color: C.muted  },
                { label: "mean", value: batchResult.mean,       color: C.accent },
                { label: "CI low", value: batchResult.lower,    color: C.muted  },
                { label: "CI high",value: batchResult.upper,    color: C.muted  },
                { label: "lag-1 rho", value: batchResult.lag1Rho, color: C.amber },
              ].map(s => (
                <div key={s.label} style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 4, padding: "4px 6px", textAlign: "center" }}>
                  <div style={{ fontSize: 8, color: C.muted, fontFamily: FONT, marginBottom: 2 }}>{s.label.toUpperCase()}</div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: s.color, fontFamily: FONT }}>{fmt(s.value)}</div>
                </div>
              ))}
            </div>
          </div>
        )}
        {!batchResult && replicationResults && replicationResults.length >= 2 && (
          <div style={{ fontSize: 11, color: C.muted, fontFamily: FONT }}>
            Select a metric and press <strong style={{ color: C.accent }}>Compute</strong> to calculate a batch-means confidence interval.
          </div>
        )}
      </div>

      {/* Distribution diagnostics section */}
      {summaryStats && (
        <div>
          <div style={{ fontSize: 10, color: C.purple, fontFamily: FONT, letterSpacing: 1.2, fontWeight: 700, marginBottom: 8 }}>
            DISTRIBUTION DIAGNOSTICS (Avg Wait)
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6, marginBottom: 10 }}>
            {[
              { label: "n",        value: summaryStats.avgWait.n,              color: C.muted  },
              { label: "mean",     value: summaryStats.avgWait.mean,          color: C.accent },
              { label: "stdDev",   value: summaryStats.avgWait.stdDev,        color: C.muted  },
              { label: "skewness", value: summaryStats.avgWait.skewness,      color: C.amber  },
              { label: "kurtosis", value: summaryStats.avgWait.kurtosis,      color: C.amber  },
              { label: "p50",      value: summaryStats.percentiles.p50,       color: C.green  },
              { label: "p90",      value: summaryStats.percentiles.p90,       color: C.amber  },
              { label: "p95",      value: summaryStats.percentiles.p95,       color: C.red    },
            ].map(s => (
              <div key={s.label} style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 4, padding: "4px 6px", textAlign: "center" }}>
                <div style={{ fontSize: 8, color: C.muted, fontFamily: FONT, marginBottom: 2 }}>{s.label.toUpperCase()}</div>
                <div style={{ fontSize: 11, fontWeight: 700, color: s.color, fontFamily: FONT }}>{fmt(s.value)}</div>
              </div>
            ))}
          </div>
          <div style={{ fontSize: 11, color: C.muted, fontFamily: FONT, lineHeight: 1.8 }}>
            {summaryStats.avgWait.isApproxNormal
              ? "The distribution of replication means is approximately normal (skewness and kurtosis within expected ranges)."
              : "The distribution of replication means deviates from normality. Consider using batch-means or a larger number of replications."}
          </div>
        </div>
      )}
    </div>
  );
}

export function BottomPanel({ log, snap, model, results, selectedNodeLabel, onClearFilter, replicationResults, warmupDetection }) {
  const [activeTab,  setActiveTab]  = useState("log");
  const [collapsed,  setCollapsed]  = useState(false);

  const tabBtnStyle = (id) => ({
    background: activeTab === id ? C.border : "transparent",
    border: "none",
    borderRadius: 4,
    color: activeTab === id ? C.text : C.muted,
    cursor: "pointer",
    fontFamily: FONT,
    fontSize: 11,
    padding: "5px 10px",
  });

  const chevronStyle = {
    background: "none",
    border: `1px solid ${C.border}`,
    borderRadius: 4,
    color: C.muted,
    cursor: "pointer",
    fontFamily: FONT,
    fontSize: 11,
    padding: "3px 8px",
  };

  return (
    <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 8 }}>
      {/* Header: tabs + collapse toggle */}
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: 2,
        padding: "6px 10px",
        borderBottom: collapsed ? "none" : `1px solid ${C.border}`,
      }}>
        <div role="tablist" aria-label="Bottom panel tabs"
          style={{ display: "flex", background: C.bg, borderRadius: 5, padding: 2, gap: 1 }}>
          {TABS.map(tab => (
            <button
              key={tab.id}
              role="tab"
              aria-selected={activeTab === tab.id}
              aria-disabled={tab.disabled}
              disabled={tab.disabled}
              onClick={() => { if (!tab.disabled) { setActiveTab(tab.id); setCollapsed(false); } }}
              style={{ ...tabBtnStyle(tab.id), opacity: tab.disabled ? 0.4 : 1, cursor: tab.disabled ? "not-allowed" : "pointer" }}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div style={{ flex: 1 }} />
        <button
          aria-label={collapsed ? "Expand panel" : "Collapse panel"}
          onClick={() => setCollapsed(c => !c)}
          style={chevronStyle}
        >
          {collapsed ? "▲" : "▼"}
        </button>
      </div>

      {/* Body */}
      {!collapsed && (
        <div style={{ padding: 14, maxHeight: 300, overflowY: "auto" }}>
          {activeTab === "log"       && <LogTab log={log} selectedNodeLabel={selectedNodeLabel} onClearFilter={onClearFilter} />}
          {activeTab === "entities"  && <EntitiesTab snap={snap} />}
          {activeTab === "stagekpis" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              <EventCountsTable snap={snap} model={model} />
              <StageKpisTable snap={snap} model={model} />
            </div>
          )}
          {activeTab === "charts"    && <ResultsWorkspace results={results} model={model} />}
          {activeTab === "analysis" && <AnalysisTab results={results} model={model} replicationResults={replicationResults} warmupDetection={warmupDetection} />}
        </div>
      )}
    </div>
  );
}
