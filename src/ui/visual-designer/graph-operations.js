import { deriveGraphFromModel, graphLayoutFromDerivedGraph, VISUAL_NODE_TYPES } from "./graph.js";

function clean(value = "") {
  return String(value || "").trim();
}

function makeId(prefix, existingIds) {
  let i = 1;
  let id = `${prefix}-${i}`;
  while (existingIds.has(id)) {
    i += 1;
    id = `${prefix}-${i}`;
  }
  return id;
}

function firstCustomerType(model) {
  return (model.entityTypes || []).find(type => type.role === "customer")?.name || "Customer";
}

function firstServerType(model) {
  return (model.entityTypes || []).find(type => type.role === "server")?.name || "Server";
}

function ensureEntityTypes(model) {
  const entityTypes = [...(model.entityTypes || [])];
  const ids = new Set(entityTypes.map(type => type.id || type.name));
  let changed = false;
  if (!entityTypes.some(type => type.role === "customer")) {
    entityTypes.push({ id: makeId("customer", ids), name: "Customer", role: "customer", attrDefs: [] });
    ids.add(entityTypes[entityTypes.length - 1].id);
    changed = true;
  }
  if (!entityTypes.some(type => type.role === "server")) {
    entityTypes.push({ id: makeId("server", ids), name: "Server", role: "server", count: 1, attrDefs: [] });
    changed = true;
  }
  return changed ? { ...model, entityTypes } : model;
}

function updateByRef(items, refId, updater) {
  return (items || []).map(item => (item.id === refId ? updater(item) : item));
}

function replaceQueueName(text = "", oldName, newName) {
  if (!oldName || !newName) return text;
  return String(text || "")
    .replace(new RegExp(`queue\\(${oldName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\)`, "gi"), `queue(${newName})`)
    .replace(new RegExp(`ARRIVE\\(([^,)]+),\\s*${oldName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\)`, "gi"), `ARRIVE($1, ${newName})`)
    .replace(new RegExp(`ASSIGN\\(${oldName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")},`, "gi"), `ASSIGN(${newName},`)
    .replace(new RegExp(`RELEASE\\(([^,)]+),\\s*${oldName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\)`, "gi"), `RELEASE($1, ${newName})`);
}

function replaceServerName(text = "", oldName, newName) {
  if (!oldName || !newName) return text;
  const esc = oldName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return String(text || "")
    .replace(new RegExp(`idle\\(${esc}\\)\\.count`, "gi"), `idle(${newName}).count`)
    .replace(new RegExp(`busy\\(${esc}\\)\\.count`, "gi"), `busy(${newName}).count`)
    .replace(new RegExp(`ASSIGN\\(([^,)]+),\\s*${esc}\\)`, "gi"), `ASSIGN($1, ${newName})`);
}

function findNode(graph, id) {
  return (graph.nodes || []).find(node => node.id === id);
}

function wouldCreateCycle(edges, from, to) {
  const out = new Map();
  [...(edges || []), { from, to }].forEach(edge => {
    out.set(edge.from, [...(out.get(edge.from) || []), edge.to]);
  });
  const seen = new Set();
  const stack = [to];
  while (stack.length) {
    const current = stack.pop();
    if (current === from) return true;
    if (seen.has(current)) continue;
    seen.add(current);
    (out.get(current) || []).forEach(next => stack.push(next));
  }
  return false;
}

