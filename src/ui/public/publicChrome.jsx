// ui/public/publicChrome.jsx — the shared frame for Flow's public surfaces.
//
// A published model and the public gallery are reachable WITHOUT an account
// (ADR-025). They are deliberately NOT the app: no editor, no tabs, no run
// history, no owner's other models. This module holds the frame they share —
// a header, a way back, and the "Open in Flow" path — so neither surface
// grows its own.
import { Btn } from "../shared/components.jsx";
import { useTheme } from "../shared/ThemeContext.jsx";

const SANS = "Inter,'Segoe UI',Arial,sans-serif";

/**
 * The header every public surface shows.
 * @param {{ onBack?: () => void, onOpenInFlow?: () => void, title?: string }} props
 */
export function PublicHeader({ onBack, onOpenInFlow, title }) {
  const { C, FONT } = useTheme();
  return (
    <header style={{
      borderBottom: `1px solid ${C.border}`, background: C.panel,
      padding: "12px 20px", display: "flex", alignItems: "center",
      justifyContent: "space-between", gap: 12, flexWrap: "wrap",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
        {onBack && (
          <Btn small variant="ghost" onClick={onBack}>← Back</Btn>
        )}
        <span style={{ fontSize: 15, fontWeight: 800, color: C.text, fontFamily: SANS, letterSpacing: -0.2 }}>
          Flow
        </span>
        {title && (
          <span style={{ fontSize: 12, color: C.muted, fontFamily: SANS, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {title}
          </span>
        )}
      </div>
      {onOpenInFlow && (
        <Btn small variant="primary" onClick={onOpenInFlow}>Open in Flow</Btn>
      )}
    </header>
  );
}

/**
 * The frame a public surface renders inside.
 * @param {{ onBack?: () => void, onOpenInFlow?: () => void, title?: string, children: any }} props
 */
export function PublicShell({ onBack, onOpenInFlow, title, children }) {
  const { C, FONT } = useTheme();
  return (
    <div style={{ minHeight: "100vh", background: C.bg, display: "flex", flexDirection: "column" }}>
      <PublicHeader onBack={onBack} onOpenInFlow={onOpenInFlow} title={title} />
      <main style={{ flex: 1, width: "100%", maxWidth: 880, margin: "0 auto", padding: "24px 20px 48px", boxSizing: "border-box", overflowWrap: "anywhere" }}>
        {children}
      </main>
      <footer style={{
        borderTop: `1px solid ${C.border}`, padding: "14px 20px", textAlign: "center",
        fontSize: 11, color: C.muted, fontFamily: SANS,
      }}>
        Published with Flow — a browser-based discrete event simulation workbench.
      </footer>
    </div>
  );
}

/**
 * The message shown when a published model cannot be resolved.
 *
 * A draft, a withdrawn model and a model that was never published all produce
 * the SAME answer, so this text must not hint at which one it is (ADR-025) —
 * and it must not imply the model ever existed either, or the page becomes a
 * small existence oracle for anyone holding an id.
 */
export function PublicNotFound({ what = "model" }) {
  const { C, FONT } = useTheme();
  return (
    <div style={{
      background: C.panel, border: `1px solid ${C.border}`, borderRadius: 10,
      padding: "36px 24px", textAlign: "center",
    }}>
      <div style={{ fontSize: 15, fontWeight: 700, color: C.text, fontFamily: SANS, marginBottom: 8 }}>
        This {what} isn&apos;t available
      </div>
      <div style={{ fontSize: 13, color: C.muted, fontFamily: SANS, lineHeight: 1.6, maxWidth: 420, margin: "0 auto" }}>
        If you were sent a link to a published model, ask for a current one.
      </div>
    </div>
  );
}
