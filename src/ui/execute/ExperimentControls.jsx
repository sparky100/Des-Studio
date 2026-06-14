// ui/execute/ExperimentControls.jsx — Setup form section for run configuration
;
import { Tag, Btn } from "../shared/components.jsx";
import { cumulativeMean } from "../../engine/statistics.js";
import { WarmupChart, CumulativeMeanChart } from "./SweepViews.jsx";
import { ConditionBuilder } from "../editors/index.jsx";
import { simToWall, formatWallTime } from "../../engine/clockUtils.js";
import { useTheme } from "../shared/ThemeContext.jsx";

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
  animationEnabled, setAnimationEnabled,
  collectTimeSeries, setCollectTimeSeries,
  purgePeriodEnabled, setPurgePeriodEnabled,
  saveDetailLevel, setSaveDetailLevel,
  speedMultiplier, setSpeedMultiplier,
  onClose,
}) {
  const { C, FONT } = useTheme();
  const helperStyle = { fontSize: 10, color: C.muted, fontFamily: FONT, lineHeight: 1.5, maxWidth: 220 };
  return (
    <div style={{ background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden" }}>
      <div style={{ padding: "10px 14px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, flex: "1 1 420px", minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <span style={{ fontSize: 10, color: C.muted, fontFamily: FONT, letterSpacing: 1.2, fontWeight: 700 }}>RUN SETUP</span>
              {runLabel.trim() && <span style={{ fontSize: 11, color: C.text, fontFamily: FONT, fontWeight: 600 }}>{runLabel.trim()}</span>}
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
        <Btn small variant="ghost" onClick={() => {
          if (showRunSetup) {
            setShowRunSetup(false);
            onClose?.();
          } else {
            setShowRunSetup(true);
          }
        }}>
          {showRunSetup ? "Hide setup" : "Edit setup"}
        </Btn>
      </div>

      {showRunSetup && (
        <div style={{ borderTop: `1px solid ${C.border}`, padding: 14, display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 14, flexWrap: "wrap" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={{ fontSize: 10, color: C.label, fontFamily: FONT, letterSpacing: 1.2, fontWeight: 700 }}>RUN NAME</span>
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
              <span style={{ fontSize: 10, color: C.label, fontFamily: FONT, letterSpacing: 1.2, fontWeight: 700 }}>IGNORE EARLY RESULTS</span>
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
                  Suggest a value
                </Btn>
              </div>
              <div style={helperStyle}>
                Use this when the system needs time to settle before results are representative.
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
                      Use this suggestion
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
                      HOW QUEUE SIZE SETTLED OVER TIME (LAST REPLICATION)
                    </div>
                    <CumulativeMeanChart points={cumMean} warmupPeriod={warmupPeriod} />
                  </div>
                );
              })()}
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={{ fontSize: 10, color: C.label, fontFamily: FONT, letterSpacing: 1.2, fontWeight: 700 }}>NUMBER OF RUNS</span>
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
              <div style={helperStyle}>
                Run the same scenario several times to reduce random noise.
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={{ fontSize: 10, color: C.label, fontFamily: FONT, letterSpacing: 1.2, fontWeight: 700 }}>RANDOM STARTING POINT</span>
              <div style={{ display: "flex", gap: 6 }}>
                <input
                  aria-label="Simulation seed"
                  type="number"
                  value={seed}
                  onChange={e => { const v = parseInt(e.target.value) || 0; setSeed(v); persistExperimentDefaults({ seed: v }); }}
                  style={{ width: 120, background: "transparent", border: `1px solid ${C.border}`,
                    borderRadius: 4, color: C.amber, fontFamily: FONT, fontSize: 12,
                    padding: "6px 8px", outline: "none" }}
                />
                <Btn small variant="ghost" onClick={() => { const v = Math.floor(Math.random() * 1e9); setSeed(v); persistExperimentDefaults({ seed: v }); }}>Randomise</Btn>
              </div>
              <div style={helperStyle}>
                Use the same value to repeat the same random pattern.
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={{ fontSize: 10, color: C.label, fontFamily: FONT, letterSpacing: 1.2, fontWeight: 700 }}>WHEN SHOULD THE RUN STOP?</span>
              <div style={{ display: "flex", gap: 12, alignItems: "center", height: 32 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 12, color: C.text, fontFamily: FONT }}>
                  <input type="radio" name="terminationMode" checked={terminationMode === "time"} onChange={() => {
                    setTerminationMode("time");
                    persistExperimentDefaults({ terminationMode: "time", maxSimTime, terminationCondition: null });
                  }} />
                  After a fixed duration
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 12, color: C.text, fontFamily: FONT }}>
                  <input type="radio" name="terminationMode" checked={terminationMode === "condition"} onChange={() => {
                    setTerminationMode("condition");
                    persistExperimentDefaults({ terminationMode: "condition", terminationCondition });
                  }} />
                  When a rule becomes true
                </label>
              </div>
              <div style={helperStyle}>
                Choose whether the model stops after a set duration or when a business rule is reached.
              </div>
            </div>

            {terminationMode === "time" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={{ fontSize: 10, color: C.label, fontFamily: FONT, letterSpacing: 1.2, fontWeight: 700 }}>RUN FOR</span>
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
                <div style={helperStyle}>
                  The model stops after this amount of simulated time.
                </div>
              </div>
            )}
          </div>

          {terminationMode === "condition" && (
            <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 14 }}>
              <span style={{ fontSize: 10, color: C.label, fontFamily: FONT, letterSpacing: 1.2, fontWeight: 700, display: "block", marginBottom: 8 }}>STOP WHEN THIS BECOMES TRUE</span>
              <div style={{ ...helperStyle, marginBottom: 8, maxWidth: "none" }}>
                Use a rule if the run should stop when a business condition is reached.
              </div>
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

          <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 14 }}>
            <span style={{ fontSize: 10, color: C.label, fontFamily: FONT, letterSpacing: 1.2, fontWeight: 700, display: "block", marginBottom: 10 }}>EXTRA OPTIONS</span>
            <div style={{ display: "flex", gap: 20, flexWrap: "wrap", alignItems: "center" }}>
              <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 12, color: animationEnabled ? C.accent : C.label, fontFamily: FONT }}
                title="Show entity tokens moving between nodes during auto-run">
                <input
                  type="checkbox"
                  checked={!!animationEnabled}
                  onChange={e => setAnimationEnabled?.(e.target.checked)}
                  style={{ accentColor: C.accent }}
                />
                Show movement during auto-run
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 12, color: collectTimeSeries ? C.accent : C.label, fontFamily: FONT }}
                title="Disable to reduce memory on long runs (charts won't have queue depth / utilisation)">
                <input
                  type="checkbox"
                  checked={!!collectTimeSeries}
                  onChange={e => setCollectTimeSeries?.(e.target.checked)}
                  style={{ accentColor: C.accent }}
                />
                Keep chart data during the run
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 12, color: purgePeriodEnabled ? C.server : C.label, fontFamily: FONT }}
                title="Block new arrivals after max sim time and let in-flight entities complete before ending the run">
                <input
                  type="checkbox"
                  checked={!!purgePeriodEnabled}
                  onChange={e => setPurgePeriodEnabled?.(e.target.checked)}
                  style={{ accentColor: C.server }}
                />
                Let in-flight entities complete
              </label>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={{ fontSize: 10, color: C.label, fontFamily: FONT, letterSpacing: 1.2, fontWeight: 700 }}>ARCHIVE DETAIL</span>
                <div style={{ display: "flex", gap: 2, background: C.bg, borderRadius: 5, padding: 2, width: "fit-content" }}>
                  {[
                    { value: "minimal", label: "Minimal" },
                    { value: "compact", label: "Compact" },
                    { value: "full",    label: "Full" },
                  ].map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => { setSaveDetailLevel?.(opt.value); persistExperimentDefaults?.({ resultDetailLevel: opt.value }); }}
                      style={{ background: saveDetailLevel === opt.value ? C.border : "transparent", border: "none", borderRadius: 4, color: saveDetailLevel === opt.value ? C.text : C.muted, cursor: "pointer", fontFamily: FONT, fontSize: 11, padding: "5px 12px" }}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div style={{ ...helperStyle, marginTop: 8, maxWidth: 420 }}>
              <strong style={{ color: C.text }}>Minimal</strong> — summary stats only, fastest save.{" "}
              <strong style={{ color: C.text }}>Compact</strong> — adds chart data sampled to 200 points (default).{" "}
              <strong style={{ color: C.text }}>Full</strong> — keeps per-entity log, trace, and raw wait distributions; slowest save.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
