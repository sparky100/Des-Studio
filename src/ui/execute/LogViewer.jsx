// ui/execute/LogViewer.jsx — filterable, searchable simulation event log

import { useState, useMemo } from "react";
import { C, FONT } from "../shared/tokens.js";
import { Btn, PhaseTag } from "../shared/components.jsx";
import { downloadTextFile } from "./executeHelpers.js";

const ALL_PHASES = ["B", "C", "A", "INIT", "WARMUP", "REP", "SAVE", "ERROR", "CANCEL", "END"];

function buildCsvFromLog(log) {
  const header = "phase,time,message";
  const rows = [...log].reverse().map(r =>
    [r.phase, r.time?.toFixed?.(3) ?? r.time ?? "", String(r.message || "").replace(/"/g, '""')]
      .map(v => `"${v}"`).join(",")
  );
  return [header, ...rows].join("\n");
}

export function LogViewer({ log = [], currentClock }) {
  const [phaseFilter, setPhaseFilter] = useState(new Set());
  const [search, setSearch] = useState("");

  const presentPhases = useMemo(() => {
    const s = new Set(log.map(r => r.phase).filter(Boolean));
    return ALL_PHASES.filter(p => s.has(p));
  }, [log]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return [...log].reverse().filter(r => {
      if (phaseFilter.size > 0 && !phaseFilter.has(r.phase)) return false;
      if (q && !String(r.message || "").toLowerCase().includes(q) && !String(r.phase || "").toLowerCase().includes(q)) return false;
      return true;
    });
  }, [log, phaseFilter, search]);

  const togglePhase = (p) => setPhaseFilter(prev => {
    const next = new Set(prev);
    next.has(p) ? next.delete(p) : next.add(p);
    return next;
  });

  const exportCsv = () => {
    downloadTextFile(buildCsvFromLog(log), `simulation-log-${Date.now()}.csv`, "text/csv");
  };

  return (
    <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 6, padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
      {/* Header row */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, paddingBottom: 10, borderBottom: `1px solid ${C.border}` }}>
        <div style={{ fontSize: 10, color: C.muted, fontFamily: FONT, letterSpacing: 1.5, fontWeight: 700 }}>
          SIMULATION LOG — {log.length} entries
          {currentClock != null && <span style={{ marginLeft: 8, color: C.server }}>clock {parseFloat(currentClock).toFixed(1)}</span>}
        </div>
        <Btn small variant="ghost" onClick={exportCsv} title="Export log as CSV">↓ CSV</Btn>
      </div>

      {/* Phase filter chips */}
      {presentPhases.length > 0 && (
        <div style={{ display: "flex", gap: 5, flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ fontSize: 10, color: C.muted, fontFamily: FONT }}>Phase:</span>
          {presentPhases.map(p => {
            const active = phaseFilter.has(p);
            return (
              <button key={p} onClick={() => togglePhase(p)}
                style={{ background: active ? C.cEvent + "33" : "transparent",
                  border: `1px solid ${active ? C.cEvent : C.border}`,
                  borderRadius: 4, padding: "2px 8px", fontSize: 10, fontFamily: FONT,
                  color: active ? C.cEvent : C.muted, cursor: "pointer", fontWeight: active ? 700 : 400 }}>
                {p}
              </button>
            );
          })}
          {phaseFilter.size > 0 && (
            <button onClick={() => setPhaseFilter(new Set())}
              style={{ background: "transparent", border: "none", color: C.muted, fontSize: 10, cursor: "pointer", fontFamily: FONT }}>
              clear
            </button>
          )}
        </div>
      )}

      {/* Search */}
      <input
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="Search log (entity ID, event name, message…)"
        style={{ background: "transparent", border: `1px solid ${C.border}`, borderRadius: 4,
          color: C.text, fontFamily: FONT, fontSize: 11, padding: "5px 9px", outline: "none", width: "100%", boxSizing: "border-box" }}
      />

      {/* Log entries */}
      <div style={{ maxHeight: 380, overflowY: "auto", display: "flex", flexDirection: "column", gap: 1 }}>
        {filtered.length === 0 ? (
          <div style={{ color: C.muted, fontSize: 12, fontFamily: FONT, padding: "8px 0" }}>
            {log.length === 0 ? "Log empty. Run simulation to see events." : "No entries match filter."}
          </div>
        ) : filtered.map((r, i) => (
          <div key={i}>
            {r.phase === "WARMUP" ? (
              <div style={{ padding: "8px 0", borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}`,
                textAlign: "center", color: C.amber, fontSize: 11, fontWeight: 700, letterSpacing: 1.2,
                background: C.amber + "11", margin: "4px 0" }}>
                ──── WARM-UP ENDED AT T={r.time?.toFixed(0)} ────
              </div>
            ) : (
              <div style={{ fontSize: 11, fontFamily: "monospace", padding: "3px 0",
                borderBottom: `1px solid ${C.border}22`,
                color: r.phase === "ERROR" ? C.red : r.phase === "SAVE" ? C.green : C.text }}>
                <span style={{ color: C.muted, marginRight: 4 }}>[t={r.time?.toFixed?.(1) ?? "—"}]</span>
                <PhaseTag phase={r.phase} />
                <span style={{ marginLeft: 6 }}>{r.message}</span>
              </div>
            )}
          </div>
        ))}
      </div>

      {filtered.length < log.length && (
        <div style={{ fontSize: 10, color: C.muted, fontFamily: FONT, textAlign: "right" }}>
          Showing {filtered.length} of {log.length} entries
        </div>
      )}
    </div>
  );
}
