import { useState, useRef, useCallback, useEffect } from "react";
import { exportToSimPy } from "../../engine/simpy-export.js";
import { summarizeReplicationResults } from "../../engine/statistics.js";
import { CI_METRICS } from "../execute/executeHelpers.js";

function mean(arr) {
  return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
}

function buildResultsShape(repResults, model) {
  if (!repResults.length) return null;
  const perResource = {};
  const firstUtil = repResults[0]?.util ?? {};
  for (const k of Object.keys(firstUtil)) {
    perResource[k] = {
      utilisation: mean(repResults.map(r => r.util?.[k] ?? 0)),
      total: 0,
      idle: 0,
    };
  }
  const replications = repResults.map((r, i) => ({
    replicationIndex: i,
    seed: (+(model.experimentDefaults?.seed ?? model.seed ?? 42)) + i,
    result: {
      summary: {
        total:          r.total ?? 0,
        served:         r.served,
        reneged:        r.reneged,
        avgSojourn:     r.avg_sojourn,
        avgTimeInSystem:r.avg_sojourn,
        avgWait:        r.wait_mean ?? 0,
        avgSvc:         r.svc_mean  ?? 0,
        totalCost:      r.total_cost ?? 0,
      },
    },
  }));
  const aggregateStats = summarizeReplicationResults(replications, CI_METRICS);
  const _totalServed  = repResults.reduce((s, r) => s + (r.served  || 0), 0);
  const _totalArrived = repResults.reduce((s, r) => s + (r.total   || 0), 0);
  return {
    _source: "simpy",
    summary: {
      total:       _totalArrived,
      served:      _totalServed,
      reneged:     repResults.reduce((s, r) => s + (r.reneged || 0), 0),
      servedRatio: _totalArrived > 0 ? +(_totalServed / _totalArrived).toFixed(4) : null,
      avgSojourn:  mean(repResults.map(r => r.avg_sojourn)),
      avgTimeInSystem: mean(repResults.map(r => r.avg_sojourn)),
      avgWait:     mean(repResults.map(r => r.wait_mean ?? 0)),
      avgSvc:      mean(repResults.map(r => r.svc_mean  ?? 0)),
      totalCost:   mean(repResults.map(r => r.total_cost ?? 0)),
      perResource,
    },
    waitDist: repResults[0]?.wait_p50 != null ? {
      _all: {
        n:    repResults.length,
        mean: mean(repResults.map(r => r.wait_mean ?? 0)),
        p50:  mean(repResults.map(r => r.wait_p50 ?? 0)),
        p90:  mean(repResults.map(r => r.wait_p90 ?? 0)),
        p99:  mean(repResults.map(r => r.wait_p99 ?? 0)),
      },
    } : {},
    replications,
    aggregateStats,
    _simpy_reps: repResults,
  };
}

export function useSimPyRunner(model) {
  const [status, setStatus]     = useState("idle");   // idle|loading|running|done|error
  const [progress, setProgress] = useState(0);
  const [total, setTotal]       = useState(0);
  const [results, setResults]   = useState(null);
  const [error, setError]       = useState(null);

  const workerRef  = useRef(null);
  const pyReadyRef = useRef(false);
  const repBufRef  = useRef([]);

  const teardown = useCallback(() => {
    if (workerRef.current) {
      workerRef.current.terminate();
      workerRef.current = null;
      pyReadyRef.current = false;
    }
  }, []);

  useEffect(() => teardown, [teardown]);

  const run = useCallback(() => {
    let exported;
    try { exported = exportToSimPy(model); }
    catch (e) { setError(e.message); setStatus("error"); return; }

    if (exported.category !== 1) {
      setError("Category 2 models require manual edits — download the script and complete the TODO sections first.");
      return;
    }

    const reps = +(model.experimentDefaults?.replications ?? model.replications ?? 1);
    setTotal(reps);
    setProgress(0);
    setResults(null);
    setError(null);
    repBufRef.current = [];

    const { script } = exported;

    if (workerRef.current && pyReadyRef.current) {
      // Pyodide already warm — re-run directly
      setStatus("running");
      workerRef.current.onmessage = ({ data }) => handleMsg(data, script);
      workerRef.current.postMessage({ type: "run", script });
      return;
    }

    // First run — boot Pyodide
    teardown();
    setStatus("loading");
    const w = new Worker(
      new URL("../../engine/simpy-runner-worker.js", import.meta.url),
      { type: "module" }
    );
    w.onerror = e => { setError(e.message ?? "Worker error"); setStatus("error"); };
    w.onmessage = ({ data }) => handleMsg(data, script);
    workerRef.current = w;

    function handleMsg(data) {
      switch (data.type) {
        case "ready":
          pyReadyRef.current = true;
          setStatus("running");
          w.postMessage({ type: "run", script });
          break;
        case "rep":
          repBufRef.current.push(data);
          setProgress(p => p + 1);
          break;
        case "done":
          setResults(buildResultsShape(repBufRef.current, model));
          setStatus("done");
          break;
        case "error":
          setError(data.message);
          setStatus("error");
          break;
      }
    }
  }, [model, teardown]);

  const cancel = useCallback(() => {
    teardown();
    setStatus("idle");
    setProgress(0);
  }, [teardown]);

  const reset = useCallback(() => {
    setStatus("idle");
    setProgress(0);
    setResults(null);
    setError(null);
  }, []);

  return { run, cancel, reset, status, progress, total, results, error };
}
