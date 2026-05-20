// ui/VersionHistoryPanel.jsx — Version history list and create version dialog
import { useState, useEffect } from "react";
import { C, FONT, SHADOW, Z } from "./shared/tokens.js";
import { Btn, Tag } from "./shared/components.jsx";
import { listVersions, createVersion, deleteVersion, getNextVersion } from "../db/models.js";
import { detectStructuralChanges } from "../engine/validation.js";

const fmtDate = iso => {
  try { return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }); }
  catch { return ''; }
};

export function VersionHistoryPanel({ model, userId, isOwner, onToast, onVersionChange }) {
  const [versions, setVersions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [deleting, setDeleting] = useState(null);

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

  if (loading) return <div style={{ padding: 24, color: C.muted, fontFamily: FONT, fontSize: 12 }}>Loading versions...</div>;

  return (
    <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>Versions</div>
          <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>
            {versions.length} version{versions.length !== 1 ? 's' : ''} · Milestones you've tagged
          </div>
        </div>
        {isOwner && (
          <Btn variant="primary" onClick={() => setShowCreate(true)}>+ Create version</Btn>
        )}
      </div>

      {versions.length === 0 && (
        <div style={{ padding: 24, textAlign: "center", color: C.muted, fontSize: 12, fontFamily: FONT }}>
          No versions yet. Create your first version when the model reaches a milestone.
        </div>
      )}

      {versions.map(v => (
        <div key={v.id} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6, padding: "10px 12px", display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: C.text, fontFamily: FONT }}>v{v.version}</span>
              {v.name && v.name !== `v${v.version}` && (
                <span style={{ fontSize: 11, color: C.muted, fontFamily: FONT }}>{v.name}</span>
              )}
              <Tag label={v.isStructural ? "structural" : "parameter"} color={v.isStructural ? C.accent : C.muted} />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 10, color: C.muted, fontFamily: FONT }}>{fmtDate(v.createdAt)}</span>
              {isOwner && (
                <Btn small variant="ghost" disabled={deleting === v.id} onClick={() => handleDelete(v)}>
                  {deleting === v.id ? "..." : "Delete"}
                </Btn>
              )}
            </div>
          </div>
          {v.notes && (
            <div style={{ fontSize: 11, color: C.muted, fontFamily: FONT, lineHeight: 1.4 }}>{v.notes}</div>
          )}
        </div>
      ))}

      {showCreate && (
        <CreateVersionModal
          model={model}
          versions={versions}
          onClose={() => setShowCreate(false)}
          onCreate={handleCreate}
        />
      )}
    </div>
  );
}

function CreateVersionModal({ model, versions, onClose, onCreate }) {
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

  const inputStyle = { width: "100%", background: C.bg, border: `1px solid ${C.border}`, borderRadius: 5, color: C.text, fontFamily: FONT, fontSize: 12, padding: "8px 10px", outline: "none", boxSizing: "border-box" };

  return (
    <div style={{ position: "fixed", inset: 0, background: C.overlay, display: "flex", alignItems: "center", justifyContent: "center", zIndex: Z.modal }}>
      <div role="dialog" aria-modal="true" aria-labelledby="create-version-title" style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 12, padding: 28, width: 480, maxWidth: "95vw", fontFamily: FONT, display: "flex", flexDirection: "column", gap: 16 }}>
        <div id="create-version-title" style={{ fontSize: 16, fontWeight: 700, color: C.text }}>Create Version</div>

        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <label style={{ fontSize: 10, color: C.muted, fontFamily: FONT, letterSpacing: 1, fontWeight: 700 }}>VERSION</label>
          <div style={{ fontSize: 13, color: C.text, fontFamily: FONT }}>v{nextVersion} (auto-assigned)</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <label style={{ fontSize: 10, color: C.muted, fontFamily: FONT, letterSpacing: 1, fontWeight: 700 }}>NAME (OPTIONAL)</label>
          <input value={name} onChange={e => setName(e.target.value)} placeholder={`e.g. v${nextVersion} - Initial design`} style={inputStyle} />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <label style={{ fontSize: 10, color: C.muted, fontFamily: FONT, letterSpacing: 1, fontWeight: 700 }}>NOTES</label>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="What changed? Why is this a milestone?" rows={3} style={{ ...inputStyle, resize: "vertical" }} />
        </div>

        {changes.isStructural && changes.changes.length > 0 && (
          <div style={{ background: C.accent + "18", border: `1px solid ${C.accent}44`, borderRadius: 5, padding: "8px 10px", display: "flex", flexDirection: "column", gap: 4 }}>
            <div style={{ fontSize: 10, color: C.accent, fontFamily: FONT, letterSpacing: 1, fontWeight: 700 }}>STRUCTURAL CHANGES DETECTED</div>
            {changes.changes.map((c, i) => (
              <div key={i} style={{ fontSize: 11, color: C.text, fontFamily: FONT }}>• {c}</div>
            ))}
          </div>
        )}

        {!changes.isStructural && versions.length > 0 && (
          <div style={{ background: C.muted + "18", border: `1px solid ${C.muted}44`, borderRadius: 5, padding: "8px 10px" }}>
            <div style={{ fontSize: 11, color: C.muted, fontFamily: FONT }}>No structural changes since last version — only parameter tweaks.</div>
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
          <Btn variant="primary" disabled={saving} onClick={handleSubmit}>
            {saving ? "Creating..." : "Create Version"}
          </Btn>
        </div>
      </div>
    </div>
  );
}
