// Canvas-visualization settings cluster, extracted verbatim from ExecutePanel
// (expert review C-11 / sprint-56 spec): token-animation toggle and KPI slot
// choices (persisted per user via user settings), auto-run speed, and the
// canvas selection state (node / node-detail / entity) consumed by
// ExecuteCanvas and BottomPanel. All persistence is userId-gated — anonymous/
// local mode keeps plain in-memory state.
import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchUserSettings, saveUserSettings } from "../../../db/models.js";
import { DEFAULT_KPI_SLOTS } from "../execute-constants.js";
import { prefersReducedMotion } from "../../shared/hooks.js";

export function useVisualizationSettings(userId) {
  const [animationEnabled, setAnimationEnabled] = useState(() => !prefersReducedMotion());
  const [kpiSlots, setKpiSlots] = useState(DEFAULT_KPI_SLOTS);
  const [speedMultiplier, setSpeedMultiplier] = useState(1);
  const [selectedNodeLabel, setSelectedNodeLabel] = useState(null);
  const [selectedNodeDetail, setSelectedNodeDetail] = useState(null);
  const [selectedEntityId, setSelectedEntityId] = useState(null);

  const effectiveAutoSpeed = useMemo(
    () => Math.max(40, Math.round(400 / speedMultiplier)),
    [speedMultiplier]
  );

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
    } catch { /* storage unavailable (private mode) — non-critical */ }
  }, [userId]);

  // Checkbox handler — updates state AND persists the choice. Previously the
  // raw setter was wired to the checkbox and this persisting version was dead
  // code, so a stored animateTokens: false reloaded on every mount and the
  // checkbox appeared to work but never stuck.
  const toggleAnimation = useCallback((next) => {
    setAnimationEnabled(next);
    saveExecuteSetting({ animateTokens: next });
  }, [saveExecuteSetting]);

  const handleKpiSlotChange = useCallback((slotIndex, newKey) => {
    setKpiSlots(prev => {
      const next = [...prev];
      next[slotIndex] = newKey;
      saveExecuteSetting({ kpiSlots: next });
      return next;
    });
  }, [saveExecuteSetting]);

  return {
    animationEnabled, toggleAnimation,
    kpiSlots, handleKpiSlotChange,
    speedMultiplier, setSpeedMultiplier, effectiveAutoSpeed,
    selectedNodeLabel, setSelectedNodeLabel,
    selectedNodeDetail, setSelectedNodeDetail,
    selectedEntityId, setSelectedEntityId,
  };
}
