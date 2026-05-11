// engine/queue-refs.js — Queue reference propagation
// When a queue is renamed, all references throughout the model must be updated.
// References exist in: B-event effects, C-event effects, routing configs, overflow destinations.

export function renameQueue(model, oldName, newName) {
  if (!oldName || !newName || oldName === newName) return model;

  const qn = (s) => s.trim().toLowerCase();
  const oldLower = qn(oldName);
  const newLower = qn(newName);

  // Helper: replace queue name in a macro string
  const replaceInMacro = (eff, patterns) => {
    if (typeof eff !== "string") return eff;
    let result = eff;
    for (const [pattern, queueIdx] of patterns) {
      const regex = new RegExp(`(${pattern}\\s*\\([^,)]*(?:,\\s*)?)([^,)]+)(\\s*[^)]*\\))`, "i");
      const match = result.match(regex);
      if (match && qn(match[queueIdx]) === oldLower) {
        const parts = result.match(regex);
        if (parts) {
          const before = parts[1];
          const after = parts.slice(3).join("");
          // Replace the right parameter with the new name
          result = result.replace(regex, (m, p1, p2, p3) => {
            const segments = m.split(",");
            if (segments.length === 2 && queueIdx === 1) {
              // ARRIVE(Type, Queue) — replace 2nd param
              return `${segments[0]}, ${newName})`;
            } else if (segments.length === 2 && queueIdx === 2) {
              // Single param like UNBATCH(Queue)
              return `${pattern}(${newName})`;
            }
            return m;
          });
        }
      }
    }
    return result;
  };

  const macroPatterns = {
    arrive: [/^ARRIVE/i, 2],     // ARRIVE(Type, QueueName) — queue is 2nd param
    release: [/^RELEASE/i, 2],   // RELEASE(Server, QueueName) — queue is 2nd param
    unbatch: [/^UNBATCH/i, 1],   // UNBATCH(QueueName) — queue is 1st param
    assign: [/^ASSIGN/i, 1],     // ASSIGN(QueueName, Server) — queue is 1st param (when it's a queue name)
    batch: [/^BATCH/i, 1],       // BATCH(QueueName, N) — queue is 1st param
  };

  const updated = { ...model };

  // 1. Update B-event effects (ARRIVE, RELEASE, UNBATCH)
  updated.bEvents = (model.bEvents || []).map(ev => {
    const effects = Array.isArray(ev.effect) ? ev.effect : (ev.effect ? [ev.effect] : []);
    const newEffects = effects.map(eff => {
      if (typeof eff !== "string") return eff;
      // ARRIVE(Type, OldQueue) → ARRIVE(Type, NewQueue)
      let r = eff.replace(
        /^(ARRIVE\s*\()([^,]+)\s*,\s*([^)]+)(\))/i,
        (m, p1, p2, p3, p4) => qn(p3.trim()) === oldLower ? `${p1}${p2}, ${newName}${p4}` : m
      );
      // RELEASE(Server, OldQueue) → RELEASE(Server, NewQueue)
      r = r.replace(
        /^(RELEASE\s*\()([^,]+)\s*,\s*([^)]+)(\))/i,
        (m, p1, p2, p3, p4) => qn(p3.trim()) === oldLower ? `${p1}${p2}, ${newName}${p4}` : m
      );
      // UNBATCH(OldQueue) → UNBATCH(NewQueue)
      r = r.replace(
        /^(UNBATCH\s*\()([^)]+)(\))/i,
        (m, p1, p2, p3) => qn(p2.trim()) === oldLower ? `${p1}${newName}${p3}` : m
      );
      return r;
    });
    // 2. Update routing configs
    const routing = (ev.routing || []).map(r => ({
      ...r,
      queueName: qn(r.queueName) === oldLower ? newName : r.queueName,
    }));
    const probRouting = (ev.probabilisticRouting || []).map(r => ({
      ...r,
      queueName: qn(r.queueName) === oldLower ? newName : r.queueName,
    }));
    return {
      ...ev,
      effect: newEffects.length === 1 ? newEffects[0] : newEffects,
      routing: routing.length ? routing : ev.routing,
      probabilisticRouting: probRouting.length ? probRouting : ev.probabilisticRouting,
      defaultQueueName: qn(ev.defaultQueueName) === oldLower ? newName : ev.defaultQueueName,
    };
  });

  // 3. Update C-event effects (ASSIGN, BATCH)
  updated.cEvents = (model.cEvents || []).map(ev => {
    const eff = ev.effect || "";
    let newEff = eff;
    // ASSIGN(OldQueue, Server) → ASSIGN(NewQueue, Server)
    newEff = newEff.replace(
      /^(ASSIGN\s*\()([^,]+)\s*,\s*([^)]+)(\))/i,
      (m, p1, p2, p3, p4) => {
        // Only replace if first param looks like a queue name (not an entity type)
        // We can't know for sure, so check if it matches a queue name directly
        return qn(p2.trim()) === oldLower ? `${p1}${newName}, ${p3}${p4}` : m;
      }
    );
    // BATCH(OldQueue, N) → BATCH(NewQueue, N)
    newEff = newEff.replace(
      /^(BATCH\s*\()([^,]+)\s*,\s*([^)]+)(\))/i,
      (m, p1, p2, p3, p4) => qn(p2.trim()) === oldLower ? `${p1}${newName}, ${p3}${p4}` : m
    );
    return { ...ev, effect: newEff };
  });

  // 4. Update queue overflow destinations
  updated.queues = (model.queues || []).map(q => ({
    ...q,
    overflowDestination: qn(q.overflowDestination) === oldLower ? newName : q.overflowDestination,
  }));

  return updated;
}
