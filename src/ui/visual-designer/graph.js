// visual-designer/graph.js — canonical model_json to visual graph helpers
//
// Graph topology is derived from the canonical DES model. Persisted
// model.graph data is used only for layout metadata such as node positions.

import dagre from "@dagrejs/dagre";
import { clean, effectText, macroCalls } from "../../model/macroParser.js";
import { extractQueueNamesFromCondition } from "../../model/conditionFormat.js";
// Pure constants module (imports only dagre) — safe to share with Draw per
// ADR-020: no Execute *components* cross into the designer.
import { EXEC_CARD_WIDTH, EXEC_NODE_HEIGHT, EXEC_DEFAULT_HEIGHT } from "../execute/executeLayout.js";

export const NODE_WIDTH = 142;
export const NODE_HEIGHT = 68;
export const ALIGN_GAP = 48;   // gap between a selected node and a newly palette-added node
const DAGRE_RANK_SEP = 50;   // gap between right edge of one rank and left edge of next
const DAGRE_NODE_SEP = 36;   // gap between nodes within the same rank
const DAGRE_MARGIN_X = 40;
const DAGRE_MARGIN_Y = 80;

export const VISUAL_NODE_TYPES = {
  SOURCE: "source",
  QUEUE: "queue",
  ACTIVITY: "activity",
  SINK: "sink",
  CONTAINER: "container",
};

// True for an edge representing one of an Activity's outgoing routes (a plain
// single-destination completion, or one branch of a routing/probabilisticRouting
// array) — the kind of edge whose conditions/probability the RouteEdgeDialog can
// edit. Shared by FlowDiagramReactFlow (to suppress the inline delete button,
// since the dialog owns deletion for these) and VisualDesignerPanel (to decide
// whether a click should open the dialog) so the two checks can't drift apart.
export function isActivityRouteEdge(edge, fromNodeType) {
  return fromNodeType === VISUAL_NODE_TYPES.ACTIVITY && (edge?.source === "routing" || edge?.source === "terminal");
}

function norm(value = "") {
  return clean(value).toLowerCase();
}

function nodeId(type, refId) {
  return `${type}:${refId || "derived"}`;
}

function edgeId(from, to, suffix = "") {
  return `edge:${from}->${to}${suffix ? `:${suffix}` : ""}`;
}

// COMPLETE/FINISH end an entity's service normally; RENEGE/RENEGE_OLDEST end it
// via abandonment (finishServiceForPair is the shared engine implementation for
// COMPLETE/FINISH). Centralized here so bEvents.forEach's sink creation and the
// cSchedules terminal-edge derivation below can't drift on which macros count
// as "exit" vs "reneging".
function isCompletionOrRenegeMacro(macro) {
  return macro === "COMPLETE" || macro === "RENEGE" || macro === "FINISH" || macro === "RENEGE_OLDEST";
}
function isRenegeMacro(macro) {
  return macro === "RENEGE" || macro === "RENEGE_OLDEST";
}

function layoutById(graph = {}) {
  return new Map((graph.nodes || []).map(node => [node.id, node]));
}

// Dagre reserves a box per node sized to whichever canvas renders it larger —
// Draw's uniform NODE_WIDTH x NODE_HEIGHT or the Run canvas's bigger cards
// (EXEC_CARD_WIDTH wide, per-type heights). Both canvases anchor cards at the
// same top-left x/y, so auto-laid nodes (imported/AI-generated models,
// "Layout" reset) can never overlap on either canvas.
function layoutBoxSize(type) {
  return {
    width: Math.max(NODE_WIDTH, EXEC_CARD_WIDTH),
    height: Math.max(NODE_HEIGHT, EXEC_NODE_HEIGHT[type] ?? EXEC_DEFAULT_HEIGHT),
  };
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

  nodes.forEach(node => g.setNode(node.id, layoutBoxSize(node.type)));

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
    const box = layoutBoxSize(node.type);
    return {
      ...node,
      x: pos ? Math.round(pos.x - box.width / 2) : DAGRE_MARGIN_X,
      y: pos ? Math.round(pos.y - box.height / 2) : DAGRE_MARGIN_Y,
    };
  });
}

