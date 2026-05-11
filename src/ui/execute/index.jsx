// ui/execute/index.jsx — ExecutePanel (slimmed, imports from sibling modules)

import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
const ExecuteCanvas = lazy(() => import("./ExecuteCanvas.jsx").then(m => ({ default: m.ExecuteCanvas })));
import { C, FONT } from "../shared/tokens.js";
import { Tag, PhaseTag, Btn, SH, InfoBox } from "../shared/components.jsx";
import { slugifyResultName, timestampForFilename } from "../shared/utils.js";
import { buildEngine } from "../../engine/index.js";
import { mulberry32 } from "../../engine/distributions.js";
import { runReplications } from "../../engine/replication-runner.js";
import { compareScenarios, detectWarmupWelch, summarizeReplicationResults } from "../../engine/statistics.js";
import { fetchRunHistory, saveSimulationRun, fetchUserSettings, saveUserSettings, createShareLink, listShareLinks, revokeShareLink, saveAiInsights } from "../../db/models.js";
import { saveLocalRun, fetchLocalRunHistory } from "../../db/local.js";
import { BottomPanel } from "./BottomPanel.jsx";
import { CustomerToken, VisualView } from "./VisualView.jsx";
import { DEFAULT_KPI_SLOTS } from "./execute-constants.js";
import { validateModel } from "../../engine/validation.js";
import { enumerateSweepableParams, generate2DSweepValues } from "../../engine/sweep-params.js";
import { runSweep, run2DSweep } from "../../engine/sweep-runner.js";
import { ConditionBuilder } from "../editors/index.jsx";
import { qrSvg } from "../share/qr.js";
import { CI_METRICS, METRIC_LABELS, fmt, makeBatchId, makeBatchResult, buildResultsExportPayload, buildResultsCsv, downloadTextFile, makeRunLabel, makeRunPromptPayload, makeSavedRunPromptPayload } from "./executeHelpers.js";
import { SweepChart, WarmupChart, Sweep2DGrid } from "./SweepViews.jsx";
import { AiAssistantPanel } from "./AiAssistantPanel.jsx";

