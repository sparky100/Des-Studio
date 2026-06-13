// tests/engine/fel-heap.test.js
//
// The FEL heap must be behaviourally identical to the previous sorted-array
// implementation: a stable sort by scheduledTime with insertion order
// preserved among ties. The reference model below reproduces the old code
// exactly (push + stable Array.prototype.sort, filter for due batches).

import { describe, expect, test } from 'vitest';
import { createFelHeap } from '../../src/engine/fel-heap.js';
import { mulberry32 } from '../../src/engine/distributions.js';

const EPS = 1e-9;

// Reference implementation — the old sorted-array FEL.
function createReferenceFel() {
  let arr = [];
  return {
    get size() { return arr.length; },
    push(ev) {
      arr.push(ev);
      arr.sort((a, b) => a.scheduledTime - b.scheduledTime);
    },
    peek() { return arr[0]; },
    popDueBatch(eps = EPS) {
      if (arr.length === 0) return [];
      const nextTime = arr[0].scheduledTime;
      const due = arr.filter(ev => Math.abs(ev.scheduledTime - nextTime) < eps);
      arr = arr.filter(ev => Math.abs(ev.scheduledTime - nextTime) >= eps);
      return due;
    },
    toSortedArray() { return arr.slice(); },
    rebuildWith(predicate) { arr = arr.filter(predicate); },
    resyncTimes() { arr.sort((a, b) => a.scheduledTime - b.scheduledTime); },
  };
}

function ids(events) {
  return events.map(e => e.id);
}

describe('fel-heap', () => {
  test('orders ties by insertion order (stable-sort equivalence)', () => {
    const heap = createFelHeap();
    heap.push({ id: 'a', scheduledTime: 5 });
    heap.push({ id: 'b', scheduledTime: 5 });
    heap.push({ id: 'c', scheduledTime: 3 });
    heap.push({ id: 'd', scheduledTime: 5 });

    expect(heap.peek().id).toBe('c');
    expect(ids(heap.toSortedArray())).toEqual(['c', 'a', 'b', 'd']);
    expect(ids(heap.popDueBatch())).toEqual(['c']);
    expect(ids(heap.popDueBatch())).toEqual(['a', 'b', 'd']);
    expect(heap.size).toBe(0);
  });

  test('popDueBatch groups events within epsilon of the minimum', () => {
    const heap = createFelHeap();
    heap.push({ id: 'a', scheduledTime: 1 });
    heap.push({ id: 'b', scheduledTime: 1 + 5e-10 }); // inside eps
    heap.push({ id: 'c', scheduledTime: 1 + 2e-9 });  // outside eps

    expect(ids(heap.popDueBatch())).toEqual(['a', 'b']);
    expect(ids(heap.popDueBatch())).toEqual(['c']);
  });

  test('rebuildWith preserves relative order of survivors', () => {
    const heap = createFelHeap();
    for (let i = 0; i < 10; i++) heap.push({ id: `e${i}`, scheduledTime: i % 3 });
    heap.rebuildWith(ev => ev.id !== 'e4' && ev.id !== 'e0');

    const ref = createReferenceFel();
    for (let i = 0; i < 10; i++) ref.push({ id: `e${i}`, scheduledTime: i % 3 });
    ref.rebuildWith(ev => ev.id !== 'e4' && ev.id !== 'e0');

    expect(ids(heap.toSortedArray())).toEqual(ids(ref.toSortedArray()));
  });

  test('resyncTimes matches mutate-then-stable-sort semantics', () => {
    const make = () => [
      { id: 'a', scheduledTime: 5 },
      { id: 'b', scheduledTime: 3 },
      { id: 'c', scheduledTime: 7 },
    ];

    const heapEvents = make();
    const heap = createFelHeap();
    heapEvents.forEach(ev => heap.push(ev));
    // Old order by time: b(3), a(5), c(7). Mutate a and b to the same time —
    // stable sort over the old order keeps b before a.
    heapEvents[0].scheduledTime = 9;
    heapEvents[1].scheduledTime = 9;
    heap.resyncTimes();

    expect(ids(heap.toSortedArray())).toEqual(['c', 'b', 'a']);
    expect(ids(heap.popDueBatch())).toEqual(['c']);
    expect(ids(heap.popDueBatch())).toEqual(['b', 'a']);
  });

  test('randomized differential test against the sorted-array reference', () => {
    const rng = mulberry32(1234);
    const heap = createFelHeap();
    const ref = createReferenceFel();
    let nextId = 0;

    for (let op = 0; op < 3000; op++) {
      const r = rng();
      if (r < 0.55 || heap.size === 0) {
        // Push, with deliberately heavy time ties (quantized times)
        const time = Math.floor(rng() * 20) / 2;
        const ev = { id: `e${nextId++}`, scheduledTime: time };
        const ev2 = { ...ev }; // independent objects, identical keys
        heap.push(ev);
        ref.push(ev2);
      } else if (r < 0.85) {
        expect(ids(heap.popDueBatch())).toEqual(ids(ref.popDueBatch()));
      } else if (r < 0.95) {
        const dropTime = Math.floor(rng() * 20) / 2;
        heap.rebuildWith(ev => ev.scheduledTime !== dropTime);
        ref.rebuildWith(ev => ev.scheduledTime !== dropTime);
      } else {
        expect(heap.peek()?.id).toBe(ref.peek()?.id);
        expect(heap.size).toBe(ref.size);
      }
      expect(heap.size).toBe(ref.size);
    }

    // Drain both completely — full ordering must match
    while (ref.size > 0) {
      expect(ids(heap.popDueBatch())).toEqual(ids(ref.popDueBatch()));
    }
    expect(heap.size).toBe(0);
  });
});