export function conditionLabel(c, depth = 0) {
  if (!c) return "condition";
  if (typeof c === "string") return c;
  if (typeof c !== "object") return "condition";
  if ((c.operator === "AND" || c.operator === "OR") && Array.isArray(c.clauses) && depth === 0) {
    const parts = c.clauses.map(cl => conditionLabel(cl, 1)).filter(p => p !== "condition");
    return parts.length ? parts.join(` ${c.operator} `) : "condition";
  }
  const rawVar  = clean(c.variable || "");
  // Strip "Entity." / "entity." prefix so "Entity.severity" → "severity"
  const variable = rawVar.replace(/^entity\./i, "");
  const op       = clean(c.operator || c.op || "");
  const value    = c.value;
  return variable && op && value !== undefined ? `${variable} ${op} ${value}`
       : variable && value !== undefined       ? `${variable} = ${value}`
       : "condition";
}

export function deriveGraphFromModel(model = {}) {
  const bEvents = model.bEvents || [];
  const cEvents = model.cEvents || [];
  const queues = model.queues || [];
  const containerTypes = model.containerTypes || [];
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

    if (calls.some(call => isCompletionOrRenegeMacro(call.macro))) {
      const id = nodeId(VISUAL_NODE_TYPES.SINK, event.id || event.name);
      sinkNodeByBEventId.set(event.id, id);
      nodes.push({
        id,
        type: VISUAL_NODE_TYPES.SINK,
        refId: event.id || null,
        label: event.name || "Exit",
        sublabel: calls.some(call => isRenegeMacro(call.macro)) ? "Reneging exit" : "Completion exit",
      });
    }
  });

  cEvents.forEach(event => {
    const id = nodeId(VISUAL_NODE_TYPES.ACTIVITY, event.id || event.name);
    const effectCalls = macroCalls(event.effect);
    const isDelay = effectCalls.some(c => c.macro === "DELAY");
    const queueRefs = [
      ...extractQueueNamesFromCondition(event.condition),
      // ASSIGN/DELAY/JOIN/COSEIZE/BATCH all carry their source queue as args[0].
      // JOIN and BATCH previously only picked up an incoming edge "by accident"
      // when the condition text happened to repeat the same queue name — a
      // condition that omits it silently dropped the edge.
      ...effectCalls
        .filter(call => ["ASSIGN", "DELAY", "JOIN", "COSEIZE", "BATCH"].includes(call.macro))
        .map(call => call.args[0])
        .filter(queueName => queueName && queueByName.has(norm(queueName))),
      // MATCH consumes from two source queues at args[1] and args[3] — args[0]/
      // args[2] are entity type names, not queues.
      ...effectCalls
        .filter(call => call.macro === "MATCH")
        .flatMap(call => [call.args[1], call.args[3]])
        .filter(queueName => queueName && queueByName.has(norm(queueName))),
    ];
    const uniqueQueueRefs = [...new Set(queueRefs.map(clean).filter(Boolean))];

    const hasWhen = (event.cSchedules || []).some(cs => cs.when);
    const serverNames = [...new Set(
      effectCalls
        .filter(call => call.macro === "ASSIGN" || call.macro === "COSEIZE")
        .flatMap(call => call.args.slice(1))
        .map(clean)
        .filter(Boolean)
    )];
    nodes.push({
      id,
      type: VISUAL_NODE_TYPES.ACTIVITY,
      refId: event.id || null,
      label: event.name || "Activity",
      sublabel: isDelay
        ? `Delay · Priority ${event.priority || 1}`
        : serverNames.length
          ? `${serverNames.join(", ")} · Priority ${event.priority || 1}`
          : `Priority ${event.priority || 1}`,
      badges: hasWhen ? ["when"] : [],
    });

    uniqueQueueRefs.forEach(queueName => {
      const queueNodeId = queueNodeByName.get(norm(queueName));
      if (queueNodeId) edges.push({ id: edgeId(queueNodeId, id), from: queueNodeId, to: id, source: "condition" });
    });

    // JOIN(SourceQueue, TargetQueue) and MATCH(..., TargetQueue[, predicate]) live
    // on the C-event's OWN effect — their outgoing "merged destination" edge has
    // to be derived here, next to the incoming queueRefs above.
    effectCalls
      .filter(call => call.macro === "JOIN" || call.macro === "MATCH")
      .forEach(call => {
        const targetQueue = call.macro === "JOIN" ? call.args[1] : call.args[4];
        const targetQueueId = targetQueue && queueNodeByName.get(norm(targetQueue));
        if (targetQueueId) {
          edges.push({
            id: edgeId(id, targetQueueId, call.macro === "JOIN" ? "join" : "match"),
            from: id, to: targetQueueId, source: "routing",
          });
        }
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
        if (call.macro === "RELEASE" || call.macro === "RELEASE_COSEIZED") {
          // Conditional routing table (F10.1)
          if (Array.isArray(bEvent.routing) && bEvent.routing.length > 0) {
            bEvent.routing.forEach((branch, branchIdx) => {
              const c = branch.condition;
              const condLabel = conditionLabel(c);
              if (!branch.queueName) {
                // null queueName = exit system → derive edge to synthetic Sink
                const sinkId = getExitSinkId();
                edges.push({ id: edgeId(id, sinkId, `${schedule.eventId}-${index}-${branchIdx}`), from: id, to: sinkId, source: "terminal", label: condLabel, bEventId: bEvent.id, branchIndex: branchIdx });
              } else {
                const nextQueueId = queueNodeByName.get(norm(branch.queueName));
                if (nextQueueId) edges.push({ id: edgeId(id, nextQueueId, `${schedule.eventId}-${index}-${branchIdx}`), from: id, to: nextQueueId, source: "routing", label: condLabel, bEventId: bEvent.id, branchIndex: branchIdx });
              }
            });
            if (bEvent.defaultQueueName) {
              const defQueueId = queueNodeByName.get(norm(bEvent.defaultQueueName));
              if (defQueueId) edges.push({ id: edgeId(id, defQueueId, `${schedule.eventId}-${index}-default`), from: id, to: defQueueId, source: "routing", label: "fallback" });
            } else if (bEvent.defaultQueueName === null) {
              // Explicit "exit system" default (F10.1) — mirrors the DELAY-completion path below.
              const sinkId = getExitSinkId();
              edges.push({ id: edgeId(id, sinkId, `${schedule.eventId}-${index}-default`), from: id, to: sinkId, source: "terminal", label: "default" });
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

          // Single fixed RELEASE(Server, Queue) / RELEASE_COSEIZED([Type1, Type2, ...], Queue)
          } else {
            // RELEASE_COSEIZED's bracketed type list contains commas, which
            // macroCalls' naive comma-split breaks apart — call.args[1] would
            // be the second bracketed type, not the target queue. Re-extract
            // the trailing queue argument straight from the raw effect text.
            const targetQueue = call.macro === "RELEASE_COSEIZED"
              ? effectText(bEvent.effect).match(/RELEASE_COSEIZED\s*\(\s*\[[^\]]+\]\s*,\s*([^,)]+)\)/i)?.[1]?.trim()
              : call.args[1];
            if (targetQueue) {
              const nextQueueId = queueNodeByName.get(norm(targetQueue));
              if (nextQueueId) edges.push({ id: edgeId(id, nextQueueId, `${schedule.eventId}-${index}`), from: id, to: nextQueueId, source: "routing" });
            }
          }
        }
        if (isCompletionOrRenegeMacro(call.macro)) {
          // When the BEvent has a RELEASE macro, add the terminal edge here
          // because the DELAY/no-RELEASE section below won't run.
          // When the BEvent has no RELEASE, the DELAY section handles this
          // edge — skip here to prevent a duplicate.
          const hasRelease = calls.some(c => c.macro === "RELEASE" || c.macro === "RELEASE_COSEIZED");
          if (!hasRelease) return;
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
        // SPLIT(EntityType, N, TargetQueue): destination for the *cloned* entities only.
        if (call.macro === "SPLIT") {
          const targetQueue = call.args[2];
          const targetQueueId = targetQueue && queueNodeByName.get(norm(targetQueue));
          if (targetQueueId) {
            edges.push({ id: edgeId(id, targetQueueId, `${schedule.eventId}-${index}-split`), from: id, to: targetQueueId, source: "routing" });
          }
        }
        // UNBATCH(TargetQueue): destination for each restored child entity.
        if (call.macro === "UNBATCH") {
          const targetQueue = call.args[0];
          const targetQueueId = targetQueue && queueNodeByName.get(norm(targetQueue));
          if (targetQueueId) {
            edges.push({ id: edgeId(id, targetQueueId, `${schedule.eventId}-${index}-unbatch`), from: id, to: targetQueueId, source: "routing" });
          }
        }
      });

      // Loop-exit routing (loopConfig.exitQueueName): after maxLoopCount passes
      // through the normal routing/probabilisticRouting target, the entity is
      // instead sent to exitQueueName. This is a distinct destination the
      // calls.forEach loop above never inspects, so without this the exit
      // queue gets no incoming edge at all — same symptom as an unrecognized
      // release macro, but from a different, orthogonal model field.
      if (bEvent.loopConfig?.exitQueueName) {
        const exitQueueId = queueNodeByName.get(norm(bEvent.loopConfig.exitQueueName));
        if (exitQueueId) {
          edges.push({
            id: edgeId(id, exitQueueId, `${schedule.eventId}-loopexit`),
            from: id, to: exitQueueId, source: "routing",
            label: `after ${bEvent.loopConfig.maxLoopCount ?? "N"}×`,
          });
        }
      }

      // ── DELAY completion: B-events with no RELEASE but with routing or COMPLETE ──
      // Standard RELEASE routing is handled inside the calls.forEach above. For DELAY
      // completion B-events the effect has no RELEASE, so we process their routing here.
      const hasRelease = calls.some(c => c.macro === "RELEASE" || c.macro === "RELEASE_COSEIZED");
      if (!hasRelease) {
        if (Array.isArray(bEvent.routing) && bEvent.routing.length > 0) {
          bEvent.routing.forEach((branch, branchIdx) => {
            const condLabel = conditionLabel(branch.condition);
            if (!branch.queueName) {
              const sinkId = getExitSinkId();
              edges.push({ id: edgeId(id, sinkId, `${schedule.eventId}-dr-${branchIdx}`), from: id, to: sinkId, source: "terminal", label: condLabel, bEventId: bEvent.id, branchIndex: branchIdx });
            } else {
              const nextQueueId = queueNodeByName.get(norm(branch.queueName));
              if (nextQueueId) edges.push({ id: edgeId(id, nextQueueId, `${schedule.eventId}-dr-${branchIdx}`), from: id, to: nextQueueId, source: "routing", label: condLabel, bEventId: bEvent.id, branchIndex: branchIdx });
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

  containerTypes.forEach(ct => {
    const id = ct.id?.trim();
    if (!id) return;
    nodes.push({
      id: nodeId(VISUAL_NODE_TYPES.CONTAINER, id),
      type: VISUAL_NODE_TYPES.CONTAINER,
      refId: id,
      label: id,
      sublabel: ct.capacity != null && ct.capacity !== "" ? `cap ${ct.capacity}` : "unbounded",
      ...sectionByElemId.get(id),
    });
  });

  const dedupedNodes = [...new Map(nodes.map(node => [node.id, node])).values()]
    .map(node => {
      // Direct-exit sinks carry a `route-exit:<bEventId>` refId (see getExitSinkId
      // above) — strip that prefix so they resolve against the same memberId the
      // section actually stores (the raw bEvent id), matching VisualNodeInspector's
      // currentSectionId lookup.
      const elemId = node.refId?.startsWith("route-exit:") ? node.refId.slice("route-exit:".length) : node.refId;
      const sec = elemId ? sectionByElemId.get(elemId) : null;
      return sec ? { ...node, sectionId: sec.sectionId, sectionColor: sec.sectionColor } : node;
    });
  const dedupedEdges = [...new Map(edges.map(edge => [edge.id, edge])).values()];
  const nodeTypeById = new Map(dedupedNodes.map(n => [n.id, n.type]));

  // ── Back-edge auto-detection (F12.6) ───────────────────────────────────────
  // DFS with white/gray/black node coloring (CLRS-style back-edge detection).
  // An edge to a GRAY node — an ancestor still on the current DFS stack — is a
  // genuine back edge that closes a cycle back to that ancestor. An edge to a
  // BLACK node (already fully explored, NOT an ancestor) is a cross/forward
  // edge: it can look identical to a back edge in isolation, but it does not
  // close a cycle, so it must never be marked. A naive "does a reverse path
  // exist" check can't distinguish these: it would evaluate each Activity→Queue
  // edge in isolation, so any cycle ANYWHERE in the graph would cause every
  // edge lying on that cycle to be marked — not just the one edge that
  // actually closes it — and a converging DAG (e.g. two activities feeding one
  // downstream queue) could be falsely flagged if an unrelated cycle existed
  // elsewhere in the model.
  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map(dedupedNodes.map(n => [n.id, WHITE]));
  const adjacency = new Map();
  dedupedEdges.forEach(edge => {
    if (!adjacency.has(edge.from)) adjacency.set(edge.from, []);
    adjacency.get(edge.from).push(edge);
  });

  function visit(nodeId) {
    color.set(nodeId, GRAY);
    for (const edge of adjacency.get(nodeId) || []) {
      const targetColor = color.get(edge.to);
      if (targetColor === GRAY) {
        // Genuine back edge. Only Activity→Queue edges (excluding overflow)
        // are eligible for the loop:true treatment.
        if (nodeTypeById.get(edge.from) === VISUAL_NODE_TYPES.ACTIVITY &&
            nodeTypeById.get(edge.to) === VISUAL_NODE_TYPES.QUEUE &&
            edge.source !== "overflow") {
          edge.loop = true;
          edge.maxLoopCount = 3;
          edge.exitQueueName = null;
        }
        continue; // never re-descend into a node still on the stack
      }
      if (targetColor === WHITE) visit(edge.to);
      // BLACK → cross/forward edge, already fully explored: never marked.
    }
    color.set(nodeId, BLACK);
  }

  // Deterministic root order = dedupedNodes array order. Restarting the DFS
  // from every still-WHITE node covers disconnected components/multiple roots.
  dedupedNodes.forEach(node => {
    if (color.get(node.id) === WHITE) visit(node.id);
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

// Case-insensitive substring match over a node's label, sublabel and type —
// used by the canvas search box in both the Visual Designer and Execute panel.
export function searchGraphNodes(nodes = [], query = "") {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return nodes.filter(node =>
    (node.label || "").toLowerCase().includes(q) ||
    (node.sublabel || "").toLowerCase().includes(q) ||
    (node.type || "").toLowerCase().includes(q)
  );
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
        !node.classList?.contains('run-footprint-ghost') &&
        !node.getAttribute?.('data-id')?.startsWith('section-'),
    });
  } catch (err) {
    console.warn('[flow] Canvas export failed:', err);
    return null;
  }
}

export async function getModelImageDataUrl() {
  return exportCanvasToPng();
}
