// ui/execute/index.jsx — CustomerToken, VisualView, ExecutePanel
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { C, FONT } from "../shared/tokens.js";
import { Tag, PhaseTag, Btn, SH, InfoBox, Empty } from "../shared/components.jsx";
import { buildEngine } from "../../engine/index.js";
import { saveSimulationRun } from "../../db/models.js";
import { validateModel } from "../../engine/validation.js";

const TOKEN_COLORS = ["#06b6d4", "#f59e0b", "#8b5cf6", "#3fb950", "#f87171", "#a78bfa", "#34d399", "#fbbf24"];
const tokenColor = (id) => TOKEN_COLORS[(id - 1) % TOKEN_COLORS.length];

const CustomerToken = ({ entity, size = 36, showId = true }) => {
  const col = tokenColor(entity.id);
  const statusBorder = { waiting: C.waiting, serving: C.serving, done: C.served, reneged: C.reneged, idle: C.green, busy: C.amber }[entity.status] || C.muted;
  return (
    <div title={`#${entity.id} ${entity.type} — ${entity.status}\narrived t=${entity.arrivalTime?.toFixed?.(2)}`}
      style={{
        width: size, height: size, borderRadius: "50%", background: col + "22", border: `2.5px solid ${statusBorder}`,
        display: "flex", alignItems: "center", justifyContent: "center", fontFamily: FONT, fontSize: size * 0.28,
        fontWeight: 700, color: col, flexShrink: 0, cursor: "default", transition: "all .2s",
        boxShadow: entity.status === "serving" ? `0 0 8px ${col}66` : "none"
      }}>
      {showId ? `#${entity.id}` : ""}
    </div>
  );
};

const ServerBay = ({ server, customers }) => {
  const servingCust = customers.find(e => e.id === server.currentCustId);
  const isB = server.status === "busy";
  const borderCol = isB ? C.busy : C.idle;
  return (
    <div style={{
      background: "#1a1a1a", border: `2px solid ${borderCol}44`, borderRadius: 10, padding: 14,
      display: "flex", flexDirection: "column", gap: 10, minWidth: 160, position: "relative"
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "space-between" }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 12, color: "#a78bfa", fontFamily: FONT }}>Server #{server.id}</div>
          <div style={{ fontSize: 10, color: "#9ca3af", fontFamily: FONT }}>{server.type}</div>
        </div>
        <Tag label={server.status} color={isB ? C.amber : C.green} />
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, justifyContent: "center" }}>
        <div style={{
          width: 48, height: 48, borderRadius: 8, background: "#a78bfa18", border: `2px solid #a78bfa55`,
          display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0
        }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <rect x="3" y="6" width="18" height="4" rx="1" stroke="#a78bfa" strokeWidth="1.5" />
            <rect x="3" y="13" width="18" height="4" rx="1" stroke="#a78bfa" strokeWidth="1.5" />
            <circle cx="6.5" cy="8" r="1" fill={isB ? C.amber : C.green} />
          </svg>
        </div>
        {servingCust ? (
          <><div style={{ fontSize: 18, color: "#4b5563" }}>→</div><CustomerToken entity={servingCust} size={44} /></>
        ) : (
          <div style={{ fontSize: 11, color: "#4b5563", fontFamily: FONT, fontStyle: "italic" }}>idle</div>
        )}
      </div>
    </div>
  );
};

