// Round trip from Flow to an AI app and back: an export records the model it
// came from, the Flow MCP's "open in Flow" link carries it as `target`, and
// the import preview updates that model with every model_json field.
import { describe, test, expect } from 'vitest';
import { buildImportLink, parseImportLink, encodeModelToLink } from '../../src/utils/importLink.js';
import { buildModelUpdateFromImport, canEditModel } from '../../src/ui/shared/utils.js';
import { buildModelExportPayload } from '../../src/ui/modelDetailHelpers.js';
import { MODEL_JSON_ARRAY_FIELDS } from '../../src/model/modelJsonFields.js';

const fullModel = () => {
  const m = { id: 'm-1', owner_id: 'u-1', access: {}, visibility: 'private', name: 'Clinic', description: 'old' };
  for (const k of MODEL_JSON_ARRAY_FIELDS) m[k] = [{ id: `${k}-old` }];
  m.graph = { nodes: [{ id: 'n', x: 1, y: 2 }] };
  m.experimentDefaults = { replications: 3 };
  m.timeUnit = 'minutes';
  m.notes = 'old notes';
  return m;
};

describe('import links', () => {
  test('compressed links round-trip the model and its target, and are shorter than plain ones', async () => {
    const model = { name: 'Big', queues: Array.from({ length: 200 }, (_, i) => ({ id: `q${i}`, name: `Queue ${i}` })) };
    const link = await buildImportLink(model, { baseUrl: 'https://flow.test/', targetId: 'm-1' });
    expect(link).toMatch(/^https:\/\/flow\.test\/#import\?z=[\w-]+&target=m-1$/);
    expect(link.length).toBeLessThan(encodeModelToLink(model, 'https://flow.test').length / 4);
    expect(await parseImportLink(link)).toEqual({ model, targetId: 'm-1' });
  });

  test('plain m= links still work, and a Flow export is flattened for the preview', async () => {
    const link = encodeModelToLink({ name: 'Env', description: 'd', model_json: { queues: [{ id: 'q' }] } }, 'https://flow.test');
    expect(await parseImportLink(link)).toEqual({ model: { name: 'Env', description: 'd', queues: [{ id: 'q' }] }, targetId: null });
    await expect(parseImportLink('#import?z=!!!')).rejects.toThrow();
  });
});

describe('updating a model from an import', () => {
  test('replaces every model_json field, name and description; keeps id, owner and sharing', () => {
    const target = fullModel();
    const incoming = { name: 'Clinic v2', description: 'new' };
    for (const k of MODEL_JSON_ARRAY_FIELDS) incoming[k] = [{ id: `${k}-new` }];
    incoming.experimentDefaults = { replications: 10 };
    incoming.graph = { nodes: [{ id: 'n', x: 5, y: 6 }] };
    incoming.timeUnit = 'hours';
    const updated = buildModelUpdateFromImport(target, incoming);
    for (const k of MODEL_JSON_ARRAY_FIELDS) expect(updated[k], k).toEqual([{ id: `${k}-new` }]);
    expect(updated).toMatchObject({
      id: 'm-1', owner_id: 'u-1', visibility: 'private', name: 'Clinic v2', description: 'new',
      experimentDefaults: { replications: 10 }, graph: { nodes: [{ id: 'n', x: 5, y: 6 }] }, timeUnit: 'hours',
    });
  });

  test('keeps the target\'s layout when the import has none, and reads a Flow export envelope', () => {
    const target = fullModel();
    const updated = buildModelUpdateFromImport(target, { name: 'X', model_json: { queues: [{ id: 'q' }] } });
    expect(updated.graph).toEqual(target.graph);
    expect(updated.queues).toEqual([{ id: 'q' }]);
    expect(updated.description).toBe('old');
    expect(() => buildModelUpdateFromImport(target, null)).toThrow();
  });

  test('only the owner or an editor can update', () => {
    const m = { owner_id: 'o', access: { e: 'editor', v: 'viewer' } };
    expect(canEditModel(m, 'o')).toBe(true);
    expect(canEditModel(m, 'e')).toBe(true);
    expect(canEditModel(m, 'v')).toBe(false);
    expect(canEditModel(null, 'o')).toBe(false);
  });

  test('exports record the model they came from', () => {
    expect(buildModelExportPayload(fullModel(), 't').sourceModelId).toBe('m-1');
    const { id: _id, ...unsaved } = fullModel();
    expect(buildModelExportPayload(unsaved, 't')).not.toHaveProperty('sourceModelId');
  });
});
