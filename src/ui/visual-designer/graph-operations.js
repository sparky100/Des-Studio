import { deriveGraphFromModel, graphLayoutFromDerivedGraph, VISUAL_NODE_TYPES } from "./graph.js";
import { extractQueueNamesFromCondition } from "../../model/conditionFormat.js";

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

export const VISUAL_PATTERNS = Object.freeze([
  { id: "single-queue", label: "Single queue service", hint: "Arrival, queue, service, completion" },
  { id: "two-stage", label: "Two-stage process", hint: "Route from one service stage to another" },
  { id: "reneging", label: "Reneging / abandonment", hint: "Waiting customers can leave after patience time" },
  { id: "finite-capacity", label: "Finite capacity queue", hint: "Queue has a maximum waiting space" },
  { id: "priority-queue", label: "Priority queue", hint: "Lower priority value is served first" },
  { id: "batching", label: "Batching", hint: "Wait until a group is ready, then process it" },
  { id: "server-failure", label: "Server failure and repair", hint: "Add failure and repair timing to a server" },
  { id: "cost-tracking", label: "Cost tracking", hint: "Track service cost in the results" },
  { id: "delay-activity", label: "Delay (no resource)", hint: "Timed hold with no server — recovery, cooling, paperwork" },
]);

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

function uniqueName(base, existingNames) {
  let name = base;
  let i = 2;
  while (existingNames.has(clean(name).toLowerCase())) {
    name = `${base} ${i}`;
    i += 1;
  }
  existingNames.add(clean(name).toLowerCase());
  return name;
}

function nextPriority(cEvents = []) {
  const max = cEvents.reduce((acc, event) => Math.max(acc, Number(event.priority) || 0), 0);
  return max + 1;
}

function appendServicePattern(model, {
  prefix,
  queueBase,
  arrivalBase,
  activityBase,
  completeBase,
  customer,
  server,
  queuePatch = {},
  arrivalSchedules = null,
  completionEffect = "COMPLETE()",
  serviceDist = { dist: "Fixed", distParams: { value: "1" } },
}) {
  const bEvents = [...(model.bEvents || [])];
  const cEvents = [...(model.cEvents || [])];
  const queues = [...(model.queues || [])];
  const allIds = new Set([...bEvents, ...cEvents, ...queues, ...(model.entityTypes || [])].map(item => item.id || item.name));
  const queueNames = new Set(queues.map(q => clean(q.name).toLowerCase()).filter(Boolean));
  const bNames = new Set(bEvents.map(e => clean(e.name).toLowerCase()).filter(Boolean));
  const cNames = new Set(cEvents.map(e => clean(e.name).toLowerCase()).filter(Boolean));

  const queueId = makeId(`${prefix}-queue`, allIds);
  allIds.add(queueId);
  const arrivalId = makeId(`${prefix}-arrival`, allIds);
  allIds.add(arrivalId);
  const completeId = makeId(`${prefix}-complete`, allIds);
  allIds.add(completeId);
  const activityId = makeId(`${prefix}-activity`, allIds);

  const queueName = uniqueName(queueBase, queueNames);
  const arrivalName = uniqueName(arrivalBase, bNames);
  const completeName = uniqueName(completeBase, bNames);
  const activityName = uniqueName(activityBase, cNames);

  queues.push({
    id: queueId,
    name: queueName,
    customerType: customer,
    discipline: "FIFO",
    ...queuePatch,
  });
  bEvents.push({
    id: arrivalId,
    name: arrivalName,
    scheduledTime: "0",
    effect: `ARRIVE(${customer}, ${queueName})`,
    schedules: arrivalSchedules || [{ eventId: arrivalId, dist: "Exponential", distParams: { mean: "5" } }],
  });
  bEvents.push({
    id: completeId,
    name: completeName,
    scheduledTime: "9999",
    effect: completionEffect,
    schedules: [],
  });
  cEvents.push({
    id: activityId,
    name: activityName,
    priority: nextPriority(cEvents),
    condition: `queue(${queueName}).length > 0 AND idle(${server}).count > 0`,
    effect: `ASSIGN(${queueName}, ${server})`,
    cSchedules: [{ eventId: completeId, ...serviceDist, useEntityCtx: true }],
  });

  return { ...model, bEvents, cEvents, queues };
}

function addPriorityAttribute(model, customer) {
  const entityTypes = (model.entityTypes || []).map(type => {
    if (type.name !== customer || (type.attrDefs || []).some(attr => attr.name === "priority")) return type;
    return {
      ...type,
      attrDefs: [
        ...(type.attrDefs || []),
        { id: makeId("priority", new Set((type.attrDefs || []).map(attr => attr.id || attr.name))), name: "priority", valueType: "number", defaultValue: 3, mutable: true },
      ],
    };
  });
  return { ...model, entityTypes };
}

function effectParts(effect) {
  return Array.isArray(effect) ? effect : [effect].filter(part => part !== undefined && part !== null && part !== "");
}

function withEffectPart(effect, part) {
  const parts = effectParts(effect);
  if (parts.some(item => String(item).trim().toUpperCase() === String(part).trim().toUpperCase())) return effect;
  return parts.length <= 1 && typeof effect === "string" ? [effect, part] : [...parts, part];
}

function queueForAnchor(model, anchorNode) {
  if (anchorNode?.type !== VISUAL_NODE_TYPES.QUEUE || !anchorNode.refId) return null;
  return (model.queues || []).find(queue => queue.id === anchorNode.refId) || null;
}

function serverNameFromActivity(model, anchorNode) {
  if (anchorNode?.type !== VISUAL_NODE_TYPES.ACTIVITY || !anchorNode.refId) return "";
  const event = (model.cEvents || []).find(item => item.id === anchorNode.refId);
  return String(event?.effect || "").match(/ASSIGN\([^,)]+,\s*([^)]+)\)/i)?.[1]?.trim() || "";
}