export function validateVisualConnection(graph, from, to) {
  const source = findNode(graph, from);
  const target = findNode(graph, to);
  if (!source || !target) return { ok: false, message: "Select two existing nodes." };
  if (source.id === target.id) return { ok: false, message: "A node cannot connect to itself." };
  if (source.type === VISUAL_NODE_TYPES.SINK) return { ok: false, message: "Sink nodes are terminal." };
  if (target.type === VISUAL_NODE_TYPES.SOURCE) return { ok: false, message: "Source nodes cannot have incoming connections." };
  if (source.type === VISUAL_NODE_TYPES.SOURCE && target.type !== VISUAL_NODE_TYPES.QUEUE) {
    return { ok: false, message: "Sources can only connect to queues." };
  }
  if (source.type === VISUAL_NODE_TYPES.QUEUE && target.type !== VISUAL_NODE_TYPES.ACTIVITY) {
    return { ok: false, message: "Queues can only connect to activities." };
  }
  if (source.type === VISUAL_NODE_TYPES.ACTIVITY && ![VISUAL_NODE_TYPES.QUEUE, VISUAL_NODE_TYPES.SINK].includes(target.type)) {
    return { ok: false, message: "Activities can only route to queues or sinks." };
  }
  if (source.type === VISUAL_NODE_TYPES.SOURCE && target.type === VISUAL_NODE_TYPES.SINK) {
    return { ok: false, message: "Sources cannot bypass processing and connect directly to sinks." };
  }
  if (wouldCreateCycle(graph.edges || [], from, to)) return { ok: false, message: "That connection would create a cycle." };
  return { ok: true, message: "" };
}

export function updateGraphLayout(model, derivedGraph, patch = {}) {
  return {
    ...model,
    graph: graphLayoutFromDerivedGraph({
      ...derivedGraph,
      nodes: (derivedGraph.nodes || []).map(node => {
        const next = patch.nodes?.find(item => item.id === node.id);
        return next ? { ...node, x: next.x, y: next.y } : node;
      }),
      viewport: patch.viewport || derivedGraph.viewport,
    }),
  };
}

export function addVisualNode(model, type, position = null) {
  const withEntities = ensureEntityTypes(model);
  const bEvents = [...(withEntities.bEvents || [])];
  const cEvents = [...(withEntities.cEvents || [])];
  const queues = [...(withEntities.queues || [])];
  const allIds = new Set([...bEvents, ...cEvents, ...queues, ...(withEntities.entityTypes || [])].map(item => item.id || item.name));
  const customer = firstCustomerType(withEntities);
  const server = firstServerType(withEntities);

  if (type === VISUAL_NODE_TYPES.SOURCE) {
    const targetQueue = queues[0]?.name || "";
    const id = makeId("arrival", allIds);
    bEvents.push({
      id,
      name: `Arrival ${bEvents.filter(event => String(event.effect || "").includes("ARRIVE")).length + 1}`,
      scheduledTime: "0",
      effect: targetQueue ? `ARRIVE(${customer}, ${targetQueue})` : `ARRIVE(${customer})`,
      schedules: [{ eventId: id, dist: "Exponential", distParams: { mean: "5" } }],
    });
  }

  if (type === VISUAL_NODE_TYPES.QUEUE) {
    const id = makeId("queue", allIds);
    queues.push({
      id,
      name: `Queue ${queues.length + 1}`,
      customerType: customer,
      discipline: "FIFO",
    });
  }

  if (type === VISUAL_NODE_TYPES.ACTIVITY) {
    const completionId = makeId("service-complete", allIds);
    const cEventId = makeId("activity", new Set([...allIds, completionId]));
    const queueName = queues[0]?.name || "";
    bEvents.push({ id: completionId, name: `Service Complete ${cEvents.length + 1}`, scheduledTime: "9999", effect: "COMPLETE()", schedules: [] });
    cEvents.push({
      id: cEventId,
      name: `Activity ${cEvents.length + 1}`,
      priority: cEvents.length + 1,
      condition: queueName ? `queue(${queueName}).length > 0 AND idle(${server}).count > 0` : "",
      effect: queueName ? `ASSIGN(${queueName}, ${server})` : "",
      cSchedules: [{ eventId: completionId, dist: "Fixed", distParams: { value: "1" }, useEntityCtx: true }],
    });
  }

  if (type === VISUAL_NODE_TYPES.SINK) {
    const id = makeId("completion", allIds);
    bEvents.push({ id, name: `Completion ${bEvents.length + 1}`, scheduledTime: "9999", effect: "COMPLETE()", schedules: [] });
  }

  const next = { ...withEntities, bEvents, cEvents, queues };
  const derived = deriveGraphFromModel(next);
  if (!position) return updateGraphLayout(next, derived);
  const newest = [...derived.nodes].reverse().find(node => node.type === type);
  return updateGraphLayout(next, derived, newest ? { nodes: [{ id: newest.id, x: position.x, y: position.y }] } : {});
}

