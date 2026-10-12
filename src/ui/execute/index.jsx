// ui/execute/index.jsx — ExecutePanel (slimmed, imports from sibling modules)

import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
const ExecuteCanvas = lazy(() => import("./ExecuteCanvas.jsx").then(m => ({ default: m.ExecuteCanvas })));
;
import { PhaseTag, Btn, SH, InfoBox } from "../shared/components.jsx";
import { buildEngine } from "../../engine/index.js";
import { mulberry32 } from "../../engine/distributions.js";
import { runReplications } from "../../engine/replication-runner.js";
import { compareScenarios, detectWarmupWelch, summarizeReplicationResults, cumulativeMean } from "../../engine/statistics.js";
import { saveSimulationRun, getRun, saveStudy, listStudies, getStudy, fetchExperiments, saveExperiment } from "../../db/models.js";
import { summaryPathToMetricRef, buildStudyDefinitionFromProposal, validateStudyProposal } from "../../contracts/study";
import { useRunHistory } from "./hooks/useRunHistory.js";
import { useModelSchedules } from "./hooks/useModelSchedules.js";
import { useVisualizationSettings } from "./hooks/useVisualizationSettings.js";
import { usePhaseCTruncationStatus } from "./hooks/usePhaseCTruncationStatus.js";
import { ExperimentRunSettingsFields } from "./ExperimentRunSettingsFields.jsx";
import { OverrideChipList } from "./OverrideChipList.jsx";
import { SavedExperimentsTab } from "./SavedExperimentsTab.jsx";
import { buildRunRecord, updateRunNarrative, compareResults } from "../../db/runRecord.js";
import { callLLMOnce, tryExtractJson } from "../../llm/apiClient.js";
import { buildNarrativePrompt, buildModelDescriptionPrompt, evaluateSweepPointGoals, buildProposeNextStudyPrompt, buildGoalGapsFromResults } from "../../llm/prompts.js";
import { buildLLMBundle } from "../../llm/bundleExport.js";
import { saveLocalRun } from "../../db/local.js";
import { BottomPanel } from "./BottomPanel.jsx";
import { ChartDataChoiceDialog } from "./ChartDataChoiceDialog.jsx";
import { ResultsWorkspace } from "../results/ResultsWorkspace.jsx";
import { evaluateLiveHealth } from "../results/healthFlags.js";
import { CustomerToken, VisualView } from "./VisualView.jsx";
import { validateModel } from "../../engine/validation.js";
import { estimateRunComplexity, estimateMaxCycles, computeEstimateAccuracy, scansPerBEventFromMetrics } from "../../engine/complexity-estimator.js";
import { getRunAdmission } from "../../engine/run-admission.js";
import { enumerateSweepableParams, applySweepValues, generate2DSweepValues, MAX_STUDY_REPLICATIONS } from "../../engine/sweep-params.js";
import { runSweep, runSweepOffthread } from "../../engine/sweep-runner.js";
import { computeSensitivityRanking } from "../../engine/sweep-sensitivity.js";
import { ScenarioComparisonTable } from "../shared/ScenarioComparisonTable.jsx";
import { CI_METRICS, METRIC_LABELS, fmt, fmtMetric, sweepGoalKpiOptions, makeBatchId, makeBatchResult, makeBatchRuntimeMetrics, makeTimeSeriesAccumulator, TIME_SERIES_GRID_POINTS, buildParameterOverrideRecord, buildRunModelSnapshot, buildGoalOutcomes, buildEntityJourneys, buildResultsExportPayload, buildResultsCsv, buildResultsXlsx, downloadTextFile, makeDefaultRunLabel, makeRunLabel, makeRunPromptPayload, makeSavedRunPromptPayload } from "./executeHelpers.js";
import { SweepChart, WarmupChart, Sweep2DGrid, CumulativeMeanChart, QueueHistogram, EntitySummaryTable } from "./SweepViews.jsx";
import { SampledParamRangeList, SampledResultsTable, SensitivityPanel } from "./StudyPlanViews.jsx";
import { LogViewer } from "./LogViewer.jsx";
import { checkModel } from "../../simulation/modelChecker.js";
import { ExperimentControls } from "./ExperimentControls.jsx";
import { ParamBrowserPanel, paramColor } from "../shared/ParamBrowserPanel.jsx";
import { alpha, RADIUS } from "../shared/tokens.js";
import { generateReport, sanitizeFilename } from '../../reports/index.js';
import { getModelImageDataUrl } from '../visual-designer/graph.js';
import { useTheme } from "../shared/ThemeContext.jsx";
import { useConfirm } from "../shared/useConfirm.jsx";
import { ExportPopover } from "../shared/ExportPopover.jsx";
import { ResponsivePanel } from "../shared/ResponsivePanel.jsx";
import { resolveLiveDataModel, numberDefault, scheduleRowCount, intDefault, nowPerf, doCloudSave, yieldToBrowser } from "./runHelpers.js";
import { RunReadinessPanel } from "./RunReadinessPanel.jsx";
import { RunStatusBanners } from "./RunStatusBanners.jsx";
import { BatchResultsPanel } from "./BatchResultsPanel.jsx";


