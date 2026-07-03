// ui/execute/activityLiveData.js — shared live-data derivation for Execute "activity" nodes
// Used by both ExecuteCanvas.jsx (canvas node rendering) and NodeDetailSidebar.jsx (detail panel)
// so multi-resource (COSEIZE) activities are tracked identically in both places.

// Render an effect (string | array-of-strings/objects | object) into a flat macro-call text blob.
function effectToText(effect) {
  if (!effect) return "";
  if (typeof effect === "string") return effect;
  if (Array.isArray(effect)) {
    return effect.map(e => {
      if (typeof e === "string") return e;
      if (e && typeof e === "object") {
        const macro = String(e.macro || e.type || "").toUpperCase();
        const args = Array.isArray(e.args) ? e.args.join(",") : "";
        return `${macro}(${args})`;
      }
      return "";
    }).join(";");
  }
  if (typeof effect === "object") {
    const macro = String(effect.macro || effect.type || "").toUpperCase();
    const args = Array.isArray(effect.args) ? effect.args.join(",") : "";
    return `${macro}(${args})`;
  }
  return "";
}

// Extract all server types a c-event's effect seizes.
// ASSIGN(Queue, ServerType) -> [ServerType]
// ASSIGN(Queue, ANY, "Skill") -> ["ANY"] — resolved to the real pool by buildServerTypeIndex
// COSEIZE(Queue, ServerType1, ServerType2, ...) -> [ServerType1, ServerType2, ...] (variadic)
export function extractServerTypes(effect) {
  const text = effectToText(effect);
  if (!text) return [];
  const assignMatch = text.match(/ASSIGN\s*\(\s*[^,)]+,\s*([^),]+)\)/i);
  if (assignMatch) return [assignMatch[1].trim()];
  const coseizeMatch = text.match(/COSEIZE\s*\(([^)]+)\)/i);
  if (coseizeMatch) {
    const args = coseizeMatch[1].split(",").map(s => s.trim()).filter(Boolean);
    return args.slice(1);
  }
  return [];
}

// Extract the skill literal from a cross-type ASSIGN(Queue, ANY, "Skill") effect, if any.
export function extractAssignAnySkill(effect) {
  const text = effectToText(effect);
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
    index.set(ce.id, { serverTypes, capacities, ceventName: ce.name });
  }
  return index;
}

// Compute live busy/idle/failed/capacity stats for a single server type against the current snapshot.
function deriveTypeStats(serverType, snap, refId, model) {
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
    return {
      serverTypeName: null,
      capacity: (snap.entities || []).filter(e => e.role === "server").length,
      busyCount: 0,
      activityBusyCount: 0,
      idleCount: 0,
      failedCount: 0,
      suspendedCount: 0,
      utilisation: 0,
      completionSignal: snap.served,
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
    completionSignal: snap.served,
    clock: snap.clock,
    perType,
  };
}
