// Run-history state cluster, extracted verbatim from ExecutePanel
// (expert review C-11 / sprint-56 spec). Owns the saved-run list and its
// load/refresh lifecycle; cloud vs local storage is picked by userId, same
// as before. Callers refresh fire-and-forget after a save
// (`void refreshRunHistory()`).
import { useCallback, useEffect, useState } from "react";
import { fetchRunHistory } from "../../../db/models.js";
import { fetchLocalRunHistory } from "../../../db/local.js";

export function useRunHistory(modelId, userId) {
  const [savedRunHistory, setSavedRunHistory] = useState([]);
  const [runHistoryStatus, setRunHistoryStatus] = useState("idle");
  const [runHistoryError, setRunHistoryError] = useState("");

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

  return { savedRunHistory, runHistoryStatus, runHistoryError, refreshRunHistory };
}
