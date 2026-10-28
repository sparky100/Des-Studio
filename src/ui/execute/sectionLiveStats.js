// Live per-section numbers for the Run canvas's Sections view.
//
// Everything is derived from the current snapshot, with the same definitions the
// Results panel uses for finished runs (a section's time is the wait + service an
// entity has spent at the section's queues), but computed mid-run:
//   inNow    customers waiting in a section queue or being served by a section activity
//   entered  customers that are in the section now or have finished a stage there
//   left     entered - inNow
//   avgTime  mean wait + service over customers that finished a stage in the section
//   busiest  the section's most utilised activity (utilisation is 0-100)

const key = name => String(name ?? "").trim().toLowerCase();

/**
 * @param {{ nodes: Array<Record<string, any>>, snap: Record<string, any> | null, activityLive?: Map<string, any> }} args
 *   nodes: the canonical (detail) graph nodes, carrying sectionId, type, label.
 *   activityLive: nodeId -> deriveActivityLiveData result, for the busiest-resource line.
 * @returns {Map<string, { inNow: number, entered: number, left: number, avgTime: number | null, busiest: { name: string, utilisation: number } | null }>}
 */
export function computeSectionLiveStats({ nodes = [], snap, activityLive = new Map() }) {
  const out = new Map();
  if (!snap) return out;

  const queuesBySection = new Map();
  const activitiesBySection = new Map();
  const activityNodesBySection = new Map();
  for (const node of nodes) {
    if (!node.sectionId) continue;
    if (!out.has(node.sectionId)) {
      out.set(node.sectionId, null);
      queuesBySection.set(node.sectionId, new Set());
      activitiesBySection.set(node.sectionId, new Set());
      activityNodesBySection.set(node.sectionId, []);
    }
    if (node.type === "queue") queuesBySection.get(node.sectionId).add(key(node.label));
    if (node.type === "activity") {
      activitiesBySection.get(node.sectionId).add(key(node.label));
      activityNodesBySection.get(node.sectionId).push(node);
    }
  }

  const customers = (snap.entities || []).filter(e => e.role !== "server");
  for (const sectionId of out.keys()) {
    const queues = queuesBySection.get(sectionId);
    const activities = activitiesBySection.get(sectionId);
    const here = new Set();
    const touched = new Set();
    let timeSum = 0;
    let timeCount = 0;

    for (const e of customers) {
      if ((e.status === "waiting" && queues.has(key(e.queue))) ||
          (e.status === "serving" && activities.has(key(e.ceventName)))) {
        here.add(e.id);
      }
      let spent = 0;
      let finishedHere = false;
      for (const stage of e.stages || []) {
        if (!queues.has(key(stage.queueName))) continue;
        finishedHere = true;
        if (Number.isFinite(stage.stageWait)) spent += stage.stageWait;
        if (Number.isFinite(stage.stageService)) spent += stage.stageService;
      }
      if (finishedHere) {
        touched.add(e.id);
        timeSum += spent;
        timeCount++;
      }
    }
    for (const id of here) touched.add(id);

    let busiest = null;
    for (const node of activityNodesBySection.get(sectionId)) {
      const live = activityLive.get(node.id);
      const utilisation = live?.utilisation;
      if (!Number.isFinite(utilisation)) continue;
      if (!busiest || utilisation > busiest.utilisation) {
        busiest = { name: live.serverTypeName || node.label, utilisation };
      }
    }

    out.set(sectionId, {
      inNow: here.size,
      entered: touched.size,
      left: touched.size - here.size,
      avgTime: timeCount ? timeSum / timeCount : null,
      busiest,
    });
  }
  return out;
}
