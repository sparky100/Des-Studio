// visual-designer/graph.js — canonical model_json to visual graph helpers
//
// Graph topology is derived from the canonical DES model. Persisted
// model.graph data is used only for layout metadata such as node positions.

import dagre from "@dagrejs/dagre";

const NODE_WIDTH = 142;
const NODE_HEIGHT = 68;
const DAGRE_RANK_SEP = 50;   // gap between right edge of one rank and left edge of next
const DAGRE_NODE_SEP = 36;   // gap between nodes within the same rank
const DAGRE_MARGIN_X = 40;
const DAGRE_MARGIN_Y = 80;

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

  const g = new dagre.graphlib.Graph();
  g.setGraph({
    rankdir: "LR",
    ranksep: DAGRE_RANK_SEP,
    nodesep: DAGRE_NODE_SEP,
    marginx: DAGRE_MARGIN_X,
    marginy: DAGRE_MARGIN_Y,
    acyclicer: "greedy",
    ranker: "network-simplex",
  });
  g.setDefaultEdgeLabel(() => ({}));

  nodes.forEach(node => g.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT }));

  // Exclude loop (back) edges — dagre handles them poorly and they're
  // already styled separately in the renderer.
  edges.forEach(edge => {
    if (!edge.loop && g.hasNode(edge.from) && g.hasNode(edge.to)) {
      g.setEdge(edge.from, edge.to);
    }
  });

  dagre.layout(g);

  return nodes.map(node => {
    const saved = stored.get(node.id);
    if (Number.isFinite(saved?.x) && Number.isFinite(saved?.y)) {
      return { ...node, x: saved.x, y: saved.y };
    }
    const pos = g.node(node.id);
    return {
      ...node,
      x: pos ? Math.round(pos.x - NODE_WIDTH / 2) : DAGRE_MARGIN_X,
      y: pos ? Math.round(pos.y - NODE_HEIGHT / 2) : DAGRE_MARGIN_Y,
    };
  });
}

function conditionLabel(c, depth = 0) {
  if (!c) return "condition";
  if (typeof c === "string") return c;
  if (typeof c !== "object") return "condition";
  if ((c.operator === "AND" || c.operator === "OR") && Array.isArray(c.clauses) && depth === 0) {
    const parts = c.clauses.map(cl => conditionLabel(cl, 1)).filter(p => p !== "condition");
    return parts.length ? parts.join(` ${c.operator} `) : "condition";
  }
  const rawVar  = clean(c.variable || c.left || c.token || "");
  // Strip "Entity." / "entity." prefix so "Entity.severity" → "severity"
  const variable = rawVar.replace(/^entity\./i, "");
  const op       = clean(c.operator || c.op || "");
  const value    = c.value !== undefined ? c.value : c.right;
  return variable && op && value !== undefined ? `${variable} ${op} ${value}`
       : variable && value !== undefined       ? `${variable} = ${value}`
       : "condition";
}

