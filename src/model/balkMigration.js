// src/model/balkMigration.js — migrate legacy B-event-level balking onto the Queue (F11.2)
//
// Balking used to be configured on the ARRIVE B-event (balkProbability/balkCondition).
// It now lives on the Queue itself so it applies uniformly regardless of how an entity
// joins (ARRIVE, RELEASE, routing, batch/split). This is a pure, idempotent, load-time
// transform: it copies legacy fields onto the matching queue only if the queue doesn't
// already define its own (never clobbers), and leaves the B-event's fields in place.
//
// migrateBalkingToQueues() runs before normalizeModelConditions() in db/models.js's norm()
// pipeline, so a string b.balkCondition copied here would bypass normalization entirely —
// normalize it at the copy site instead of relying on composition order.

import { migrateLegacyCondition } from "./conditionFormat.js";

function parseArriveTarget(effect) {
  const text = Array.isArray(effect) ? effect.join(";") : String(effect || "");
  const m = text.match(/ARRIVE\(([^,)]+)(?:\s*,\s*([^,)]+))?\)/i);
  if (!m) return null;
  return m[2]?.trim() || (m[1].trim() + "Queue");
}

export function migrateBalkingToQueues(model = {}) {
  const bEvents = model.bEvents || [];
  const queues  = model.queues  || [];
  if (!bEvents.length || !queues.length) return model;

  let changed = false;
  const nextQueues = queues.map(q => ({ ...q }));

  for (const b of bEvents) {
    if (b.balkProbability == null && !b.balkCondition) continue;
    const queueName = parseArriveTarget(b.effect);
    if (!queueName) continue;
    const q = nextQueues.find(qq => (qq.name || "").trim().toLowerCase() === queueName.trim().toLowerCase());
    if (!q) continue;
    if (q.balkProbability == null && b.balkProbability != null) {
      q.balkProbability = b.balkProbability;
      changed = true;
    }
    if (!q.balkCondition && b.balkCondition) {
      q.balkCondition = migrateLegacyCondition(b.balkCondition);
      changed = true;
    }
  }

  if (!changed) return model;
  return { ...model, queues: nextQueues };
}