const VisualView = ({ snap, model }) => {
  if (!snap) return <Empty icon="▶" msg="Run or step the simulation to see the visual view." />;

  const allEntities = snap.entities || [];
  const servers = allEntities.filter(e => e.role === "server");
  const customers = allEntities.filter(e => e.role !== "server");
  const waiting = customers.filter(e => e.status === "waiting");
  const definedQueues = model.queues || [];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: 16, alignItems: "start" }}>
        <div style={{ background: "#111", border: `2px solid #a855f744`, borderRadius: 12, padding: "20px 28px", textAlign: "center", minWidth: 140 }}>
          <div style={{ fontSize: 10, color: "#9ca3af", fontFamily: FONT, letterSpacing: 2, marginBottom: 6 }}>SIM CLOCK</div>
          <div style={{ fontSize: 40, fontWeight: 700, color: "#a855f7", fontFamily: FONT, lineHeight: 1 }}>
            {parseFloat(snap.clock).toFixed(2)}
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8 }}>
          {[
            { label: "Arrived", value: customers.length, color: "#38bdf8" },
            { label: "Served", value: snap.served || 0, color: "#10b981" },
            { label: "Reneged", value: snap.reneged || 0, color: "#ef4444" },
            { label: "Waiting", value: waiting.length, color: "#f59e0b" },
          ].map(s => (
            <div key={s.label} style={{ background: "#1a1a1a", border: `1px solid #333`, borderRadius: 8, padding: 10, textAlign: "center" }}>
              <div style={{ fontSize: 9, color: "#888", fontWeight: 700, marginBottom: 4 }}>{s.label.toUpperCase()}</div>
              <div style={{ fontSize: 20, color: s.color, fontWeight: 700 }}>{s.value}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        {servers.map(srv => <ServerBay key={srv.id} server={srv} customers={customers} />)}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ fontSize: 10, color: "#9ca3af", fontFamily: FONT, letterSpacing: 1.5, fontWeight: 700 }}>QUEUE LANES</div>
        {definedQueues.length > 0 ? (
          definedQueues.map((qDef, idx) => {
            const qName = qDef.name;
            const qEntities = waiting.filter(e => e.queue === qName || (idx === 0 && !e.queue));
            return (
              <div key={qName} style={{ background: "#111", border: `1px solid #333`, borderLeft: `4px solid ${C.cEvent || '#8b5cf6'}`, borderRadius: 8, padding: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: "#fff", fontFamily: FONT }}>{qName.toUpperCase()}</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: qEntities.length > 0 ? "#f59e0b" : "#fff", fontFamily: FONT }}>{qEntities.length}</span>
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', minHeight: 40 }}>
                  {qEntities.length === 0 ? <span style={{ fontSize: 11, color: "#444", fontStyle: "italic" }}>empty</span> : qEntities.map(e => <CustomerToken key={e.id} entity={e} size={32} />)}
                </div>
              </div>
            );
          })
        ) : (
          <div style={{ background: "#111", border: `1px solid #333`, borderRadius: 8, padding: 12 }}>
            <div style={{ fontSize: 11, color: "#f59e0b", fontWeight: 700, marginBottom: 8 }}>GENERAL QUEUE</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{waiting.map(e => <CustomerToken key={e.id} entity={e} size={32} />)}</div>
          </div>
        )}
      </div>
    </div>
  );
};

