// End-to-end: starts the BUNDLED server (dist/flow-mcp.mjs) exactly as a
// desktop client would, and drives it over MCP stdio with the SDK's client.
// Run with `npm test` in mcp/ (builds first).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const here = path.dirname(new URL(import.meta.url).pathname);
const server = path.join(here, '..', 'dist', 'flow-mcp.mjs');
const bikeShop = JSON.parse(await readFile(path.join(here, '..', '..', 'examples', 'bike-shop.json'), 'utf8'));

let folder;
let client;

before(async () => {
  folder = await mkdtemp(path.join(os.tmpdir(), 'flow-mcp-'));
  client = new Client({ name: 'e2e', version: '1.0.0' });
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [server, '--folder', folder], stderr: 'ignore' }));
});

after(async () => {
  await client?.close();
  await rm(folder, { recursive: true, force: true });
});

const call = async (name, args = {}) => {
  const res = await client.callTool({ name, arguments: args });
  return { text: res.content.map(c => c.text).join('\n'), isError: !!res.isError };
};

test('lists the eight tools and the build_model prompt, with workflow instructions', async () => {
  const { tools } = await client.listTools();
  assert.deepEqual(tools.map(t => t.name).sort(), [
    'flow_compare_models', 'flow_get_schema', 'flow_list_models', 'flow_read_model', 'flow_run_model', 'flow_run_over_time', 'flow_save_model', 'flow_validate_model',
  ]);
  const { prompts } = await client.listPrompts();
  assert.deepEqual(prompts.map(p => p.name), ['build_model']);
  const prompt = await client.getPrompt({ name: 'build_model', arguments: { system: 'a coffee shop' } });
  assert.match(prompt.messages[0].content.text, /a coffee shop/);
  assert.match(client.getInstructions(), /flow_validate_model/);
});

