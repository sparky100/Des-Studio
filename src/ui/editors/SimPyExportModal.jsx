import { useState, useEffect } from "react";
import { Btn, SH } from "../shared/components.jsx";
import { useTheme } from "../shared/ThemeContext.jsx";
import { downloadTextFile, slugifyResultName } from "../shared/utils.js";
import { exportToSimPy } from "../../engine/simpy-export.js";
import { useSimPyRunner } from "../hooks/useSimPyRunner.js";

export function SimPyExportModal({ model, onClose, onResultsReady }) {
  const { C, FONT } = useTheme();
  const [result, setResult] = useState(null);
  const { run, cancel, reset, status, progress, total, results, error: runError } = useSimPyRunner(model);

  useEffect(() => {
    try { setResult(exportToSimPy(model)); }
    catch (e) { setResult({ error: e.message }); }
  }, [model]);

  useEffect(() => {
    if (results && onResultsReady) onResultsReady(results);
  }, [results, onResultsReady]);

  if (!result) return null;

  const filename = `${slugifyResultName(model.name)}_simpy.py`;

  const handleDownload = () => {
    downloadTextFile(result.script, filename, "text/x-python");
    onClose();
  };

  if (result.error) {
    return (
      <div style={{ position:"fixed",inset:0,background:"rgba(0,0,0,0.6)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:200,padding:16 }}>
        <div role="dialog" aria-modal="true" aria-label="Export SimPy — error" style={{ background:C.panel,border:`1px solid ${C.border}`,borderRadius:10,padding:24,width:"min(480px,100%)",fontFamily:FONT,display:"flex",flexDirection:"column",gap:14 }}>
          <div style={{ fontSize:15,fontWeight:700,color:C.text }}>Export SimPy</div>
          <div style={{ fontSize:12,color:C.red }}>{result.error}</div>
          <Btn small variant="ghost" onClick={onClose}>Close</Btn>
        </div>
      </div>
    );
  }

  const isCategory2 = result.category === 2;
  const isRunning = status === "loading" || status === "running";

  return (
    <div style={{ position:"fixed",inset:0,background:"rgba(0,0,0,0.6)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:200,padding:16 }}>
      <div role="dialog" aria-modal="true" aria-label="Export SimPy" style={{ background:C.panel,border:`1px solid ${C.border}`,borderRadius:10,padding:24,width:"min(540px,100%)",fontFamily:FONT,display:"flex",flexDirection:"column",gap:16 }}>
        <div style={{ fontSize:15,fontWeight:700,color:C.text }}>Export SimPy</div>

        {/* Completeness card */}
        <div style={{ background:C.surface,border:`1px solid ${isCategory2 ? C.amber+"66" : C.green+"66"}`,borderRadius:8,padding:14,display:"flex",flexDirection:"column",gap:8 }}>
          <div style={{ display:"flex",alignItems:"center",gap:8 }}>
            <span style={{ fontSize:11,fontWeight:700,letterSpacing:"0.04em",color:isCategory2?C.amber:C.green,background:isCategory2?C.amber+"22":C.green+"22",border:`1px solid ${isCategory2?C.amber+"44":C.green+"44"}`,borderRadius:4,padding:"2px 8px" }}>
              {isCategory2 ? "CATEGORY 2 — PARTIAL" : "CATEGORY 1 — COMPLETE"}
            </span>
          </div>
          <div style={{ fontSize:12,color:C.muted,lineHeight:1.6 }}>
            {isCategory2
              ? "This script runs but requires manual completion. The macros listed below have been replaced with annotated # TODO stubs."
              : "This script is fully runnable. No manual edits are required before executing it."}
          </div>
          {isCategory2 && result.todoMacros.length > 0 && (
            <div style={{ display:"flex",flexWrap:"wrap",gap:6,marginTop:2 }}>
              {result.todoMacros.map(m => (
                <span key={m} style={{ fontSize:11,fontFamily:FONT,color:C.amber,background:C.amber+"18",border:`1px solid ${C.amber+"44"}`,borderRadius:4,padding:"2px 8px" }}>{m}</span>
              ))}
            </div>
          )}
        </div>

        {/* File info */}
        <div style={{ fontSize:12,color:C.muted }}>
          Output file: <span style={{ color:C.text,fontFamily:FONT }}>{filename}</span>
        </div>

        <div style={{ fontSize:11,color:C.muted,lineHeight:1.6 }}>
          Install SimPy with <code style={{ color:C.accent,fontFamily:FONT }}>pip install simpy</code> before running.
        </div>

        {/* Run in Browser section */}
        {(status !== "idle" || results || runError) && (
          <div style={{ background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:14,display:"flex",flexDirection:"column",gap:10 }}>
            <div style={{ fontSize:12,fontWeight:600,color:C.text }}>Run in Browser</div>

            {(status === "loading") && (
              <div style={{ fontSize:12,color:C.muted }}>Loading Pyodide + SimPy (~25 MB, cached after first use)…</div>
            )}

            {(status === "loading" || status === "running") && (
              <div style={{ display:"flex",flexDirection:"column",gap:4 }}>
                <div style={{ fontSize:11,color:C.muted }}>
                  {status === "loading" ? "Initialising…" : `Replication ${progress} of ${total}`}
                </div>
                <div style={{ height:6,borderRadius:3,background:C.border,overflow:"hidden" }}>
                  <div style={{ height:"100%",borderRadius:3,background:C.accent,width:`${total > 0 ? (progress/total)*100 : 0}%`,transition:"width 0.2s" }} />
                </div>
              </div>
            )}

            {status === "done" && results && (
              <div style={{ display:"flex",flexDirection:"column",gap:6 }}>
                <div style={{ fontSize:11,color:C.green,fontWeight:600 }}>✓ Complete — {results.replications?.length ?? 0} replication{results.replications?.length !== 1 ? "s" : ""}</div>
                <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:"4px 16px" }}>
                  {[
                    ["Served", results.summary.served],
                    ["Reneged", results.summary.reneged],
                    ["Avg sojourn", results.summary.avgSojourn?.toFixed(3)],
                    ["Avg wait", results.summary.avgWait?.toFixed(3)],
                  ].map(([label, val]) => (
                    <div key={label} style={{ fontSize:11,color:C.muted }}>
                      {label}: <span style={{ color:C.text }}>{val}</span>
                    </div>
                  ))}
                </div>
                {Object.keys(results.summary.perResource ?? {}).length > 0 && (
                  <div style={{ display:"flex",flexWrap:"wrap",gap:"4px 12px" }}>
                    {Object.entries(results.summary.perResource).map(([k, v]) => (
                      <div key={k} style={{ fontSize:11,color:C.muted }}>
                        {k} util: <span style={{ color:C.text }}>{(v.utilisation * 100).toFixed(1)}%</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {status === "error" && runError && (
              <div style={{ fontSize:11,color:C.red,lineHeight:1.5 }}>{runError}</div>
            )}
          </div>
        )}

        {/* Buttons */}
        <div style={{ display:"flex",gap:8,justifyContent:"flex-end",flexWrap:"wrap" }}>
          {isRunning ? (
            <Btn small variant="ghost" onClick={cancel}>Cancel</Btn>
          ) : (
            <Btn small variant="ghost" onClick={() => { reset(); onClose(); }}>Cancel</Btn>
          )}
          <Btn small variant="ghost" onClick={handleDownload} disabled={isRunning}>Download .py</Btn>
          <Btn
            small
            variant={isCategory2 ? "ghost" : "primary"}
            disabled={isCategory2 || isRunning}
            title={isCategory2 ? "Category 2 models require manual edits before running in the browser" : "Run the SimPy model directly in this browser tab via Pyodide WebAssembly"}
            onClick={run}
          >
            {isRunning ? "Running…" : "Run in Browser"}
          </Btn>
        </div>
      </div>
    </div>
  );
}
