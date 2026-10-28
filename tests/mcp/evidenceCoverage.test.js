// flow_evidence_coverage: the read-only coverage report over a model.
import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { evidenceCoverage } from '../../mcp/src/tools.js';

const bikeShopFile = JSON.parse(readFileSync(new URL('../../examples/bike-shop.json', import.meta.url), 'utf8'));
// The example is an export envelope; the model's fields sit under model_json.
const bikeShop = bikeShopFile.model_json ?? bikeShopFile;

describe('flow_evidence_coverage', () => {
  test('a model with no records says so and asks for assumptions', async () => {
    const text = await evidenceCoverage({ model: bikeShop }, '/tmp');
    expect(text).toMatch(/^Evidence coverage: 0 of \d+ elements and parameters evidenced/);
    expect(text).toMatch(/Nothing is recorded yet/);
  });

  test('lists a contested assumption and its warning', async () => {
    const model = {
      ...bikeShop,
      assumptions: [{ id: 'as_fifo', name: 'Triage order', text: 'First come, first served.', contested: true, confidence: 0.3 }],
      backingLinks: [],
    };
    const text = await evidenceCoverage({ model }, '/tmp');
    expect(text).toMatch(/Contested assumptions:\n- Triage order: First come, first served\./);
    expect(text).toMatch(/V-BACK-02: Assumption 'Triage order' is not attached to anything\./);
  });

  test('reports arrival or capacity parameters that nothing backs', async () => {
    const model = {
      ...bikeShop,
      evidence: [{ id: 'ev_x', name: 'Audit', type: 'data', description: 'd', source: '' }],
      backingLinks: [],
    };
    const text = await evidenceCoverage({ model }, '/tmp');
    expect(text).toMatch(/Arrival and capacity parameters with no evidence or assumption:/);
  });
});
