// src/simulation/modelChecker.js — F69.2: Pre-run structural model checker
// Pure function — no side effects, no API calls.

/**
 * @typedef {{ severity: "error"|"warning"|"info", code: string, message: string, nodeId: string|null, nodeName: string|null }} Issue
 */

const SEV_ORDER = { error: 0, warning: 1, info: 2 };

function makeIssue(severity, code, message, nodeId, nodeName) {
  return { severity, code, message, nodeId: nodeId ?? null, nodeName: nodeName ?? null };
}

// ── Helpers: extract entity info from both old macro format and current effect strings ─

function effectString(bEvent) {
  return Array.isArray(bEvent.effect)
    ? bEvent.effect.filter(Boolean).join(';')
    : (bEvent.effect || '');
}

function buildArrivedTypes(bEvents) {
  const types = new Set();
  for (const bEvent of bEvents) {
    for (const schedule of bEvent.schedules || []) {
      if (schedule.macro === "ARRIVE" && schedule.entityTypeName) {
        types.add(schedule.entityTypeName.trim().toLowerCase());
      }
    }
    for (const m of effectString(bEvent).matchAll(/ARRIVE\s*\(\s*([^,)]+)/gi)) {
      types.add(m[1].trim().toLowerCase());
    }
  }
  return types;
}

function buildFedQueues(bEvents) {
  const queues = new Set();
  for (const bEvent of bEvents) {
    for (const schedule of bEvent.schedules || []) {
      if (schedule.macro === "ARRIVE" && schedule.queueName) {
        queues.add(schedule.queueName.trim().toLowerCase());
      }
    }
    for (const m of effectString(bEvent).matchAll(/ARRIVE\s*\([^,)]+,\s*([^)]+)/gi)) {
      queues.add(m[1].trim().toLowerCase());
    }
  }
  return queues;
}

