// Renaming any object must update every reference to it. The World Oil Network
// reference model uses most reference sites (COSEIZE / RELEASE_COSEIZED / DELAY /
// ASSIGN … SCAN effects stored as arrays, B-event routing conditions, queue
// balkConditions, state variables on a condition's right-hand side, SET in
// C-events, container FILL / DRAIN_PARTIAL, goal scopes). For every queue,
// server type, state variable and container: rename it, then
//   1. validation reports nothing new, and
//   2. a short seeded run gives exactly the same results as the original
// — a reference left pointing at the old name changes behaviour or fails
// validation. Renaming back must restore the original model.
import { describe, expect, it } from 'vitest';
import { renameQueue, renameEntityType, renameStateVariable, renameContainer } from '../../src/engine/queue-refs.js';
import { validateModel } from '../../src/engine/validation.js';
import { buildEngine } from '../../src/engine/index.js';
import OIL from '../../reference-models/world-oil-network/oil-network-fleet-storage.json';

const SEED = 492153378;
// The closure scenario exercises more reference sites (bypass, return wave);
// it is moved to days 6–12 so a 25-day run (~0.3 s) covers closing, the
// bypass, reopening, the return to Hormuz and refinery completions. Kept short
// so this file doesn't load the CPU under the soak tier's wall-clock checks.
const DAYS = 25;
const CLOSURE = { closureEnabled: 1, closureStart: 6, closureEnd: 12 };
const BASE = {
  ...structuredClone(OIL),
  stateVariables: OIL.stateVariables.map(sv => (sv.name in CLOSURE ? { ...sv, initialValue: CLOSURE[sv.name] } : sv)),
};

function fingerprint(model) {
  // Tight safety valves: a reference left behind can make the model run away
  // (entities stranded, conditions that never clear) — fail on that, don't hang.
  const r = buildEngine(model, SEED, 0, DAYS, null, 60_000, 5000, false, undefined, { collectTrace: false, maxCEventScans: 1_000_000 }).runAll();
  return {
    stoppedEarly: !!(r.cycleLimitReached || r.scanLimitReached || r.summary.phaseCTruncated),
    total: r.summary.total,
    served: r.summary.served,
    balked: r.summary.balked,
    events: r.runtimeMetrics.events_processed,
    activity: Object.fromEntries(Object.entries(r.summary.activityCounts || {}).map(([k, v]) => [k, v?.count ?? v])),
    // In model order, not by id: a container rename changes the key by design.
    containers: model.containerTypes.map(ct => r.summary.containerLevels?.[ct.id]?.final),
  };
}
const errorsOf = model => validateModel(model).errors.map(e => e.code).sort();

// Strings in effects and conditions that still name `oldName` as a whole
// identifier — catches references that a short run doesn't exercise (e.g. a
// storage balkCondition that never triggers in the first 60 days).
function staleIdentifierRefs(model, oldName) {
  const re = new RegExp(`(?<![\\w.$])${oldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w(])`);
  const hits = [];
  const walk = (v, path) => {
    if (typeof v === 'string') { if (re.test(v)) hits.push(`${path} = ${v}`); return; }
    if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(x, `${path}.${k}`);
  };
  ['bEvents', 'cEvents', 'queues'].forEach(key => walk(model[key], key));
  return hits.filter(h => !/\.(name|description|label|id)\s=/.test(h));
}

const baseline = fingerprint(BASE);
// Guard: the shortened run must still exercise the closure paths.
if (!(baseline.activity.c_bypass > 0 && baseline.activity.c_bypass_return > 0 && baseline.activity.c_reopen_hormuz > 0 && baseline.served > 0)) {
  throw new Error(`rename test model no longer reaches the bypass / return paths: ${JSON.stringify(baseline.activity)}`);
}
const baselineErrors = errorsOf(BASE);

const RENAMES = [
  ...BASE.queues.map(q => ({ kind: 'queue', name: q.name, rename: (m, a, b) => renameQueue({ ...m, queues: m.queues.map(x => (x.name === a ? { ...x, name: b } : x)) }, a, b) })),
  ...BASE.entityTypes.filter(et => et.role === 'server').map(et => ({ kind: 'server', name: et.name, rename: (m, a, b) => renameEntityType({ ...m, entityTypes: m.entityTypes.map(x => (x.name === a ? { ...x, name: b } : x)) }, a, b, 'server') })),
  ...BASE.entityTypes.filter(et => et.role !== 'server').map(et => ({ kind: 'customer', name: et.name, rename: (m, a, b) => renameEntityType({ ...m, entityTypes: m.entityTypes.map(x => (x.name === a ? { ...x, name: b } : x)) }, a, b, 'customer') })),
  ...BASE.stateVariables.map(sv => ({ kind: 'state variable', name: sv.name, rename: (m, a, b) => renameStateVariable({ ...m, stateVariables: m.stateVariables.map(x => (x.name === a ? { ...x, name: b } : x)) }, a, b) })),
  ...BASE.containerTypes.map(ct => ({ kind: 'container', name: ct.id, rename: (m, a, b) => renameContainer({ ...m, containerTypes: m.containerTypes.map(x => (x.id === a ? { ...x, id: b } : x)) }, a, b) })),
];

describe('renaming objects in the World Oil Network reference model', () => {
  it.each(RENAMES.map(r => [r.kind, r.name, r]))('%s "%s": every reference follows the rename', (_kind, name, r) => {
    const newName = /^[A-Za-z_]\w*$/.test(name) ? `${name}_renamed` : `${name} Renamed`;
    const renamed = r.rename(structuredClone(BASE), name, newName);
    expect(errorsOf(renamed)).toEqual(baselineErrors);
    expect(fingerprint(renamed)).toEqual(baseline);
    if (r.kind === 'state variable') expect(staleIdentifierRefs(renamed, name)).toEqual([]);
    // Effects keep their shape (arrays stay arrays).
    [...renamed.bEvents, ...renamed.cEvents].forEach((e, i) => {
      expect(Array.isArray(e.effect)).toBe(Array.isArray([...BASE.bEvents, ...BASE.cEvents][i].effect));
    });
    // Renaming back restores the model exactly.
    expect(r.rename(renamed, newName, name)).toEqual(BASE);
  });
});