const ExecutePanel = ({ model, modelId, userId }) => {
  const [mode, setMode] = useState("idle");
  const [currentSnap, setCurrentSnap] = useState(null);
  const [log, setLog] = useState([]);
  const [view, setView] = useState("visual");
  const [autoSpeed, setAutoSpeed] = useState(400);
  const [autoRunning, setAutoRunning] = useState(false);
  const [saveStatus, setSaveStatus] = useState(null);
  const [phaseCTruncated, setPhaseCTruncated] = useState(false);
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 1e9));
  const runSeedRef = useRef(seed);
  const engineRef = useRef(null);
  const autoRef = useRef(null);

  const validation = useMemo(() => validateModel(model), [model]);
  const hasErrors = validation.errors.length > 0;

  const initEngine = useCallback(() => {
    if (hasErrors) return;
    runSeedRef.current = seed;
    engineRef.current = buildEngine(model, seed);
    setCurrentSnap(engineRef.current.getSnap());
    setLog([{ phase: "INIT", time: 0, message: `Simulation initialized  (seed: ${seed})` }]);
    setMode("stepping");
    setSaveStatus(null);
    setPhaseCTruncated(false);
  }, [model, seed, hasErrors]);

  const stopAuto = () => { if (autoRef.current) { clearInterval(autoRef.current); autoRef.current = null; setAutoRunning(false); } };

  const doStep = useCallback(() => {
    if (!engineRef.current) return;
    const r = engineRef.current.step();
    setCurrentSnap(r.snap);
    setLog(prev => [...prev, ...(r.cycleLog || [])]);
    if (r.phaseCTruncated) setPhaseCTruncated(true);

    if (r.done) {
      setMode("done");
      stopAuto();
      if (userId && modelId) {
        const fullResult = {
          snap: r.snap,
          summary: {
            total: r.snap?.entities?.filter(e => e.role !== 'server').length || 0,
            served: r.snap?.served || 0,
            reneged: r.snap?.reneged || 0,
          },
        };
        setSaveStatus({ state: 'saving', message: 'Saving results...' });
        setLog(prev => [...prev, { phase: "SAVE", time: r.snap.clock, message: "💾 Auto-saving simulation results..." }]);
        
        saveSimulationRun(modelId, userId, fullResult, { seed: runSeedRef.current })
          .then(() => {
            setSaveStatus({ state: 'success', message: '✓ Saved successfully!' });
            setLog(prev => [...prev, { phase: "SAVE", time: r.snap.clock, message: "✅ History record completed." }]);
          })
          .catch(e => {
            setSaveStatus({ state: 'error', message: `✗ Save failed: ${e.message}` });
            setLog(prev => [...prev, { phase: "ERROR", time: r.snap.clock, message: `❌ Save error: ${e.message}` }]);
          });
      }
    }
  }, [userId, modelId]);

  const doRunAll = useCallback(async () => {
    stopAuto();
    if (hasErrors) return;
    if (!userId || !modelId) {
      setSaveStatus({ state: 'error', message: '✗ Missing User/Model ID' });
      return;
    }

    const runSeed = seed;
    const engine = buildEngine(model, runSeed);
    const result = engine.runAll();

    setCurrentSnap(result.snap);
    setLog(result.log);
    setMode("done");
    if (result.summary?.phaseCTruncated) setPhaseCTruncated(true);

    setSaveStatus({ state: 'saving', message: 'Saving results...' });
    setLog(prev => [...prev, { phase: "SAVE", time: result.snap.clock, message: "💾 Committing simulation history to database..." }]);

    try {
      await saveSimulationRun(modelId, userId, result, { seed: runSeed });
      setSaveStatus({ state: 'success', message: '✓ History saved successfully!' });
      setLog(prev => [...prev, { phase: "SAVE", time: result.snap.clock, message: "✅ History commit complete." }]);
    } catch (e) {
      setSaveStatus({ state: 'error', message: `✗ Failed to save: ${e.message}` });
      setLog(prev => [...prev, { phase: "ERROR", time: result.snap.clock, message: `❌ Database error: ${e.message}` }]);
    }
  }, [model, userId, modelId, seed, hasErrors]);

  const toggleAuto = () => {
    if (autoRunning) { stopAuto(); return; }
    if (mode === "idle") initEngine();
    setAutoRunning(true);
    autoRef.current = setInterval(() => doStep(), autoSpeed);
  };

  useEffect(() => () => stopAuto(), []);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ background: "#1a1a1a", border: `1px solid #333`, borderRadius: 8, padding: 14, display: "flex", gap: 10, alignItems: "center" }}>
        <Btn variant="primary" onClick={initEngine} disabled={hasErrors}>⟳ Reset</Btn>
        <Btn variant="success" onClick={doStep} disabled={mode === "done" || hasErrors}>⏭ Step</Btn>
        <Btn variant={autoRunning ? "danger" : "amber"} onClick={toggleAuto} disabled={hasErrors}>{autoRunning ? "Stop Auto" : "Auto Run"}</Btn>
        <Btn variant="ghost" onClick={doRunAll} disabled={hasErrors}>⚡ Run All</Btn>
        <div style={{ flex: 1 }} />
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ fontSize: 10, color: "#666", fontFamily: FONT }}>seed:</span>
          <input
            type="number"
            value={seed}
            onChange={e => setSeed(parseInt(e.target.value) || 0)}
            style={{ width: 80, background: "transparent", border: "1px solid #333",
              borderRadius: 4, color: C.amber, fontFamily: FONT, fontSize: 11,
              padding: "4px 6px", outline: "none" }}
          />
          <Btn small variant="ghost" onClick={() => setSeed(Math.floor(Math.random() * 1e9))}>rand</Btn>
        </div>
        <div style={{ display: "flex", background: "#000", borderRadius: 6, padding: 2 }}>
          {["visual", "log", "entities"].map(v => (
            <button key={v} onClick={() => setView(v)} style={{ padding: "6px 12px", background: view === v ? "#333" : "transparent", border: "none", color: view === v ? "#fff" : "#888", borderRadius: 4, cursor: "pointer", fontSize: 12 }}>
              {v.charAt(0).toUpperCase() + v.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {validation.errors.length > 0 && (
        <div style={{ background: '#7f1d1d', border: '1px solid #dc2626', borderRadius: 6,
          padding: 12, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#fca5a5', fontFamily: FONT, marginBottom: 4 }}>
            Model has {validation.errors.length} blocking error{validation.errors.length > 1 ? 's' : ''} — fix before running:
          </div>
          {validation.errors.map((e, i) => (
            <div key={i} style={{ fontSize: 12, color: '#fca5a5', fontFamily: FONT }}>
              [{e.code}] {e.message}
            </div>
          ))}
        </div>
      )}

      {validation.errors.length === 0 && validation.warnings.length > 0 && (
        <div style={{ background: '#78350f', border: '1px solid #d97706', borderRadius: 6, padding: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#fde68a', fontFamily: FONT, marginBottom: 4 }}>
            {validation.warnings.length} warning{validation.warnings.length > 1 ? 's' : ''} — run will proceed:
          </div>
          {validation.warnings.map((w, i) => (
            <div key={i} style={{ fontSize: 12, color: '#fde68a', fontFamily: FONT }}>
              [{w.code}] {w.message}
            </div>
          ))}
        </div>
      )}

      {phaseCTruncated && (
        <div style={{ background: '#78350f', border: '1px solid #d97706', borderRadius: 6, padding: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#fde68a', fontFamily: FONT }}>
            Phase C scan hit the 500-pass cap — model may have an unstable or conflicting C-event condition
          </div>
          <div style={{ fontSize: 11, color: '#fde68a', fontFamily: FONT, marginTop: 4, opacity: 0.8 }}>
            Check your C-event conditions for cycles or conditions that never become false.
          </div>
        </div>
      )}

      {saveStatus && (
        <div style={{
          background: saveStatus.state === 'error' ? '#7f1d1d' : saveStatus.state === 'success' ? '#1b4332' : '#1f2937',
          border: `1px solid ${saveStatus.state === 'error' ? '#dc2626' : saveStatus.state === 'success' ? '#31a24c' : '#4b5563'}`,
          borderRadius: 6, padding: 12, color: saveStatus.state === 'error' ? '#fca5a5' : saveStatus.state === 'success' ? '#86efac' : '#e5e7eb',
          fontSize: 12, fontFamily: FONT,
        }}>
          {saveStatus.message}
        </div>
      )}

      {view === "visual" && <VisualView snap={currentSnap} model={model} />}

      {view === "log" && (
        <div style={{ background: "#050505", border: `1px solid #333`, borderRadius: 6, padding: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, paddingBottom: 10, borderBottom: `1px solid #333` }}>
            <div style={{ fontSize: 10, color: "#9ca3af", fontFamily: FONT, letterSpacing: 1.5, fontWeight: 700 }}>SIMULATION LOG (NEWEST FIRST)</div>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#a78bfa", fontFamily: FONT }}>
              Steps: {log.length} | Clock: {currentSnap?.clock?.toFixed(2) || '—'}
            </div>
          </div>
          <div style={{ maxHeight: 350, overflowY: 'auto' }}>
            {log.length === 0 ? <div style={{ color: "#444", fontSize: 12 }}>Log empty. Run simulation to see events.</div> :
              [...log].reverse().map((r, i) => (
                <div key={i} style={{ fontSize: 12, fontFamily: "monospace", color: "#10b981", borderBottom: "1px solid #1a1a1a", padding: "4px 0" }}>
                  <span style={{ color: "#666" }}>[t={r.time?.toFixed(2)}]</span> <PhaseTag phase={r.phase} /> {r.message}
                </div>
              ))
            }
          </div>
        </div>
      )}

      {view === "entities" && currentSnap && (
        <div style={{ background: "#050505", border: `1px solid #333`, borderRadius: 6, padding: 14 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", color: "#fff", fontSize: 12, textAlign: "left" }}>
            <thead>
              <tr style={{ color: "#888", borderBottom: "2px solid #333" }}>
                <th style={{ padding: 8 }}>Entity</th><th style={{ padding: 8 }}>Type</th><th style={{ padding: 8 }}>Status</th><th style={{ padding: 8 }}>Queue</th>
              </tr>
            </thead>
            <tbody>
              {currentSnap.entities.map(e => (
                <tr key={e.id} style={{ borderBottom: "1px solid #1a1a1a" }}>
                  <td style={{ padding: 8, color: "#38bdf8" }}>#{e.id}</td>
                  <td style={{ padding: 8 }}>{e.type}</td>
                  <td style={{ padding: 8 }}><Tag label={e.status} color={e.status === 'waiting' ? "#f59e0b" : "#10b981"} /></td>
                  <td style={{ padding: 8, color: "#666" }}>{e.queue || "None"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export { CustomerToken, VisualView, ExecutePanel };
