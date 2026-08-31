// ui/execute/activityLiveData.js — shared live-data derivation for Execute "activity" nodes
// Used by both ExecuteCanvas.jsx (canvas node rendering) and NodeDetailSidebar.jsx (detail panel)
// so multi-resource (COSEIZE) activities are tracked identically in both places.

import { effectText } from "../../model/macroParser.js";

// Extract all server types a c-event's effect seizes.
// ASSIGN(Queue, ServerType) -> [ServerType]
// ASSIGN(Queue, ANY, "Skill") -> ["ANY"] — resolved to the real pool by buildServerTypeIndex
// COSEIZE(Queue, ServerType1, ServerType2, ...) -> [ServerType1, ServerType2, ...] (variadic)
// PREEMPT(ServerType[, Criterion]) / FAIL(ServerType[, N]) / FINISH(ServerType[, Criterion]) /
// REPAIR(ServerType[, N]) -> [ServerType] — these target a resource without ever ASSIGNing/
// COSEIZEing it, so without this an activity built purely from one of them (e.g. a "preempt
// repair for a higher-priority customer" C-event) fell through to the no-serverTypes branch
// in deriveActivityLiveData below, which shows the total server count across every resource
// type in the whole model — a meaningless number, mislabeled exactly like a real per-resource
// pool card.
export function extractServerTypes(effect) {
  const text = effectText(effect);
  if (!text) return [];
  // Only require the 2nd argument to be followed by a comma or the closing
  // paren — not the closing paren directly — so this still matches when
  // ASSIGN carries further trailing arguments: a skill literal/Entity.attr
  // (ASSIGN(Queue, ANY, "Skill")) and/or a container-claim quantity
  // (ASSIGN(Queue, ServerType, Container:N)). The old regex required the 2nd
  // arg to be immediately followed by ")", so any 3+-argument ASSIGN failed
  // to match at all and fell through to the no-serverTypes fallback below
  // (the whole model's total server count, mislabeled as this activity's pool).
  const assignMatch = text.match(/ASSIGN\s*\(\s*[^,)]+,\s*([^,)]+)\s*(?:,[^)]*)?\)/i);
  if (assignMatch) return [assignMatch[1].trim()];
  const targetedMatch = text.match(/\b(?:PREEMPT|FAIL|FINISH|REPAIR)\s*\(\s*([^,)]+)/i);
  if (targetedMatch) return [targetedMatch[1].trim()];
  const coseizeMatch = text.match(/COSEIZE\s*\(([^)]+)\)/i);
  if (coseizeMatch) {
    const args = coseizeMatch[1].split(",").map(s => s.trim()).filter(Boolean);
    // Strip the optional trailing quantity suffix ("Nurse:2", Sprint 95) and
    // the optional per-type skill filter (e.g. "Surgeon[Surgery]" -> "Surgeon")
    // the same way the engine's own COSEIZE handler does, so the plain type name
    // matches real entity.type values instead of comparing against a bracketed/
    // quantified string. Live stats are computed against the real server-entity
    // fleet per type (see deriveTypeStats below), so a quantity seize needs no
    // further change here — just a clean type name to look up.
    return args.slice(1).map(arg => {
      const noQty = arg.replace(/:\s*\d+$/, "").trim();
      const bracketMatch = noQty.match(/^([^[]+)\[([^\]]+)\]$/);
      return bracketMatch ? bracketMatch[1].trim() : noQty;
    });
  }
  return [];
}

// Extract the skill literal from a cross-type ASSIGN(Queue, ANY, "Skill") effect, if any.
export function extractAssignAnySkill(effect) {
  const text = effectText(effect);
  const m = text.match(/ASSIGN\s*\(\s*[^,)]+,\s*ANY\s*,\s*"([^"]+)"\s*\)/i);
  return m ? m[1].trim() : null;
}

