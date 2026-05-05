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

export function addVisualNode(model, type) {
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
      schedules: [],
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
  return updateGraphLayout(next, deriveGraphFromModel(next));
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

export function updateVisualNode(model, node, patch = {}) {
  if (!node) return model;
  let next = { ...model };
  if (node.type === VISUAL_NODE_TYPES.SOURCE) {
    next.bEvents = updateByRef(next.bEvents, node.refId, event => {
      const queue = patch.queueName || (String(event.effect || "").match(/ARRIVE\([^,]+,\s*([^)]+)\)/i)?.[1]?.trim()) || "";
      const customer = patch.customerType || (String(event.effect || "").match(/ARRIVE\(([^,)]+)/i)?.[1]?.trim()) || firstCustomerType(model);
      return {
        ...event,
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.customerType !== undefined || patch.queueName !== undefined ? { effect: queue ? `ARRIVE(${customer}, ${queue})` : `ARRIVE(${customer})` } : {}),
      };
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
    next.cEvents = updateByRef(next.cEvents, node.refId, event => ({
      ...event,
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.priority !== undefined ? { priority: Number(patch.priority) || 1 } : {}),
      ...(patch.condition !== undefined ? { condition: patch.condition } : {}),
    }));
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