function hasAnyExitEffect(bEvents) {
  return bEvents.some(b => /\b(COMPLETE|RENEGE)\s*\(/i.test(effectString(b)));
}

/**
 * CHK-001: Entity type has no arrival B-event that creates it.
 */
function chk001(model) {
  const issues = [];
  const entityTypes = model.entityTypes || [];
  const bEvents = model.bEvents || [];

  const arrivedTypes = buildArrivedTypes(bEvents);

  for (const et of entityTypes) {
    if (et.role === "server") continue;
    const name = (et.name || "").trim();
    if (!arrivedTypes.has(name.toLowerCase())) {
      issues.push(makeIssue(
        "error", "CHK-001",
        `Entity type '${name}' is never created — no arrival event generates it.`,
        et.id || null, name
      ));
    }
  }
  return issues;
}

/**
 * CHK-002: Entity type created but never destroyed (no sink/departure event).
 */
function chk002(model) {
  const issues = [];
  const entityTypes = model.entityTypes || [];
  const bEvents = model.bEvents || [];
  const cEvents = model.cEvents || [];

  const arrivedTypes = buildArrivedTypes(bEvents);

  const destroyedTypes = new Set();
  for (const bEvent of bEvents) {
    for (const schedule of bEvent.schedules || []) {
      if (schedule.macro === "COMPLETE" && schedule.entityTypeName) {
        destroyedTypes.add(schedule.entityTypeName.trim().toLowerCase());
      }
    }
  }
  for (const cEvent of cEvents) {
    for (const schedule of cEvent.cSchedules || []) {
      if (schedule.macro === "SEIZE" && schedule.entityTypeName) {
        destroyedTypes.add(schedule.entityTypeName.trim().toLowerCase());
      }
    }
  }
  // Current format: COMPLETE() / RENEGE(ctx) exit any customer entity
  if (hasAnyExitEffect(bEvents)) {
    for (const et of entityTypes) {
      if (et.role !== "server") destroyedTypes.add((et.name || '').trim().toLowerCase());
    }
  }

  for (const et of entityTypes) {
    if (et.role === "server") continue;
    const name = (et.name || "").trim();
    if (arrivedTypes.has(name.toLowerCase()) && !destroyedTypes.has(name.toLowerCase())) {
      issues.push(makeIssue(
        "error", "CHK-002",
        `Entity type '${name}' has no exit — entities will accumulate indefinitely.`,
        et.id || null, name
      ));
    }
  }
  return issues;
}

/**
 * CHK-003: C-event condition references undefined queue.
 */
function chk003(model) {
  const issues = [];
  const queueNames = new Set((model.queues || []).map(q => (q.name || "").trim().toLowerCase()));
  const queueIds = new Set((model.queues || []).map(q => (q.id || "").trim().toLowerCase()));

  for (const cEvent of model.cEvents || []) {
    const name = cEvent.name || cEvent.id || "?";
    for (const schedule of cEvent.cSchedules || []) {
      const queueName = (schedule.queueName || "").trim();
      if (queueName && !queueNames.has(queueName.toLowerCase()) && !queueIds.has(queueName.toLowerCase())) {
        issues.push(makeIssue(
          "error", "CHK-003",
          `C-event '${name}' references queue '${queueName}' which does not exist.`,
          cEvent.id || null, name
        ));
      }
    }

    const referencedQueues = extractQueueRefsFromCondition(cEvent.condition);
    for (const qRef of referencedQueues) {
      if (!queueNames.has(qRef.toLowerCase()) && !queueIds.has(qRef.toLowerCase())) {
        issues.push(makeIssue(
          "error", "CHK-003",
          `C-event '${name}' references queue '${qRef}' which does not exist.`,
          cEvent.id || null, name
        ));
      }
    }
  }
  return issues;
}

/**
 * CHK-004: C-event condition references undefined server.
 */
function chk004(model) {
  const issues = [];
  const serverNames = new Set(
    (model.entityTypes || [])
      .filter(et => et.role === "server")
      .map(et => (et.name || "").trim().toLowerCase())
  );

  for (const cEvent of model.cEvents || []) {
    const name = cEvent.name || cEvent.id || "?";
    for (const schedule of cEvent.cSchedules || []) {
      const serverTypeName = (schedule.serverTypeName || "").trim();
      if (serverTypeName && !serverNames.has(serverTypeName.toLowerCase())) {
        issues.push(makeIssue(
          "error", "CHK-004",
          `C-event '${name}' references server '${serverTypeName}' which does not exist.`,
          cEvent.id || null, name
        ));
      }
    }
  }
  return issues;
}

/**
 * CHK-005: Follow-on chain has no terminal event (cycle detection).
 */
function chk005(model) {
  const issues = [];
  const bEvents = model.bEvents || [];
  const idToEvent = {};
  for (const bEvent of bEvents) {
    if (bEvent.id) idToEvent[bEvent.id] = bEvent;
  }

  for (const bEvent of bEvents) {
    const followOnId = getFollowOnId(bEvent);
    if (!followOnId) continue;

    const visited = new Set([bEvent.id]);
    let current = followOnId;
    let hasCycle = false;

    while (current) {
      if (visited.has(current)) { hasCycle = true; break; }
      visited.add(current);
      const next = idToEvent[current];
      if (!next) break;
      current = getFollowOnId(next);
    }

    if (hasCycle) {
      const name = bEvent.name || bEvent.id || "?";
      issues.push(makeIssue(
        "warning", "CHK-005",
        `Event '${name}' is part of a follow-on chain with no terminal event — this may cause infinite scheduling.`,
        bEvent.id || null, name
      ));
    }
  }
  return issues;
}

/**
 * CHK-006: Queue referenced in C-event condition but no A-event feeds it.
 */
function chk006(model) {
  const issues = [];
  const bEvents = model.bEvents || [];

  const fedQueues = buildFedQueues(bEvents);

  for (const cEvent of model.cEvents || []) {
    const name = cEvent.name || cEvent.id || "?";
    for (const schedule of cEvent.cSchedules || []) {
      const queueName = (schedule.queueName || "").trim();
      if (queueName && !fedQueues.has(queueName.toLowerCase())) {
        issues.push(makeIssue(
          "warning", "CHK-006",
          `Queue '${queueName}' is checked in C-event '${name}' but nothing routes entities into it.`,
          cEvent.id || null, name
        ));
      }
    }
  }
  return issues;
}

/**
 * CHK-007: Model has entity types but no events defined.
 */
function chk007(model) {
  const issues = [];
  const entityTypes = model.entityTypes || [];
  const bEvents = model.bEvents || [];
  const cEvents = model.cEvents || [];

  if (entityTypes.length > 0 && bEvents.length === 0 && cEvents.length === 0) {
    issues.push(makeIssue(
      "info", "CHK-007",
      "No events are defined. Add arrival, state-change, and departure events to make the model runnable.",
      null, null
    ));
  }
  return issues;
}

/**
 * CHK-008: Server defined but never used in any C-event.
 */
function chk008(model) {
  const issues = [];
  const cEvents = model.cEvents || [];

  const usedServers = new Set();
  for (const cEvent of cEvents) {
    for (const schedule of cEvent.cSchedules || []) {
      if (schedule.serverTypeName) {
        usedServers.add(schedule.serverTypeName.trim().toLowerCase());
      }
    }
    // Old format: ASSIGN(queue, serverType) in effect string
    for (const m of effectString(cEvent).matchAll(/ASSIGN\s*\([^,)]+,\s*([^)]+)\)/gi)) {
      usedServers.add(m[1].trim().toLowerCase());
    }
  }

  for (const et of model.entityTypes || []) {
    if (et.role !== "server") continue;
    const name = (et.name || "").trim();
    if (!usedServers.has(name.toLowerCase())) {
      issues.push(makeIssue(
        "warning", "CHK-008",
        `Server '${name}' is never used in any C-event — it will always show 0% utilisation.`,
        et.id || null, name
      ));
    }
  }
  return issues;
}

