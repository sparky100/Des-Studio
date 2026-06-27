import { useState, useEffect } from "react";
import { Btn } from "../shared/components.jsx";
import { useTheme } from "../shared/ThemeContext.jsx";
import { downloadTextFile, slugifyResultName } from "../shared/utils.js";
import { exportToSimPy } from "../../engine/simpy-export.js";

export function SimPyExportModal({ model, onClose }) {
  const { C, FONT } = useTheme();
  const [result, setResult] = useState(null);

  useEffect(() => {
    try { setResult(exportToSimPy(model)); }
    catch (e) { setResult({ error: e.message }); }
  }, [model]);

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
  const warnings = result.warnings || [];

  return (
    <div style={{ position:"fixed",inset:0,background:"rgba(0,0,0,0.6)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:200,padding:16 }}>
      <div role="dialog" aria-modal="true" aria-label="Export SimPy" style={{ background:C.panel,border:`1px solid ${C.border}`,borderRadius:10,padding:24,width:"min(540px,100%)",fontFamily:FONT,display:"flex",flexDirection:"column",gap:16 }}>
        <div style={{ fontSize:15,fontWeight:700,color:C.text }}>Export SimPy</div>

        <div style={{ fontSize:11,color:C.muted,lineHeight:1.6 }}>
          This generates a standalone Python script you can run outside DES Studio with <code style={{ color:C.accent,fontFamily:FONT }}>pip install simpy</code>. It's a portable starting point for further work in Python — not a validated cross-check against this model's own simulation results, since SimPy's resource model can't reproduce every aspect of the Three-Phase engine used here.
        </div>

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
              : warnings.length > 0
                ? "This script is runnable with no manual edits, but see the caveats below — results in those areas may diverge from this model's own simulation engine."
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

        {/* Caveats */}
        {warnings.length > 0 && (
          <div style={{ background:C.surface,border:`1px solid ${C.amber}66`,borderRadius:8,padding:14,display:"flex",flexDirection:"column",gap:8 }}>
            <div style={{ fontSize:12,fontWeight:700,color:C.amber }}>Caveats — not auto-translated</div>
            <ul style={{ margin:0,paddingLeft:18,display:"flex",flexDirection:"column",gap:4 }}>
              {warnings.map((w, i) => (
                <li key={i} style={{ fontSize:11,color:C.muted,lineHeight:1.5 }}>{w}</li>
              ))}
            </ul>
          </div>
        )}

        {/* File info */}
        <div style={{ fontSize:12,color:C.muted }}>
          Output file: <span style={{ color:C.text,fontFamily:FONT }}>{filename}</span>
        </div>

        {/* Buttons */}
        <div style={{ display:"flex",gap:8,justifyContent:"flex-end",flexWrap:"wrap" }}>
          <Btn small variant="ghost" onClick={onClose}>Close</Btn>
          <Btn small variant="primary" onClick={handleDownload}>Download .py</Btn>
        </div>
      </div>
    </div>
  );
}