const ExecutePanel = ({ model, modelId, userId, onRunSaved, onResultsReady, autoRun = false, analyseRun = null, onClearAnalyse }) => {
  const [mode, setMode] = useState("idle");
  const [currentSnap, setCurrentSnap] = useState(null);
  const [log, setLog] = useState([]);
  const [view, setView] = useState("visual");
  const [autoSpeed, setAutoSpeed] = useState(400);
  const [autoRunning, setAutoRunning] = useState(false);
  const [saveStatus, setSaveStatus] = useState(null);
  const [phaseCTruncated, setPhaseCTruncated] = useState(false);
  const [results, setResults] = useState(null);
  const [batchStatus, setBatchStatus] = useState("idle");
  const [batchProgress, setBatchProgress] = useState(null);
  const [replicationResults, setReplicationResults] = useState([]);
  const [aggregateStats, setAggregateStats] = useState({});
  const [seed, setSeed] = useState(() => Math.floor(mulberry32(Date.now())() * 1e9));
  const [warmupPeriod, setWarmupPeriod] = useState(0);
  const [warmupDetection, setWarmupDetection] = useState(null);
  const [maxSimTime, setMaxSimTime] = useState(500);
  const [terminationMode, setTerminationMode] = useState("time");
  const [terminationCondition, setTerminationCondition] = useState(null);
  const [replications, setReplications] = useState(1);
  const [runLabel, setRunLabel] = useState("");
  const [aiPanelOpen, setAiPanelOpen] = useState(false);
  const [savedRunHistory, setSavedRunHistory] = useState([]);
  const [runHistoryStatus, setRunHistoryStatus] = useState("idle");
  const [runHistoryError, setRunHistoryError] = useState("");
  const [sweepOpen, setSweepOpen] = useState(false);
  const [sweepParams, setSweepParams] = useState([]);
  const [sweepSelectedParam, setSweepSelectedParam] = useState(null);
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
  const sweepRunnerRef = useRef(null);
  const runSeedRef = useRef(seed);
  const engineRef = useRef(null);
  const autoRef = useRef(null);
  const runnerRef = useRef(null);
  const saveInProgressRef = useRef(false);
  const [animationEnabled, setAnimationEnabled] = useState(true);
  const [collectTimeSeries, setCollectTimeSeries] = useState(true);
  const [kpiSlots, setKpiSlots] = useState(DEFAULT_KPI_SLOTS);
  const [speedMultiplier, setSpeedMultiplier] = useState(1);
  const [selectedNodeLabel, setSelectedNodeLabel] = useState(null);
  const [shareLinks, setShareLinks] = useState([]);
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareConfig, setShareConfig] = useState(() => ({
    title: "",
    pinnedWidgets: ["summary", "queues", "resources", "charts"],
  }));
  const [shareSaving, setShareSaving] = useState(false);
  const [justCreatedLink, setJustCreatedLink] = useState(null);
  const [shareLinksLoading, setShareLinksLoading] = useState(false);
  const [qrToken, setQrToken] = useState(null);
  const qrRef = useRef(null);
  const [latestRunId, setLatestRunId] = useState(null);
  const effectiveAutoSpeed = useMemo(
    () => Math.max(40, Math.round(400 / speedMultiplier)),
    [speedMultiplier]
  );

  const validation = useMemo(() => {
    const v = validateModel({
      ...model,
      maxSimTime: terminationMode === 'time' ? maxSimTime : 0,
      terminationCondition: terminationMode === 'condition' ? terminationCondition : null
    });

    if (terminationMode === 'time' && warmupPeriod >= maxSimTime) {
      v.errors.push({ code: 'V14', message: 'Warm-up period must be less than the run duration.', tab: 'execute' });
    }
    if (!Number.isInteger(replications) || replications < 1) {
      v.errors.push({ code: 'V15', message: 'Replication count must be a positive integer.', tab: 'execute' });
    }

    return v;
  }, [model, warmupPeriod, maxSimTime, terminationMode, terminationCondition, replications]);
  const hasErrors = validation.errors.length > 0;

  const initEngine = useCallback(() => {
    if (hasErrors) return;
    runSeedRef.current = seed;
    engineRef.current = buildEngine(
      model,
      seed,
      warmupPeriod,
      terminationMode === 'time' ? maxSimTime : null,
      terminationMode === 'condition' ? terminationCondition : null,
      5000, 500,
      collectTimeSeries
    );
    setCurrentSnap(engineRef.current.getSnap());
    setLog([{ phase: "INIT", time: 0, message: `Simulation initialized  (seed: ${seed}, warmup: ${warmupPeriod})` }]);
    setMode("stepping");
    setSaveStatus(null);
    setPhaseCTruncated(false);
    setResults(null);
    onResultsReady?.(null);
    setBatchStatus("idle");
    setBatchProgress(null);
    setReplicationResults([]);
    setAggregateStats({});
  }, [model, seed, hasErrors, warmupPeriod, maxSimTime, terminationMode, terminationCondition, collectTimeSeries]);

  const stopAuto = useCallback(() => {
    if (autoRef.current) {
      clearInterval(autoRef.current);
      autoRef.current = null;
      setAutoRunning(false);
    }
  }, []);

  const doStep = useCallback(() => {
    if (!engineRef.current) return;
    const r = engineRef.current.step();
    setCurrentSnap(r.snap);
    setLog(prev => [...prev, ...(r.cycleLog || [])]);
    if (r.phaseCTruncated) setPhaseCTruncated(true);

    if (r.done) {
      setMode("done");
      stopAuto();
      const summary = engineRef.current.getSummary();
      const fullResult = {
        snap: r.snap,
        summary: {
          ...summary,
          total: r.snap?.entities?.filter(e => e.role !== 'server').length || 0,
          served: r.snap?.served || 0,
          reneged: r.snap?.reneged || 0,
        },
        timeSeries:    engineRef.current.getTimeSeries?.(),
        waitDist:      engineRef.current.getWaitDist?.(),
        entitySummary: engineRef.current.getEntitySummary?.(),
      };
      setResults(fullResult);
      onResultsReady?.(fullResult);
      if (modelId) {
        setSaveStatus({ state: 'saving', message: 'Saving results...' });
        setLog(prev => [...prev, { phase: "SAVE", time: r.snap.clock, message: "💾 Auto-saving simulation results..." }]);
        const config = { seed: runSeedRef.current, runLabel, warmupPeriod, maxTime: terminationMode === 'time' ? maxSimTime : null };
        const save = userId ? saveSimulationRun(modelId, userId, fullResult, config) : saveLocalRun(modelId, fullResult, config);
        save
          .then((runId) => {
            if (runId) setLatestRunId(runId);
            setSaveStatus({ state: 'success', message: '✓ Saved successfully!' });
            setLog(prev => [...prev, { phase: "SAVE", time: r.snap.clock, message: "✅ History record completed." }]);
            onRunSaved?.();
          })
          .catch(e => {
            setSaveStatus({ state: 'error', message: `✗ Save failed: ${e.message}` });
            setLog(prev => [...prev, { phase: "ERROR", time: r.snap.clock, message: `❌ Save error: ${e.message}` }]);
          });
      }
    }
  }, [userId, modelId, runLabel, warmupPeriod, maxSimTime, terminationMode, stopAuto, onRunSaved, onResultsReady]);

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
    if (hasErrors) return;
    if (saveInProgressRef.current) return;
    if (!modelId) {
      setSaveStatus({ state: 'error', message: '✗ No model to run' });
      return;
    }

    const runSeed = seed;
    const maxTimeForRun = terminationMode === 'time' ? maxSimTime : null;
    const stopConditionForRun = terminationMode === 'condition' ? terminationCondition : null;

    if (replications > 1) {
      const batchId = makeBatchId();
      const completedPayloads = [];

      setMode("running");
      setCurrentSnap(null);
      setResults(null);
      onResultsReady?.(null);
      setLog([{ phase: "INIT", time: 0, message: `Replication batch started  (N=${replications}, base seed: ${runSeed})` }]);
      setSaveStatus(null);
      setPhaseCTruncated(false);
      setBatchStatus("running");
      setBatchProgress({ completed: 0, total: replications, running: 0, pending: replications, cancelled: false, workerCount: 0 });
      setReplicationResults([]);
      setAggregateStats({});

      runnerRef.current = runReplications({
        model,
        replications,
        baseSeed: runSeed,
        warmupPeriod,
        maxSimTime: maxTimeForRun,
        terminationCondition: stopConditionForRun,
        collectTimeSeries,
        onProgress: progress => setBatchProgress(progress),
        onReplicationComplete: payload => {
          completedPayloads[payload.replicationIndex] = payload;
          const ordered = completedPayloads.filter(Boolean);
          const nextStats = summarizeReplicationResults(ordered, CI_METRICS);

          setReplicationResults(ordered);
          setAggregateStats(nextStats);
          setCurrentSnap(payload.result?.snap || null);
          setLog(prev => [
            ...prev,
            {
              phase: "REP",
              time: payload.result?.finalTime || 0,
              message: `Replication ${payload.replicationIndex + 1}/${replications} complete  (seed: ${payload.seed})`,
            },
          ]);
          if (payload.result?.summary?.phaseCTruncated) setPhaseCTruncated(true);
        },
        onComplete: async payloads => {
          saveInProgressRef.current = true;
          try {
            const ordered = payloads.filter(Boolean);
            const stats = summarizeReplicationResults(ordered, CI_METRICS);
            const batchResult = makeBatchResult(ordered, stats, maxTimeForRun, warmupPeriod);

            setBatchStatus("complete");
            setResults(batchResult);
            onResultsReady?.(batchResult);
            setAggregateStats(stats);
            setSaveStatus({ state: 'saving', message: 'Saving replication batch...' });

            try {
              const batchConfig = {
                seed: runSeed, runLabel, replications, warmupPeriod, maxTime: maxTimeForRun, batchId,
                aggregateStats: stats,
                replicationResults: ordered.map(payload => ({
                  replicationIndex: payload.replicationIndex, seed: payload.seed,
                  summary: payload.result?.summary || {}, finalTime: payload.result?.finalTime,
                })),
              };
              if (userId) {
                const runId = await saveSimulationRun(modelId, userId, batchResult, batchConfig);
                if (runId) setLatestRunId(runId);
              } else {
                saveLocalRun(modelId, batchResult, batchConfig);
              }
              setSaveStatus({ state: 'success', message: '✓ Replication batch saved successfully!' });
              setLog(prev => [...prev, { phase: "SAVE", time: batchResult.snap.clock, message: "Replication batch saved." }]);
              onRunSaved?.();
            } catch (saveError) {
              setSaveStatus({ state: 'error', message: `✗ Failed to save batch: ${saveError.message}` });
              setLog(prev => [...prev, { phase: "ERROR", time: batchResult.snap.clock, message: `❌ Database error: ${saveError.message}` }]);
            }
          } catch (setupError) {
            setBatchStatus("complete");
            setSaveStatus({ state: 'error', message: `✗ Batch error: ${setupError.message}` });
          } finally {
            saveInProgressRef.current = false;
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
    setLog([{ phase: "INIT", time: 0, message: `Run started  (seed: ${runSeed})` }]);
    setMode("running");

    const engine = buildEngine(
      model,
      runSeed,
      warmupPeriod,
      maxTimeForRun,
      stopConditionForRun,
      5000, 500,
      collectTimeSeries
    );
    const result = engine.runAll();

    setCurrentSnap(result.snap);
    setResults(result);
    onResultsReady?.(result);
    setLog(result.log);
    setMode("done");
    if (result.summary?.phaseCTruncated) setPhaseCTruncated(true);

    saveInProgressRef.current = true;
    setSaveStatus({ state: 'saving', message: 'Saving results...' });
    setLog(prev => [...prev, { phase: "SAVE", time: result.snap.clock, message: "💾 Committing simulation history to database..." }]);

    try {
      const config = { seed: runSeed, runLabel, replications: 1, warmupPeriod, maxTime: maxTimeForRun };
      const save = userId ? saveSimulationRun(modelId, userId, result, config) : saveLocalRun(modelId, result, config);
      const runId = await save;
      if (runId) setLatestRunId(runId);
      setSaveStatus({ state: 'success', message: '✓ History saved successfully!' });
      setLog(prev => [...prev, { phase: "SAVE", time: result.snap.clock, message: "✅ History commit complete." }]);
      onRunSaved?.();
    } catch (e) {
      setSaveStatus({ state: 'error', message: `✗ Failed to save: ${e.message}` });
      setLog(prev => [...prev, { phase: "ERROR", time: result.snap.clock, message: `❌ Database error: ${e.message}` }]);
    } finally {
      saveInProgressRef.current = false;
    }
  }, [model, userId, modelId, seed, runLabel, hasErrors, warmupPeriod, maxSimTime, terminationMode, terminationCondition, replications, collectTimeSeries, stopAuto, onRunSaved, onResultsReady]);

  const cancelBatch = useCallback(() => {
    if (!runnerRef.current) return;
    setBatchStatus("cancelling");
    runnerRef.current.cancel();
  }, []);

  const toggleAuto = () => {
    if (autoRunning) {
      stopAuto();
    } else {
      if (mode === "idle") initEngine();
      setAutoRunning(true);
    }
  };

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
    if (autoRun && !autoRunRef.current && !hasErrors && modelId) {
      autoRunRef.current = true;
      doRunAll();
    }
  }, [autoRun, hasErrors, modelId, doRunAll]);

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
    if (!aiPanelOpen || !modelId) return;
    let cancelled = false;
    setRunHistoryStatus("loading");
    setRunHistoryError("");
    const fetcher = userId ? fetchRunHistory : fetchLocalRunHistory;
    fetcher(modelId)
      .then(rows => {
        if (cancelled) return;
        setSavedRunHistory(rows || []);
        setRunHistoryStatus("loaded");
      })
      .catch(error => {
        if (cancelled) return;
        setSavedRunHistory([]);
        setRunHistoryError(error?.message || "could not load run history");
        setRunHistoryStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [aiPanelOpen, modelId]);

  // Handle Analyse button from History tab — load saved run into AI panel
  useEffect(() => {
    if (!analyseRun || !modelId) return;
    const resultsJson = analyseRun.results_json || {};
    if (resultsJson.summary) {
      setResults(resultsJson);
      onResultsReady?.(resultsJson);
      setAggregateStats(resultsJson.aggregateStats || {});
      setBatchStatus("complete");
      setReplicationResults(resultsJson.replicationResults || []);
    }
    setAiPanelOpen(true);
    onClearAnalyse?.();
  }, [analyseRun, modelId, onClearAnalyse, onResultsReady]);

  const batchActive = batchStatus === "running" || batchStatus === "cancelling";
  const partialBatchStatus = batchStatus === "cancelled" || batchStatus === "error";
  const canExportResults = Boolean(results || (partialBatchStatus && replicationResults.length));
  const exportConfig = useMemo(() => ({
    modelId,
    seed: runSeedRef.current,
    runLabel: runLabel.trim() || null,
    replications,
    warmupPeriod,
    maxSimTime: terminationMode === "time" ? maxSimTime : null,
    terminationMode,
    terminationCondition: terminationMode === "condition" ? terminationCondition : null,
  }), [modelId, runLabel, replications, warmupPeriod, maxSimTime, terminationMode, terminationCondition]);
  const exportPartial = partialBatchStatus && replicationResults.length > 0;
  const resultFilenameBase = `des-studio-results-${slugifyResultName(model.name)}${exportPartial ? "-partial" : ""}-${timestampForFilename()}`;
  const comparisonRuns = useMemo(() => {
    const savedRuns = savedRunHistory.map(row => ({
      id: `saved-${row.id}`,
      label: row.run_label || `Saved ${row.ran_at ? new Date(row.ran_at).toLocaleString() : row.id}`,
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

  const exportResultsJson = useCallback(() => {
    const payload = buildResultsExportPayload({
      model,
      results,
      replicationResults,
      aggregateStats,
      config: exportConfig,
      batchStatus,
    });
    downloadTextFile(
      JSON.stringify(payload, null, 2),
      `${resultFilenameBase}.json`,
      "application/json"
    );
  }, [model, results, replicationResults, aggregateStats, exportConfig, batchStatus, resultFilenameBase]);

  const exportResultsCsv = useCallback(() => {
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
  }, [results, replicationResults, aggregateStats, exportConfig, resultFilenameBase]);

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
      const result = await createShareLink(latestRunId, userId, shareConfig);
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
    if (hasErrors) return;
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
        collectTimeSeries,
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
        collectTimeSeries,
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
      terminationMode, terminationCondition, collectTimeSeries, hasErrors]);

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
    <div style={{ display: "flex", alignItems: "stretch", gap: 14 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14, flex: 1, minWidth: 0 }}>
      {/* Experiment Controls Section */}
      <div style={{ background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 8, padding: 16, display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 10, color: C.label, fontFamily: FONT, letterSpacing: 1.2, fontWeight: 700 }}>WARM-UP PERIOD</span>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <input
                aria-label="Warm-up period"
                type="number"
                value={warmupPeriod}
                onChange={e => { setWarmupPeriod(parseFloat(e.target.value) || 0); setWarmupDetection(null); }}
                style={{ width: 80, background: "transparent", border: `1px solid ${C.border}`,
                  borderRadius: 4, color: C.amber, fontFamily: FONT, fontSize: 12,
                  padding: "6px 8px", outline: "none" }}
              />
              <Btn small variant="ghost" onClick={handleDetectWarmup} disabled={replicationResults.length === 0}>
                Detect
              </Btn>
            </div>
            {warmupDetection && warmupDetection.series.length > 0 && (
              <div style={{ marginTop: 4, display: "flex", flexDirection: "column", gap: 4 }}>
                <div style={{ fontSize: 10, color: C.accent, fontFamily: FONT }}>
                  {warmupDetection.explanation}
                </div>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <Btn small variant="primary" onClick={() => {
                    setWarmupPeriod(Math.round(warmupDetection.truncationPoint));
                    setWarmupDetection(null);
                  }}>
                    Apply t={Math.round(warmupDetection.truncationPoint)}
                  </Btn>
                  <Btn small variant="ghost" onClick={() => setWarmupDetection(null)}>Dismiss</Btn>
                </div>
                {warmupDetection.series.length > 1 && (
                  <WarmupChart series={warmupDetection.series} truncationPoint={warmupDetection.truncationPoint} />
                )}
              </div>
            )}
            {warmupDetection && warmupDetection.series.length === 0 && (
              <div style={{ marginTop: 4, fontSize: 10, color: C.muted, fontFamily: FONT }}>
                {warmupDetection.explanation}
              </div>
            )}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 10, color: C.label, fontFamily: FONT, letterSpacing: 1.2, fontWeight: 700 }}>REPLICATIONS</span>
            <input
              aria-label="Replication count"
              type="number"
              value={replications}
              onChange={e => setReplications(parseInt(e.target.value) || 0)}
              style={{ width: 80, background: "transparent", border: `1px solid ${C.border}`,
                borderRadius: 4, color: C.amber, fontFamily: FONT, fontSize: 12,
                padding: "6px 8px", outline: "none" }}
            />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 10, color: C.label, fontFamily: FONT, letterSpacing: 1.2, fontWeight: 700 }}>SEED</span>
            <div style={{ display: "flex", gap: 6 }}>
              <input
                aria-label="Simulation seed"
                type="number"
                value={seed}
                onChange={e => setSeed(parseInt(e.target.value) || 0)}
                style={{ width: 120, background: "transparent", border: `1px solid ${C.border}`,
                  borderRadius: 4, color: C.amber, fontFamily: FONT, fontSize: 12,
                  padding: "6px 8px", outline: "none" }}
              />
              <Btn small variant="ghost" onClick={() => setSeed(Math.floor(Math.random() * 1e9))}>rand</Btn>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 10, color: C.label, fontFamily: FONT, letterSpacing: 1.2, fontWeight: 700 }}>RUN LABEL</span>
            <input
              aria-label="Run label"
              value={runLabel}
              onChange={e => setRunLabel(e.target.value)}
              placeholder="Baseline"
              style={{ width: 160, background: "transparent", border: `1px solid ${C.border}`,
                borderRadius: 4, color: C.text, fontFamily: FONT, fontSize: 12,
                padding: "6px 8px", outline: "none" }}
            />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 10, color: C.label, fontFamily: FONT, letterSpacing: 1.2, fontWeight: 700 }}>TERMINATION MODE</span>
            <div style={{ display: "flex", gap: 12, alignItems: "center", height: 32 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 12, color: C.text, fontFamily: FONT }}>
                <input type="radio" name="terminationMode" checked={terminationMode === "time"} onChange={() => setTerminationMode("time")} />
                Time-based
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 12, color: C.text, fontFamily: FONT }}>
                <input type="radio" name="terminationMode" checked={terminationMode === "condition"} onChange={() => setTerminationMode("condition")} />
                Condition-based
              </label>
            </div>
          </div>

          {terminationMode === "time" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={{ fontSize: 10, color: C.label, fontFamily: FONT, letterSpacing: 1.2, fontWeight: 700 }}>RUN DURATION</span>
              <input
                aria-label="Run duration"
                type="number"
                value={maxSimTime}
                onChange={e => setMaxSimTime(parseFloat(e.target.value) || 0)}
                style={{ width: 100, background: "transparent", border: `1px solid ${C.border}`,
                  borderRadius: 4, color: C.amber, fontFamily: FONT, fontSize: 12,
                  padding: "6px 8px", outline: "none" }}
              />
            </div>
          )}
        </div>

        {terminationMode === "condition" && (
          <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 14 }}>
            <span style={{ fontSize: 10, color: C.label, fontFamily: FONT, letterSpacing: 1.2, fontWeight: 700, display: "block", marginBottom: 8 }}>STOP CONDITION</span>
            <ConditionBuilder
              condition={terminationCondition}
              entityTypes={model.entityTypes}
              stateVariables={model.stateVariables}
              queues={model.queues}
              onChange={setTerminationCondition}
            />
          </div>
        )}
      </div>

      {/* Parametric Sweep Section */}
      <div style={{ background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden" }}>
        <div
          onClick={() => {
            if (!sweepOpen) setSweepParams(enumerateSweepableParams(model));
            setSweepOpen(o => !o);
          }}
          style={{ padding: "12px 16px", cursor: "pointer", display: "flex", alignItems: "center", gap: 10, userSelect: "none" }}>
          <span style={{ fontSize: 14, color: sweepOpen ? C.accent : C.muted }}>{sweepOpen ? "▼" : "▶"}</span>
          <span style={{ fontSize: 10, color: C.muted, fontFamily: FONT, letterSpacing: 1.2, fontWeight: 700 }}>PARAMETRIC SWEEP</span>
          {sweepStatus === "running" && (
            <span style={{ fontSize: 10, color: C.amber, fontFamily: FONT }}>Running sweep...</span>
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
              <select
                aria-label={sweepMode === "2d" ? "Sweep parameter X" : "Sweep parameter"}
                value={sweepSelectedParam ? `${sweepSelectedParam.type}|${sweepSelectedParam.targetId}|${sweepSelectedParam.paramKey || ""}` : ""}
                onChange={e => {
                  const val = e.target.value;
                  if (!val) { setSweepSelectedParam(null); return; }
                  const [type, targetId, paramKey] = val.split("|");
                  const found = sweepParams.find(p => p.type === type && p.targetId === targetId && (p.paramKey || "") === paramKey);
                  setSweepSelectedParam(found || null);
                  if (found) {
                    const cv = typeof found.currentValue === "number" ? found.currentValue : 1;
                    setSweepMin(cv);
                    setSweepMax(cv * 3);
                    setSweepStep(cv > 0 ? cv : 1);
                  }
                }}
                style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 4, color: C.text, fontFamily: FONT, fontSize: 12, padding: "7px 8px", outline: "none", width: "100%" }}>
                <option value="">Select a parameter...</option>
                <optgroup label="Entity Type Count">
                  {sweepParams.filter(p => p.type === "entityTypeCount").map(p => (
                    <option key={p.path} value={`${p.type}|${p.targetId}|`}>{p.label} ({p.currentValue})</option>
                  ))}
                </optgroup>
                <optgroup label="Queue Capacity">
                  {sweepParams.filter(p => p.type === "queueCapacity").map(p => (
                    <option key={p.path} value={`${p.type}|${p.targetId}|`}>{p.label} ({p.currentValue === Infinity ? "∞" : p.currentValue})</option>
                  ))}
                </optgroup>
                <optgroup label="Distribution Parameters (B-Events)">
                  {sweepParams.filter(p => p.type === "bEventDistParam").map(p => (
                    <option key={p.path} value={`${p.type}|${p.targetId}|${p.paramKey || ""}`}>{p.label} ({p.currentValue})</option>
                  ))}
                </optgroup>
                <optgroup label="Distribution Parameters (C-Events)">
                  {sweepParams.filter(p => p.type === "cEventDistParam").map(p => (
                    <option key={p.path} value={`${p.type}|${p.targetId}|${p.paramKey || ""}`}>{p.label} ({p.currentValue})</option>
                  ))}
                </optgroup>
                <optgroup label="State Variables">
                  {sweepParams.filter(p => p.type === "stateVarInit").map(p => (
                    <option key={p.path} value={`${p.type}|${p.targetId}|`}>{p.label} ({p.currentValue})</option>
                  ))}
                </optgroup>
              </select>
            </div>

            {sweepMode === "2d" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={{ fontSize: 10, color: C.label, fontFamily: FONT, letterSpacing: 1.2, fontWeight: 700 }}>PARAMETER Y</span>
                <select
                  aria-label="Sweep parameter Y"
                  value={sweepSelectedParamB ? `${sweepSelectedParamB.type}|${sweepSelectedParamB.targetId}|${sweepSelectedParamB.paramKey || ""}` : ""}
                  onChange={e => {
                    const val = e.target.value;
                    if (!val) { setSweepSelectedParamB(null); return; }
                    const [type, targetId, paramKey] = val.split("|");
                    const found = sweepParams.find(p => p.type === type && p.targetId === targetId && (p.paramKey || "") === paramKey);
                    setSweepSelectedParamB(found || null);
                    if (found) {
                      const cv = typeof found.currentValue === "number" ? found.currentValue : 1;
                      setSweepMinB(cv);
                      setSweepMaxB(cv * 3);
                      setSweepStepB(cv > 0 ? cv : 1);
                    }
                  }}
                  style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 4, color: C.text, fontFamily: FONT, fontSize: 12, padding: "7px 8px", outline: "none", width: "100%" }}>
                  <option value="">Select a parameter...</option>
                  <optgroup label="Entity Type Count">
                    {sweepParams.filter(p => p.type === "entityTypeCount").map(p => (
                      <option key={p.path + "_b"} value={`${p.type}|${p.targetId}|`}>{p.label} ({p.currentValue})</option>
                    ))}
                  </optgroup>
                  <optgroup label="Queue Capacity">
                    {sweepParams.filter(p => p.type === "queueCapacity").map(p => (
                      <option key={p.path + "_b"} value={`${p.type}|${p.targetId}|`}>{p.label} ({p.currentValue === Infinity ? "∞" : p.currentValue})</option>
                    ))}
                  </optgroup>
                  <optgroup label="Distribution Parameters (B-Events)">
                    {sweepParams.filter(p => p.type === "bEventDistParam").map(p => (
                      <option key={p.path + "_b"} value={`${p.type}|${p.targetId}|${p.paramKey || ""}`}>{p.label} ({p.currentValue})</option>
                    ))}
                  </optgroup>
                  <optgroup label="Distribution Parameters (C-Events)">
                    {sweepParams.filter(p => p.type === "cEventDistParam").map(p => (
                      <option key={p.path + "_b"} value={`${p.type}|${p.targetId}|${p.paramKey || ""}`}>{p.label} ({p.currentValue})</option>
                    ))}
                  </optgroup>
                  <optgroup label="State Variables">
                    {sweepParams.filter(p => p.type === "stateVarInit").map(p => (
                      <option key={p.path + "_b"} value={`${p.type}|${p.targetId}|`}>{p.label} ({p.currentValue})</option>
                    ))}
                  </optgroup>
                </select>
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
                    disabled={sweepStatus === "running" || hasErrors || (sweepMode === "2d" && (!sweepSelectedParam || !sweepSelectedParamB))}>
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
                    <SweepChart results={sweepResults} metric={sweepKpiMetric} paramLabel={sweepSelectedParam?.label || ""} />
                    <div style={{ overflowX: "auto" }}>
                      <table style={{ width: "100%", borderCollapse: "collapse", color: C.text, fontSize: 12, textAlign: "left" }}>
                        <thead>
                          <tr style={{ color: C.muted, borderBottom: `1px solid ${C.border}` }}>
                            <th style={{ padding: "6px 8px" }}>{sweepSelectedParam?.label || "Value"}</th>
                            <th style={{ padding: "6px 8px" }}>Served</th>
                            <th style={{ padding: "6px 8px" }}>Avg wait</th>
                            <th style={{ padding: "6px 8px" }}>Avg service</th>
                            <th style={{ padding: "6px 8px" }}>Avg sojourn</th>
                            <th style={{ padding: "6px 8px" }}>Reneged</th>
                            <th style={{ padding: "6px 8px" }}>Reps</th>
                          </tr>
                        </thead>
                        <tbody>
                          {sweepResults.map((pt, i) => (
                            <tr key={i} style={{ borderBottom: `1px solid ${C.border}` }}>
                              <td style={{ padding: "6px 8px", color: C.amber, fontWeight: 700 }}>{pt.value}</td>
                              <td style={{ padding: "6px 8px" }}>{fmt(pt.aggregateStats["summary.served"]?.mean)}</td>
                              <td style={{ padding: "6px 8px" }}>{fmt(pt.aggregateStats["summary.avgWait"]?.mean)}</td>
                              <td style={{ padding: "6px 8px" }}>{fmt(pt.aggregateStats["summary.avgSvc"]?.mean)}</td>
                              <td style={{ padding: "6px 8px" }}>{fmt(pt.aggregateStats["summary.avgSojourn"]?.mean)}</td>
                              <td style={{ padding: "6px 8px" }}>{fmt(pt.aggregateStats["summary.reneged"]?.mean)}</td>
                              <td style={{ padding: "6px 8px" }}>{pt.replications?.length || 0}</td>
                            </tr>
                          ))}
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

                    {comparisonResult && (
                      <div style={{ overflowX: "auto" }}>
                        <table style={{ width: "100%", borderCollapse: "collapse", color: C.text, fontSize: 12, textAlign: "left" }}>
                          <thead>
                            <tr style={{ color: C.muted, borderBottom: `1px solid ${C.border}` }}>
                              <th style={{ padding: "6px 8px" }}>KPI</th>
                              <th style={{ padding: "6px 8px", textAlign: "right" }}>{comparisonResult.labels.a}</th>
                              <th style={{ padding: "6px 8px", textAlign: "right" }}>{comparisonResult.labels.b}</th>
                              <th style={{ padding: "6px 8px", textAlign: "right" }}>Difference</th>
                              <th style={{ padding: "6px 8px", textAlign: "right" }}>95% CI</th>
                              <th style={{ padding: "6px 8px" }}>Significant?</th>
                            </tr>
                          </thead>
                          <tbody>
                            {comparisonResult.comparisons.map((c, i) => {
                              const meanA = comparisonResult.meansA?.[c.metric];
                              const meanB = comparisonResult.meansB?.[c.metric];
                              return (
                                <tr key={i} style={{ borderBottom: `1px solid ${C.border}` }}>
                                  <td style={{ padding: "6px 8px", color: C.accent }}>{METRIC_LABELS[c.metric] || c.metric}</td>
                                  <td style={{ padding: "6px 8px", textAlign: "right" }}>{meanA != null ? fmt(meanA) : "—"}</td>
                                  <td style={{ padding: "6px 8px", textAlign: "right" }}>{meanB != null ? fmt(meanB) : "—"}</td>
                                  <td style={{ padding: "6px 8px", textAlign: "right", fontWeight: 700, color: c.significant95 ? (c.meanDiff > 0 ? C.green : C.red) : C.muted }}>
                                    {c.meanDiff != null ? (c.meanDiff > 0 ? "+" : "") + fmt(c.meanDiff) : "—"}
                                  </td>
                                  <td style={{ padding: "6px 8px", textAlign: "right", color: C.muted, fontSize: 11 }}>
                                    {c.lower != null && c.upper != null ? `[${fmt(c.lower)}, ${fmt(c.upper)}]` : "—"}
                                  </td>
                                  <td style={{ padding: "6px 8px" }}>
                                    {c.significant95 ? (
                                      <span style={{ color: c.significant99 ? C.green : C.amber, fontWeight: 700 }}>
                                        {c.significant99 ? "Yes (99%)" : "Yes (95%)"}
                                      </span>
                                    ) : (
                                      <span style={{ color: C.muted }}>No</span>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
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

                    {comparisonResult && (
                      <div style={{ overflowX: "auto" }}>
                        <table style={{ width: "100%", borderCollapse: "collapse", color: C.text, fontSize: 12, textAlign: "left" }}>
                          <thead>
                            <tr style={{ color: C.muted, borderBottom: `1px solid ${C.border}` }}>
                              <th style={{ padding: "6px 8px" }}>KPI</th>
                              <th style={{ padding: "6px 8px", textAlign: "right" }}>{comparisonResult.labels.a}</th>
                              <th style={{ padding: "6px 8px", textAlign: "right" }}>{comparisonResult.labels.b}</th>
                              <th style={{ padding: "6px 8px", textAlign: "right" }}>Difference</th>
                              <th style={{ padding: "6px 8px", textAlign: "right" }}>95% CI</th>
                              <th style={{ padding: "6px 8px" }}>Significant?</th>
                            </tr>
                          </thead>
                          <tbody>
                            {comparisonResult.comparisons.map((c, i) => {
                              const meanA = comparisonResult.meansA?.[c.metric];
                              const meanB = comparisonResult.meansB?.[c.metric];
                              return (
                                <tr key={i} style={{ borderBottom: `1px solid ${C.border}` }}>
                                  <td style={{ padding: "6px 8px", color: C.accent }}>{METRIC_LABELS[c.metric] || c.metric}</td>
                                  <td style={{ padding: "6px 8px", textAlign: "right" }}>{meanA != null ? fmt(meanA) : "—"}</td>
                                  <td style={{ padding: "6px 8px", textAlign: "right" }}>{meanB != null ? fmt(meanB) : "—"}</td>
                                  <td style={{ padding: "6px 8px", textAlign: "right", fontWeight: 700, color: c.significant95 ? (c.meanDiff > 0 ? C.green : C.red) : C.muted }}>
                                    {c.meanDiff != null ? (c.meanDiff > 0 ? "+" : "") + fmt(c.meanDiff) : "—"}
                                  </td>
                                  <td style={{ padding: "6px 8px", textAlign: "right", color: C.muted, fontSize: 11 }}>
                                    {c.lower != null && c.upper != null ? `[${fmt(c.lower)}, ${fmt(c.upper)}]` : "—"}
                                  </td>
                                  <td style={{ padding: "6px 8px" }}>
                                    {c.significant95 ? (
                                      <span style={{ color: c.significant99 ? C.green : C.amber, fontWeight: 700 }}>
                                        {c.significant99 ? "Yes (99%)" : "Yes (95%)"}
                                      </span>
                                    ) : (
                                      <span style={{ color: C.muted }}>No</span>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <div style={{ background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 8, padding: 14, display: "flex", gap: 10, rowGap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <Btn variant="primary" onClick={initEngine} disabled={hasErrors || batchActive}>⟳ Reset</Btn>
        <Btn variant="success" onClick={doStep} disabled={mode === "done" || hasErrors || batchActive}>⏭ Step</Btn>
        <Btn variant={autoRunning ? "danger" : "amber"} onClick={toggleAuto} disabled={hasErrors || batchActive}>{autoRunning ? "Stop Auto" : "Auto Run"}</Btn>
        <Btn variant="ghost" onClick={doRunAll} disabled={hasErrors || batchActive || saveStatus?.state === 'saving' || saveInProgressRef.current}>⚡ Run All</Btn>
        <Btn variant="ghost" onClick={exportResultsJson} disabled={!canExportResults}>Export Results</Btn>
        <Btn variant="ghost" onClick={exportResultsCsv} disabled={!canExportResults}>Export Results CSV</Btn>
        <Btn variant="ghost" onClick={() => { setShowShareModal(true); loadShareLinks(); }} disabled={!canShare}>Share</Btn>
        <Btn variant={aiPanelOpen ? "primary" : "ghost"} onClick={() => setAiPanelOpen(open => !open)}>AI Insights</Btn>
        <Btn variant="ghost" onClick={toggleAnimation} title="Toggle entity token animation">
          {animationEnabled ? "● Animate" : "○ Animate"}
        </Btn>
        <label style={{ display: "flex", alignItems: "center", gap: 5, cursor: "pointer", fontSize: 11, color: collectTimeSeries ? C.accent : C.label, fontFamily: FONT }}
          title="Disable to reduce memory on long runs (charts won't have queue depth / utilisation)">
          <input type="checkbox" checked={collectTimeSeries} onChange={e => setCollectTimeSeries(e.target.checked)} style={{ accentColor: C.accent }}/>
          Collect time-series
        </label>
        {batchActive && <Btn variant="danger" onClick={cancelBatch} disabled={batchStatus === "cancelling"}>Cancel Batch</Btn>}
        <div style={{ flex: 1, minWidth: 12 }} />
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 10, color: C.label, fontFamily: FONT, whiteSpace: "nowrap" }}>
            Speed {speedMultiplier.toFixed(1)}×
          </span>
          <input
            aria-label="Animation speed multiplier"
            type="range"
            min={0.5} max={10} step={0.5}
            value={speedMultiplier}
            onChange={e => setSpeedMultiplier(parseFloat(e.target.value))}
            style={{ width: 80, accentColor: C.accent }}
          />
        </div>
      </div>

      {validation.errors.length > 0 && (
        <div role="alert" style={{ background: C.errorBg, border: `1px solid ${C.danger}`, borderRadius: 6,
          padding: 12, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: C.error, fontFamily: FONT, marginBottom: 4 }}>
            Model has {validation.errors.length} blocking error{validation.errors.length > 1 ? 's' : ''} — fix before running:
          </div>
          {validation.errors.map((e, i) => (
            <div key={i} style={{ fontSize: 12, color: C.error, fontFamily: FONT }}>
              [{e.code}] {e.message}
            </div>
          ))}
        </div>
      )}

      {validation.errors.length === 0 && validation.warnings.length > 0 && (
        <div style={{ background: C.warmup, border: `1px solid ${C.amber}`, borderRadius: 6, padding: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: C.warnBg, fontFamily: FONT, marginBottom: 4 }}>
            {validation.warnings.length} warning{validation.warnings.length > 1 ? 's' : ''} — run will proceed:
          </div>
          {validation.warnings.map((w, i) => (
            <div key={i} style={{ fontSize: 12, color: C.warnBg, fontFamily: FONT }}>
              [{w.code}] {w.message}
            </div>
          ))}
        </div>
      )}

      {phaseCTruncated && model.maxCPasses && (
        <div style={{ background: C.amber + '18', border: `1px solid ${C.amber}44`, borderRadius: 6, padding: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: C.amber, fontFamily: FONT }}>
            Phase C scan hit the {model.maxCPasses}-pass cap — model may have an unstable or conflicting C-event condition
          </div>
          <div style={{ fontSize: 11, color: C.amber, fontFamily: FONT, marginTop: 4, opacity: 0.8 }}>
            Check your C-event conditions for cycles or conditions that never become false.
          </div>
        </div>
      )}

      {saveStatus && (
        <div style={{
          background: saveStatus.state === 'error' ? C.errorBg : saveStatus.state === 'success' ? '#1b4332' : '#1f2937',
          border: `1px solid ${saveStatus.state === 'error' ? C.danger : saveStatus.state === 'success' ? '#31a24c' : '#4b5563'}`,
          borderRadius: 6, padding: 12, color: saveStatus.state === 'error' ? C.error : saveStatus.state === 'success' ? '#86efac' : '#e5e7eb',
          fontSize: 12, fontFamily: FONT,
        }}>
          {saveStatus.message}
        </div>
      )}

      {runLabel.trim() && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 10, color: C.muted, fontFamily: FONT, letterSpacing: 1.2, fontWeight: 700 }}>RUN LABEL</span>
          <Tag label={runLabel.trim()} color={C.accent} />
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
                {CI_METRICS.map(metric => {
                  const stat = aggregateStats[metric];
                  if (!stat || stat.n < 2) return null;
                  return (
                    <div key={metric} style={{
                      background: C.surface,
                      border: `1px solid ${C.border}`,
                      borderRadius: 5,
                      padding: "10px 12px",
                    }}>
                      <div style={{ fontSize: 10, color: C.muted, fontFamily: FONT, marginBottom: 4 }}>
                        {METRIC_LABELS[metric]}
                      </div>
                      <div style={{ fontSize: 18, fontWeight: 700, color: C.accent, fontFamily: FONT }}>
                        {fmt(stat.mean)}
                      </div>
                      <div style={{ fontSize: 10, color: C.muted, fontFamily: FONT, marginTop: 2 }}>
                        ±{fmt(stat.halfWidth)} (95% CI)
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", color: C.text, fontSize: 12, textAlign: "left", tableLayout: "fixed" }}>
              <thead>
                <tr style={{ color: C.muted, borderBottom: `1px solid ${C.border}` }}>
                  <th style={{ padding: 8 }}>Rep #</th>
                  <th style={{ padding: 8 }}>Seed</th>
                  <th style={{ padding: 8 }}>Served</th>
                  <th style={{ padding: 8 }}>Avg wait</th>
                  <th style={{ padding: 8 }}>Avg service</th>
                  <th style={{ padding: 8 }}>Avg sojourn</th>
                  <th style={{ padding: 8 }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {replicationResults.map(payload => (
                  <tr key={payload.replicationIndex} style={{ borderBottom: `1px solid ${C.border}` }}>
                    <td style={{ padding: 8 }}>{payload.replicationIndex + 1}</td>
                    <td style={{ padding: 8, color: C.amber }}>{payload.seed}</td>
                    <td style={{ padding: 8 }}>{payload.result?.summary?.served ?? "—"}</td>
                    <td style={{ padding: 8 }}>{fmt(payload.result?.summary?.avgWait)}</td>
                    <td style={{ padding: 8 }}>{fmt(payload.result?.summary?.avgSvc)}</td>
                    <td style={{ padding: 8 }}>{fmt(payload.result?.summary?.avgSojourn)}</td>
                    <td style={{ padding: 8 }}><Tag label="complete" color={C.green} /></td>
                  </tr>
                ))}
                {!replicationResults.length && (
                  <tr>
                    <td colSpan={7} style={{ padding: 8, color: C.muted }}>Waiting for first replication result...</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {Object.values(aggregateStats).some(stat => stat.n >= 2) && (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", color: C.text, fontSize: 12, textAlign: "left", tableLayout: "fixed" }}>
                <thead>
                  <tr style={{ color: C.muted, borderBottom: `1px solid ${C.border}` }}>
                    <th style={{ padding: 8 }}>Metric</th>
                    <th style={{ padding: 8 }}>Mean</th>
                    <th style={{ padding: 8 }}>Lower 95%</th>
                    <th style={{ padding: 8 }}>Upper 95%</th>
                    <th style={{ padding: 8 }}>Half-width</th>
                    <th style={{ padding: 8 }}>n</th>
                  </tr>
                </thead>
                <tbody>
                  {CI_METRICS.map(metric => {
                    const stat = aggregateStats[metric];
                    if (!stat || stat.n < 2) return null;
                    return (
                      <tr key={metric} style={{ borderBottom: `1px solid ${C.border}` }}>
                        <td style={{ padding: 8 }}>{METRIC_LABELS[metric]}</td>
                        <td style={{ padding: 8, color: C.accent }}>{fmt(stat.mean)}</td>
                        <td style={{ padding: 8 }}>{fmt(stat.lower)}</td>
                        <td style={{ padding: 8 }}>{fmt(stat.upper)}</td>
                        <td style={{ padding: 8, color: C.amber }}>{fmt(stat.halfWidth)}</td>
                        <td style={{ padding: 8 }}>{stat.n}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {view === "visual" && (() => {
        const hasDerivableGraph = !!(model.queues?.length || model.bEvents?.length || model.cEvents?.length);
        if (hasDerivableGraph) {
          return (
            <>
              <Suspense fallback={<VisualView snap={currentSnap} model={model} summary={results?.summary} />}>
                <ExecuteCanvas
                  snap={currentSnap}
                  model={model}
                  summary={results?.summary}
                  animationEnabled={animationEnabled}
                  kpiSlots={kpiSlots}
                  onKpiSlotChange={handleKpiSlotChange}
                  onNodeSelect={setSelectedNodeLabel}
                />
              </Suspense>
              <BottomPanel
                log={log}
                snap={currentSnap}
                model={model}
                results={results}
                selectedNodeLabel={selectedNodeLabel}
                onClearFilter={() => setSelectedNodeLabel(null)}
                replicationResults={replicationResults}
                warmupDetection={warmupDetection}
              />
            </>
          );
        }
        return <VisualView snap={currentSnap} model={model} summary={results?.summary} />;
      })()}

      {view === "log" && (
        <div style={{ background: C.logBg, border: `1px solid ${C.border}`, borderRadius: 6, padding: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, paddingBottom: 10, borderBottom: `1px solid ${C.border}` }}>
            <div style={{ fontSize: 10, color: C.label, fontFamily: FONT, letterSpacing: 1.5, fontWeight: 700 }}>SIMULATION LOG (NEWEST FIRST)</div>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.server, fontFamily: FONT }}>
              Steps: {log.length} | Clock: {currentSnap?.clock?.toFixed(0) || '—'}
            </div>
          </div>
          <div style={{ maxHeight: 350, overflowY: 'auto' }}>
            {log.length === 0 ? <div style={{ color: C.muted, fontSize: 12 }}>Log empty. Run simulation to see events.</div> :
              [...log].reverse().map((r, i) => (
              <div key={i}>
                  {r.phase === "WARMUP" && (
                    <div style={{ padding: "12px 0", borderBottom: `1px solid ${C.border}`, borderTop: `1px solid ${C.border}`, margin: "8px 0", textAlign: "center", color: C.amber, fontSize: 11, fontWeight: 700, letterSpacing: 1.5, background: `${C.warmup}22` }}>
                      ──── WARM-UP ENDED AT T={r.time?.toFixed(0)} ────
                    </div>
                  )}
                  <div style={{ fontSize: 12, fontFamily: "monospace", color: r.phase === "WARMUP" ? C.amber : C.kpiSvc, borderBottom: `1px solid ${C.cardBg}`, padding: "4px 0" }}>
                    <span style={{ color: C.label }}>[t={r.time?.toFixed(0)}]</span> <PhaseTag phase={r.phase} /> {r.message}
                  </div>
                </div>
              ))
            }
          </div>
        </div>
      )}

      {view === "entities" && currentSnap && (
        <div style={{ background: C.logBg, border: `1px solid ${C.border}`, borderRadius: 6, padding: 14 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", color: "#fff", fontSize: 12, textAlign: "left" }}>
            <thead>
              <tr style={{ color: C.label, borderBottom: `2px solid ${C.border}` }}>
                <th style={{ padding: 8 }}>Entity</th><th style={{ padding: 8 }}>Type</th><th style={{ padding: 8 }}>Status</th><th style={{ padding: 8 }}>Queue</th>
              </tr>
            </thead>
            <tbody>
              {currentSnap.entities.map(e => (
                <tr key={e.id} style={{ borderBottom: `1px solid ${C.cardBg}` }}>
                  <td style={{ padding: 8, color: C.kpiArr }}>#{e.id}</td>
                  <td style={{ padding: 8 }}>{e.type}</td>
                  <td style={{ padding: 8 }}><Tag label={e.status} color={e.status === 'waiting' ? C.bEvent : C.kpiSvc} /></td>
                  <td style={{ padding: 8, color: C.label }}>{e.queue || "None"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      </div>

      {aiPanelOpen && (
        <AiAssistantPanel
          model={model}
          results={results}
          exportConfig={exportConfig}
          aggregateStats={aggregateStats}
          comparisonRuns={comparisonRuns}
          comparisonLoading={runHistoryStatus === "loading"}
          comparisonError={runHistoryError}
          onClose={() => setAiPanelOpen(false)}
          onSaveInsights={async (insights) => {
            if (!latestRunId) return;
            try { await saveAiInsights(latestRunId, insights); } catch {}
          }}
        />
      )}

      {/* Share Modal */}
      {showShareModal && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "#000000aa", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}
          onClick={() => { setShowShareModal(false); setQrToken(null); }}>
          <div role="dialog" aria-modal="true" aria-labelledby="share-modal-title"
            onClick={e => e.stopPropagation()}
            style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 10, width: 520, maxWidth: "95vw", maxHeight: "90vh", overflowY: "auto", padding: 24, display: "flex", flexDirection: "column", gap: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h2 id="share-modal-title" style={{ fontSize: 16, fontWeight: 700, color: C.text, fontFamily: FONT }}>Share Results</h2>
              <button type="button" onClick={() => { setShowShareModal(false); setQrToken(null); }}
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
                  return (
                    <div key={link.id} style={{ display: "flex", alignItems: "center", gap: 8, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 5, padding: "8px 10px" }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 11, color: C.text, fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{link.token.slice(0, 8)}…</div>
                        <div style={{ fontSize: 9, color: C.muted, fontFamily: FONT }}>{new Date(link.createdAt).toLocaleString()}</div>
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
