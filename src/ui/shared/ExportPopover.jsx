import { useState, useCallback } from "react";
import { useTheme } from "./ThemeContext.jsx";
import { Btn } from "./components.jsx";
import { downloadTextFile, slugifyResultName, timestampForFilename } from "./utils.js";
import { buildResultsExportPayload, buildResultsCsv, buildResultsXlsx } from "../execute/executeHelpers.js";
import { buildLLMBundle } from "../../llm/bundleExport.js";
import { generateReport, sanitizeFilename } from "../../reports/index.js";

// ── SCHEMA_REFERENCE_TEXT ──────────────────────────────────────────────────

const SCHEMA_REFERENCE_TEXT = `simmodlr.results.v1 — JSON Export Schema
═══════════════════════════════════════════════

{
  schema: "simmodlr.results.v1",     // schema identifier
  exportedAt: "2026-06-30T...",       // ISO timestamp
  status: "complete",                 // "complete" | "partial"
  batchStatus: "complete",            // "idle" | "running" | "complete" | ...
  metricsOnly: false,                 // true if metrics-only export

  model: {
    id: "uuid",                       // model ID (null if anonymous)
    name: "My Model"                  // model name
  },

  experiment: {
    runLabel: "Baseline",             // user-set run label
    seed: 12345,                      // base random seed
    replications: 10,                 // number of replications
    warmupPeriod: 100,                // time units excluded from stats
    maxSimTime: 5000,                 // run duration (null if condition-based)
    terminationMode: "time",          // "time" | "condition"
    terminationCondition: null        // predicate JSON (if condition-based)
  },

  results: {
    summary: {
      total: 1000,                    // total entities arrived
      served: 950,                    // entities that completed service
      reneged: 50,                    // entities that abandoned
      avgWait: 2.34,                  // mean queue wait time
      avgSvc: 1.05,                   // mean service time
      avgSojourn: 3.39,               // mean time in system (completed)
      avgTimeInSystem: 3.15,          // mean time in system (all)
      avgWIP: 4.7,                    // time-average work in progress
      maxWIP: 12,                     // peak concurrent entities
      totalCost: 500.0,               // accumulated cost (COST macro)
      costPerServed: 0.52,            // cost per served entity
      servedRatio: 0.95,              // served / total
      outcomes: { ... },              // per-route completion counts
      perResource: [ ... ],           // per-server type stats
      containers: { ... },            // container level summaries
      queueJourneys: [ ... ]          // per-queue journey paths
    },
    entityJourneys: [                 // (new) per-entity journey data
      {
        entityId: "e_42",
        type: "Customer",
        arrivedAt: 0.0,
        completedAt: 12.5,
        stages: [
          { queue: "Checkout", wait: 3.2, server: "Cashier", service: 1.8 }
        ],
        outcome: {
          routeId: "route-exit:main",
          routeLabel: "Served",
          status: "completed"
        }
      }
    ],
    timeSeries: [                     // per-interval snapshots
      { clock: 0.5, byQueue: { ... }, byType: { ... }, wip: 3, completed: 1 }
    ],
    waitDist: {                       // per-queue wait distributions
      "QueueName": { n: 200, mean: 2.3, values: [ ... ], histogram: { ... } }
    },
    phaseCTruncated: false,           // Phase C limit hit?
    cycleLimitReached: false,         // engine cycle limit reached?
    runtimeMetrics: {
      eventsProcessed: 15000,
      cEventScans: 1200,
      maxFelSize: 45,
      peakQueueDepth: { ... }
    }
  },

  replications: [                     // per-replication summaries
    {
      replicationIndex: 0,
      seed: 12346,
      summary: { total: 102, ... },
      finalTime: 5120.5
    }
  ],

  aggregateStats: {                   // across-replication CIs (when > 1 rep)
    "summary.avgWait": {
      n: 10, mean: 2.34,
      lower: 2.28, upper: 2.40, halfWidth: 0.06
    }
  }
}
`;

// ── Simple row button for popover menus ────────────────────────────────────

