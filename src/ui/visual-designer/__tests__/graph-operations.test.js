// Tests for graph-operations fixes: cSchedules append, auto-link guard, deleteVisualNode overflow cleanup
import { describe, test, expect } from 'vitest';
import { connectVisualNodes, addVisualNode, deleteVisualNode, deleteVisualEdge, duplicateVisualNodes, updateProbabilisticBranchProbability, updateProbabilisticBranchQueue, addProbabilisticBranch, alignNodes, distributeNodes } from '../graph-operations.js';
import { deriveGraphFromModel, VISUAL_NODE_TYPES, NODE_WIDTH, NODE_HEIGHT } from '../graph.js';

// Model with Triage activity already routing to Queue 2.
// Queue 3 exists unconnected — tests will connect Triage to it.
function makeModel() {
  return {
    entityTypes: [
      { id: 'customer-1', name: 'Customer', role: 'customer' },
      { id: 'server-1', name: 'Server', role: 'server', count: 1 },
    ],
    queues: [
      { id: 'queue-1', name: 'Queue 1', customerType: 'Customer', discipline: 'FIFO' },
      { id: 'queue-2', name: 'Queue 2', customerType: 'Customer', discipline: 'FIFO' },
      { id: 'queue-3', name: 'Queue 3', customerType: 'Customer', discipline: 'FIFO' },
    ],
    bEvents: [
      {
        id: 'arrival-1',
        name: 'Arrivals',
        scheduledTime: '0',
        effect: 'ARRIVE(Customer, Queue 1)',
        schedules: [{ eventId: 'arrival-1', dist: 'Exponential', distParams: { mean: '5' } }],
      },
      {
        id: 'route-activity-1-queue-2',
        name: 'Triage Complete',
        scheduledTime: '9999',
        effect: 'RELEASE(Server, Queue 2)',
        schedules: [],
      },
    ],
    cEvents: [{
      id: 'activity-1',
      name: 'Triage',
      priority: 1,
      condition: 'queue(Queue 1).length > 0 AND idle(Server).count > 0',
      effect: 'ASSIGN(Queue 1, Server)',
      cSchedules: [{ eventId: 'route-activity-1-queue-2', dist: 'Fixed', distParams: { value: '1' }, useEntityCtx: true }],
    }],
  };
}

describe('connectVisualNodes — ACTIVITY→QUEUE cSchedules append', () => {
  test('appends new cSchedule, preserving the existing route', () => {
    const model = makeModel();
    const graph = deriveGraphFromModel(model);

    const result = connectVisualNodes(model, graph, 'activity:activity-1', 'queue:queue-3');
    const cEvent = result.model.cEvents.find(e => e.id === 'activity-1');

    expect(cEvent.cSchedules).toHaveLength(2);
    expect(cEvent.cSchedules.some(cs => cs.eventId === 'route-activity-1-queue-2')).toBe(true);
    expect(cEvent.cSchedules.some(cs => cs.eventId === 'route-activity-1-queue-3')).toBe(true);
  });

  test('creates the first cSchedule when none exist', () => {
    const model = makeModel();
    model.cEvents[0] = { ...model.cEvents[0], cSchedules: [] };
    const graph = deriveGraphFromModel(model);

    const result = connectVisualNodes(model, graph, 'activity:activity-1', 'queue:queue-3');
    const cEvent = result.model.cEvents.find(e => e.id === 'activity-1');

    expect(cEvent.cSchedules).toHaveLength(1);
    expect(cEvent.cSchedules[0].eventId).toBe('route-activity-1-queue-3');
  });

  test('does not duplicate when connecting to the same queue a second time', () => {
    const model = makeModel();
    const graph = deriveGraphFromModel(model);

    const first = connectVisualNodes(model, graph, 'activity:activity-1', 'queue:queue-3');
    const graph2 = deriveGraphFromModel(first.model);
    const second = connectVisualNodes(first.model, graph2, 'activity:activity-1', 'queue:queue-3');

    const cEvent = second.model.cEvents.find(e => e.id === 'activity-1');
    const matches = cEvent.cSchedules.filter(cs => cs.eventId === 'route-activity-1-queue-3');
    expect(matches).toHaveLength(1);
  });

  test('also creates the RELEASE b-event targeting the new queue', () => {
    const model = makeModel();
    const graph = deriveGraphFromModel(model);

    const result = connectVisualNodes(model, graph, 'activity:activity-1', 'queue:queue-3');
    const releaseEvent = result.model.bEvents.find(e => e.id === 'route-activity-1-queue-3');

    expect(releaseEvent).toBeDefined();
    expect(releaseEvent.effect).toBe('RELEASE(Server, Queue 3)');
  });
});

