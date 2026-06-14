// ui/execute/index.jsx — ExecutePanel (slimmed, imports from sibling modules)

import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
const ExecuteCanvas = lazy(() => import("./ExecuteCanvas.jsx").then(m => ({ default: m.ExecuteCanvas })));
;
import { Tag, PhaseTag, Btn, SH, InfoBox } from "../shared/components.jsx";
import { slugifyResultName, timestampForFilename } from "../shared/utils.js";
import { buildEngine } from "../../engine/index.js";
import { AdapterRegistry } from "../../engine/adapters/index.js";
import { mulberry32 } from "../../engine/distributions.js";
import { runReplications } from "../../engine/replication-runner.js";
import { compareScenarios, detectWarmupWelch, summarizeReplicationResults, relativePrecision, sampleSizeGuidance, cumulativeMean, detectOutliers } from "../../engine/statistics.js";
import { fetchRunHistory, saveSimulationRun, fetchUserSettings, saveUserSettings, createShareLink, listShareLinks, revokeShareLink, fetchExperiments, saveExperiment, updateExperiment, cloneExperiment, deleteExperiment, getRun, fetchModelSchedules, buildSchedulesMap } from "../../db/models.js";
import { buildRunRecord, updateRunNarrative, compareResults } from "../../db/runRecord.js";
import { callLLMOnce } from "../../llm/apiClient.js";
import { buildNarrativePrompt, buildModelDescriptionPrompt } from "../../llm/prompts.js";
import { buildLLMBundle } from "../../llm/bundleExport.js";
import { saveLocalRun, fetchLocalRunHistory } from "../../db/local.js";
import { BottomPanel } from "./BottomPanel.jsx";
import { ResultsWorkspace } from "../results/ResultsWorkspace.jsx";
import { CustomerToken, VisualView } from "./VisualView.jsx";
import { DEFAULT_KPI_SLOTS } from "./execute-constants.js";
import { validateModel } from "../../engine/validation.js";
import { estimateRunComplexity } from "../../engine/complexity-estimator.js";
import { getRunAdmission } from "../../engine/run-admission.js";
import { enumerateSweepableParams, generate2DSweepValues } from "../../engine/sweep-params.js";
import { runSweep, run2DSweep } from "../../engine/sweep-runner.js";
import { ConditionBuilder } from "../editors/index.jsx";
import { ScenarioComparisonTable } from "../shared/ScenarioComparisonTable.jsx";
import { qrSvg } from "../share/qr.js";
import { CI_METRICS, METRIC_LABELS, fmt, fmtMetric, COUNT_METRICS, makeBatchId, makeBatchResult, makeBatchRuntimeMetrics, buildResultsExportPayload, buildResultsCsv, downloadTextFile, makeDefaultRunLabel, makeRunLabel, makeRunPromptPayload, makeSavedRunPromptPayload } from "./executeHelpers.js";
import { SweepChart, WarmupChart, Sweep2DGrid, CumulativeMeanChart, QueueHistogram, EntitySummaryTable } from "./SweepViews.jsx";
import { LogViewer } from "./LogViewer.jsx";
import { checkModel } from "../../simulation/modelChecker.js";
import { ExperimentControls } from "./ExperimentControls.jsx";
import { ParamBrowserPanel, paramColor } from "./ParamBrowserPanel.jsx";
import { alpha, RADIUS } from "../shared/tokens.js";
import { generateReport, sanitizeFilename } from '../../reports/index.js';
import { getModelImageDataUrl } from '../visual-designer/graph.js';
import { useTheme } from "../shared/ThemeContext.jsx";

/** Collect {{env.VAR}} secrets from sessionStorage for live-data adapters. */
function collectEnvSecrets(dataSources) {

  const secrets = {};
  for (const ds of dataSources || []) {
    if (!ds.authSecret) continue;
    const m = String(ds.authSecret).match(/^\{\{env\.(.+?)\}\}$/);
    if (m) {
      const val = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(m[1]) : null;
      if (val) secrets[m[1]] = val;
    }
  }
  return secrets;
}

const numberDefault = (value, fallback) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

/** ADR-016: count total rows across all events in a schedule record (local copy). */
function scheduleRowCount(sched) {
  if (!sched || !Array.isArray(sched.scheduleJson)) return 0;
  return sched.scheduleJson.reduce((sum, e) => sum + (Array.isArray(e.rows) ? e.rows.length : 0), 0);
}
const intDefault = (value, fallback) => {
  const n = parseInt(value, 10);
  return Number.isInteger(n) && n > 0 ? n : fallback;
};
const nowPerf = () => (typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : Date.now());
const formatDurationMs = value => {
  if (!Number.isFinite(value)) return "0 ms";
  if (value < 1000) return `${Math.max(0, Math.round(value))} ms`;
  return `${(value / 1000).toFixed(value >= 10_000 ? 0 : 1)} s`;
};

// ── Cloud-save timeout thresholds ────────────────────────────────────────────
/** Show "taking longer than usual" after this many ms with no Supabase response. */
const SAVE_SLOW_WARN_MS     = 5_000;
/** Show "still saving — Supabase may be waking up" after this many ms. */
const SAVE_CRITICAL_WARN_MS = 15_000;
/**
 * Hard timeout (ms): abandon the save attempt and surface an error.
 * The underlying fetch may still complete in the background but the result
 * will be ignored.
 */
const SAVE_TIMEOUT_MS       = 45_000;

/**
 * Runs a cloud save function with live elapsed-time feedback, escalating
 * slow-save warnings, a hard timeout, and unified try/catch error surfacing.
 *
 * Thresholds are controlled by the module-level constants above
 * (SAVE_SLOW_WARN_MS, SAVE_CRITICAL_WARN_MS, SAVE_TIMEOUT_MS) and can be
 * overridden per-call via opts.slowWarnMs / opts.criticalWarnMs / opts.timeoutMs.
 *
 * @param {Function} saveFn  - async () => runId
 * @param {object}   opts
 * @param {Function} opts.setSaveStatus    - React state setter for the status banner
 * @param {Function} opts.setLog           - React state setter for the run log
 * @param {number}   opts.prepareDurationMs
 * @param {number}   opts.snapClock        - simulation clock value for the log entry
 * @param {number}  [opts.slowWarnMs]      - override SAVE_SLOW_WARN_MS
 * @param {number}  [opts.criticalWarnMs]  - override SAVE_CRITICAL_WARN_MS
 * @param {number}  [opts.timeoutMs]       - override SAVE_TIMEOUT_MS
 * @returns {Promise<string|null>}  runId on success, null on error / timeout
 */
async function doCloudSave(saveFn, {
  setSaveStatus,
  setLog,
  prepareDurationMs,
  snapClock,
  slowWarnMs     = SAVE_SLOW_WARN_MS,
  criticalWarnMs = SAVE_CRITICAL_WARN_MS,
  timeoutMs      = SAVE_TIMEOUT_MS,
}) {
  const saveStartedAt = nowPerf();

  const buildTickMessage = () => {
    const elapsed = nowPerf() - saveStartedAt;
    if (elapsed >= criticalWarnMs) return `⏳ Still saving — this is taking longer than usual`;
    return `Saving results…`;
  };

  const intervalId = setInterval(() => {
    setSaveStatus({ state: 'saving', message: buildTickMessage() });
  }, 1_000);

  // Race the actual save against a hard timeout.
  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(
      () => reject(Object.assign(new Error(`Supabase did not respond within ${formatDurationMs(timeoutMs)}`), { isSaveTimeout: true })),
      timeoutMs,
    )
  );

  try {
    const runId = await Promise.race([saveFn(), timeoutPromise]);
    const saveDurationMs = nowPerf() - saveStartedAt;
    clearInterval(intervalId);
    setSaveStatus({ state: 'success', message: `✓ Results saved` });
    setLog(prev => [...prev, { phase: "SAVE", time: snapClock, message: "✅ Cloud history record completed." }]);
    return runId;
  } catch (err) {
    clearInterval(intervalId);
    const detail  = err.message || "unknown error";
    const bannerMsg = err.isSaveTimeout
      ? `✗ Save timed out — Supabase did not respond. Try running again in a moment.`
      : `✗ Save failed: ${detail}`;
    const logMsg = err.isSaveTimeout
      ? `Save timed out — result not stored`
      : `Save failed: ${detail}`;
    setSaveStatus({ state: 'error', message: bannerMsg });
    setLog(prev => [...prev, { phase: "ERROR", time: snapClock, message: logMsg }]);
    return null;
  }
}
const formatEstimate = value => Number.isFinite(value) ? Math.round(value).toLocaleString() : "—";
const yieldToBrowser = () => new Promise(resolve => setTimeout(resolve, 0));