function PopoverRow({ label, onClick, mute, hint }) {
  const { C, FONT } = useTheme();
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        background: "none",
        border: "none",
        borderRadius: 4,
        color: mute ? C.muted : C.text,
        cursor: "pointer",
        fontFamily: FONT,
        fontSize: 12,
        padding: "7px 8px",
        textAlign: "left",
        width: "100%",
      }}
      onMouseEnter={e => { e.currentTarget.style.background = C.bg; }}
      onMouseLeave={e => { e.currentTarget.style.background = "none"; }}
    >
      {label}
      {hint && <div style={{ fontSize: 9, color: C.muted, marginTop: 1 }}>{hint}</div>}
    </button>
  );
}

// ── Schema info modal ──────────────────────────────────────────────────────

function SchemaInfoModal({ onClose }) {
  const { C, FONT } = useTheme();
  return (
    <>
      <div
        style={{ position: "fixed", inset: 0, background: C.overlay, zIndex: 200 }}
        onClick={onClose}
      />
      <div role="dialog" aria-modal="true" aria-label="JSON export schema reference"
        onClick={e => e.stopPropagation()}
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          zIndex: 201,
          background: C.cardBg,
          border: `1px solid ${C.border}`,
          borderRadius: 8,
          padding: 24,
          width: 560,
          maxWidth: "95vw",
          maxHeight: "90vh",
          overflowY: "auto",
          boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
          fontFamily: FONT,
        }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: C.text }}>JSON Export Schema — simmodlr.results.v1</span>
          <button type="button" aria-label="Close" onClick={onClose}
            style={{ background: "none", border: "none", color: C.muted, fontSize: 18, cursor: "pointer", fontFamily: FONT, padding: "0 4px" }}>×</button>
        </div>
        <div style={{ fontSize: 11, color: C.muted, fontFamily: FONT, lineHeight: 1.6, marginBottom: 12 }}>
          Every JSON export produces a <code style={{ background: C.bg, padding: "1px 4px", borderRadius: 3, fontSize: 10 }}>simmodlr.results.v1</code> document. Copy the structure below into an AI tool, Python script, or R notebook to understand the data shape.
        </div>
        <pre style={{
          background: C.bg,
          border: `1px solid ${C.border}`,
          borderRadius: 6,
          padding: 14,
          fontSize: 10,
          color: C.text,
          fontFamily: "monospace",
          overflowX: "auto",
          lineHeight: 1.5,
          whiteSpace: "pre",
        }}>{SCHEMA_REFERENCE_TEXT}</pre>
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}>
          <Btn variant="primary" small onClick={() => {
            if (typeof navigator !== "undefined" && navigator.clipboard) {
              navigator.clipboard.writeText(SCHEMA_REFERENCE_TEXT).catch(() => {});
            }
          }}>Copy schema</Btn>
        </div>
      </div>
    </>
  );
}

// ── Create Report modal ────────────────────────────────────────────────────

function CreateReportModal({ reportType, setReportType, reportFormat, setReportFormat, reportGenerating, onCreateReport, onClose }) {
  const { C, FONT } = useTheme();
  return (
    <>
      <div
        style={{ position: "fixed", inset: 0, background: C.overlay, zIndex: 200 }}
        onClick={onClose}
      />
      <div style={{
        position: "fixed",
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
        zIndex: 201,
        background: C.cardBg,
        border: `1px solid ${C.border}`,
        borderRadius: 8,
        padding: 24,
        width: 380,
        boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
        fontFamily: FONT,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: C.text }}>Create Report</span>
          <Btn small variant="ghost" onClick={onClose} ariaLabel="Close">×</Btn>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 }}>
          {[
            ["seniorMgmt", "Senior Management Report", "Results and recommendations in plain English. No statistical or technical detail."],
            ["technical",  "Technical Report",          "Full analysis including confidence intervals and model specification appendix."],
          ].map(([val, label, desc]) => (
            <label key={val} style={{ display: "flex", gap: 10, cursor: "pointer", padding: 10, borderRadius: 6, border: `1px solid ${reportType === val ? C.accent : C.border}`, background: reportType === val ? `${C.accent}11` : "transparent" }}>
              <input
                type="radio"
                name="reportType"
                value={val}
                checked={reportType === val}
                onChange={() => setReportType(val)}
                style={{ accentColor: C.accent, marginTop: 2 }}
              />
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: C.text }}>{label}</div>
                <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>{desc}</div>
              </div>
            </label>
          ))}
        </div>

        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 10, color: C.muted, letterSpacing: 1.2, fontWeight: 700, marginBottom: 8 }}>FORMAT</div>
          <div style={{ display: "flex", gap: 6 }}>
            {[["html", "HTML"], ["markdown", "Markdown"]].map(([val, label]) => (
              <Btn
                key={val}
                small
                variant={reportFormat === val ? "primary" : "ghost"}
                onClick={() => setReportFormat(val)}
              >
                {label}
              </Btn>
            ))}
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
          <Btn variant="primary" onClick={() => onCreateReport(reportType, reportFormat)} disabled={reportGenerating}>
            Generate Report
          </Btn>
        </div>
      </div>
    </>
  );
}

