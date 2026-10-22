// The local Flow MCP server's tool logic (mcp/src). The server itself is
// exercised end-to-end over MCP stdio by mcp/test/e2e.test.mjs.
import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  fmt, fmtCi, pct, normaliseModelInput, resolveInFolder, safeFileName, exportEnvelope,
  runSettings, summariseRun, validationReport, ToolError,
} from '../../mcp/src/tools.js';
import { schemaExcerpt, splitSchema, loadSchemaText } from '../../mcp/src/schema.js';
import { extractImportedModelPayload } from '../../src/ui/shared/utils.js';
import { MODEL_JSON_FIELDS } from '../../src/model/modelJsonFields.js';

const bikeShop = JSON.parse(readFileSync(new URL('../../examples/bike-shop.json', import.meta.url), 'utf8'));

describe('number formatting', () => {
  test.each([[2931.75, '2,930'], [87.95, '88'], [0.0123, '0.012'], [0, '0'], [NaN, '—']])('%s → %s', (v, out) => expect(fmt(v)).toBe(out));
  test('intervals start at 0 for non-negative quantities, and percentages stay within 0–100%', () => {
    expect(fmtCi({ mean: 2.98, lower: -5.26, upper: 11.2 }, 'minutes')).toBe('2.98 minutes (95% CI 0–11.2)');
    expect(fmtCi({ mean: 5, lower: null, upper: null })).toBe('5');
    expect(pct({ mean: 0.925, lower: 0.822, upper: 1.03 })).toBe('92.5% (95% CI 82.2–100%)');
  });
});

describe('model input', () => {
  test('accepts a Flow export, a bare model, or either as a JSON string', () => {
    const fromExport = normaliseModelInput(bikeShop);
    expect(fromExport.name).toBe(bikeShop.name);
    expect(fromExport.model.queues.length).toBeGreaterThan(0);
    expect(normaliseModelInput(JSON.stringify(bikeShop.model_json)).model.bEvents.length).toBe(bikeShop.model_json.bEvents.length);
    // Every model_json field is present, so the validator never meets undefined arrays.
    for (const f of MODEL_JSON_FIELDS.filter(f => !['timeUnit', 'epoch', 'notes'].includes(f))) {
      expect(normaliseModelInput({}).model).toHaveProperty(f);
    }
  });
  test('bad input is a readable error', () => {
    expect(() => normaliseModelInput('{oops')).toThrow(ToolError);
    expect(() => normaliseModelInput([1])).toThrow(/Flow model JSON object/);
  });
});

describe('files', () => {
  test('only files inside the models folder', () => {
    expect(resolveInFolder('/m', 'a.json')).toBe('/m/a.json');
    expect(resolveInFolder('/m', 'a')).toBe('/m/a.json');
    expect(() => resolveInFolder('/m', '../x.json')).toThrow(/inside your Flow models folder/);
    expect(() => resolveInFolder('/m', '/etc/passwd')).toThrow(ToolError);
  });
  test('safe file names', () => {
    expect(safeFileName('GP surgery: v2/peak')).toBe('GP surgery v2 peak');
    expect(safeFileName('   ')).toBe('Untitled model');
  });
  test('a saved file imports through Flow’s own import with nothing lost', () => {
    const input = normaliseModelInput(bikeShop);
    const envelope = JSON.parse(JSON.stringify(exportEnvelope({ ...input, name: 'Bike shop' })));
    const imported = extractImportedModelPayload(envelope);
    expect(imported.name).toBe('Bike shop (Imported)');
    for (const f of ['entityTypes', 'queues', 'bEvents', 'cEvents', 'stateVariables', 'containerTypes', 'goals', 'experimentDefaults']) {
      expect(imported[f]).toEqual(bikeShop.model_json[f] ?? (f === 'experimentDefaults' ? {} : []));
    }
    expect(validationReport(imported).errors).toEqual([]);
  });
});

