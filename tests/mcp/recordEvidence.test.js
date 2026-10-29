// flow_record_evidence: adds named evidence and assumptions and attaches them,
// writing the model file only when the change is clean.
import { describe, expect, test, beforeEach } from 'vitest';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readFileSync as readSrc } from 'node:fs';
import { recordEvidence } from '../../mcp/src/tools.js';

const bikeShopFile = JSON.parse(readSrc(new URL('../../examples/bike-shop.json', import.meta.url), 'utf8'));

let folder;
beforeEach(() => {
  folder = mkdtempSync(path.join(os.tmpdir(), 'flow-record-'));
  writeFileSync(path.join(folder, 'bike.json'), JSON.stringify(bikeShopFile, null, 2));
});

const saved = () => JSON.parse(readFileSync(path.join(folder, 'bike.json'), 'utf8')).model_json;

describe('flow_record_evidence', () => {
  test('adds an assumption and attaches it to a queue, then saves', async () => {
    const text = await recordEvidence({
      file: 'bike.json',
      add: [{ kind: 'assumption', name: 'Hire queue order', text: 'First come, first served.', confidence: 'low', contested: true }],
      attach: [{ record: 'Hire queue order', kind: 'assumption', element: 'Hire Queue' }],
    }, folder);
    expect(text).toMatch(/Added assumption "Hire queue order" \(confidence low, contested\)/);
    expect(text).toMatch(/Attached assumption "Hire queue order" to Hire Queue \(whole element\)/);
    const model = saved();
    expect(model.assumptions[0]).toMatchObject({ name: 'Hire queue order', contested: true, confidence: 0.3 });
    expect(model.backingLinks.some(l => l.recordType === 'assumption' && l.targetType === 'queue')).toBe(true);
  });

  test('refuses evidence without a named source and records nothing for it', async () => {
    const text = await recordEvidence({
      file: 'bike.json',
      add: [{ kind: 'evidence', name: 'Hire demand', description: 'Guessed' }],
    }, folder);
    expect(text).toMatch(/Evidence "Hire demand" was skipped: it needs a source/);
    expect(text).toMatch(/Nothing was changed, so nothing was saved/);
    expect(saved().evidence ?? []).toEqual([]);
  });

  test('reports an element name that does not exist and saves nothing', async () => {
    const text = await recordEvidence({
      file: 'bike.json', dryRun: true,
      add: [{ kind: 'assumption', name: 'Demand', text: 'Steady.' }],
      attach: [{ record: 'Demand', element: 'No Such Queue' }],
    }, folder);
    expect(text).toMatch(/No element named "No Such Queue"/);
    expect(text).toMatch(/Dry run: nothing was saved/);
  });

  test('attaches to one parameter when it is named', async () => {
    const text = await recordEvidence({
      file: 'bike.json',
      add: [{ kind: 'evidence', name: 'Hire data', source: 'Shop records 2025', strength: 'high', dateCaptured: '2025-06-01' }],
      attach: [{ record: 'Hire data', element: 'Hire Arrival', parameter: 'nonexistent parameter' }],
      dryRun: true,
    }, folder);
    expect(text).toMatch(/Hire Arrival" has no parameter "nonexistent parameter"/);
  });
});