export function validateVisualGraph(graph = {}) {
  const nodes = graph.nodes || [];
  const edges = graph.edges || [];
  const incoming = new Map(nodes.map(node => [node.id, 0]));
  const outgoing = new Map(nodes.map(node => [node.id, 0]));
  edges.forEach(edge => {
    outgoing.set(edge.from, (outgoing.get(edge.from) || 0) + 1);
    incoming.set(edge.to, (incoming.get(edge.to) || 0) + 1);
  });

  const issues = [];
  const push = (severity, nodeId, message) => issues.push({ severity, nodeId, message });
  if (!nodes.some(node => node.type === VISUAL_NODE_TYPES.SOURCE)) {
    push("warning", null, "No Source node is present.");
  }
  if (!nodes.some(node => node.type === VISUAL_NODE_TYPES.SINK)) {
    push("warning", null, "No Sink node is present.");
  }
  nodes.forEach(node => {
    if (node.type === VISUAL_NODE_TYPES.SOURCE && (outgoing.get(node.id) || 0) === 0) {
      push("warning", node.id, `${node.label} is not connected to a queue.`);
    }
    if (node.type === VISUAL_NODE_TYPES.QUEUE && (outgoing.get(node.id) || 0) === 0) {
      push("warning", node.id, `${node.label} has no downstream activity.`);
    }
    if (node.type === VISUAL_NODE_TYPES.ACTIVITY && (incoming.get(node.id) || 0) === 0) {
      push("warning", node.id, `${node.label} has no incoming queue.`);
    }
    if (node.type === VISUAL_NODE_TYPES.ACTIVITY && (outgoing.get(node.id) || 0) === 0) {
      push("warning", node.id, `${node.label} has no completion route.`);
    }
    if (node.type === VISUAL_NODE_TYPES.SINK && (incoming.get(node.id) || 0) === 0) {
      push("warning", node.id, `${node.label} has no incoming activity.`);
    }
  });
  return issues;
}

export function connectVisualNodes(model, graph, from, to) {
  const validation = validateVisualConnection(graph, from, to);
  if (!validation.ok) return { model, validation };
  const source = findNode(graph, from);
  const target = findNode(graph, to);
  const server = firstServerType(model);
  let next = { ...model };

  if (source.type === VISUAL_NODE_TYPES.SOURCE && target.type === VISUAL_NODE_TYPES.QUEUE) {
    const customer = firstCustomerType(next);
    next.bEvents = updateByRef(next.bEvents, source.refId, event => ({
      ...event,
      effect: `ARRIVE(${customer}, ${target.label})`,
    }));
  }

  if (source.type === VISUAL_NODE_TYPES.QUEUE && target.type === VISUAL_NODE_TYPES.ACTIVITY) {
    next.cEvents = updateByRef(next.cEvents, target.refId, event => ({
      ...event,
      condition: `queue(${source.label}).length > 0 AND idle(${server}).count > 0`,
      effect: `ASSIGN(${source.label}, ${server})`,
    }));
  }

  if (source.type === VISUAL_NODE_TYPES.ACTIVITY && target.type === VISUAL_NODE_TYPES.QUEUE) {
    const completionId = `route-${source.refId || "activity"}-${target.refId || "queue"}`;
    const bEvents = [...(next.bEvents || [])];
    const existing = bEvents.find(event => event.id === completionId);
    if (existing) {
      next.bEvents = updateByRef(bEvents, completionId, event => ({ ...event, effect: `RELEASE(${server}, ${target.label})` }));
    } else {
      next.bEvents = [...bEvents, { id: completionId, name: `${source.label} Complete`, scheduledTime: "9999", effect: `RELEASE(${server}, ${target.label})`, schedules: [] }];
    }
    next.cEvents = updateByRef(next.cEvents, source.refId, event => ({
      ...event,
      cSchedules: [{ eventId: completionId, dist: "Fixed", distParams: { value: "1" }, useEntityCtx: true }],
    }));
  }

  if (source.type === VISUAL_NODE_TYPES.ACTIVITY && target.type === VISUAL_NODE_TYPES.SINK) {
    next.cEvents = updateByRef(next.cEvents, source.refId, event => ({
      ...event,
      cSchedules: [{ eventId: target.refId, dist: "Fixed", distParams: { value: "1" }, useEntityCtx: true }],
    }));
  }

  return { model: updateGraphLayout(next, deriveGraphFromModel(next)), validation };
}