export function deriveGraphFromModel(model = {}) {
  const bEvents = model.bEvents || [];
  const cEvents = model.cEvents || [];
  const queues = model.queues || [];
  const dataSources = model.dataSources || [];
  const sections = model.sections || [];
  const graph = model.graph || {};

  // Build a lookup: element id → { sectionId, sectionColor }
  const sectionByElemId = new Map();
  sections.forEach(sec => {
    (sec.memberIds || []).forEach(id => {
      sectionByElemId.set(id, { sectionId: sec.id, sectionColor: sec.color });
    });
  });
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
        nodes.push({ id: exitId, type: VISUAL_NODE_TYPES.SINK, refId: null, label: queue.name ? `${queue.name} Overflow` : "Exit", sublabel: "Overflow exit" });
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
    const effectCalls = macroCalls(event.effect);
    const isDelay = effectCalls.some(c => c.macro === "DELAY");
    const queueRefs = [
      ...queueRefsFromCondition(event.condition),
      // Both ASSIGN(Queue, Server) and DELAY(Queue) carry the source queue as args[0]
      ...effectCalls
        .filter(call => call.macro === "ASSIGN" || call.macro === "DELAY")
        .map(call => call.args[0])
        .filter(queueName => queueName && queueByName.has(norm(queueName))),
    ];
    const uniqueQueueRefs = [...new Set(queueRefs.map(clean).filter(Boolean))];

    const hasWhen = (event.cSchedules || []).some(cs => cs.when);
    nodes.push({
      id,
      type: VISUAL_NODE_TYPES.ACTIVITY,
      refId: event.id || null,
      label: event.name || "Activity",
      sublabel: isDelay ? `Delay · Priority ${event.priority || 1}` : `Priority ${event.priority || 1}`,
      badges: hasWhen ? ["when"] : [],
    });

    uniqueQueueRefs.forEach(queueName => {
      const queueNodeId = queueNodeByName.get(norm(queueName));
      if (queueNodeId) edges.push({ id: edgeId(queueNodeId, id), from: queueNodeId, to: id, source: "condition" });
    });

    (event.cSchedules || []).forEach(schedule => {
      const bEvent = bEventById.get(schedule.eventId);
      if (!bEvent) return;

      // Helper: get or create a Sink node for null-queueName routing branches.
      // Prefers the existing COMPLETE/RENEGE sink for this bEvent so that the
      // labeled routing edge and the COMPLETE edge point to the same node,
      // preventing an unlabeled COMPLETE edge from rendering on top and hiding
      // the probability/condition label.
      const getExitSinkId = () => {
        const existing = sinkNodeByBEventId.get(bEvent.id);
        if (existing) return existing;
        const syntheticId = `sink:exit-${bEvent.id}`;
        if (!nodes.find(n => n.id === syntheticId)) {
          nodes.push({
            id: syntheticId,
            type: VISUAL_NODE_TYPES.SINK,
            refId: `route-exit:${bEvent.id || bEvent.name || "unknown"}`,
            label: bEvent.name || "Exit",
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
              const c = branch.condition;
              const condLabel = conditionLabel(c);
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
              // bEventId/branchIndex/probability let the canvas edit this branch's
              // probability in place without re-parsing it back out of the label.
              if (!branch.queueName) {
                // null queueName = exit system → synthetic Sink
                const sinkId = getExitSinkId();
                edges.push({ id: edgeId(id, sinkId, `${schedule.eventId}-${index}-${branchIdx}`), from: id, to: sinkId, source: "terminal", label: probLabel, bEventId: bEvent.id, branchIndex: branchIdx, probability: branch.probability ?? 0 });
              } else {
                const nextQueueId = queueNodeByName.get(norm(branch.queueName));
                if (nextQueueId) edges.push({ id: edgeId(id, nextQueueId, `${schedule.eventId}-${index}-${branchIdx}`), from: id, to: nextQueueId, source: "routing", label: probLabel, bEventId: bEvent.id, branchIndex: branchIdx, probability: branch.probability ?? 0 });
              }
            });

          // Single fixed RELEASE(Server, Queue)
          } else if (call.args[1]) {
            const nextQueueId = queueNodeByName.get(norm(call.args[1]));
            if (nextQueueId) edges.push({ id: edgeId(id, nextQueueId, `${schedule.eventId}-${index}`), from: id, to: nextQueueId, source: "routing" });
          }
        }
        if (call.macro === "COMPLETE" || call.macro === "RENEGE") {
          // Skip the unlabeled COMPLETE edge when routing already handles all exits
          // via labeled branches (null queueName). The routing edges already point to
          // the same sink node (via getExitSinkId above), so a second unlabeled edge
          // would render on top and hide the routing label.
          const routingHandlesExit =
            (Array.isArray(bEvent.probabilisticRouting) && bEvent.probabilisticRouting.some(b => !b.queueName)) ||
            (Array.isArray(bEvent.routing) && bEvent.routing.some(b => !b.queueName));
          if (!routingHandlesExit) {
            const sinkId = sinkNodeByBEventId.get(bEvent.id);
            if (sinkId) edges.push({ id: edgeId(id, sinkId, `${schedule.eventId}-${index}`), from: id, to: sinkId, source: "terminal" });
          }
        }
      });

      // ── DELAY completion: B-events with no RELEASE but with routing or COMPLETE ──
      // Standard RELEASE routing is handled inside the calls.forEach above. For DELAY
      // completion B-events the effect has no RELEASE, so we process their routing here.
      const hasRelease = calls.some(c => c.macro === "RELEASE");
      if (!hasRelease) {
        if (Array.isArray(bEvent.routing) && bEvent.routing.length > 0) {
          bEvent.routing.forEach((branch, branchIdx) => {
            const condLabel = conditionLabel(branch.condition);
            if (!branch.queueName) {
              const sinkId = getExitSinkId();
              edges.push({ id: edgeId(id, sinkId, `${schedule.eventId}-dr-${branchIdx}`), from: id, to: sinkId, source: "terminal", label: condLabel });
            } else {
              const nextQueueId = queueNodeByName.get(norm(branch.queueName));
              if (nextQueueId) edges.push({ id: edgeId(id, nextQueueId, `${schedule.eventId}-dr-${branchIdx}`), from: id, to: nextQueueId, source: "routing", label: condLabel });
            }
          });
          if (bEvent.defaultQueueName) {
            const defQueueId = queueNodeByName.get(norm(bEvent.defaultQueueName));
            if (defQueueId) edges.push({ id: edgeId(id, defQueueId, `${schedule.eventId}-dr-default`), from: id, to: defQueueId, source: "routing", label: "fallback" });
          } else if (bEvent.defaultQueueName === null) {
            const sinkId = getExitSinkId();
            edges.push({ id: edgeId(id, sinkId, `${schedule.eventId}-dr-default`), from: id, to: sinkId, source: "terminal", label: "default" });
          }
        } else if (Array.isArray(bEvent.probabilisticRouting) && bEvent.probabilisticRouting.length > 0) {
          bEvent.probabilisticRouting.forEach((branch, branchIdx) => {
            const probLabel = `${Math.round((branch.probability ?? 0) * 100)}%`;
            if (!branch.queueName) {
              const sinkId = getExitSinkId();
              edges.push({ id: edgeId(id, sinkId, `${schedule.eventId}-dp-${branchIdx}`), from: id, to: sinkId, source: "terminal", label: probLabel, bEventId: bEvent.id, branchIndex: branchIdx, probability: branch.probability ?? 0 });
            } else {
              const nextQueueId = queueNodeByName.get(norm(branch.queueName));
              if (nextQueueId) edges.push({ id: edgeId(id, nextQueueId, `${schedule.eventId}-dp-${branchIdx}`), from: id, to: nextQueueId, source: "routing", label: probLabel, bEventId: bEvent.id, branchIndex: branchIdx, probability: branch.probability ?? 0 });
            }
          });
        } else {
          // No routing — just COMPLETE/RENEGE on the B-event itself
          const sinkId = sinkNodeByBEventId.get(bEvent.id);
          if (sinkId) edges.push({ id: edgeId(id, sinkId, `${schedule.eventId}-dc`), from: id, to: sinkId, source: "terminal" });
        }
      }
    });
  });

  const dedupedNodes = [...new Map(nodes.map(node => [node.id, node])).values()]
    .map(node => {
      const sec = node.refId ? sectionByElemId.get(node.refId) : null;
      return sec ? { ...node, sectionId: sec.sectionId, sectionColor: sec.sectionColor } : node;
    });
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

  const layoutedNodes = withLayout(dedupedNodes, dedupedEdges, graph);

  // Compute bounding-box panel metadata for each section that has placed members.
  const SECTION_PAD = 24;
  const SECTION_LABEL_H = 22;
  const sectionPanels = sections.map(sec => {
    const members = layoutedNodes.filter(n => n.sectionId === sec.id);
    if (!members.length) return null;
    const minX = Math.min(...members.map(n => n.x));
    const minY = Math.min(...members.map(n => n.y));
    const maxX = Math.max(...members.map(n => n.x + NODE_WIDTH));
    const maxY = Math.max(...members.map(n => n.y + NODE_HEIGHT));
    return {
      id: `section-panel:${sec.id}`,
      sectionId: sec.id,
      name: sec.name || sec.id,
      color: sec.color || "#888",
      x: minX - SECTION_PAD,
      y: minY - SECTION_PAD - SECTION_LABEL_H,
      width: (maxX - minX) + SECTION_PAD * 2,
      height: (maxY - minY) + SECTION_PAD * 2 + SECTION_LABEL_H,
    };
  }).filter(Boolean);

  return {
    version: 1,
    nodes: layoutedNodes,
    edges: dedupedEdges,
    viewport: graph.viewport || { x: 0, y: 0, zoom: 1 },
    sectionPanels,
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

export async function exportCanvasToPng(fitViewFn) {
  try {
    if (typeof fitViewFn === 'function') {
      fitViewFn();
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    }
    const el = document.querySelector('.react-flow');
    if (!el) return null;
    const { toPng } = await import('html-to-image');
    return await toPng(el, {
      pixelRatio: 2,
      backgroundColor: '#ffffff',
      filter: node =>
        !node.classList?.contains('react-flow__controls') &&
        !node.classList?.contains('react-flow__minimap') &&
        !node.classList?.contains('react-flow__background') &&
        !node.getAttribute?.('data-id')?.startsWith('section-'),
    });
  } catch (err) {
    console.warn('[simmodlr] Canvas export failed:', err);
    return null;
  }
}

export async function getModelImageDataUrl() {
  return exportCanvasToPng();
}