describe('connectVisualNodes — QUEUE→QUEUE overflow (guard motivation)', () => {
  test('QUEUE→QUEUE sets overflowDestination on the source queue', () => {
    // Documents why the addNode autoLinkTypes guard is needed:
    // connectVisualNodes will silently set overflow if called with two queues.
    // The guard in addNode (SOURCE | ACTIVITY only) prevents this from
    // firing when a queue happens to be selected while adding another queue.
    const model = makeModel();
    const graph = deriveGraphFromModel(model);

    const result = connectVisualNodes(model, graph, 'queue:queue-1', 'queue:queue-3');
    const q1 = result.model.queues.find(q => q.id === 'queue-1');

    expect(q1.overflowDestination).toBe('Queue 3');
  });
});

describe('addVisualNode — auto-link guard', () => {
  test('VISUAL_NODE_TYPES for SOURCE and ACTIVITY are the only auto-link-eligible types', () => {
    // The guard in VisualDesignerPanel.addNode allows auto-linking only from these two types.
    // This confirms the guard covers SOURCE and ACTIVITY, not QUEUE or SINK.
    const autoLinkTypes = [VISUAL_NODE_TYPES.SOURCE, VISUAL_NODE_TYPES.ACTIVITY];
    expect(autoLinkTypes).toContain(VISUAL_NODE_TYPES.SOURCE);
    expect(autoLinkTypes).toContain(VISUAL_NODE_TYPES.ACTIVITY);
    expect(autoLinkTypes).not.toContain(VISUAL_NODE_TYPES.QUEUE);
    expect(autoLinkTypes).not.toContain(VISUAL_NODE_TYPES.SINK);
  });

  test('adding a queue to a model produces a node with type QUEUE', () => {
    const model = makeModel();
    const next = addVisualNode(model, VISUAL_NODE_TYPES.QUEUE);
    const graph = deriveGraphFromModel(next);
    const queueNodes = graph.nodes.filter(n => n.type === VISUAL_NODE_TYPES.QUEUE);

    // Started with 3 queues, now has 4
    expect(queueNodes).toHaveLength(4);
    // New queue is Queue 4 (3 existed already)
    expect(queueNodes.some(n => n.label === 'Queue 4')).toBe(true);
  });

  test('new queue added via addVisualNode has no overflowDestination by default', () => {
    const model = makeModel();
    const next = addVisualNode(model, VISUAL_NODE_TYPES.QUEUE);
    const newQueue = next.queues[next.queues.length - 1];

    expect(newQueue.overflowDestination).toBeUndefined();
  });
});