describe('run settings and reading results', () => {
  test('call overrides, else the model’s experiment defaults; replications capped', () => {
    const s = runSettings(bikeShop.model_json, { replications: 500, warmupPeriod: 60 });
    expect(s).toMatchObject({ replications: 50, maxSimTime: 2400, warmupPeriod: 60, baseSeed: bikeShop.model_json.experimentDefaults.seed });
    expect(runSettings({}, {})).toMatchObject({ replications: 10, maxSimTime: 500, warmupPeriod: 0 });
  });

  test('flags a bottleneck and a system still overloaded at the end', () => {
    const model = { timeUnit: 'minutes', queues: [{ name: 'Counter' }], entityTypes: [{ name: 'Clerk', role: 'server', count: 1 }], experimentDefaults: {} };
    const rep = i => ({
      summary: { total: 100, served: 50, servedRatio: 0.5, avgWait: 30 + i, avgTimeInSystem: 40 + i,
        perResource: { Clerk: { utilisation: 0.98 } }, terminatingState: { waitingAtEnd: 40 } },
      waitDist: { Counter: { mean: 30 + i, p95: 60, n: 50 } },
      warnings: [],
    });
    const text = summariseRun(model, { replications: 3, maxSimTime: 480, warmupPeriod: 0, baseSeed: 1 }, { results: [rep(0), rep(1), rep(2)], failures: [] });
    expect(text).toMatch(/- Average wait: 31 minutes \(95% CI/);
    expect(text).toMatch(/- Counter: average wait 31 minutes/);
    expect(text).toMatch(/- Clerk \(1\): 98%/);
    expect(text).toMatch(/Clerk is busy 98% of the time — a bottleneck/);
    expect(text).toMatch(/About 40 entities are still waiting when the run ends/);
    expect(text).toMatch(/No warm-up/);
  });

  test('says when a run hit an engine safety limit, and when nothing completes', () => {
    const model = { queues: [], entityTypes: [], experimentDefaults: {} };
    const text = summariseRun(model, { replications: 1, maxSimTime: 10, warmupPeriod: 5, baseSeed: 1 },
      { results: [{ summary: { total: 3, served: 0 }, cycleLimitReached: true }], failures: [] });
    expect(text).toMatch(/hit one of the engine’s safety limits/);
    expect(text).toMatch(/Nothing completes/);
    expect(text).toMatch(/One replication shows one possible day/);
  });
});

describe('schema excerpts', () => {
  const schema = loadSchemaText();
  test('default: protocol, common mistakes and the section list — not the whole 200 KB', () => {
    const intro = schemaExcerpt(schema);
    expect(intro).toMatch(/^Using these tools:/);
    expect(intro).toMatch(/## MANDATORY GENERATION PROTOCOL/);
    expect(intro).toMatch(/## TOP LLM MISTAKES/);
    expect(intro).toMatch(/- 6\. C-Events/);
    expect(intro.length).toBeLessThan(schema.length / 3);
  });
  test('sections by number or title words; unknown sections list what exists', () => {
    expect(schemaExcerpt(schema, '4')).toMatch(/^## 4\. Distributions/);
    expect(schemaExcerpt(schema, 'distances')).toMatch(/^## 8\.1 Distances/);
    const two = schemaExcerpt(schema, '3, 4');
    expect(two).toMatch(/## 3\. Queues[\s\S]*## 4\. Distributions/);
    expect(schemaExcerpt(schema, 'nonsense')).toMatch(/No section matches/);
    // A sub-section on its own, e.g. the complete reference model.
    const ref = schemaExcerpt(schema, '12.3');
    expect(ref).toMatch(/^### 12\.3 Complete Reference Model/);
    expect(ref).not.toMatch(/### 12\.4/);
    expect(schemaExcerpt(schema, 'all')).toBe(schema);
  });
  test('headings inside code blocks are not treated as sections', () => {
    const { sections } = splitSchema('## A\ntext\n```\n## not a heading\n```\n## B\n');
    expect(sections.map(s => s.title)).toEqual(['A', 'B']);
  });
});

import { goalLines, routeLines, compareRuns, periodAverages, summariseOverTime } from '../../mcp/src/tools.js';

describe('goals, routes, comparison and time series (v0.2)', () => {
  const settings = { replications: 3, maxSimTime: 480, warmupPeriod: 0, baseSeed: 1 };

  test('goals are evaluated per replication with Flow’s goal code: value, CI, target, met count', () => {
    const model = { timeUnit: 'minutes', queues: [], entityTypes: [], goals: [{ label: 'Wait under 10', metric: 'summary.avgWait', operator: '<', target: 10 }] };
    const reps = [8, 9, 12].map(w => ({ summary: { avgWait: w } }));
    const [, title, line] = goalLines(model, reps);
    expect(title).toBe('Goals:');
    expect(line).toMatch(/^- ~ Wait under 10: 9\.67 minutes \(95% CI .*minutes\) vs target < 10 minutes — met in 2 of 3 replications$/);
    expect(goalLines({ goals: [] }, reps)).toEqual([]);
  });

  test('routes are listed only when there is more than one way to finish', () => {
    const one = [{ summary: { outcomes: { a: { routeLabel: 'Done', status: 'completed', count: 5, avgSojourn: 3 } } } }];
    expect(routeLines(one, 'minutes')).toEqual([]);
    const two = [{ summary: { outcomes: { a: { routeLabel: 'Served', status: 'completed', count: 5, avgSojourn: 3 }, b: { routeLabel: 'Gave up', status: 'reneged', count: 2, avgSojourn: 9 } } } }];
    const lines = routeLines(two, 'minutes');
    expect(lines).toContain('- Gave up (reneged): 2; average time in system 9 minutes');
  });

  test('comparison separates real differences from chance, with paired CIs on B − A', () => {
    const model = { timeUnit: 'minutes', queues: [], entityTypes: [] };
    const rep = (wait, total) => ({ summary: { total, served: total, servedRatio: 1, avgWait: wait, avgTimeInSystem: wait + 5 } });
    const runA = { results: [rep(60, 100), rep(55, 104), rep(65, 98), rep(58, 101)], failures: [] };
    const runB = { results: [rep(10, 101), rep(12, 99), rep(9, 103), rep(11, 100)], failures: [] };
    const text = compareRuns(model, model, { ...settings, replications: 4 }, runA, runB, { a: '1 nurse', b: '2 nurses' });
    expect(text).toMatch(/Compared "1 nurse" \(A\) and "2 nurses" \(B\): 4 paired replications/);
    const real = text.split('Could be chance')[0];
    expect(real).toMatch(/Average wait: A 59\.5 minutes → B 10\.5 minutes; difference -49 minutes \(95% CI -\d+(\.\d+)? to -\d+(\.\d+)? minutes\)/);
    expect(text.split('Could be chance')[1]).toMatch(/Arrived/);
  });

  test('period averages are time-weighted over a step series', () => {
    // 0 until t=5, then 10 until the end (t=10): two periods of 5 → [0, 10]; one period → 5.
    const samples = [{ t: 0, v: 0 }, { t: 5, v: 10 }];
    expect(periodAverages(samples, s => s.v, 0, 10, 2)).toEqual([0, 10]);
    expect(periodAverages(samples, s => s.v, 0, 10, 1)).toEqual([5]);
  });

  test('over-time table: queues, % busy, WIP per period, averaged across replications', () => {
    const model = { timeUnit: 'minutes', queues: [{ name: 'Triage' }], entityTypes: [{ name: 'Nurse', role: 'server' }] };
    const series = (q) => [
      { t: 0, byQueue: { Triage: { waiting: 0 } }, byType: { Nurse: { busy: 1, total: 2, failed: 0 } }, wip: 1 },
      { t: 240, byQueue: { Triage: { waiting: q } }, byType: { Nurse: { busy: 2, total: 2, failed: 0 } }, wip: q + 2 },
    ];
    const text = summariseOverTime(model, settings, { results: [{ timeSeries: series(10) }, { timeSeries: series(20) }] }, 2);
    expect(text).toMatch(/average of 2 replications, 2 equal periods of 240 minutes/);
    expect(text).toMatch(/Waiting in Triage\s+0\s+15/);
    expect(text).toMatch(/Nurse busy %\s+50\s+100/);
  });
});

import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  runReplicationsSync, pairBySeed, seedList, runLength, sweepValues, findParam, summariseTrace,
  sweep, traceRun, editModel, applyChange, parsePath, save,
} from '../../mcp/src/tools.js';
import { enumerateSweepableParams, applySweepValue } from '../../src/engine/sweep-params.js';

describe('review fixes (v0.3)', () => {
  test('a section number picks that section and its children, not every title containing the digit', () => {
    const schema = loadSchemaText();
    const one = schemaExcerpt(schema, '1');
    expect(one).toMatch(/^## 1\. Top-Level Structure/);
    expect(one).not.toMatch(/## 1[0-5]\./);
    expect(schemaExcerpt(schema, '2')).toMatch(/## 2\.1 Runtime Outcome Metadata/);
    expect(schemaExcerpt(schema, '2')).not.toMatch(/## 12\./);
    expect(schemaExcerpt(schema, '5')).not.toMatch(/## 15\./);
    expect(schemaExcerpt(schema, '8')).toMatch(/## 8\.1 Distances/);
  });

  // Counts to 600 one per time unit, then stops on its rule.
  const counter = { stateVariables: [{ name: 'n', initialValue: '0' }],
    bEvents: [{ id: 'b', name: 'Tick', scheduledTime: '0', effect: 'n++', schedules: [{ eventId: 'b', dist: 'Fixed', distParams: { value: 1 } }] }],
    experimentDefaults: { terminationMode: 'condition', terminationCondition: 'n >= 600', maxSimTime: 50 } };

  test('a model that stops on a rule runs until the rule, as in Flow, unless the call caps it', () => {
    const s = runSettings(counter, {});
    expect(s).toMatchObject({ maxSimTime: null, terminationCondition: 'n >= 600' });
    expect(runReplicationsSync(counter, { ...s, replications: 1 }).results[0].finalTime).toBe(599);
    expect(runSettings(counter, { maxSimTime: 100 }).maxSimTime).toBe(100);
    expect(runLength(s, 'minutes')).toBe('until its stop rule is met');
    expect(runLength({ ...s, maxSimTime: 100 }, 'minutes')).toBe('until its stop rule is met (at most 100 minutes)');
  });

  test('comparisons pair replications by seed, so a failure in one version never misaligns them', () => {
    const rep = v => ({ summary: { v } });
    const runA = { results: [rep('a1'), rep('a2'), rep('a3')], seeds: [1, 2, 3] };
    const runB = { results: [rep('b1'), rep('b3')], seeds: [1, 3] }; // seed 2 failed in B
    const p = pairBySeed({ baseSeed: 1 }, runA, runB);
    expect(p.seeds).toEqual([1, 3]);
    expect(p.a.map(r => r.summary.v)).toEqual(['a1', 'a3']);
    expect(p.b.map(r => r.summary.v)).toEqual(['b1', 'b3']);
  });

  test('the seeds line names the seeds that actually ran', () => {
    expect(seedList([4, 5, 6])).toBe('seeds 4–6');
    expect(seedList([4, 6])).toBe('seeds 4, 6');
    const model = { queues: [], entityTypes: [], experimentDefaults: {} };
    const text = summariseRun(model, { replications: 10, maxSimTime: 10, warmupPeriod: 5, baseSeed: 1 },
      { results: [{ summary: { total: 1, served: 1 } }, { summary: { total: 1, served: 1 } }], seeds: [1, 2], failures: [] });
    expect(text).toMatch(/seeds 1–2\./);
    expect(text).toMatch(/Stopped after 2 of 10/);
  });

  test('batch replications skip the event trace and per-entity detail', () => {
    const { results } = runReplicationsSync(bikeShop.model_json, { replications: 1, maxSimTime: 60, warmupPeriod: 0, baseSeed: 1, terminationCondition: null });
    expect(results[0].log).toEqual([]);
    expect(results[0].entitySummary).toBeUndefined();
  });
});

describe('flow_sweep_parameter', () => {
  const params = enumerateSweepableParams(bikeShop.model_json);
  test('parameters are found by name, path or a unique part of the name', () => {
    expect(findParam(params, 'number of staff').label).toBe('Number of Staff');
    expect(findParam(params, 'Staff').label).toBe('Number of Staff');
    expect(() => findParam(params, 'Number of')).toThrow(/matches \d+ parameters/);
    expect(() => findParam(params, 'nope')).toThrow(/No parameter matches "nope"[\s\S]*Number of Staff — now 3/);
  });
  test('values from a list or a range; whole numbers for counts; capped', () => {
    const staff = findParam(params, 'Number of Staff');
    expect(sweepValues({ from: 1, to: 4 }, staff)).toEqual([1, 2, 3, 4]);
    expect(sweepValues({ values: [2.4, 2.6, 3] }, staff)).toEqual([2, 3]);
    expect(sweepValues({ from: 10, to: 4, step: 3 }, staff)).toEqual([10, 7, 4]);
    expect(() => sweepValues({ from: 1, to: 100 }, staff)).toThrow(/more than 12 values/);
    expect(() => sweepValues({}, staff)).toThrow(/Give `values`/);
  });
  test('a swept server count stays a number, so the point passes validation', () => {
    const m = applySweepValue(bikeShop.model_json, findParam(params, 'Number of Staff'), 5);
    expect(m.entityTypes.find(e => e.name === 'Staff').count).toBe(5);
    expect(validationReport(m).errors).toEqual([]);
  });
  test('runs each value on the same seeds and reports a row per value plus goals', async () => {
    const text = await sweep({ model: bikeShop, parameter: 'Number of Staff', values: [2, 3], replications: 2, maxSimTime: 300 }, '/nowhere');
    expect(text).toMatch(/Varied "Number of Staff" \(now 3\): 2 values × 2 replications of 300 minutes/);
    expect(text).toMatch(/\n2\s+[\d.]+ ±/);
    expect(text).toMatch(/\n3\s+[\d.]+ ±/);
    expect(text).toMatch(/Values where each goal was met in every replication:/);
  });
  test('without a parameter it lists what can be varied; a value that breaks the model is reported, not run', async () => {
    expect(await sweep({ model: bikeShop }, '/nowhere')).toMatch(/^Parameters you can vary[\s\S]*- Number of Staff — now 3/);
    const text = await sweep({ model: bikeShop, parameter: 'Number of Staff', values: [0, 3], replications: 1, maxSimTime: 100 }, '/nowhere');
    expect(text).toMatch(/- 0: not run — \[V19\]/);
  });
});

describe('flow_trace_run', () => {
  test('counts what fired, flags what never did, and shows who is left and the log', async () => {
    const text = await traceRun({ model: bikeShop, until: 120, limit: 5 }, '/nowhere');
    expect(text).toMatch(/^One replication \(seed \d+\), ended at t=120 minutes/);
    expect(text).toMatch(/Rules \(C-events\):\n- "/);
    expect(text).toMatch(/"Serve Purchase Customer" fired \d+ times/);
    expect(text).toMatch(/NEVER FIRED: its condition was never true/);
    expect(text).toMatch(/Events \(B-events\):/);
    expect(text).toMatch(/Still in the system at the end:/);
    expect(text).toMatch(/Event log \(t=0–120; \d+ events\):\nt=0 {2}B: "/);
    expect(text).toMatch(/…\d+ more\. Narrow it/);
  });
  test('one entity: its path and only the events that mention it', async () => {
    const text = await traceRun({ model: bikeShop, until: 300, entity: 120 }, '/nowhere');
    expect(text).toMatch(/Entity #120 \(PurchaseCustomer\): arrived t=0, now done\./);
    expect(text).toMatch(/- Purchase Queue → Staff: waited/);
    const log = text.split('Event log')[1];
    expect(log.split('\n').filter(l => l.startsWith('t=')).every(l => /#120(?!\d)/.test(l))).toBe(true);
  });
  test('a rule whose condition holds but whose effect does nothing is called out', () => {
    const model = { cEvents: [{ id: 'c', name: 'Serve' }], bEvents: [] };
    const result = { finalTime: 10, log: [{ phase: 'C', time: 1, cEval: { eventId: 'c', conditionTrue: true }, event: { fired: false } }] };
    expect(summariseTrace(model, {}, 1, result)).toMatch(/"Serve" NEVER FIRED: its condition was true 1 time but its effect did nothing/);
  });
  test('refuses a run too long to trace in full unless given a window', async () => {
    await expect(traceRun({ model: bikeShop, maxSimTime: 1e9 }, '/nowhere')).rejects.toThrow(/too long to trace in full/);
    await expect(traceRun({ model: bikeShop, from: 50, until: 10 }, '/nowhere')).rejects.toThrow(/`until` must be after `from`/);
  });
});

describe('flow_edit_model', () => {
  test('paths address list items by id, name or position; ops set, remove, append', () => {
    expect(parsePath('/a/b~1c/0')).toEqual(['a', 'b/c', '0']);
    const m = structuredClone(bikeShop.model_json);
    expect(applyChange(m, { path: 'entityTypes/Staff/count', value: 5 })).toBe('entityTypes/Staff/count: 3 → 5');
    expect(m.entityTypes.find(e => e.name === 'Staff').count).toBe(5);
    expect(applyChange(m, { path: 'entityTypes/staff/count', value: 6 })).toMatch(/5 → 6/);
    const q = m.queues[0];
    applyChange(m, { path: `queues/${q.id}/capacity`, value: 4 });
    expect(m.queues[0].capacity).toBe(4);
    const n = m.goals.length;
    applyChange(m, { path: 'goals', op: 'append', value: { label: 'x' } });
    applyChange(m, { path: 'goals/-', value: { label: 'y' } });
    expect(m.goals.length).toBe(n + 2);
    applyChange(m, { path: `goals/${n}`, op: 'remove' });
    expect(m.goals[n].label).toBe('y');
    expect(() => applyChange(m, { path: 'entityTypes/Nobody/count', value: 1 })).toThrow(/"entityTypes" has no "Nobody"\. It has: .*Staff/);
    expect(() => applyChange(m, { path: 'entityTypes/Staff/count' })).toThrow(/needs a `value`/);
    expect(() => applyChange(m, { path: 'x/y', value: 1 })).toThrow(/"x" doesn't exist/);
  });

  test('saves in place, keeping the name, description and canvas layout; refuses errors; dry run saves nothing', async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'flow-edit-'));
    try {
      await save({ name: 'Bike', description: 'd', model: bikeShop }, dir);
      const file = path.join(dir, 'Bike.json');
      const withLayout = JSON.parse(readFileSync(file, 'utf8'));
      withLayout.model_json.graph = { nodes: [{ id: 'n1', x: 10, y: 20 }] };
      (await import('node:fs')).writeFileSync(file, JSON.stringify(withLayout));

      const dry = await editModel({ file: 'Bike', changes: [{ path: 'entityTypes/Staff/count', value: 4 }], dryRun: true }, dir);
      expect(dry).toMatch(/Dry run: nothing was saved/);
      expect(JSON.parse(readFileSync(file, 'utf8')).model_json.entityTypes.find(e => e.name === 'Staff').count).toBe(3);

      const bad = await editModel({ file: 'Bike', changes: [{ path: 'entityTypes/Staff/count', value: 0 }] }, dir);
      expect(bad).toMatch(/New errors:\n- \[V19\][\s\S]*Not saved/);

      const ok = await editModel({ file: 'Bike', changes: [{ path: 'entityTypes/Staff/count', value: 4 }] }, dir);
      expect(ok).toMatch(/- entityTypes\/Staff\/count: 3 → 4[\s\S]*No errors after the change\.[\s\S]*Saved over/);
      const saved = JSON.parse(readFileSync(file, 'utf8'));
      expect(saved).toMatchObject({ name: 'Bike', description: 'd' });
      expect(saved.model_json.entityTypes.find(e => e.name === 'Staff').count).toBe(4);
      expect(saved.model_json.graph).toEqual({ nodes: [{ id: 'n1', x: 10, y: 20 }] });

      await expect(editModel({ file: 'Bike', changes: [{ path: 'nope/x', value: 1 }] }, dir)).rejects.toThrow(/Change 1 \(nope\/x\) not applied, and nothing was saved/);
      await expect(editModel({ changes: [{ path: 'a', value: 1 }] }, dir)).rejects.toThrow(/Give the `file`/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
