// Bundles the server, Flow's engine and the schema reference into one file,
// dist/flow-mcp.mjs, that runs with plain `node` — nothing to install.
// The version comes from package.json alone; the build is stamped with the
// commit it was made from, so a user's copy can be traced to its engine.
import { build } from 'esbuild';
import { readFileSync, writeFileSync, chmodSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = p => fileURLToPath(new URL(p, import.meta.url));

// Same fallbacks as the app's vite.config.js: git, else the host's commit env var.
export function buildSha() {
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    const fallback = process.env.VERCEL_GIT_COMMIT_SHA || process.env.COMMIT_REF || process.env.GITHUB_SHA;
    return fallback ? fallback.slice(0, 7) : 'unknown';
  }
}

const { version } = JSON.parse(readFileSync(here('./package.json'), 'utf8'));
const schema = readFileSync(here('../docs/model-schema-for-llm.md'), 'utf8');
const outfile = here('./dist/flow-mcp.mjs');
const sha = buildSha();

await build({
  entryPoints: [here('./src/server.js')],
  outfile,
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  define: {
    __FLOW_SCHEMA__: JSON.stringify(schema),
    __FLOW_MCP_VERSION__: JSON.stringify(version),
    __FLOW_MCP_BUILD__: JSON.stringify(sha),
  },
  // Some of the MCP SDK's dependencies are CommonJS and call require().
  banner: { js: "#!/usr/bin/env node\nimport { createRequire as __createRequire } from 'node:module';\nconst require = __createRequire(import.meta.url);" },
  legalComments: 'none',
  logLevel: 'warning',
});
chmodSync(outfile, 0o755);
// For pack.mjs, which publishes the version file the update check reads.
writeFileSync(here('./dist/build-info.json'), `${JSON.stringify({ version, build: sha })}\n`);
console.log(`Built ${outfile} (${version}, ${sha})`);
