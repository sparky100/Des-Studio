// Fails if the files Flow serves (public/downloads/) are out of date: a
// fresh build of the server must match public/downloads/flow-mcp.mjs, and
// the extension must contain that same server and the current manifest.
// The bundle carries copies of the engine and the schema reference, so any
// change to those needs `npm run pack` here. Runs in CI (mcp-bundle.yml).
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';

const here = new URL('.', import.meta.url).pathname;
const published = new URL('../public/downloads/', import.meta.url).pathname;
const tmp = mkdtempSync(path.join(os.tmpdir(), 'flow-mcp-check-'));
const problems = [];
try {
  execFileSync(process.execPath, [`${here}build.mjs`], { stdio: 'ignore' });
  const fresh = readFileSync(`${here}dist/flow-mcp.mjs`);
  const read = f => { try { return readFileSync(f); } catch { return null; } };
  const served = read(`${published}flow-mcp.mjs`);
  if (!served) problems.push('public/downloads/flow-mcp.mjs is missing');
  else if (!served.equals(fresh)) problems.push('public/downloads/flow-mcp.mjs is out of date');

  if (!read(`${published}flow.mcpb`)) problems.push('public/downloads/flow.mcpb is missing');
  else {
    execFileSync(`${here}node_modules/.bin/mcpb`, ['unpack', `${published}flow.mcpb`, tmp], { stdio: 'ignore' });
    if (!readFileSync(path.join(tmp, 'server', 'flow-mcp.mjs')).equals(fresh)) problems.push('public/downloads/flow.mcpb contains an out-of-date server');
    const inBundle = JSON.parse(readFileSync(path.join(tmp, 'manifest.json'), 'utf8'));
    const current = JSON.parse(readFileSync(`${here}bundle/manifest.json`, 'utf8'));
    if (JSON.stringify(inBundle) !== JSON.stringify(current)) problems.push('public/downloads/flow.mcpb contains an out-of-date manifest');
  }
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
if (problems.length) {
  console.error(`The Flow MCP downloads need rebuilding:\n- ${problems.join('\n- ')}\nRun: cd mcp && npm ci && npm run pack — then commit public/downloads/.`);
  process.exit(1);
}
console.log('Flow MCP downloads are up to date.');
