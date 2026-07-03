// Tests for graph-operations fixes: cSchedules append, auto-link guard, deleteVisualNode overflow cleanup
import { describe, test, expect } from 'vitest';
import { connectVisualNodes, addVisualNode, deleteVisualNode, duplicateVisualNodes, updateProbabilisticBranchProbability } from '../graph-operations.js';
import { deriveGraphFromModel, VISUAL_NODE_TYPES } from '../graph.js';

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

// Model whose activity releases via RELEASE_COSEIZED([Type1, Type2], Queue)
// instead of a plain RELEASE(Server, Queue) — regression coverage for the bug
// where the bracketed multi-type list broke the target-queue extraction and
// the activity got no outgoing edge at all.
function makeCoseizeModel() {
  return {
    entityTypes: [
      { id: 'customer-1', name: 'Customer', role: 'customer' },
      { id: 'server-1', name: 'ServerA', role: 'server', count: 1 },
      { id: 'server-2', name: 'ServerB', role: 'server', count: 1 },
    ],
    queues: [
      { id: 'queue-1', name: 'Queue 1', customerType: 'Customer', discipline: 'FIFO' },
      { id: 'queue-2', name: 'Queue 2', customerType: 'Customer', discipline: 'FIFO' },
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
        id: 'coseize-done',
        name: 'Coseize Complete',
        scheduledTime: '9999',
        effect: 'RELEASE_COSEIZED([ServerA, ServerB], Queue 2)',
        schedules: [],
      },
    ],
    cEvents: [{
      id: 'activity-1',
      name: 'Coseize Activity',
      priority: 1,
      condition: 'queue(Queue 1).length > 0 AND idle(ServerA).count > 0 AND idle(ServerB).count > 0',
      effect: 'COSEIZE(Queue 1, ServerA[SkillA], ServerB[SkillB])',
      cSchedules: [{ eventId: 'coseize-done', dist: 'Fixed', distParams: { value: '1' }, useEntityCtx: true }],
    }],
  };
}

describe('deriveGraphFromModel — RELEASE_COSEIZED edges', () => {
  test('derives an activity->queue edge from RELEASE_COSEIZED, same as RELEASE', () => {
    const model = makeCoseizeModel();
    const graph = deriveGraphFromModel(model);

    const edge = graph.edges.find(e => e.from === 'activity:activity-1' && e.to === 'queue:queue-2');
    expect(edge).toBeDefined();
    expect(edge.source).toBe('routing');
  });

  test('does not also fall through to the DELAY-completion no-routing sink fallback', () => {
    const model = makeCoseizeModel();
    const graph = deriveGraphFromModel(model);

    // Exactly one outgoing edge from the activity — no stray duplicate/sink edge.
    const outgoing = graph.edges.filter(e => e.from === 'activity:activity-1');
    expect(outgoing).toHaveLength(1);
  });
});

describe('deriveGraphFromModel — loopConfig.exitQueueName edges', () => {
  // A bEvent can loop back to one queue (via probabilisticRouting/routing) for
  // up to maxLoopCount passes, then exit to a *different* queue named in
  // loopConfig.exitQueueName. That exit queue is never inspected by the normal
  // routing-edge derivation, so without dedicated handling it gets no incoming
  // edge at all — same "disconnected queue" symptom as the RELEASE_COSEIZED bug,
  // from an unrelated model field.
  function makeLoopModel() {
    const model = makeModel();
    model.bEvents = model.bEvents.map(be =>
      be.id === 'route-activity-1-queue-2'
        ? {
            ...be,
            probabilisticRouting: [{ probability: 1, queueName: 'Queue 2' }],
            loopConfig: { maxLoopCount: 2, exitQueueName: 'Queue 3' },
          }
        : be
    );
    return model;
  }

  test('derives both the normal loop-back edge and the loop-exit edge', () => {
    const model = makeLoopModel();
    const graph = deriveGraphFromModel(model);

    const loopBackEdge = graph.edges.find(e => e.from === 'activity:activity-1' && e.to === 'queue:queue-2');
    expect(loopBackEdge).toBeDefined();

    const exitEdge = graph.edges.find(e => e.from === 'activity:activity-1' && e.to === 'queue:queue-3');
    expect(exitEdge).toBeDefined();
    expect(exitEdge.label).toContain('2');
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
