// visual-designer/graph.js — canonical model_json to visual graph helpers
//
// Graph topology is derived from the canonical DES model. Persisted
// model.graph data is used only for layout metadata such as node positions.

const NODE_SPACING_X = 200;
const NODE_SPACING_Y = 112;
const ORIGIN_X = 40;
const ORIGIN_Y = 96;

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
  const dataSources = model.dataSources || [];
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
    const cap = queue.capacity ? parseInt(queue.capacity, 10) : null;
    nodes.push({
      id,
      type: VISUAL_NODE_TYPES.QUEUE,
      refId: queue.id || null,
      label: queue.name || "Queue",
      sublabel: queue.customerType ? `Accepts ${queue.customerType}` : "Queue",
      capacity: Number.isFinite(cap) && cap > 0 ? cap : null,
    });
  });

  // F11.5: derive overflow edges from queues that have overflowDestination or capacity
  queues.forEach(queue => {
    if (!queue.overflowDestination && !queue.capacity) return;
    const fromId = queueNodeByName.get(norm(queue.name));
    if (!fromId) return;
    if (queue.overflowDestination) {
      const toId = queueNodeByName.get(norm(queue.overflowDestination));
      if (toId && toId !== fromId) {
        edges.push({ id: edgeId(fromId, toId, "overflow"), from: fromId, to: toId, source: "overflow", label: "overflow" });
      }
    } else if (queue.capacity) {
      // capacity set but no overflow destination — show an exit sink
      const exitId = `sink:overflow-exit-${queue.id || queue.name}`;
      if (!nodes.find(n => n.id === exitId)) {
        nodes.push({ id: exitId, type: VISUAL_NODE_TYPES.SINK, refId: null, label: "Exit", sublabel: "Overflow exit" });
      }
      edges.push({ id: edgeId(fromId, exitId, "overflow"), from: fromId, to: exitId, source: "overflow", label: "overflow" });
    }
  });

  bEvents.forEach(event => {
    const calls = macroCalls(event.effect);
    calls.filter(call => call.macro === "ARRIVE").forEach((call, index) => {
      const customerType = call.args[0] || "Entity";
      const queueName = call.args[1] || customerType;
      const id = nodeId(VISUAL_NODE_TYPES.SOURCE, `${event.id || event.name}-${index}`);
      const targetQueueId = queueNodeByName.get(norm(queueName));
      const hasFeed = dataSources.some(ds => ds.type === "scheduleFeed" && ds.targetBEventId === event.id);
      nodes.push({
        id,
        type: VISUAL_NODE_TYPES.SOURCE,
        refId: event.id || null,
        label: event.name || `${customerType} Arrival`,
        sublabel: `Adds ${customerType} to ${queueName}`,
        badges: hasFeed ? ["feed"] : [],
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

    const hasWhen = (event.cSchedules || []).some(cs => cs.when);
    nodes.push({
      id,
      type: VISUAL_NODE_TYPES.ACTIVITY,
      refId: event.id || null,
      label: event.name || "Activity",
      sublabel: `Priority ${event.priority || 1}`,
      badges: hasWhen ? ["when"] : [],
    });

    uniqueQueueRefs.forEach(queueName => {
      const queueNodeId = queueNodeByName.get(norm(queueName));
      if (queueNodeId) edges.push({ id: edgeId(queueNodeId, id), from: queueNodeId, to: id, source: "condition" });
    });

    (event.cSchedules || []).forEach(schedule => {
      const bEvent = bEventById.get(schedule.eventId);
      if (!bEvent) return;

      // Helper: get or create a synthetic Sink node for null-queueName routing branches
      const getExitSinkId = () => {
        const syntheticId = `sink:exit-${bEvent.id}`;
        if (!nodes.find(n => n.id === syntheticId)) {
          nodes.push({
            id: syntheticId,
            type: VISUAL_NODE_TYPES.SINK,
            refId: null,
            label: "Exit",
            sublabel: "Direct exit",
          });
        }
        return syntheticId;
      };

      const calls = macroCalls(bEvent.effect);
      calls.forEach((call, index) => {
        if (call.macro === "RELEASE") {
          // Conditional routing table (F10.1)
          if (Array.isArray(bEvent.routing) && bEvent.routing.length > 0) {
            bEvent.routing.forEach((branch, branchIdx) => {
              const condLabel = branch.condition
                ? `${branch.condition.variable} ${branch.condition.operator} ${branch.condition.value}`
                : "condition";
              if (!branch.queueName) {
                // null queueName = exit system → derive edge to synthetic Sink
                const sinkId = getExitSinkId();
                edges.push({ id: edgeId(id, sinkId, `${schedule.eventId}-${index}-${branchIdx}`), from: id, to: sinkId, source: "terminal", label: condLabel });
              } else {
                const nextQueueId = queueNodeByName.get(norm(branch.queueName));
                if (nextQueueId) edges.push({ id: edgeId(id, nextQueueId, `${schedule.eventId}-${index}-${branchIdx}`), from: id, to: nextQueueId, source: "routing", label: condLabel });
              }
            });
            if (bEvent.defaultQueueName) {
              const defQueueId = queueNodeByName.get(norm(bEvent.defaultQueueName));
              if (defQueueId) edges.push({ id: edgeId(id, defQueueId, `${schedule.eventId}-${index}-default`), from: id, to: defQueueId, source: "routing", label: "fallback" });
            }

          // Probabilistic routing table (F10.2)
          } else if (Array.isArray(bEvent.probabilisticRouting) && bEvent.probabilisticRouting.length > 0) {
            bEvent.probabilisticRouting.forEach((branch, branchIdx) => {
              const probLabel = `${Math.round((branch.probability ?? 0) * 100)}%`;
              if (!branch.queueName) {
                // null queueName = exit system → synthetic Sink
                const sinkId = getExitSinkId();
                edges.push({ id: edgeId(id, sinkId, `${schedule.eventId}-${index}-${branchIdx}`), from: id, to: sinkId, source: "terminal", label: probLabel });
              } else {
                const nextQueueId = queueNodeByName.get(norm(branch.queueName));
                if (nextQueueId) edges.push({ id: edgeId(id, nextQueueId, `${schedule.eventId}-${index}-${branchIdx}`), from: id, to: nextQueueId, source: "routing", label: probLabel });
              }
            });

          // Single fixed RELEASE(Server, Queue)
          } else if (call.args[1]) {
            const nextQueueId = queueNodeByName.get(norm(call.args[1]));
            if (nextQueueId) edges.push({ id: edgeId(id, nextQueueId, `${schedule.eventId}-${index}`), from: id, to: nextQueueId, source: "routing" });
          }
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
  const nodeTypeById = new Map(dedupedNodes.map(n => [n.id, n.type]));

  // ── Back-edge auto-detection (F12.6) ───────────────────────────────────────
  // An Activity → Queue edge is a back-edge if there's already a path
  // from that Queue to that Activity through other edges.
  function pathExists(edgeList, from, to, excludeIdx) {
    const adj = new Map();
    edgeList.forEach((e, idx) => {
      if (idx === excludeIdx) return;
      if (!adj.has(e.from)) adj.set(e.from, []);
      adj.get(e.from).push(e.to);
    });
    const seen = new Set();
    const stack = [from];
    while (stack.length) {
      const current = stack.pop();
      if (current === to) return true;
      if (seen.has(current)) continue;
      seen.add(current);
      (adj.get(current) || []).forEach(next => stack.push(next));
    }
    return false;
  }

  dedupedEdges.forEach((edge, idx) => {
    if (nodeTypeById.get(edge.from) === VISUAL_NODE_TYPES.ACTIVITY &&
        nodeTypeById.get(edge.to) === VISUAL_NODE_TYPES.QUEUE &&
        !edge.loop &&
        edge.source !== "overflow") {
      if (pathExists(dedupedEdges, edge.to, edge.from, idx)) {
        edge.loop = true;
        edge.maxLoopCount = 3;
        edge.exitQueueName = null;
      }
    }
  });

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

export async function exportCanvasToPng() {
  try {
    const el = document.querySelector('.react-flow__renderer');
    if (!el) return null;
    const html2canvas = (await import('html2canvas')).default;
    const canvas = await html2canvas(el, { backgroundColor: '#ffffff', scale: 2 });
    return canvas.toDataURL('image/png');
  } catch (err) {
    console.warn('[DES Studio] Canvas export failed:', err);
    return null;
  }
}

export async function getModelImageDataUrl() {
  return exportCanvasToPng();
}