function relayoutModel(model) {
  const relayoutSeed = {
    ...model,
    graph: model.graph ? { ...model.graph, nodes: [] } : undefined,
  };
  return updateGraphLayout(relayoutSeed, deriveGraphFromModel(relayoutSeed));
}

function applyQueuePattern(model, patternId, anchorNode, customer) {
  const queue = queueForAnchor(model, anchorNode);
  if (!queue?.name) return null;

  if (patternId === "finite-capacity") {
    return {
      model: {
        ...model,
        queues: (model.queues || []).map(item => item.id === queue.id ? { ...item, capacity: item.capacity || "20" } : item),
      },
      appliedToSelection: true,
    };
  }

  if (patternId === "priority-queue") {
    const withPriority = addPriorityAttribute(model, queue.customerType || customer);
    return {
      model: {
        ...withPriority,
        queues: (withPriority.queues || []).map(item => item.id === queue.id ? { ...item, discipline: "PRIORITY" } : item),
      },
      appliedToSelection: true,
    };
  }

  if (patternId === "batching") {
    const allIds = new Set([...(model.cEvents || []), ...(model.bEvents || []), ...(model.queues || []), ...(model.entityTypes || [])].map(item => item.id || item.name));
    return {
      model: {
        ...model,
        cEvents: [
          ...(model.cEvents || []),
          {
            id: makeId("form-batch", allIds),
            name: `Form ${queue.name} Batch`,
            priority: 1,
            condition: `queue(${queue.name}).length >= 5`,
            effect: `BATCH(${queue.name}, 5)`,
            cSchedules: [],
          },
        ],
      },
      appliedToSelection: true,
    };
  }

  if (patternId === "reneging") {
    const allIds = new Set([...(model.bEvents || []), ...(model.cEvents || []), ...(model.queues || []), ...(model.entityTypes || [])].map(item => item.id || item.name));
    const renegeId = makeId("renege", allIds);
    const queueEsc = queue.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const arrivalPattern = new RegExp(`ARRIVE\\([^,]+,\\s*${queueEsc}\\)`, "i");
    let attached = false;
    const bEvents = (model.bEvents || []).map(event => {
      if (!arrivalPattern.test(effectParts(event.effect).join(";"))) return event;
      attached = true;
      return {
        ...event,
        schedules: [
          ...(event.schedules || []),
          { eventId: renegeId, dist: "Fixed", distParams: { value: "10" }, isRenege: true },
        ],
      };
    });
    if (!attached) return null;
    return {
      model: {
        ...model,
        bEvents: [
          ...bEvents,
          { id: renegeId, name: `${queue.name} Abandonment Timer`, scheduledTime: "9999", effect: "RENEGE(ctx)", schedules: [] },
        ],
      },
      appliedToSelection: true,
    };
  }

  return null;
}

function applyActivityPattern(model, patternId, anchorNode) {
  if (patternId !== "server-failure" && patternId !== "cost-tracking") return null;

  if (patternId === "server-failure") {
    const serverName = serverNameFromActivity(model, anchorNode);
    if (!serverName) return null;
    return {
      model: {
        ...model,
        entityTypes: (model.entityTypes || []).map(type => type.name !== serverName ? type : {
          ...type,
          mtbfDist: type.mtbfDist || "Exponential",
          mtbfDistParams: type.mtbfDistParams || { mean: "120" },
          mttrDist: type.mttrDist || "Exponential",
          mttrDistParams: type.mttrDistParams || { mean: "20" },
          failureScope: type.failureScope || "unit",
        }),
      },
      appliedToSelection: true,
    };
  }

  if (patternId === "cost-tracking" && anchorNode?.type === VISUAL_NODE_TYPES.ACTIVITY && anchorNode.refId) {
    const activity = (model.cEvents || []).find(event => event.id === anchorNode.refId);
    const scheduledIds = new Set((activity?.cSchedules || []).map(schedule => schedule.eventId).filter(Boolean));
    if (!scheduledIds.size) return null;
    return {
      model: {
        ...model,
        bEvents: (model.bEvents || []).map(event => scheduledIds.has(event.id) ? { ...event, effect: withEffectPart(event.effect, "COST(5)") } : event),
      },
      appliedToSelection: true,
    };
  }

  return null;
}

function applySinkPattern(model, patternId, anchorNode) {
  if (patternId !== "cost-tracking" || anchorNode?.type !== VISUAL_NODE_TYPES.SINK || !anchorNode.refId) return null;
  return {
    model: {
      ...model,
      bEvents: (model.bEvents || []).map(event => event.id === anchorNode.refId ? { ...event, effect: withEffectPart(event.effect, "COST(5)") } : event),
    },
    appliedToSelection: true,
  };
}

function updateByRef(items, refId, updater) {
  return (items || []).map(item => (item.id === refId ? updater(item) : item));
}

function replaceQueueName(text = "", oldName, newName) {
  if (!oldName || !newName) return text;
  const esc = oldName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return String(text || "")
    .replace(new RegExp(`queue\\(${esc}\\)`, "gi"), `queue(${newName})`)
    .replace(new RegExp(`ARRIVE\\(([^,)]+),\\s*${esc}\\)`, "gi"), `ARRIVE($1, ${newName})`)
    .replace(new RegExp(`ASSIGN\\(${esc},`, "gi"), `ASSIGN(${newName},`)
    .replace(new RegExp(`DELAY\\(${esc}\\)`, "gi"), `DELAY(${newName})`)
    .replace(new RegExp(`RELEASE\\(([^,)]+),\\s*${esc}\\)`, "gi"), `RELEASE($1, ${newName})`);
}

