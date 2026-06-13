// src/engine/fel-heap.js — Future Event List as a stable binary min-heap.
//
// Replaces the sorted-array FEL (full O(n log n) sort per insertion plus two
// O(n) scans per cycle) with O(log n) push/pop. Determinism contract: the
// previous implementation relied on V8's stable Array.prototype.sort, so
// events with equal scheduledTime fired in insertion order. This heap orders
// by (scheduledTime, seq) where seq is a monotonically increasing insertion
// counter — exactly reproducing that ordering.
//
// Entries wrap the event object with a copy of its scheduledTime taken at
// insertion. The only external mutation of event times (updateScheduledTime
// in index.js) must call resyncTimes() afterwards; it restores the exact
// semantics of the old "mutate then stable-sort" code by re-numbering seq in
// the pre-mutation order.

function lessThan(a, b) {
  return a.t < b.t || (a.t === b.t && a.seq < b.seq);
}

export function createFelHeap() {
  /** @type {{t: number, seq: number, ev: object}[]} */
  let heap = [];
  let seqCounter = 0;

  function siftUp(i) {
    const node = heap[i];
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (!lessThan(node, heap[parent])) break;
      heap[i] = heap[parent];
      i = parent;
    }
    heap[i] = node;
  }

  function siftDown(i) {
    const node = heap[i];
    const n = heap.length;
    while (true) {
      let smallest = i;
      const left = 2 * i + 1;
      const right = left + 1;
      let candidate = node;
      if (left < n && lessThan(heap[left], candidate)) { smallest = left; candidate = heap[left]; }
      if (right < n && lessThan(heap[right], candidate)) { smallest = right; }
      if (smallest === i) break;
      heap[i] = heap[smallest];
      heap[smallest] = node;
      i = smallest;
    }
  }

  function heapify() {
    for (let i = (heap.length >> 1) - 1; i >= 0; i--) siftDown(i);
  }

  function popMin() {
    const min = heap[0];
    const last = heap.pop();
    if (heap.length > 0) {
      heap[0] = last;
      siftDown(0);
    }
    return min.ev;
  }

  function sortedEntries() {
    return heap.slice().sort((a, b) => (a.t - b.t) || (a.seq - b.seq));
  }

  return {
    get size() {
      return heap.length;
    },

    push(ev) {
      heap.push({ t: ev.scheduledTime, seq: seqCounter++, ev });
      siftUp(heap.length - 1);
    },

    /** Earliest event (by time, then insertion order), or undefined. */
    peek() {
      return heap[0]?.ev;
    },

    /**
     * Remove and return all events whose scheduledTime is within eps of the
     * current minimum, in (time, insertion) order — the same batch and order
     * the old `fel.filter(|t - min| < eps)` produced on the sorted array.
     */
    popDueBatch(eps = 1e-9) {
      if (heap.length === 0) return [];
      const refTime = heap[0].t;
      const due = [popMin()];
      while (heap.length > 0 && Math.abs(heap[0].t - refTime) < eps) {
        due.push(popMin());
      }
      return due;
    },

    /** Events in firing order — for snapshots/previews only (O(n log n)). */
    toSortedArray() {
      return sortedEntries().map(entry => entry.ev);
    },

    /**
     * Keep only events matching the predicate (warmup prune). Survivors keep
     * their (time, seq) keys, preserving relative order like Array.filter.
     */
    rebuildWith(predicate) {
      heap = heap.filter(entry => predicate(entry.ev));
      heapify();
    },

    /**
     * Call after event scheduledTime fields were mutated externally
     * (updateScheduledTime). Re-keys every entry from its event and renumbers
     * seq in pre-mutation firing order — byte-equivalent to the old
     * "mutate in place, then stable-sort the array" behaviour.
     */
    resyncTimes() {
      const inOldOrder = sortedEntries();
      for (let i = 0; i < inOldOrder.length; i++) {
        inOldOrder[i].t = inOldOrder[i].ev.scheduledTime;
        inOldOrder[i].seq = i;
      }
      seqCounter = inOldOrder.length;
      heap = inOldOrder;
      heapify();
    },

    /** Iterate events in arbitrary (heap) order — for scans that don't care. */
    forEach(fn) {
      for (const entry of heap) fn(entry.ev);
    },
  };
}
