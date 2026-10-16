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