// ── ExportPopover — shared unified export dropdown ─────────────────────────

export function ExportPopover({ model, results, replicationResults = [], aggregateStats = {}, config = {}, runMeta = {}, resultFilenameBase: filenameBase, onClose, onCreateReport }) {
  const { C, FONT } = useTheme();

  const [showCreateReportModal, setShowCreateReportModal] = useState(false);
  const [showSchemaModal, setShowSchemaModal] = useState(false);
  const [reportType, setReportType] = useState("seniorMgmt");
  const [reportFormat, setReportFormat] = useState("html");
  const [reportGenerating, setReportGenerating] = useState(false);

  const base = filenameBase || `simmodlr-results-${slugifyResultName(model?.name || "model")}-${timestampForFilename()}`;

  const exportResultsJson = useCallback((metricsOnly = false) => {
    const payload = buildResultsExportPayload({
      model,
      results,
      replicationResults,
      aggregateStats,
      config,
      batchStatus: config.batchStatus || "complete",
      metricsOnly,
    });
    const suffix = metricsOnly ? "-metrics" : "";
    downloadTextFile(JSON.stringify(payload, null, 2), `${base}${suffix}.json`, "application/json");
    onClose();
  }, [model, results, replicationResults, aggregateStats, config, base, onClose]);

  const exportResultsCsv = useCallback(() => {
    const csv = buildResultsCsv({ results, replicationResults, aggregateStats, config });
    downloadTextFile(csv, `${base}.csv`, "text/csv;charset=utf-8");
    onClose();
  }, [results, replicationResults, aggregateStats, config, base, onClose]);

  const exportResultsXlsx = useCallback(() => {
    buildResultsXlsx({ results, replicationResults, aggregateStats, config, model });
    onClose();
  }, [results, replicationResults, aggregateStats, config, model, onClose]);

  const exportLLMBundle = useCallback(() => {
    const bundleConfig = {
      runLabel: config.runLabel,
      replications: config.replications,
      maxSimTime: config.maxSimTime,
      warmupPeriod: config.warmupPeriod,
      seed: config.seed,
      ranAt: new Date().toISOString(),
    };
    const activeResults = results || (replicationResults.length ? replicationResults[replicationResults.length - 1]?.result : null);
    const bundleResults = { ...activeResults, aggregateStats, replications: replicationResults.map(p => ({ replicationIndex: p.replicationIndex, seed: p.seed, summary: p.result?.summary ?? p.summary ?? {} })) };
    const md = buildLLMBundle(model, bundleResults, bundleConfig);
    downloadTextFile(md, `${base}-llm-bundle.md`, "text/markdown;charset=utf-8");
    onClose();
  }, [model, results, replicationResults, aggregateStats, config, base, onClose]);

  const handleCreateReport = useCallback(async (type = "technical", format = "html") => {
    if (!results) return;
    setReportGenerating(true);
    setShowCreateReportModal(false);
    try {
      const meta = {
        runId: runMeta.runId || "unknown",
        runLabel: runMeta.runLabel || config.runLabel || "",
        engineVersion: runMeta.engineVersion || "1.0",
        seed: runMeta.seed ?? config.seed ?? "unknown",
        prngAlgorithm: runMeta.prngAlgorithm || "mulberry32",
        runTimestamp: runMeta.runTimestamp || new Date().toISOString(),
        narrativeText: runMeta.narrativeText ?? null,
        modelDescriptionText: runMeta.modelDescriptionText ?? null,
      };
      let reportModel = model;
      if (runMeta.fetchModelSnapshot) {
        try {
          const snap = await runMeta.fetchModelSnapshot();
          if (snap) reportModel = snap;
        } catch {}
      }
      const content = await generateReport(reportModel, results, config, meta, {
        type,
        format,
        aggregateStats: aggregateStats || {},
      });
      const mimeType = format === "markdown" ? "text/markdown" : "text/html";
      const ext = format === "markdown" ? "md" : "html";
      const reportTypeSuffix = type === "seniorMgmt" ? "Management" : "Technical";
      const safeName = `${sanitizeFilename(reportModel.name || "Model")} — ${sanitizeFilename(meta.runLabel || "Report")} — ${reportTypeSuffix} Report.${ext}`;
      const blob = new Blob([content], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = safeName;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      console.error("Report generation failed:", err);
    } finally {
      setReportGenerating(false);
    }
  }, [results, model, config, runMeta, aggregateStats, onClose]);

  return (
    <>
      <div style={{
        position: "absolute",
        top: "calc(100% + 4px)",
        left: 0,
        zIndex: 100,
        background: C.cardBg,
        border: `1px solid ${C.border}`,
        borderRadius: 6,
        padding: 8,
        display: "flex",
        flexDirection: "column",
        gap: 0,
        minWidth: 240,
        boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
      }}>
        <span style={{ fontSize: 9, color: C.muted, fontFamily: FONT, letterSpacing: 1.2, fontWeight: 700, padding: "4px 8px 2px" }}>RESULTS DATA</span>
        <PopoverRow label="Full model results (.json)" onClick={() => exportResultsJson(false)} />
        <PopoverRow label="Metrics only (.json)" onClick={() => exportResultsJson(true)} mute hint="KPIs only — no time series or entity data" />
        <PopoverRow label="Results table (.csv)" onClick={exportResultsCsv} />
        <PopoverRow label="Results workbook (.xlsx)" onClick={exportResultsXlsx} mute hint="Multi-sheet Excel workbook — Summary, Replications, Entity Journeys" />

        {(onCreateReport) && (
          <>
            <div style={{ height: 1, background: C.border, margin: "4px 8px" }} />
            <span style={{ fontSize: 9, color: C.muted, fontFamily: FONT, letterSpacing: 1.2, fontWeight: 700, padding: "4px 8px 2px" }}>AI & REPORTS</span>
            <PopoverRow label="LLM Bundle (.md)" onClick={exportLLMBundle} mute hint="Model + results as Markdown — paste into any AI tool" />
            <PopoverRow label="Create Report…" onClick={() => { setShowCreateReportModal(true); }} />
          </>
        )}

        <div style={{ height: 1, background: C.border, margin: "4px 8px" }} />
        <span style={{ fontSize: 9, color: C.muted, fontFamily: FONT, letterSpacing: 1.2, fontWeight: 700, padding: "4px 8px 2px" }}>REFERENCE</span>
        <PopoverRow label="Schema reference" onClick={() => setShowSchemaModal(true)} mute hint="Field-by-field documentation of the JSON export format" />
      </div>

      {showCreateReportModal && (
        <CreateReportModal
          reportType={reportType}
          setReportType={setReportType}
          reportFormat={reportFormat}
          setReportFormat={setReportFormat}
          reportGenerating={reportGenerating}
          onCreateReport={handleCreateReport}
          onClose={() => setShowCreateReportModal(false)}
        />
      )}

      {showSchemaModal && <SchemaInfoModal onClose={() => setShowSchemaModal(false)} />}
    </>
  );
}