// Build c-event id -> { serverTypes, capacities, ceventName } for activity node enrichment.
// capacity per type comes from model.entityTypes[role=server].count (defaults to 1).
export function buildServerTypeIndex(cEvents, entityTypes) {
  const index = new Map();
  for (const ce of cEvents || []) {
    let serverTypes = extractServerTypes(ce.effect);
    if (!serverTypes.length) continue;
    // Cross-type pooling: ASSIGN(Queue, ANY, "Skill") has no single real server
    // type — expand to every server type carrying the skill so live stats
    // aggregate across the actual pool instead of a literal "ANY" that matches
    // no real entities.
    if (serverTypes.length === 1 && serverTypes[0].toUpperCase() === "ANY") {
      const skill = extractAssignAnySkill(ce.effect);
      const pool = (entityTypes || [])
        .filter(et => et.role === "server" && skill && (
          (Array.isArray(et.skills) && et.skills.includes(skill)) ||
          (et.skillProfiles || []).some(p => (p.skills || []).includes(skill))
        ))
        .map(et => et.name);
      if (pool.length) serverTypes = pool;
    }
    const capacities = serverTypes.map(serverType => {
      const et = (entityTypes || []).find(
        e => e.role === "server" && e.name?.trim().toLowerCase() === serverType.trim().toLowerCase()
      );
      return parseInt(et?.count ?? "1", 10) || 1;
    });
    // Scheduled follow-on B-event id(s) — used to give this specific activity
    // its own completion signal (see completionSignal below) instead of the
    // model-wide snap.served total.
    const scheduledEventIds = (ce.cSchedules || []).map(cs => cs.eventId).filter(Boolean);
    index.set(ce.id, { serverTypes, capacities, ceventName: ce.name, scheduledEventIds });
  }
  return index;
}

// Sum of eventCounts fire counts for the B-event(s) a c-event schedules —
// strictly increases only when THIS activity's own follow-on event fires,
// unlike snap.served (a model-wide total shared by every activity node).
function completionSignalFor(scheduledEventIds, snap) {
  if (!scheduledEventIds?.length) return 0;
  return scheduledEventIds.reduce((sum, id) => sum + (snap.eventCounts?.[id] || 0), 0);
}

