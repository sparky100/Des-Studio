// Bundles the server, Flow's engine and the schema reference into one file,
// dist/flow-mcp.mjs, that runs with plain `node` — nothing to install.
import { build } from 'esbuild';
import { readFileSync, chmodSync } from 'node:fs';

const schema = readFileSync(new URL('../docs/model-schema-for-llm.md', import.meta.url), 'utf8');
const outfile = new URL('./dist/flow-mcp.mjs', import.meta.url).pathname;

await build({
  entryPoints: [new URL('./src/server.js', import.meta.url).pathname],
  outfile,
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  define: { __FLOW_SCHEMA__: JSON.stringify(schema) },
  // Some of the MCP SDK's dependencies are CommonJS and call require().
  banner: { js: "#!/usr/bin/env node\nimport { createRequire as __createRequire } from 'node:module';\nconst require = __createRequire(import.meta.url);" },
  legalComments: 'none',
  logLevel: 'warning',
});
chmodSync(outfile, 0o755);
console.log(`Built ${outfile}`);
