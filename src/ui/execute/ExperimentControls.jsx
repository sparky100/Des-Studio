// ui/execute/ExperimentControls.jsx — Setup form section for run configuration
import { C, FONT } from "../shared/tokens.js";
import { Tag, Btn } from "../shared/components.jsx";
import { cumulativeMean } from "../../engine/statistics.js";
import { WarmupChart, CumulativeMeanChart } from "./SweepViews.jsx";
import { ConditionBuilder } from "../editors/index.jsx";
import { simToWall, formatWallTime } from "../../engine/clockUtils.js";

export function ExperimentControls({
  warmupPeriod, setWarmupPeriod,
  replications, setReplications,
  seed, setSeed,
  runLabel, setRunLabel,
  terminationMode, setTerminationMode,
  maxSimTime, setMaxSimTime,
  terminationCondition, setTerminationCondition,
  showRunSetup, setShowRunSetup,
  runSetupSummary,
  warmupDetection, setWarmupDetection,
  replicationResults,
  model,
  onDetectWarmup,
  persistExperimentDefaults,
}) {
  return (
    <div style={{ background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden" }}>
      <div style={{ padding: "10px 14px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, flex: "1 1 420px", minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span style={{ fontSize: 10, color: C.muted, fontFamily: FONT, letterSpacing: 1.2, fontWeight: 700 }}>SCENARIO SETUP</span>
            {runLabel.trim() && <Tag label={runLabel.trim()} color={C.accent} />}
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {runSetupSummary.map(item => (
              <div key={item} style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 999, padding: "5px 10px", color: C.muted, fontFamily: FONT, fontSize: 11 }}>
                {item}
              </div>
            ))}
            {model?.epoch && (() => {
              const epoch = model.epoch;
              const unit  = model.timeUnit || 'minutes';
              const start = formatWallTime(simToWall(0, epoch, unit));
              const end   = formatWallTime(simToWall(maxSimTime, epoch, unit));
              return start && end ? (
                <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 999, padding: "5px 10px", color: C.accent, fontFamily: FONT, fontSize: 11 }}>
                  {start} → {end}
                </div>
              ) : null;
            })()}
          </div>
        </div>
        <Btn small variant="ghost" onClick={() => setShowRunSetup(open => !open)}>
          {showRunSetup ? "Hide setup" : "Edit setup"}
        </Btn>
      </div>

      {showRunSetup && (
        <div style={{ borderTop: `1px solid ${C.border}`, padding: 14, display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 14, flexWrap: "wrap" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={{ fontSize: 10, color: C.label, fontFamily: FONT, letterSpacing: 1.2, fontWeight: 700 }}>WARM-UP PERIOD</span>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <input
                  aria-label="Warm-up period"
                  type="number"
                  value={warmupPeriod}
                  onChange={e => {
                    const value = parseFloat(e.target.value) || 0;
                    setWarmupPeriod(value);
                    setWarmupDetection(null);
                    persistExperimentDefaults({ warmupPeriod: value });
                  }}
                  style={{ width: 80, background: "transparent", border: `1px solid ${C.border}`,
                    borderRadius: 4, color: C.amber, fontFamily: FONT, fontSize: 12,
                    padding: "6px 8px", outline: "none" }}
                />
                <Btn small variant="ghost" onClick={onDetectWarmup} disabled={replicationResults.length === 0}>
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
                      const value = Math.round(warmupDetection.truncationPoint);
                      setWarmupPeriod(value);
                      persistExperimentDefaults({ warmupPeriod: value });
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
              {replicationResults.length > 0 && (() => {
                const lastRep = replicationResults[replicationResults.length - 1];
                const ts = lastRep?.result?.timeSeries;
                if (!ts || ts.length < 2) return null;
                const queueDepths = ts.map(p => {
                  const queues = Object.values(p.byQueue || {});
                  return queues.reduce((s, q) => s + (q?.waiting ?? 0), 0);
                }).filter(Number.isFinite);
                const cumMean = cumulativeMean(queueDepths);
                if (cumMean.length < 2) return null;
                return (
                  <div style={{ marginTop: 8 }}>
                    <div style={{ fontSize: 10, color: C.label, fontFamily: FONT, letterSpacing: 1.2, fontWeight: 700, marginBottom: 4 }}>
                      CUMULATIVE MEAN QUEUE DEPTH (last replication)
                    </div>
                    <CumulativeMeanChart points={cumMean} warmupPeriod={warmupPeriod} />
                  </div>
                );
              })()}
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={{ fontSize: 10, color: C.label, fontFamily: FONT, letterSpacing: 1.2, fontWeight: 700 }}>REPLICATIONS</span>
              <input
                aria-label="Replication count"
                type="number"
                value={replications}
                onChange={e => {
                  const value = parseInt(e.target.value, 10) || 0;
                  setReplications(value);
                  persistExperimentDefaults({ replications: value });
                }}
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
                  <input type="radio" name="terminationMode" checked={terminationMode === "time"} onChange={() => {
                    setTerminationMode("time");
                    persistExperimentDefaults({ terminationMode: "time", maxSimTime, terminationCondition: null });
                  }} />
                  Time-based
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 12, color: C.text, fontFamily: FONT }}>
                  <input type="radio" name="terminationMode" checked={terminationMode === "condition"} onChange={() => {
                    setTerminationMode("condition");
                    persistExperimentDefaults({ terminationMode: "condition", terminationCondition });
                  }} />
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
                  onChange={e => {
                    const value = parseFloat(e.target.value) || 0;
                    setMaxSimTime(value);
                    persistExperimentDefaults({ maxSimTime: value, terminationMode: "time" });
                  }}
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
                onChange={condition => {
                  setTerminationCondition(condition);
                  persistExperimentDefaults({ terminationCondition: condition, terminationMode: "condition" });
                }}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