const ExecutePanel = ({ model, modelId, userId, plan = "free", isAdmin = false, tierPolicies = null, currentVersion, currentVersionId, onRunSaved, savedSignal = 0, onResultsReady, onRunComplete, onGoToResults, autoRun = false, onExperimentDefaultsChange = null, onApplyPatchedModel = null, onExposeRunApi = null, onRunStateChange = null, schedulesVersion = 0, modelAssistantOpen = false, onOpenModelAssistant = null, visible = true, studyProposalTrigger = null }) => {
  const { C, FONT } = useTheme();
  const { confirm, confirmDialog } = useConfirm();
  const experimentDefaults = model?.experimentDefaults || {};
  const [mode, setMode] = useState("idle");
  const [currentSnap, setCurrentSnap] = useState(null);
  const [log, setLog] = useState([]);
  const [autoSpeed, setAutoSpeed] = useState(400);
  const [autoRunning, setAutoRunning] = useState(false);
  const isRunning = autoRunning || mode === "running" || mode === "stepping";
  const [saveStatus, setSaveStatus] = useState(null);
  const {
    phaseCTruncated, truncatedReplicationCount, totalReplicationCount, cycleLimitReached,
    scanLimitReplicationCount,
    reset: resetTruncationStatus, recordSingleResult: recordTruncationResult, recordBatchProgress: recordBatchTruncationProgress,
  } = usePhaseCTruncationStatus();
  const [lastRunEstimateAccuracy, setLastRunEstimateAccuracy] = useState(null);
  // Measured C-event scans per B-event from this model's last run — replaces the
  // estimator's default ratio so RA7/RA8 reflect how this model actually scans.
  const [scanCalibration, setScanCalibration] = useState(null);
  const recordScanCalibration = useCallback((runtimeMetrics) => {
    const measured = scansPerBEventFromMetrics(runtimeMetrics, (model?.cEvents || []).length);
    if (measured) setScanCalibration(measured);
  }, [model]);
  const [results, setResults] = useState(null);
  const [liveWaitDist, setLiveWaitDist] = useState(null);
  const [liveTimeSeries, setLiveTimeSeries] = useState(null);
  const [liveSummary, setLiveSummary] = useState(null);
  const [liveFlags, setLiveFlags] = useState([]);
  const [liveFlagsOpen, setLiveFlagsOpen] = useState(false);
  const [stateChanges, setStateChanges] = useState([]);
  const stateChangesRef = useRef([]);
  const [singleRunStatus, setSingleRunStatus] = useState("idle");
  const [singleRunProgress, setSingleRunProgress] = useState(null);
  const [batchStatus, setBatchStatus] = useState("idle");
  const [batchProgress, setBatchProgress] = useState(null);
  const [replicationResults, setReplicationResults] = useState([]);
  const [aggregateStats, setAggregateStats] = useState({});
  const [replicationDetailOpen, setReplicationDetailOpen] = useState(false);
  const [seed, setSeed] = useState(() => numberDefault(experimentDefaults.seed, Math.floor(mulberry32(Date.now())() * 1e9)));
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
  const [readinessExpanded, setReadinessExpanded] = useState(false);
  const [showRunSetup, setShowRunSetup] = useState(false);
  const [showEstimate, setShowEstimate] = useState(null);
  const { savedRunHistory, runHistoryStatus, runHistoryError, refreshRunHistory } = useRunHistory(modelId, userId);
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
  // F-Study: the objective is the metric+direction a Study is optimising for
  // (persisted with the definition — see StudyObjective in
  // src/contracts/study.ts). sweepKpiMetric doubles as the objective's
  // metric so there's one dropdown, not two; direction is a separate control.
  const [sweepObjectiveDirection, setSweepObjectiveDirection] = useState("min");
  const [studyList, setStudyList] = useState([]);
  const [studyListStatus, setStudyListStatus] = useState("idle"); // idle | loading | loaded | error
  const [studyName, setStudyName] = useState("");
  const [loadedStudyId, setLoadedStudyId] = useState(null);
  const [sweepMode, setSweepMode] = useState("1d"); // "1d" | "2d" | "sampled" | "sequential"
  // F-Study Phase 2: sampled plan state. Each entry: { ...paramDescriptor, min, max }.
  const [sampledParams, setSampledParams] = useState([]);
  const [sampledPickerOpen, setSampledPickerOpen] = useState(false);
  // Holds the raw typed string while editing (see the POINTS input below) —
  // parsed once at the point of use via intDefault().
  const [sampledPointCount, setSampledPointCount] = useState("10");
  const [sensitivityRanking, setSensitivityRanking] = useState(null); // { method, ranking } | null
  // F-Study Phase 3: sequential plan state — a sequential study's first batch
  // is a Latin hypercube sample narrowed around a "seed point" taken from a
  // saved Experiment or a point in a previous Study (StudyOrigin, study.ts).
  // Reuses `sampledParams` for the outer/allowed range of each parameter;
  // narrowing happens at run time (buildSequentialParameters below).
  const [seedSource, setSeedSource] = useState("experiment"); // "experiment" | "study"
  const [seedExperiments, setSeedExperiments] = useState([]);
  const [seedExperimentId, setSeedExperimentId] = useState("");
  const [seedStudyId, setSeedStudyId] = useState("");
  const [seedStudyPoints, setSeedStudyPoints] = useState([]);
  const [seedStudyPointIndex, setSeedStudyPointIndex] = useState(0);
  // Fraction of each parameter's outer range width used as the narrowed
  // window. Holds the raw typed string while editing (see the NARROW TO
  // input below) — parsed and clamped to [0.05, 1] once at the point of use
  // in buildSequentialParameters(), not on every keystroke.
  const [sequentialSpread, setSequentialSpread] = useState("0.3");
  // The Study's `origin` (StudyOrigin) — defaults to a plain user-authored
  // study; set explicitly when running a sequential study (seeded from an
  // Experiment/Study) or when a Study proposal from DiagnosticsTab's
  // "Propose a Study" has been loaded for review (kind: "ai").
  const [studyOrigin, setStudyOrigin] = useState({ kind: "user" });
  const [studyProposalRationale, setStudyProposalRationale] = useState(null);
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
  // Seeds SavedExperimentsTab's New form from the Run tab's "Save as Experiment…".
  const [expFormSeed, setExpFormSeed] = useState(null);
  // Resolved {paramConfig, value} pairs from the last loaded experiment with overrides.
  // When non-empty, effectiveModel patches the base model before running/snapshotting.
  const [activeExpOverrides, setActiveExpOverrides] = useState([]);
  // Ad-hoc {path, value} overrides set directly on the Run tab's "Adjust parameters"
  // panel — the same patch-before-run mechanism as a loaded experiment, but requiring
  // no saved Experiment or Scenario. Never persisted; see effectiveModel below.
  const [runOverrides, setRunOverrides] = useState([]);
  const [runOverridesPickerOpen, setRunOverridesPickerOpen] = useState(false);
  const [showRunOverridesPanel, setShowRunOverridesPanel] = useState(false);
  const runOverridesAnchorRef = useRef(null);
  const liveFlagsAnchorRef = useRef(null);
  const closeRunOverridesPanel = useCallback(() => { setShowRunOverridesPanel(false); setRunOverridesPickerOpen(false); }, []);
  const closeLiveFlags = useCallback(() => setLiveFlagsOpen(false), []);
  const [reportGenerating, setReportGenerating] = useState(false); // still used for report progress indicator in status banner
  const [modelCheckerIssues, setModelCheckerIssues] = useState(null);
  const [modelCheckerOpen, setModelCheckerOpen] = useState(false);

  // ── ADR-016: Schedule selection ──────────────────────────────────────────────
  const { modelSchedules, selectedScheduleId, setSelectedScheduleId, schedulesLoading, activeSchedulesMap } = useModelSchedules(modelId, userId, schedulesVersion);

  const sweepRunnerRef = useRef(null);
  const runSeedRef = useRef(seed);
  const engineRef = useRef(null);
  const autoRef = useRef(null);
  const autoRunningRef = useRef(false);
  const startAutoAfterInitRef = useRef(false);
  const liveHistThrottleRef = useRef(0);
  const runnerRef = useRef(null);
  const singleRunCancelRef = useRef(false);
  const saveInProgressRef = useRef(false);
  const logRef = useRef([]);
  const runStartPerfRef = useRef(null);
  const [collectTimeSeries, setCollectTimeSeries] = useState(true);
  const [forceTraceCollection, setForceTraceCollection] = useState(false);
  const [chartChoiceDialog, setChartChoiceDialog] = useState(null); // { messages } | null
  const chartChoiceResolveRef = useRef(null);
  const askChartDataChoice = useCallback((messages) => {
    return new Promise(resolve => {
      chartChoiceResolveRef.current = resolve;
      setChartChoiceDialog({ messages });
    });
  }, []);
  const resolveChartDataChoice = useCallback((choice) => {
    chartChoiceResolveRef.current?.(choice);
    chartChoiceResolveRef.current = null;
    setChartChoiceDialog(null);
  }, []);
  const [saveDetailLevel, setSaveDetailLevel] = useState(() => experimentDefaults.resultDetailLevel || "compact");
  const {
    animationEnabled, toggleAnimation,
    kpiSlots, handleKpiSlotChange,
    speedMultiplier, setSpeedMultiplier,
    selectedNodeLabel, setSelectedNodeLabel,
    selectedNodeDetail, setSelectedNodeDetail,
    selectedEntityId, setSelectedEntityId,
  } = useVisualizationSettings(userId);
  const [latestRunId, setLatestRunId] = useState(null);
  const [showExportPopover, setShowExportPopover] = useState(false);

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
  // Close the Run Setup panel once a save the user triggered from it completes,
  // instead of leaving it open after the SaveBanner's "Save Changes" succeeds.
  useEffect(() => {
    if (savedSignal > 0) setShowRunSetup(false);
  }, [savedSignal]);
  useEffect(() => {
    const stored = model?.experimentDefaults?.resultDetailLevel;
    if (stored === "full" || stored === "minimal" || stored === "compact") {
      setSaveDetailLevel(stored);
    }
  }, [model?.experimentDefaults?.resultDetailLevel]);

  // Parameter overrides (loaded-experiment or ad-hoc Run-tab) are specific to one
  // model's parameter universe — clear them on model switch so a path from model A
  // never silently rides along (and mismatches) into model B's run.
  useEffect(() => {
    setActiveExpOverrides([]);
    setRunOverrides([]);
  }, [modelId]);

  const persistExperimentDefaults = useCallback((patch) => {
    if (!onExperimentDefaultsChange) return;
    onExperimentDefaultsChange({
      ...(model.experimentDefaults || {}),
      warmupPeriod,
      maxSimTime,
      replications,
      seed,
      terminationMode,
      terminationCondition,
      resultDetailLevel: saveDetailLevel,
      ...patch,
    });
  }, [model.experimentDefaults, warmupPeriod, maxSimTime, replications, seed, terminationMode, terminationCondition, saveDetailLevel, onExperimentDefaultsChange]);

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

  // Resolve the Run tab's ad-hoc overrides (raw {path, value} strings) against the
  // sweepable-param universe, same as loadCfg() does for a saved experiment's overrides.
  const resolvedRunOverrides = useMemo(() => {
    if (!runOverrides.length) return [];
    const params = sweepParams.length > 0 ? sweepParams : enumerateSweepableParams(model);
    return runOverrides.flatMap(ov => {
      if (!ov.path || ov.value === "") return [];
      const paramConfig = params.find(p => p.path === ov.path);
      return paramConfig ? [{ paramConfig, value: Number(ov.value) }] : [];
    });
  }, [runOverrides, sweepParams, model]);

  // Combine a loaded experiment's overrides with the Run tab's ad-hoc ones — an ad-hoc
  // edit for the same parameter path wins, since it's the more recent, local change.
  const effectiveOverrides = useMemo(() => {
    if (!resolvedRunOverrides.length) return activeExpOverrides;
    const adhocPaths = new Set(resolvedRunOverrides.map(o => o.paramConfig.path));
    return [...activeExpOverrides.filter(o => !adhocPaths.has(o.paramConfig.path)), ...resolvedRunOverrides];
  }, [activeExpOverrides, resolvedRunOverrides]);

  // When there are parameter overrides in effect — from a loaded experiment, an ad-hoc
  // Run-tab adjustment, or both — apply them on top of the base model so the engine,
  // snapshot, and narrative all reflect the overridden values. This is the ONLY place
  // overrides are applied, so Reset/Step/Auto Run/Batch Run all honour them uniformly.
  const effectiveModel = useMemo(() => {
    if (!effectiveOverrides.length) return model;
    return applySweepValues(model, effectiveOverrides);
  }, [model, effectiveOverrides]);

  // What the run actually used, for the results file — see
  // buildParameterOverrideRecord. Empty when the run used the model as saved.
  const parameterOverrideRecord = useMemo(
    () => buildParameterOverrideRecord(effectiveOverrides, new Set(resolvedRunOverrides.map(o => o.paramConfig.path))),
    [effectiveOverrides, resolvedRunOverrides],
  );

  const complexityEstimate = useMemo(() => estimateRunComplexity(model, {
    terminationMode,
    maxSimTime,
    replications,
    schedulesMap: activeSchedulesMap,
    calibration: scanCalibration,
  }), [model, terminationMode, maxSimTime, replications, activeSchedulesMap, scanCalibration]);
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
  // Auto Run and single-run drive the engine directly (buildEngine) rather than via
  // runReplications, which already defaults collectTrace to false for batches — so this
  // is the only place those two paths get the size-gated trace setting, with an explicit
  // debug override since trace powers the live event-log/trace-viewer feature.
  const traceWouldAutoDisable = runAdmission.effectiveSettings.collectTrace === false;
  const effectiveCollectTrace = forceTraceCollection ? true : runAdmission.effectiveSettings.collectTrace;
  const traceAutoDisabled = traceWouldAutoDisable && !forceTraceCollection;
  const hasAdmissionErrors = runAdmission.hardErrors.length > 0;
  const hasAdmissionWarnings = runAdmission.warnings.length > 0;
  const effectiveResultDetailLevel = saveDetailLevel === "full" ? "full" : saveDetailLevel === "minimal" ? "minimal" : "compact";

  const initEngine = useCallback(async () => {
    if (hasValidationErrors) return;
    // Cancel any in-flight batch or sweep workers before rebuilding
    if (runnerRef.current) { runnerRef.current.cancel(); runnerRef.current = null; }
    if (sweepRunnerRef.current) { sweepRunnerRef.current.cancel(); sweepRunnerRef.current = null; }
    if (autoRef.current) { clearTimeout(autoRef.current); autoRef.current = null; }
    autoRunningRef.current = false;
    setHideRunReadiness(true);
    setExecuteSection("run");
    runSeedRef.current = seed;
    setResolvedSeed(seed);
    setLoadedRunSnapshot(null);
    runStartPerfRef.current = nowPerf();
    const runModel = await resolveLiveDataModel(model, effectiveModel, setSaveStatus);
    engineRef.current = buildEngine(
      runModel,
      seed,
      warmupPeriod,
      terminationMode === 'time' ? maxSimTime : null,
      terminationMode === 'condition' ? terminationCondition : null,
      estimateMaxCycles(runAdmission.complexityEstimate), 5000,
      collectTimeSeries,
      undefined,
      { schedulesMap: activeSchedulesMap, purgePeriod: { enabled: purgePeriodEnabled, maxPurgeTime: Math.min(2 * (maxSimTime || 500), 5000) }, collectTrace: effectiveCollectTrace, maxCEventScans: runAdmission.effectiveSettings?.maxCEventScans }
    );
    setCurrentSnap(engineRef.current.getSnap());
    const initLog = [{ phase: "INIT", time: 0, message: `Simulation initialized  (seed: ${seed}, warmup: ${warmupPeriod})` }];
    if (traceAutoDisabled) {
      initLog.push({ phase: "NOTE", time: 0, message: "Event trace disabled automatically for this large run." });
    }
    logRef.current = initLog;
    setLog(initLog);
    setMode("idle");
    setAutoRunning(startAutoAfterInitRef.current ? true : false);
    startAutoAfterInitRef.current = false;
    setSaveStatus(null);
    resetTruncationStatus(1);
    setResults(null);
    setLatestRunId(null);
    setLiveWaitDist(null);
    setLiveTimeSeries(null);
    setLiveSummary(null);
    setLiveFlags([]);
    stateChangesRef.current = [];
    setStateChanges([]);
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
  }, [model, effectiveModel, seed, hasValidationErrors, warmupPeriod, maxSimTime, terminationMode, terminationCondition, collectTimeSeries, activeSchedulesMap, purgePeriodEnabled, onRunComplete, runAdmission, effectiveCollectTrace, traceAutoDisabled]);

  const stopAuto = useCallback(() => {
    autoRunningRef.current = false;
    if (autoRef.current) {
      clearTimeout(autoRef.current);
      autoRef.current = null;
    }
    setAutoRunning(false);
  }, []);

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

  // Throttled live metrics refresh (wait dist / time series / summary / health flags).
  // Shared by Step and Auto Run so the 400ms throttle is honoured across both paths.
  const updateLiveMetrics = useCallback((snap) => {
    const now = Date.now();
    if (now - liveHistThrottleRef.current <= 400) return;
    liveHistThrottleRef.current = now;
    setLiveWaitDist(engineRef.current.getWaitDist?.() || null);
    setLiveTimeSeries(engineRef.current.getTimeSeries?.() || null);
    const ls = engineRef.current.getSummary?.();
    setLiveSummary(ls || null);
    if (ls && snap) setLiveFlags(evaluateLiveHealth(snap, ls, model));
  }, [model]);

  // Finalize a completed step-through run — builds the result object, saves it, and
  // updates every result surface. Shared by Step, Animated Auto Run, and Turbo so all
  // three produce the identical result for the same engine state.
  const finalizeSteppedRun = useCallback(async (r, finalLog) => {
    setMode("done");
    setLiveWaitDist(null);
    setLiveTimeSeries(null);
    setLiveFlags([]);
    stopAuto();
    const prepareStartedAt = nowPerf();
    setSaveStatus({ state: 'saving', message: 'Preparing results...' });
    await yieldToBrowser();
    const summary = engineRef.current.getSummary();
    const wallClockMs = runStartPerfRef.current == null ? null : Math.max(0, Math.round(nowPerf() - runStartPerfRef.current));
    const finalSummary = {
      ...summary,
      phaseCTruncated: r.phaseCTruncated || summary.phaseCTruncated,
      cycleLimitReached: r.cycleLimitReached || summary.cycleLimitReached,
      scanLimitReached: r.scanLimitReached || summary.scanLimitReached || false,
      total: r.snap?.entities?.filter(e => e.role !== 'server').length || 0,
      served: r.snap?.served || 0,
      reneged: r.snap?.reneged || 0,
    };
    const fullResult = {
      snap: r.snap,
      summary: finalSummary,
      phaseCTruncated: finalSummary.phaseCTruncated,
      cycleLimitReached: finalSummary.cycleLimitReached,
      scanLimitReached: finalSummary.scanLimitReached,
      timeSeries:    engineRef.current.getTimeSeries?.(),
      waitDist:      engineRef.current.getWaitDist?.(),
      waitByArrival:   engineRef.current.getWaitByArrival?.(),
      entitySummary: engineRef.current.getEntitySummary?.(),
      runtimeMetrics: {
        ...engineRef.current.getRuntimeMetrics?.(finalSummary.served),
        wall_clock_ms: wallClockMs,
        replications: 1,
      },
      stateChanges: stateChangesRef.current,
      log: finalLog,
    };
    fullResult.aggregateStats = summarizeReplicationResults([fullResult], CI_METRICS);
    fullResult._experiment_config = {
      maxSimTime: terminationMode === 'time' ? maxSimTime : null,
      warmupPeriod,
      replications: 1,
      terminationMode,
      terminationCondition: terminationMode === 'condition' ? terminationCondition : null,
      seed: runSeedRef.current,
      parameterOverrides: parameterOverrideRecord,
    };
    fullResult._model_snapshot = buildRunModelSnapshot(effectiveModel, fullResult._experiment_config);
    fullResult.goalOutcomes = buildGoalOutcomes(buildGoalGapsFromResults(effectiveModel, fullResult));
    setLastRunEstimateAccuracy(computeEstimateAccuracy(runAdmission.complexityEstimate, fullResult.runtimeMetrics));
    recordScanCalibration(fullResult.runtimeMetrics);
    setResults(fullResult);
    onResultsReady?.(fullResult);
    onRunComplete?.({ results: fullResult, replicationResults: [], warmupDetection: null, log: finalLog });
    if (modelId) {
      const prepareDurationMs = nowPerf() - prepareStartedAt;
      const stepSeed = runSeedRef.current;
      const runRecord = buildRunRecord(fullResult._model_snapshot, fullResult, {
        maxSimTime: terminationMode === 'time' ? maxSimTime : null,
        warmupPeriod,
        replications: 1,
        terminationMode,
        terminationCondition: terminationMode === 'condition' ? terminationCondition : null,
        parameterOverrides: parameterOverrideRecord,
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
        complexityEstimate: runAdmission.complexityEstimate,
        includeModelSnapshot: true,
      };
      if (userId) {
        setSaveStatus({ state: 'saving', message: 'Saving results…' });
        doCloudSave(
          () => saveSimulationRun(modelId, userId, fullResult, { ...config, runRecord }),
          { setSaveStatus, setLog, prepareDurationMs, snapClock: r.snap.clock },
        ).then(runId => {
          if (runId) {
            setLatestRunId(runId);
            storeRunNarrative(runId, effectiveModel, fullResult);
            void refreshRunHistory();
            onRunSaved?.(runId);
          }
        });
      } else {
        saveLocalRun(modelId, fullResult, { ...config, runRecord, resultDetailLevel: "full" });
        void refreshRunHistory();
        setSaveStatus({ state: 'success', message: '✓ Results saved' });
        setLog(prev => [...prev, { phase: "SAVE", time: r.snap.clock, message: "✅ Local history record completed." }]);
        onRunSaved?.(null);
      }
    }
  }, [userId, modelId, model, effectiveModel, parameterOverrideRecord, effectiveRunLabel, warmupPeriod, maxSimTime, terminationMode, terminationCondition, replications, collectTimeSeries, currentVersionId, effectiveResultDetailLevel, runAdmission, stopAuto, onRunSaved, onResultsReady, onRunComplete, refreshRunHistory, storeRunNarrative]);

  const doStep = useCallback(async () => {
    if (batchStatus !== "idle" || replicationResults.length > 0) {
      setBatchStatus("idle");
      setReplicationResults([]);
      setAggregateStats({});
    }
    if (!engineRef.current) return;
    setHideRunReadiness(true);
    setExecuteSection("run");
    setMode("stepping");
    const r = engineRef.current.step();
    const cycleLog = r.cycleLog || [];
    const nextLog = [...logRef.current, ...cycleLog];
    setCurrentSnap(r.snap);
    logRef.current = nextLog;
    setLog(nextLog);
    recordTruncationResult(r);
    if (r.stateChanges?.length) {
      stateChangesRef.current = [...stateChangesRef.current, ...r.stateChanges];
      setStateChanges(stateChangesRef.current);
    }

    if (!r.done && engineRef.current) {
      updateLiveMetrics(r.snap);
    }

    if (r.done) {
      await finalizeSteppedRun(r, nextLog);
    }
  }, [batchStatus, replicationResults, updateLiveMetrics, finalizeSteppedRun]);

  // One Auto Run tick. Turbo (speed multiplier at max) drains the engine in the same
  // batched pattern as a single-replication Batch Run (50 steps per yield); otherwise
  // it steps `speedMultiplier` cycles per frame. Both render a single snapshot per tick
  // and finalize through the shared finalizeSteppedRun so results are identical.
  const tickAuto = useCallback(async () => {
    if (!engineRef.current || !autoRunningRef.current) return;
    setMode("stepping");
    const turbo = speedMultiplier >= 10;
    const stepsPerTick = turbo ? 50 : Math.max(1, Math.round(speedMultiplier));
    let completed = false;
    let finalStep = null;
    const batchLog = [];
    const batchStateChanges = [];
    for (let i = 0; i < stepsPerTick; i++) {
      const r = engineRef.current.step({ captureSnap: false });
      recordTruncationResult(r);
      if (r.cycleLog?.length) batchLog.push(...r.cycleLog);
      if (r.stateChanges?.length) batchStateChanges.push(...r.stateChanges);
      if (r.done) { completed = true; finalStep = r; break; }
    }
    if (batchStateChanges.length) {
      stateChangesRef.current = [...stateChangesRef.current, ...batchStateChanges];
      setStateChanges(stateChangesRef.current);
    }
    const snap = engineRef.current.getSnap();
    setCurrentSnap(snap);
    if (batchLog.length) {
      logRef.current = [...logRef.current, ...batchLog];
      setLog(logRef.current);
    }
    if (completed) {
      finalStep.snap = snap;
      await finalizeSteppedRun(finalStep, logRef.current);
      return;
    }
    updateLiveMetrics(snap);
    if (!autoRunningRef.current) return;
    if (turbo) {
      autoRef.current = setTimeout(tickAuto, 0);
    } else {
      autoRef.current = setTimeout(tickAuto, 40);
    }
  }, [speedMultiplier, recordTruncationResult, updateLiveMetrics, finalizeSteppedRun]);

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
    let forceChartCollection = false;
    if (runAdmission.confirmations.length > 0) {
      const choice = await askChartDataChoice(runAdmission.confirmations);
      if (choice === "cancel") return;
      forceChartCollection = choice === "force";
    }

    setHideRunReadiness(true);
    setExecuteSection("run");
    setLatestRunId(null);

    const runSeed = seed;
    setResolvedSeed(runSeed);
    setLoadedRunSnapshot(null);
    const maxTimeForRun = terminationMode === 'time' ? maxSimTime : null;
    const stopConditionForRun = terminationMode === 'condition' ? terminationCondition : null;
    const effectiveCollectTimeSeries = forceChartCollection ? true : runAdmission.effectiveSettings.collectTimeSeries;
    const chartDataAutoDisabled = collectTimeSeries && !effectiveCollectTimeSeries;

    // ── Live data prefetch (calibrated_batch / lookahead) ─────────────────
    // Resolve all dataSources before handing the model to the engine or workers.
    // The resulting runModel has live values baked into distParams and sched.rows
    // so the engine and web workers stay stateless (no registry needed in workers).
    const runModel = await resolveLiveDataModel(model, effectiveModel, setSaveStatus);
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
      setLiveTimeSeries(null);
      stateChangesRef.current = [];
      setStateChanges([]);
      onResultsReady?.(null);
    const batchInitLog = [{ phase: "INIT", time: 0, message: `Replication batch started  (N=${replications}, base seed: ${runSeed})` }];
    if (chartDataAutoDisabled) {
      batchInitLog.push({ phase: "NOTE", time: 0, message: "Chart data disabled automatically for this large run." });
    }
    logRef.current = batchInitLog;
    setLog(batchInitLog);
      setSaveStatus(null);
      resetTruncationStatus(replications);
      setBatchStatus("running");
      setBatchProgress({ completed: 0, total: replications, running: 0, pending: replications, cancelled: false, workerCount: 0 });
      setReplicationResults([]);
      setAggregateStats({});

      const tsAccumulator = effectiveCollectTimeSeries ? makeTimeSeriesAccumulator(TIME_SERIES_GRID_POINTS, maxTimeForRun) : null;

      runnerRef.current = runReplications({
        model: runModel,
        replications,
        baseSeed: runSeed,
        warmupPeriod,
        maxSimTime: maxTimeForRun,
        terminationCondition: stopConditionForRun,
        maxCycles: estimateMaxCycles(runAdmission.complexityEstimate),
        maxCEventScans: runAdmission.effectiveSettings?.maxCEventScans,
        collectTimeSeries: effectiveCollectTimeSeries,
        schedulesMap: activeSchedulesMap,
        onTimeSeriesSample: tsAccumulator ? ts => tsAccumulator.addSeries(ts) : undefined,
        // Workers keep only the samples the 150-point accumulator reads.
        timeSeriesGridPoints: tsAccumulator && Number.isFinite(maxTimeForRun) && maxTimeForRun > 0 ? TIME_SERIES_GRID_POINTS : null,
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
          recordBatchTruncationProgress(ordered, payload);
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
              ...makeBatchResult(ordered, stats, maxTimeForRun, warmupPeriod, tsAccumulator?.getResult()),
              runtimeMetrics: makeBatchRuntimeMetrics(ordered, replications, wallClockMs),
              aggregateStats: stats,
              ...(chartDataAutoDisabled ? { _requested_collect_time_series: true, _effective_collect_time_series: false } : {}),
            };

            batchResult._experiment_config = {
              maxSimTime: maxTimeForRun,
              warmupPeriod,
              replications,
              terminationMode,
              terminationCondition: stopConditionForRun,
              seed: runSeed,
              parameterOverrides: parameterOverrideRecord,
            };
            // The model that was actually simulated (overrides applied) — consumers read
            // results._model_snapshot before the saved copy arrives from the database.
            batchResult._model_snapshot = buildRunModelSnapshot(effectiveModel, batchResult._experiment_config);
            // Pass/fail per goal, stored with the results so the file is complete.
            batchResult.goalOutcomes = buildGoalOutcomes(buildGoalGapsFromResults(effectiveModel, batchResult));
            setBatchStatus("complete");
            setLastRunEstimateAccuracy(computeEstimateAccuracy(runAdmission.complexityEstimate, batchResult.runtimeMetrics));
            recordScanCalibration(ordered[0]?.result?.runtimeMetrics);
            setResults(batchResult);
            onResultsReady?.(batchResult);
            onRunComplete?.({ results: batchResult, replicationResults: ordered, warmupDetection: null, log: logRef.current });
            setAggregateStats(stats);
            const prepareDurationMs = nowPerf() - prepareStartedAt;
            const batchRunRecord = buildRunRecord(batchResult._model_snapshot, batchResult, {
              maxSimTime: maxTimeForRun,
              warmupPeriod,
              replications,
              terminationMode,
              terminationCondition: stopConditionForRun,
              parameterOverrides: parameterOverrideRecord,
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
              complexityEstimate: runAdmission.complexityEstimate,
              includeModelSnapshot: true,
            };
            if (userId) {
              setSaveStatus({ state: 'saving', message: 'Saving results…' });
              doCloudSave(
                () => saveSimulationRun(modelId, userId, batchResult, { ...batchConfig, runRecord: batchRunRecord }),
                { setSaveStatus, setLog, prepareDurationMs, snapClock: batchResult.snap.clock },
              ).then(runId => {
                if (runId) {
                  setLatestRunId(runId);
                  storeRunNarrative(runId, effectiveModel, batchResult);
                  void refreshRunHistory();
                  onRunSaved?.(runId);
                }
              });
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
    resetTruncationStatus(1);
    setBatchStatus("idle");
    setBatchProgress(null);
    setReplicationResults([]);
    setAggregateStats({});
    stateChangesRef.current = [];
    setStateChanges([]);
    singleRunCancelRef.current = false;
    setSingleRunStatus("running");
    const runInitLog = [{ phase: "INIT", time: 0, message: `Run started  (seed: ${runSeed})` }];
    if (chartDataAutoDisabled) {
      runInitLog.push({ phase: "NOTE", time: 0, message: "Chart data disabled automatically for this large run." });
    }
    if (traceAutoDisabled) {
      runInitLog.push({ phase: "NOTE", time: 0, message: "Event trace disabled automatically for this large run." });
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
      estimateMaxCycles(runAdmission.complexityEstimate), 5000,
      effectiveCollectTimeSeries,
      undefined,
      { schedulesMap: activeSchedulesMap, purgePeriod: { enabled: purgePeriodEnabled, maxPurgeTime: Math.min(2 * (maxSimTime || 500), 5000) }, collectTrace: effectiveCollectTrace, maxCEventScans: runAdmission.effectiveSettings?.maxCEventScans }
    );
    setSingleRunProgress(engine.getProgress());

    let completed = false;
    while (!completed && !singleRunCancelRef.current) {
      for (let i = 0; i < 50; i++) {
        if (singleRunCancelRef.current) break;
        const stepResult = engine.step({ captureSnap: false });
        recordTruncationResult(stepResult);
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
      ...(chartDataAutoDisabled ? { _requested_collect_time_series: true, _effective_collect_time_series: false } : {}),
    };
    result._experiment_config = {
      maxSimTime: maxTimeForRun,
      warmupPeriod,
      replications: 1,
      terminationMode,
      terminationCondition: stopConditionForRun,
      seed: runSeed,
      parameterOverrides: parameterOverrideRecord,
    };
    // The model that was actually simulated (overrides applied) — consumers read
    // results._model_snapshot before the saved copy arrives from the database.
    result._model_snapshot = buildRunModelSnapshot(effectiveModel, result._experiment_config);
    // Pass/fail per goal, stored with the results so the file is complete.
    result.goalOutcomes = buildGoalOutcomes(buildGoalGapsFromResults(effectiveModel, result));

    setCurrentSnap(result.snap);
    setResults(result);
    stateChangesRef.current = result.stateChanges || [];
    setStateChanges(stateChangesRef.current);
    onResultsReady?.(result);
    logRef.current = result.log;
    setLog(result.log);
    onRunComplete?.({ results: result, replicationResults: [], warmupDetection: null, log: result.log });
    setLastRunEstimateAccuracy(computeEstimateAccuracy(runAdmission.complexityEstimate, result.runtimeMetrics));
    recordScanCalibration(result.runtimeMetrics);
    setMode("done");
    setSingleRunStatus(singleRunCancelRef.current ? "cancelled" : "complete");
    setSingleRunProgress(engine.getProgress({ done: true, cancelled: singleRunCancelRef.current }));
    recordTruncationResult(result);

    if (singleRunCancelRef.current) {
      setSaveStatus({ state: 'error', message: 'Run cancelled. Partial results were not saved.' });
      return;
    }

    const prepareDurationMs = nowPerf() - prepareStartedAt;
    const singleRunRecord = buildRunRecord(result._model_snapshot, result, {
      maxSimTime: maxTimeForRun,
      warmupPeriod,
      replications: 1,
      terminationMode,
      terminationCondition: stopConditionForRun,
      parameterOverrides: parameterOverrideRecord,
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
      complexityEstimate: runAdmission.complexityEstimate,
      includeModelSnapshot: true,
    };
    if (userId) {
      setSaveStatus({ state: 'saving', message: 'Saving results…' });
      doCloudSave(
        () => saveSimulationRun(modelId, userId, result, { ...config, runRecord: singleRunRecord }),
        { setSaveStatus, setLog, prepareDurationMs, snapClock: result.snap.clock },
      ).then(runId => {
        if (runId) {
          setLatestRunId(runId);
          storeRunNarrative(runId, effectiveModel, result);
          void refreshRunHistory();
          onRunSaved?.(runId);
        }
      });
    } else {
      saveLocalRun(modelId, result, { ...config, runRecord: singleRunRecord, resultDetailLevel: "full" });
      void refreshRunHistory();
      setSaveStatus({ state: 'success', message: '✓ Results saved' });
      setLog(prev => [...prev, { phase: "SAVE", time: result.snap.clock, message: "✅ Local history record completed." }]);
      onRunSaved?.(null);
    }
  }, [model, effectiveModel, parameterOverrideRecord, userId, modelId, seed, effectiveRunLabel, hasAdmissionErrors, warmupPeriod, maxSimTime, terminationMode, terminationCondition, replications, collectTimeSeries, runAdmission, effectiveResultDetailLevel, stopAuto, onRunSaved, onResultsReady, refreshRunHistory, storeRunNarrative, effectiveCollectTrace, traceAutoDisabled]);

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
      if (mode === "idle") {
        startAutoAfterInitRef.current = true;
        initEngine();
      } else {
        setAutoRunning(true);
      }
    }
  };

  useEffect(() => {
    setHideRunReadiness(false);
  }, [modelId, currentVersionId]);

  useEffect(() => {
    if (!autoRunning) {
      autoRunningRef.current = false;
      if (autoRef.current) { clearTimeout(autoRef.current); autoRef.current = null; }
      return;
    }
    autoRunningRef.current = true;
    if (autoRef.current == null) {
      autoRef.current = setTimeout(tickAuto, 0);
    }
    return () => {
      autoRunningRef.current = false;
      if (autoRef.current) { clearTimeout(autoRef.current); autoRef.current = null; }
    };
  }, [autoRunning, tickAuto]);

  useEffect(() => {
    onRunStateChange?.(isRunning);
  }, [autoRunning, mode, onRunStateChange]);

  useEffect(() => {
    return () => runnerRef.current?.cancel();
  }, []);

  const autoRunRef = useRef(false);
  useEffect(() => {
    if (!visible || !autoRun || autoRunRef.current || hasAdmissionErrors || !modelId) return;
    autoRunRef.current = true;
    doRunAll();
  }, [visible, autoRun, hasAdmissionErrors, modelId, doRunAll]);

  // Lazily populate the sweepable-param universe; returns the resolved array so
  // callers that need it synchronously (loading an experiment's overrides)
  // don't race the state update.
  const ensureSweepParams = useCallback(() => {
    if (sweepParams.length > 0) return sweepParams;
    const params = enumerateSweepableParams(model);
    setSweepParams(params);
    return params;
  }, [sweepParams, model]);

  // Applies a saved experiment's config to the live run setup — every outward
  // write SavedExperimentsTab's Load/Run buttons need, in one place.
  const handleLoadExperiment = useCallback((cfg, { runLabel: label } = {}) => {
    setReplications(cfg.replications ?? 1); setSeed(prev => cfg.seed ?? prev); setWarmupPeriod(cfg.warmupPeriod ?? 0);
    setMaxSimTime(cfg.maxSimTime ?? 500); setTerminationMode(cfg.terminationMode ?? "time"); setTerminationCondition(cfg.terminationCondition ?? null);
    // Resolve stored override paths to paramConfig objects so effectiveModel
    // can patch the base model before the run executes or snapshots it.
    const overrides = cfg.overrides || [];
    if (overrides.length > 0) {
      const params = ensureSweepParams();
      const resolved = overrides.flatMap(ov => {
        const pc = params.find(p => p.path === ov.path);
        return pc ? [{ paramConfig: pc, value: ov.value }] : [];
      });
      setActiveExpOverrides(resolved);
    } else {
      setActiveExpOverrides([]);
    }
    if (label != null) setRunLabel(label);
    setExecuteSection("run");
  }, [ensureSweepParams]);

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
        maxCycles: estimateMaxCycles(runAdmission.complexityEstimate),
        maxCEventScans: runAdmission.effectiveSettings?.maxCEventScans,
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
            cycleLimitReached: first.cycleLimitReached || false,
            scanLimitReached: first.scanLimitReached || false,
          };
          setResults(verifyResult);
          onResultsReady?.(verifyResult);
          resolve(verifyResult);
        },
        onError: () => resolve(null),
      });
    });
  }, [seed, warmupPeriod, maxSimTime, terminationMode, terminationCondition, replications, onResultsReady, activeSchedulesMap, runAdmission]);

  // Verification-only run: same as runWithPatch but does NOT update main results state,
  // so the baseline aggregateStats stays intact for before/after comparison.
  const runForVerification = useCallback((patchedModel) => {
    return new Promise((resolve) => {
      if (schedulesLoading) {
        // Timetable for this model is still loading — bail rather than silently
        // run with an empty schedulesMap (which would zero out arrivals for any
        // bEvent backed by an externalized ADR-016 schedule).
        resolve(null);
        return;
      }
      const completedPayloads = [];
      runReplications({
        model: patchedModel,
        replications,
        baseSeed: seed,
        warmupPeriod,
        maxSimTime: terminationMode === 'time' ? maxSimTime : null,
        terminationCondition: terminationMode === 'condition' ? terminationCondition : null,
        maxCycles: estimateMaxCycles(runAdmission.complexityEstimate),
        maxCEventScans: runAdmission.effectiveSettings?.maxCEventScans,
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
  }, [seed, warmupPeriod, maxSimTime, terminationMode, terminationCondition, replications, activeSchedulesMap, schedulesLoading, runAdmission]);

  useEffect(() => { onExposeRunApi?.(runForVerification); }, [runForVerification, onExposeRunApi]);

  const exportRunMeta = useMemo(() => ({
    runId: latestRunId || 'unknown',
    runLabel: effectiveRunLabel,
    engineVersion: '1.0',
    seed: seed ?? 'unknown',
    prngAlgorithm: 'mulberry32',
    runTimestamp: new Date().toISOString(),
    fetchModelSnapshot: latestRunId ? async () => {
      try { const run = await getRun(latestRunId); return run?.model_snapshot || null; }
      catch { return null; }
    } : null,
  }), [latestRunId, effectiveRunLabel, seed]);


  // ── F-Study: persistence ──────────────────────────────────────────────────
  // A Study is a saved, evaluated parameter sweep — distinct from a saved
  // Experiment (a named parameter set, SavedExperimentsTab.jsx). See
  // src/contracts/study.ts for the StudyDefinition/StudyPoint shapes and
  // src/db/models.js's saveStudy/getStudy/listStudies/deleteStudy.

  const refreshStudyList = useCallback(async () => {
    if (!modelId) return;
    setStudyListStatus("loading");
    try {
      const list = await listStudies(modelId);
      setStudyList(list);
      setStudyListStatus("loaded");
    } catch {
      setStudyListStatus("error");
    }
  }, [modelId]);

  useEffect(() => {
    if (executeSection === "studies" && userId && modelId) {
      void refreshStudyList();
    }
  }, [executeSection, userId, modelId, refreshStudyList]);

  // Sequential plan (Phase 3): load the Experiment list once the "Seed from
  // Experiment" picker is reachable — the Studies tab, sequential mode.
  useEffect(() => {
    if (executeSection === "studies" && sweepMode === "sequential" && modelId) {
      fetchExperiments(modelId).then(setSeedExperiments).catch(() => setSeedExperiments([]));
    }
  }, [executeSection, sweepMode, modelId]);

  // Sequential plan: when "seed from a previous Study" is selected, fetch
  // that study's points so a specific point can be picked as the seed.
  useEffect(() => {
    if (sweepMode === "sequential" && seedSource === "study" && seedStudyId) {
      getStudy(seedStudyId).then(s => setSeedStudyPoints(s.legacy ? [] : (s.points || []))).catch(() => setSeedStudyPoints([]));
    } else {
      setSeedStudyPoints([]);
    }
    setSeedStudyPointIndex(0);
  }, [sweepMode, seedSource, seedStudyId]);

  // Resolves the current seed point (Experiment overrides or a Study point's
  // params) into a path -> numeric value map, or null if nothing is
  // selected/resolvable yet.
  const resolvedSeedValues = useMemo(() => {
    if (sweepMode !== "sequential") return null;
    if (seedSource === "experiment") {
      const exp = seedExperiments.find(e => e.id === seedExperimentId);
      const overrides = exp?.config?.overrides;
      if (!Array.isArray(overrides)) return null;
      return new Map(overrides.map(o => [o.path, parseFloat(o.value)]));
    }
    const point = seedStudyPoints[seedStudyPointIndex];
    if (!point?.params) return null;
    return new Map(point.params.map(p => [p.path, p.value]));
  }, [sweepMode, seedSource, seedExperiments, seedExperimentId, seedStudyPoints, seedStudyPointIndex]);

  // Narrows each sampledParams entry's [min, max] to a window of the
  // configured width (a fraction of the outer range) centred on the
  // resolved seed value, clamped back inside the outer bounds. Falls back to
  // the outer range's midpoint for any parameter the seed point doesn't
  // cover (e.g. an experiment that didn't override every studied parameter).
  const buildSequentialParameters = useCallback((seedValues) => {
    return sampledParams.map(p => {
      // p.min/p.max hold the raw typed string while the user is editing
      // (see SampledParamRangeList) — parse once here, at the point of use.
      const min = numberDefault(p.min, 0);
      const max = numberDefault(p.max, 0);
      const outerWidth = max - min;
      const seedVal = seedValues?.get(p.path) ?? (min + max) / 2;
      // sequentialSpread also holds the raw typed string while editing — parse
      // and clamp to [0.05, 1] here, at read time, rather than on every
      // keystroke (which fought typing a value like "0.25").
      const spread = Math.min(1, Math.max(0.05, numberDefault(sequentialSpread, 0.3)));
      const width = (outerWidth * spread) || outerWidth || 1;
      let lo = seedVal - width / 2;
      let hi = seedVal + width / 2;
      if (lo < min) { hi = Math.min(max, hi + (min - lo)); lo = min; }
      if (hi > max) { lo = Math.max(min, lo - (hi - max)); hi = max; }
      if (!(hi > lo)) { lo = min; hi = max; }
      return { ...p, min: lo, max: hi };
    });
  }, [sampledParams, sequentialSpread]);

  // The StudyParameter list for the current planType — [{...descriptor, range}]
  // in every mode, so buildStudyPoints/handleLoadStudy/the sensitivity panel
  // can all treat "which parameters, and their ranges" uniformly regardless
  // of grid1d/grid2d/sampled.
  const currentStudyParameters = useCallback(() => {
    if (sweepMode === "sequential") {
      return buildSequentialParameters(resolvedSeedValues).map(p => ({ ...p, range: { min: p.min, max: p.max, step: (p.max - p.min) / 10 || 1 } }));
    }
    if (sweepMode === "sampled") {
      return sampledParams.map(p => {
        const min = numberDefault(p.min, 0);
        const max = numberDefault(p.max, 0);
        return { ...p, range: { min, max, step: (max - min) / 10 || 1 } };
      });
    }
    const parameters = [{ ...sweepSelectedParam, range: { min: sweepMin, max: sweepMax, step: sweepStep } }];
    if (sweepMode === "2d" && sweepSelectedParamB) {
      parameters.push({ ...sweepSelectedParamB, range: { min: sweepMinB, max: sweepMaxB, step: sweepStepB } });
    }
    return parameters;
  }, [sweepMode, sampledParams, sweepSelectedParam, sweepSelectedParamB, sweepMin, sweepMax, sweepStep, sweepMinB, sweepMaxB, sweepStepB, buildSequentialParameters, resolvedSeedValues]);

  // A sequential study's origin always carries the seed it was narrowed
  // around (an Experiment or a previous Study's point) — computed on demand
  // rather than stored, so the "seed from" pickers stay the single source of
  // truth; kept in sync with `studyOrigin` for non-sequential modes (user, or
  // an AI proposal's origin — see the "Propose a Study" hydration effect).
  const effectiveStudyOrigin = sweepMode === "sequential"
    ? { kind: seedSource, refId: (seedSource === "experiment" ? seedExperimentId : seedStudyId) || undefined }
    : studyOrigin;

  const buildStudyDefinition = useCallback((results) => {
    const metricRef = summaryPathToMetricRef(sweepKpiMetric) || { kind: "summary", field: "avgWait" };
    return {
      name: studyName.trim() || `Study — ${new Date().toLocaleDateString()}`,
      planType: sweepMode === "sequential" ? "sequential" : sweepMode === "sampled" ? "sampled" : sweepMode === "2d" ? "grid2d" : "grid1d",
      parameters: currentStudyParameters(),
      goals: model.goals || [],
      objective: { metricRef, direction: sweepObjectiveDirection },
      runBudget: { points: results.length, replicationsPerPoint: replications },
      baseSeed: seed,
      origin: effectiveStudyOrigin,
    };
  }, [sweepMode, currentStudyParameters, sweepKpiMetric, sweepObjectiveDirection, studyName, model, replications, seed, effectiveStudyOrigin]);

  // Aggregated per-point metrics only — never per-replication detail (see
  // src/db/results-persistence.js's 800KB payload guard and study_points'
  // schema, which has no field for it).
  const buildStudyPoints = useCallback((results) => results.map((pt, i) => {
    const params = (sweepMode === "sampled" || sweepMode === "sequential") ? pt.params
      : sweepMode === "2d" ? [{ path: sweepSelectedParam?.path, value: pt.valueA }, { path: sweepSelectedParamB?.path, value: pt.valueB }]
      : [{ path: sweepSelectedParam?.path, value: pt.value }];
    const metrics = Object.fromEntries(Object.entries(pt.aggregateStats || {}).map(([path, stat]) => [
      path,
      { mean: stat?.mean ?? null, ci95Low: stat?.lower ?? null, ci95High: stat?.upper ?? null, min: null, max: null },
    ]));
    return {
      pointIndex: i,
      params,
      replications: pt.replications?.length || replications,
      metrics,
      feasible: evaluateSweepPointGoals(model.goals || [], pt.aggregateStats || {}).feasible,
      seed: pt.seed ?? null,
    };
  }), [sweepMode, sweepSelectedParam, sweepSelectedParamB, replications, model]);

  const handleSaveStudy = useCallback(async (results) => {
    if (!userId || !results?.length) return;
    try {
      const definition = buildStudyDefinition(results);
      const points = buildStudyPoints(results);
      await saveStudy(modelId, userId, definition, points);
      setSaveStatus({ state: "success", message: `Study saved — ${results.length} point${results.length === 1 ? "" : "s"}.` });
      void refreshStudyList();
    } catch (err) {
      setSaveStatus({ state: "error", message: `Study save failed: ${err?.message || "unknown error"}` });
    }
  }, [userId, modelId, sweepSelectedParam, buildStudyDefinition, buildStudyPoints, refreshStudyList]);

  // F-Study Phase 3: "Promote to Experiment" on any sampled/sequential study
  // point — seeds SavedExperimentsTab's New form with that point's params as
  // overrides, exactly like the Run tab's "Save as Experiment…" button
  // (both use the same {path, value} shape), and switches to the Experiments
  // tab so the user reviews/names/saves it there. `point` is one raw
  // sweepResults entry — either freshly run (no `.id`, so the resulting
  // experiment's source_study_point_id is left unset) or rehydrated from a
  // loaded study via handleLoadStudy (carries `.id` from study_points).
  const handlePromotePointToExperiment = useCallback((point) => {
    if (!point?.params?.length) return;
    setExpFormSeed({
      overrides: point.params.map(p => ({ path: p.path, value: String(p.value) })),
      sourceStudyPointId: point.id || undefined,
    });
    setExecuteSection("saved-experiments");
  }, []);

  // Loads a saved study read-only into the existing chart/table views. Only
  // current-schema studies (schema_version set) are rehydrated into the sweep
  // form state — legacy blob rows (saved before this schema existed, and
  // never actually produced by any UI caller) have no defined shape to
  // rehydrate, so they're surfaced as unavailable rather than guessed at.
  const handleLoadStudy = useCallback(async (id) => {
    try {
      const study = await getStudy(id);
      if (study.legacy) {
        setSweepResults(null);
        setSweepStatus("idle");
        setSaveStatus({ state: "error", message: "This is a legacy sweep record saved before Studies existed — no structured preview is available." });
        setLoadedStudyId(id);
        return;
      }
      const def = study.definition || {};
      const isGrid2d = def.planType === "grid2d";
      const isSampled = def.planType === "sampled" || def.planType === "sequential";
      const newMode = def.planType === "sequential" ? "sequential" : def.planType === "sampled" ? "sampled" : isGrid2d ? "2d" : "1d";
      setSweepMode(newMode);
      if (isSampled) {
        setSampledParams((def.parameters || []).map(p => ({ ...p, min: p.range?.min, max: p.range?.max })));
        setSweepSelectedParam(null);
        setSweepSelectedParamB(null);
      } else {
        setSweepSelectedParam(def.parameters?.[0] || null);
        setSweepSelectedParamB(isGrid2d ? (def.parameters?.[1] || null) : null);
      }
      if (def.objective?.metricRef?.kind === "summary") {
        setSweepKpiMetric(`summary.${def.objective.metricRef.field}`);
      }
      setSweepObjectiveDirection(def.objective?.direction || "min");
      setStudyName(def.name || "");
      setStudyOrigin(def.origin || { kind: "user" });
      const rebuilt = (study.points || []).map(p => {
        const aggregateStats = Object.fromEntries(Object.entries(p.metrics || {}).map(([path, m]) => [
          path, { n: p.replications, mean: m.mean, lower: m.ci95Low, upper: m.ci95High },
        ]));
        // Dummy-length array so the results table's "Reps" column (which only
        // reads .length) renders correctly, without carrying back any
        // per-replication detail that was never persisted in the first place.
        const replicationsPlaceholder = new Array(p.replications || 0).fill(null);
        // `id` is kept (unlike every other rebuilt field) so a loaded study's
        // points can be promoted to an Experiment with source_study_point_id
        // set — see handlePromotePointToExperiment.
        if (isSampled) return { id: p.id, params: p.params, seed: p.seed, replications: replicationsPlaceholder, aggregateStats };
        return isGrid2d
          ? { id: p.id, valueA: p.params?.[0]?.value, valueB: p.params?.[1]?.value, seed: p.seed, replications: replicationsPlaceholder, aggregateStats }
          : { id: p.id, value: p.params?.[0]?.value, seed: p.seed, replications: replicationsPlaceholder, aggregateStats };
      });
      setSweepResults(rebuilt);
      setSweepStatus(rebuilt.length ? "complete" : "idle");
      setSensitivityRanking(isSampled && rebuilt.length
        ? computeSensitivityRanking(rebuilt, def.parameters || [], def.objective?.metricRef ? `summary.${def.objective.metricRef.field}` : null)
        : null);
      setLoadedStudyId(id);
    } catch (err) {
      setSaveStatus({ state: "error", message: `Failed to load study: ${err?.message || "unknown error"}` });
    }
  }, []);

  // F-Study Phase 3: hydrates the Studies form from an AI-proposed (or
  // AI-narrowed) StudyDefinition for review/edit — nothing runs until the
  // user clicks Run. Shared by both proposal entry points: DiagnosticsTab's
  // "Propose a Study" (via studyProposalTrigger, below) and this tab's own
  // "Propose next study" (handleProposeNextStudy, below).
  const applyStudyProposal = useCallback((definition, rationale) => {
    const isSequential = definition.planType === "sequential";
    const isSampled = definition.planType === "sampled" || isSequential;
    const isGrid2d = definition.planType === "grid2d";
    setSweepResults(null);
    setSensitivityRanking(null);
    setComparisonResult(null);
    setLoadedStudyId(null);
    setSweepMode(isSequential ? "sequential" : isSampled ? "sampled" : isGrid2d ? "2d" : "1d");
    if (isSampled) {
      setSampledParams(definition.parameters.map(p => ({ ...p, min: p.range?.min, max: p.range?.max })));
      setSweepSelectedParam(null);
      setSweepSelectedParamB(null);
      // The AI already gives the exact range to run (narrowed, for a
      // sequential proposal) — a spread of 1 with no seed selected makes
      // buildSequentialParameters() reproduce that range unchanged (see its
      // midpoint-seed fallback) rather than narrowing it again.
      if (isSequential) { setSequentialSpread(1); setSeedExperimentId(""); setSeedStudyId(""); }
    } else {
      setSweepSelectedParam(definition.parameters[0] || null);
      setSweepSelectedParamB(isGrid2d ? (definition.parameters[1] || null) : null);
      if (definition.parameters[0]?.range) {
        setSweepMin(String(definition.parameters[0].range.min));
        setSweepMax(String(definition.parameters[0].range.max));
        setSweepStep(String(definition.parameters[0].range.step));
      }
      if (isGrid2d && definition.parameters[1]?.range) {
        setSweepMinB(String(definition.parameters[1].range.min));
        setSweepMaxB(String(definition.parameters[1].range.max));
        setSweepStepB(String(definition.parameters[1].range.step));
      }
    }
    if (definition.objective?.metricRef?.kind === "summary") {
      setSweepKpiMetric(`summary.${definition.objective.metricRef.field}`);
    }
    setSweepObjectiveDirection(definition.objective?.direction || "min");
    setStudyName(definition.name || "");
    if (definition.runBudget?.points > 0) setSampledPointCount(definition.runBudget.points);
    if (definition.runBudget?.replicationsPerPoint > 0) setReplications(definition.runBudget.replicationsPerPoint);
    setStudyOrigin(definition.origin);
    setStudyProposalRationale(rationale || null);
    setExecuteSection("studies");
    setSweepOpen(true);
  }, []);

  // Cross-panel entry point: DiagnosticsTab.jsx's "Propose a Study" (via
  // AiAssistantPanel -> ModelDetail.jsx) delivers its validated proposal
  // here as { payload, origin, seq } — seq increments on every proposal so
  // the effect fires even if the same payload is proposed twice in a row.
  const appliedProposalSeqRef = useRef(0);
  useEffect(() => {
    if (!studyProposalTrigger || studyProposalTrigger.seq === appliedProposalSeqRef.current) return;
    appliedProposalSeqRef.current = studyProposalTrigger.seq;
    const paramsForLookup = sweepParams.length ? sweepParams : enumerateSweepableParams(model);
    const definition = buildStudyDefinitionFromProposal(studyProposalTrigger.payload, paramsForLookup, {
      goals: model.goals || [],
      baseSeed: seed,
      origin: studyProposalTrigger.origin,
    });
    applyStudyProposal(definition, studyProposalTrigger.payload?.rationale);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studyProposalTrigger]);

  // In-tab entry point: "Propose next study" on a finished/loaded
  // sampled/sequential study with a sensitivity ranking — asks the AI to
  // narrow the ranges around the best point found (buildProposeNextStudyPrompt,
  // src/llm/prompts.js). Requires a saved study id (loadedStudyId) so the
  // proposal's origin can point back at it (parent_study_id).
  const [proposeNextStudyStatus, setProposeNextStudyStatus] = useState("idle"); // idle | loading | error
  const handleProposeNextStudy = useCallback(async () => {
    if (!loadedStudyId || !sweepResults?.length) return;
    setProposeNextStudyStatus("loading");
    try {
      const definitionSoFar = buildStudyDefinition(sweepResults);
      const paramsForLookup = sweepParams.length ? sweepParams : enumerateSweepableParams(model);
      const prompt = buildProposeNextStudyPrompt(definitionSoFar, buildStudyPoints(sweepResults), sensitivityRanking, paramsForLookup);
      const raw = await callLLMOnce(prompt);
      const parsed = tryExtractJson(raw.trim());
      const validation = validateStudyProposal(parsed, paramsForLookup);
      if (!validation.valid) throw new Error(`AI proposal failed validation: ${validation.errors.join("; ")}`);
      const definition = buildStudyDefinitionFromProposal(parsed, paramsForLookup, {
        goals: model.goals || [],
        baseSeed: seed,
        origin: { kind: "study", refId: loadedStudyId },
      });
      applyStudyProposal(definition, parsed.rationale);
      setProposeNextStudyStatus("idle");
    } catch (err) {
      setProposeNextStudyStatus("error");
      setSaveStatus({ state: "error", message: `Propose next study failed: ${err?.message || "unknown error"}` });
    }
  }, [loadedStudyId, sweepResults, sensitivityRanking, sweepParams, model, seed, buildStudyDefinition, buildStudyPoints, applyStudyProposal]);

  const handleRunSweep = useCallback(() => {
    if (hasAdmissionErrors) return;
    if (sweepMode === "1d" && !sweepSelectedParam) return;
    if (sweepMode === "2d" && (!sweepSelectedParam || !sweepSelectedParamB)) return;
    if ((sweepMode === "sampled" || sweepMode === "sequential") && (!sampledParams.length || sampledParams.some(p => !(numberDefault(p.max, 0) > numberDefault(p.min, 0))))) return;
    if (sweepMode === "sequential" && !resolvedSeedValues) return;

    // Range fields hold the raw typed string while editing (see the MIN/MAX/STEP
    // inputs below — storing the parsed number there fought the browser's own
    // number-input editing and made typing a decimal point or a leading zero
    // feel locked). Parse once here, at the point of use.
    const min = parseFloat(sweepMin) || 0;
    const max = parseFloat(sweepMax) || 0;
    const step = parseFloat(sweepStep) || 0;
    const minB = parseFloat(sweepMinB) || 0;
    const maxB = parseFloat(sweepMaxB) || 0;
    const stepB = parseFloat(sweepStepB) || 0;

    setSweepStatus("running");
    setSweepResults(null);
    setSweepProgress(null);
    setSweepGridError(null);
    setSensitivityRanking(null);
    setLoadedStudyId(null);

    if (sweepMode === "sampled" || sweepMode === "sequential") {
      const objectivePath = sweepKpiMetric;
      const parameters = currentStudyParameters();

      const onSampledComplete = (results) => {
        setSensitivityRanking(computeSensitivityRanking(results, parameters, objectivePath));
        void handleSaveStudy(results);
      };

      sweepRunnerRef.current = runSweepOffthread({
        model,
        planType: sweepMode === "sequential" ? "sequential" : "sampled",
        parameters,
        points: intDefault(sampledPointCount, 10),
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
          setSaveStatus({ state: "error", message: error?.pointIndex != null ? `Study error at point ${error.pointIndex}: ${error.message}` : `Study error: ${error.message}` });
        },
        onComplete(results) {
          setSweepStatus("complete");
          setSweepResults(results);
          setSaveStatus({ state: "success", message: `Study complete: ${results.length} points run.` });
          onSampledComplete(results);
        },
        onCancelled(partial) {
          setSweepStatus("complete");
          setSweepResults(partial.results);
          setSaveStatus({ state: "success", message: `Study cancelled after ${partial.completedPoints} points.` });
          onSampledComplete(partial.results);
        },
      });
    } else if (sweepMode === "2d") {
      try {
        generate2DSweepValues(
          { min, max, step },
          { min: minB, max: maxB, step: stepB },
          replications
        );
      } catch (err) {
        setSweepGridError(err.message);
        setSweepStatus("idle");
        return;
      }

      sweepRunnerRef.current = runSweepOffthread({
        model,
        paramConfigs: [sweepSelectedParam, sweepSelectedParamB],
        ranges: [
          { min, max, step },
          { min: minB, max: maxB, step: stepB },
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
          void handleSaveStudy(results);
        },
        onCancelled(partial) {
          setSweepStatus("complete");
          setSweepResults(partial.results);
          setSaveStatus({ state: "success", message: `Sweep cancelled after ${partial.completedPoints} points.` });
          void handleSaveStudy(partial.results);
        },
      });
    } else {
      sweepRunnerRef.current = runSweep({
        model,
        paramConfig: sweepSelectedParam,
        min,
        max,
        step,
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
          void handleSaveStudy(results);
        },
        onCancelled(partial) {
          setSweepStatus("complete");
          setSweepResults(partial.results);
          setSaveStatus({ state: "success", message: `Sweep cancelled after ${partial.completedPoints} points.` });
          void handleSaveStudy(partial.results);
        },
      });
    }
  }, [model, sweepMode, sweepSelectedParam, sweepSelectedParamB, sweepMin, sweepMax, sweepStep,
      sweepMinB, sweepMaxB, sweepStepB, sampledParams, sampledPointCount, sweepKpiMetric,
      currentStudyParameters, replications, seed, warmupPeriod, maxSimTime,
      terminationMode, terminationCondition, collectTimeSeries, hasAdmissionErrors, runAdmission,
      resolvedSeedValues, handleSaveStudy]);

  const handleCancelSweep = useCallback(() => {
    sweepRunnerRef.current?.cancel();
  }, []);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {!isRunning && (
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {[
          { id: "run", label: "Run" },
          { id: "saved-experiments", label: "Experiments" },
          { id: "studies", label: "Studies" },
        ].map(section => (
          <Btn
            key={section.id}
            small
            variant={executeSection === section.id ? "primary" : "ghost"}
            onClick={() => {
              if (section.id === "studies" && !sweepOpen) { setSweepParams(enumerateSweepableParams(model)); setSweepOpen(true); }
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
      )}

      {executeSection === "run" && showRunSetup && !isRunning && (
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
            animationEnabled={animationEnabled} setAnimationEnabled={toggleAnimation}
            collectTimeSeries={collectTimeSeries} setCollectTimeSeries={setCollectTimeSeries}
            forceTraceCollection={forceTraceCollection} setForceTraceCollection={setForceTraceCollection}
            traceAutoDisabled={traceWouldAutoDisable}
            purgePeriodEnabled={purgePeriodEnabled} setPurgePeriodEnabled={setPurgePeriodEnabled}
            saveDetailLevel={saveDetailLevel} setSaveDetailLevel={setSaveDetailLevel}
            speedMultiplier={speedMultiplier} setSpeedMultiplier={setSpeedMultiplier}
            onClose={() => setShowRunSetup(false)}
          />
        </div>
      )}

      <SavedExperimentsTab
        visible={executeSection === "saved-experiments"}
        modelId={modelId}
        userId={userId}
        sweepParams={sweepParams}
        ensureSweepParams={ensureSweepParams}
        runConfig={{ replications, seed, warmupPeriod, maxSimTime, terminationMode, terminationCondition }}
        renderRunSettings={() => (
          <ExperimentRunSettingsFields
            warmupPeriod={warmupPeriod} setWarmupPeriod={setWarmupPeriod}
            replications={replications} setReplications={setReplications}
            seed={seed} setSeed={setSeed}
            terminationMode={terminationMode} setTerminationMode={setTerminationMode}
            maxSimTime={maxSimTime} setMaxSimTime={setMaxSimTime}
            terminationCondition={terminationCondition} setTerminationCondition={setTerminationCondition}
            model={model}
          />
        )}
        onLoadExperiment={handleLoadExperiment}
        formSeed={expFormSeed}
        onFormSeedConsumed={() => setExpFormSeed(null)}
      />

      {executeSection === "studies" && (
      <div style={{ maxWidth: 1120, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700, color: C.text, fontFamily: FONT }}>Studies</div>
          <div style={{ fontSize: 12, color: C.muted, fontFamily: FONT, marginTop: 2 }}>Parametric sweep and adaptive batch exploration</div>
        </div>
      </div>
      {userId && (
        <div style={{ background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 8, padding: "12px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: 10, color: C.label, fontFamily: FONT, letterSpacing: 1.2, fontWeight: 700 }}>PAST STUDIES</span>
            {studyListStatus === "loading" && <span style={{ fontSize: 10, color: C.muted, fontFamily: FONT }}>Loading…</span>}
          </div>
          {studyListStatus === "loaded" && studyList.length === 0 && (
            <span style={{ fontSize: 11, color: C.muted, fontFamily: FONT }}>No studies saved yet for this model.</span>
          )}
          {studyListStatus === "error" && (
            <span style={{ fontSize: 11, color: C.red, fontFamily: FONT }}>Couldn't load past studies.</span>
          )}
          {studyList.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 160, overflowY: "auto" }}>
              {studyList.map(s => (
                <div key={s.id} style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
                  padding: "5px 8px", borderRadius: 5,
                  background: loadedStudyId === s.id ? alpha(C.accent, 0.12) : "transparent",
                }}>
                  <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
                    <span style={{ fontSize: 12, color: C.text, fontFamily: FONT, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {s.name}{s.legacy && <span style={{ color: C.muted, fontWeight: 400 }}> (legacy)</span>}
                    </span>
                    <span style={{ fontSize: 10, color: C.muted, fontFamily: FONT }}>
                      {s.planType || "—"} · {s.status || "—"} · {new Date(s.createdAt).toLocaleString()}
                    </span>
                  </div>
                  <Btn small variant="ghost" onClick={() => handleLoadStudy(s.id)}>Load</Btn>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      <div style={{ background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden" }}>
        {(sweepStatus === "running" || sweepStatus === "complete" || sweepStatus === "error") && (
          <div style={{ padding: "8px 16px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: 8 }}>
            {sweepStatus === "running" && <span style={{ fontSize: 11, color: C.amber, fontFamily: FONT }}>Running experiment…</span>}
            {sweepStatus === "complete" && <span style={{ fontSize: 11, color: C.green, fontFamily: FONT }}>Complete — {sweepResults?.length} points</span>}
            {sweepStatus === "error" && <span style={{ fontSize: 11, color: C.red, fontFamily: FONT }}>Error</span>}
          </div>
        )}
        <div style={{ padding: "16px 16px", display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ fontSize: 11, color: C.muted, fontFamily: FONT, lineHeight: 1.5 }}>
              Vary one or two parameters across a range to see how KPIs respond. Each point runs multiple replications for statistical confidence.
              {userId
                ? " Every completed study is saved automatically and appears in the studies list above."
                : " Sign in to save completed studies — results are only shown for this session."}
            </div>
            {/* Mode toggle */}
            <div style={{ display: "flex", gap: 2, background: C.bg, borderRadius: 5, padding: 2, width: "fit-content" }}>
              <button
                onClick={() => { setSweepMode("1d"); setSweepResults(null); setComparisonResult(null); setStudyOrigin({ kind: "user" }); setStudyProposalRationale(null); }}
                style={{ background: sweepMode === "1d" ? C.border : "transparent", border: "none", borderRadius: 4, color: sweepMode === "1d" ? C.text : C.muted, cursor: "pointer", fontFamily: FONT, fontSize: 11, padding: "5px 12px" }}>
                1D Sweep
              </button>
              <button
                onClick={() => { setSweepMode("2d"); setSweepResults(null); setComparisonResult(null); setStudyOrigin({ kind: "user" }); setStudyProposalRationale(null); }}
                style={{ background: sweepMode === "2d" ? C.border : "transparent", border: "none", borderRadius: 4, color: sweepMode === "2d" ? C.text : C.muted, cursor: "pointer", fontFamily: FONT, fontSize: 11, padding: "5px 12px" }}>
                2D Sweep
              </button>
              <button
                onClick={() => { setSweepMode("sampled"); setSweepResults(null); setComparisonResult(null); setSensitivityRanking(null); setStudyOrigin({ kind: "user" }); setStudyProposalRationale(null); }}
                style={{ background: sweepMode === "sampled" ? C.border : "transparent", border: "none", borderRadius: 4, color: sweepMode === "sampled" ? C.text : C.muted, cursor: "pointer", fontFamily: FONT, fontSize: 11, padding: "5px 12px" }}>
                Sampled
              </button>
              <button
                onClick={() => { setSweepMode("sequential"); setSweepResults(null); setComparisonResult(null); setSensitivityRanking(null); setSequentialSpread(0.3); setStudyProposalRationale(null); }}
                style={{ background: sweepMode === "sequential" ? C.border : "transparent", border: "none", borderRadius: 4, color: sweepMode === "sequential" ? C.text : C.muted, cursor: "pointer", fontFamily: FONT, fontSize: 11, padding: "5px 12px" }}>
                Sequential
              </button>
            </div>

            {studyProposalRationale && (
              <div style={{ background: alpha(C.accent, 0.08), border: `1px solid ${alpha(C.accent, 0.35)}`, borderRadius: 6, padding: "8px 10px", display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
                <span style={{ fontSize: 11, color: C.text, fontFamily: FONT, lineHeight: 1.5 }}>
                  <strong style={{ color: C.accent }}>AI proposal loaded</strong> — review the parameters/budget below, then click Run to execute it. {studyProposalRationale}
                </span>
                <Btn small variant="ghost" onClick={() => setStudyProposalRationale(null)}>Dismiss</Btn>
              </div>
            )}

            {(sweepMode === "sampled" || sweepMode === "sequential") && (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ fontSize: 11, color: C.muted, fontFamily: FONT, lineHeight: 1.5 }}>
                  {sweepMode === "sequential"
                    ? "Draws a Latin hypercube sample narrowed around a seed point (a saved Experiment or a point from a previous Study) within the outer range set for each parameter below."
                    : "Draws a Latin hypercube sample across every parameter added below — spread evenly across each parameter's range rather than a fixed grid — and ranks which parameters matter most to the objective."}
                </div>
                <SampledParamRangeList
                  sampledParams={sampledParams}
                  setSampledParams={setSampledParams}
                  sweepParams={sweepParams}
                  pickerOpen={sampledPickerOpen}
                  setPickerOpen={setSampledPickerOpen}
                />
                {sweepMode === "sequential" && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 6, padding: 10 }}>
                    <span style={{ fontSize: 10, color: C.label, fontFamily: FONT, letterSpacing: 1.2, fontWeight: 700 }}>SEED FROM</span>
                    <div style={{ display: "flex", gap: 2, background: C.cardBg, borderRadius: 5, padding: 2, width: "fit-content" }}>
                      <button onClick={() => setSeedSource("experiment")}
                        style={{ background: seedSource === "experiment" ? C.border : "transparent", border: "none", borderRadius: 4, color: seedSource === "experiment" ? C.text : C.muted, cursor: "pointer", fontFamily: FONT, fontSize: 11, padding: "4px 10px" }}>
                        Experiment
                      </button>
                      <button onClick={() => setSeedSource("study")}
                        style={{ background: seedSource === "study" ? C.border : "transparent", border: "none", borderRadius: 4, color: seedSource === "study" ? C.text : C.muted, cursor: "pointer", fontFamily: FONT, fontSize: 11, padding: "4px 10px" }}>
                        Previous Study
                      </button>
                    </div>
                    {seedSource === "experiment" ? (
                      <select aria-label="Seed experiment" value={seedExperimentId} onChange={e => setSeedExperimentId(e.target.value)}
                        style={{ background: "transparent", border: `1px solid ${C.border}`, borderRadius: 4, color: C.text, fontFamily: FONT, fontSize: 12, padding: "6px 8px" }}>
                        <option value="">Select an experiment…</option>
                        {seedExperiments.map(exp => <option key={exp.id} value={exp.id}>{exp.name}</option>)}
                      </select>
                    ) : (
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <select aria-label="Seed study" value={seedStudyId} onChange={e => setSeedStudyId(e.target.value)}
                          style={{ background: "transparent", border: `1px solid ${C.border}`, borderRadius: 4, color: C.text, fontFamily: FONT, fontSize: 12, padding: "6px 8px" }}>
                          <option value="">Select a study…</option>
                          {studyList.filter(s => !s.legacy).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                        {seedStudyPoints.length > 0 && (
                          <select aria-label="Seed point" value={seedStudyPointIndex} onChange={e => setSeedStudyPointIndex(parseInt(e.target.value, 10) || 0)}
                            style={{ background: "transparent", border: `1px solid ${C.border}`, borderRadius: 4, color: C.text, fontFamily: FONT, fontSize: 12, padding: "6px 8px" }}>
                            {seedStudyPoints.map((p, i) => <option key={p.id || i} value={i}>Point {p.pointIndex} {p.feasible === true ? "✓" : p.feasible === false ? "✗" : ""}</option>)}
                          </select>
                        )}
                      </div>
                    )}
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 10, color: C.label, fontFamily: FONT, letterSpacing: 1.2, fontWeight: 700 }}>NARROW TO</span>
                      <input type="number" aria-label="Narrowed range width, as a fraction of the outer range" min={0.05} max={1} step={0.05} value={sequentialSpread ?? ""}
                        onChange={e => setSequentialSpread(e.target.value)}
                        style={{ width: 70, background: "transparent", border: `1px solid ${C.border}`, borderRadius: 4, color: C.amber, fontFamily: FONT, fontSize: 12, padding: "6px 8px" }} />
                      <span style={{ fontSize: 11, color: C.muted, fontFamily: FONT }}>× each parameter's outer range width, centred on the seed point</span>
                    </div>
                    {!resolvedSeedValues && <span style={{ fontSize: 11, color: C.amber, fontFamily: FONT }}>Select a seed to narrow the ranges above.</span>}
                  </div>
                )}
                <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 100 }}>
                    <span style={{ fontSize: 10, color: C.label, fontFamily: FONT, letterSpacing: 1.2, fontWeight: 700 }}>POINTS</span>
                    <input type="number" aria-label="Sampled study point count" min={1} value={sampledPointCount ?? ""}
                      onChange={e => setSampledPointCount(e.target.value)}
                      style={{ background: "transparent", border: `1px solid ${C.border}`, borderRadius: 4, color: C.amber, fontFamily: FONT, fontSize: 12, padding: "6px 8px", width: 90 }} />
                  </div>
                  {(() => {
                    // sampledPointCount holds the raw typed string while editing (same
                    // fix as the range inputs above) — parse once here, at the point of use.
                    const pointCount = intDefault(sampledPointCount, 10);
                    const totalReplications = pointCount * replications;
                    return (
                      <span style={{ fontSize: 11, color: C.muted, fontFamily: FONT }}>
                        {totalReplications > MAX_STUDY_REPLICATIONS
                          ? `⚠ ${pointCount} points x ${replications} replications = ${totalReplications} replications, exceeding the ${MAX_STUDY_REPLICATIONS.toLocaleString()}-replication budget.`
                          : `${pointCount} points x ${replications} replications = ${totalReplications} replications`}
                      </span>
                    );
                  })()}
                </div>
              </div>
            )}

            {/* Parameter picker(s) — 1D/2D only; sampled/sequential use SampledParamRangeList above */}
            {sweepMode !== "sampled" && sweepMode !== "sequential" && (
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
                      borderRadius: RADIUS.sm, padding: "4px 8px", cursor: "pointer", 
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
            )}

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
                        borderRadius: RADIUS.sm, padding: "4px 8px", cursor: "pointer", 
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
            {((sweepMode === "sampled" || sweepMode === "sequential") ? sampledParams.length > 0 : sweepSelectedParam) && (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {sweepMode !== "sampled" && sweepMode !== "sequential" && (
                <>
                <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1, minWidth: 80 }}>
                    <span style={{ fontSize: 10, color: C.label, fontFamily: FONT, letterSpacing: 1.2, fontWeight: 700 }}>MIN {sweepMode === "2d" ? "X" : ""}</span>
                    <input type="number" aria-label="Sweep min" value={sweepMin ?? ""}
                      onChange={e => setSweepMin(e.target.value)}
                      style={{ background: "transparent", border: `1px solid ${C.border}`, borderRadius: 4, color: C.amber, fontFamily: FONT, fontSize: 12, padding: "6px 8px", width: "100%" }} />
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1, minWidth: 80 }}>
                    <span style={{ fontSize: 10, color: C.label, fontFamily: FONT, letterSpacing: 1.2, fontWeight: 700 }}>MAX {sweepMode === "2d" ? "X" : ""}</span>
                    <input type="number" aria-label="Sweep max" value={sweepMax ?? ""}
                      onChange={e => setSweepMax(e.target.value)}
                      style={{ background: "transparent", border: `1px solid ${C.border}`, borderRadius: 4, color: C.amber, fontFamily: FONT, fontSize: 12, padding: "6px 8px", width: "100%" }} />
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1, minWidth: 80 }}>
                    <span style={{ fontSize: 10, color: C.label, fontFamily: FONT, letterSpacing: 1.2, fontWeight: 700 }}>STEP {sweepMode === "2d" ? "X" : ""}</span>
                    <input type="number" aria-label="Sweep step" value={sweepStep ?? ""}
                      onChange={e => setSweepStep(e.target.value)}
                      style={{ background: "transparent", border: `1px solid ${C.border}`, borderRadius: 4, color: C.amber, fontFamily: FONT, fontSize: 12, padding: "6px 8px", width: "100%" }} />
                  </div>
                </div>

                {sweepMode === "2d" && sweepSelectedParamB && (
                  <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1, minWidth: 80 }}>
                      <span style={{ fontSize: 10, color: C.label, fontFamily: FONT, letterSpacing: 1.2, fontWeight: 700 }}>MIN Y</span>
                      <input type="number" aria-label="Sweep min Y" value={sweepMinB ?? ""}
                        onChange={e => setSweepMinB(e.target.value)}
                        style={{ background: "transparent", border: `1px solid ${C.border}`, borderRadius: 4, color: C.amber, fontFamily: FONT, fontSize: 12, padding: "6px 8px", width: "100%" }} />
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1, minWidth: 80 }}>
                      <span style={{ fontSize: 10, color: C.label, fontFamily: FONT, letterSpacing: 1.2, fontWeight: 700 }}>MAX Y</span>
                      <input type="number" aria-label="Sweep max Y" value={sweepMaxB ?? ""}
                        onChange={e => setSweepMaxB(e.target.value)}
                        style={{ background: "transparent", border: `1px solid ${C.border}`, borderRadius: 4, color: C.amber, fontFamily: FONT, fontSize: 12, padding: "6px 8px", width: "100%" }} />
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1, minWidth: 80 }}>
                      <span style={{ fontSize: 10, color: C.label, fontFamily: FONT, letterSpacing: 1.2, fontWeight: 700 }}>STEP Y</span>
                      <input type="number" aria-label="Sweep step Y" value={sweepStepB ?? ""}
                        onChange={e => setSweepStepB(e.target.value)}
                        style={{ background: "transparent", border: `1px solid ${C.border}`, borderRadius: 4, color: C.amber, fontFamily: FONT, fontSize: 12, padding: "6px 8px", width: "100%" }} />
                    </div>
                  </div>
                )}

                {sweepMode === "2d" && sweepSelectedParamB && (
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 11, color: C.muted, fontFamily: FONT }}>
                      {(() => {
                        try {
                          const grid = generate2DSweepValues(
                            { min: parseFloat(sweepMin) || 0, max: parseFloat(sweepMax) || 0, step: parseFloat(sweepStep) || 0 },
                            { min: parseFloat(sweepMinB) || 0, max: parseFloat(sweepMaxB) || 0, step: parseFloat(sweepStepB) || 0 },
                            replications
                          );
                          const rows = new Set(grid.map(p => p.valueA)).size;
                          const cols = new Set(grid.map(p => p.valueB)).size;
                          return `${rows} x ${cols} = ${grid.length} points (${grid.length * replications} replications)`;
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

                {sweepMode === "2d" && sweepStatus !== "running" && (
                  <div style={{ background: `${C.amber}12`, border: `1px solid ${C.amber}44`, borderRadius: 6, padding: "8px 10px", fontSize: 11, color: C.text, fontFamily: FONT, lineHeight: 1.5 }}>
                    ⚠ 2D sweeps run all grid points sequentially and can take 30–90s for larger grids. Consider a 1D sweep for quicker feedback.
                  </div>
                )}
                </>
                )}

                {/* F-Study: name + objective — saved with the study when the run completes */}
                <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: 2, minWidth: 160 }}>
                    <span style={{ fontSize: 10, color: C.label, fontFamily: FONT, letterSpacing: 1.2, fontWeight: 700 }}>STUDY NAME</span>
                    <input type="text" aria-label="Study name" value={studyName} placeholder={`Study — ${new Date().toLocaleDateString()}`}
                      onChange={e => setStudyName(e.target.value)}
                      style={{ background: "transparent", border: `1px solid ${C.border}`, borderRadius: 4, color: C.text, fontFamily: FONT, fontSize: 12, padding: "6px 8px", width: "100%" }} />
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1, minWidth: 140 }}>
                    <span style={{ fontSize: 10, color: C.label, fontFamily: FONT, letterSpacing: 1.2, fontWeight: 700 }}>OBJECTIVE</span>
                    <select aria-label="Objective metric" value={sweepKpiMetric} onChange={e => setSweepKpiMetric(e.target.value)}
                      style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 4, color: C.text, fontFamily: FONT, fontSize: 12, padding: "6px 8px" }}>
                      {CI_METRICS.map(m => <option key={m} value={m}>{METRIC_LABELS[m]}</option>)}
                    </select>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <span style={{ fontSize: 10, color: C.label, fontFamily: FONT, letterSpacing: 1.2, fontWeight: 700 }}>DIRECTION</span>
                    <div style={{ display: "flex", gap: 2, background: C.bg, borderRadius: 5, padding: 2 }}>
                      <button onClick={() => setSweepObjectiveDirection("min")}
                        style={{ background: sweepObjectiveDirection === "min" ? C.border : "transparent", border: "none", borderRadius: 4, color: sweepObjectiveDirection === "min" ? C.text : C.muted, cursor: "pointer", fontFamily: FONT, fontSize: 11, padding: "5px 10px" }}>
                        Minimise
                      </button>
                      <button onClick={() => setSweepObjectiveDirection("max")}
                        style={{ background: sweepObjectiveDirection === "max" ? C.border : "transparent", border: "none", borderRadius: 4, color: sweepObjectiveDirection === "max" ? C.text : C.muted, cursor: "pointer", fontFamily: FONT, fontSize: 11, padding: "5px 10px" }}>
                        Maximise
                      </button>
                    </div>
                  </div>
                </div>

                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <Btn variant="primary" onClick={handleRunSweep}
                    disabled={sweepStatus === "running" || hasAdmissionErrors
                      || (sweepMode === "2d" && (!sweepSelectedParam || !sweepSelectedParamB))
                      || ((sweepMode === "sampled" || sweepMode === "sequential") && (!sampledParams.length || sampledParams.some(p => !(numberDefault(p.max, 0) > numberDefault(p.min, 0)))))
                      || (sweepMode === "sequential" && !resolvedSeedValues)}>
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
                    style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 4, color: C.text, fontFamily: FONT, fontSize: 12, padding: "5px 8px" }}>
                    {CI_METRICS.map(m => <option key={m} value={m}>{METRIC_LABELS[m]}</option>)}
                    {sweepGoalKpiOptions(model.goals || []).map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
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
                            const goals = model.goals || [], feasible = evaluateSweepPointGoals(goals, pt.aggregateStats).feasible;
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

                {/* Sampled/sequential results: N-parameter table + sensitivity ranking */}
                {(sweepMode === "sampled" || sweepMode === "sequential") && (
                  <>
                    <SampledResultsTable
                      results={sweepResults}
                      parameters={currentStudyParameters()}
                      objectiveMetric={sweepKpiMetric}
                      objectiveDirection={sweepObjectiveDirection}
                      goals={model.goals || []}
                      evaluateFeasible={aggregateStats => evaluateSweepPointGoals(model.goals || [], aggregateStats).feasible}
                      onPromote={userId ? handlePromotePointToExperiment : undefined}
                    />
                    {sensitivityRanking && (
                      <SensitivityPanel method={sensitivityRanking.method} ranking={sensitivityRanking.ranking} />
                    )}
                    {userId && loadedStudyId && (
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <Btn small variant="ghost" disabled={proposeNextStudyStatus === "loading"} onClick={handleProposeNextStudy}>
                          {proposeNextStudyStatus === "loading" ? "Asking AI…" : "Propose next study"}
                        </Btn>
                        <span style={{ fontSize: 10, color: C.muted, fontFamily: FONT }}>
                          Narrows these ranges around the best point found — you review before running.
                        </span>
                      </div>
                    )}
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
                                <div style={{ fontSize: 11, fontWeight: 700, color: C.accent, fontFamily: FONT }}>{fmtMetric(m, s?.mean)}</div>
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
                          style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 4, color: C.text, fontFamily: FONT, fontSize: 12, padding: "5px 8px" }}>
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
                          style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 4, color: C.text, fontFamily: FONT, fontSize: 12, padding: "5px 8px" }}>
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
                          style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 4, color: C.text, fontFamily: FONT, fontSize: 12, padding: "5px 8px" }}>
                          {sweepResults.map((pt, i) => (
                            <option key={i} value={i}>{sweepSelectedParam?.label || "Value"} = {pt.value}</option>
                          ))}
                        </select>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1, minWidth: 120 }}>
                        <span style={{ fontSize: 10, color: C.label, fontFamily: FONT }}>Scenario B</span>
                        <select aria-label="Scenario B" value={comparisonIdxB ?? ""}
                          onChange={e => { setComparisonIdxB(parseInt(e.target.value) || null); setComparisonResult(null); }}
                          style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 4, color: C.text, fontFamily: FONT, fontSize: 12, padding: "5px 8px" }}>
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
      </div>
      </div>
      )}

      {/* ADR-016: Schedule selector — shown when model has more than one schedule */}
      {modelSchedules.length > 1 && !isRunning && (
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


      {executeSection === "run" && !isRunning && (
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
            {speedMultiplier >= 10 ? "Turbo" : `${speedMultiplier.toFixed(1)}×`}
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
        <Btn variant="ghost" onClick={doRunAll} disabled={hasAdmissionErrors || runBusy || saveStatus?.state === 'saving' || saveInProgressRef.current}
          title="Runs all replications at full speed without canvas animation — use Auto Run to watch entities move">
          {hasAdmissionErrors ? `✕ ${runAdmission.hardErrors.length} blocker${runAdmission.hardErrors.length !== 1 ? "s" : ""}` : "⚡ Batch Run"}
        </Btn>
        {canOpenResultsView && (
          <Btn variant="ghost" onClick={() => onGoToResults?.()} title="View results in the Results section">
            View Results →
          </Btn>
        )}
        <Btn variant={modelAssistantOpen ? "primary" : "ghost"} onClick={() => onOpenModelAssistant?.()}>Simulation Assistant</Btn>
        <div style={{ position: "relative", display: "flex", gap: 6 }}>
          {/* Unified Export ▾ popover */}
          <Btn variant="ghost" onClick={() => setShowExportPopover(v => !v)} disabled={!canExportResults}>Export ▾</Btn>
          {showExportPopover && (
            <>
              <div
                style={{ position: "fixed", inset: 0, zIndex: 99 }}
                onClick={() => setShowExportPopover(false)}
              />
              <ExportPopover
                model={model}
                results={results}
                replicationResults={replicationResults}
                aggregateStats={aggregateStats}
                config={{ ...exportConfig, batchStatus }}
                runMeta={exportRunMeta}
                onClose={() => setShowExportPopover(false)}
                onCreateReport
              />
            </>
          )}
        </div>
        {batchActive && <Btn variant="danger" onClick={cancelBatch} disabled={batchStatus === "cancelling"}>Cancel Batch</Btn>}
        {singleRunActive && <Btn variant="danger" onClick={cancelSingleRun} disabled={singleRunStatus === "cancelling"}>Cancel Run</Btn>}
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", minWidth: 0, maxWidth: "100%" }}>
          <span style={{ fontSize: 11, color: C.muted, fontFamily: FONT, overflowWrap: "anywhere", minWidth: 0 }}>
            {replications} rep{replications !== 1 ? "s" : ""} · {terminationMode === "time" ? `${maxSimTime} time units` : "condition stop"} · seed {seed}{warmupPeriod > 0 ? ` · warm-up ${warmupPeriod}` : ""}
          </span>
          <div ref={runOverridesAnchorRef} style={{ position: "relative" }}>
            <Btn small variant={effectiveOverrides.length ? "primary" : "ghost"}
              title="Change parameter values for this run only — no experiment or scenario needed"
              onClick={() => {
                if (sweepParams.length === 0) setSweepParams(enumerateSweepableParams(model));
                setShowRunOverridesPanel(v => !v);
              }}>
              🎛 {effectiveOverrides.length > 0 ? `${effectiveOverrides.length} param${effectiveOverrides.length !== 1 ? "s" : ""}` : "Adjust parameters"}
            </Btn>
            <ResponsivePanel open={showRunOverridesPanel} onClose={closeRunOverridesPanel}
              anchorRef={runOverridesAnchorRef} title="Adjust parameters" testId="run-overrides-panel"
              footer={
                <div style={{ display: "flex", gap: 8, justifyContent: "space-between", flexWrap: "wrap" }}>
                  <Btn small variant="ghost" disabled={!effectiveOverrides.length}
                    onClick={() => { setRunOverrides([]); setActiveExpOverrides([]); }}>Reset all</Btn>
                  {userId && (
                    <Btn small variant="ghost" disabled={!effectiveOverrides.length}
                      title="Keep these changes as a named, reusable Experiment"
                      onClick={() => {
                        setExpFormSeed({ overrides: effectiveOverrides.map(o => ({ path: o.paramConfig.path, value: String(o.value) })) });
                        setExecuteSection("saved-experiments");
                        closeRunOverridesPanel();
                      }}>Save as Experiment…</Btn>
                  )}
                </div>
              }>
              <div style={{ fontSize: 11, color: C.muted, fontFamily: FONT, lineHeight: 1.5 }}>
                Change parameter values for this run only — no experiment or scenario needed. Resets when you switch models or reload the page.
              </div>
              {activeExpOverrides.length > 0 && (
                <div style={{ fontSize: 10, color: C.muted, fontFamily: FONT }}>
                  {activeExpOverrides.length} loaded from an experiment; ad-hoc changes for the same parameter take priority.
                </div>
              )}
              <OverrideChipList overrides={runOverrides} setOverrides={setRunOverrides}
                sweepParams={sweepParams.length ? sweepParams : enumerateSweepableParams(model)}
                pickerOpen={runOverridesPickerOpen} setPickerOpen={setRunOverridesPickerOpen}
                extraAlreadyAdded={activeExpOverrides.map(o => o.paramConfig.path)}
                fillContainer />
            </ResponsivePanel>
          </div>
          <Btn small variant="ghost" onClick={() => setShowRunSetup(v => !v)}>{showRunSetup ? "▲ Hide" : "⚙ Edit"}</Btn>
        </div>
      </div>
      )}

      {executeSection === "run" && isRunning && (
      <div style={{ background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 14px", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <Btn variant="success" onClick={doStep} disabled={mode === "done" || runBusy}> Step</Btn>
        <Btn variant={autoRunning ? "danger" : "amber"} onClick={toggleAuto} disabled={hasValidationErrors || runBusy}>{autoRunning ? "⏹ Stop Auto" : "Auto Run"}</Btn>
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <span style={{ fontSize: 10, color: C.muted, fontFamily: FONT, whiteSpace: "nowrap" }}>
            {speedMultiplier >= 10 ? "Turbo" : `${speedMultiplier.toFixed(1)}×`}
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
        {liveFlags.length > 0 ? (
          <div ref={liveFlagsAnchorRef} style={{ position: "relative" }}>
            <button type="button" onClick={() => setLiveFlagsOpen(v => !v)} style={{
              background: liveFlags.some(f => f.severity === "critical") ? C.red + "22" : C.amber + "22",
              border: `1px solid ${liveFlags.some(f => f.severity === "critical") ? C.red + "44" : C.amber + "44"}`,
              borderRadius: 999, padding: "2px 8px", fontSize: 10, fontWeight: 700,
              color: liveFlags.some(f => f.severity === "critical") ? C.red : C.amber,
              fontFamily: FONT, cursor: "pointer", whiteSpace: "nowrap", lineHeight: 1.5,
            }}>{"\u26A0"} {liveFlags.length}</button>
            <ResponsivePanel open={liveFlagsOpen} onClose={closeLiveFlags} anchorRef={liveFlagsAnchorRef}
              title="Live warnings" width={360} testId="live-flags-panel">
              {liveFlags.map((f, i) => {
                const isCritical = f.severity === "critical";
                return (
                  <div key={i} style={{
                    borderLeft: `2px solid ${isCritical ? C.red : C.amber}`,
                    paddingLeft: 8, fontSize: 10, fontFamily: FONT,
                    color: isCritical ? C.red : C.amber, lineHeight: 1.4, overflowWrap: "anywhere",
                  }}>
                    {f.resource && <span style={{ color: C.muted }}>{f.resource}: </span>}
                    {f.message}
                  </div>
                );
              })}
            </ResponsivePanel>
          </div>
        ) : null}
        <Btn variant="danger" onClick={() => {
          stopAuto();
          if (batchActive) cancelBatch();
          if (singleRunActive) cancelSingleRun();
          setMode("idle");
          setLiveFlags([]);
        }}>✕ Cancel</Btn>
        {batchActive && <Btn variant="danger" onClick={cancelBatch} disabled={batchStatus === "cancelling"}>Cancel Batch</Btn>}
        {singleRunActive && <Btn variant="danger" onClick={cancelSingleRun} disabled={singleRunStatus === "cancelling"}>Cancel Run</Btn>}
        <span style={{ fontSize: 11, color: C.muted, fontFamily: FONT, whiteSpace: "nowrap", marginLeft: "auto" }}>
          {replications} rep{replications !== 1 ? "s" : ""} · {terminationMode === "time" ? `${maxSimTime} time units` : "condition stop"} · seed {seed}{warmupPeriod > 0 ? ` · warm-up ${warmupPeriod}` : ""}
        </span>
      </div>
      )}

      {executeSection === "run" && (
        <>
      {!hideRunReadiness && !isRunning && (
        <RunReadinessPanel runAdmission={runAdmission} complexityEstimate={complexityEstimate} runLabel={runLabel}
          lastRunEstimateAccuracy={lastRunEstimateAccuracy} readinessExpanded={readinessExpanded} setReadinessExpanded={setReadinessExpanded}
          showEstimate={showEstimate} setShowEstimate={setShowEstimate} />
      )}

      <RunStatusBanners modelCheckerOpen={modelCheckerOpen} modelCheckerIssues={modelCheckerIssues} setModelCheckerOpen={setModelCheckerOpen}
        phaseCTruncated={phaseCTruncated} model={model} totalReplicationCount={totalReplicationCount} truncatedReplicationCount={truncatedReplicationCount}
        cycleLimitReached={cycleLimitReached} scanLimitReplicationCount={scanLimitReplicationCount} runAdmission={runAdmission}
        saveStatus={saveStatus} isModelModified={isModelModified} singleRunStatus={singleRunStatus} singleRunProgress={singleRunProgress} />

      <BatchResultsPanel batchStatus={batchStatus} batchProgress={batchProgress} replications={replications} replicationResults={replicationResults}
        aggregateStats={aggregateStats} model={model} replicationDetailOpen={replicationDetailOpen} setReplicationDetailOpen={setReplicationDetailOpen}
        runHistoryStatus={runHistoryStatus} runHistoryError={runHistoryError} recentSavedRuns={recentSavedRuns}
        canOpenResultsView={canOpenResultsView} onGoToResults={onGoToResults} />

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
                selectedNodeLabel={selectedNodeLabel}
                onClearFilter={() => setSelectedNodeLabel(null)}
                selectedEntityId={selectedEntityId}
                onEntitySelect={setSelectedEntityId}
                onNodeSelect={setSelectedNodeLabel}
                timeSeries={liveTimeSeries ?? results?.timeSeries}
                waitDist={liveWaitDist ?? results?.waitDist}
                stateChanges={stateChanges}
              />
            </>
          );
        }
        return <VisualView snap={currentSnap} model={model} summary={results?.summary} />;
      })()}
        </>
      )}

      <ChartDataChoiceDialog
        isOpen={!!chartChoiceDialog}
        messages={chartChoiceDialog?.messages}
        onCancel={() => resolveChartDataChoice("cancel")}
        onProceedWithoutCharts={() => resolveChartDataChoice("without")}
        onProceedWithCharts={() => resolveChartDataChoice("force")}
      />
      {confirmDialog}
    </div>
  );
};

export {
  buildEntityJourneys,
  buildResultsCsv,
  buildResultsExportPayload,
  CustomerToken,
  ExecutePanel,
  VisualView,
};
