// Named-schedules state cluster (ADR-016), extracted verbatim from
// ExecutePanel (expert review C-11 / sprint-56 spec).
//
// modelSchedules: all schedules for this model (fetched when modelId is set)
// selectedScheduleId: the schedule to use for the next run (null = inline rows)
// activeSchedulesMap: passed to buildEngine via options.schedulesMap so
//   resolveInlineSchedules() can populate bEvent.schedules[].rows[] before the
//   FEL is initialised. Uses the explicitly selected schedule, or falls back
//   to the default so the complexity estimator and engine both work without a
//   manual selection.
//
// `schedulesVersion` is ModelDetail's refetch signal — bumping it re-runs the
// fetch (that signal replaced an older imperative reload callback).
import { useEffect, useMemo, useState } from "react";
import { fetchModelSchedules, buildSchedulesMap } from "../../../db/models.js";

export function useModelSchedules(modelId, userId, schedulesVersion) {
  const [modelSchedules, setModelSchedules] = useState([]);
  const [selectedScheduleId, setSelectedScheduleId] = useState(null);
  const [schedulesLoading, setSchedulesLoading] = useState(false);

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

  const activeSchedulesMap = useMemo(() => {
    if (modelSchedules.length === 0) return {};
    const resolvedId = selectedScheduleId ?? modelSchedules.find(s => s.isDefault)?.id;
    if (!resolvedId) return {};
    const active = modelSchedules.filter(s => s.id === resolvedId);
    return buildSchedulesMap(active);
  }, [modelSchedules, selectedScheduleId]);

  return { modelSchedules, selectedScheduleId, setSelectedScheduleId, schedulesLoading, activeSchedulesMap };
}
