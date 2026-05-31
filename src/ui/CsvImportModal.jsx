// ui/CsvImportModal.jsx — Import entity attributes from a CSV file
import { useState, useRef, useCallback } from "react";
import { Z } from "./shared/tokens.js";
import { Btn } from "./shared/components.jsx";
import { useToast } from "./shared/ToastContext.jsx";
import { csvToEntityType } from "../engine/distribution-fitting.js";
import { useTheme } from "./shared/ThemeContext.jsx";

export function CsvImportModal({ onClose, onApply }) {
  const { C, FONT } = useTheme();
  const toast = useToast();
  const [step, setStep] = useState("upload"); // upload | preview | error
  const [fileName, setFileName] = useState("");
  const [entityName, setEntityName] = useState("Imported Entity");
  const [columns, setColumns] = useState([]);
  const [entityType, setEntityType] = useState(null);
  const [error, setError] = useState("");
  const fileRef = useRef(null);

  const handleFile = useCallback((event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setFileName(file.name);
    setError("");
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const result = csvToEntityType(e.target.result, entityName || "Imported Entity");
        setColumns(result.columns);
        setEntityType(result.entityType);
        setStep("preview");
      } catch (err) {
        setError(err.message);
        setStep("error");
      }
    };
    reader.onerror = () => {
      setError("Could not read the selected file.");
      setStep("error");
    };
    reader.readAsText(file);
  }, [entityName]);

  const handleApply = () => {
    if (entityType) {
      onApply(entityType);
      toast.success(`Imported entity type "${entityType.name}" from CSV`);
      onClose();
    }
  };

  const distLabel = (col) => {
    if (col.valueType !== "number" || !col.distResult) return col.valueType;
    const d = col.distResult;
    if (d.type === "fixed") return `fixed(${d.params.value})`;
    if (d.type === "exponential") return `exponential(mean=${d.params.mean})`;
    if (d.type === "uniform") return `uniform(${d.params.min}..${d.params.max})`;
    if (d.type === "normal") return `normal(mean=${d.params.mean}, sd=${d.params.stdDev})`;
    if (d.type === "lognormal") return `lognormal(mean=${d.params.logMean}, sd=${d.params.logStdDev})`;
    if (d.type === "triangular") return `triangular(${d.params.min},${d.params.mode},${d.params.max})`;
    if (d.type === "empirical") return `empirical(${d.stats?.count ?? col.rowCount} values)`;
    return d.type;
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: C.overlay, display: "flex", alignItems: "center", justifyContent: "center", zIndex: Z.modal }}>
      <div role="dialog" aria-modal="true" aria-labelledby="csv-modal-title" style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 10, padding: 24, width: 540, maxWidth: "90vw", display: "flex", flexDirection: "column", gap: 16, fontFamily: FONT }}>
        <div id="csv-modal-title" style={{ fontSize: 15, fontWeight: 700, color: C.text }}>Import Entity Type from CSV</div>

        {step === "upload" && (
          <>
            <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.5 }}>
              Upload a CSV file with headers. Each column becomes an entity attribute.
              Numeric columns are analysed and a distribution is fitted automatically.
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <label htmlFor="csv-entity-name" style={{ fontSize: 12, color: C.text, fontWeight: 600 }}>Entity type name</label>
              <input
                id="csv-entity-name"
                type="text"
                value={entityName}
                onChange={(e) => setEntityName(e.target.value)}
                placeholder="e.g. Customer"
                style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 4, color: C.text, fontFamily: FONT, fontSize: 13, padding: "8px 10px", outline: "none" }}
              />
            </div>
            <input ref={fileRef} aria-label="CSV file" type="file" accept=".csv" style={{ display: "none" }} onChange={handleFile} />
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
              <Btn variant="primary" onClick={() => fileRef.current?.click()}>Select CSV File</Btn>
            </div>
          </>
        )}

        {step === "error" && (
          <>
            <div style={{ fontSize: 12, color: C.red, lineHeight: 1.5 }}>{error}</div>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
              <Btn variant="ghost" onClick={() => setStep("upload")}>Try Again</Btn>
            </div>
          </>
        )}

        {step === "preview" && (
          <>
            <div style={{ fontSize: 12, color: C.muted }}>
              {fileName} — {columns.length} column{columns.length !== 1 ? "s" : ""} detected
            </div>
            <div style={{ maxHeight: 240, overflowY: "auto", border: `1px solid ${C.border}`, borderRadius: 6 }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, fontFamily: FONT }}>
                <thead>
                  <tr style={{ background: C.surface }}>
                    <th scope="col" style={{ textAlign: "left", padding: "6px 10px", color: C.muted, fontWeight: 700, borderBottom: `1px solid ${C.border}` }}>Column</th>
                    <th scope="col" style={{ textAlign: "left", padding: "6px 10px", color: C.muted, fontWeight: 700, borderBottom: `1px solid ${C.border}` }}>Type</th>
                    <th scope="col" style={{ textAlign: "left", padding: "6px 10px", color: C.muted, fontWeight: 700, borderBottom: `1px solid ${C.border}` }}>Suggested Distribution</th>
                  </tr>
                </thead>
                <tbody>
                  {columns.map((col, i) => (
                    <tr key={i} style={{ background: i % 2 === 0 ? C.bg + "60" : "transparent" }}>
                      <td style={{ padding: "6px 10px", color: C.text }}>{col.name}</td>
                      <td style={{ padding: "6px 10px", color: C.accent }}>{col.valueType}</td>
                      <td style={{ padding: "6px 10px", color: C.server }}>{distLabel(col)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
              <Btn variant="primary" onClick={handleApply}>Add Entity Type</Btn>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
