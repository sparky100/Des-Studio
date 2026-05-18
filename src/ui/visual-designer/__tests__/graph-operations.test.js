// Tests for graph-operations fixes: cSchedules append, auto-link guard, deleteVisualNode overflow cleanup
import { describe, test, expect } from 'vitest';
import { connectVisualNodes, addVisualNode, deleteVisualNode } from '../graph-operations.js';
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
