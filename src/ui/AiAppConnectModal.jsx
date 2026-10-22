// ui/AiAppConnectModal.jsx — "Connect your AI app": download and set up the
// local Flow MCP server (mcp/), served by Flow itself from public/downloads/
// so users never need GitHub. Opened from the Model Library header next to
// the AI Prompt Pack.
import { useEffect, useRef, useState } from "react";
import { SPACE, RADIUS, TYPO, Z, SHADOW } from "./shared/tokens.js";
import { useTheme } from "./shared/ThemeContext.jsx";

const headingId = "ai-app-connect-heading";

export const MCP_DOWNLOADS = {
  extension: `${import.meta.env.BASE_URL || "/"}downloads/flow.mcpb`,
  server: `${import.meta.env.BASE_URL || "/"}downloads/flow-mcp.mjs`,
  // Written with the downloads by mcp/pack.mjs: { version, build, published }.
  version: `${import.meta.env.BASE_URL || "/"}downloads/flow-mcp-version.json`,
};

// The version on offer, or null if the file can't be read (e.g. a dev server
// that hasn't run `npm run build:mcp`) — the dialog works without it.
export async function fetchMcpVersion(fetchImpl = globalThis.fetch) {
  try {
    const res = await fetchImpl(MCP_DOWNLOADS.version, { cache: "no-store" });
    if (!res.ok) return null;
    const body = await res.json();
    return typeof body?.version === "string" ? body : null;
  } catch {
    return null;
  }
}

export const MCP_CONFIG_SNIPPET = `{
  "mcpServers": {
    "flow": {
      "command": "node",
      "args": ["/path/to/flow-mcp.mjs"]
    }
  }
}`;

/**
 * @param {{ isOpen: boolean, onClose: () => void }} props
 */
