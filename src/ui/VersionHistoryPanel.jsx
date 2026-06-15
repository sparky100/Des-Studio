// ui/VersionHistoryPanel.jsx — Version history list and create version dialog
import { useState, useEffect } from "react";
import { SHADOW, Z } from "./shared/tokens.js";
import { Btn, Tag } from "./shared/components.jsx";
import { listVersions, createVersion, deleteVersion, getNextVersion } from "../db/models.js";
import { detectStructuralChanges } from "../engine/validation.js";
import { buildModelDiff, ModelDiffPreview } from "./editors/ModelDiffPreview.jsx";
import { useTheme } from "./shared/ThemeContext.jsx";

const SANS = "Inter,'Segoe UI',Arial,sans-serif";

const fmtDate = iso => {
  try { return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }); }
  catch { return ''; }
};

export function VersionHistoryPanel({ model, userId, isOwner, onToast, onVersionChange, currentModel, onRestoreVersion }) {
  const { C, FONT } = useTheme();
  const [versions, setVersions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [deleting, setDeleting] = useState(null);
  const [diffVersion, setDiffVersion] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const v = await listVersions(model.id);
        if (!cancelled) setVersions(v);
      } catch (e) {
        if (!cancelled) console.error("Failed to load versions:", e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [model.id]);

  const handleCreate = async ({ name, notes }) => {
    try {
      const next = await getNextVersion(model.id);
      const changes = detectStructuralChanges(versions[0]?.modelJson || null, model);
      const v = await createVersion(model.id, userId, {
        version: next,
        name: name || `v${next}`,
        notes,
        modelJson: model,
        isStructural: changes.isStructural,
      });
      setVersions(prev => [v, ...prev]);
      setShowCreate(false);
      onToast?.("success", `Version v${next} created`);
      onVersionChange?.(next, v.id);
    } catch (e) {
      onToast?.("error", `Failed to create version: ${e.message}`);
    }
  };

  const handleDelete = async (version) => {
    if (!window.confirm(`Delete version v${version.version} "${version.name || ''}"? This cannot be undone.`)) return;
    setDeleting(version.id);
    try {
      await deleteVersion(model.id, version.id, userId);
      const remaining = versions.filter(v => v.id !== version.id);
      setVersions(remaining);
      onToast?.("success", `Version v${version.version} deleted`);
      if (remaining.length > 0) {
        onVersionChange?.(remaining[0].version, remaining[0].id);
      } else {
        onVersionChange?.(null, null);
      }
    } catch (e) {
      onToast?.("error", `Failed to delete version: ${e.message}`);
    } finally {
      setDeleting(null);
    }
  };

  if (loading) return (
    <div style={{ maxWidth: 760, margin: "0 auto", padding: 40, textAlign: "center", color: C.muted, fontFamily: SANS, fontSize: 13 }}>
      Loading versions…
    </div>
  );

  return (
    <div style={{ maxWidth: 760, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700, color: C.text, fontFamily: SANS }}>Versions</div>
          <div style={{ fontSize: 12, color: C.muted, fontFamily: SANS, marginTop: 2 }}>
            Milestones you've tagged — {versions.length} saved
          </div>
        </div>
        {isOwner && (
          <Btn variant="primary" onClick={() => setShowCreate(true)}>+ Create version</Btn>
        )}
      </div>

      {/* Empty state */}
      {versions.length === 0 && (
        <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 10, padding: "40px 24px", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
          <div style={{ fontSize: 32, lineHeight: 1 }}>🏷️</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: C.text, fontFamily: SANS }}>No versions yet</div>
          <div style={{ fontSize: 13, color: C.muted, fontFamily: SANS, lineHeight: 1.6, maxWidth: 380 }}>
            Tag a version when your model reaches a milestone — before a major change, after a validated run, or when sharing with others.
          </div>
          {isOwner && (
            <Btn variant="primary" onClick={() => setShowCreate(true)}>Create first version</Btn>
          )}
        </div>
      )}

      {/* Version list */}
      {versions.map((v, idx) => {
        const isLatest = idx === 0;
        const borderColor = v.isStructural ? C.accent : C.muted;
        return (
          <div key={v.id} style={{
            background: C.panel,
            border: `1px solid ${C.border}`,
            borderLeft: `3px solid ${borderColor}`,
            borderRadius: 8,
            padding: "14px 16px",
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}>
            {/* Top row: version badge + name + date */}
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <span style={{
                  fontSize: 13, fontWeight: 700, color: C.text, fontFamily: FONT,
                  background: C.bg, border: `1px solid ${C.border}`, borderRadius: 5,
                  padding: "2px 8px",
                }}>
                  v{v.version}
                </span>
                {v.name && v.name !== `v${v.version}` && (
                  <span style={{ fontSize: 13, fontWeight: 600, color: C.text, fontFamily: SANS }}>{v.name}</span>
                )}
                {isLatest && <Tag label="latest" color={C.green} />}
                <Tag label={v.isStructural ? "structural" : "parameter only"} color={borderColor} />
              </div>
              <span style={{ fontSize: 11, color: C.muted, fontFamily: SANS, whiteSpace: "nowrap" }}>{fmtDate(v.createdAt)}</span>
            </div>

            {/* Notes */}
            {v.notes && (
              <div style={{ fontSize: 12, color: C.muted, fontFamily: SANS, lineHeight: 1.6 }}>{v.notes}</div>
            )}

            {/* Actions */}
            <div style={{ display: "flex", gap: 6, marginTop: 2 }}>
              {currentModel && (
                <Btn small variant="ghost" onClick={() => setDiffVersion(v)}>Compare to current</Btn>
              )}
              {isOwner && onRestoreVersion && (
                <Btn small variant="ghost" onClick={() => {
                  if (!window.confirm(`Restore model to v${v.version} "${v.name || ''}"?\n\nCurrent unsaved changes will be overwritten. The model will be marked as modified — save manually to persist.`)) return;
                  onRestoreVersion(v.modelJson);
                  onToast?.("success", `Restored to v${v.version}`);
                }}>
                  Restore
                </Btn>
              )}
              {isOwner && (
                <Btn small variant="ghost" disabled={deleting === v.id} onClick={() => handleDelete(v)}>
                  {deleting === v.id ? "Deleting…" : "Delete"}
                </Btn>
              )}
            </div>
          </div>
        );
      })}

      {showCreate && (
        <CreateVersionModal
          model={model}
          versions={versions}
          onClose={() => setShowCreate(false)}
          onCreate={handleCreate}
        />
      )}

      {diffVersion && currentModel && (
        <div style={{ position: "fixed", inset: 0, background: C.overlay, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1100, padding: 16 }}>
          <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 12, padding: 20, width: "min(680px, 100%)", maxHeight: "85vh", overflowY: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: C.text, fontFamily: FONT }}>
                v{diffVersion.version}{diffVersion.name ? ` — ${diffVersion.name}` : ''} vs. current
              </span>
              <button onClick={() => setDiffVersion(null)} style={{ background: "transparent", border: "none", color: C.muted, fontSize: 18, cursor: "pointer" }}>✕</button>
            </div>
            <ModelDiffPreview
              currentModel={currentModel}
              proposedModel={diffVersion.modelJson}
              onDiscard={() => setDiffVersion(null)}
              readOnly
            />
          </div>
        </div>
      )}
    </div>
  );
}

