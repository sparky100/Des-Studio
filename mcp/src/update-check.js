// Tells the user when a newer Flow MCP is available. Each time the server
// starts it fetches flow-mcp-version.json, which Flow publishes next to the
// downloads (pack.mjs), and if that version is newer, the next tool result
// carries a short note for the assistant to pass on. It never updates
// itself: the user downloads the new version from Flow, as they did the
// first. The request carries nothing about the user or their models, and it
// can be turned off (--no-update-check, or FLOW_MCP_UPDATE_CHECK=off; the
// desktop extension has a setting for it).

export const DEFAULT_UPDATE_URL = 'https://des.simmodlr.app/downloads/flow-mcp-version.json';
const TIMEOUT_MS = 3000;

// "1.10.0" > "1.9.2"; anything after "+" or "-" (a build stamp or a
// pre-release tag) is ignored. Returns -1, 0 or 1.
export function compareVersions(a, b) {
  const parts = v => String(v ?? '').trim().replace(/^v/i, '').split(/[+-]/)[0].split('.').map(n => parseInt(n, 10) || 0);
  const pa = parts(a);
  const pb = parts(b);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d > 0 ? 1 : -1;
  }
  return 0;
}

// Off with --no-update-check, or FLOW_MCP_UPDATE_CHECK set to off/false/0/no.
// The desktop extension passes its setting through that variable; left
// unset there, it arrives as the literal "${user_config.…}" placeholder,
// which means "on" (the setting's default).
export function updateCheckEnabled(env = process.env, argv = process.argv.slice(2)) {
  if (argv.includes('--no-update-check')) return false;
  const v = String(env.FLOW_MCP_UPDATE_CHECK ?? '').trim().toLowerCase();
  return !['off', 'false', '0', 'no'].includes(v);
}

export function updateUrl(env = process.env) {
  const v = env.FLOW_MCP_UPDATE_URL;
  return v && !v.includes('${') ? v : DEFAULT_UPDATE_URL;
}

// The latest published version, or null when it can't be had (offline,
// timed out, not JSON, no version) — an update check never gets in the way.
export async function fetchLatest(url, { fetchImpl = globalThis.fetch, timeoutMs = TIMEOUT_MS } = {}) {
  if (typeof fetchImpl !== 'function') return null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, { signal: ctrl.signal, headers: { accept: 'application/json' } });
    if (!res.ok) return null;
    const body = await res.json();
    return body && typeof body.version === 'string' && /^\d+\.\d+/.test(body.version) ? body : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// The note for the assistant, or null when this copy is current.
export function updateNotice(current, latest, url = DEFAULT_UPDATE_URL) {
  if (!latest || compareVersions(latest.version, current) <= 0) return null;
  let site = '';
  try { site = ` (${new URL(url).origin})`; } catch { /* keep it generic */ }
  return `Note for the user: a newer version of the Flow tools is available (${latest.version}; this is ${current}). To update, open Flow${site}, go to the Model Library, click Connect AI app and download it again — in Claude Desktop, install the new flow.mcpb over the old one; elsewhere, replace flow-mcp.mjs with the new file. Then restart the AI app.`;
}

export async function checkForUpdate(current, { env = process.env, argv = process.argv.slice(2), fetchImpl, timeoutMs } = {}) {
  if (!updateCheckEnabled(env, argv)) return null;
  const url = updateUrl(env);
  return updateNotice(current, await fetchLatest(url, { fetchImpl, timeoutMs }), url);
}