// Compute live busy/idle/failed/capacity stats for a single server type against the current snapshot.
// refId is the c-event this is being computed for (scopes activityBusyCount/
// serverDetails' ceventName match); pass null for a standalone, not-c-event-
// scoped view of a resource type (e.g. a canvas Resource node covering every
// activity that draws from this pool) — activityBusyCount is then always 0
// (no c-event to match against) and can simply be ignored by the caller.
export function deriveTypeStats(serverType, snap, refId, model) {
  const entities = snap.entities || [];
  const servers = entities.filter(e => e.role === "server");
  const relevant = servers.filter(e => e.type.trim().toLowerCase() === serverType.trim().toLowerCase());
  const busyCount = relevant.filter(e => e.status === "busy" && !e._suspended).length;
  const idleCount = relevant.filter(e => e.status === "idle" && !e._suspended).length;
  const failedCount = relevant.filter(e => e.status === "failed").length;
  const suspendedCount = relevant.filter(e => e._suspended).length;
  const actualCapacity = relevant.length;
  const customers = entities.filter(e => e.role !== "server");
  const cEvent = (model?.cEvents || []).find(ce => ce.id === refId);
  const cEventName = cEvent?.name ?? null;
  const activityBusyCount = relevant.filter(e => {
    if (e.status !== "busy") return false;
    const cust = e.currentCustId != null ? customers.find(c => c.id === e.currentCustId) : null;
    return cust?.ceventName === cEventName;
  }).length;
  const serverDetails = relevant.map(srv => {
    const cust = srv.currentCustId != null
      ? customers.find(c => c.id === srv.currentCustId)
      : null;
    return {
      id: srv.id,
      status: srv.status,
      suspended: !!srv._suspended,
      busyTime: srv._busyTime ?? 0,
      starvationTime: srv._starvationTime ?? 0,
      downtime: srv._downtime ?? 0,
      scheduledDuration: srv._scheduledDuration ?? null,
      serviceStart: srv._busyStart ?? null,
      customerId: srv.currentCustId ?? null,
      customerType: cust?.type ?? null,
      customerEntityId: cust?.attrs?.entityId ?? null,
      customerArrivalTime: cust?.arrivalTime ?? null,
      ceventName: cust?.ceventName ?? null,
      currentSkill: srv._currentSkill ?? null,
    };
  });
  const skillNameCount = {};
  for (const srv of relevant) {
    const sk = srv._currentSkill;
    if (sk) {
      if (!skillNameCount[sk]) skillNameCount[sk] = { busy: 0, idle: 0, total: 0 };
      skillNameCount[sk].total++;
      if (srv.status === "busy") skillNameCount[sk].busy++;
      else if (srv.status === "idle") skillNameCount[sk].idle++;
    }
  }
  const skillBreakdown = Object.keys(skillNameCount).length ? Object.fromEntries(
    Object.entries(skillNameCount).map(([skill, counts]) => [
      skill, {
        busyCount: counts.busy,
        idleCount: counts.idle,
        totalCount: counts.total,
        utilisation: counts.total > 0 ? (counts.busy / counts.total) * 100 : 0,
      }
    ])
  ) : undefined;

  return {
    serverTypeName: serverType,
    capacity: actualCapacity,
    busyCount,
    activityBusyCount,
    idleCount,
    failedCount,
    suspendedCount,
    utilisation: actualCapacity > 0 ? (busyCount / actualCapacity) * 100 : 0,
    servers: serverDetails,
    skillBreakdown,
  };
}

// Derive live data for an "activity" node from the current snapshot.
// Returns null if there's no snapshot or no indexed server types for this c-event.
// Top-level fields mirror the first server type (preserves single-resource behavior/shape
// for ASSIGN-based activities); `perType` carries the full breakdown for multi-resource
// (COSEIZE) activities so callers can render one row per resource type.
export function deriveActivityLiveData(snap, refId, serverTypeIndex, model) {
  if (!snap) return null;
  const meta = serverTypeIndex.get(refId);
  const serverTypes = meta?.serverTypes ?? [];

  if (!serverTypes.length) {
    // Not indexed (e.g. no ASSIGN/COSEIZE server type resolved) — fall back to
    // looking the c-event up directly by id for its own scheduled event(s),
    // same as the indexed path below, rather than the model-wide snap.served.
    const ce = (model?.cEvents || []).find(c => c.id === refId);
    const scheduledEventIds = (ce?.cSchedules || []).map(cs => cs.eventId).filter(Boolean);
    return {
      serverTypeName: null,
      capacity: (snap.entities || []).filter(e => e.role === "server").length,
      busyCount: 0,
      activityBusyCount: 0,
      idleCount: 0,
      failedCount: 0,
      suspendedCount: 0,
      utilisation: 0,
      completionSignal: completionSignalFor(scheduledEventIds, snap),
      // The c-event's OWN fire count (snap.eventCounts[refId] — already live,
      // monotonically increasing per engine/phases.js:538) — used to flash the
      // node the instant THIS activity starts serving someone, complementing
      // completionSignal's "just finished" flash.
      startSignal: snap.eventCounts?.[refId] || 0,
      servers: [],
      perType: [],
      clock: snap.clock,
    };
  }

  const perType = serverTypes.map(serverType =>
    deriveTypeStats(serverType, snap, refId, model)
  );
  const first = perType[0];

  return {
    ...first,
    completionSignal: completionSignalFor(meta?.scheduledEventIds, snap),
    startSignal: snap.eventCounts?.[refId] || 0,
    clock: snap.clock,
    perType,
  };
}