test('schema: protocol and table of contents by default, sections on request', async () => {
  const intro = await call('flow_get_schema');
  assert.match(intro.text, /MANDATORY GENERATION PROTOCOL/);
  assert.match(intro.text, /Sections available/);
  assert.ok(intro.text.length < 60_000, 'the default excerpt stays small');
  const dists = await call('flow_get_schema', { section: '4' });
  assert.match(dists.text, /^## 4\. Distributions/);
});

test('validate reports blocking errors with their codes', async () => {
  const broken = structuredClone(bikeShop.model_json);
  broken.queues = [];
  const res = await call('flow_validate_model', { model: broken });
  assert.match(res.text, /error/);
  assert.match(res.text, /\[V\d+/);
});

test('run gives KPIs with confidence intervals, queues and resources', async () => {
  const res = await call('flow_run_model', { model: bikeShop, replications: 3, maxSimTime: 600 });
  assert.equal(res.isError, false, res.text);
  assert.match(res.text, /Ran 3 replications of 600/);
  assert.match(res.text, /Average wait: .*95% CI/);
  assert.match(res.text, /Queues:/);
  assert.doesNotMatch(res.text, /CI -/, 'intervals for non-negative quantities start at 0');
  assert.match(res.text, /Resources \(share of time busy\):\n- Staff \(3\): [\d.]+% \(95% CI/);
});

test('a model with errors is not run', async () => {
  const res = await call('flow_run_model', { model: { name: 'empty' } });
  assert.match(res.text, /Not run — fix these first/);
});

test('save writes a Flow export file, never overwriting; list and read find it', async () => {
  const first = await call('flow_save_model', { name: 'Bike shop / test', model: bikeShop.model_json, description: 'from e2e' });
  assert.match(first.text, /Saved "Bike shop \/ test"/);
  const second = await call('flow_save_model', { name: 'Bike shop / test', model: bikeShop.model_json });
  assert.match(second.text, /Bike shop test \(2\)\.json/);
  const files = (await readdir(folder)).sort();
  assert.deepEqual(files, ['Bike shop test (2).json', 'Bike shop test.json']);
  const saved = JSON.parse(await readFile(path.join(folder, 'Bike shop test.json'), 'utf8'));
  assert.equal(saved.name, 'Bike shop / test');
  assert.equal(saved.description, 'from e2e');
  assert.ok(Array.isArray(saved.model_json.queues) && saved.model_json.queues.length > 0);
  assert.match(saved.appVersion, /^flow-mcp /);

  assert.match((await call('flow_list_models')).text, /Bike shop test\.json — "Bike shop \/ test"/);
  assert.match((await call('flow_read_model', { file: 'Bike shop test' })).text, /"queues"/);
  const viaFile = await call('flow_run_model', { file: 'Bike shop test.json', replications: 2, maxSimTime: 300 });
  assert.match(viaFile.text, /Ran 2 replications/);
});

test('a model with errors is not saved unless allowErrors', async () => {
  const res = await call('flow_save_model', { name: 'Broken', model: { queues: [] } });
  assert.match(res.text, /Not saved/);
  const forced = await call('flow_save_model', { name: 'Broken', model: { queues: [] }, allowErrors: true });
  assert.match(forced.text, /won't run until they're fixed/);
});

test('files outside the models folder are refused', async () => {
  const res = await call('flow_read_model', { file: '../../etc/passwd' });
  assert.equal(res.isError, true);
  assert.match(res.text, /inside your Flow models folder/);
});

test('launched as the desktop extension with no folder set, it uses Documents/Flow models', async () => {
  const home = await mkdtemp(path.join(os.tmpdir(), 'flow-mcp-home-'));
  const ext = new Client({ name: 'e2e-ext', version: '1.0.0' });
  try {
    await ext.connect(new StdioClientTransport({
      command: process.execPath,
      args: [server],
      // What Claude Desktop passes when the optional folder setting is empty.
      env: { ...process.env, HOME: home, USERPROFILE: home, FLOW_MODELS_DIR: '${user_config.models_folder}' },
      stderr: 'ignore',
    }));
    const res = await ext.callTool({ name: 'flow_list_models', arguments: {} });
    assert.match(res.content[0].text, new RegExp(`${path.join(home, 'Documents', 'Flow models').replace(/[\\^$.*+?()[\]{}|]/g, '\\$&')}`));
  } finally {
    await ext.close();
    await rm(home, { recursive: true, force: true });
  }
});

test('run reports the model\'s goals and how entities finished', async () => {
  const res = await call('flow_run_model', { model: bikeShop, replications: 3, maxSimTime: 600 });
  assert.match(res.text, /How entities finished/);
  assert.match(res.text, /Goals:\n- [✓✗~] Staff utilisation under 90%: [\d.]+% \(95% CI/);
  assert.match(res.text, /met in (every replication|\d of 3 replications)|missed in every replication/);
});

test('compare runs two versions on the same random numbers and separates real differences from chance', async () => {
  const more = structuredClone(bikeShop);
  for (const e of more.model_json.entityTypes) if (e.name === 'Staff') e.count += 2;
  const res = await call('flow_compare_models', { modelA: bikeShop, modelB: more, labelA: '3 staff', labelB: '5 staff', replications: 4, maxSimTime: 600 });
  assert.equal(res.isError, false, res.text);
  assert.match(res.text, /Compared "3 staff" \(A\) and "5 staff" \(B\): 4 paired replications/);
  assert.match(res.text, /Real differences/);
  assert.match(res.text, /Staff: share of time busy: A [\d.]+% → B [\d.]+%/);
  assert.match(res.text, /Goals in A:/);
});

test('over time gives a period-by-period table', async () => {
  const res = await call('flow_run_over_time', { model: bikeShop, replications: 2, maxSimTime: 600, periods: 4 });
  assert.equal(res.isError, false, res.text);
  assert.match(res.text, /average of 2 replications, 4 equal periods of 150 minutes/);
  assert.match(res.text, /0–150\s+150–300\s+300–450\s+450–600/);
  assert.match(res.text, /Staff busy %/);
  assert.match(res.text, /Waiting in Repair Queue/);
});
