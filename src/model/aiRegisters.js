// model/aiRegisters.js — how an AI-proposed model's evidence and assumptions
// are merged into the modeller's own model.
//
// The AI never adds evidence. It has no sources, so anything it wrote as
// evidence would look checked when it is not. It may propose assumptions and
// link them to parameters, which a modeller can then confirm or delete. Nothing
// the modeller already has is overwritten.

/**
 * @param {Record<string, any>} current   The modeller's model.
 * @param {Record<string, any>} proposed  The AI's proposed model.
 * @returns {{ evidence: any[], assumptions: any[], backingLinks: any[] }}
 */
export function mergeAiRegisters(current = {}, proposed = {}) {
  const evidence = Array.isArray(current.evidence) ? current.evidence : [];
  const assumptions = Array.isArray(current.assumptions) ? current.assumptions : [];
  const links = Array.isArray(current.backingLinks) ? current.backingLinks : [];

  const assumptionIds = new Set(assumptions.map(a => String(a.id)));
  const linkIds = new Set(links.map(l => String(l.id)));

  const newAssumptions = (Array.isArray(proposed.assumptions) ? proposed.assumptions : [])
    .filter(a => a && a.id != null && !assumptionIds.has(String(a.id)))
    .map(a => ({ ...a, id: String(a.id) }));
  for (const a of newAssumptions) assumptionIds.add(a.id);

  const newLinks = (Array.isArray(proposed.backingLinks) ? proposed.backingLinks : [])
    .filter(l => l
      && l.recordType === "assumption"
      && l.id != null && !linkIds.has(String(l.id))
      && assumptionIds.has(String(l.recordId)))
    .map(l => ({ ...l, id: String(l.id), recordId: String(l.recordId) }));

  return {
    evidence,
    assumptions: [...assumptions, ...newAssumptions],
    backingLinks: [...links, ...newLinks],
  };
}
