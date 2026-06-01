// ui/ModelDetailHeader.jsx — Top header bar for an open model
import { C, FONT } from "./shared/tokens.js";
import { Tag, Btn } from "./shared/components.jsx";

export function ModelDetailHeader({ model, canEdit, dirty, saving, past, future, onBack, onUndo, onRedo, onSave, onDiscard, currentVersion, onExplore, exploreVisible }) {
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
      {canEdit && dirty && (
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <Btn small variant="primary" onClick={onSave} disabled={saving}>{saving ? "Saving..." : "Save"}</Btn>
          <Btn small variant="ghost" onClick={onDiscard} disabled={saving}>Discard</Btn>
        </div>
      )}
      {exploreVisible && onExplore && (
        <Btn small variant="ghost" onClick={onExplore} title="Run adaptive batch and get AI-powered improvement opportunities">
          ✦ Explore
        </Btn>
      )}
    </div>
  );
}
