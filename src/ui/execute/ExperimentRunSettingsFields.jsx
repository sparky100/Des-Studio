// Moved verbatim out of execute/index.jsx (expert review C-11 tranche).
/** Editable run-settings inputs for the saved-experiment New/Edit forms — reuses the same
 * shared state setters as ExperimentControls.jsx's "Edit setup" panel so saving an
 * experiment captures whatever is set here, not whatever the global Run Setup happens to be. */
import { ConditionBuilder } from "../editors/index.jsx";
import { useTheme } from "../shared/ThemeContext.jsx";

export function ExperimentRunSettingsFields({
  warmupPeriod, setWarmupPeriod,
  replications, setReplications,
  seed, setSeed,
  terminationMode, setTerminationMode,
  maxSimTime, setMaxSimTime,
  terminationCondition, setTerminationCondition,
  model,
}) {
  const { C, FONT } = useTheme();
  const fieldStyle = { width: 90, background: "transparent", border: `1px solid ${C.border}`, borderRadius: 4, color: C.amber, fontFamily: FONT, fontSize: 12, padding: "6px 8px" };
  const labelStyle = { fontSize: 10, color: C.label, fontFamily: FONT, letterSpacing: 1.2, fontWeight: 700 };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 6, padding: 12 }}>
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={labelStyle}>WARM-UP</span>
          <input aria-label="Warm-up period" type="number" value={warmupPeriod}
            onChange={e => setWarmupPeriod(parseFloat(e.target.value) || 0)}
            style={fieldStyle} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={labelStyle}>REPLICATIONS</span>
          <input aria-label="Replication count" type="number" value={replications}
            onChange={e => setReplications(parseInt(e.target.value, 10) || 0)}
            style={fieldStyle} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={labelStyle}>SEED</span>
          <input aria-label="Simulation seed" type="number" value={seed}
            onChange={e => setSeed(parseInt(e.target.value) || 0)}
            style={fieldStyle} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={labelStyle}>STOP CONDITION</span>
          <div style={{ display: "flex", gap: 10, alignItems: "center", height: 30 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 5, cursor: "pointer", fontSize: 11, color: C.text, fontFamily: FONT }}>
              <input type="radio" name="expTerminationMode" checked={terminationMode === "time"} onChange={() => setTerminationMode("time")} />
              Fixed duration
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 5, cursor: "pointer", fontSize: 11, color: C.text, fontFamily: FONT }}>
              <input type="radio" name="expTerminationMode" checked={terminationMode === "condition"} onChange={() => setTerminationMode("condition")} />
              Rule-based
            </label>
          </div>
        </div>
        {terminationMode === "time" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={labelStyle}>DURATION</span>
            <input aria-label="Run duration" type="number" value={maxSimTime}
              onChange={e => setMaxSimTime(parseFloat(e.target.value) || 0)}
              style={fieldStyle} />
          </div>
        )}
      </div>
      {terminationMode === "condition" && (
        <div>
          <span style={{ ...labelStyle, display: "block", marginBottom: 6 }}>STOP WHEN THIS BECOMES TRUE</span>
          <ConditionBuilder
            condition={terminationCondition}
            entityTypes={model.entityTypes}
            stateVariables={model.stateVariables}
            queues={model.queues}
            containers={model.containerTypes}
            onChange={condition => setTerminationCondition(condition)}
          />
        </div>
      )}
    </div>
  );
}
