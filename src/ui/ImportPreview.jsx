// ui/ImportPreview.jsx — Magic-link model preview and import
import { useState } from 'react';
import { C, FONT, GOOGLE_FONT_URL, RADIUS, SPACE, TYPO, alpha } from './shared/tokens.js';
import { Btn } from './shared/components.jsx';

const PENDING_IMPORT_KEY = 'des.pendingImport';

export function ImportPreview({ model, errors, warnings, user, onSave, onDismiss }) {
  const [saveError, setSaveError] = useState('');
  const [saving, setSaving] = useState(false);
  const [showRawJson, setShowRawJson] = useState(false);
  const [copied, setCopied] = useState(false);

  const entityTypes = model.entityTypes || [];
  const queues = model.queues || [];
  const expDefaults = model.experimentDefaults || {};

  const handleSave = async () => {
    setSaving(true);
    setSaveError('');
    try {
      await onSave();
    } catch (e) {
      setSaveError(e.message || 'Save failed.');
      setSaving(false);
    }
  };

  const handleSignInToSave = () => {
    sessionStorage.setItem(PENDING_IMPORT_KEY, JSON.stringify(model));
    onDismiss();
  };

  const copyJson = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(model, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (_) {}
  };

  const dlRow = (term, def) => (
    <div key={term} style={{ display: 'contents' }}>
      <dt style={{ color: C.muted, fontSize: 12, fontFamily: FONT, fontWeight: 400, padding: '2px 0' }}>{term}</dt>
      <dd style={{ color: C.text, fontSize: 12, fontFamily: FONT, fontWeight: 600, margin: 0, padding: '2px 0' }}>{def}</dd>
    </div>
  );

  const hasExpDefaults =
    expDefaults.maxSimTime != null ||
    expDefaults.warmupPeriod != null ||
    expDefaults.replications != null;

  return (
    <div style={{ background: C.bg, minHeight: '100vh', display: 'flex', flexDirection: 'column', fontFamily: FONT, color: C.text }}>
      <style>{`*{box-sizing:border-box;margin:0;padding:0;}@import url('${GOOGLE_FONT_URL}');`}</style>

      <div style={{ background: C.surface, borderBottom: `1px solid ${C.border}`, padding: '0 24px', display: 'flex', alignItems: 'center', height: 52, flexShrink: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 14, color: C.accent, letterSpacing: 2 }}>DES STUDIO</div>
      </div>

      <div style={{ flex: 1, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '40px 16px' }}>
        <div style={{ width: '100%', maxWidth: 560, background: C.panel, border: `1px solid ${C.border}`, borderRadius: RADIUS.lg, padding: 28, display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Header */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ ...TYPO.label, color: C.accent, fontFamily: FONT, letterSpacing: '1.5px' }}>
              MODEL READY TO IMPORT
            </div>
            <div style={{ ...TYPO.title, color: C.text, fontFamily: FONT }}>
              {model.name || 'Unnamed Model'}
            </div>
            {model.description && (
              <div style={{ ...TYPO.body, color: C.muted, fontFamily: FONT, marginTop: 2 }}>
                {model.description}
              </div>
            )}
          </div>

          {/* Model summary */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {entityTypes.length > 0 && (
              <div>
                <div style={{ ...TYPO.label, color: C.muted, fontFamily: FONT, marginBottom: 8 }}>ENTITY TYPES</div>
                <dl style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '2px 16px' }}>
                  {entityTypes.map((et, i) => dlRow(et.name || `Type ${i + 1}`, et.role || 'customer'))}
                </dl>
              </div>
            )}
            {queues.length > 0 && (
              <div>
                <div style={{ ...TYPO.label, color: C.muted, fontFamily: FONT, marginBottom: 8 }}>QUEUES</div>
                <dl style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '2px 16px' }}>
                  {queues.map((q, i) => dlRow(q.name || `Queue ${i + 1}`, q.discipline || 'FIFO'))}
                </dl>
              </div>
            )}
            {hasExpDefaults && (
              <div>
                <div style={{ ...TYPO.label, color: C.muted, fontFamily: FONT, marginBottom: 8 }}>EXPERIMENT DEFAULTS</div>
                <dl style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '2px 16px' }}>
                  {expDefaults.maxSimTime != null && dlRow('Max sim time', String(expDefaults.maxSimTime))}
                  {expDefaults.warmupPeriod != null && dlRow('Warmup period', String(expDefaults.warmupPeriod))}
                  {expDefaults.replications != null && dlRow('Replications', String(expDefaults.replications))}
                </dl>
              </div>
            )}
          </div>

          {/* Validation status */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {errors.length > 0 ? (
              <div role="alert" style={{ background: alpha(C.amber, 0.08), border: `1px solid ${alpha(C.amber, 0.3)}`, borderRadius: RADIUS.md, padding: `${SPACE.sm + 2}px ${SPACE.md + 2}px` }}>
                <div style={{ ...TYPO.label, color: C.amber, fontFamily: FONT, marginBottom: 6 }}>VALIDATION WARNINGS</div>
                <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 3 }}>
                  {errors.map((e, i) => (
                    <li key={i} style={{ ...TYPO.caption, color: C.amber, fontFamily: FONT }}>
                      [{e.code}] {e.message}
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <div style={{ background: alpha(C.green, 0.08), border: `1px solid ${alpha(C.green, 0.3)}`, borderRadius: RADIUS.md, padding: `${SPACE.sm + 2}px ${SPACE.md + 2}px` }}>
                <div style={{ ...TYPO.caption, color: C.green, fontFamily: FONT }}>Model passed validation</div>
              </div>
            )}
            {warnings.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {warnings.map((w, i) => (
                  <div key={i} style={{ ...TYPO.caption, color: C.muted, fontFamily: FONT }}>
                    [{w.code}] {w.message}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Action area */}
          {user ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {saveError && (
                <div role="alert" style={{ ...TYPO.caption, color: C.red, fontFamily: FONT }}>{saveError}</div>
              )}
              <div style={{ display: 'flex', gap: 10 }}>
                <Btn variant="primary" onClick={handleSave} disabled={saving}>
                  {saving ? 'Saving…' : 'Save to my models'}
                </Btn>
                <Btn variant="ghost" onClick={onDismiss}>Dismiss</Btn>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ background: alpha(C.accent, 0.06), border: `1px solid ${alpha(C.accent, 0.2)}`, borderRadius: RADIUS.md, padding: `${SPACE.sm + 2}px ${SPACE.md + 2}px` }}>
                <div style={{ ...TYPO.caption, color: C.muted, fontFamily: FONT }}>
                  Sign in or sign up to save this model to your account
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <Btn variant="primary" onClick={handleSignInToSave}>Sign in / Sign up to save</Btn>
                <button
                  type="button"
                  onClick={() => setShowRawJson(v => !v)}
                  style={{ background: 'transparent', border: 'none', color: C.muted, fontFamily: FONT, fontSize: 12, cursor: 'pointer', textAlign: 'left', textDecoration: 'underline', padding: 0 }}
                >
                  Continue without saving — copy JSON
                </button>
              </div>
              {showRawJson && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <Btn small variant="ghost" onClick={copyJson}>{copied ? 'Copied!' : 'Copy JSON'}</Btn>
                  <pre style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: RADIUS.md, padding: 12, color: C.text, fontFamily: FONT, fontSize: 11, overflowX: 'auto', maxHeight: 220, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                    {JSON.stringify(model, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}

          {/* Footer */}
          <div style={{ ...TYPO.caption, color: C.muted, fontFamily: FONT, borderTop: `1px solid ${C.border}`, paddingTop: SPACE.md }}>
            This model was generated externally. Review it before running.
          </div>
        </div>
      </div>
    </div>
  );
}
