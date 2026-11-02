// ui/SaveBanner.jsx — Dirty-state banner: unsaved changes notification with save/discard actions
;
import { Btn } from "./shared/components.jsx";
import { useTheme } from "./shared/ThemeContext.jsx";
import { SPACE, TYPO } from "./shared/tokens.js";

// Shared by the header and its compact replacement during a run; only one
// instance is mounted so model-save feedback stays in one place.
export function SaveBanner({ canEdit, dirty, visualPending, saving, saved, saveError, discardConfirm, setDiscardConfirm, onSave, onDiscard }) {
  const { C, FONT } = useTheme();
  const pending = dirty || visualPending;
  if (!canEdit || (!pending && !saving && !saved && !saveError)) return null;
  const message = saving ? "Saving model…" : saveError
    ? "Model couldn't be saved. Your changes are still here."
    : pending ? "Unsaved changes" : "Saved";
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: SPACE.sm, flexWrap: "wrap",
      color: C.text, fontFamily: FONT, ...TYPO.caption,
    }}>
      <span role={saveError && !saving ? "alert" : "status"}
        title={saveError || undefined}
        style={{ color: saveError ? C.red : pending ? C.amber : C.muted }}>
        {message}
      </span>
      {(pending || saving || saveError) && <>
        <Btn small variant="primary" onClick={() => { setDiscardConfirm(false); onSave(); }} disabled={saving}>
          {saving ? "Saving…" : saveError ? "Retry" : "Save model"}
        </Btn>
        {discardConfirm
          ? <>
              <Btn small variant="danger" onClick={() => { setDiscardConfirm(false); onDiscard(); }} disabled={saving}>Confirm discard</Btn>
              <Btn small variant="ghost" onClick={() => setDiscardConfirm(false)} disabled={saving}>Cancel</Btn>
            </>
          : <Btn small variant="ghost" onClick={() => setDiscardConfirm(true)} disabled={saving}>Discard…</Btn>
        }
      </>}
    </div>
  );
}
