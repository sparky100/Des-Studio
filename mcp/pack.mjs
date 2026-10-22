// Packs dist/flow-mcp.mjs into dist/flow.mcpb (a Claude Desktop extension
// the user installs by double-clicking), then publishes both to Flow's
// public/downloads/, with flow-mcp-version.json: the version the Connect AI
// app dialog shows and installed servers check for updates against.
//
// Runs as part of the app's `npm run build` (the root `prebuild` script), so
// every deploy serves a bundle built from the same commit as the app. The
// published files are build output and are not committed.
import { mkdirSync, rmSync, copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = p => fileURLToPath(new URL(p, import.meta.url));
const dist = here('./dist');
const publish = here('../public/downloads');
const stage = here('./.mcpb-stage');

// The version and build stamp of the server just built (build.mjs).
const { version, build } = JSON.parse(readFileSync(path.join(dist, 'build-info.json'), 'utf8'));

rmSync(stage, { recursive: true, force: true });
mkdirSync(path.join(stage, 'server'), { recursive: true });
copyFileSync(path.join(dist, 'flow-mcp.mjs'), path.join(stage, 'server', 'flow-mcp.mjs'));
// The manifest takes its version from package.json (via build-info.json),
// the one place it is set.
const manifest = JSON.parse(readFileSync(here('./bundle/manifest.json'), 'utf8'));
writeFileSync(path.join(stage, 'manifest.json'), `${JSON.stringify({ ...manifest, version }, null, 2)}\n`);

const mcpb = here(`./node_modules/.bin/mcpb${process.platform === 'win32' ? '.cmd' : ''}`);
const opts = { stdio: 'inherit', shell: process.platform === 'win32' };
execFileSync(mcpb, ['validate', path.join(stage, 'manifest.json')], opts);
execFileSync(mcpb, ['pack', stage, path.join(dist, 'flow.mcpb')], opts);
rmSync(stage, { recursive: true, force: true });

mkdirSync(publish, { recursive: true });
copyFileSync(path.join(dist, 'flow.mcpb'), path.join(publish, 'flow.mcpb'));
copyFileSync(path.join(dist, 'flow-mcp.mjs'), path.join(publish, 'flow-mcp.mjs'));
writeFileSync(path.join(publish, 'flow-mcp-version.json'), `${JSON.stringify({
  version,
  build,
  published: new Date().toISOString(),
  downloads: { extension: 'flow.mcpb', server: 'flow-mcp.mjs' },
}, null, 2)}\n`);
console.log(`Published Flow MCP ${version} (${build}) to ${publish}`);
