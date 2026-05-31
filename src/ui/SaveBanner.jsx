// ui/SaveBanner.jsx — Dirty-state banner: unsaved changes notification with save/discard actions
;
import { Btn } from "./shared/components.jsx";
import { useTheme } from "./shared/ThemeContext.jsx";

export function SaveBanner({ canEdit, dirty, saving, discardConfirm, setDiscardConfirm, onSave, onDiscard }) {
  const { C, FONT } = useTheme();
  if (!canEdit || !dirty) return null;
  return (
    <div role="status" style={{
      background: C.amber + "18", border: `1px solid ${C.amber}66`, borderRadius: 6,
      padding: "10px 12px", marginBottom: 14, display: "flex",
      alignItems: "center", justifyContent: "space-between",
      gap: 12, flexWrap: "wrap", color: C.text, fontFamily: FONT, fontSize: 12,
    }}>
      <span>Unsaved changes in this model.</span>
      <div style={{ display: "flex", gap: 6 }}>
        <Btn small variant="primary" onClick={onSave} disabled={saving}>{saving ? "Saving..." : "Save Changes"}</Btn>
        {discardConfirm
          ? <>
              <Btn small variant="danger" onClick={() => { setDiscardConfirm(false); onDiscard(); }} disabled={saving}>Confirm discard</Btn>
              <Btn small variant="ghost" onClick={() => setDiscardConfirm(false)} disabled={saving}>Cancel</Btn>
            </>
          : <Btn small variant="ghost" onClick={() => setDiscardConfirm(true)} disabled={saving}>Discard Changes</Btn>
        }
      </div>
    </div>
  );
}