const ExecutePanel = ({ model, modelId, userId, plan = "free", isAdmin = false, tierPolicies = null, currentVersion, currentVersionId, onRunSaved, onResultsReady, onRunComplete, onGoToResults, autoRun = false, onExperimentDefaultsChange = null, onApplyPatchedModel = null, onExposeRunApi = null, schedulesVersion = 0, modelAssistantOpen = false, onOpenModelAssistant = null, visible = true }) => {
  const { C, FONT } = useTheme();
  const experimentDefaults = model?.experimentDefaults || {};
  const [mode, setMode] = useState("idle");
  const [currentSnap, setCurrentSnap] = useState(null);
  const [log, setLog] = useState([]);
  const [autoSpeed, setAutoSpeed] = useState(400);
  const [autoRunning, setAutoRunning] = useState(false);
  const [saveStatus, setSaveStatus] = useState(null);
  const [phaseCTruncated, setPhaseCTruncated] = useState(false);
  const [results, setResults] = useState(null);
  const [liveWaitDist, setLiveWaitDist] = useState(null);
  const [liveSummary, setLiveSummary] = useState(null);
  const [singleRunStatus, setSingleRunStatus] = useState("idle");
  const [singleRunProgress, setSingleRunProgress] = useState(null);
  const [batchStatus, setBatchStatus] = useState("idle");
  const [batchProgress, setBatchProgress] = useState(null);
  const [replicationResults, setReplicationResults] = useState([]);
  const [aggregateStats, setAggregateStats] = useState({});
  const [replicationDetailOpen, setReplicationDetailOpen] = useState(false);
  const [seed, setSeed] = useState(() => Math.floor(mulberry32(Date.now())() * 1e9));
  const [resolvedSeed, setResolvedSeed] = useState(null);
  const [loadedRunSnapshot, setLoadedRunSnapshot] = useState(null);
  const [warmupPeriod, setWarmupPeriod] = useState(() => numberDefault(experimentDefaults.warmupPeriod, 0));
  const [warmupDetection, setWarmupDetection] = useState(null);
  const [maxSimTime, setMaxSimTime] = useState(() => numberDefault(experimentDefaults.maxSimTime, 500));
  const [terminationMode, setTerminationMode] = useState(() => experimentDefaults.terminationMode === "condition" ? "condition" : "time");
  const [terminationCondition, setTerminationCondition] = useState(() => experimentDefaults.terminationCondition || null);
  const [purgePeriodEnabled, setPurgePeriodEnabled] = useState(() => !!experimentDefaults.purgePeriod?.enabled);
  const [replications, setReplications] = useState(() => intDefault(experimentDefaults.replications, 1));
  const [runLabel, setRunLabel] = useState("");
  const [executeSection, setExecuteSection] = useState("run");
  const [hideRunReadiness, setHideRunReadiness] = useState(false);
  const [showRunSetup, setShowRunSetup] = useState(false);
  const [savedRunHistory, setSavedRunHistory] = useState([]);
  const [runHistoryStatus, setRunHistoryStatus] = useState("idle");
  const [runHistoryError, setRunHistoryError] = useState("");
  const [sweepOpen, setSweepOpen] = useState(false);
  const [sweepParams, setSweepParams] = useState([]);
  const [sweepSelectedParam, setSweepSelectedParam] = useState(null);
  const [sweepPickerOpen, setSweepPickerOpen] = useState(false);
  const [sweepPickerBOpen, setSweepPickerBOpen] = useState(false);
  const [sweepMin, setSweepMin] = useState(1);
  const [sweepMax, setSweepMax] = useState(5);
  const [sweepStep, setSweepStep] = useState(1);
  const [sweepStatus, setSweepStatus] = useState("idle");
  const [sweepResults, setSweepResults] = useState(null);
  const [sweepProgress, setSweepProgress] = useState(null);
  const [sweepKpiMetric, setSweepKpiMetric] = useState("summary.avgWait");
  const [sweepMode, setSweepMode] = useState("1d");
  const [sweepSelectedParamB, setSweepSelectedParamB] = useState(null);
  const [sweepMinB, setSweepMinB] = useState(1);
  const [sweepMaxB, setSweepMaxB] = useState(5);
  const [sweepStepB, setSweepStepB] = useState(1);
  const [sweepGridError, setSweepGridError] = useState(null);
  const [selectedCell, setSelectedCell] = useState(null);
  const [comparisonIdxA, setComparisonIdxA] = useState(0);
  const [comparisonIdxB, setComparisonIdxB] = useState(null);
  const [comparisonResult, setComparisonResult] = useState(null);
  // F28.1: Saved experiment definitions
  const [experiments, setExperiments] = useState([]);
  const [experimentsStatus, setExperimentsStatus] = useState("idle");
  const [experimentsError, setExperimentsError] = useState("");
  const [expFormOpen, setExpFormOpen] = useState(false);
  const [expEditId, setExpEditId] = useState(null);
  const [expFormName, setExpFormName] = useState("");
  const [expFormDesc, setExpFormDesc] = useState("");
  const [expFormOverrides, setExpFormOverrides] = useState([]);
  const [expFormPickerOpen, setExpFormPickerOpen] = useState(false);
  const [expFormSaving, setExpFormSaving] = useState(false);
  const [reportGenerating, setReportGenerating] = useState(false);
  const [modelCheckerIssues, setModelCheckerIssues] = useState(null);
  const [modelCheckerOpen, setModelCheckerOpen] = useState(false);

  // ── ADR-016: Schedule selection ──────────────────────────────────────────────
  // modelSchedules: all schedules for this model (fetched on mount when modelId is set)
  // selectedScheduleId: the schedule to use for the next run (null = use inline rows / default)
  const [modelSchedules, setModelSchedules] = useState([]);
  const [selectedScheduleId, setSelectedScheduleId] = useState(null);
  const [schedulesLoading, setSchedulesLoading] = useState(false);

  const sweepRunnerRef = useRef(null);
  const runSeedRef = useRef(seed);
  const engineRef = useRef(null);
  const autoRef = useRef(null);
  const liveHistThrottleRef = useRef(0);
  const runnerRef = useRef(null);
  const singleRunCancelRef = useRef(false);
  const saveInProgressRef = useRef(false);
  const logRef = useRef([]);
  const runStartPerfRef = useRef(null);
  const [animationEnabled, setAnimationEnabled] = useState(true);
  const [collectTimeSeries, setCollectTimeSeries] = useState(true);
  const [saveDetailLevel, setSaveDetailLevel] = useState("compact");
  const [kpiSlots, setKpiSlots] = useState(DEFAULT_KPI_SLOTS);
  const [speedMultiplier, setSpeedMultiplier] = useState(1);
  const [selectedNodeLabel, setSelectedNodeLabel] = useState(null);
  const [selectedNodeDetail, setSelectedNodeDetail] = useState(null);
  const [selectedEntityId, setSelectedEntityId] = useState(null);
  const [shareLinks, setShareLinks] = useState([]);
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareConfig, setShareConfig] = useState(() => ({
    title: "",
    pinnedWidgets: ["summary", "queues", "resources", "charts"],
    expiresIn: "never",
  }));
  const [shareSaving, setShareSaving] = useState(false);
  const [justCreatedLink, setJustCreatedLink] = useState(null);
  const [shareLinksLoading, setShareLinksLoading] = useState(false);
  const [qrToken, setQrToken] = useState(null);
  const qrRef = useRef(null);
  const [latestRunId, setLatestRunId] = useState(null);
  const [showExportPopover, setShowExportPopover] = useState(false);
  const [exportFormats, setExportFormats] = useState({ json: true, csv: false });
  const [exportMetricsOnly, setExportMetricsOnly] = useState(false);
  const [showCreateReportModal, setShowCreateReportModal] = useState(false);
  const [reportType, setReportType] = useState('seniorMgmt'); // 'seniorMgmt' | 'technical'
  const [reportFormat, setReportFormat] = useState('html'); // 'html' | 'markdown'
  const effectiveAutoSpeed = useMemo(
    () => Math.max(40, Math.round(400 / speedMultiplier)),
    [speedMultiplier]
  );
  const runSetupSummary = useMemo(() => {
    const modeLabel = terminationMode === "condition" ? "Stops when the rule is met" : `Stops after ${maxSimTime} time units`;
    return [
      `Ignoring first ${warmupPeriod} time units`,
      `${replications} run${replications === 1 ? "" : "s"}`,
      `Random pattern: ${seed}`,
      modeLabel,
    ];
  }, [warmupPeriod, replications, seed, terminationMode, maxSimTime]);
  const effectiveRunLabel = useMemo(
    () => runLabel.trim() || makeDefaultRunLabel(autoRunning ? "AutoRun" : "Batch"),
    [runLabel, autoRunning]
  );

  useEffect(() => {
    logRef.current = log;
  }, [log]);
  useEffect(() => {
    setSaveDetailLevel("compact");
  }, [model?.experimentDefaults?.resultDetailLevel]);

  // Fetch model_schedules when modelId changes (ADR-016)
  useEffect(() => {
    if (!modelId || !userId) {
      setModelSchedules([]);
      setSelectedScheduleId(null);
      return;
    }
    setSchedulesLoading(true);
    fetchModelSchedules(modelId)
      .then(schedules => {
        setModelSchedules(schedules);
        // Pre-select the default schedule if one exists
        const defaultSched = schedules.find(s => s.isDefault);
        setSelectedScheduleId(defaultSched?.id ?? (schedules[0]?.id ?? null));
      })
      .catch(err => {
        console.warn('[ExecutePanel] Failed to load model schedules:', err?.message || err);
        setModelSchedules([]);
        setSelectedScheduleId(null);
      })
      .finally(() => setSchedulesLoading(false));
  }, [modelId, userId, schedulesVersion]);

  const reloadSchedules = useCallback(() => {
    if (!modelId || !userId) return;
    setSchedulesLoading(true);
    fetchModelSchedules(modelId)
      .then(schedules => {
        setModelSchedules(schedules);
        const defaultSched = schedules.find(s => s.isDefault);
        setSelectedScheduleId(defaultSched?.id ?? (schedules[0]?.id ?? null));
      })
      .catch(err => console.warn('[ExecutePanel] reload schedules failed:', err?.message || err))
      .finally(() => setSchedulesLoading(false));
  }, [modelId, userId]);

  const persistExperimentDefaults = useCallback((patch) => {
    if (!onExperimentDefaultsChange) return;
    onExperimentDefaultsChange({
      ...(model.experimentDefaults || {}),
      warmupPeriod,
      maxSimTime,
      replications,
      terminationMode,
      terminationCondition,
      resultDetailLevel: saveDetailLevel,
      ...patch,
    });
  }, [model.experimentDefaults, warmupPeriod, maxSimTime, replications, terminationMode, terminationCondition, saveDetailLevel, onExperimentDefaultsChange]);

  const validation = useMemo(() => {
    return validateModel({
      ...model,
      warmupPeriod,
      replications,
      terminationMode,
      maxSimTime: terminationMode === 'time' ? maxSimTime : 0,
      terminationCondition: terminationMode === 'condition' ? terminationCondition : null
    });
  }, [model, warmupPeriod, maxSimTime, terminationMode, terminationCondition, replications]);
  const hasValidationErrors = validation.errors.length > 0;

  // Build schedulesMap for the selected schedule (ADR-016).
  // Passed to buildEngine via options.schedulesMap so resolveInlineSchedules()
  // can populate bEvent.schedules[].rows[] before the FEL is initialised.
  // Defined before complexityEstimate so the estimator can count timetable rows.
  const activeSchedulesMap = useMemo(() => {
    if (modelSchedules.length === 0) return {};
    // Use the explicitly selected schedule, or fall back to the default so that
    // the complexity estimator and engine both work without a manual selection.
    const resolvedId = selectedScheduleId ?? modelSchedules.find(s => s.isDefault)?.id;
    if (!resolvedId) return {};
    const active = modelSchedules.filter(s => s.id === resolvedId);
    return buildSchedulesMap(active);
  }, [modelSchedules, selectedScheduleId]);


  const complexityEstimate = useMemo(() => estimateRunComplexity(model, {
    terminationMode,
    maxSimTime,
    replications,
    schedulesMap: activeSchedulesMap,
  }), [model, terminationMode, maxSimTime, replications, activeSchedulesMap]);
  const runAdmission = useMemo(() => getRunAdmission(model, {
    warmupPeriod,
    maxSimTime,
    terminationMode,
    terminationCondition,
    replications,
    collectTimeSeries,
    plan,
    isAdmin,
    tierPolicies,
    validation,
    complexityEstimate,
  }), [model, warmupPeriod, maxSimTime, terminationMode, terminationCondition, replications, collectTimeSeries, plan, isAdmin, tierPolicies, validation, complexityEstimate]);
  const hasAdmissionErrors = runAdmission.hardErrors.length > 0;
  const hasAdmissionWarnings = runAdmission.warnings.length > 0;
  const effectiveResultDetailLevel = saveDetailLevel === "full" ? "full" : "minimal";
  const readinessTagColor = hasAdmissionErrors ? C.red : C.green;
  const readinessTagBg = hasAdmissionErrors ? C.errorBg : `${C.green}18`;
  const readinessBorder = hasAdmissionErrors ? C.danger : `${C.green}66`;
  const readinessTitle = hasAdmissionErrors
    ? "Needs attention"
    : "Ready to run";
  const readinessSummary = hasAdmissionErrors
    ? `${runAdmission.hardErrors.length} blocker${runAdmission.hardErrors.length === 1 ? "" : "s"} to resolve before running.`
    : "No blocking issues found for this scenario.";
  const readinessIssues = runAdmission.hardErrors;
  const complexityColor = complexityEstimate.riskLevel === "too_large"
    ? C.red
    : complexityEstimate.riskLevel === "large"
      ? C.amber
      : complexityEstimate.riskLevel === "medium"
        ? C.warnBg
        : C.green;
  const COMPLEXITY_LABELS = { small: "Small", medium: "Medium", large: "Large", too_large: "Very Large" };
  const complexityLabel = COMPLEXITY_LABELS[complexityEstimate.riskLevel] || complexityEstimate.riskLevel;

  // Estimated save payload size (KB) based on complexity and selected detail level.
  // "full" keeps log + trace + entitySummary + timeSeries + waitDist.values; "minimal" strips them all.
  const estSaveKB = useMemo(() => {
    const base = 30; // model snapshot + metadata + summaries
    const repKB = complexityEstimate.replications * 0.5;
    if (saveDetailLevel !== "full") return Math.round(base + repKB);
    const entityKB = (complexityEstimate.totalEstimatedEntities || 0) * 0.15;
    const logKB   = (complexityEstimate.totalEstimatedEntities || 0) * 0.3;
    const traceKB = logKB;
    const waitKB  = Math.max(complexityEstimate.plannedScheduleRows, complexityEstimate.totalEstimatedEntities || 0) * 0.008;
    return Math.round(base + repKB + entityKB + logKB + traceKB + waitKB);
  }, [complexityEstimate, saveDetailLevel]);
  const estSaveLabel = estSaveKB >= 1000 ? `~${(estSaveKB / 1000).toFixed(1)} MB` : `~${estSaveKB} KB`;

  const initEngine = useCallback(() => {
    if (hasValidationErrors) return;
    // Cancel any in-flight batch or sweep workers before rebuilding
    if (runnerRef.current) { runnerRef.current.cancel(); runnerRef.current = null; }
    if (sweepRunnerRef.current) { sweepRunnerRef.current.cancel(); sweepRunnerRef.current = null; }
    if (autoRef.current) { clearInterval(autoRef.current); autoRef.current = null; }
    setHideRunReadiness(true);
    setExecuteSection("run");
    runSeedRef.current = seed;
    setResolvedSeed(seed);
    setLoadedRunSnapshot(null);
    runStartPerfRef.current = nowPerf();
    engineRef.current = buildEngine(
      model,
      seed,
      warmupPeriod,
      terminationMode === 'time' ? maxSimTime : null,
      terminationMode === 'condition' ? terminationCondition : null,
      5000, 500,
      collectTimeSeries,
      undefined,
      { schedulesMap: activeSchedulesMap, purgePeriod: { enabled: purgePeriodEnabled, maxPurgeTime: Math.min(2 * (maxSimTime || 500), 5000) } }
    );
    setCurrentSnap(engineRef.current.getSnap());
    const initLog = [{ phase: "INIT", time: 0, message: `Simulation initialized  (seed: ${seed}, warmup: ${warmupPeriod})` }];
    logRef.current = initLog;
    setLog(initLog);
    setMode("stepping");
    setAutoRunning(false);
    setSaveStatus(null);
    setPhaseCTruncated(false);
    setResults(null);
    setLatestRunId(null);
    setLiveWaitDist(null);
    setLiveSummary(null);
    liveHistThrottleRef.current = 0;
    onResultsReady?.(null);
    onRunComplete?.({ results: null, replicationResults: [], warmupDetection: null, log: [] });
    singleRunCancelRef.current = false;
    setSingleRunStatus("idle");
    setSingleRunProgress(null);
    setBatchStatus("idle");
    setBatchProgress(null);
    setReplicationResults([]);
    setAggregateStats({});
    setWarmupDetection(null);
    setComparisonResult(null);
    setSweepResults(null);
    setSweepStatus("idle");
    setSweepProgress(null);
  }, [model, seed, hasValidationErrors, warmupPeriod, maxSimTime, terminationMode, terminationCondition, collectTimeSeries, onRunComplete]);

  const stopAuto = useCallback(() => {
    if (autoRef.current) {
      clearInterval(autoRef.current);
      autoRef.current = null;
      setAutoRunning(false);
    }
  }, []);

  const refreshRunHistory = useCallback(async () => {
    if (!modelId) return [];
    setRunHistoryStatus("loading");
    setRunHistoryError("");
    const fetcher = userId ? fetchRunHistory : fetchLocalRunHistory;
    try {
      const rows = await fetcher(modelId);
      setSavedRunHistory(rows || []);
      setRunHistoryStatus("loaded");
      return rows || [];
    } catch (error) {
      setSavedRunHistory([]);
      setRunHistoryError(error?.message || "could not load run history");
      setRunHistoryStatus("error");
      return [];
    }
  }, [modelId, userId]);

  // Store LLM-generated narrative and model description in the run record.
  // Called after a run saves successfully — fire-and-forget, never blocks the UI.
  const storeRunNarrative = useCallback(async (runId, model, results) => {
    if (!runId || !userId) return;
    try {
      // Use the actual executed replication count from runtimeMetrics, not the
      // UI state variable — they differ when the user runs a step-through single
      // run while the replications picker is set to > 1.
      const actualReplications = results?.runtimeMetrics?.replications ?? replications;
      const [narrative, description] = await Promise.allSettled([
        callLLMOnce(buildNarrativePrompt(model, { warmupPeriod, maxSimTime, replications: actualReplications, terminationMode }, results)).catch(() => null),
        callLLMOnce(buildModelDescriptionPrompt(model)).catch(() => null),
      ]);
      const narrativeText = narrative.status === 'fulfilled' ? narrative.value : null;
      const descriptionText = description.status === 'fulfilled' ? description.value : null;
      if (narrativeText || descriptionText) {
        await updateRunNarrative(runId, narrativeText, descriptionText);
      }
    } catch {
      // Silently ignore — narrative is optional enhancement
    }
  }, [userId, warmupPeriod, maxSimTime, replications, terminationMode]);

  const doStep = useCallback(async () => {
    if (batchStatus !== "idle" || replicationResults.length > 0) {
      setBatchStatus("idle");
      setReplicationResults([]);
      setAggregateStats({});
    }
    if (!engineRef.current) return;
    setHideRunReadiness(true);
    setExecuteSection("run");
    const r = engineRef.current.step();
    const cycleLog = r.cycleLog || [];
    const nextLog = [...logRef.current, ...cycleLog];
    setCurrentSnap(r.snap);
    logRef.current = nextLog;
    setLog(nextLog);
    if (r.phaseCTruncated) setPhaseCTruncated(true);

    if (!r.done && engineRef.current) {
      const now = Date.now();
      if (now - liveHistThrottleRef.current > 400) {
        liveHistThrottleRef.current = now;
        setLiveWaitDist(engineRef.current.getWaitDist?.() || null);
        setLiveSummary(engineRef.current.getSummary?.() || null);
      }
    }

    if (r.done) {
      setMode("done");
      setLiveWaitDist(null);
      stopAuto();
      const prepareStartedAt = nowPerf();
      setSaveStatus({ state: 'saving', message: 'Preparing results...' });
      await yieldToBrowser();
      const summary = engineRef.current.getSummary();
      const wallClockMs = runStartPerfRef.current == null ? null : Math.max(0, Math.round(nowPerf() - runStartPerfRef.current));
      const finalLog = nextLog;
      const finalSummary = {
        ...summary,
        phaseCTruncated: r.phaseCTruncated || summary.phaseCTruncated,
        total: r.snap?.entities?.filter(e => e.role !== 'server').length || 0,
        served: r.snap?.served || 0,
        reneged: r.snap?.reneged || 0,
      };
      const fullResult = {
        snap: r.snap,
        summary: finalSummary,
        phaseCTruncated: finalSummary.phaseCTruncated,
        timeSeries:    engineRef.current.getTimeSeries?.(),
        waitDist:      engineRef.current.getWaitDist?.(),
        entitySummary: engineRef.current.getEntitySummary?.(),
        runtimeMetrics: {
          ...engineRef.current.getRuntimeMetrics?.(finalSummary.served),
          wall_clock_ms: wallClockMs,
          replications: 1,
        },
        log: finalLog,
      };
      // aggregateStats assigned after object is created to avoid self-reference
      fullResult.aggregateStats = summarizeReplicationResults([fullResult], CI_METRICS);
      setResults(fullResult);
      onResultsReady?.(fullResult);
      onRunComplete?.({ results: fullResult, replicationResults: [], warmupDetection: null, log: finalLog });
      if (modelId) {
        const prepareDurationMs = nowPerf() - prepareStartedAt;
        const stepSeed = runSeedRef.current;
        const runRecord = buildRunRecord(model, fullResult, {
          maxSimTime: terminationMode === 'time' ? maxSimTime : null,
          warmupPeriod,
          replications: 1,
          terminationMode,
          terminationCondition: terminationMode === 'condition' ? terminationCondition : null,
        }, stepSeed, { includeModelSnapshot: true });
        const config = {
          seed: stepSeed,
          runLabel: effectiveRunLabel,
          warmupPeriod,
          maxTime: terminationMode === 'time' ? maxSimTime : null,
          versionId: currentVersionId || null,
          durationMs: wallClockMs,
          requestedCollectTimeSeries: collectTimeSeries,
          effectiveCollectTimeSeries: collectTimeSeries,
          resultDetailLevel: effectiveResultDetailLevel,
          riskLevel: runAdmission.complexityEstimate.riskLevel,
          includeModelSnapshot: true,
        };
        if (userId) {
          setSaveStatus({ state: 'saving', message: 'Saving results…' });
          const runId = await doCloudSave(
            () => saveSimulationRun(modelId, userId, fullResult, { ...config, runRecord }),
            { setSaveStatus, setLog, prepareDurationMs, snapClock: r.snap.clock },
          );
          if (runId) {
            setLatestRunId(runId);
            storeRunNarrative(runId, model, fullResult);
            void refreshRunHistory();
            onRunSaved?.(runId);
          }
        } else {
          saveLocalRun(modelId, fullResult, { ...config, runRecord, resultDetailLevel: "full" });
          void refreshRunHistory();
          setSaveStatus({ state: 'success', message: '✓ Results saved' });
          setLog(prev => [...prev, { phase: "SAVE", time: r.snap.clock, message: "✅ Local history record completed." }]);
          onRunSaved?.(null);
        }
      }
    }
  }, [userId, modelId, model, effectiveRunLabel, warmupPeriod, maxSimTime, terminationMode, terminationCondition, replications, collectTimeSeries, currentVersionId, effectiveResultDetailLevel, runAdmission, stopAuto, onRunSaved, onResultsReady, onRunComplete, refreshRunHistory, storeRunNarrative]);

  const handleDetectWarmup = useCallback(() => {
    if (!replicationResults || replicationResults.length === 0) {
      setWarmupDetection({
        truncationPoint: warmupPeriod,
        explanation: "No replication results available. Run at least one replication first.",
        series: [],
        confidence: "low",
      });
      return;
    }
    const defaultMetrics = ["summary.avgWait", "summary.avgSvc", "summary.avgSojourn"];
    let result = null;
    for (const metric of defaultMetrics) {
      result = detectWarmupWelch(replicationResults, metric, { minWarmup: warmupPeriod });
      if (result.series.length > 0) break;
    }
    if (!result || result.series.length === 0) {
      setWarmupDetection({
        truncationPoint: warmupPeriod,
        explanation: "Could not detect warm-up — no time-series data found in replication results.",
        series: [],
        confidence: "low",
      });
      return;
    }
    setWarmupDetection(result);
  }, [replicationResults, warmupPeriod]);

  const doRunAll = useCallback(async () => {
    stopAuto();
    if (hasAdmissionErrors) return;
    if (saveInProgressRef.current) return;
    if (!modelId) {
      setSaveStatus({ state: 'error', message: '✗ No model to run' });
      return;
    }
    setModelCheckerIssues(runAdmission.modelCheckIssues);
    if (runAdmission.modelCheckIssues.length > 0) setModelCheckerOpen(true);
    if (runAdmission.confirmations.length > 0) {
      const confirmed = window.confirm(runAdmission.confirmations.map(item => item.message).join("\n\n"));
      if (!confirmed) return;
    }

    setHideRunReadiness(true);
    setExecuteSection("run");
    setLatestRunId(null);

    const runSeed = seed;
    setResolvedSeed(runSeed);
    setLoadedRunSnapshot(null);
    const maxTimeForRun = terminationMode === 'time' ? maxSimTime : null;
    const stopConditionForRun = terminationMode === 'condition' ? terminationCondition : null;
    const effectiveCollectTimeSeries = runAdmission.effectiveSettings.collectTimeSeries;
    const chartDataAutoDisabled = collectTimeSeries && !effectiveCollectTimeSeries;

    // ── Live data prefetch (calibrated_batch / lookahead) ─────────────────
    // Resolve all dataSources before handing the model to the engine or workers.
    // The resulting runModel has live values baked into distParams and sched.rows
    // so the engine and web workers stay stateless (no registry needed in workers).
    let runModel = model;
    const liveDataMode = model.experimentDefaults?.liveDataMode;
    if (liveDataMode) {
      setSaveStatus({ state: 'saving', message: '⏳ Fetching live data…' });
      try {
        const envSecrets = collectEnvSecrets(model.dataSources);
        const registry = new AdapterRegistry(model.dataSources || [], envSecrets);
        await registry.prefetchAll();
        runModel = await registry.prefetchScheduleFeeds(runModel);
        runModel = registry.resolveAllParamSources(runModel);
        registry.dispose();
      } catch (err) {
        console.warn('[LiveData] Prefetch failed — running with static model:', err);
      }
      setSaveStatus(null);
    }
    // ─────────────────────────────────────────────────────────────────────

    if (replications > 1) {
      const batchId = makeBatchId();
      const completedPayloads = [];
      runStartPerfRef.current = nowPerf();
      singleRunCancelRef.current = false;
      setSingleRunStatus("idle");
      setSingleRunProgress(null);

      setMode("running");
      setCurrentSnap(null);
      setResults(null);
      setLiveSummary(null);
      onResultsReady?.(null);
    const batchInitLog = [{ phase: "INIT", time: 0, message: `Replication batch started  (N=${replications}, base seed: ${runSeed})` }];
    if (chartDataAutoDisabled) {
      batchInitLog.push({ phase: "NOTE", time: 0, message: "Chart data disabled automatically for this large run." });
    }
    logRef.current = batchInitLog;
    setLog(batchInitLog);
      setSaveStatus(null);
      setPhaseCTruncated(false);
      setBatchStatus("running");
      setBatchProgress({ completed: 0, total: replications, running: 0, pending: replications, cancelled: false, workerCount: 0 });
      setReplicationResults([]);
      setAggregateStats({});

      runnerRef.current = runReplications({
        model: runModel,
        replications,
        baseSeed: runSeed,
        warmupPeriod,
        maxSimTime: maxTimeForRun,
        terminationCondition: stopConditionForRun,
        collectTimeSeries: effectiveCollectTimeSeries,
        schedulesMap: activeSchedulesMap,
        onProgress: progress => setBatchProgress(progress),
        onReplicationComplete: payload => {
          completedPayloads[payload.replicationIndex] = payload;
          const ordered = completedPayloads.filter(Boolean);
          const nextStats = summarizeReplicationResults(ordered, CI_METRICS);

          setReplicationResults(ordered);
          setAggregateStats(nextStats);
          setCurrentSnap(payload.result?.snap || null);
          setLog(prev => {
            const next = [
              ...prev,
              {
                phase: "REP",
                time: payload.result?.finalTime || 0,
                message: `Replication ${payload.replicationIndex + 1}/${replications} complete  (seed: ${payload.seed})`,
              },
            ];
            logRef.current = next;
            return next;
          });
          if (payload.result?.phaseCTruncated || payload.result?.summary?.phaseCTruncated) setPhaseCTruncated(true);
        },
        onComplete: async payloads => {
          try {
            const ordered = payloads.filter(Boolean);
            const prepareStartedAt = nowPerf();
            setSaveStatus({ state: 'saving', message: 'Preparing results...' });
            await yieldToBrowser();
            const stats = summarizeReplicationResults(ordered, CI_METRICS);
            const wallClockMs = runStartPerfRef.current == null ? null : Math.max(0, Math.round(nowPerf() - runStartPerfRef.current));
            const batchResult = {
              ...makeBatchResult(ordered, stats, maxTimeForRun, warmupPeriod),
              runtimeMetrics: makeBatchRuntimeMetrics(ordered, replications, wallClockMs),
              aggregateStats: stats,
            };

            setBatchStatus("complete");
            setResults(batchResult);
            onResultsReady?.(batchResult);
            onRunComplete?.({ results: batchResult, replicationResults: ordered, warmupDetection: null, log: logRef.current });
            setAggregateStats(stats);
            const prepareDurationMs = nowPerf() - prepareStartedAt;
            const batchRunRecord = buildRunRecord(model, batchResult, {
              maxSimTime: maxTimeForRun,
              warmupPeriod,
              replications,
              terminationMode,
              terminationCondition: stopConditionForRun,
            }, runSeed, { includeModelSnapshot: true });
            const batchConfig = {
              seed: runSeed, runLabel: effectiveRunLabel, replications, warmupPeriod, maxTime: maxTimeForRun, batchId,
              aggregateStats: stats,
              replicationResults: ordered.map(payload => ({
                replicationIndex: payload.replicationIndex, seed: payload.seed,
                summary: payload.result?.summary || {}, finalTime: payload.result?.finalTime,
              })),
              versionId: currentVersionId || null,
              durationMs: wallClockMs,
              requestedCollectTimeSeries: collectTimeSeries,
              effectiveCollectTimeSeries: effectiveCollectTimeSeries,
              resultDetailLevel: effectiveResultDetailLevel,
              riskLevel: runAdmission.complexityEstimate.riskLevel,
              includeModelSnapshot: true,
            };
            if (userId) {
              setSaveStatus({ state: 'saving', message: 'Saving results…' });
              const runId = await doCloudSave(
                () => saveSimulationRun(modelId, userId, batchResult, { ...batchConfig, runRecord: batchRunRecord }),
                { setSaveStatus, setLog, prepareDurationMs, snapClock: batchResult.snap.clock },
              );
              if (runId) {
                setLatestRunId(runId);
                storeRunNarrative(runId, model, batchResult);
                void refreshRunHistory();
                onRunSaved?.(runId);
              }
            } else {
              saveLocalRun(modelId, batchResult, { ...batchConfig, runRecord: batchRunRecord, resultDetailLevel: "full" });
              void refreshRunHistory();
              setSaveStatus({ state: 'success', message: '✓ Results saved' });
              setLog(prev => [...prev, { phase: "SAVE", time: batchResult.snap.clock, message: "Replication batch saved locally." }]);
              onRunSaved?.(null);
            }
          } catch (setupError) {
            setBatchStatus("complete");
            setSaveStatus({ state: 'error', message: `✗ Batch error: ${setupError.message}` });
          } finally {
            runnerRef.current = null;
            setMode("done");
          }
        },
        onError: error => {
          setSaveStatus({ state: 'error', message: `✗ Replication failed: ${error.message}` });
          setLog(prev => [...prev, { phase: "ERROR", time: 0, message: `Replication ${error.replicationIndex + 1} failed: ${error.message}` }]);
          runnerRef.current = null;
          setMode("idle");
        },
        onCancelled: () => {
          setBatchStatus("cancelled");
          setSaveStatus({ state: 'error', message: 'Replication batch cancelled. Results were not saved.' });
          setLog(prev => [...prev, { phase: "CANCEL", time: 0, message: "Replication batch cancelled." }]);
          runnerRef.current = null;
          setMode("idle");
        },
      });
      return;
    }

    setResults(null);
    onResultsReady?.(null);
    setSaveStatus(null);
    setPhaseCTruncated(false);
    setBatchStatus("idle");
    setBatchProgress(null);
    setReplicationResults([]);
    setAggregateStats({});
    singleRunCancelRef.current = false;
    setSingleRunStatus("running");
    const runInitLog = [{ phase: "INIT", time: 0, message: `Run started  (seed: ${runSeed})` }];
    if (chartDataAutoDisabled) {
      runInitLog.push({ phase: "NOTE", time: 0, message: "Chart data disabled automatically for this large run." });
    }
    logRef.current = runInitLog;
    setLog(runInitLog);
    setMode("running");
    runStartPerfRef.current = nowPerf();

    const engine = buildEngine(
      runModel,
      runSeed,
      warmupPeriod,
      maxTimeForRun,
      stopConditionForRun,
      5000, 500,
      effectiveCollectTimeSeries,
      undefined,
      { schedulesMap: activeSchedulesMap, purgePeriod: { enabled: purgePeriodEnabled, maxPurgeTime: Math.min(2 * (maxSimTime || 500), 5000) } }
    );
    setSingleRunProgress(engine.getProgress());

    let completed = false;
    while (!completed && !singleRunCancelRef.current) {
      for (let i = 0; i < 50; i++) {
        if (singleRunCancelRef.current) break;
        const stepResult = engine.step({ captureSnap: false });
        if (stepResult.phaseCTruncated) setPhaseCTruncated(true);
        if (stepResult.done) {
          completed = true;
          break;
        }
      }
      setSingleRunProgress(engine.getProgress({ done: completed }));
      if (!completed && !singleRunCancelRef.current) {
        await yieldToBrowser();
      }
    }

    const prepareStartedAt = nowPerf();
    setSaveStatus({ state: 'saving', message: 'Preparing results...' });
    await yieldToBrowser();
    const rawResult = singleRunCancelRef.current
      ? engine.buildResult({ cancelled: true, message: "Run cancelled at a safe checkpoint. Partial results shown." })
      : engine.buildResult();
    const wallClockMs = runStartPerfRef.current == null ? null : Math.max(0, Math.round(nowPerf() - runStartPerfRef.current));
    const result = {
      ...rawResult,
      runtimeMetrics: {
        ...rawResult.runtimeMetrics,
        wall_clock_ms: wallClockMs,
        replications: 1,
      },
    };

    setCurrentSnap(result.snap);
    setResults(result);
    onResultsReady?.(result);
    logRef.current = result.log;
    setLog(result.log);
    onRunComplete?.({ results: result, replicationResults: [], warmupDetection: null, log: result.log });
    setMode("done");
    setSingleRunStatus(singleRunCancelRef.current ? "cancelled" : "complete");
    setSingleRunProgress(engine.getProgress({ done: true, cancelled: singleRunCancelRef.current }));
    if (result.phaseCTruncated || result.summary?.phaseCTruncated) setPhaseCTruncated(true);

    if (singleRunCancelRef.current) {
      setSaveStatus({ state: 'error', message: 'Run cancelled. Partial results were not saved.' });
      return;
    }

    const prepareDurationMs = nowPerf() - prepareStartedAt;
    const singleRunRecord = buildRunRecord(model, result, {
      maxSimTime: maxTimeForRun,
      warmupPeriod,
      replications: 1,
      terminationMode,
      terminationCondition: stopConditionForRun,
    }, runSeed, { includeModelSnapshot: true });
    const config = {
      seed: runSeed,
      runLabel: effectiveRunLabel,
      replications: 1,
      warmupPeriod,
      maxTime: maxTimeForRun,
      versionId: currentVersionId || null,
      durationMs: wallClockMs,
      requestedCollectTimeSeries: collectTimeSeries,
      effectiveCollectTimeSeries: effectiveCollectTimeSeries,
      resultDetailLevel: effectiveResultDetailLevel,
      riskLevel: runAdmission.complexityEstimate.riskLevel,
      includeModelSnapshot: true,
    };
    if (userId) {
      setSaveStatus({ state: 'saving', message: 'Saving results…' });
      const runId = await doCloudSave(
        () => saveSimulationRun(modelId, userId, result, { ...config, runRecord: singleRunRecord }),
        { setSaveStatus, setLog, prepareDurationMs, snapClock: result.snap.clock },
      );
      if (runId) {
        setLatestRunId(runId);
        storeRunNarrative(runId, model, result);
        void refreshRunHistory();
        onRunSaved?.(runId);
      }
    } else {
      saveLocalRun(modelId, result, { ...config, runRecord: singleRunRecord, resultDetailLevel: "full" });
      void refreshRunHistory();
      setSaveStatus({ state: 'success', message: '✓ Results saved' });
      setLog(prev => [...prev, { phase: "SAVE", time: result.snap.clock, message: "✅ Local history record completed." }]);
      onRunSaved?.(null);
    }
  }, [model, userId, modelId, seed, effectiveRunLabel, hasAdmissionErrors, warmupPeriod, maxSimTime, terminationMode, terminationCondition, replications, collectTimeSeries, runAdmission, effectiveResultDetailLevel, stopAuto, onRunSaved, onResultsReady, refreshRunHistory, storeRunNarrative]);

  const cancelBatch = useCallback(() => {
    if (!runnerRef.current) return;
    setBatchStatus("cancelling");
    runnerRef.current.cancel();
  }, []);

  const cancelSingleRun = useCallback(() => {
    if (singleRunStatus !== "running") return;
    singleRunCancelRef.current = true;
    setSingleRunStatus("cancelling");
  }, [singleRunStatus]);

  const toggleAuto = () => {
    if (autoRunning) {
      stopAuto();
    } else {
      setHideRunReadiness(true);
      if (batchStatus !== "idle" || replicationResults.length > 0) {
        setBatchStatus("idle");
        setReplicationResults([]);
        setAggregateStats({});
      }
      if (mode === "idle") initEngine();
      setAutoRunning(true);
    }
  };

  useEffect(() => {
    setHideRunReadiness(false);
  }, [modelId, currentVersionId]);

  useEffect(() => {
    if (!autoRunning) return;
    autoRef.current = setInterval(doStep, effectiveAutoSpeed);
    return () => {
      if (autoRef.current) {
        clearInterval(autoRef.current);
        autoRef.current = null;
      }
    };
  }, [autoRunning, effectiveAutoSpeed, doStep]);

  useEffect(() => {
    return () => runnerRef.current?.cancel();
  }, []);

  const autoRunRef = useRef(false);
  useEffect(() => {
    if (!visible || !autoRun || autoRunRef.current || hasAdmissionErrors || !modelId) return;
    autoRunRef.current = true;
    doRunAll();
  }, [visible, autoRun, hasAdmissionErrors, modelId, doRunAll]);

  useEffect(() => {
    if (!userId) return;
    fetchUserSettings(userId)
      .then(({ settings }) => {
        if (settings?.execute?.animateTokens !== undefined) {
          setAnimationEnabled(settings.execute.animateTokens !== false);
        }
        if (Array.isArray(settings?.execute?.kpiSlots)) {
          setKpiSlots(settings.execute.kpiSlots);
        }
      })
      .catch(() => {});
  }, [userId]);

  const saveExecuteSetting = useCallback(async (patch) => {
    if (!userId) return;
    try {
      const current = await fetchUserSettings(userId);
      await saveUserSettings(userId, {
        ...current.settings,
        execute: { ...current.settings?.execute, ...patch },
      });
    } catch {}
  }, [userId]);

  const toggleAnimation = useCallback(() => {
    const next = !animationEnabled;
    setAnimationEnabled(next);
    saveExecuteSetting({ animateTokens: next });
  }, [animationEnabled, saveExecuteSetting]);

  const handleKpiSlotChange = useCallback((slotIndex, newKey) => {
    setKpiSlots(prev => {
      const next = [...prev];
      next[slotIndex] = newKey;
      saveExecuteSetting({ kpiSlots: next });
      return next;
    });
  }, [saveExecuteSetting]);

  useEffect(() => {
    if (!modelId) return;
    let cancelled = false;
    refreshRunHistory()
      .then(rows => {
        if (cancelled) return;
        setSavedRunHistory(rows || []);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [modelId, refreshRunHistory]);

  // F28.1: load experiments when tab is opened
  useEffect(() => {
    if (executeSection !== "saved-experiments" || !modelId || !userId) return;
    let cancelled = false;
    setExperimentsStatus("loading");
    setExperimentsError("");
    fetchExperiments(modelId)
      .then(rows => {
        if (cancelled) return;
        setExperiments(rows || []);
        setExperimentsStatus("loaded");
      })
      .catch(err => {
        if (cancelled) return;
        setExperiments([]);
        setExperimentsError(err?.message || "Could not load experiments");
        setExperimentsStatus("error");
      });
    return () => { cancelled = true; };
  }, [executeSection, modelId, userId]);

  const batchActive = batchStatus === "running" || batchStatus === "cancelling";
  const singleRunActive = singleRunStatus === "running" || singleRunStatus === "cancelling";
  const runBusy = batchActive || singleRunActive;
  const partialBatchStatus = batchStatus === "cancelled" || batchStatus === "error";
  const canExportResults = Boolean(results || (partialBatchStatus && replicationResults.length));
  const canOpenResultsView = Boolean(results || replicationResults.length > 0);
  const isModelModified = useMemo(() =>
    loadedRunSnapshot !== null &&
    JSON.stringify(model) !== JSON.stringify(loadedRunSnapshot),
  [model, loadedRunSnapshot]);
  const exportConfig = useMemo(() => ({
    modelId,
    seed: runSeedRef.current,
    runLabel: effectiveRunLabel,
    replications,
    warmupPeriod,
    maxSimTime: terminationMode === "time" ? maxSimTime : null,
    terminationMode,
    terminationCondition: terminationMode === "condition" ? terminationCondition : null,
  }), [modelId, effectiveRunLabel, replications, warmupPeriod, maxSimTime, terminationMode, terminationCondition]);
  const exportPartial = partialBatchStatus && replicationResults.length > 0;
  const resultFilenameBase = `simmodlr-results-${slugifyResultName(model.name)}${exportPartial ? "-partial" : ""}-${timestampForFilename()}`;
  const comparisonRuns = useMemo(() => {
    const savedRuns = savedRunHistory.map(row => ({
      id: `saved-${row.id}`,
      label: row.run_label || row.runLabel || `Saved ${(row.ran_at || row.createdAt) ? new Date(row.ran_at || row.createdAt).toLocaleString() : row.id}`,
      payload: row,
      source: "saved",
    }));
    const currentReplications = replicationResults.map(payload => ({
      id: `rep-${payload.replicationIndex}`,
      label: makeRunLabel(payload),
      payload,
      source: "session",
    }));
    return [...savedRuns, ...currentReplications];
  }, [savedRunHistory, replicationResults]);
  const recentSavedRuns = useMemo(
    () => savedRunHistory.slice(0, 3).map(row => ({
      id: row.id,
      label: row.run_label || row.runLabel || "Saved run",
      timestamp: row.ran_at || row.createdAt || null,
      replications: row.replications || 1,
    })),
    [savedRunHistory]
  );

  const runWithPatch = useCallback((patchedModel) => {
    return new Promise((resolve) => {
      const completedPayloads = [];
      runReplications({
        model: patchedModel,
        replications,
        baseSeed: seed,
        warmupPeriod,
        maxSimTime: terminationMode === 'time' ? maxSimTime : null,
        terminationCondition: terminationMode === 'condition' ? terminationCondition : null,
        collectTimeSeries: false,
        schedulesMap: activeSchedulesMap,
        onReplicationComplete: payload => {
          completedPayloads[payload.replicationIndex] = payload;
        },
        onComplete: payloads => {
          const valid = payloads.filter(Boolean);
          const aggregateStats = summarizeReplicationResults(valid, CI_METRICS);
          const first = valid[0]?.result || {};
          const verifyResult = {
            aggregateStats,
            summary:       first.summary       || {},
            waitDist:      first.waitDist      || valid[0]?.waitDist,
            entitySummary: first.entitySummary || valid[0]?.entitySummary,
            timeSeries:    first.timeSeries    || valid[0]?.timeSeries,
            snap:          first.snap,
            phaseCTruncated: first.phaseCTruncated || false,
          };
          setResults(verifyResult);
          onResultsReady?.(verifyResult);
          resolve(verifyResult);
        },
        onError: () => resolve(null),
      });
    });
  }, [seed, warmupPeriod, maxSimTime, terminationMode, terminationCondition, replications, onResultsReady]);

  // Verification-only run: same as runWithPatch but does NOT update main results state,
  // so the baseline aggregateStats stays intact for before/after comparison.
  const runForVerification = useCallback((patchedModel) => {
    return new Promise((resolve) => {
      const completedPayloads = [];
      runReplications({
        model: patchedModel,
        replications,
        baseSeed: seed,
        warmupPeriod,
        maxSimTime: terminationMode === 'time' ? maxSimTime : null,
        terminationCondition: terminationMode === 'condition' ? terminationCondition : null,
        collectTimeSeries: false,
        schedulesMap: activeSchedulesMap,
        onReplicationComplete: payload => {
          completedPayloads[payload.replicationIndex] = payload;
        },
        onComplete: payloads => {
          const valid = payloads.filter(Boolean);
          const aggregateStats = summarizeReplicationResults(valid, CI_METRICS);
          const first = valid[0]?.result || valid[0] || {};
          const summary = first.summary || {};
          // Aggregate waitDist means across all replications so goal checks
          // are not based on a single noisy replication.
          const waitDist = (() => {
            const acc = {};
            for (const p of valid) {
              const wd = p?.result?.waitDist || p?.waitDist || {};
              for (const [qName, stats] of Object.entries(wd)) {
                if (!acc[qName]) acc[qName] = { means: [], n: 0 };
                if (stats?.mean != null) acc[qName].means.push(stats.mean);
                acc[qName].n += stats?.n || 0;
              }
            }
            const out = {};
            for (const [qName, agg] of Object.entries(acc)) {
              if (agg.means.length > 0) {
                out[qName] = {
                  mean: agg.means.reduce((s, v) => s + v, 0) / agg.means.length,
                  n: agg.n,
                };
              }
            }
            return out;
          })();
          resolve({ aggregateStats, summary, waitDist });
        },
        onError: () => resolve(null),
      });
    });
  }, [seed, warmupPeriod, maxSimTime, terminationMode, terminationCondition, replications]);

  useEffect(() => { onExposeRunApi?.(runForVerification); }, [runForVerification, onExposeRunApi]);

  const exportResultsJson = useCallback((metricsOnly = false) => {
    setSaveStatus({ state: 'saving', message: 'Preparing export…' });
    const payload = buildResultsExportPayload({
      model,
      results,
      replicationResults,
      aggregateStats,
      config: exportConfig,
      batchStatus,
      metricsOnly,
    });
    const suffix = metricsOnly ? "-metrics" : "";
    downloadTextFile(
      JSON.stringify(payload, null, 2),
      `${resultFilenameBase}${suffix}.json`,
      "application/json"
    );
    setSaveStatus({ state: 'success', message: '✓ Export complete' });
    setTimeout(() => setSaveStatus(null), 4000);
  }, [model, results, replicationResults, aggregateStats, exportConfig, batchStatus, resultFilenameBase]);

  const exportResultsCsv = useCallback(() => {
    setSaveStatus({ state: 'saving', message: 'Preparing export…' });
    const csv = buildResultsCsv({
      results,
      replicationResults,
      aggregateStats,
      config: exportConfig,
    });
    downloadTextFile(
      csv,
      `${resultFilenameBase}.csv`,
      "text/csv;charset=utf-8"
    );
    setSaveStatus({ state: 'success', message: '✓ Export complete' });
    setTimeout(() => setSaveStatus(null), 4000);
  }, [results, replicationResults, aggregateStats, exportConfig, resultFilenameBase]);

  const exportLLMBundle = useCallback(() => {
    setSaveStatus({ state: 'saving', message: 'Preparing AI tools export…' });
    const bundleConfig = {
      runLabel: exportConfig.runLabel,
      replications: exportConfig.replications,
      maxSimTime: exportConfig.maxSimTime,
      warmupPeriod: exportConfig.warmupPeriod,
      seed: exportConfig.seed,
      ranAt: new Date().toISOString(),
    };
    const activeResults = results || (replicationResults.length ? replicationResults[replicationResults.length - 1]?.result : null);
    const bundleResults = { ...activeResults, aggregateStats, replications: replicationResults.map(p => ({ replicationIndex: p.replicationIndex, seed: p.seed, summary: p.result?.summary ?? p.summary ?? {} })) };
    const md = buildLLMBundle(model, bundleResults, bundleConfig);
    downloadTextFile(md, `${resultFilenameBase}-llm-bundle.md`, "text/markdown;charset=utf-8");
    setSaveStatus({ state: 'success', message: '✓ LLM bundle downloaded' });
    setTimeout(() => setSaveStatus(null), 4000);
  }, [model, results, replicationResults, aggregateStats, exportConfig, resultFilenameBase]);

  const assembleRunMeta = (runId) => {
    const rec = savedRunHistory.find(r => r.id === runId);
    const rj = rec?.results_json || {};
    return {
      runId: rec?.id || runId || 'unknown',
      runLabel: rec?.run_label || effectiveRunLabel,
      engineVersion: rec?.engine_version || rj._engine_version || '1.0',
      seed: rec?.seed ?? rj._base_seed ?? seed ?? 'unknown',
      prnAlgorithm: 'mulberry32',
      runTimestamp: rec?.run_at || new Date().toISOString(),
      narrativeText: rj.narrative_text ?? null,
      modelDescriptionText: rj.model_description_text ?? null,
    };
  };

  const handleExportReport = useCallback(async (type = 'technical', format = 'html') => {
    if (!results) return;
    setReportGenerating(true);
    setShowCreateReportModal(false);
    setSaveStatus({ state: 'saving', message: 'Preparing report…' });
    try {
      const meta = assembleRunMeta(latestRunId);
      let reportModel = model;
      if (latestRunId) {
        try {
          const run = await getRun(latestRunId);
          if (run?.model_snapshot) reportModel = run.model_snapshot;
        } catch {}
      }
      const content = await generateReport(reportModel, results, exportConfig, meta, {
        type,
        format,
        aggregateStats: aggregateStats || {},
      });
      const mimeType = format === 'markdown' ? 'text/markdown' : 'text/html';
      const ext = format === 'markdown' ? 'md' : 'html';
      const reportTypeSuffix = type === 'seniorMgmt' ? 'Management' : 'Technical';
      const safeName = `${sanitizeFilename(reportModel.name || 'Model')} — ${sanitizeFilename(meta.runLabel || 'Report')} — ${reportTypeSuffix} Report.${ext}`;
      const blob = new Blob([content], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = safeName;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setSaveStatus({ state: 'success', message: '✓ Report complete' });
      setTimeout(() => setSaveStatus(null), 4000);
    } catch (err) {
      console.error('Report generation failed:', err);
      setSaveStatus({ state: 'error', message: '✗ Report generation failed. Please try again.' });
    } finally {
      setReportGenerating(false);
    }
  }, [results, latestRunId, model, exportConfig, effectiveRunLabel, seed, savedRunHistory, aggregateStats]);

  const loadShareLinks = useCallback(async () => {
    if (!modelId) return;
    setShareLinksLoading(true);
    try {
      const links = await listShareLinks(modelId);
      setShareLinks(links);
    } catch { setShareLinks([]); }
    finally { setShareLinksLoading(false); }
  }, [modelId]);

  const handleCreateShareLink = useCallback(async () => {
    if (!userId || !results || !latestRunId) return;
    setShareSaving(true);
    try {
      const expiresAt =
        shareConfig.expiresIn === "24h"  ? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() :
        shareConfig.expiresIn === "7d"   ? new Date(Date.now() + 7  * 24 * 60 * 60 * 1000).toISOString() :
        shareConfig.expiresIn === "30d"  ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() :
        null;
      const result = await createShareLink(latestRunId, userId, { ...shareConfig, expiresAt });
      setJustCreatedLink(result);
      await loadShareLinks();
    } catch (e) {
      setSaveStatus({ state: "error", message: `Share link failed: ${e.message}` });
    } finally { setShareSaving(false); }
  }, [userId, results, latestRunId, shareConfig, loadShareLinks]);

  const handleRevokeShareLink = useCallback(async (id) => {
    if (!userId) return;
    try {
      await revokeShareLink(id, userId);
      await loadShareLinks();
    } catch (e) {
      setSaveStatus({ state: "error", message: `Revoke failed: ${e.message}` });
    }
  }, [userId, loadShareLinks]);

  const toggleWidget = useCallback((key) => {
    setShareConfig(prev => ({
      ...prev,
      pinnedWidgets: prev.pinnedWidgets.includes(key)
        ? prev.pinnedWidgets.filter(w => w !== key)
        : [...prev.pinnedWidgets, key],
    }));
  }, []);

  const canShare = userId && results && latestRunId && !shareSaving;

  const handleRunSweep = useCallback(() => {
    if (hasAdmissionErrors) return;
    if (sweepMode === "1d" && !sweepSelectedParam) return;
    if (sweepMode === "2d" && (!sweepSelectedParam || !sweepSelectedParamB)) return;

    setSweepStatus("running");
    setSweepResults(null);
    setSweepProgress(null);
    setSweepGridError(null);

    if (sweepMode === "2d") {
      try {
        generate2DSweepValues(
          { min: sweepMin, max: sweepMax, step: sweepStep },
          { min: sweepMinB, max: sweepMaxB, step: sweepStepB }
        );
      } catch (err) {
        setSweepGridError(err.message);
        setSweepStatus("idle");
        return;
      }

      sweepRunnerRef.current = run2DSweep({
        model,
        paramConfigs: [sweepSelectedParam, sweepSelectedParamB],
        ranges: [
          { min: sweepMin, max: sweepMax, step: sweepStep },
          { min: sweepMinB, max: sweepMaxB, step: sweepStepB },
        ],
        replications,
        baseSeed: seed,
        warmupPeriod,
        maxSimTime: terminationMode === "time" ? maxSimTime : null,
        terminationCondition: terminationMode === "condition" ? terminationCondition : null,
        collectTimeSeries: runAdmission.effectiveSettings.collectTimeSeries,
        schedulesMap: activeSchedulesMap,
        onProgress(progress) {
          setSweepProgress(progress);
        },
        onPointComplete(pointResult) {
          setSweepResults(prev => [...(prev || []), pointResult]);
        },
        onError(error) {
          setSweepStatus("error");
          setSaveStatus({ state: "error", message: `Sweep error at point ${error.pointIndex}: ${error.message}` });
        },
        onComplete(results) {
          setSweepStatus("complete");
          setSweepResults(results);
          setSaveStatus({ state: "success", message: `Sweep complete: ${results.length} points run.` });
        },
        onCancelled(partial) {
          setSweepStatus("complete");
          setSweepResults(partial.results);
          setSaveStatus({ state: "success", message: `Sweep cancelled after ${partial.completedPoints} points.` });
        },
      });
    } else {
      sweepRunnerRef.current = runSweep({
        model,
        paramConfig: sweepSelectedParam,
        min: sweepMin,
        max: sweepMax,
        step: sweepStep,
        replications,
        baseSeed: seed,
        warmupPeriod,
        maxSimTime: terminationMode === "time" ? maxSimTime : null,
        terminationCondition: terminationMode === "condition" ? terminationCondition : null,
        collectTimeSeries: runAdmission.effectiveSettings.collectTimeSeries,
        schedulesMap: activeSchedulesMap,
        onProgress(progress) {
          setSweepProgress(progress);
        },
        onPointComplete(pointResult) {
          setSweepResults(prev => [...(prev || []), pointResult]);
        },
        onError(error) {
          setSweepStatus("error");
          setSaveStatus({ state: "error", message: `Sweep error at point ${error.pointIndex}: ${error.message}` });
        },
        onComplete(results) {
          setSweepStatus("complete");
          setSweepResults(results);
          setSaveStatus({ state: "success", message: `Sweep complete: ${results.length} points run.` });
        },
        onCancelled(partial) {
          setSweepStatus("complete");
          setSweepResults(partial.results);
          setSaveStatus({ state: "success", message: `Sweep cancelled after ${partial.completedPoints} points.` });
        },
      });
    }
  }, [model, sweepMode, sweepSelectedParam, sweepSelectedParamB, sweepMin, sweepMax, sweepStep,
      sweepMinB, sweepMaxB, sweepStepB, replications, seed, warmupPeriod, maxSimTime,
      terminationMode, terminationCondition, collectTimeSeries, hasAdmissionErrors, runAdmission]);

  const handleCancelSweep = useCallback(() => {
    sweepRunnerRef.current?.cancel();
  }, []);

  const baseUrl = window.location.origin + window.location.pathname.replace(/\/+$/, "");
  const copyToClipboard = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      setSaveStatus({ state: 'success', message: '✓ Copied to clipboard!' });
    } catch {
      setSaveStatus({ state: 'error', message: 'Failed to copy to clipboard.' });
    }
  };

  useEffect(() => {
    if (qrRef.current && qrToken) {
      qrRef.current.innerHTML = qrSvg(`${baseUrl}/#share/${qrToken}`, 180);
    }
  }, [qrToken, baseUrl]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {[
          { id: "run", label: "Run" },
          { id: "setup", label: "Setup" },
          { id: "saved-experiments", label: "Experiments" },
          { id: "experiments", label: "Studies" },
        ].map(section => (
          <Btn
            key={section.id}
            small
            variant={executeSection === section.id ? "primary" : "ghost"}
            onClick={() => {
              if (section.id === "experiments" && !sweepOpen) setSweepParams(enumerateSweepableParams(model));
              if (section.id === "run") {
                setHideRunReadiness(false);
                if (executeSection !== "run") {
                  setBatchStatus("idle");
                  setReplicationResults([]);
                  setAggregateStats({});
                }
              }
              setExecuteSection(section.id);
            }}
          >
            {section.label}
          </Btn>
        ))}
      </div>

      {executeSection === "setup" && (
        <div style={{ maxWidth: 1120, margin: "0 auto" }}>
        <ExperimentControls
          warmupPeriod={warmupPeriod} setWarmupPeriod={setWarmupPeriod}
          replications={replications} setReplications={setReplications}
          seed={seed} setSeed={setSeed}
          runLabel={runLabel} setRunLabel={setRunLabel}
          terminationMode={terminationMode} setTerminationMode={setTerminationMode}
          maxSimTime={maxSimTime} setMaxSimTime={setMaxSimTime}
          terminationCondition={terminationCondition} setTerminationCondition={setTerminationCondition}
          showRunSetup={showRunSetup} setShowRunSetup={setShowRunSetup}
          runSetupSummary={runSetupSummary}
          warmupDetection={warmupDetection} setWarmupDetection={setWarmupDetection}
          replicationResults={replicationResults}
          model={model}
          onDetectWarmup={handleDetectWarmup}
          persistExperimentDefaults={persistExperimentDefaults}
          animationEnabled={animationEnabled} setAnimationEnabled={setAnimationEnabled}
          collectTimeSeries={collectTimeSeries} setCollectTimeSeries={setCollectTimeSeries}
          purgePeriodEnabled={purgePeriodEnabled} setPurgePeriodEnabled={setPurgePeriodEnabled}
          saveDetailLevel={saveDetailLevel} setSaveDetailLevel={setSaveDetailLevel}
          speedMultiplier={speedMultiplier} setSpeedMultiplier={setSpeedMultiplier}
          onClose={() => setExecuteSection("run")}
        />
        </div>
      )}

      {executeSection === "saved-experiments" && (
      <div style={{ maxWidth: 1120, margin: "0 auto" }}>
      <div style={{ background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden" }}>
        <div style={{ padding: "12px 16px 0", fontSize: 11, color: C.muted, fontFamily: FONT, lineHeight: 1.5 }}>
          Save named run configurations — warm-up, replications, seed, and parameter overrides — so you can reload and re-run them later. Results are saved to run history when you run.
        </div>
        {/* Header row */}
        <div style={{ padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: `1px solid ${C.border}` }}>
          <span style={{ fontSize: 10, color: C.muted, fontFamily: FONT, letterSpacing: 1.2, fontWeight: 700 }}>SAVED EXPERIMENTS</span>
          {userId && (
            <Btn small variant="primary" onClick={() => {
              setExpEditId(null);
              setExpFormName("");
              setExpFormDesc("");
              setExpFormOverrides([]);
              setExpFormPickerOpen(false);
              if (sweepParams.length === 0) setSweepParams(enumerateSweepableParams(model));
              setExpFormOpen(true);
            }}>
              New Experiment
            </Btn>
          )}
        </div>

        {/* New / Edit form */}
        {expFormOpen && (
          <div style={{ padding: 16, borderBottom: `1px solid ${C.border}`, display: "flex", flexDirection: "column", gap: 12 }}>
            <span style={{ fontSize: 10, color: C.label, fontFamily: FONT, letterSpacing: 1.2, fontWeight: 700 }}>
              {expEditId ? "EDIT EXPERIMENT" : "NEW EXPERIMENT"}
            </span>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={{ fontSize: 10, color: C.muted, fontFamily: FONT }}>Name *</span>
              <input
                aria-label="Experiment name"
                type="text"
                value={expFormName}
                onChange={e => setExpFormName(e.target.value)}
                placeholder="e.g. High-load scenario"
                style={{ background: "transparent", border: `1px solid ${C.border}`, borderRadius: 4, color: C.text, fontFamily: FONT, fontSize: 12, padding: "6px 8px", outline: "none" }}
              />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={{ fontSize: 10, color: C.muted, fontFamily: FONT }}>Description</span>
              <input
                aria-label="Experiment description"
                type="text"
                value={expFormDesc}
                onChange={e => setExpFormDesc(e.target.value)}
                placeholder="Optional notes"
                style={{ background: "transparent", border: `1px solid ${C.border}`, borderRadius: 4, color: C.text, fontFamily: FONT, fontSize: 12, padding: "6px 8px", outline: "none" }}
              />
            </div>
            {/* Capture current execute settings */}
            <div style={{ fontSize: 11, color: C.muted, fontFamily: FONT }}>
              Captures current settings: {replications} repl · seed {seed} · warm-up {warmupPeriod} · {terminationMode === "time" ? `duration ${maxSimTime}` : "condition stop"}
            </div>
            {/* Parameter overrides */}
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: 10, color: C.label, fontFamily: FONT, letterSpacing: 1.2, fontWeight: 700 }}>PARAMETER OVERRIDES</span>
                <Btn small variant="ghost" onClick={() => setExpFormPickerOpen(o => !o)}>
                  {expFormPickerOpen ? "Done" : "+ Add"}
                </Btn>
              </div>
              {expFormOverrides.map((ov, idx) => {
                const param = sweepParams.find(p => p.path === ov.path);
                const chipColor = (() => {
                  const t = param?.type;
                  if (t === "entityTypeCount" || t === "shiftCapacity") return C.server;
                  if (t === "queueCapacity") return C.green;
                  if (t === "bEventDistParam" || t === "bEventPiecewisePeriodParam") return C.bEvent;
                  if (t === "cEventDistParam" || t === "cEventPiecewisePeriodParam") return C.cEvent;
                  return C.muted;
                })();
                return (
                  <div key={idx} style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <div style={{
                      flex: 2, display: "flex", flexDirection: "column", gap: 1,
                      background: alpha(chipColor, 0.09), border: `1px solid ${alpha(chipColor, 0.27)}`,
                      borderRadius: RADIUS.sm, padding: "3px 8px", minWidth: 0,
                    }}>
                      <span style={{ fontSize: 11, color: chipColor, fontFamily: FONT, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {param?.label ?? ov.path}
                      </span>
                      {param?.subLabel && (
                        <span style={{ fontSize: 10, color: C.muted, fontFamily: FONT }}>{param.subLabel}</span>
                      )}
                    </div>
                    <input
                      aria-label={`Override value ${idx + 1}`}
                      type="number"
                      value={ov.value}
                      onChange={e => setExpFormOverrides(prev => prev.map((o, i) => i === idx ? { ...o, value: e.target.value } : o))}
                      placeholder="value"
                      style={{ width: 80, background: "transparent", border: `1px solid ${C.border}`, borderRadius: RADIUS.sm, color: C.amber, fontFamily: FONT, fontSize: 11, padding: "4px 6px", outline: "none", flexShrink: 0 }}
                    />
                    <Btn small variant="ghost" ariaLabel={`Remove override ${idx + 1}`} onClick={() => setExpFormOverrides(prev => prev.filter((_, i) => i !== idx))}>×</Btn>
                  </div>
                );
              })}
              {expFormPickerOpen && (
                <ParamBrowserPanel
                  params={sweepParams}
                  alreadyAdded={new Set(expFormOverrides.map(o => o.path).filter(Boolean))}
                  onSelect={path => {
                    const found = sweepParams.find(p => p.path === path);
                    const cv = found?.currentValue;
                    const defaultVal = (cv !== undefined && Number.isFinite(cv)) ? String(cv) : "";
                    setExpFormOverrides(prev => [...prev, { path, value: defaultVal }]);
                  }}
                  onClose={() => setExpFormPickerOpen(false)}
                />
              )}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <Btn small variant="primary" disabled={!expFormName.trim() || expFormSaving} onClick={async () => {
                const config = {
                  replications,
                  seed,
                  warmupPeriod,
                  maxSimTime,
                  terminationMode,
                  terminationCondition: terminationMode === "condition" ? terminationCondition : null,
                  overrides: expFormOverrides.filter(o => o.path && o.value !== "").map(o => ({ path: o.path, value: Number(o.value) })),
                };
                setExpFormSaving(true);
                try {
                  if (expEditId) {
                    const updated = await updateExperiment(expEditId, { name: expFormName.trim(), description: expFormDesc.trim() || null, config });
                    setExperiments(prev => prev.map(e => e.id === expEditId ? updated : e));
                  } else {
                    const created = await saveExperiment({ modelId, userId, name: expFormName.trim(), description: expFormDesc.trim() || null, config });
                    setExperiments(prev => [created, ...prev]);
                  }
                  setExpFormOpen(false);
                  setExpEditId(null);
                } catch (err) {
                  setExperimentsError(err?.message || "Save failed");
                } finally {
                  setExpFormSaving(false);
                }
              }}>
                {expFormSaving ? "Saving…" : "Save"}
              </Btn>
              <Btn small variant="ghost" onClick={() => { setExpFormOpen(false); setExpEditId(null); }}>Cancel</Btn>
            </div>
          </div>
        )}

        {/* Experiment list */}
        <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 8 }}>
          {experimentsStatus === "loading" && (
            <span style={{ fontSize: 12, color: C.muted, fontFamily: FONT }}>Loading…</span>
          )}
          {experimentsStatus === "error" && (
            <span style={{ fontSize: 12, color: C.red, fontFamily: FONT }}>{experimentsError}</span>
          )}
          {experimentsStatus === "loaded" && experiments.length === 0 && !expFormOpen && (
            <span style={{ fontSize: 12, color: C.muted, fontFamily: FONT }}>No saved experiments yet. Click "New Experiment" to create one.</span>
          )}
          {experiments.map(exp => (
            <div key={exp.id} style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 6, padding: "10px 12px", display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
                  <span style={{ fontSize: 13, color: C.text, fontFamily: FONT, fontWeight: 600 }}>{exp.name}</span>
                  {exp.description && <span style={{ fontSize: 11, color: C.muted, fontFamily: FONT }}>{exp.description}</span>}
                  <span style={{ fontSize: 10, color: C.muted, fontFamily: FONT }}>
                    {exp.config.replications} repl · seed {exp.config.seed} · warm-up {exp.config.warmupPeriod} · {exp.config.terminationMode === "time" ? `duration ${exp.config.maxSimTime}` : "condition stop"}
                    {exp.config.overrides?.length > 0 && ` · ${exp.config.overrides.length} override${exp.config.overrides.length > 1 ? "s" : ""}`}
                  </span>
                </div>
                <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                  <Btn small variant="primary" onClick={() => {
                    const cfg = exp.config;
                    setReplications(cfg.replications ?? 1);
                    setSeed(cfg.seed ?? seed);
                    setWarmupPeriod(cfg.warmupPeriod ?? 0);
                    setMaxSimTime(cfg.maxSimTime ?? 500);
                    setTerminationMode(cfg.terminationMode ?? "time");
                    setTerminationCondition(cfg.terminationCondition ?? null);
                    setExecuteSection("run");
                  }}>
                    Load
                  </Btn>
                  <Btn small variant="ghost" onClick={() => {
                    const cfg = exp.config;
                    setReplications(cfg.replications ?? 1);
                    setSeed(cfg.seed ?? seed);
                    setWarmupPeriod(cfg.warmupPeriod ?? 0);
                    setMaxSimTime(cfg.maxSimTime ?? 500);
                    setTerminationMode(cfg.terminationMode ?? "time");
                    setTerminationCondition(cfg.terminationCondition ?? null);
                    setRunLabel(exp.name);
                    setExecuteSection("run");
                  }}>
                    Run
                  </Btn>
                  <Btn small variant="ghost" onClick={() => {
                    setExpEditId(exp.id);
                    setExpFormName(exp.name);
                    setExpFormDesc(exp.description || "");
                    setExpFormOverrides((exp.config.overrides || []).map(o => ({ path: o.path, value: String(o.value) })));
                    if (sweepParams.length === 0) setSweepParams(enumerateSweepableParams(model));
                    setExpFormPickerOpen(false);
                    setExpFormOpen(true);
                  }}>
                    Edit
                  </Btn>
                  <Btn small variant="ghost" onClick={async () => {
                    try {
                      const cloned = await cloneExperiment(exp.id, userId);
                      setExperiments(prev => [cloned, ...prev]);
                    } catch (err) {
                      setExperimentsError(err?.message || "Clone failed");
                    }
                  }}>
                    Clone
                  </Btn>
                  <Btn small variant="ghost" onClick={async () => {
                    if (!confirm(`Delete "${exp.name}"?`)) return;
                    try {
                      await deleteExperiment(exp.id);
                      setExperiments(prev => prev.filter(e => e.id !== exp.id));
                    } catch (err) {
                      setExperimentsError(err?.message || "Delete failed");
                    }
                  }}>
                    Delete
                  </Btn>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
      </div>
      )}

      {executeSection === "experiments" && (
      <div style={{ maxWidth: 1120, margin: "0 auto" }}>
      <div style={{ background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden" }}>
        <div
          onClick={() => {
            if (!sweepOpen) setSweepParams(enumerateSweepableParams(model));
            setSweepOpen(o => !o);
          }}
          style={{ padding: "12px 16px", cursor: "pointer", display: "flex", alignItems: "center", gap: 10, userSelect: "none" }}>
          <span style={{ fontSize: 14, color: sweepOpen ? C.accent : C.muted }}>{sweepOpen ? "▼" : "▶"}</span>
          <span style={{ fontSize: 10, color: C.muted, fontFamily: FONT, letterSpacing: 1.2, fontWeight: 700 }}>STUDIES</span>
          {sweepStatus === "running" && (
            <span style={{ fontSize: 10, color: C.amber, fontFamily: FONT }}>Running experiment...</span>
          )}
          {sweepStatus === "complete" && (
            <span style={{ fontSize: 10, color: C.green, fontFamily: FONT }}>Complete ({sweepResults?.length} points)</span>
          )}
          {sweepStatus === "error" && (
            <span style={{ fontSize: 10, color: C.red, fontFamily: FONT }}>Error</span>
          )}
        </div>
        {sweepOpen && (
          <div style={{ padding: "0 16px 16px", display: "flex", flexDirection: "column", gap: 12, borderTop: `1px solid ${C.border}` }}>
            <div style={{ fontSize: 11, color: C.muted, fontFamily: FONT, lineHeight: 1.5 }}>
              Vary one or two parameters across a range to see how KPIs respond. Each point runs multiple replications for statistical confidence. Results are shown in charts and tables but are not saved to run history.
            </div>
            {/* Mode toggle */}
            <div style={{ display: "flex", gap: 2, background: C.bg, borderRadius: 5, padding: 2, width: "fit-content" }}>
              <button
                onClick={() => { setSweepMode("1d"); setSweepResults(null); setComparisonResult(null); }}
                style={{ background: sweepMode === "1d" ? C.border : "transparent", border: "none", borderRadius: 4, color: sweepMode === "1d" ? C.text : C.muted, cursor: "pointer", fontFamily: FONT, fontSize: 11, padding: "5px 12px" }}>
                1D Sweep
              </button>
              <button
                onClick={() => { setSweepMode("2d"); setSweepResults(null); setComparisonResult(null); }}
                style={{ background: sweepMode === "2d" ? C.border : "transparent", border: "none", borderRadius: 4, color: sweepMode === "2d" ? C.text : C.muted, cursor: "pointer", fontFamily: FONT, fontSize: 11, padding: "5px 12px" }}>
                2D Sweep
              </button>
            </div>

            {/* Parameter picker(s) */}
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={{ fontSize: 10, color: C.label, fontFamily: FONT, letterSpacing: 1.2, fontWeight: 700 }}>{sweepMode === "2d" ? "PARAMETER X" : "PARAMETER"}</span>
              {sweepSelectedParam ? (
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <button
                    onClick={() => setSweepPickerOpen(o => !o)}
                    style={{
                      flex: 1, display: "flex", flexDirection: "column", gap: 1, textAlign: "left",
                      background: alpha(paramColor(sweepSelectedParam.type, C), 0.09),
                      border: `1px solid ${alpha(paramColor(sweepSelectedParam.type, C), 0.27)}`,
                      borderRadius: RADIUS.sm, padding: "4px 8px", cursor: "pointer", outline: "none",
                    }}
                  >
                    <span style={{ fontSize: 11, color: paramColor(sweepSelectedParam.type, C), fontFamily: FONT, fontWeight: 700 }}>{sweepSelectedParam.label}</span>
                    {sweepSelectedParam.subLabel && <span style={{ fontSize: 10, color: C.muted, fontFamily: FONT }}>{sweepSelectedParam.subLabel}</span>}
                  </button>
                  <Btn small variant="ghost" ariaLabel="Clear sweep parameter" onClick={() => { setSweepSelectedParam(null); setSweepPickerOpen(false); }}>×</Btn>
                </div>
              ) : (
                <Btn variant="ghost" onClick={() => setSweepPickerOpen(o => !o)} style={{ justifyContent: "flex-start", fontSize: 12 }}>
                  {sweepPickerOpen ? "Cancel" : "Choose parameter…"}
                </Btn>
              )}
              {sweepPickerOpen && (
                <ParamBrowserPanel
                  params={sweepParams}
                  singleSelect
                  selectedPath={sweepSelectedParam?.path ?? null}
                  onSelect={path => {
                    const found = sweepParams.find(p => p.path === path);
                    setSweepSelectedParam(found || null);
                    if (found) {
                      const cv = typeof found.currentValue === "number" ? found.currentValue : 1;
                      setSweepMin(cv);
                      setSweepMax(cv * 3);
                      setSweepStep(cv > 0 ? cv : 1);
                    }
                  }}
                  onClose={() => setSweepPickerOpen(false)}
                />
              )}
            </div>

            {sweepMode === "2d" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={{ fontSize: 10, color: C.label, fontFamily: FONT, letterSpacing: 1.2, fontWeight: 700 }}>PARAMETER Y</span>
                {sweepSelectedParamB ? (
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <button
                      onClick={() => setSweepPickerBOpen(o => !o)}
                      style={{
                        flex: 1, display: "flex", flexDirection: "column", gap: 1, textAlign: "left",
                        background: alpha(paramColor(sweepSelectedParamB.type, C), 0.09),
                        border: `1px solid ${alpha(paramColor(sweepSelectedParamB.type, C), 0.27)}`,
                        borderRadius: RADIUS.sm, padding: "4px 8px", cursor: "pointer", outline: "none",
                      }}
                    >
                      <span style={{ fontSize: 11, color: paramColor(sweepSelectedParamB.type, C), fontFamily: FONT, fontWeight: 700 }}>{sweepSelectedParamB.label}</span>
                      {sweepSelectedParamB.subLabel && <span style={{ fontSize: 10, color: C.muted, fontFamily: FONT }}>{sweepSelectedParamB.subLabel}</span>}
                    </button>
                    <Btn small variant="ghost" ariaLabel="Clear sweep parameter Y" onClick={() => { setSweepSelectedParamB(null); setSweepPickerBOpen(false); }}>×</Btn>
                  </div>
                ) : (
                  <Btn variant="ghost" onClick={() => setSweepPickerBOpen(o => !o)} style={{ justifyContent: "flex-start", fontSize: 12 }}>
                    {sweepPickerBOpen ? "Cancel" : "Choose parameter…"}
                  </Btn>
                )}
                {sweepPickerBOpen && (
                  <ParamBrowserPanel
                    params={sweepParams}
                    singleSelect
                    selectedPath={sweepSelectedParamB?.path ?? null}
                    onSelect={path => {
                      const found = sweepParams.find(p => p.path === path);
                      setSweepSelectedParamB(found || null);
                      if (found) {
                        const cv = typeof found.currentValue === "number" ? found.currentValue : 1;
                        setSweepMinB(cv);
                        setSweepMaxB(cv * 3);
                        setSweepStepB(cv > 0 ? cv : 1);
                      }
                    }}
                    onClose={() => setSweepPickerBOpen(false)}
                  />
                )}
              </div>
            )}

            {/* Range config */}
            {sweepSelectedParam && (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1, minWidth: 80 }}>
                    <span style={{ fontSize: 10, color: C.label, fontFamily: FONT, letterSpacing: 1.2, fontWeight: 700 }}>MIN {sweepMode === "2d" ? "X" : ""}</span>
                    <input type="number" aria-label="Sweep min" value={sweepMin}
                      onChange={e => setSweepMin(parseFloat(e.target.value) || 0)}
                      style={{ background: "transparent", border: `1px solid ${C.border}`, borderRadius: 4, color: C.amber, fontFamily: FONT, fontSize: 12, padding: "6px 8px", outline: "none", width: "100%" }} />
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1, minWidth: 80 }}>
                    <span style={{ fontSize: 10, color: C.label, fontFamily: FONT, letterSpacing: 1.2, fontWeight: 700 }}>MAX {sweepMode === "2d" ? "X" : ""}</span>
                    <input type="number" aria-label="Sweep max" value={sweepMax}
                      onChange={e => setSweepMax(parseFloat(e.target.value) || 0)}
                      style={{ background: "transparent", border: `1px solid ${C.border}`, borderRadius: 4, color: C.amber, fontFamily: FONT, fontSize: 12, padding: "6px 8px", outline: "none", width: "100%" }} />
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1, minWidth: 80 }}>
                    <span style={{ fontSize: 10, color: C.label, fontFamily: FONT, letterSpacing: 1.2, fontWeight: 700 }}>STEP {sweepMode === "2d" ? "X" : ""}</span>
                    <input type="number" aria-label="Sweep step" value={sweepStep}
                      onChange={e => setSweepStep(parseFloat(e.target.value) || 0)}
                      style={{ background: "transparent", border: `1px solid ${C.border}`, borderRadius: 4, color: C.amber, fontFamily: FONT, fontSize: 12, padding: "6px 8px", outline: "none", width: "100%" }} />
                  </div>
                </div>

                {sweepMode === "2d" && sweepSelectedParamB && (
                  <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1, minWidth: 80 }}>
                      <span style={{ fontSize: 10, color: C.label, fontFamily: FONT, letterSpacing: 1.2, fontWeight: 700 }}>MIN Y</span>
                      <input type="number" aria-label="Sweep min Y" value={sweepMinB}
                        onChange={e => setSweepMinB(parseFloat(e.target.value) || 0)}
                        style={{ background: "transparent", border: `1px solid ${C.border}`, borderRadius: 4, color: C.amber, fontFamily: FONT, fontSize: 12, padding: "6px 8px", outline: "none", width: "100%" }} />
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1, minWidth: 80 }}>
                      <span style={{ fontSize: 10, color: C.label, fontFamily: FONT, letterSpacing: 1.2, fontWeight: 700 }}>MAX Y</span>
                      <input type="number" aria-label="Sweep max Y" value={sweepMaxB}
                        onChange={e => setSweepMaxB(parseFloat(e.target.value) || 0)}
                        style={{ background: "transparent", border: `1px solid ${C.border}`, borderRadius: 4, color: C.amber, fontFamily: FONT, fontSize: 12, padding: "6px 8px", outline: "none", width: "100%" }} />
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1, minWidth: 80 }}>
                      <span style={{ fontSize: 10, color: C.label, fontFamily: FONT, letterSpacing: 1.2, fontWeight: 700 }}>STEP Y</span>
                      <input type="number" aria-label="Sweep step Y" value={sweepStepB}
                        onChange={e => setSweepStepB(parseFloat(e.target.value) || 0)}
                        style={{ background: "transparent", border: `1px solid ${C.border}`, borderRadius: 4, color: C.amber, fontFamily: FONT, fontSize: 12, padding: "6px 8px", outline: "none", width: "100%" }} />
                    </div>
                  </div>
                )}

                {sweepMode === "2d" && sweepSelectedParamB && (
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 11, color: C.muted, fontFamily: FONT }}>
                      {(() => {
                        try {
                          const grid = generate2DSweepValues(
                            { min: sweepMin, max: sweepMax, step: sweepStep },
                            { min: sweepMinB, max: sweepMaxB, step: sweepStepB }
                          );
                          const rows = Math.round(grid.length / (grid.filter(p => p.valueA === grid[0].valueA).length || 1));
                          const cols = grid.filter(p => p.valueA === grid[0].valueA).length;
                          return `${rows} x ${cols} = ${grid.length} points`;
                        } catch (err) {
                          return err.message;
                        }
                      })()}
                    </span>
                  </div>
                )}

                {sweepGridError && (
                  <div style={{ fontSize: 11, color: C.red, fontFamily: FONT, background: C.red + "12", border: `1px solid ${C.red}44`, borderRadius: 4, padding: "6px 10px" }}>
                    {sweepGridError}
                  </div>
                )}

                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <Btn variant="primary" onClick={handleRunSweep}
                    disabled={sweepStatus === "running" || hasAdmissionErrors || (sweepMode === "2d" && (!sweepSelectedParam || !sweepSelectedParamB))}>
                    {sweepStatus === "running" ? "Running..." : "Run Sweep"}
                  </Btn>
                  {sweepStatus === "running" && (
                    <Btn variant="danger" onClick={handleCancelSweep}>Cancel</Btn>
                  )}
                </div>
              </div>
            )}

            {/* Sweep progress */}
            {sweepStatus === "running" && sweepProgress && (
              <div style={{ fontSize: 11, color: C.muted, fontFamily: FONT }}>
                Point {sweepProgress.currentPoint + 1} / {sweepProgress.totalPoints}
                {sweepMode === "2d" && sweepProgress.gridSize && (
                  <span> — Grid: {sweepProgress.gridSize.rows} x {sweepProgress.gridSize.cols}</span>
                )}
                {sweepProgress.pointReplications && (
                  <span> — Replications: {sweepProgress.pointReplications.completed}/{sweepProgress.pointReplications.total}</span>
                )}
              </div>
            )}

            {/* Sweep results */}
            {sweepStatus === "complete" && sweepResults && sweepResults.length > 0 && (
              <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 12, display: "flex", flexDirection: "column", gap: 12 }}>
                {/* KPI metric picker */}
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 10, color: C.label, fontFamily: FONT, letterSpacing: 1.2, fontWeight: 700 }}>KPI</span>
                  <select aria-label="Sweep KPI metric"
                    value={sweepKpiMetric}
                    onChange={e => setSweepKpiMetric(e.target.value)}
                    style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 4, color: C.text, fontFamily: FONT, fontSize: 12, padding: "5px 8px", outline: "none" }}>
                    {CI_METRICS.map(m => (
                      <option key={m} value={m}>{METRIC_LABELS[m]}</option>
                    ))}
                  </select>
                </div>

                {/* 1D results: line chart + table */}
                {sweepMode === "1d" && (
                  <>
                    <SweepChart results={sweepResults} metric={sweepKpiMetric} paramLabel={sweepSelectedParam?.label || ""} goals={model.goals || []} />
                    <div style={{ overflowX: "auto" }}>
                      <table style={{ width: "100%", borderCollapse: "collapse", color: C.text, fontSize: 12, textAlign: "left" }}>
                        <thead>
                          <tr style={{ color: C.muted, borderBottom: `1px solid ${C.border}` }}>
                            <th scope="col" style={{ padding: "6px 8px" }}>{sweepSelectedParam?.label || "Value"}</th>
                            <th scope="col" style={{ padding: "6px 8px" }}>Served</th>
                            <th scope="col" style={{ padding: "6px 8px" }}>Avg wait</th>
                            <th scope="col" style={{ padding: "6px 8px" }}>Avg service</th>
                            <th scope="col" style={{ padding: "6px 8px" }}>Avg sojourn</th>
                            <th scope="col" style={{ padding: "6px 8px" }}>Reneged</th>
                            <th scope="col" style={{ padding: "6px 8px" }}>Reps</th>
                          </tr>
                        </thead>
                        <tbody>
                          {sweepResults.map((pt, i) => {
                            const goals = model.goals || [];
                            const STAT_KEY = { avgWait:"summary.avgWait", avgSvc:"summary.avgSvc", avgSojourn:"summary.avgSojourn", avgTimeInSystem:"summary.avgTimeInSystem", avgWIP:"summary.avgWIP", maxWIP:"summary.maxWIP", served:"summary.served", servedRatio:"summary.servedRatio", reneged:"summary.reneged", totalCost:"summary.totalCost", costPerServed:"summary.costPerServed" };
                            const feasible = goals.length
                              ? goals.filter(g=>g.metric&&g.target&&!g.scope&&!(typeof g.operator==="string"&&g.operator.startsWith("p"))).every(g=>{
                                  const k=STAT_KEY[g.metric]||(g.metric?.startsWith("summary.")?g.metric:null); if(!k) return true;
                                  const v=pt.aggregateStats[k]?.mean; if(v==null||!Number.isFinite(v)) return true;
                                  const t=parseFloat(g.target); const op=g.operator||"<";
                                  return op==="<"?v<t:op==="<="?v<=t:op===">"?v>t:op===">="?v>=t:Math.abs(v-t)<0.001;
                                })
                              : null;
                            return (
                              <tr key={i} style={{ borderBottom: `1px solid ${C.border}`, opacity: feasible===false?0.5:1 }}>
                                <td style={{ padding: "6px 8px", color: C.amber, fontWeight: 700 }}>
                                  {goals.length>0 && (
                                    <span style={{ marginRight: 4, fontSize: 10, color: feasible===true?C.green:feasible===false?C.red:C.muted }}>
                                      {feasible===true?"✓":feasible===false?"✗":"·"}
                                    </span>
                                  )}
                                  {pt.value}
                                </td>
                                <td style={{ padding: "6px 8px" }}>{fmt(pt.aggregateStats["summary.served"]?.mean)}</td>
                                <td style={{ padding: "6px 8px" }}>{fmt(pt.aggregateStats["summary.avgWait"]?.mean)}</td>
                                <td style={{ padding: "6px 8px" }}>{fmt(pt.aggregateStats["summary.avgSvc"]?.mean)}</td>
                                <td style={{ padding: "6px 8px" }}>{fmt(pt.aggregateStats["summary.avgSojourn"]?.mean)}</td>
                                <td style={{ padding: "6px 8px" }}>{fmt(pt.aggregateStats["summary.reneged"]?.mean)}</td>
                                <td style={{ padding: "6px 8px" }}>{pt.replications?.length || 0}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}

                {/* 2D results: grid table with color */}
                {sweepMode === "2d" && (
                  <>
                    <Sweep2DGrid
                      results={sweepResults}
                      metric={sweepKpiMetric}
                      paramLabelA={sweepSelectedParam?.label || "X"}
                      paramLabelB={sweepSelectedParamB?.label || "Y"}
                      onCellClick={cell => setSelectedCell(cell)}
                      goals={model.goals || []}
                    />
                    {selectedCell && (
                      <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 6, padding: 12 }}>
                        <div style={{ fontSize: 10, color: C.accent, fontFamily: FONT, letterSpacing: 1.2, fontWeight: 700, marginBottom: 8 }}>
                          CELL STATS — {sweepSelectedParam?.label || "X"}={fmt(selectedCell.valueA)}, {sweepSelectedParamB?.label || "Y"}={fmt(selectedCell.valueB)}
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 6 }}>
                          {CI_METRICS.map(m => {
                            const s = selectedCell.aggregateStats[m];
                            return (
                              <div key={m} style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 4, padding: "4px 6px", textAlign: "center" }}>
                                <div style={{ fontSize: 8, color: C.muted, fontFamily: FONT, marginBottom: 2 }}>{METRIC_LABELS[m] || m}</div>
                                <div style={{ fontSize: 11, fontWeight: 700, color: C.accent, fontFamily: FONT }}>{s?.mean != null ? fmt(s.mean) : "—"}</div>
                                <div style={{ fontSize: 9, color: C.muted, fontFamily: FONT }}>n={s?.n || 0}</div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </>
                )}

                {/* Scenario comparison — 2D cell selector */}
                {sweepMode === "2d" && sweepResults && sweepResults.length > 0 && (
                  <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 12, display: "flex", flexDirection: "column", gap: 10 }}>
                    <span style={{ fontSize: 10, color: C.muted, fontFamily: FONT, letterSpacing: 1.2, fontWeight: 700 }}>SCENARIO COMPARISON</span>
                    <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
                      <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1, minWidth: 120 }}>
                        <span style={{ fontSize: 10, color: C.label, fontFamily: FONT }}>Cell A</span>
                        <select aria-label="Cell A" value={comparisonIdxA}
                          onChange={e => { setComparisonIdxA(parseInt(e.target.value)); setComparisonResult(null); }}
                          style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 4, color: C.text, fontFamily: FONT, fontSize: 12, padding: "5px 8px", outline: "none" }}>
                          {sweepResults.map((pt, i) => (
                            <option key={i} value={i}>
                              {sweepSelectedParam?.label || "X"}={fmt(pt.valueA)}, {sweepSelectedParamB?.label || "Y"}={fmt(pt.valueB)}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1, minWidth: 120 }}>
                        <span style={{ fontSize: 10, color: C.label, fontFamily: FONT }}>Cell B</span>
                        <select aria-label="Cell B" value={comparisonIdxB ?? ""}
                          onChange={e => { setComparisonIdxB(parseInt(e.target.value) || null); setComparisonResult(null); }}
                          style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 4, color: C.text, fontFamily: FONT, fontSize: 12, padding: "5px 8px", outline: "none" }}>
                          <option value="">Select...</option>
                          {sweepResults.map((pt, i) => (
                            i !== comparisonIdxA ? (
                              <option key={i} value={i}>
                                {sweepSelectedParam?.label || "X"}={fmt(pt.valueA)}, {sweepSelectedParamB?.label || "Y"}={fmt(pt.valueB)}
                              </option>
                            ) : null
                          ))}
                        </select>
                      </div>
                      <Btn variant="primary" onClick={() => {
                        if (comparisonIdxB == null) return;
                        const repsA = sweepResults[comparisonIdxA]?.replications || [];
                        const repsB = sweepResults[comparisonIdxB]?.replications || [];
                        const ptA = sweepResults[comparisonIdxA];
                        const ptB = sweepResults[comparisonIdxB];
                        const result = compareScenarios(repsA, repsB, CI_METRICS, {
                          labelA: `${sweepSelectedParam?.label || "X"}=${fmt(ptA.valueA)}, ${sweepSelectedParamB?.label || "Y"}=${fmt(ptA.valueB)}`,
                          labelB: `${sweepSelectedParam?.label || "X"}=${fmt(ptB.valueA)}, ${sweepSelectedParamB?.label || "Y"}=${fmt(ptB.valueB)}`,
                        });
                        const meansA = {}; const meansB = {};
                        for (const m of CI_METRICS) {
                          const valsA = repsA.map(r => { const parts = m.split("."); let v = r?.result || r; for (const p of parts) v = v?.[p]; return v; }).filter(Number.isFinite);
                          const valsB = repsB.map(r => { const parts = m.split("."); let v = r?.result || r; for (const p of parts) v = v?.[p]; return v; }).filter(Number.isFinite);
                          meansA[m] = valsA.length > 0 ? valsA.reduce((s, v) => s + v, 0) / valsA.length : null;
                          meansB[m] = valsB.length > 0 ? valsB.reduce((s, v) => s + v, 0) / valsB.length : null;
                        }
                        setComparisonResult({ ...result, meansA, meansB });
                      }} disabled={comparisonIdxB == null}>
                        Compare
                      </Btn>
                    </div>

                    {comparisonResult && <ScenarioComparisonTable comparison={comparisonResult} />}
                  </div>
                )}

                {/* Scenario comparison — 1D flat index */}
                {sweepMode === "1d" && (
                  <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 12, display: "flex", flexDirection: "column", gap: 10 }}>
                    <span style={{ fontSize: 10, color: C.muted, fontFamily: FONT, letterSpacing: 1.2, fontWeight: 700 }}>SCENARIO COMPARISON</span>
                    <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
                      <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1, minWidth: 120 }}>
                        <span style={{ fontSize: 10, color: C.label, fontFamily: FONT }}>Scenario A</span>
                        <select aria-label="Scenario A" value={comparisonIdxA}
                          onChange={e => { setComparisonIdxA(parseInt(e.target.value)); setComparisonResult(null); }}
                          style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 4, color: C.text, fontFamily: FONT, fontSize: 12, padding: "5px 8px", outline: "none" }}>
                          {sweepResults.map((pt, i) => (
                            <option key={i} value={i}>{sweepSelectedParam?.label || "Value"} = {pt.value}</option>
                          ))}
                        </select>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1, minWidth: 120 }}>
                        <span style={{ fontSize: 10, color: C.label, fontFamily: FONT }}>Scenario B</span>
                        <select aria-label="Scenario B" value={comparisonIdxB ?? ""}
                          onChange={e => { setComparisonIdxB(parseInt(e.target.value) || null); setComparisonResult(null); }}
                          style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 4, color: C.text, fontFamily: FONT, fontSize: 12, padding: "5px 8px", outline: "none" }}>
                          <option value="">Select...</option>
                          {sweepResults.map((pt, i) => (
                            i !== comparisonIdxA ? <option key={i} value={i}>{sweepSelectedParam?.label || "Value"} = {pt.value}</option> : null
                          ))}
                        </select>
                      </div>
                      <Btn variant="primary" onClick={() => {
                        if (comparisonIdxB == null) return;
                        const repsA = sweepResults[comparisonIdxA]?.replications || [];
                        const repsB = sweepResults[comparisonIdxB]?.replications || [];
                        const result = compareScenarios(repsA, repsB, CI_METRICS, {
                          labelA: `${sweepSelectedParam?.label || "Value"} = ${sweepResults[comparisonIdxA].value}`,
                          labelB: `${sweepSelectedParam?.label || "Value"} = ${sweepResults[comparisonIdxB].value}`,
                        });
                        const meansA = {}; const meansB = {};
                        for (const m of CI_METRICS) {
                          const valsA = repsA.map(r => { const parts = m.split("."); let v = r?.result || r; for (const p of parts) v = v?.[p]; return v; }).filter(Number.isFinite);
                          const valsB = repsB.map(r => { const parts = m.split("."); let v = r?.result || r; for (const p of parts) v = v?.[p]; return v; }).filter(Number.isFinite);
                          meansA[m] = valsA.length > 0 ? valsA.reduce((s, v) => s + v, 0) / valsA.length : null;
                          meansB[m] = valsB.length > 0 ? valsB.reduce((s, v) => s + v, 0) / valsB.length : null;
                        }
                        setComparisonResult({ ...result, meansA, meansB });
                      }} disabled={comparisonIdxB == null}>
                        Compare
                      </Btn>
                    </div>

                    {comparisonResult && <ScenarioComparisonTable comparison={comparisonResult} />}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
      </div>
      )}

      {/* ADR-016: Schedule selector — shown when model has more than one schedule */}
      {modelSchedules.length > 1 && (
        <div style={{ background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 14px", display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 11, color: C.muted, fontFamily: FONT, whiteSpace: "nowrap" }}>Timetable:</span>
          <select
            value={selectedScheduleId ?? ""}
            onChange={e => setSelectedScheduleId(e.target.value || null)}
            style={{ padding: "4px 8px", border: `1px solid ${C.border}`, borderRadius: 4, fontSize: 12, background: C.surface, color: C.text, cursor: "pointer" }}
          >
            {modelSchedules.map(s => (
              <option key={s.id} value={s.id}>
                {s.isDefault ? "★ " : ""}{s.name} ({scheduleRowCount(s).toLocaleString()} rows)
              </option>
            ))}
          </select>
          {schedulesLoading && <span style={{ fontSize: 11, color: C.muted, fontFamily: FONT }}>Loading…</span>}
        </div>
      )}


      {executeSection === "run" && (
      <div style={{ background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 8, padding: 14, display: "flex", gap: 10, rowGap: 10, alignItems: "center", flexWrap: "wrap" }}>
        {/* Validation status indicator — informational only, positioned first */}
        {hasAdmissionErrors ? (
          <Btn variant="danger" disabled={true} title={`${runAdmission.hardErrors.length} blocker(s) must be resolved before running`}>
             {runAdmission.hardErrors.length} blocker{runAdmission.hardErrors.length !== 1 ? "s" : ""}
          </Btn>
        ) : hasAdmissionWarnings ? (
          <Btn variant="ghost" disabled={true} title={`${runAdmission.warnings.length} warning(s) — model can run but worth checking`}>
             {runAdmission.warnings.length} warning{runAdmission.warnings.length !== 1 ? "s" : ""}
          </Btn>
        ) : (
          <Btn variant="success" disabled={true} title="Model is valid — ready to run">
            ✓ Ready
          </Btn>
        )}
        <Btn variant="ghost" onClick={() => {
          const issues = checkModel(model);
          setModelCheckerIssues(issues);
          setModelCheckerOpen(true);
        }}
        title="Run structural checks on this model">
          Check Model
        </Btn>
        <Btn variant="primary" onClick={initEngine} disabled={hasValidationErrors || runBusy} title="Reset simulation to initial state">⟳ Reset</Btn>
        <Btn variant="success" onClick={doStep} disabled={mode === "done" || hasValidationErrors || runBusy}> Step</Btn>
        <Btn variant={autoRunning ? "danger" : "amber"} onClick={toggleAuto} disabled={hasValidationErrors || runBusy}>{autoRunning ? "Stop Auto" : "Auto Run"}</Btn>
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <span style={{ fontSize: 10, color: C.muted, fontFamily: FONT, whiteSpace: "nowrap" }}>
            {speedMultiplier.toFixed(1)}×
          </span>
          <input
            aria-label="Animation speed multiplier"
            type="range"
            min={0.5} max={10} step={0.5}
            value={speedMultiplier}
            onChange={e => setSpeedMultiplier(parseFloat(e.target.value))}
            style={{ width: 72, accentColor: C.accent, cursor: "pointer" }}
          />
        </div>
        <Btn variant="ghost" onClick={doRunAll} disabled={hasAdmissionErrors || runBusy || saveStatus?.state === 'saving' || saveInProgressRef.current}>
          {hasAdmissionErrors ? `✕ ${runAdmission.hardErrors.length} blocker${runAdmission.hardErrors.length !== 1 ? "s" : ""}` : "⚡ Batch Run"}
        </Btn>
        {canOpenResultsView && (
          <Btn variant="ghost" onClick={() => onGoToResults?.()} title="View results in the Results section">
            View Results →
          </Btn>
        )}
        <Btn variant={modelAssistantOpen ? "primary" : "ghost"} onClick={() => onOpenModelAssistant?.()}>Model Assistant</Btn>
        <div style={{ position: "relative", display: "flex", gap: 6 }}>
          {/* Export Data popover */}
          {showExportPopover && (
            <div
              style={{ position: "fixed", inset: 0, zIndex: 99 }}
              onClick={() => setShowExportPopover(false)}
            />
          )}
          <Btn variant="ghost" onClick={() => setShowExportPopover(v => !v)} disabled={!canExportResults}>Export Data</Btn>
          {showExportPopover && (
            <div style={{
              position: "absolute",
              top: "calc(100% + 4px)",
              left: 0,
              zIndex: 100,
              background: C.cardBg,
              border: `1px solid ${C.border}`,
              borderRadius: 6,
              padding: 12,
              display: "flex",
              flexDirection: "column",
              gap: 8,
              minWidth: 160,
              boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
            }}>
              <span style={{ fontSize: 10, color: C.muted, fontFamily: FONT, letterSpacing: 1.2, fontWeight: 700 }}>FORMAT</span>
              {[["json", "JSON Results"], ["csv", "CSV Results"]].map(([key, label]) => (
                <label key={key} style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 12, color: C.text, fontFamily: FONT }}>
                  <input
                    type="checkbox"
                    checked={!!exportFormats[key]}
                    onChange={e => setExportFormats(f => ({ ...f, [key]: e.target.checked }))}
                    style={{ accentColor: C.accent }}
                  />
                  {label}
                </label>
              ))}
              {exportFormats.json && (
                <>
                  <div style={{ height: 1, background: C.border, margin: "2px 0" }} />
                  <span style={{ fontSize: 10, color: C.muted, fontFamily: FONT, letterSpacing: 1.2, fontWeight: 700 }}>JSON CONTENT</span>
                  <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 12, color: C.text, fontFamily: FONT }}>
                    <input
                      type="checkbox"
                      checked={exportMetricsOnly}
                      onChange={e => setExportMetricsOnly(e.target.checked)}
                      style={{ accentColor: C.accent }}
                    />
                    Metrics only
                  </label>
                  {exportMetricsOnly && (
                    <div style={{ fontSize: 10, color: C.muted, fontFamily: FONT, lineHeight: 1.4, paddingLeft: 18 }}>
                      KPIs only — excludes time series, wait distributions, and entity details.
                    </div>
                  )}
                </>
              )}
              <Btn variant="primary" small onClick={() => {
                if (exportFormats.json) exportResultsJson(exportMetricsOnly);
                if (exportFormats.csv) exportResultsCsv();
                setShowExportPopover(false);
              }} disabled={!Object.values({ json: exportFormats.json, csv: exportFormats.csv }).some(Boolean)}>
                Download
              </Btn>
              <div style={{ height: 1, background: C.border, margin: "2px 0" }} />
              <Btn variant="ghost" small onClick={() => { exportLLMBundle(); setShowExportPopover(false); }}>
                Export for AI tools (.md)
              </Btn>
              <div style={{ fontSize: 10, color: C.muted, fontFamily: FONT, lineHeight: 1.4 }}>
                Model + results as Markdown — paste into any AI tool.
              </div>
            </div>
          )}

          {/* Create Report button */}
          <Btn variant="ghost" onClick={() => setShowCreateReportModal(true)} disabled={!canExportResults || reportGenerating}>
            {reportGenerating ? "Generating…" : "Create Report"}
          </Btn>

          {/* Create Report modal */}
          {showCreateReportModal && (
            <>
              <div
                style={{ position: "fixed", inset: 0, background: C.overlay, zIndex: 200 }}
                onClick={() => setShowCreateReportModal(false)}
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
                  <Btn small variant="ghost" onClick={() => setShowCreateReportModal(false)} ariaLabel="Close">×</Btn>
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
                  <Btn variant="ghost" onClick={() => setShowCreateReportModal(false)}>Cancel</Btn>
                  <Btn variant="primary" onClick={() => handleExportReport(reportType, reportFormat)} disabled={reportGenerating}>
                    Generate Report
                  </Btn>
                </div>
              </div>
            </>
          )}
        </div>
        {batchActive && <Btn variant="danger" onClick={cancelBatch} disabled={batchStatus === "cancelling"}>Cancel Batch</Btn>}
        {singleRunActive && <Btn variant="danger" onClick={cancelSingleRun} disabled={singleRunStatus === "cancelling"}>Cancel Run</Btn>}
      </div>
      )}

      {executeSection === "run" && (
        <>
      {!hideRunReadiness && (
        <div
          role={hasAdmissionErrors ? "alert" : "status"}
          style={{
            background: C.panel,
            border: `1px solid ${readinessBorder}`,
            borderRadius: 8,
            padding: 12,
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <span
                style={{
                  background: readinessTagBg,
                  border: `1px solid ${readinessBorder}`,
                  borderRadius: 999,
                  color: readinessTagColor,
                  fontFamily: FONT,
                  fontSize: 11,
                  fontWeight: 700,
                  padding: "5px 10px",
                }}
              >
                {readinessTitle}
              </span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 10, color: C.muted, fontFamily: FONT, letterSpacing: 1.2, fontWeight: 700, marginBottom: 2 }}>
                  RUN READINESS
                </div>
                <div style={{ fontSize: 12, color: C.text, fontFamily: FONT }}>
                  {readinessSummary}
                </div>
              </div>
            </div>
            {runLabel.trim() && <Tag label={runLabel.trim()} color={C.accent} />}
          </div>
          {readinessIssues.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {readinessIssues.slice(0, 4).map((issue, index) => (
                <div
                  key={`${issue.code}-${index}`}
                  style={{
                    background: hasAdmissionErrors ? C.errorBg : C.warmup,
                    border: `1px solid ${hasAdmissionErrors ? C.danger : C.amber}55`,
                    borderRadius: 6,
                    color: hasAdmissionErrors ? C.error : C.warnBg,
                    fontFamily: FONT,
                    fontSize: 11,
                    padding: "8px 10px",
                  }}
                >
                  [{issue.code}] {issue.message}
                </div>
              ))}
              {readinessIssues.length > 4 && (
                <div style={{ fontSize: 11, color: C.muted, fontFamily: FONT }}>
                  {readinessIssues.length - 4} more item{readinessIssues.length - 4 === 1 ? "" : "s"} in Model Health.
                </div>
              )}
            </div>
          )}
          {runAdmission.warnings.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {runAdmission.warnings.slice(0, 3).map((issue, index) => (
                <div
                  key={`warn-${issue.code}-${index}`}
                  style={{
                    background: `${C.amber}12`,
                    border: `1px solid ${C.amber}44`,
                    borderRadius: 6,
                    color: C.text,
                    fontFamily: FONT,
                    fontSize: 11,
                    padding: "8px 10px",
                  }}
                >
                  [{issue.code}] {issue.message}
                </div>
              ))}
            </div>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <span
                style={{
                  background: `${complexityColor}18`,
                  border: `1px solid ${complexityColor}55`,
                  borderRadius: 999,
                  color: complexityColor,
                  fontFamily: FONT,
                  fontSize: 11,
                  fontWeight: 700,
                  padding: "5px 10px",
                }}
              >
                {complexityLabel}
              </span>
              <div>
                <div style={{ fontSize: 10, color: C.muted, fontFamily: FONT, letterSpacing: 1.2, fontWeight: 700, marginBottom: 2 }}>
                  RUN SIZE ESTIMATE
                </div>
                <div style={{ fontSize: 12, color: C.text, fontFamily: FONT }}>
                  Conservative preview of likely workload before execution.
                </div>
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {[
                { label: "Planned arrivals", value: formatEstimate(complexityEstimate.plannedArrivals) },
                { label: "Planned schedule rows", value: formatEstimate(complexityEstimate.plannedScheduleRows) },
                { label: "Expected entities", value: formatEstimate(complexityEstimate.expectedEntities) },
                { label: "Stage moves", value: formatEstimate(complexityEstimate.estimatedStageTransitions) },
                { label: "C-event scans", value: formatEstimate(complexityEstimate.estimatedCEventScans) },
                { label: "Replications", value: formatEstimate(complexityEstimate.replications) },
                { label: "Est. save", value: estSaveLabel },
              ].map(item => (
                <div
                  key={item.label}
                  style={{
                    background: C.bg,
                    border: `1px solid ${C.border}`,
                    borderRadius: 6,
                    minWidth: 112,
                    padding: "8px 10px",
                  }}
                >
                  <div style={{ fontSize: 10, color: C.muted, fontFamily: FONT, marginBottom: 3 }}>{item.label}</div>
                  <div style={{ fontSize: 12, color: C.text, fontFamily: FONT, fontWeight: 700 }}>{item.value}</div>
                </div>
              ))}
            </div>
            <div style={{ fontSize: 11, color: C.muted, fontFamily: FONT, lineHeight: 1.5 }}>
              Confidence: {complexityEstimate.confidence}. This estimate uses arrival and service means, so real runs may be smaller or larger.
            </div>
            {complexityEstimate.unknowns.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {complexityEstimate.unknowns.slice(0, 2).map((item, index) => (
                  <div
                    key={`${index}-${item}`}
                    style={{
                      background: C.bg,
                      border: `1px solid ${C.border}`,
                      borderRadius: 6,
                      color: C.muted,
                      fontFamily: FONT,
                      fontSize: 11,
                      padding: "8px 10px",
                    }}
                  >
                    {item}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Model Checker panel */}
      {modelCheckerOpen && modelCheckerIssues !== null && (
        <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 8, padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: 10, color: C.muted, fontFamily: FONT, letterSpacing: 1.2, fontWeight: 700 }}>MODEL CHECK</span>
            <button
              onClick={() => setModelCheckerOpen(false)}
              style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontFamily: FONT, fontSize: 13 }}
              aria-label="Close model checker"
            >✕</button>
          </div>
          {modelCheckerIssues.length === 0 ? (
            <div style={{ fontSize: 12, color: C.green, fontFamily: FONT }}>No structural issues found.</div>
          ) : (
            modelCheckerIssues.map((issue, i) => {
              const color = issue.severity === "error" ? C.red : issue.severity === "warning" ? C.amber : C.accent;
              const icon = issue.severity === "error" ? "🔴" : issue.severity === "warning" ? "🟡" : "🔵";
              return (
                <div
                  key={i}
                  style={{ background: C.bg, border: `1px solid ${color}44`, borderRadius: 6, padding: "8px 10px", display: "flex", gap: 8, alignItems: "flex-start" }}
                >
                  <span style={{ fontSize: 12, flexShrink: 0, marginTop: 1 }}>{icon}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 11, color, fontFamily: FONT, fontWeight: 700, marginBottom: 2 }}>{issue.code}</div>
                    <div style={{ fontSize: 12, color: C.text, fontFamily: FONT, lineHeight: 1.5 }}>{issue.message}</div>
                    {issue.nodeName && (
                      <div style={{ fontSize: 10, color: C.muted, fontFamily: FONT, marginTop: 2 }}>Node: {issue.nodeName}</div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {phaseCTruncated && (
        <div style={{ background: C.amber + '18', border: `1px solid ${C.amber}44`, borderRadius: 6, padding: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: C.amber, fontFamily: FONT }}>
            This run hit the {model.maxCPasses || 500}-pass limit for conditional-event scans.
          </div>
          <div style={{ fontSize: 11, color: C.amber, fontFamily: FONT, marginTop: 4, opacity: 0.8 }}>
            Some conditional-event logic may be cycling or staying true longer than intended.
          </div>
        </div>
      )}

      {saveStatus && (
        <div style={{
          background: saveStatus.state === 'error' ? C.errorBg : saveStatus.state === 'success' ? C.green + '18' : C.surface,
          border: `1px solid ${saveStatus.state === 'error' ? C.danger : saveStatus.state === 'success' ? C.green + '44' : C.border}`,
          borderRadius: 6, padding: 12, color: saveStatus.state === 'error' ? C.error : saveStatus.state === 'success' ? C.green : C.text,
          fontSize: 12, fontFamily: FONT,
        }}>
          {saveStatus.message}
        </div>
      )}

      {isModelModified && (
        <div style={{
          background: C.warmup,
          border: `1px solid ${C.amber}44`,
          borderRadius: 6,
          color: C.amber,
          fontFamily: FONT,
          fontSize: 12,
          padding: "10px 12px",
        }}>
          ⚠ Model has been modified since this run. Results shown are from the saved run record, not the current model. Run again for updated results.
        </div>
      )}

      {singleRunStatus !== "idle" && (
        <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 8, padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <div style={{ fontSize: 10, color: C.muted, fontFamily: FONT, letterSpacing: 1.2, fontWeight: 700 }}>SINGLE RUN</div>
            <Tag label={singleRunStatus} color={singleRunStatus === "complete" ? C.green : singleRunStatus === "cancelled" ? C.red : C.amber} />
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {[
              { label: "Sim time",       value: singleRunProgress?.clock != null ? fmt(singleRunProgress.clock) : "—" },
              { label: "Cycle",          value: `${singleRunProgress?.completed || 0}${singleRunProgress?.total ? `/${singleRunProgress.total}` : ""}` },
              { label: "Future Events",  value: String(singleRunProgress?.felSize || 0) },
              { label: "Events",         value: String(singleRunProgress?.eventsProcessed || 0) },
            ].map(item => (
              <div key={item.label} style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 6, minWidth: 96, padding: "8px 10px" }}>
                <div style={{ fontSize: 10, color: C.muted, fontFamily: FONT, marginBottom: 3 }}>{item.label}</div>
                <div style={{ fontSize: 13, color: C.text, fontFamily: FONT, fontWeight: 700 }}>{item.value}</div>
              </div>
            ))}
          </div>
          {(singleRunStatus === "cancelling" || singleRunStatus === "cancelled") && (
            <div style={{ fontSize: 12, color: C.text, fontFamily: FONT }}>
              Cancellation waits for the next safe engine checkpoint, then shows partial results without saving them.
            </div>
          )}
        </div>
      )}

      {(batchStatus !== "idle" || replicationResults.length > 0) && (
        <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 8, padding: 14, display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
            <div style={{ fontSize: 10, color: C.muted, fontFamily: FONT, letterSpacing: 1.2, fontWeight: 700 }}>REPLICATION BATCH</div>
            <Tag label={batchStatus} color={batchStatus === "complete" ? C.green : batchStatus === "error" || batchStatus === "cancelled" ? C.red : C.amber} />
            <div style={{ fontSize: 12, color: C.text, fontFamily: FONT }}>
              {batchStatus === "complete"
                ? `${replicationResults.length} replications complete`
                : `Running ${batchProgress?.completed || replicationResults.length}/${batchProgress?.total || replications}`}
            </div>
            {batchStatus !== "complete" && (
              <div style={{ fontSize: 12, color: C.muted, fontFamily: FONT }}>
                Pool: {batchProgress?.workerCount || "—"} · Running: {batchProgress?.running || 0} · Pending: {batchProgress?.pending || 0}
              </div>
            )}
          </div>

          {batchStatus === "complete" && Object.values(aggregateStats).some(stat => stat.n >= 2) && (
            <div style={{
              background: `${C.green}0d`,
              border: `1px solid ${C.green}44`,
              borderRadius: 6,
              padding: 14,
              display: "flex",
              flexDirection: "column",
              gap: 12,
            }}>
              <div style={{ fontSize: 10, color: C.green, fontFamily: FONT, letterSpacing: 1.5, fontWeight: 700 }}>
                AGGREGATE RESULTS — {replicationResults.length} REPLICATIONS
              </div>
              <div style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
                gap: 10,
              }}>
                {(() => {
                  const goals = model.goals || [];
                  const GOAL_KEY = {
                    avgWait: "summary.avgWait", avgSvc: "summary.avgSvc", avgSojourn: "summary.avgSojourn",
                    avgTimeInSystem: "summary.avgTimeInSystem",
                    avgWIP: "summary.avgWIP", maxWIP: "summary.maxWIP",
                    served: "summary.served", servedRatio: "summary.servedRatio", reneged: "summary.reneged",
                    total: "summary.total", totalCost: "summary.totalCost", costPerServed: "summary.costPerServed",
                  };
                  const MATCH_KEYS = {
                    "summary.avgWait": "summary.avgWait", "summary.avgSvc": "summary.avgSvc",
                    "summary.avgSojourn": "summary.avgSojourn", "summary.avgTimeInSystem": "summary.avgTimeInSystem",
                    "summary.avgWIP": "summary.avgWIP",
                    "summary.maxWIP": "summary.maxWIP", "summary.served": "summary.served",
                    "summary.servedRatio": "summary.servedRatio", "summary.reneged": "summary.reneged",
                    "summary.total": "summary.total",
                    "summary.totalCost": "summary.totalCost",
                    "summary.costPerServed": "summary.costPerServed",
                  };
                  return CI_METRICS.map(metric => {
                    const stat = aggregateStats[metric];
                    if (!stat || stat.n < 2) return null;
                    const matchingGoals = goals.filter(g => {
                      if (!g.metric || !g.target || g.scope) return false;
                      const mapped = GOAL_KEY[g.metric] || MATCH_KEYS[g.metric];
                      return mapped === metric && !(typeof g.operator === "string" && g.operator.startsWith("p"));
                    });
                    let goalMet = null;
                    if (matchingGoals.length > 0) {
                      goalMet = matchingGoals.every(g => {
                        const t = parseFloat(g.target);
                        if (!Number.isFinite(t)) return true;
                        return g.operator === ">=" ? stat.mean >= t : g.operator === ">" ? stat.mean > t : g.operator === "<=" ? stat.mean <= t : stat.mean < t;
                      });
                    }
                    return (
                      <div key={metric} style={{
                        background: C.surface,
                        border: `1px solid ${goalMet === true ? C.green : goalMet === false ? C.red : C.border}`,
                        borderRadius: 5,
                        padding: "10px 12px",
                      }}>
                        <div style={{ fontSize: 10, color: C.muted, fontFamily: FONT, marginBottom: 4 }}>
                          {METRIC_LABELS[metric]}
                          {goalMet === true && <span style={{ marginLeft: 5, color: C.green }}>✓</span>}
                          {goalMet === false && <span style={{ marginLeft: 5, color: C.red }}>✗</span>}
                        </div>
                        <div style={{ fontSize: 18, fontWeight: 700, color: C.accent, fontFamily: FONT }}>
                          {fmtMetric(metric, stat.mean)}
                        </div>
                        <div style={{ fontSize: 10, color: C.muted, fontFamily: FONT, marginTop: 2 }}>
                          ±{fmt(stat.halfWidth, 1)} (95% CI)
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>
            </div>
          )}

          {replicationResults.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <button
                onClick={() => setReplicationDetailOpen(v => !v)}
                style={{
                  background: "none", border: "none", cursor: "pointer",
                  color: C.muted, fontFamily: FONT, fontSize: 12,
                  display: "flex", alignItems: "center", gap: 6, padding: 0,
                }}
              >
                <span style={{
                  display: "inline-block", transition: "transform 160ms ease",
                  transform: replicationDetailOpen ? "rotate(90deg)" : "rotate(0deg)",
                  fontSize: 10,
                }}>▶</span>
                Replication detail ({replicationResults.length})
              </button>
              {replicationDetailOpen && (() => {
                const repCount = replicationResults.length;
                const waitVals = replicationResults.map(p => p.result?.summary?.avgWait).filter(Number.isFinite);
                const svcVals = replicationResults.map(p => p.result?.summary?.avgSvc).filter(Number.isFinite);
                const servedVals = replicationResults.map(p => p.result?.summary?.served).filter(Number.isFinite);
                const outlierWait = detectOutliers(waitVals);
                const outlierSvc = detectOutliers(svcVals);
                const outlierServed = detectOutliers(servedVals);
                const minMaxRow = repCount >= 2 ? {
                  minWait: waitVals.length ? Math.min(...waitVals) : null,
                  maxWait: waitVals.length ? Math.max(...waitVals) : null,
                  minSvc: svcVals.length ? Math.min(...svcVals) : null,
                  maxSvc: svcVals.length ? Math.max(...svcVals) : null,
                  minServed: servedVals.length ? Math.min(...servedVals) : null,
                  maxServed: servedVals.length ? Math.max(...servedVals) : null,
                } : null;
                let waitFiniteIdx = 0, svcFiniteIdx = 0, servedFiniteIdx = 0;
                return (
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", color: C.text, fontSize: 12, textAlign: "left", tableLayout: "fixed" }}>
                      <thead>
                        <tr style={{ color: C.muted, borderBottom: `1px solid ${C.border}` }}>
                          <th scope="col" style={{ padding: 8 }}>Rep #</th>
                          <th scope="col" style={{ padding: 8 }}>Seed</th>
                          <th scope="col" style={{ padding: 8 }}>Served</th>
                          <th scope="col" style={{ padding: 8 }}>Reneged</th>
                          <th scope="col" style={{ padding: 8 }}>Avg wait</th>
                          <th scope="col" style={{ padding: 8 }}>Avg service</th>
                          <th scope="col" style={{ padding: 8 }}>Avg sojourn</th>
                          <th scope="col" style={{ padding: 8 }}>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {replicationResults.map(payload => {
                          const summary = payload.result?.summary;
                          const rowWait = summary?.avgWait;
                          const rowSvc = summary?.avgSvc;
                          const rowServed = summary?.served;
                          const wi = Number.isFinite(rowWait) ? waitFiniteIdx++ : -1;
                          const si = Number.isFinite(rowSvc) ? svcFiniteIdx++ : -1;
                          const sei = Number.isFinite(rowServed) ? servedFiniteIdx++ : -1;
                          const isWaitOutlier = wi >= 0 && outlierWait.outlierIndices.includes(wi);
                          const isSvcOutlier = si >= 0 && outlierSvc.outlierIndices.includes(si);
                          const isServedOutlier = sei >= 0 && outlierServed.outlierIndices.includes(sei);
                          const isOutlier = isWaitOutlier || isSvcOutlier || isServedOutlier;
                          const outlierMsg = [
                            isWaitOutlier && `Avg wait outside fence [${fmt(outlierWait.lowerFence, 1)}, ${fmt(outlierWait.upperFence, 1)}]`,
                            isSvcOutlier && `Avg service outside fence [${fmt(outlierSvc.lowerFence, 1)}, ${fmt(outlierSvc.upperFence, 1)}]`,
                            isServedOutlier && `Served outside fence [${fmt(outlierServed.lowerFence)}, ${fmt(outlierServed.upperFence)}]`,
                          ].filter(Boolean).join("; ");
                          return (
                            <tr key={payload.replicationIndex} style={{ borderBottom: `1px solid ${C.border}` }}>
                              <td style={{ padding: 8 }}>{payload.replicationIndex + 1}</td>
                              <td style={{ padding: 8, color: C.amber }}>{payload.seed}</td>
                              <td style={{ padding: 8 }}>{summary?.served ?? "—"}</td>
                              <td style={{ padding: 8 }}>{summary?.reneged ?? "—"}</td>
                              <td style={{ padding: 8 }}>{fmt(rowWait, 1)}</td>
                              <td style={{ padding: 8 }}>{fmt(rowSvc, 1)}</td>
                              <td style={{ padding: 8 }}>{fmt(summary?.avgSojourn, 1)}</td>
                              <td style={{ padding: 8 }}>
                                <Tag label="complete" color={C.green} />
                                {isOutlier && (
                                  <span title={outlierMsg} style={{ marginLeft: 6, color: C.amber, cursor: "help" }}>⚠</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                        {!replicationResults.length && (
                          <tr>
                            <td colSpan={8} style={{ padding: 8, color: C.muted }}>Waiting for first replication result...</td>
                          </tr>
                        )}
                        {minMaxRow && (
                          <tr style={{ borderTop: `2px solid ${C.border}`, color: C.muted, fontStyle: "italic" }}>
                            <td style={{ padding: 8 }} colSpan={2}>Min / Max</td>
                            <td style={{ padding: 8 }}>{minMaxRow.minServed ?? "—"} / {minMaxRow.maxServed ?? "—"}</td>
                            <td style={{ padding: 8 }}>—</td>
                            <td style={{ padding: 8 }}>{minMaxRow.minWait != null ? fmt(minMaxRow.minWait, 1) : "—"} / {minMaxRow.maxWait != null ? fmt(minMaxRow.maxWait, 1) : "—"}</td>
                            <td style={{ padding: 8 }}>{minMaxRow.minSvc != null ? fmt(minMaxRow.minSvc, 1) : "—"} / {minMaxRow.maxSvc != null ? fmt(minMaxRow.maxSvc, 1) : "—"}</td>
                            <td style={{ padding: 8 }}>—</td>
                            <td style={{ padding: 8 }}>—</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                );
              })()}
            </div>
          )}

          {Object.values(aggregateStats).some(stat => stat.n >= 2) && (() => {
            const ciRows = CI_METRICS.map(metric => {
              const stat = aggregateStats[metric];
              if (!stat || stat.n < 2) return null;
              const relPrec = relativePrecision(stat);
              const precColor = relPrec == null ? C.muted : relPrec < 5 ? C.green : relPrec < 15 ? C.amber : C.red;
              const guidance = sampleSizeGuidance(stat);
              return { metric, stat, relPrec, precColor, guidance };
            }).filter(Boolean);
            const guidanceRows = ciRows.filter(r => r.guidance != null);
            return (
              <>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", color: C.text, fontSize: 12, textAlign: "left", tableLayout: "fixed" }}>
                    <thead>
                      <tr style={{ color: C.muted, borderBottom: `1px solid ${C.border}` }}>
                        <th scope="col" style={{ padding: 8 }}>Metric</th>
                        <th scope="col" style={{ padding: 8 }}>Mean</th>
                        <th scope="col" style={{ padding: 8 }}>Lower 95%</th>
                        <th scope="col" style={{ padding: 8 }}>Upper 95%</th>
                        <th scope="col" style={{ padding: 8 }}>Half-width</th>
                        <th scope="col" style={{ padding: 8 }}>Rel. precision %</th>
                        <th scope="col" style={{ padding: 8 }}>n</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ciRows.map(({ metric, stat, relPrec, precColor }) => (
                        <tr key={metric} style={{ borderBottom: `1px solid ${C.border}` }}>
                          <td style={{ padding: 8 }}>{METRIC_LABELS[metric]}</td>
                          <td style={{ padding: 8, color: C.accent }}>{fmtMetric(metric, stat.mean)}</td>
                          <td style={{ padding: 8 }}>{COUNT_METRICS.has(metric) ? fmt(stat.lower, 0) : fmt(stat.lower, 1)}</td>
                          <td style={{ padding: 8 }}>{COUNT_METRICS.has(metric) ? fmt(stat.upper, 0) : fmt(stat.upper, 1)}</td>
                          <td style={{ padding: 8, color: C.amber }}>{fmt(stat.halfWidth, 1)}</td>
                          <td style={{ padding: 8 }}>
                            {relPrec != null ? (
                              <span style={{ color: precColor, fontWeight: 700 }}>{relPrec.toFixed(1)}%</span>
                            ) : "—"}
                          </td>
                          <td style={{ padding: 8 }}>{stat.n}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {guidanceRows.length > 0 && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 3, marginTop: 6 }}>
                    {guidanceRows.map(({ metric, guidance }) => (
                      <span key={metric} style={{ fontSize: 11, color: C.muted, fontFamily: FONT }}>
                        ~{guidance} more replication{guidance > 1 ? "s" : ""} needed to reach 5% precision on {METRIC_LABELS[metric]}
                      </span>
                    ))}
                  </div>
                )}
              </>
            );
          })()}

          {batchStatus === "complete" && (
            <div style={{
              background: C.surface,
              border: `1px solid ${C.border}`,
              borderRadius: 6,
              padding: 12,
              display: "flex",
              flexDirection: "column",
              gap: 10,
            }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <div>
                  <div style={{ fontSize: 10, color: C.muted, fontFamily: FONT, letterSpacing: 1.2, fontWeight: 700 }}>
                    SAVED RUNS
                  </div>
                  <div style={{ fontSize: 12, color: C.text, fontFamily: FONT, marginTop: 2 }}>
                    {runHistoryStatus === "loading"
                      ? "Refreshing saved run history..."
                      : recentSavedRuns.length
                        ? "Latest saved runs for this model"
                        : "The batch finished, but no saved runs are visible yet."}
                  </div>
                </div>
                {canOpenResultsView && (
                  <Btn small variant="ghost" onClick={() => onGoToResults?.()}>
                    View Results →
                  </Btn>
                )}
              </div>

              {runHistoryStatus === "error" && (
                <div style={{ fontSize: 11, color: C.red, fontFamily: FONT }}>
                  Could not refresh run history: {runHistoryError}
                </div>
              )}

              {recentSavedRuns.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {recentSavedRuns.map(run => (
                    <div
                      key={run.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 10,
                        flexWrap: "wrap",
                        padding: "8px 10px",
                        borderRadius: 6,
                        border: `1px solid ${C.border}`,
                        background: C.cardBg,
                      }}
                    >
                      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                        <div style={{ fontSize: 12, color: C.text, fontFamily: FONT, fontWeight: 600 }}>
                          {run.label}
                        </div>
                        <div style={{ fontSize: 11, color: C.muted, fontFamily: FONT }}>
                          {run.timestamp ? new Date(run.timestamp).toLocaleString() : "Saved just now"}
                        </div>
                      </div>
                      <Tag
                        label={`${run.replications} run${run.replications === 1 ? "" : "s"}`}
                        color={C.accent}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {batchStatus === "idle" && replicationResults.length === 0 && (() => {
        const hasDerivableGraph = !!(model.queues?.length || model.bEvents?.length || model.cEvents?.length);
        if (hasDerivableGraph) {
          return (
            <>
              <Suspense fallback={<VisualView snap={currentSnap} model={model} summary={results?.summary ?? liveSummary} />}>
                <ExecuteCanvas
                  snap={currentSnap}
                  model={model}
                  summary={results?.summary ?? liveSummary}
                  animationEnabled={animationEnabled}
                  kpiSlots={kpiSlots}
                  onKpiSlotChange={handleKpiSlotChange}
                  onNodeSelect={setSelectedNodeLabel}
                  selectedNodeDetail={selectedNodeDetail}
                  onNodeDetailSelect={setSelectedNodeDetail}
                  onEntitySelect={setSelectedEntityId}
                  batchActive={batchActive}
                />
              </Suspense>
              <BottomPanel
                log={log}
                snap={currentSnap}
                model={model}
                hasResults={canOpenResultsView}
                onOpenResults={() => onGoToResults?.()}
                selectedNodeLabel={selectedNodeLabel}
                onClearFilter={() => setSelectedNodeLabel(null)}
                selectedEntityId={selectedEntityId}
                onEntitySelect={setSelectedEntityId}
                onNodeSelect={setSelectedNodeLabel}
                timeSeries={results?.timeSeries}
                waitDist={liveWaitDist ?? results?.waitDist}
              />
            </>
          );
        }
        return <VisualView snap={currentSnap} model={model} summary={results?.summary} />;
      })()}
        </>
      )}
      {/* Share Modal */}
      {showShareModal && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: C.overlay, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}
          onClick={() => { setShowShareModal(false); setQrToken(null); }}>
          <div role="dialog" aria-modal="true" aria-labelledby="share-modal-title"
            onClick={e => e.stopPropagation()}
            style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 10, width: 520, maxWidth: "95vw", maxHeight: "90vh", overflowY: "auto", padding: 24, display: "flex", flexDirection: "column", gap: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h2 id="share-modal-title" style={{ fontSize: 16, fontWeight: 700, color: C.text, fontFamily: FONT }}>Share Results</h2>
              <button type="button" aria-label="Close share dialog" onClick={() => { setShowShareModal(false); setQrToken(null); }}
                style={{ background: "none", border: "none", color: C.muted, fontSize: 18, cursor: "pointer", fontFamily: FONT, padding: "0 4px" }}>✕</button>
            </div>

            {/* Widget picker */}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ fontSize: 10, color: C.muted, fontFamily: FONT, letterSpacing: 1.2, fontWeight: 700 }}>VISIBLE WIDGETS</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {[
                  { key: "summary", label: "Summary KPIs" },
                  { key: "queues", label: "Queue table" },
                  { key: "resources", label: "Server table" },
                  { key: "charts", label: "Charts & histograms" },
                ].map(w => (
                  <label key={w.key} style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 11, color: shareConfig.pinnedWidgets.includes(w.key) ? C.accent : C.muted, fontFamily: FONT }}>
                    <input type="checkbox" checked={shareConfig.pinnedWidgets.includes(w.key)} onChange={() => toggleWidget(w.key)} style={{ accentColor: C.accent }} />
                    {w.label}
                  </label>
                ))}
              </div>
            </div>

            {/* Create link */}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ fontSize: 10, color: C.muted, fontFamily: FONT, letterSpacing: 1.2, fontWeight: 700 }}>CREATE SHARE LINK</div>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  aria-label="Share title"
                  placeholder="Optional title..."
                  value={shareConfig.title}
                  onChange={e => setShareConfig(prev => ({ ...prev, title: e.target.value }))}
                  style={{ flex: 1, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 4, color: C.text, fontFamily: FONT, fontSize: 12, padding: "7px 10px", outline: "none" }}
                />
                <select
                  aria-label="Link expiry"
                  value={shareConfig.expiresIn}
                  onChange={e => setShareConfig(prev => ({ ...prev, expiresIn: e.target.value }))}
                  style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 4, color: C.text, fontFamily: FONT, fontSize: 12, padding: "7px 8px", outline: "none", cursor: "pointer" }}>
                  <option value="never">No expiry</option>
                  <option value="24h">24 hours</option>
                  <option value="7d">7 days</option>
                  <option value="30d">30 days</option>
                </select>
                <Btn variant="primary" onClick={handleCreateShareLink} disabled={shareSaving}>
                  {shareSaving ? "Creating..." : "Create Link"}
                </Btn>
              </div>
            </div>

            {/* Existing links */}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ fontSize: 10, color: C.muted, fontFamily: FONT, letterSpacing: 1.2, fontWeight: 700 }}>ACTIVE LINKS</div>
                {shareLinksLoading && <span style={{ fontSize: 10, color: C.muted, fontFamily: FONT }}>Loading...</span>}
              </div>
              {shareLinks.length === 0 && !shareLinksLoading && (
                <div style={{ fontSize: 11, color: C.muted, fontFamily: FONT, fontStyle: "italic" }}>No share links yet.</div>
              )}
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {shareLinks.filter(l => l.isActive).map(link => {
                  const url = `${baseUrl}/#share/${link.token}`;
                  const expiryLabel = link.expiresAt
                    ? `Expires ${new Date(link.expiresAt).toLocaleDateString()}`
                    : "No expiry";
                  const viewLabel = link.viewCount > 0
                    ? `${link.viewCount} view${link.viewCount !== 1 ? "s" : ""}${link.lastViewedAt ? ` · last ${new Date(link.lastViewedAt).toLocaleDateString()}` : ""}`
                    : "Not yet viewed";
                  return (
                    <div key={link.id} style={{ display: "flex", alignItems: "center", gap: 8, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 5, padding: "8px 10px" }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 11, color: C.text, fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{link.token.slice(0, 8)}…</div>
                        <div style={{ fontSize: 9, color: C.muted, fontFamily: FONT }}>{new Date(link.createdAt).toLocaleString()} · {expiryLabel}</div>
                        <div style={{ fontSize: 9, color: link.viewCount > 0 ? C.accent : C.muted, fontFamily: FONT }}>{viewLabel}</div>
                      </div>
                      {justCreatedLink?.token === link.token && (
                        <span style={{ fontSize: 9, color: C.green, fontFamily: FONT, fontWeight: 700 }}>NEW</span>
                      )}
                      <button type="button" onClick={() => copyToClipboard(url)}
                        title="Copy link"
                        style={{ background: "none", border: `1px solid ${C.border}`, borderRadius: 4, color: C.muted, fontFamily: FONT, fontSize: 10, padding: "4px 8px", cursor: "pointer" }}>
                        Copy
                      </button>
                      <button type="button" onClick={() => setQrToken(qrToken === link.token ? null : link.token)}
                        title="Show QR code"
                        style={{ background: "none", border: `1px solid ${qrToken === link.token ? C.accent : C.border}`, borderRadius: 4, color: qrToken === link.token ? C.accent : C.muted, fontFamily: FONT, fontSize: 10, padding: "4px 8px", cursor: "pointer" }}>
                        QR
                      </button>
                      <button type="button" onClick={() => handleRevokeShareLink(link.id)}
                        title="Revoke share link"
                        style={{ background: "none", border: `1px solid ${C.red}44`, borderRadius: 4, color: C.red, fontFamily: FONT, fontSize: 10, padding: "4px 8px", cursor: "pointer" }}>
                        Revoke
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* QR code */}
            {qrToken && (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, padding: 12 }}>
                <div style={{ fontSize: 10, color: C.muted, fontFamily: FONT, letterSpacing: 1.2, fontWeight: 700 }}>QR CODE</div>
                <div ref={qrRef}
                  style={{ width: 180, height: 180, background: "#fff", borderRadius: 6, padding: 8 }} />
                <div style={{ fontSize: 9, color: C.muted, fontFamily: FONT, textAlign: "center", wordBreak: "break-all" }}>
                  {`${baseUrl}/#share/${qrToken}`}
                </div>
                <button type="button" onClick={() => copyToClipboard(`${baseUrl}/#share/${qrToken}`)}
                  style={{ background: "none", border: `1px solid ${C.border}`, borderRadius: 4, color: C.accent, fontFamily: FONT, fontSize: 10, padding: "5px 16px", cursor: "pointer", fontWeight: 600 }}>
                  Copy URL
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export {
  buildResultsCsv,
  buildResultsExportPayload,
  CustomerToken,
  ExecutePanel,
  VisualView,
};