function CreateVersionModal({ model, versions, onClose, onCreate }) {
  const { C, FONT } = useTheme();
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const nextVersion = versions.length > 0 ? versions[0].version + 1 : 1;
  const changes = detectStructuralChanges(versions[0]?.modelJson || null, model);

  const handleSubmit = async () => {
    setSaving(true);
    try {
      await onCreate({ name: name || `v${nextVersion}`, notes });
    } finally {
      setSaving(false);
    }
  };

  const inputStyle = {
    width: "100%", background: C.bg, border: `1px solid ${C.border}`, borderRadius: 5,
    color: C.text, fontFamily: SANS, fontSize: 13, padding: "8px 10px",
    outline: "none", boxSizing: "border-box",
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: C.overlay, display: "flex", alignItems: "center", justifyContent: "center", zIndex: Z.modal }}>
      <div role="dialog" aria-modal="true" aria-labelledby="create-version-title" style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 12, padding: 28, width: 480, maxWidth: "95vw", fontFamily: SANS, display: "flex", flexDirection: "column", gap: 16 }}>
        <div id="create-version-title" style={{ fontSize: 16, fontWeight: 700, color: C.text, fontFamily: SANS }}>Tag a version</div>

        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <label style={{ fontSize: 11, color: C.muted, fontWeight: 600, letterSpacing: "0.5px" }}>VERSION NUMBER</label>
          <div style={{ fontSize: 13, color: C.text, fontFamily: FONT, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 5, padding: "6px 10px" }}>v{nextVersion}</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <label style={{ fontSize: 11, color: C.muted, fontWeight: 600, letterSpacing: "0.5px" }}>NAME (OPTIONAL)</label>
          <input value={name} onChange={e => setName(e.target.value)} placeholder={`e.g. Initial A&E design`} style={inputStyle} />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <label style={{ fontSize: 11, color: C.muted, fontWeight: 600, letterSpacing: "0.5px" }}>NOTES</label>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="What changed? Why is this a milestone?" rows={3} style={{ ...inputStyle, resize: "vertical", lineHeight: 1.6 }} />
        </div>

        {changes.isStructural && changes.changes.length > 0 && (
          <div style={{ background: C.accent + "18", border: `1px solid ${C.accent}44`, borderRadius: 6, padding: "10px 12px", display: "flex", flexDirection: "column", gap: 4 }}>
            <div style={{ fontSize: 11, color: C.accent, fontWeight: 700, letterSpacing: "0.5px" }}>STRUCTURAL CHANGES SINCE LAST VERSION</div>
            {changes.changes.map((c, i) => (
              <div key={i} style={{ fontSize: 12, color: C.text, fontFamily: SANS }}>• {c}</div>
            ))}
          </div>
        )}

        {!changes.isStructural && versions.length > 0 && (
          <div style={{ background: C.muted + "18", border: `1px solid ${C.border}`, borderRadius: 6, padding: "8px 12px" }}>
            <div style={{ fontSize: 12, color: C.muted, fontFamily: SANS }}>No structural changes since last version — only parameter tweaks detected.</div>
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
          <Btn variant="primary" disabled={saving} onClick={handleSubmit}>
            {saving ? "Saving…" : "Save version"}
          </Btn>
        </div>
      </div>
    </div>
  );
}