export function AiAppConnectModal({ isOpen, onClose }) {
  const { C, FONT } = useTheme();
  const dialogRef = useRef(null);
  const [copied, setCopied] = useState(false);
  const [mcpVersion, setMcpVersion] = useState(null);

  useEffect(() => {
    if (!isOpen) return undefined;
    let live = true;
    fetchMcpVersion().then(v => { if (live) setMcpVersion(v); });
    return () => { live = false; };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const onKeyDown = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKeyDown);
    const raf = requestAnimationFrame(() => { dialogRef.current?.querySelector("a,button")?.focus(); });
    return () => { window.removeEventListener("keydown", onKeyDown); cancelAnimationFrame(raf); };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const text = { fontFamily: FONT, ...TYPO.body, color: C.text, margin: 0 };
  const muted = { ...text, color: C.muted };
  const step = { ...text, display: "flex", gap: SPACE.sm };
  const num = { color: C.accent, fontWeight: 700, minWidth: 14 };
  const sectionTitle = { fontFamily: FONT, ...TYPO.label, color: C.muted, margin: 0 };
  const download = {
    display: "inline-flex", alignItems: "center", gap: 6, alignSelf: "flex-start",
    background: C.accent, color: C.bg, borderRadius: RADIUS.md, padding: "7px 14px",
    fontFamily: FONT, fontSize: 12, fontWeight: 600, textDecoration: "none",
  };
  const secondary = { ...download, background: "none", color: C.accent, border: `1px solid ${C.accent}` };

  const copySnippet = () => {
    navigator.clipboard?.writeText(MCP_CONFIG_SNIPPET).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); }).catch(() => {});
  };

  return (
    <div
      role="presentation"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: "fixed", inset: 0, background: C.overlay, display: "flex", alignItems: "center", justifyContent: "center", zIndex: Z.modal, padding: 20 }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: RADIUS.lg, width: "min(560px, 100%)", maxHeight: "90vh", display: "flex", flexDirection: "column", boxShadow: SHADOW.modal, overflow: "hidden" }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: `${SPACE.md}px ${SPACE.lg}px`, borderBottom: `1px solid ${C.border}` }}>
          <div id={headingId} style={{ fontFamily: FONT, ...TYPO.heading, color: C.text }}>Connect your AI app to Flow</div>
          <button type="button" aria-label="Close" onClick={onClose}
            style={{ background: "none", border: "none", cursor: "pointer", color: C.muted, fontFamily: FONT, fontSize: 16, lineHeight: 1, padding: 4, borderRadius: RADIUS.sm }}>✕</button>
        </div>

        <div style={{ padding: SPACE.lg, display: "flex", flexDirection: "column", gap: SPACE.lg, overflowY: "auto" }}>
          <p style={text}>
            Your AI assistant can build Flow models for you, then check them with Flow&apos;s own validator and run them with Flow&apos;s simulation engine, fixing problems before you see them. Finished models are saved as files you open here with <b>+ New Model → Import a file</b>.
          </p>
          <p style={muted}>
            Runs on your computer, in desktop AI apps (not in a web browser). Models are saved in <b>Documents/Flow models</b>.
          </p>
          {mcpVersion && (
            <p style={muted} data-testid="mcp-version">
              Version {mcpVersion.version}{mcpVersion.build && mcpVersion.build !== "unknown" ? ` (build ${mcpVersion.build})` : ""}. Your AI app will tell you when a newer one is available; download it here again to update.
            </p>
          )}

          <section style={{ display: "flex", flexDirection: "column", gap: SPACE.sm }} aria-labelledby="ai-connect-claude">
            <h3 id="ai-connect-claude" style={sectionTitle}>Claude Desktop</h3>
            <div style={step}><span style={num}>1</span><span>Download the Flow extension.</span></div>
            <a href={MCP_DOWNLOADS.extension} download="flow.mcpb" style={download}>↓ Download flow.mcpb</a>
            <div style={step}><span style={num}>2</span><span>Double-click the file (or drag it onto Claude Desktop) and choose <b>Install</b>.</span></div>
            <div style={step}><span style={num}>3</span><span>In a new chat, ask for a model, for example: <i>&ldquo;Build me a Flow model of a GP surgery: patients arrive every 4 minutes, a nurse triages them, then one of 3 GPs sees them for about 10 minutes.&rdquo;</i></span></div>
          </section>

          <section style={{ display: "flex", flexDirection: "column", gap: SPACE.sm }} aria-labelledby="ai-connect-other">
            <h3 id="ai-connect-other" style={sectionTitle}>Claude Code, Cursor, VS Code and other MCP apps</h3>
            <div style={step}><span style={num}>1</span><span>Download the Flow server. It needs <a href="https://nodejs.org" target="_blank" rel="noreferrer" style={{ color: C.accent }}>Node.js</a> 20 or later.</span></div>
            <a href={MCP_DOWNLOADS.server} download="flow-mcp.mjs" style={secondary}>↓ Download flow-mcp.mjs</a>
            <div style={step}><span style={num}>2</span><span>Add it to your app&apos;s MCP settings, using the file&apos;s full path:</span></div>
            <pre style={{ margin: 0, padding: SPACE.sm, background: C.bg, border: `1px solid ${C.border}`, borderRadius: RADIUS.md, color: C.text, fontSize: 11, overflowX: "auto" }}>{MCP_CONFIG_SNIPPET}</pre>
            <button type="button" onClick={copySnippet}
              style={{ alignSelf: "flex-start", background: "none", border: "none", padding: 0, color: C.accent, cursor: "pointer", fontFamily: FONT, fontSize: 12 }}>
              {copied ? "Copied" : "Copy settings"}
            </button>
            <p style={muted}>For Claude Code: <code>claude mcp add flow -- node /path/to/flow-mcp.mjs</code></p>
          </section>

          <p style={muted}>
            Prefer to copy and paste instead? The <b>AI Prompt Pack</b> works with any AI chat, without installing anything.
          </p>
        </div>
      </div>
    </div>
  );
}
