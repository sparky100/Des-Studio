const ExecutePanel = ({ model, modelId, userId }) => {
  const [mode, setMode] = useState("idle");
  const [currentSnap, setCurrentSnap] = useState(null);
  const [log, setLog] = useState([]);
  const [view, setView] = useState("visual");
  const [autoSpeed, setAutoSpeed] = useState(400);
  const [autoRunning, setAutoRunning] = useState(false);
  const [saveStatus, setSaveStatus] = useState(null);
  const engineRef = useRef(null);
  const autoRef = useRef(null);

  const initEngine = useCallback(() => {
    engineRef.current = buildEngine(model);
    setCurrentSnap(engineRef.current.getSnap());
    setLog([{ phase: "INIT", time: 0, message: "Simulation Initialized" }]);
    setMode("stepping");
    setSaveStatus(null);
  }, [model]);

  const doStep = useCallback(() => {
    if (!engineRef.current) return;
    const r = engineRef.current.step();
    setCurrentSnap(r.snap);
    setLog(prev => [...prev, ...(r.cycleLog || [])]);

    if (r.done) {
      setMode("done");
      stopAuto();

      if (userId && modelId) {
        // Construct the result object for the DB
        const fullResult = {
          snap: r.snap,
          summary: {
            total: r.snap.entities.filter(e => e.role !== 'server').length,
            served: r.snap.served || 0,
            reneged: r.snap.reneged || 0,
          },
        };

        setSaveStatus({ state: 'saving', message: 'Saving results...' });
        // TRIGGER LOG UI
        setLog(prev => [...prev, { phase: "SAVE", time: r.snap.clock, message: "💾 Auto-saving simulation run..." }]);

        saveSimulationRun(modelId, userId, fullResult)
          .then(() => {
            setSaveStatus({ state: 'success', message: '✓ Saved' });
            setLog(prev => [...prev, { phase: "SAVE", time: r.snap.clock, message: "✅ History saved to database." }]);
          })
          .catch(e => {
            setSaveStatus({ state: 'error', message: '✗ Save Failed' });
            setLog(prev => [...prev, { phase: "ERROR", time: r.snap.clock, message: `❌ Save failed: ${e.message}` }]);
          });
      }
    }
  }, [userId, modelId]);

  const doRunAll = useCallback(async () => {
    stopAuto();
    if (!userId || !modelId) {
      setSaveStatus({ state: 'error', message: '✗ Missing IDs' });
      return;
    }

    // 1. Initialize and execute full run
    const engine = buildEngine(model);
    const result = engine.runAll(); // Corrected from .run() to .runAll()
    
    setCurrentSnap(result.snap);
    setLog(result.log); // Engine returns full log history
    setMode("done");

    // 2. Handle DB Persistence
    setSaveStatus({ state: 'saving', message: 'Saving full results...' });
    setLog(prev => [...prev, { phase: "SAVE", time: result.snap.clock, message: "💾 Committing simulation history..." }]);

    try {
      await saveSimulationRun(modelId, userId, result);
      setSaveStatus({ state: 'success', message: '✓ History Saved' });
      setLog(prev => [...prev, { phase: "SAVE", time: result.snap.clock, message: "✅ Full history successfully recorded." }]);
    } catch (e) {
      setSaveStatus({ state: 'error', message: '✗ Save Failed' });
      setLog(prev => [...prev, { phase: "ERROR", time: result.snap.clock, message: `❌ DB Error: ${e.message}` }]);
    }
  }, [model, userId, modelId]);

  // ... rest of your component (stopAuto, toggleAuto, return block) remains the same