describe('deleteVisualNode — overflow cleanup', () => {
  test('deleting a queue clears overflowDestination on any queue that pointed to it', () => {
    // Set up: Queue 1 overflows to Queue 3 (simulates the state left by the old auto-link bug)
    const model = makeModel();
    model.queues = model.queues.map(q =>
      q.id === 'queue-1' ? { ...q, overflowDestination: 'Queue 3' } : q
    );
    const graph = deriveGraphFromModel(model);
    const queue3Node = graph.nodes.find(n => n.id === 'queue:queue-3');

    const next = deleteVisualNode(model, queue3Node);

    const q1 = next.queues.find(q => q.id === 'queue-1');
    expect(q1.overflowDestination).toBeUndefined();
    expect(next.queues.find(q => q.id === 'queue-3')).toBeUndefined();
  });

  test('deleting a queue does not affect overflowDestination pointing to a different queue', () => {
    // Queue 1 overflows to Queue 2 — deleting Queue 3 should leave Queue 1 untouched
    const model = makeModel();
    model.queues = model.queues.map(q =>
      q.id === 'queue-1' ? { ...q, overflowDestination: 'Queue 2' } : q
    );
    const graph = deriveGraphFromModel(model);
    const queue3Node = graph.nodes.find(n => n.id === 'queue:queue-3');

    const next = deleteVisualNode(model, queue3Node);

    const q1 = next.queues.find(q => q.id === 'queue-1');
    expect(q1.overflowDestination).toBe('Queue 2');
  });

  test('after deleting the overflow target queue and re-adding a same-named queue, no overflow edge is derived', () => {
    // Simulates the full reproduce scenario: old bug left overflow, queue deleted (with fix),
    // new same-named queue added — overflow must NOT reappear.
    const model = makeModel();
    model.queues = model.queues.map(q =>
      q.id === 'queue-1' ? { ...q, overflowDestination: 'Queue 3' } : q
    );
    const graph = deriveGraphFromModel(model);
    const queue3Node = graph.nodes.find(n => n.id === 'queue:queue-3');

    // Delete Queue 3 (cleanup should clear overflowDestination)
    const afterDelete = deleteVisualNode(model, queue3Node);
    expect(afterDelete.queues.find(q => q.id === 'queue-1').overflowDestination).toBeUndefined();

    // Add a new queue (will be named Queue 3 again since only 2 queues remain)
    const afterAdd = addVisualNode(afterDelete, VISUAL_NODE_TYPES.QUEUE);
    const derivedGraph = deriveGraphFromModel(afterAdd);

    const overflowEdges = derivedGraph.edges.filter(e => e.source === 'overflow');
    expect(overflowEdges).toHaveLength(0);
  });
});

