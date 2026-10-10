import { useCallback, useState } from "react";

// Tracks whether Phase C (conditional-event resolution) hit its pass limit
// during a run, and — for batches — how many of the replications were
// affected. A single boolean can't distinguish "1 of 20 reps had a moment
// of instability" from "11 of 20 reps did", which is exactly the
// distinction a modeler needs to judge whether pooled batch stats can
// still be trusted (surfaced in the Execute panel's amber warning banner).
export function usePhaseCTruncationStatus() {
  const [phaseCTruncated, setPhaseCTruncated] = useState(false);
  const [truncatedReplicationCount, setTruncatedReplicationCount] = useState(0);
  const [totalReplicationCount, setTotalReplicationCount] = useState(1);
  const [cycleLimitReached, setCycleLimitReached] = useState(false);
  // Replications stopped by the per-replication C-event scan cap (2× tier limit).
  const [scanLimitReplicationCount, setScanLimitReplicationCount] = useState(0);

  const reset = useCallback((total = 1) => {
    setPhaseCTruncated(false);
    setTruncatedReplicationCount(0);
    setTotalReplicationCount(total);
    setCycleLimitReached(false);
    setScanLimitReplicationCount(0);
  }, []);

  // Single-run contexts (interactive step, "Run Once"): at most one
  // replication exists, so any truncation in it means 1-of-1.
  const recordSingleResult = useCallback((r) => {
    if (r?.phaseCTruncated || r?.summary?.phaseCTruncated) {
      setPhaseCTruncated(true);
      setTruncatedReplicationCount(1);
    }
    if (r?.cycleLimitReached || r?.summary?.cycleLimitReached) setCycleLimitReached(true);
    if (r?.scanLimitReached || r?.summary?.scanLimitReached) setScanLimitReplicationCount(1);
  }, []);

  // Batch context: recompute from every replication payload completed so
  // far, so the count stays accurate as replications stream in.
  const recordBatchProgress = useCallback((completedPayloads, latestPayload) => {
    const truncatedSoFar = completedPayloads.filter(
      p => p?.result?.phaseCTruncated || p?.result?.summary?.phaseCTruncated
    ).length;
    if (truncatedSoFar > 0) {
      setPhaseCTruncated(true);
      setTruncatedReplicationCount(truncatedSoFar);
    }
    if (latestPayload?.result?.cycleLimitReached || latestPayload?.result?.summary?.cycleLimitReached) {
      setCycleLimitReached(true);
    }
    const scanLimitedSoFar = completedPayloads.filter(
      p => p?.result?.scanLimitReached || p?.result?.summary?.scanLimitReached
    ).length;
    if (scanLimitedSoFar > 0) setScanLimitReplicationCount(scanLimitedSoFar);
  }, []);

  return {
    phaseCTruncated, truncatedReplicationCount, totalReplicationCount, cycleLimitReached,
    scanLimitReplicationCount,
    reset, recordSingleResult, recordBatchProgress,
  };
}
