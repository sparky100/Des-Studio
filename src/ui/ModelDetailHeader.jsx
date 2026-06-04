// ui/ModelDetailHeader.jsx — Top header bar for an open model
;
import { Tag, Btn } from "./shared/components.jsx";
import { useTheme } from "./shared/ThemeContext.jsx";

export function ModelDetailHeader({ model, canEdit, dirty, saving, past, future, onBack, onUndo, onRedo, onSave, onDiscard, currentVersion, onExportSimPy }) {
  const { C, FONT } = useTheme();
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10, padding: "11px 20px",
      borderBottom: `1px solid ${C.border}`, background: C.surface,
      flexShrink: 0, flexWrap: "wrap",
    }}>
      <Btn small variant="ghost" onClick={onBack}>← Back</Btn>
      <div style={{
        flex: "1 1 220px", minWidth: 0, fontWeight: 700, fontSize: 14,
        color: C.text, fontFamily: FONT, overflow: "hidden",
        textOverflow: "ellipsis", whiteSpace: "nowrap",
      }}>
        {model.name}
      </div>
      <Tag label={model.visibility} color={model.visibility === "public" ? C.green : C.accent} />
      {currentVersion && (
        <Tag label={`V${currentVersion}`} color={C.purple} />
      )}
      {canEdit && (
        <Btn small variant="ghost" onClick={onUndo} disabled={!past.length}
          title="Undo the last model edit (Ctrl+Z)" ariaLabel="Undo last model edit">
          ↩ Undo
        </Btn>
      )}
      {canEdit && (
        <Btn small variant="ghost" onClick={onRedo} disabled={!future.length}
          title="Redo the last undone model edit (Ctrl+Shift+Z)" ariaLabel="Redo last model edit">
          ↪ Redo
        </Btn>
      )}
      {onExportSimPy && (
        <Btn small variant="ghost" onClick={onExportSimPy}
          title="Export this model as a runnable SimPy Python script" ariaLabel="Export as SimPy">
          ⬇ SimPy
        </Btn>
      )}
      {canEdit && dirty && (
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <Btn small variant="primary" onClick={onSave} disabled={saving}>{saving ? "Saving..." : "Save"}</Btn>
          <Btn small variant="ghost" onClick={onDiscard} disabled={saving}>Discard</Btn>
        </div>
      )}
    </div>
  );
}
