// visual-designer/graph.js — canonical model_json to visual graph helpers
//
// Graph topology is derived from the canonical DES model. Persisted
// model.graph data is used only for layout metadata such as node positions.

const NODE_SPACING_X = 190;
const NODE_SPACING_Y = 130;
const ORIGIN_X = 40;
const ORIGIN_Y = 120;

export const VISUAL_NODE_TYPES = {
  SOURCE: "source",
  QUEUE: "queue",
  ACTIVITY: "activity",
  SINK: "sink",
};

function clean(value = "") {
  return String(value || "").trim();
}

function norm(value = "") {
  return clean(value).toLowerCase();
}

function effectText(effect) {
  if (Array.isArray(effect)) return effect.map(effectText).filter(Boolean).join(";");
  if (effect && typeof effect === "object") {
    if (typeof effect.effect === "string") return effect.effect;
    const macro = clean(effect.macro || effect.type || effect.name).toUpperCase();
    if (!macro) return "";
    const args = Array.isArray(effect.args)
      ? effect.args
      : [
          effect.entityType || effect.customerType || effect.queue || effect.resourceType || effect.serverType,
          effect.serverType || effect.resourceType,
        ].filter(Boolean);
    return `${macro}(${args.join(", ")})`;
  }
  return clean(effect);
}

function macroCalls(effect) {
  const text = effectText(effect);
  return [...text.matchAll(/\b([A-Z_]+)\s*\(([^)]*)\)/gi)].map(match => ({
    macro: match[1].trim().toUpperCase(),
    args: match[2].split(",").map(arg => arg.trim()).filter(Boolean),
  }));
}

function queueRefsFromCondition(condition) {
  if (!condition) return [];
  if (typeof condition === "string") {
    return [...condition.matchAll(/queue\(([^)]+)\)/gi)].map(match => clean(match[1]));
  }
  if (typeof condition !== "object" || Array.isArray(condition)) return [];
  if (Array.isArray(condition.clauses)) return condition.clauses.flatMap(queueRefsFromCondition);
  const variable = clean(condition.variable || condition.token || condition.left);
  const queueMatch = variable.match(/^Queue\.([^.]+)\./i);
  return queueMatch ? [clean(queueMatch[1])] : [];
}

function nodeId(type, refId) {
  return `${type}:${refId || "derived"}`;
}

function edgeId(from, to, suffix = "") {
  return `edge:${from}->${to}${suffix ? `:${suffix}` : ""}`;
}

function layoutById(graph = {}) {
  return new Map((graph.nodes || []).map(node => [node.id, node]));
}

function withLayout(nodes, edges, graph = {}) {
  const stored = layoutById(graph);
  const byId = new Map(nodes.map(node => [node.id, node]));
  const incoming = new Map(nodes.map(node => [node.id, 0]));
  const outgoing = new Map(nodes.map(node => [node.id, []]));

  edges.forEach(edge => {
    if (!byId.has(edge.from) || !byId.has(edge.to)) return;
    incoming.set(edge.to, (incoming.get(edge.to) || 0) + 1);
    outgoing.get(edge.from).push(edge.to);
  });

  const roots = nodes
    .filter(node => node.type === VISUAL_NODE_TYPES.SOURCE || (incoming.get(node.id) || 0) === 0)
    .map(node => node.id);
  const queue = roots.length ? roots.map(id => ({ id, depth: 0 })) : nodes.slice(0, 1).map(node => ({ id: node.id, depth: 0 }));
  const depth = new Map();

  while (queue.length) {
    const current = queue.shift();
    if (depth.has(current.id) && depth.get(current.id) <= current.depth) continue;
    depth.set(current.id, current.depth);
    (outgoing.get(current.id) || []).forEach(nextId => queue.push({ id: nextId, depth: current.depth + 1 }));
  }

  nodes.forEach(node => {
    if (!depth.has(node.id)) depth.set(node.id, 0);
  });

  const rowsByDepth = new Map();
  return nodes.map(node => {
    const saved = stored.get(node.id);
    if (Number.isFinite(saved?.x) && Number.isFinite(saved?.y)) {
      return { ...node, x: saved.x, y: saved.y };
    }
    const d = depth.get(node.id) || 0;
    const row = rowsByDepth.get(d) || 0;
    rowsByDepth.set(d, row + 1);
    return {
      ...node,
      x: ORIGIN_X + d * NODE_SPACING_X,
      y: ORIGIN_Y + row * NODE_SPACING_Y,
    };
  });
}