/**
 * CHK-009: Schedule dist entry has no planned times/rows — will never re-fire.
 */
function chk009(model) {
  const issues = [];
  for (const bEvent of model.bEvents || []) {
    const name = bEvent.name || bEvent.id || "?";
    for (const sched of bEvent.schedules || []) {
      const dist = (sched.dist || "").trim().toLowerCase();
      if (dist !== "schedule") continue;
      const dp = sched.distParams || {};
      const hasRows = Array.isArray(dp.rows) && dp.rows.length > 0;
      const hasTimes = Array.isArray(dp.times) && dp.times.length > 0;
      if (!hasRows && !hasTimes) {
        issues.push(makeIssue(
          "error", "CHK-009",
          `B-event '${name}' has a Schedule distribution with no rows or times — no arrivals will be generated.`,
          bEvent.id || null, name
        ));
      }
    }
  }
  return issues;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function extractQueueRefsFromCondition(condition) {
  if (!condition) return [];
  const refs = [];
  const clauses = condition.clauses || [];
  for (const clause of clauses) {
    const variable = clause.variable || "";
    const match = variable.match(/^Queue\.(.+?)\.length$/i);
    if (match) refs.push(match[1]);
  }
  return refs;
}

function getFollowOnId(bEvent) {
  for (const schedule of bEvent.schedules || []) {
    if (schedule.followOnEventId) return schedule.followOnEventId;
    if (schedule.macro === "ARRIVE" && schedule.nextEventId) return schedule.nextEventId;
  }
  return null;
}

/**
 * CHK-010: B-event schedule entry has no eventId — will self-reschedule (backward compat),
 * but should be set explicitly to avoid ambiguity.
 */
function chk010(model) {
  const issues = [];
  for (const bEvent of model.bEvents || []) {
    const name = bEvent.name || bEvent.id || "?";
    for (const sched of bEvent.schedules || []) {
      if (!sched.eventId && !sched.isRenege) {
        issues.push(makeIssue(
          "warning", "CHK-010",
          `B-event '${name}' has a schedule entry with no eventId — set eventId to '${bEvent.id}' to self-reschedule explicitly.`,
          bEvent.id || null, name
        ));
      }
    }
  }
  return issues;
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Run all structural checks on a model definition.
 * Returns issues sorted: errors first, then warnings, then info.
 * @param {object} model
 * @returns {Issue[]}
 */
export function checkModel(model) {
  if (!model) return [];

  const all = [
    ...chk001(model),
    ...chk002(model),
    ...chk003(model),
    ...chk004(model),
    ...chk005(model),
    ...chk006(model),
    ...chk007(model),
    ...chk008(model),
    ...chk009(model),
    ...chk010(model),
  ];

  return all.sort((a, b) => (SEV_ORDER[a.severity] ?? 99) - (SEV_ORDER[b.severity] ?? 99));
}