describe('duplicateVisualNodes', () => {
  test('duplicates a queue with a unique name and offset position', () => {
    const model = makeModel();
    const graph = deriveGraphFromModel(model);
    const queueNode = graph.nodes.find(n => n.id === 'queue:queue-1');

    const { model: next, newNodeIds } = duplicateVisualNodes(model, [queueNode], { x: 48, y: 48 });

    expect(newNodeIds).toHaveLength(1);
    expect(next.queues).toHaveLength(4);
    const copy = next.queues.find(q => q.id !== queueNode.refId && q.name === 'Queue 1 copy');
    expect(copy).toBeDefined();

    const derived = deriveGraphFromModel(next);
    const copyNode = derived.nodes.find(n => n.id === newNodeIds[0]);
    expect(copyNode.x).toBe((queueNode.x || 0) + 48);
    expect(copyNode.y).toBe((queueNode.y || 0) + 48);
  });

  test('duplicating a source clones its bEvent with an independent schedule', () => {
    const model = makeModel();
    const graph = deriveGraphFromModel(model);
    const sourceNode = graph.nodes.find(n => n.type === VISUAL_NODE_TYPES.SOURCE);

    const { model: next, newNodeIds } = duplicateVisualNodes(model, [sourceNode]);

    expect(newNodeIds).toHaveLength(1);
    expect(next.bEvents).toHaveLength(model.bEvents.length + 1);
    const original = next.bEvents.find(e => e.id === sourceNode.refId);
    const copy = next.bEvents.find(e => e.id !== sourceNode.refId && e.name === `${original.name} copy`);
    expect(copy).toBeDefined();
    // The copy's own schedule references the copy, not the original.
    expect(copy.schedules[0].eventId).toBe(copy.id);
    expect(original.schedules[0].eventId).toBe(original.id);
  });

  test('duplicating an activity also clones its referenced completion b-event independently', () => {
    const model = makeModel();
    const graph = deriveGraphFromModel(model);
    const activityNode = graph.nodes.find(n => n.id === 'activity:activity-1');

    const { model: next, newNodeIds } = duplicateVisualNodes(model, [activityNode]);

    expect(newNodeIds).toHaveLength(1);
    const copyCEvent = next.cEvents.find(e => e.id !== 'activity-1');
    expect(copyCEvent).toBeDefined();
    expect(copyCEvent.cSchedules).toHaveLength(1);

    const copyCompletionId = copyCEvent.cSchedules[0].eventId;
    expect(copyCompletionId).not.toBe('route-activity-1-queue-2');
    const copyCompletion = next.bEvents.find(e => e.id === copyCompletionId);
    expect(copyCompletion).toBeDefined();
    expect(copyCompletion.effect).toBe('RELEASE(Server, Queue 2)');

    // Original activity's route is untouched — still points at the original completion event.
    const originalCEvent = next.cEvents.find(e => e.id === 'activity-1');
    expect(originalCEvent.cSchedules[0].eventId).toBe('route-activity-1-queue-2');
  });

  test('skips synthetic route-exit sink nodes', () => {
    const model = makeModel();
    const fakeRouteExitNode = { type: VISUAL_NODE_TYPES.SINK, refId: 'route-exit:arrival-1', x: 0, y: 0 };

    const { model: next, newNodeIds } = duplicateVisualNodes(model, [fakeRouteExitNode]);

    expect(newNodeIds).toHaveLength(0);
    expect(next).toBe(model);
  });

  test('duplicates multiple nodes in one batch without id collisions', () => {
    const model = makeModel();
    const graph = deriveGraphFromModel(model);
    const queue1 = graph.nodes.find(n => n.id === 'queue:queue-1');
    const queue2 = graph.nodes.find(n => n.id === 'queue:queue-2');

    const { model: next, newNodeIds } = duplicateVisualNodes(model, [queue1, queue2]);

    expect(newNodeIds).toHaveLength(2);
    expect(new Set(newNodeIds).size).toBe(2);
    expect(next.queues).toHaveLength(5);
    const ids = next.queues.map(q => q.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

// Model where the activity's completion b-event routes probabilistically
// to two destination queues instead of a single fixed RELEASE target.
function makeProbabilisticModel() {
  const model = makeModel();
  model.bEvents = model.bEvents.map(be =>
    be.id === 'route-activity-1-queue-2'
      ? {
          ...be,
          probabilisticRouting: [
            { probability: 0.7, queueName: 'Queue 2' },
            { probability: 0.3, queueName: 'Queue 3' },
          ],
        }
      : be
  );
  return model;
}

describe('deriveGraphFromModel — probabilistic routing edges', () => {
  test('each branch edge carries bEventId/branchIndex/probability and a % label', () => {
    const model = makeProbabilisticModel();
    const graph = deriveGraphFromModel(model);

    const branchEdges = graph.edges.filter(e => e.bEventId === 'route-activity-1-queue-2');
    expect(branchEdges).toHaveLength(2);

    const toQueue2 = branchEdges.find(e => e.to === 'queue:queue-2');
    expect(toQueue2.branchIndex).toBe(0);
    expect(toQueue2.probability).toBe(0.7);
    expect(toQueue2.label).toBe('70%');

    const toQueue3 = branchEdges.find(e => e.to === 'queue:queue-3');
    expect(toQueue3.branchIndex).toBe(1);
    expect(toQueue3.probability).toBe(0.3);
    expect(toQueue3.label).toBe('30%');
  });

  test('a branch routing to null queueName (exit) derives an edge to a synthetic sink', () => {
    const model = makeProbabilisticModel();
    model.bEvents = model.bEvents.map(be =>
      be.id === 'route-activity-1-queue-2'
        ? { ...be, probabilisticRouting: [{ probability: 1, queueName: null }] }
        : be
    );
    const graph = deriveGraphFromModel(model);

    const branchEdges = graph.edges.filter(e => e.bEventId === 'route-activity-1-queue-2');
    expect(branchEdges).toHaveLength(1);
    expect(branchEdges[0].source).toBe('terminal');
    expect(branchEdges[0].label).toBe('100%');
  });
});

describe('deleteVisualEdge — probabilistic routing branch', () => {
  test('deleting one branch removes only that branch, leaving the other branch and its cSchedule intact', () => {
    const model = makeProbabilisticModel();
    const graph = deriveGraphFromModel(model);
    const edge = graph.edges.find(e => e.bEventId === 'route-activity-1-queue-2' && e.branchIndex === 0);

    const next = deleteVisualEdge(model, graph, edge.id);
    const bEvent = next.bEvents.find(be => be.id === 'route-activity-1-queue-2');

    expect(bEvent).toBeTruthy();
    expect(bEvent.probabilisticRouting).toHaveLength(1);
    expect(bEvent.probabilisticRouting[0].queueName).toBe('Queue 3');

    const cEvent = next.cEvents.find(ce => ce.id === 'activity-1');
    expect(cEvent.cSchedules.some(s => s.eventId === 'route-activity-1-queue-2')).toBe(true);

    const nextGraph = deriveGraphFromModel(next);
    const remainingBranchEdges = nextGraph.edges.filter(e => e.bEventId === 'route-activity-1-queue-2');
    expect(remainingBranchEdges).toHaveLength(1);
    expect(remainingBranchEdges[0].branchIndex).toBe(0);
    expect(remainingBranchEdges[0].label).toBe('30%');
  });

  test('deleting the last remaining branch drops the cSchedule and the unshared bEvent', () => {
    const model = makeProbabilisticModel();
    model.bEvents = model.bEvents.map(be =>
      be.id === 'route-activity-1-queue-2'
        ? { ...be, probabilisticRouting: [{ probability: 1, queueName: 'Queue 2' }] }
        : be
    );
    const graph = deriveGraphFromModel(model);
    const edge = graph.edges.find(e => e.bEventId === 'route-activity-1-queue-2' && e.branchIndex === 0);

    const next = deleteVisualEdge(model, graph, edge.id);

    expect(next.bEvents.find(be => be.id === 'route-activity-1-queue-2')).toBeUndefined();
    const cEvent = next.cEvents.find(ce => ce.id === 'activity-1');
    expect(cEvent.cSchedules.some(s => s.eventId === 'route-activity-1-queue-2')).toBe(false);
  });

  test('deleting a branch routed to a null-queueName exit removes only that branch', () => {
    const model = makeProbabilisticModel();
    model.bEvents = model.bEvents.map(be =>
      be.id === 'route-activity-1-queue-2'
        ? {
            ...be,
            probabilisticRouting: [
              { probability: 0.4, queueName: null },
              { probability: 0.6, queueName: 'Queue 2' },
            ],
          }
        : be
    );
    const graph = deriveGraphFromModel(model);
    const exitEdge = graph.edges.find(e => e.bEventId === 'route-activity-1-queue-2' && e.branchIndex === 0);
    expect(exitEdge.source).toBe('terminal');

    const next = deleteVisualEdge(model, graph, exitEdge.id);
    const bEvent = next.bEvents.find(be => be.id === 'route-activity-1-queue-2');

    expect(bEvent.probabilisticRouting).toHaveLength(1);
    expect(bEvent.probabilisticRouting[0].queueName).toBe('Queue 2');
  });
});

describe('deleteVisualEdge — non-probabilistic routing (regression guard)', () => {
  test('deleting a plain Activity→Queue routing edge still removes its cSchedule and bEvent', () => {
    const model = makeModel();
    const graph = deriveGraphFromModel(model);
    const edge = graph.edges.find(e => e.source === 'routing' && e.to === 'queue:queue-2');
    expect(edge).toBeTruthy();
    expect(edge.bEventId).toBeUndefined();

    const next = deleteVisualEdge(model, graph, edge.id);
    expect(next.bEvents.find(be => be.id === 'route-activity-1-queue-2')).toBeUndefined();
    const cEvent = next.cEvents.find(ce => ce.id === 'activity-1');
    expect(cEvent.cSchedules.some(s => s.eventId === 'route-activity-1-queue-2')).toBe(false);
  });
});

describe('updateProbabilisticBranchProbability', () => {
  test('updates only the targeted branch, leaving the other branch untouched', () => {
    const model = makeProbabilisticModel();
    const graph = deriveGraphFromModel(model);
    const edge = graph.edges.find(e => e.bEventId === 'route-activity-1-queue-2' && e.branchIndex === 0);

    const next = updateProbabilisticBranchProbability(model, edge, 0.55);
    const bEvent = next.bEvents.find(be => be.id === 'route-activity-1-queue-2');

    expect(bEvent.probabilisticRouting[0].probability).toBe(0.55);
    expect(bEvent.probabilisticRouting[1].probability).toBe(0.3);
  });

  test('clamps probability to [0, 1]', () => {
    const model = makeProbabilisticModel();
    const graph = deriveGraphFromModel(model);
    const edge = graph.edges.find(e => e.bEventId === 'route-activity-1-queue-2' && e.branchIndex === 0);

    const tooHigh = updateProbabilisticBranchProbability(model, edge, 1.5);
    expect(tooHigh.bEvents.find(be => be.id === 'route-activity-1-queue-2').probabilisticRouting[0].probability).toBe(1);

    const tooLow = updateProbabilisticBranchProbability(model, edge, -0.2);
    expect(tooLow.bEvents.find(be => be.id === 'route-activity-1-queue-2').probabilisticRouting[0].probability).toBe(0);
  });

  test('returns the model unchanged when the edge has no bEventId/branchIndex (non-probabilistic edge)', () => {
    const model = makeProbabilisticModel();
    const graph = deriveGraphFromModel(model);
    const conditionEdge = graph.edges.find(e => e.source === 'condition');

    const next = updateProbabilisticBranchProbability(model, conditionEdge, 0.9);
    expect(next).toBe(model);
  });
});

describe('updateProbabilisticBranchQueue', () => {
  test('retargets one branch, leaving the other branch untouched', () => {
    const model = makeProbabilisticModel();
    const graph = deriveGraphFromModel(model);
    const edge = graph.edges.find(e => e.bEventId === 'route-activity-1-queue-2' && e.branchIndex === 0);

    const next = updateProbabilisticBranchQueue(model, edge, 'Queue 3');
    const bEvent = next.bEvents.find(be => be.id === 'route-activity-1-queue-2');

    expect(bEvent.probabilisticRouting[0].queueName).toBe('Queue 3');
    expect(bEvent.probabilisticRouting[0].probability).toBe(0.7);
    expect(bEvent.probabilisticRouting[1].queueName).toBe('Queue 3');
  });

  test('retargeting to "" or null sets queueName to null (exit)', () => {
    const model = makeProbabilisticModel();
    const graph = deriveGraphFromModel(model);
    const edge = graph.edges.find(e => e.bEventId === 'route-activity-1-queue-2' && e.branchIndex === 0);

    const next = updateProbabilisticBranchQueue(model, edge, '');
    const bEvent = next.bEvents.find(be => be.id === 'route-activity-1-queue-2');
    expect(bEvent.probabilisticRouting[0].queueName).toBeNull();
  });

  test('returns the model unchanged when the edge has no bEventId/branchIndex (non-probabilistic edge)', () => {
    const model = makeProbabilisticModel();
    const graph = deriveGraphFromModel(model);
    const conditionEdge = graph.edges.find(e => e.source === 'condition');

    const next = updateProbabilisticBranchQueue(model, conditionEdge, 'Queue 3');
    expect(next).toBe(model);
  });
});

describe('addProbabilisticBranch', () => {
  test('appends a 0%/exit branch without touching existing branches', () => {
    const model = makeProbabilisticModel();

    const next = addProbabilisticBranch(model, 'route-activity-1-queue-2');
    const bEvent = next.bEvents.find(be => be.id === 'route-activity-1-queue-2');

    expect(bEvent.probabilisticRouting).toHaveLength(3);
    expect(bEvent.probabilisticRouting[0]).toEqual({ probability: 0.7, queueName: 'Queue 2' });
    expect(bEvent.probabilisticRouting[1]).toEqual({ probability: 0.3, queueName: 'Queue 3' });
    expect(bEvent.probabilisticRouting[2]).toEqual({ probability: 0, queueName: null });

    const nextGraph = deriveGraphFromModel(next);
    const branchEdges = nextGraph.edges.filter(e => e.bEventId === 'route-activity-1-queue-2');
    expect(branchEdges).toHaveLength(3);
  });

  test('returns the model unchanged when the bEvent has no probabilisticRouting array', () => {
    const model = makeModel();
    const next = addProbabilisticBranch(model, 'route-activity-1-queue-2');
    expect(next).toBe(model);
  });

  test('returns the model unchanged when bEventId does not exist', () => {
    const model = makeProbabilisticModel();
    const next = addProbabilisticBranch(model, 'does-not-exist');
    expect(next).toBe(model);
  });
});

describe('alignNodes', () => {
  const nodes = [
    { id: 'a', x: 0, y: 0 },
    { id: 'b', x: 100, y: 50 },
    { id: 'c', x: 200, y: 120 },
  ];

  test('returns empty array for fewer than 2 nodes', () => {
    expect(alignNodes([nodes[0]], 'left')).toEqual([]);
    expect(alignNodes([], 'left')).toEqual([]);
  });

  test('left aligns all nodes to the minimum x, leaving y untouched', () => {
    const result = alignNodes(nodes, 'left');
    expect(result).toEqual([
      { id: 'a', x: 0, y: 0 },
      { id: 'b', x: 0, y: 50 },
      { id: 'c', x: 0, y: 120 },
    ]);
  });

  test('right aligns all nodes so their right edges match the rightmost node', () => {
    const result = alignNodes(nodes, 'right');
    const maxRight = 200 + NODE_WIDTH;
    result.forEach(node => {
      expect(node.x + NODE_WIDTH).toBe(maxRight);
    });
  });

  test('centerX aligns all nodes to the same horizontal center', () => {
    const result = alignNodes(nodes, 'centerX');
    const centers = result.map(node => node.x + NODE_WIDTH / 2);
    expect(new Set(centers).size).toBe(1);
  });

  test('top aligns all nodes to the minimum y, leaving x untouched', () => {
    const result = alignNodes(nodes, 'top');
    expect(result).toEqual([
      { id: 'a', x: 0, y: 0 },
      { id: 'b', x: 100, y: 0 },
      { id: 'c', x: 200, y: 0 },
    ]);
  });

  test('bottom aligns all nodes so their bottom edges match the lowest node', () => {
    const result = alignNodes(nodes, 'bottom');
    const maxBottom = 120 + NODE_HEIGHT;
    result.forEach(node => {
      expect(node.y + NODE_HEIGHT).toBe(maxBottom);
    });
  });

  test('middleY aligns all nodes to the same vertical middle', () => {
    const result = alignNodes(nodes, 'middleY');
    const middles = result.map(node => node.y + NODE_HEIGHT / 2);
    expect(new Set(middles).size).toBe(1);
  });

  test('unknown mode returns empty array', () => {
    expect(alignNodes(nodes, 'bogus')).toEqual([]);
  });
});

describe('distributeNodes', () => {
  test('returns empty array for fewer than 3 nodes', () => {
    expect(distributeNodes([{ id: 'a', x: 0, y: 0 }, { id: 'b', x: 100, y: 0 }], 'horizontal')).toEqual([]);
  });

  test('horizontal distribution keeps the leftmost and rightmost centers fixed and spaces the rest evenly', () => {
    const nodes = [
      { id: 'a', x: 0, y: 10 },
      { id: 'b', x: 50, y: 20 },
      { id: 'c', x: 300, y: 30 },
    ];
    const result = distributeNodes(nodes, 'horizontal');
    const byId = Object.fromEntries(result.map(n => [n.id, n]));
    expect(byId.a.x).toBe(0);
    expect(byId.c.x).toBe(300);
    const centerA = byId.a.x + NODE_WIDTH / 2;
    const centerB = byId.b.x + NODE_WIDTH / 2;
    const centerC = byId.c.x + NODE_WIDTH / 2;
    expect(centerB - centerA).toBeCloseTo(centerC - centerB, 5);
    expect(byId.a.y).toBe(10);
    expect(byId.b.y).toBe(20);
    expect(byId.c.y).toBe(30);
  });

  test('vertical distribution keeps the topmost and bottommost centers fixed and spaces the rest evenly', () => {
    const nodes = [
      { id: 'a', x: 10, y: 0 },
      { id: 'b', x: 20, y: 40 },
      { id: 'c', x: 30, y: 300 },
    ];
    const result = distributeNodes(nodes, 'vertical');
    const byId = Object.fromEntries(result.map(n => [n.id, n]));
    expect(byId.a.y).toBe(0);
    expect(byId.c.y).toBe(300);
    const centerA = byId.a.y + NODE_HEIGHT / 2;
    const centerB = byId.b.y + NODE_HEIGHT / 2;
    const centerC = byId.c.y + NODE_HEIGHT / 2;
    expect(centerB - centerA).toBeCloseTo(centerC - centerB, 5);
  });

  test('sorts nodes by position before distributing, regardless of input order', () => {
    const nodes = [
      { id: 'c', x: 300, y: 0 },
      { id: 'a', x: 0, y: 0 },
      { id: 'b', x: 150, y: 0 },
    ];
    const result = distributeNodes(nodes, 'horizontal');
    const byId = Object.fromEntries(result.map(n => [n.id, n]));
    expect(byId.a.x).toBe(0);
    expect(byId.c.x).toBe(300);
  });
});