export function deriveGraphFromModel(model = {}) {
  const bEvents = model.bEvents || [];
  const cEvents = model.cEvents || [];
  const queues = model.queues || [];
  const graph = model.graph || {};
  const nodes = [];
  const edges = [];
  const queueByName = new Map(queues.map(queue => [norm(queue.name), queue]));
  const queueNodeByName = new Map();
  const bEventById = new Map(bEvents.map(event => [event.id, event]));
  const sinkNodeByBEventId = new Map();

  queues.forEach(queue => {
    const id = nodeId(VISUAL_NODE_TYPES.QUEUE, queue.id || queue.name);
    queueNodeByName.set(norm(queue.name), id);
    nodes.push({
      id,
      type: VISUAL_NODE_TYPES.QUEUE,
      refId: queue.id || null,
      label: queue.name || "Queue",
      sublabel: queue.customerType ? `Accepts ${queue.customerType}` : "Queue",
    });
  });

  bEvents.forEach(event => {
    const calls = macroCalls(event.effect);
    calls.filter(call => call.macro === "ARRIVE").forEach((call, index) => {
      const customerType = call.args[0] || "Entity";
      const queueName = call.args[1] || customerType;
      const id = nodeId(VISUAL_NODE_TYPES.SOURCE, `${event.id || event.name}-${index}`);
      const targetQueueId = queueNodeByName.get(norm(queueName));
      nodes.push({
        id,
        type: VISUAL_NODE_TYPES.SOURCE,
        refId: event.id || null,
        label: event.name || `${customerType} Arrival`,
        sublabel: `Adds ${customerType} to ${queueName}`,
      });
      if (targetQueueId) {
        edges.push({ id: edgeId(id, targetQueueId), from: id, to: targetQueueId, source: "arrival" });
      }
    });

    if (calls.some(call => call.macro === "COMPLETE" || call.macro === "RENEGE")) {
      const id = nodeId(VISUAL_NODE_TYPES.SINK, event.id || event.name);
      sinkNodeByBEventId.set(event.id, id);
      nodes.push({
        id,
        type: VISUAL_NODE_TYPES.SINK,
        refId: event.id || null,
        label: event.name || "Exit",
        sublabel: calls.some(call => call.macro === "RENEGE") ? "Reneging exit" : "Completion exit",
      });
    }
  });

  cEvents.forEach(event => {
    const id = nodeId(VISUAL_NODE_TYPES.ACTIVITY, event.id || event.name);
    const queueRefs = [
      ...queueRefsFromCondition(event.condition),
      ...macroCalls(event.effect)
        .filter(call => call.macro === "ASSIGN")
        .map(call => call.args[0])
        .filter(queueName => queueByName.has(norm(queueName))),
    ];
    const uniqueQueueRefs = [...new Set(queueRefs.map(clean).filter(Boolean))];

    nodes.push({
      id,
      type: VISUAL_NODE_TYPES.ACTIVITY,
      refId: event.id || null,
      label: event.name || "Activity",
      sublabel: `Priority ${event.priority || 1}`,
    });

    uniqueQueueRefs.forEach(queueName => {
      const queueNodeId = queueNodeByName.get(norm(queueName));
      if (queueNodeId) edges.push({ id: edgeId(queueNodeId, id), from: queueNodeId, to: id, source: "condition" });
    });

    (event.cSchedules || []).forEach(schedule => {
      const bEvent = bEventById.get(schedule.eventId);
      if (!bEvent) return;
      const calls = macroCalls(bEvent.effect);
      calls.forEach((call, index) => {
        if (call.macro === "RELEASE" && call.args[1]) {
          const nextQueueId = queueNodeByName.get(norm(call.args[1]));
          if (nextQueueId) edges.push({ id: edgeId(id, nextQueueId, `${schedule.eventId}-${index}`), from: id, to: nextQueueId, source: "routing" });
        }
        if (call.macro === "COMPLETE" || call.macro === "RENEGE") {
          const sinkId = sinkNodeByBEventId.get(bEvent.id);
          if (sinkId) edges.push({ id: edgeId(id, sinkId, `${schedule.eventId}-${index}`), from: id, to: sinkId, source: "terminal" });
        }
      });
    });
  });

  const dedupedNodes = [...new Map(nodes.map(node => [node.id, node])).values()];
  const dedupedEdges = [...new Map(edges.map(edge => [edge.id, edge])).values()];
  return {
    version: 1,
    nodes: withLayout(dedupedNodes, dedupedEdges, graph),
    edges: dedupedEdges,
    viewport: graph.viewport || { x: 0, y: 0, zoom: 1 },
  };
}

export function graphLayoutFromDerivedGraph(derivedGraph = {}) {
  return {
    version: 1,
    nodes: (derivedGraph.nodes || []).map(node => ({
      id: node.id,
      type: node.type,
      refId: node.refId || null,
      x: node.x,
      y: node.y,
    })),
    viewport: derivedGraph.viewport || { x: 0, y: 0, zoom: 1 },
  };
}
