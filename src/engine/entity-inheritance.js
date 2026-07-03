// engine/entity-inheritance.js — build-time merge for entity type inheritance.
//
// A child entity type with `parentTypeId` set inherits its ancestors'
// attrDefs, skills, and skillProfiles, producing a flat runtime record.
// Used both by buildEngine (to run the merged model) and validateModel (so
// skill/attribute checks see inherited fields instead of false-flagging a
// child type that relies on its parent's declarations). Cycles/role
// mismatches are rejected by validation rule V67; resolveAncestorChain
// defends against a lingering cycle with a `seen` guard regardless.

export function resolveAncestorChain(entityType, byId) {
  const chain = [];
  const seen = new Set([entityType.id]);
  let current = byId.get(entityType.parentTypeId);
  while (current) {
    if (seen.has(current.id)) break;
    seen.add(current.id);
    chain.unshift(current);
    current = current.parentTypeId ? byId.get(current.parentTypeId) : null;
  }
  return chain;
}

function mergeByName(chainLists, ownList) {
  const byName = new Map();
  let anonIdx = 0;
  for (const list of [...chainLists, ownList]) {
    for (const item of list) {
      const key = item?.name ? `n:${item.name}` : `i:${anonIdx++}`;
      byName.set(key, item);
    }
  }
  return [...byName.values()];
}

export function applyEntityInheritance(model) {
  const entityTypes = model.entityTypes || [];
  if (!entityTypes.some(et => et.parentTypeId)) return model;
  const byId = new Map(entityTypes.map(et => [et.id, et]));
  return {
    ...model,
    entityTypes: entityTypes.map(et => {
      if (!et.parentTypeId) return et;
      const chain = resolveAncestorChain(et, byId);
      if (!chain.length) return et;
      const skillSet = new Set();
      for (const a of [...chain, et]) for (const s of a.skills || []) skillSet.add(s);
      return {
        ...et,
        attrDefs: mergeByName(chain.map(a => a.attrDefs || []), et.attrDefs || []),
        skills: [...skillSet],
        skillProfiles: mergeByName(chain.map(a => a.skillProfiles || []), et.skillProfiles || []),
      };
    }),
  };
}
