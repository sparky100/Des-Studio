// ui/editors/DataSourceManager.jsx — Add/edit/delete data sources; credential slot stored in sessionStorage only
import { useState } from "react";
import { C, FONT, SPACE, RADIUS, alpha } from "../shared/tokens.js";
import { Btn, SH, InfoBox, Tag } from "../shared/components.jsx";
import { RestAdapter } from "../../engine/adapters/RestAdapter.js";

function slugify(label) {
  return "ds_" + (label || "source")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

const SESSION_KEY = (varName) => `des_cred_${varName}`;

function resolveCredFromSession(authSecret) {
  if (!authSecret) return "";
  const m = authSecret.match(/^\{\{env\.(.+?)\}\}$/);
  if (!m) return authSecret;
  try { return sessionStorage.getItem(SESSION_KEY(m[1])) || ""; } catch { return ""; }
}

const inpSt = {
  background: C.bg,
  border: `1px solid ${C.border}`,
  borderRadius: RADIUS.sm,
  color: C.text,
  fontFamily: FONT,
  fontSize: 12,
  padding: `${SPACE.xs + 1}px ${SPACE.sm}px`,
  outline: "none",
  width: "100%",
  boxSizing: "border-box",
};

const labelSt = {
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: "1.2px",
  textTransform: "uppercase",
  color: C.muted,
  fontFamily: FONT,
  display: "block",
  marginBottom: 3,
};

function CredentialSlot({ authSecret, onChange }) {
  const m = authSecret?.match(/^\{\{env\.(.+?)\}\}$/);
  const varName = m ? m[1] : null;
  const [credValue, setCredValue] = useState(() => {
    if (!varName) return "";
    try { return sessionStorage.getItem(SESSION_KEY(varName)) || ""; } catch { return ""; }
  });

  if (!varName) return null;

  const saveToSession = (val) => {
    setCredValue(val);
    try {
      if (val) sessionStorage.setItem(SESSION_KEY(varName), val);
      else sessionStorage.removeItem(SESSION_KEY(varName));
    } catch {}
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <label style={labelSt}>Credential value for {authSecret}</label>
      <input
        type="password"
        value={credValue}
        onChange={e => saveToSession(e.target.value)}
        placeholder={`Enter value for ${varName} (session only)`}
        style={{ ...inpSt, color: C.amber }}
      />
      <span style={{ fontSize: 10, color: C.muted, fontFamily: FONT, fontStyle: "italic" }}>
        Stored in sessionStorage only — never sent to the server or saved in the model.
      </span>
    </div>
  );
}

const BLANK_DS = () => ({
  id: "",
  label: "",
  type: "rest",
  url: "",
  authHeader: "Authorization",
  authSecret: "",
  refreshSecs: 300,
});

export function DataSourceManager({ dataSources = [], onChange, readOnly = false }) {
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(null);
  const [testStatus, setTestStatus] = useState({});

  const startAdd = () => {
    const blank = BLANK_DS();
    setForm(blank);
    setEditing("__new__");
  };

  const startEdit = (ds) => {
    setForm({ ...ds });
    setEditing(ds.id);
  };

  const cancelForm = () => {
    setForm(null);
    setEditing(null);
  };

  const setF = (field, value) => setForm(f => ({ ...f, [field]: value }));

  const handleLabelChange = (val) => {
    setForm(f => ({
      ...f,
      label: val,
      id: editing === "__new__" ? slugify(val) : f.id,
    }));
  };

  const saveForm = () => {
    if (!form.id || !form.label || !form.url) return;
    if (editing === "__new__") {
      onChange([...dataSources, form]);
    } else {
      onChange(dataSources.map(ds => ds.id === editing ? form : ds));
    }
    setForm(null);
    setEditing(null);
  };

  const remove = (id) => {
    if (!window.confirm("Remove this data source? Any paramSource bindings referencing it will fall back to static values.")) return;
    onChange(dataSources.filter(ds => ds.id !== id));
  };

  const testConnection = async (ds) => {
    setTestStatus(s => ({ ...s, [ds.id]: { state: "testing", message: "Testing..." } }));
    try {
      const resolved = {
        ...ds,
        authSecret: resolveCredFromSession(ds.authSecret) || undefined,
      };
      const adapter = new RestAdapter(resolved);
      await adapter.prefetch();
      const sample = adapter.getLatest(Object.keys({})[0] ?? "__any__");
      setTestStatus(s => ({
        ...s,
        [ds.id]: { state: "ok", message: `Connected${sample != null ? ` — sample field: ${sample}` : " — no numeric field returned"}` },
      }));
    } catch (err) {
      setTestStatus(s => ({ ...s, [ds.id]: { state: "error", message: `Error: ${err?.message || String(err)}` } }));
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: SPACE.md }}>
      <SH label="Data Sources" color={C.accent}>
        {!readOnly && <Btn small variant="ghost" onClick={startAdd}>+ Add Source</Btn>}
      </SH>

      <InfoBox color={C.accent}>
        Data sources supply live values to distribution parameters at run time.
        Each source has a stable ID that B/C-event parameter bindings reference.
        Credentials use a <code style={{ color: C.amber }}>{"{{"} env.VAR {"}}"}</code> placeholder — the actual value is entered below and stored only in your browser session.
      </InfoBox>

      {dataSources.length === 0 && editing !== "__new__" && (
        <div style={{ textAlign: "center", padding: "16px 8px", color: C.muted, fontFamily: FONT, fontSize: 12 }}>
          No data sources configured.
        </div>
      )}

      {dataSources.map(ds => {
        const ts = testStatus[ds.id];
        return (
          <div key={ds.id} style={{
            background: C.bg,
            border: `1px solid ${C.accent}33`,
            borderLeft: `3px solid ${C.accent}`,
            borderRadius: RADIUS.md,
            padding: SPACE.md,
            display: "flex",
            flexDirection: "column",
            gap: SPACE.sm,
          }}>
            {editing === ds.id ? (
              <SourceForm form={form} setF={setF} handleLabelChange={handleLabelChange} isNew={false} onSave={saveForm} onCancel={cancelForm} />
            ) : (
              <>
                <div style={{ display: "flex", alignItems: "center", gap: SPACE.sm, flexWrap: "wrap" }}>
                  <Tag label={ds.type} color={C.accent} />
                  <span style={{ fontFamily: FONT, fontSize: 13, fontWeight: 700, color: C.text }}>{ds.label}</span>
                  <span style={{ fontFamily: FONT, fontSize: 11, color: C.muted, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {ds.url}
                  </span>
                  <span style={{ fontFamily: FONT, fontSize: 10, color: C.muted }}>{ds.refreshSecs}s TTL</span>
                  {!readOnly && (
                    <>
                      <Btn small variant="ghost" onClick={() => startEdit(ds)}>Edit</Btn>
                      <Btn small variant="danger" onClick={() => remove(ds.id)}>Delete</Btn>
                    </>
                  )}
                  <Btn small variant="ghost" onClick={() => testConnection(ds)}>Test Connection</Btn>
                </div>

                <div style={{ fontFamily: FONT, fontSize: 10, color: C.muted }}>
                  ID: <code style={{ color: C.accent }}>{ds.id}</code>
                  {ds.authSecret && <span style={{ marginLeft: 8 }}>Auth: <code style={{ color: C.amber }}>{ds.authSecret}</code></span>}
                </div>

                {ts && (
                  <div style={{
                    fontFamily: FONT,
                    fontSize: 11,
                    color: ts.state === "ok" ? C.green : ts.state === "error" ? C.red : C.muted,
                    background: alpha(ts.state === "ok" ? C.green : ts.state === "error" ? C.red : C.muted, 0.07),
                    borderRadius: RADIUS.sm,
                    padding: "4px 8px",
                  }}>
                    {ts.state === "ok" ? "✓ " : ts.state === "error" ? "✗ " : "⟳ "}{ts.message}
                  </div>
                )}

                {ds.authSecret && <CredentialSlot authSecret={ds.authSecret} />}
              </>
            )}
          </div>
        );
      })}

      {editing === "__new__" && form && (
        <div style={{
          background: C.bg,
          border: `1px solid ${C.accent}55`,
          borderLeft: `3px solid ${C.accent}`,
          borderRadius: RADIUS.md,
          padding: SPACE.md,
        }}>
          <SourceForm form={form} setF={setF} handleLabelChange={handleLabelChange} isNew onSave={saveForm} onCancel={cancelForm} />
        </div>
      )}
    </div>
  );
}

function SourceForm({ form, setF, handleLabelChange, isNew, onSave, onCancel }) {
  const isValid = form.id && form.label && form.url;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: SPACE.sm }}>
      <div style={{ fontFamily: FONT, fontSize: 12, fontWeight: 700, color: C.accent, marginBottom: 2 }}>
        {isNew ? "New Data Source" : `Edit — ${form.id}`}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: SPACE.sm }}>
        <div>
          <label style={labelSt}>Label</label>
          <input value={form.label} onChange={e => handleLabelChange(e.target.value)} placeholder="Live Arrival Feed" style={inpSt} />
        </div>
        <div>
          <label style={labelSt}>ID (auto-slug)</label>
          <input value={form.id} onChange={e => setF("id", e.target.value)} placeholder="ds_arrivals" style={{ ...inpSt, color: C.accent }} />
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: SPACE.sm, alignItems: "end" }}>
        <div>
          <label style={labelSt}>Type</label>
          <select value={form.type} onChange={e => setF("type", e.target.value)}
            style={{ ...inpSt, color: C.accent, width: "auto" }}>
            <option value="rest">REST (HTTP poll)</option>
            <option value="websocket" disabled>WebSocket (coming Sprint 60)</option>
          </select>
        </div>
        <div>
          <label style={labelSt}>Refresh (seconds)</label>
          <input type="number" min="5" value={form.refreshSecs} onChange={e => setF("refreshSecs", parseInt(e.target.value) || 300)}
            style={{ ...inpSt, width: 90 }} />
        </div>
      </div>

      <div>
        <label style={labelSt}>URL</label>
        <input value={form.url} onChange={e => setF("url", e.target.value)} placeholder="https://ops.example.com/api/stats" style={inpSt} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: SPACE.sm }}>
        <div>
          <label style={labelSt}>Auth Header</label>
          <input value={form.authHeader} onChange={e => setF("authHeader", e.target.value)} placeholder="Authorization" style={inpSt} />
        </div>
        <div>
          <label style={labelSt}>Auth Secret ({"{{env.VAR}}"} placeholder)</label>
          <input value={form.authSecret} onChange={e => setF("authSecret", e.target.value)} placeholder="{{env.LIVE_FEED_TOKEN}}" style={{ ...inpSt, color: C.amber }} />
        </div>
      </div>

      {form.authSecret && <CredentialSlot authSecret={form.authSecret} onChange={() => {}} />}

      <div style={{ display: "flex", gap: SPACE.sm, justifyContent: "flex-end" }}>
        <Btn small variant="ghost" onClick={onCancel}>Cancel</Btn>
        <Btn small variant="primary" onClick={onSave} disabled={!isValid}>
          {isNew ? "Add Source" : "Save Changes"}
        </Btn>
      </div>

      {!isValid && (
        <div style={{ fontFamily: FONT, fontSize: 10, color: C.amber }}>
          Label, ID, and URL are required.
        </div>
      )}
    </div>
  );
}