function replaceServerName(text = "", oldName, newName) {
  if (!oldName || !newName) return text;
  const esc = oldName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return String(text || "")
    .replace(new RegExp(`idle\\(${esc}\\)\\.count`, "gi"), `idle(${newName}).count`)
    .replace(new RegExp(`busy\\(${esc}\\)\\.count`, "gi"), `busy(${newName}).count`)
    .replace(new RegExp(`ASSIGN\\(([^,)]+),\\s*${esc}\\)`, "gi"), `ASSIGN($1, ${newName})`);
}

function replaceContainerName(text = "", oldName, newName) {
  if (!oldName || !newName) return text;
  const esc = oldName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return String(text || "")
    .replace(new RegExp(`FILL\\(${esc}\\s*,`, "gi"), `FILL(${newName},`)
    .replace(new RegExp(`DRAIN\\(${esc}\\s*,`, "gi"), `DRAIN(${newName},`)
    .replace(new RegExp(`container\\(${esc}\\)`, "gi"), `container(${newName})`);
}

function conditionReferencesQueue(condition, queueName) {
  if (!condition || !queueName) return false;
  const names = extractQueueNamesFromCondition(condition);
  return names.some(n => n.toLowerCase() === queueName.toLowerCase());
}

function replaceQueueNameInObjectCondition(condition, oldName, newName) {
  if (!condition || typeof condition !== "object" || Array.isArray(condition)) return condition;
  if (Array.isArray(condition.clauses)) {
    return { ...condition, clauses: condition.clauses.map(c => replaceQueueNameInObjectCondition(c, oldName, newName)) };
  }
  const variable = String(condition.variable || condition.token || condition.left || "");
  const updated = variable.replace(new RegExp(`queue\\(${escRe(oldName)}\\)`, "gi"), `queue(${newName})`);
  if (updated === variable) return condition;
  return { ...condition, variable: updated };
}

// Format B predicate objects ({variable, operator, value} or {operator: "AND"/"OR", clauses: [...]})
// can also embed a renamed container via a `container(Id).property` token in `variable` —
// used by bEvents[].routing[].condition, cEvents[].cSchedules[].when, and queues[].balkCondition.
function renameContainerInPredicate(predicate, oldName, newName) {
  if (!predicate || typeof predicate !== "object" || !oldName || !newName) return predicate;
  if (predicate.operator === "AND" || predicate.operator === "OR") {
    return {
      ...predicate,
      clauses: (predicate.clauses || []).map(clause => renameContainerInPredicate(clause, oldName, newName)),
    };
  }
  if (typeof predicate.variable === "string") {
    return { ...predicate, variable: replaceContainerName(predicate.variable, oldName, newName) };
  }
  return predicate;
}

function findNode(graph, id) {
  return (graph.nodes || []).find(node => node.id === id);
}

