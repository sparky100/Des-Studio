// Packs dist/flow-mcp.mjs into dist/flow.mcpb — a Claude Desktop extension
// the user installs by double-clicking. Run `npm run build` first.
import { mkdirSync, rmSync, copyFileSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const here = new URL('.', import.meta.url).pathname;
const stage = `${here}.mcpb-stage`;
rmSync(stage, { recursive: true, force: true });
mkdirSync(`${stage}/server`, { recursive: true });
copyFileSync(`${here}dist/flow-mcp.mjs`, `${stage}/server/flow-mcp.mjs`);
copyFileSync(`${here}bundle/manifest.json`, `${stage}/manifest.json`);

// The manifest's version must match the package's.
const pkg = JSON.parse(readFileSync(`${here}package.json`, 'utf8'));
const manifest = JSON.parse(readFileSync(`${stage}/manifest.json`, 'utf8'));
if (manifest.version !== pkg.version) throw new Error(`bundle/manifest.json version ${manifest.version} ≠ package.json ${pkg.version}`);

const mcpb = `${here}node_modules/.bin/mcpb`;
execFileSync(mcpb, ['validate', `${stage}/manifest.json`], { stdio: 'inherit' });
execFileSync(mcpb, ['pack', stage, `${here}dist/flow.mcpb`], { stdio: 'inherit' });
rmSync(stage, { recursive: true, force: true });