function escRe(str) {
  return (str || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Returns the canonical elements that will be deleted or modified when the given node is deleted.
// Each item: { name, elementType, description }
export function findNodeDependents(model, node) {
  const deps = [];
  if (!node || !node.refId) return deps;
  const bEvents = model.bEvents || [];
  const cEvents = model.cEvents || [];
  const queues = model.queues || [];

  if (node.type === VISUAL_NODE_TYPES.SOURCE) {
    cEvents.forEach(ce => {
      if ((ce.cSchedules || []).some(s => s.eventId === node.refId)) {
        deps.push({ name: ce.name || ce.id, elementType: "C-Event", description: "will be deleted" });
      }
    });
  }

  if (node.type === VISUAL_NODE_TYPES.QUEUE) {
    const queue = queues.find(q => q.id === node.refId);
    if (queue && queue.name) {
      const esc = escRe(queue.name);
      const condPat = new RegExp(`queue\\(${esc}\\)`, "i");
      const effPat = new RegExp(`ASSIGN\\(${esc}`, "i");
      const arrivePat = new RegExp(`ARRIVE\\([^,]+,\\s*${esc}\\)`, "i");
      const releasePat = new RegExp(`RELEASE\\([^,]+,\\s*${esc}\\)`, "i");

      const affectedCIds = new Set();
      cEvents.forEach(ce => {
        const cond = typeof ce.condition === "string" ? ce.condition : "";
        const eff = typeof ce.effect === "string" ? ce.effect : "";
        if (condPat.test(cond) || effPat.test(eff)) {
          affectedCIds.add(ce.id);
          deps.push({ name: ce.name || ce.id, elementType: "C-Event", description: "will be deleted" });
        }
      });

      // Transitive: completion B-events exclusively owned by those C-events
      const otherRefs = new Set(
        cEvents
          .filter(ce => !affectedCIds.has(ce.id))
          .flatMap(ce => (ce.cSchedules || []).map(s => s.eventId))
          .filter(Boolean)
      );
      affectedCIds.forEach(cId => {
        const ce = cEvents.find(c => c.id === cId);
        (ce?.cSchedules || []).forEach(s => {
          if (s.eventId && !otherRefs.has(s.eventId)) {
            const be = bEvents.find(b => b.id === s.eventId);
            if (be) deps.push({ name: be.name || be.id, elementType: "B-Event", description: "will be deleted" });
          }
        });
      });

      // Source B-events whose ARRIVE/RELEASE effect references this queue (will be updated, not deleted)
      bEvents.forEach(be => {
        const eff = typeof be.effect === "string" ? be.effect : "";
        if (arrivePat.test(eff) || releasePat.test(eff)) {
          deps.push({ name: be.name || be.id, elementType: "B-Event", description: "arrival or routing reference will be updated" });
        }
      });
    }
  }

  if (node.type === VISUAL_NODE_TYPES.ACTIVITY) {
    const ce = cEvents.find(c => c.id === node.refId);
    if (ce) {
      const otherRefs = new Set(
        cEvents
          .filter(c => c.id !== node.refId)
          .flatMap(c => (c.cSchedules || []).map(s => s.eventId))
          .filter(Boolean)
      );
      (ce.cSchedules || []).forEach(s => {
        if (s.eventId && !otherRefs.has(s.eventId)) {
          const be = bEvents.find(b => b.id === s.eventId);
          if (be) deps.push({ name: be.name || be.id, elementType: "B-Event", description: "will be deleted" });
        }
      });
    }
  }

  if (node.type === VISUAL_NODE_TYPES.SINK) {
    cEvents.forEach(ce => {
      if ((ce.cSchedules || []).some(s => s.eventId === node.refId)) {
        deps.push({ name: ce.name || ce.id, elementType: "C-Event", description: "completion schedule will be removed" });
      }
    });
  }

  return deps;
}

// Removes a visual node from the canonical model, cascading to dependent elements.
// Always call deriveGraphFromModel on the result — never mutate layout metadata first.
// Removes a visual edge from the canonical model by reversing the routing it represents.
// Four edge source types map to distinct canonical mutations — see graph.js edge derivation.
export function deleteVisualEdge(model, graph, edgeId) {
  const edge = (graph.edges || []).find(e => e.id === edgeId);
  if (!edge) return model;
  const fromNode = (graph.nodes || []).find(n => n.id === edge.from);
  const toNode   = (graph.nodes || []).find(n => n.id === edge.to);
  if (!fromNode || !toNode) return model;

  const bEvents = model.bEvents || [];
  const cEvents = model.cEvents || [];
  let next = { ...model };

  // Source → Queue ("arrival"): remove queue target from ARRIVE effect
  if (edge.source === "arrival" && fromNode.type === VISUAL_NODE_TYPES.SOURCE) {
    const esc = escRe(toNode.label || "");
    next.bEvents = bEvents.map(be =>
      be.id !== fromNode.refId ? be : {
        ...be,
        effect: typeof be.effect === "string"
          ? be.effect.replace(new RegExp(`,\\s*${esc}\\s*\\)`, "gi"), ")")
          : be.effect,
      }
    );
  }

  // Queue → Activity ("condition"): clear queue-specific condition and ASSIGN effect
  if (edge.source === "condition" && fromNode.type === VISUAL_NODE_TYPES.QUEUE && toNode.type === VISUAL_NODE_TYPES.ACTIVITY) {
    next.cEvents = cEvents.map(ce =>
      ce.id !== toNode.refId ? ce : { ...ce, condition: "", effect: "" }
    );
  }

  // Activity → Queue ("routing"): remove cSchedule referencing the RELEASE bEvent for this queue;
  // also remove the RELEASE bEvent itself if it is not shared with any other C-event.
  if (edge.source === "routing" && fromNode.type === VISUAL_NODE_TYPES.ACTIVITY && toNode.type === VISUAL_NODE_TYPES.QUEUE) {
    const cEvent = cEvents.find(ce => ce.id === fromNode.refId);
    if (cEvent) {
      const esc = escRe(toNode.label || "");
      const releasePat = new RegExp(`RELEASE\\([^,]+,\\s*${esc}\\)`, "i");
      const schedToRemove = (cEvent.cSchedules || []).find(s => {
        const be = bEvents.find(b => b.id === s.eventId);
        return be && releasePat.test(typeof be.effect === "string" ? be.effect : "");
      });
      if (schedToRemove) {
        const otherRefs = new Set(
          cEvents.filter(ce => ce.id !== cEvent.id).flatMap(ce => (ce.cSchedules || []).map(s => s.eventId))
        );
        next.cEvents = cEvents.map(ce =>
          ce.id !== cEvent.id ? ce : {
            ...ce,
            cSchedules: (ce.cSchedules || []).filter(s => s.eventId !== schedToRemove.eventId),
          }
        );
        if (!otherRefs.has(schedToRemove.eventId)) {
          next.bEvents = bEvents.filter(be => be.id !== schedToRemove.eventId);
        }
      }
    }
  }

  // Activity → Sink ("terminal"): remove cSchedule entry referencing the sink bEvent
  if (edge.source === "terminal" && fromNode.type === VISUAL_NODE_TYPES.ACTIVITY && toNode.type === VISUAL_NODE_TYPES.SINK) {
    const cEvent = cEvents.find(ce => ce.id === fromNode.refId);
    if (cEvent) {
      next.cEvents = cEvents.map(ce =>
        ce.id !== cEvent.id ? ce : {
          ...ce,
          cSchedules: (ce.cSchedules || []).filter(s => s.eventId !== toNode.refId),
        }
      );
    }
  }

  return updateGraphLayout(next, deriveGraphFromModel(next));
}

export function deleteVisualNode(model, node) {
  if (!node || !node.refId) return model;
  let next = { ...model };
  const bEvents = model.bEvents || [];
  const cEvents = model.cEvents || [];
  const queues = model.queues || [];

  if (node.type === VISUAL_NODE_TYPES.SOURCE) {
    next.bEvents = bEvents.filter(be => be.id !== node.refId);
    next.cEvents = cEvents.map(ce => ({
      ...ce,
      cSchedules: (ce.cSchedules || []).filter(s => s.eventId !== node.refId),
    }));
  }

  if (node.type === VISUAL_NODE_TYPES.QUEUE) {
    const queue = queues.find(q => q.id === node.refId);
    if (queue && queue.name) {
      const esc = escRe(queue.name);
      const condPat = new RegExp(`queue\\(${esc}\\)`, "i");
      const effPat = new RegExp(`ASSIGN\\(${esc}`, "i");
      const arrivePat = new RegExp(`ARRIVE\\([^,]+,\\s*${esc}\\)`, "i");
      const releasePat = new RegExp(`RELEASE\\([^,]+,\\s*${esc}\\)`, "i");

      const affectedCIds = new Set(
        cEvents
          .filter(ce => {
            const cond = typeof ce.condition === "string" ? ce.condition : "";
            const eff = typeof ce.effect === "string" ? ce.effect : "";
            return condPat.test(cond) || effPat.test(eff);
          })
          .map(ce => ce.id)
      );

      const otherRefs = new Set(
        cEvents
          .filter(ce => !affectedCIds.has(ce.id))
          .flatMap(ce => (ce.cSchedules || []).map(s => s.eventId))
          .filter(Boolean)
      );
      const ownedBIds = new Set();
      affectedCIds.forEach(cId => {
        const ce = cEvents.find(c => c.id === cId);
        (ce?.cSchedules || []).forEach(s => {
          if (s.eventId && !otherRefs.has(s.eventId)) ownedBIds.add(s.eventId);
        });
      });

      next.queues = queues.filter(q => q.id !== node.refId);
      next.cEvents = cEvents.filter(ce => !affectedCIds.has(ce.id));
      next.bEvents = bEvents
        .filter(be => !ownedBIds.has(be.id))
        .map(be => {
          const eff = typeof be.effect === "string" ? be.effect : "";
          if (arrivePat.test(eff)) {
            return { ...be, effect: eff.replace(new RegExp(`,\\s*${esc}\\s*\\)`, "gi"), ")") };
          }
          if (releasePat.test(eff)) {
            return { ...be, effect: "" };
          }
          return be;
        });
    }
  }

  if (node.type === VISUAL_NODE_TYPES.ACTIVITY) {
    const ce = cEvents.find(c => c.id === node.refId);
    const ownedBIds = new Set();
    if (ce) {
      const otherRefs = new Set(
        cEvents
          .filter(c => c.id !== node.refId)
          .flatMap(c => (c.cSchedules || []).map(s => s.eventId))
          .filter(Boolean)
      );
      (ce.cSchedules || []).forEach(s => {
        if (s.eventId && !otherRefs.has(s.eventId)) ownedBIds.add(s.eventId);
      });
    }
    next.cEvents = cEvents.filter(c => c.id !== node.refId);
    next.bEvents = bEvents.filter(be => !ownedBIds.has(be.id));
  }

  if (node.type === VISUAL_NODE_TYPES.SINK) {
    next.bEvents = bEvents.filter(be => be.id !== node.refId);
    next.cEvents = cEvents.map(ce => ({
      ...ce,
      cSchedules: (ce.cSchedules || []).filter(s => s.eventId !== node.refId),
    }));
  }

  return updateGraphLayout(next, deriveGraphFromModel(next));
}

export function updateVisualNode(model, node, patch = {}) {
  if (!node) return model;
  let next = { ...model };
  if (node.type === VISUAL_NODE_TYPES.SOURCE) {
    next.bEvents = updateByRef(next.bEvents, node.refId, event => {
      const queue = patch.queueName || (String(event.effect || "").match(/ARRIVE\([^,]+,\s*([^)]+)\)/i)?.[1]?.trim()) || "";
      const customer = patch.customerType || (String(event.effect || "").match(/ARRIVE\(([^,)]+)/i)?.[1]?.trim()) || firstCustomerType(model);
      const nextEvent = {
        ...event,
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.customerType !== undefined || patch.queueName !== undefined ? { effect: queue ? `ARRIVE(${customer}, ${queue})` : `ARRIVE(${customer})` } : {}),
      };
      if (patch.interarrival) {
        const schedules = Array.isArray(nextEvent.schedules) ? [...nextEvent.schedules] : [];
        const first = schedules[0] || { eventId: event.id, useEntityCtx: false };
        schedules[0] = {
          ...first,
          eventId: first.eventId || event.id,
          dist: patch.interarrival.dist,
          distParams: patch.interarrival.distParams || {},
        };
        nextEvent.schedules = schedules;
      }
      return nextEvent;
    });
  }
  if (node.type === VISUAL_NODE_TYPES.QUEUE) {
    const currentQueue = (model.queues || []).find(queue => queue.id === node.refId);
    const oldName = currentQueue?.name;
    const nextName = patch.name;
    next.queues = updateByRef(next.queues, node.refId, queue => ({
      ...queue,
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.customerType !== undefined ? { customerType: patch.customerType } : {}),
      ...(patch.discipline !== undefined ? { discipline: patch.discipline } : {}),
    }));
    if (nextName !== undefined && oldName && nextName && oldName !== nextName) {
      next.bEvents = (next.bEvents || []).map(event => ({
        ...event,
        effect: replaceQueueName(event.effect, oldName, nextName),
      }));
      next.cEvents = (next.cEvents || []).map(event => ({
        ...event,
        condition: replaceQueueName(event.condition, oldName, nextName),
        effect: replaceQueueName(event.effect, oldName, nextName),
      }));
    }
  }
  if (node.type === VISUAL_NODE_TYPES.ACTIVITY) {
    next.cEvents = updateByRef(next.cEvents, node.refId, event => {
      const nextEvent = {
        ...event,
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.priority !== undefined ? { priority: Number(patch.priority) || 1 } : {}),
        ...(patch.condition !== undefined ? { condition: patch.condition } : {}),
        ...(patch.entityFilter !== undefined ? { entityFilter: patch.entityFilter } : {}),
      };
      if (patch.serverType) {
        const oldServer = String(nextEvent.effect || "").match(/ASSIGN\([^,)]+,\s*([^)]+)\)/i)?.[1]?.trim() || "";
        nextEvent.condition = replaceServerName(nextEvent.condition || "", oldServer, patch.serverType);
        nextEvent.effect = replaceServerName(nextEvent.effect || "", oldServer, patch.serverType);
      }
      if (patch.serviceTime) {
        const cSchedules = Array.isArray(nextEvent.cSchedules) ? [...nextEvent.cSchedules] : [];
        const first = cSchedules[0] || { eventId: "", useEntityCtx: true };
        cSchedules[0] = {
          ...first,
          dist: patch.serviceTime.dist,
          distParams: patch.serviceTime.distParams || {},
        };
        nextEvent.cSchedules = cSchedules;
      }
      return nextEvent;
    });
  }
  if (node.type === VISUAL_NODE_TYPES.SINK) {
    next.bEvents = updateByRef(next.bEvents, node.refId, event => ({
      ...event,
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.terminalMacro !== undefined ? { effect: `${patch.terminalMacro}()` } : {}),
    }));
  }
  return updateGraphLayout(next, deriveGraphFromModel(next));
}