function wouldCreateCycle(edges, from, to) {
  const out = new Map();
  // Skip loop edges (loop: true) — they are intentional back-edges
  const nonLoopEdges = (edges || []).filter(edge => !edge.loop);
  [...nonLoopEdges, { from, to }].forEach(edge => {
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
  if (source.type === VISUAL_NODE_TYPES.CONTAINER || target.type === VISUAL_NODE_TYPES.CONTAINER) {
    return { ok: false, message: "Container nodes do not participate in entity flow and cannot be connected." };
  }
  if (source.type === VISUAL_NODE_TYPES.SINK) return { ok: false, message: "Sink nodes are terminal." };
  if (target.type === VISUAL_NODE_TYPES.SOURCE) return { ok: false, message: "Source nodes cannot have incoming connections." };
  if (source.type === VISUAL_NODE_TYPES.SOURCE && target.type !== VISUAL_NODE_TYPES.QUEUE) {
    return { ok: false, message: "Sources can only connect to queues." };
  }
  if (source.type === VISUAL_NODE_TYPES.QUEUE &&
      ![VISUAL_NODE_TYPES.ACTIVITY, VISUAL_NODE_TYPES.QUEUE, VISUAL_NODE_TYPES.SINK].includes(target.type)) {
    return { ok: false, message: "Queues can connect to activities (service), other queues (overflow), or sinks (overflow exit)." };
  }
  if (source.type === VISUAL_NODE_TYPES.QUEUE && target.type === VISUAL_NODE_TYPES.QUEUE && source.id === target.id) {
    return { ok: false, message: "A queue cannot overflow to itself." };
  }
  if (source.type === VISUAL_NODE_TYPES.ACTIVITY && ![VISUAL_NODE_TYPES.QUEUE, VISUAL_NODE_TYPES.SINK].includes(target.type)) {
    return { ok: false, message: "Activities can only route to queues or sinks." };
  }
  if (source.type === VISUAL_NODE_TYPES.SOURCE && target.type === VISUAL_NODE_TYPES.SINK) {
    return { ok: false, message: "Sources cannot bypass processing and connect directly to sinks." };
  }
  if (wouldCreateCycle(graph.edges || [], from, to)) {
    // Back-edge detection: allow Activity → Queue connections that create cycles as loop edges
    if (source.type === VISUAL_NODE_TYPES.ACTIVITY && target.type === VISUAL_NODE_TYPES.QUEUE) {
      return {
        ok: true,
        loop: true,
        maxLoopCount: 3,
        exitQueueName: null,
        message: "Loop edge (back-edge) created — configure rework limit in the edge inspector.",
      };
    }
    return { ok: false, message: "That connection would create a cycle." };
  }
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
  const containerTypes = [...(withEntities.containerTypes || [])];
  const allIds = new Set([...bEvents, ...cEvents, ...queues, ...containerTypes, ...(withEntities.entityTypes || [])].map(item => item.id || item.name));
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

  if (type === VISUAL_NODE_TYPES.CONTAINER) {
    const id = makeId("container", allIds);
    containerTypes.push({ id, capacity: null, initialLevel: 0 });
  }

  const next = { ...withEntities, bEvents, cEvents, queues, containerTypes };
  const derived = deriveGraphFromModel(next);
  if (!position) return updateGraphLayout(next, derived);
  const newest = [...derived.nodes].reverse().find(node => node.type === type);
  return updateGraphLayout(next, derived, newest ? { nodes: [{ id: newest.id, x: position.x, y: position.y }] } : {});
}

export function createStarterFlowModel(model) {
  let next = ensureEntityTypes(model);
  next = addVisualNode(next, VISUAL_NODE_TYPES.QUEUE);
  next = addVisualNode(next, VISUAL_NODE_TYPES.SOURCE);
  next = addVisualNode(next, VISUAL_NODE_TYPES.ACTIVITY);

  let graph = deriveGraphFromModel(next);
  const sourceId = graph.nodes.find(node => node.type === VISUAL_NODE_TYPES.SOURCE)?.id;
  const queueId = graph.nodes.find(node => node.type === VISUAL_NODE_TYPES.QUEUE)?.id;
  const activityId = graph.nodes.find(node => node.type === VISUAL_NODE_TYPES.ACTIVITY)?.id;
  const sinkId = graph.nodes.find(node => node.type === VISUAL_NODE_TYPES.SINK)?.id;

  if (sourceId && queueId) {
    next = connectVisualNodes(next, graph, sourceId, queueId).model;
    graph = deriveGraphFromModel(next);
  }
  if (queueId && activityId) {
    next = connectVisualNodes(next, graph, queueId, activityId).model;
    graph = deriveGraphFromModel(next);
  }
  if (activityId && sinkId) {
    next = connectVisualNodes(next, graph, activityId, sinkId).model;
  }

  const relayoutSeed = {
    ...next,
    graph: next.graph ? { ...next.graph, nodes: [] } : undefined,
  };
  return updateGraphLayout(relayoutSeed, deriveGraphFromModel(relayoutSeed));
}

export function addVisualPattern(model, patternId, options = {}) {
  let next = ensureEntityTypes(model || {});
  const customer = firstCustomerType(next);
  const server = firstServerType(next);
  const anchorNode = options.anchorNode || null;
  const selectionPatch = applyQueuePattern(next, patternId, anchorNode, customer)
    || applyActivityPattern(next, patternId, anchorNode)
    || applySinkPattern(next, patternId, anchorNode);
  if (selectionPatch) {
    return {
      model: relayoutModel(selectionPatch.model),
      appliedToSelection: true,
    };
  }

  if (patternId === "single-queue") {
    next = appendServicePattern(next, {
      prefix: "single-service",
      queueBase: "Service Queue",
      arrivalBase: "Customer Arrival",
      activityBase: "Service",
      completeBase: "Service Complete",
      customer,
      server,
    });
  } else if (patternId === "reneging") {
    const bEvents = [...(next.bEvents || [])];
    const allIds = new Set([...bEvents, ...(next.cEvents || []), ...(next.queues || []), ...(next.entityTypes || [])].map(item => item.id || item.name));
    const renegeId = makeId("renege", allIds);
    next = appendServicePattern(next, {
      prefix: "reneging",
      queueBase: "Waiting Queue",
      arrivalBase: "Customer Arrival",
      activityBase: "Service",
      completeBase: "Service Complete",
      customer,
      server,
      arrivalSchedules: null,
    });
    const arrival = next.bEvents.find(event => String(event.id || "").startsWith("reneging-arrival"));
    next = {
      ...next,
      bEvents: [
        ...next.bEvents.map(event => event.id !== arrival?.id ? event : {
          ...event,
          schedules: [
            ...(event.schedules || []),
            { eventId: renegeId, dist: "Fixed", distParams: { value: "10" }, isRenege: true },
          ],
        }),
        { id: renegeId, name: "Abandonment Timer", scheduledTime: "9999", effect: "RENEGE(ctx)", schedules: [] },
      ],
    };
  } else if (patternId === "finite-capacity") {
    next = appendServicePattern(next, {
      prefix: "finite-capacity",
      queueBase: "Waiting Area",
      arrivalBase: "Customer Arrival",
      activityBase: "Service",
      completeBase: "Service Complete",
      customer,
      server,
      queuePatch: { capacity: "20" },
    });
  } else if (patternId === "priority-queue") {
    next = addPriorityAttribute(next, customer);
    next = appendServicePattern(next, {
      prefix: "priority",
      queueBase: "Priority Queue",
      arrivalBase: "Customer Arrival",
      activityBase: "Priority Service",
      completeBase: "Service Complete",
      customer,
      server,
      queuePatch: { discipline: "PRIORITY" },
    });
  } else if (patternId === "two-stage") {
    const bEvents = [...(next.bEvents || [])];
    const cEvents = [...(next.cEvents || [])];
    const queues = [...(next.queues || [])];
    const allIds = new Set([...bEvents, ...cEvents, ...queues, ...(next.entityTypes || [])].map(item => item.id || item.name));
    const queueNames = new Set(queues.map(q => clean(q.name).toLowerCase()).filter(Boolean));
    const q1 = uniqueName("Stage 1 Queue", queueNames);
    const q2 = uniqueName("Stage 2 Queue", queueNames);
    const q1Id = makeId("stage-1-queue", allIds); allIds.add(q1Id);
    const q2Id = makeId("stage-2-queue", allIds); allIds.add(q2Id);
    const arrivalId = makeId("two-stage-arrival", allIds); allIds.add(arrivalId);
    const stage1DoneId = makeId("stage-1-complete", allIds); allIds.add(stage1DoneId);
    const stage2DoneId = makeId("stage-2-complete", allIds); allIds.add(stage2DoneId);
    const stage1Id = makeId("stage-1-activity", allIds); allIds.add(stage1Id);
    const stage2Id = makeId("stage-2-activity", allIds);
    queues.push(
      { id: q1Id, name: q1, customerType: customer, discipline: "FIFO" },
      { id: q2Id, name: q2, customerType: customer, discipline: "FIFO" },
    );
    bEvents.push(
      { id: arrivalId, name: "Customer Arrival", scheduledTime: "0", effect: `ARRIVE(${customer}, ${q1})`, schedules: [{ eventId: arrivalId, dist: "Exponential", distParams: { mean: "5" } }] },
      { id: stage1DoneId, name: "Stage 1 Complete", scheduledTime: "9999", effect: `RELEASE(${server}, ${q2})`, schedules: [] },
      { id: stage2DoneId, name: "Stage 2 Complete", scheduledTime: "9999", effect: "COMPLETE()", schedules: [] },
    );
    const priority = nextPriority(cEvents);
    cEvents.push(
      { id: stage1Id, name: "Stage 1", priority, condition: `queue(${q1}).length > 0 AND idle(${server}).count > 0`, effect: `ASSIGN(${q1}, ${server})`, cSchedules: [{ eventId: stage1DoneId, dist: "Fixed", distParams: { value: "1" }, useEntityCtx: true }] },
      { id: stage2Id, name: "Stage 2", priority: priority + 1, condition: `queue(${q2}).length > 0 AND idle(${server}).count > 0`, effect: `ASSIGN(${q2}, ${server})`, cSchedules: [{ eventId: stage2DoneId, dist: "Fixed", distParams: { value: "1" }, useEntityCtx: true }] },
    );
    next = { ...next, bEvents, cEvents, queues };
  } else if (patternId === "batching") {
    next = appendServicePattern(next, {
      prefix: "batching",
      queueBase: "Batch Queue",
      arrivalBase: "Item Arrival",
      activityBase: "Process Batch",
      completeBase: "Batch Complete",
      customer,
      server,
      serviceDist: { dist: "Fixed", distParams: { value: "5" } },
    });
    const queues = next.queues || [];
    const batchQueue = [...queues].reverse().find(queue => String(queue.id || "").startsWith("batching-queue"));
    const cEvents = [...(next.cEvents || [])];
    const allIds = new Set([...cEvents, ...(next.bEvents || []), ...queues, ...(next.entityTypes || [])].map(item => item.id || item.name));
    next = {
      ...next,
      cEvents: [
        ...cEvents,
        {
          id: makeId("form-batch", allIds),
          name: "Form Batch",
          priority: 1,
          condition: `queue(${batchQueue?.name || "Batch Queue"}).length >= 5`,
          effect: `BATCH(${batchQueue?.name || "Batch Queue"}, 5)`,
          cSchedules: [],
        },
      ],
    };
  } else if (patternId === "server-failure") {
    next = appendServicePattern(next, {
      prefix: "failure",
      queueBase: "Machine Queue",
      arrivalBase: "Job Arrival",
      activityBase: "Machine Work",
      completeBase: "Job Complete",
      customer,
      server,
      serviceDist: { dist: "Fixed", distParams: { value: "5" } },
    });
    next = {
      ...next,
      entityTypes: (next.entityTypes || []).map(type => type.role !== "server" ? type : {
        ...type,
        mtbfDist: type.mtbfDist || "Exponential",
        mtbfDistParams: type.mtbfDistParams || { mean: "120" },
        mttrDist: type.mttrDist || "Exponential",
        mttrDistParams: type.mttrDistParams || { mean: "20" },
        failureScope: type.failureScope || "unit",
      }),
    };
  } else if (patternId === "cost-tracking") {
    next = appendServicePattern(next, {
      prefix: "cost",
      queueBase: "Costed Queue",
      arrivalBase: "Customer Arrival",
      activityBase: "Costed Service",
      completeBase: "Service Complete",
      customer,
      server,
      completionEffect: ["COMPLETE()", "COST(5)"],
    });
  } else if (patternId === "delay-activity") {
    const bEvents = [...(next.bEvents || [])];
    const cEvents = [...(next.cEvents || [])];
    const queues = [...(next.queues || [])];
    const allIds = new Set([...bEvents, ...cEvents, ...queues, ...(next.entityTypes || [])].map(item => item.id || item.name));
    const queueNames = new Set(queues.map(q => clean(q.name).toLowerCase()).filter(Boolean));
    const bNames = new Set(bEvents.map(e => clean(e.name).toLowerCase()).filter(Boolean));
    const cNames = new Set(cEvents.map(e => clean(e.name).toLowerCase()).filter(Boolean));

    const queueId   = makeId("delay-queue",    allIds); allIds.add(queueId);
    const arrivalId = makeId("delay-arrival",  allIds); allIds.add(arrivalId);
    const doneId    = makeId("delay-done",     allIds); allIds.add(doneId);
    const activityId = makeId("delay-activity", allIds);

    const queueName    = uniqueName("Waiting Area",       queueNames);
    const arrivalName  = uniqueName("Customer Arrival",   bNames);
    const doneName     = uniqueName("Delay Complete",     bNames);
    const activityName = uniqueName("Hold",               cNames);

    queues.push({ id: queueId, name: queueName, customerType: customer, discipline: "FIFO" });

    bEvents.push(
      {
        id: arrivalId,
        name: arrivalName,
        scheduledTime: "0",
        effect: `ARRIVE(${customer}, ${queueName})`,
        schedules: [{ eventId: arrivalId, dist: "Exponential", distParams: { mean: "5" } }],
      },
      {
        // No effect — routing handles completion. Exit system (null) is the default branch.
        id: doneId,
        name: doneName,
        scheduledTime: "9999",
        effect: [],
        schedules: [],
        probabilisticRouting: [{ probability: 1, queueName: null }],
      },
    );

    const priority = nextPriority(cEvents);
    cEvents.push({
      id: activityId,
      name: activityName,
      priority,
      condition: { variable: `queue(${queueName}).length`, operator: ">", value: 0 },
      effect: `DELAY(${queueName})`,
      cSchedules: [{ eventId: doneId, dist: "Fixed", distParams: { value: "5" }, useEntityCtx: true }],
    });

    next = { ...next, bEvents, cEvents, queues };
  } else {
    return { model: next, appliedToSelection: false };
  }

  return {
    model: relayoutModel(next),
    appliedToSelection: false,
  };
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
    if (node.type === VISUAL_NODE_TYPES.SINK && (incoming.get(node.id) || 0) === 0
        && node.sublabel !== "Reneging exit") {
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
    next.cEvents = updateByRef(next.cEvents, target.refId, event => {
      const existingEffect = Array.isArray(event.effect) ? event.effect.join(";") : (event.effect || "");
      const isDelay = /^DELAY\(/i.test(existingEffect.trim());
      if (isDelay) {
        // Preserve delay mode — just update the queue name in the DELAY effect and condition
        return {
          ...event,
          condition: `queue(${source.label}).length > 0`,
          effect: [`DELAY(${source.label})`],
        };
      }
      return {
        ...event,
        condition: `queue(${source.label}).length > 0 AND idle(${server}).count > 0`,
        effect: `ASSIGN(${source.label}, ${server})`,
      };
    });
  }

  // F11.5: Queue → Queue overflow connection
  if (source.type === VISUAL_NODE_TYPES.QUEUE && target.type === VISUAL_NODE_TYPES.QUEUE) {
    next.queues = (next.queues || []).map(q =>
      q.id !== source.refId ? q : { ...q, overflowDestination: target.label }
    );
  }

  // F11.5: Queue → Sink overflow exit (null overflowDestination = exit system)
  if (source.type === VISUAL_NODE_TYPES.QUEUE && target.type === VISUAL_NODE_TYPES.SINK) {
    next.queues = (next.queues || []).map(q =>
      q.id !== source.refId ? q : { ...q, overflowDestination: null }
    );
  }

  if (source.type === VISUAL_NODE_TYPES.ACTIVITY && target.type === VISUAL_NODE_TYPES.QUEUE) {
    const isLoop = validation.loop === true;
    const completionId = `route-${source.refId || "activity"}-${target.refId || "queue"}${isLoop ? "-loop" : ""}`;
    const bEvents = [...(next.bEvents || [])];
    const existing = bEvents.find(event => event.id === completionId);
    const loopConfig = isLoop ? { maxLoopCount: validation.maxLoopCount ?? 3, exitQueueName: validation.exitQueueName ?? null } : undefined;
    if (existing) {
      next.bEvents = updateByRef(bEvents, completionId, event => ({
        ...event,
        effect: `RELEASE(${server}, ${target.label})`,
        ...(loopConfig ? { loopConfig } : {}),
      }));
    } else {
      next.bEvents = [...bEvents, {
        id: completionId,
        name: `${source.label} Complete`,
        scheduledTime: "9999",
        effect: `RELEASE(${server}, ${target.label})`,
        schedules: [],
        ...(loopConfig ? { loopConfig } : {}),
      }];
    }
    next.cEvents = updateByRef(next.cEvents, source.refId, event => {
      const kept = (event.cSchedules || []).filter(cs => cs.eventId !== completionId);
      return {
        ...event,
        cSchedules: [...kept, { eventId: completionId, dist: "Fixed", distParams: { value: "1" }, useEntityCtx: true }],
      };
    });
  }

  if (source.type === VISUAL_NODE_TYPES.ACTIVITY && target.type === VISUAL_NODE_TYPES.SINK) {
    next.cEvents = updateByRef(next.cEvents, source.refId, event => {
      const kept = (event.cSchedules || []).filter(cs => cs.eventId !== target.refId);
      return {
        ...event,
        cSchedules: [...kept, { eventId: target.refId, dist: "Fixed", distParams: { value: "1" }, useEntityCtx: true }],
      };
    });
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
      const effPat = new RegExp(`(?:ASSIGN|DELAY)\\(${esc}[,)]`, "i");
      const arrivePat = new RegExp(`ARRIVE\\([^,]+,\\s*${esc}\\)`, "i");
      const releasePat = new RegExp(`RELEASE\\([^,]+,\\s*${esc}\\)`, "i");

      const affectedCIds = new Set();
      cEvents.forEach(ce => {
        const cond = typeof ce.condition === "string" ? ce.condition : "";
        const eff = Array.isArray(ce.effect) ? ce.effect.join(";") : (typeof ce.effect === "string" ? ce.effect : "");
        if (condPat.test(cond) || effPat.test(eff) || conditionReferencesQueue(ce.condition, queue.name)) {
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

  // Containers don't participate in entity flow, so they have no dependents.
  if (node.type === VISUAL_NODE_TYPES.CONTAINER) {
    return deps;
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

  // Queue → Activity ("condition"): clear queue-specific condition, ASSIGN/DELAY effect and cSchedules
  if (edge.source === "condition" && fromNode.type === VISUAL_NODE_TYPES.QUEUE && toNode.type === VISUAL_NODE_TYPES.ACTIVITY) {
    next.cEvents = cEvents.map(ce =>
      ce.id !== toNode.refId ? ce : { ...ce, condition: "", effect: [], cSchedules: [] }
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

  // Queue → Queue/Sink ("overflow"): clear overflowDestination on the source queue
  if (edge.source === "overflow" && fromNode.type === VISUAL_NODE_TYPES.QUEUE) {
    next.queues = (next.queues || []).map(q =>
      q.id !== fromNode.refId ? q : { ...q, overflowDestination: undefined }
    );
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

// Updates one probabilistic-routing branch's probability in place. The edge
// carries bEventId/branchIndex (set by graph.js when deriving probabilistic
// routing edges) so this can target the exact branch without re-parsing the
// "NN%" label back into a number. Probability is clamped to [0, 1]; other
// branches and queue targets are left untouched — the canvas does not enforce
// the branches summing to 1, matching BEventEditor's own non-blocking total.
export function updateProbabilisticBranchProbability(model, edge, probability) {
  if (!edge || edge.bEventId == null || edge.branchIndex == null) return model;
  const clamped = Math.max(0, Math.min(1, probability));
  const next = {
    ...model,
    bEvents: (model.bEvents || []).map(be => {
      if (be.id !== edge.bEventId) return be;
      const probabilisticRouting = (be.probabilisticRouting || []).map((branch, idx) =>
        idx === edge.branchIndex ? { ...branch, probability: clamped } : branch
      );
      return { ...be, probabilisticRouting };
    }),
  };
  return updateGraphLayout(next, deriveGraphFromModel(next));
}

// Clones one or more selected canvas nodes, offsetting their copies on the canvas.
// Connections are never copied — duplicates land disconnected, same as a freshly
// added node, since auto-replicating edges to (possibly non-duplicated) neighbours
// would be ambiguous. Synthetic route-exit sink nodes are not real model records
// and are skipped. Returns the updated model plus the new graph node ids so the
// caller can select the copies.
export function duplicateVisualNodes(model, nodes = [], offset = { x: 48, y: 48 }) {
  const duplicable = nodes.filter(node => node?.refId && !node.refId.startsWith("route-exit:"));
  if (duplicable.length === 0) return { model, newNodeIds: [] };

  const bEvents = [...(model.bEvents || [])];
  const cEvents = [...(model.cEvents || [])];
  const queues = [...(model.queues || [])];
  const allIds = new Set([...bEvents, ...cEvents, ...queues, ...(model.entityTypes || [])].map(item => item.id || item.name));
  const existingBNames = new Set(bEvents.map(event => clean(event.name).toLowerCase()));
  const existingCNames = new Set(cEvents.map(event => clean(event.name).toLowerCase()));
  const existingQNames = new Set(queues.map(queue => clean(queue.name).toLowerCase()));
  const nextId = prefix => {
    const id = makeId(prefix, allIds);
    allIds.add(id);
    return id;
  };

  // { type, refId, x, y } for each copy — used after re-deriving the graph to
  // find the new node and pin its position next to the original.
  const newRefs = [];

  for (const node of duplicable) {
    if (node.type === VISUAL_NODE_TYPES.QUEUE) {
      const original = queues.find(queue => queue.id === node.refId);
      if (!original) continue;
      const id = nextId("queue");
      const name = uniqueName(`${original.name} copy`, existingQNames);
      queues.push({ ...original, id, name });
      newRefs.push({ type: node.type, refId: id, x: (node.x || 0) + offset.x, y: (node.y || 0) + offset.y });
    }

    if (node.type === VISUAL_NODE_TYPES.SOURCE) {
      const original = bEvents.find(event => event.id === node.refId);
      if (!original) continue;
      const id = nextId("arrival");
      const name = uniqueName(`${original.name} copy`, existingBNames);
      const schedules = (original.schedules || []).map(schedule => ({
        ...schedule,
        eventId: schedule.eventId === original.id ? id : schedule.eventId,
      }));
      bEvents.push({ ...original, id, name, schedules });
      newRefs.push({ type: node.type, refId: id, x: (node.x || 0) + offset.x, y: (node.y || 0) + offset.y });
    }

    if (node.type === VISUAL_NODE_TYPES.SINK) {
      const original = bEvents.find(event => event.id === node.refId);
      if (!original) continue;
      const id = nextId("completion");
      const name = uniqueName(`${original.name} copy`, existingBNames);
      bEvents.push({ ...original, id, name, schedules: (original.schedules || []).map(schedule => ({ ...schedule })) });
      newRefs.push({ type: node.type, refId: id, x: (node.x || 0) + offset.x, y: (node.y || 0) + offset.y });
    }

    if (node.type === VISUAL_NODE_TYPES.ACTIVITY) {
      const original = cEvents.find(event => event.id === node.refId);
      if (!original) continue;
      const cId = nextId("activity");
      const cName = uniqueName(`${original.name} copy`, existingCNames);
      // Clone each referenced completion B-event too, so the copy's routing/loop
      // config is independent rather than two activities sharing one completion.
      const cSchedules = (original.cSchedules || []).map(schedule => {
        const completion = schedule.eventId && bEvents.find(event => event.id === schedule.eventId);
        if (!completion) return { ...schedule };
        const completionId = nextId("service-complete");
        bEvents.push({ ...completion, id: completionId, name: uniqueName(`${completion.name} copy`, existingBNames) });
        return { ...schedule, eventId: completionId };
      });
      cEvents.push({ ...original, id: cId, name: cName, cSchedules });
      newRefs.push({ type: node.type, refId: cId, x: (node.x || 0) + offset.x, y: (node.y || 0) + offset.y });
    }
  }

  const next = { ...model, bEvents, cEvents, queues };
  const derived = deriveGraphFromModel(next);
  const positionPatches = [];
  const newNodeIds = [];
  for (const ref of newRefs) {
    const derivedNode = derived.nodes.find(n => n.type === ref.type && n.refId === ref.refId);
    if (!derivedNode) continue;
    positionPatches.push({ id: derivedNode.id, x: ref.x, y: ref.y });
    newNodeIds.push(derivedNode.id);
  }

  return { model: updateGraphLayout(next, derived, { nodes: positionPatches }), newNodeIds };
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
      const effPat = new RegExp(`(?:ASSIGN|DELAY)\\(${esc}`, "i");
      const arrivePat = new RegExp(`ARRIVE\\([^,]+,\\s*${esc}\\)`, "i");
      const releasePat = new RegExp(`RELEASE\\([^,]+,\\s*${esc}\\)`, "i");

      const affectedCIds = new Set(
        cEvents
          .filter(ce => {
            const cond = typeof ce.condition === "string" ? ce.condition : "";
            const eff = Array.isArray(ce.effect) ? ce.effect.join(";") : (typeof ce.effect === "string" ? ce.effect : "");
            return condPat.test(cond) || effPat.test(eff) || conditionReferencesQueue(ce.condition, queue.name);
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

      const deletedName = clean(queue.name).toLowerCase();
      next.queues = queues
        .filter(q => q.id !== node.refId)
        .map(q => q.overflowDestination && clean(q.overflowDestination).toLowerCase() === deletedName
          ? { ...q, overflowDestination: undefined }
          : q);
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

  if (node.type === VISUAL_NODE_TYPES.CONTAINER) {
    next.containerTypes = (model.containerTypes || []).filter(ct => ct.id !== node.refId);
  }

  return updateGraphLayout(next, deriveGraphFromModel(next));
}

export function deleteVisualNodes(model, nodes = []) {
  const requestedIds = new Set((nodes || []).map(node => node?.id).filter(Boolean));
  if (!requestedIds.size) return model;

  let next = model;
  for (const requestedId of requestedIds) {
    const graph = deriveGraphFromModel(next);
    const current = (graph.nodes || []).find(node => node.id === requestedId);
    if (!current) continue;
    next = deleteVisualNode(next, current);
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
      ...(patch.name             !== undefined ? { name: patch.name }                         : {}),
      ...(patch.customerType     !== undefined ? { customerType: patch.customerType }         : {}),
      ...(patch.discipline       !== undefined ? { discipline: patch.discipline }             : {}),
      ...(patch.capacity         !== undefined ? { capacity: patch.capacity }                 : {}),
      ...(patch.overflowDestination !== undefined ? { overflowDestination: patch.overflowDestination } : {}),
    }));
    if (nextName !== undefined && oldName && nextName && oldName !== nextName) {
      next.bEvents = (next.bEvents || []).map(event => ({
        ...event,
        effect: replaceQueueName(event.effect, oldName, nextName),
      }));
      next.cEvents = (next.cEvents || []).map(event => ({
        ...event,
        condition: typeof event.condition === "string"
          ? replaceQueueName(event.condition, oldName, nextName)
          : replaceQueueNameInObjectCondition(event.condition, oldName, nextName),
        effect: typeof event.effect === "string"
          ? replaceQueueName(event.effect, oldName, nextName)
          : replaceQueueNameInObjectCondition(event.effect, oldName, nextName),
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
    const sinkRefId = node.refId?.startsWith("route-exit:") ? node.refId.slice("route-exit:".length) : node.refId;
    next.bEvents = updateByRef(next.bEvents, sinkRefId, event => ({
      ...event,
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.terminalMacro !== undefined ? { effect: `${patch.terminalMacro}()` } : {}),
    }));
  }
  if (node.type === VISUAL_NODE_TYPES.CONTAINER) {
    const currentContainer = (model.containerTypes || []).find(ct => ct.id === node.refId);
    const oldId = currentContainer?.id;
    const nextId = patch.id;
    next.containerTypes = updateByRef(next.containerTypes, node.refId, ct => ({
      ...ct,
      ...(patch.id           !== undefined ? { id: patch.id }                   : {}),
      ...(patch.capacity     !== undefined ? { capacity: patch.capacity }       : {}),
      ...(patch.initialLevel !== undefined ? { initialLevel: patch.initialLevel } : {}),
    }));
    if (nextId !== undefined && oldId && nextId && oldId !== nextId) {
      next.bEvents = (next.bEvents || []).map(event => ({
        ...event,
        effect: replaceContainerName(event.effect, oldId, nextId),
        ...(Array.isArray(event.routing) ? {
          routing: event.routing.map(branch => ({
            ...branch,
            condition: renameContainerInPredicate(branch.condition, oldId, nextId),
          })),
        } : {}),
      }));
      next.cEvents = (next.cEvents || []).map(event => ({
        ...event,
        condition: replaceContainerName(event.condition, oldId, nextId),
        effect: replaceContainerName(event.effect, oldId, nextId),
        ...(Array.isArray(event.cSchedules) ? {
          cSchedules: event.cSchedules.map(schedule => (
            schedule.when ? { ...schedule, when: renameContainerInPredicate(schedule.when, oldId, nextId) } : schedule
          )),
        } : {}),
      }));
      next.queues = (next.queues || []).map(queue => (
        queue.balkCondition
          ? { ...queue, balkCondition: renameContainerInPredicate(queue.balkCondition, oldId, nextId) }
          : queue
      ));
    }
  }
  if (patch.sectionId !== undefined) {
    // Sections key membership by the underlying entity's id (queue/bEvent/cEvent),
    // same id node.refId points at — route-exit sinks share their parent bEvent's id.
    const memberRefId = node.refId?.startsWith("route-exit:") ? node.refId.slice("route-exit:".length) : node.refId;
    next.sections = (next.sections || []).map(section => {
      const memberIds = (section.memberIds || []).filter(id => id !== memberRefId);
      if (section.id === patch.sectionId) memberIds.push(memberRefId);
      return { ...section, memberIds };
    });
  }
  return updateGraphLayout(next, deriveGraphFromModel(next));
}
