import { describe, expect, it } from 'vitest';
import fixture from '../fixtures/uk_electricity_supplier_des_phase1.json';
import { deriveGraphFromModel, projectCollapsedSections } from '../../src/ui/visual-designer/graph.js';
import { updateGraphLayout, validateVisualGraph } from '../../src/ui/visual-designer/graph-operations.js';
import { buildEngine } from '../../src/engine/index.js';
import { validateModel } from '../../src/engine/validation.js';
import { makeMM1Model } from '../engine/__helpers__/benchmarkFixtures.js';

function freeze(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}

const withoutTiming = result => ({ ...result, runtimeMetrics: { ...result.runtimeMetrics, wall_clock_ms: 0 } });

describe('collapsed section display projection', () => {
  const graph = freeze({
    nodes: [
      { id: 'a1', sectionId: 'a', x: 123, y: -45 },
      { id: 'a2', sectionId: 'a', x: 456, y: 78 },
      { id: 'b', sectionId: 'b', x: 789, y: 90 },
      { id: 'outside', x: -321, y: 56 },
    ],
    edges: [
      { id: 'internal', from: 'a1', to: 'a2' },
      { id: 'forward1', from: 'a1', to: 'b' },
      { id: 'forward2', from: 'a2', to: 'b' },
      { id: 'reverse', from: 'b', to: 'a1' },
      { id: 'boundary', from: 'outside', to: 'a2' },
      { id: 'unchanged', from: 'outside', to: 'b' },
    ],
    sectionPanels: [
      { sectionId: 'a', name: 'A', x: 99, y: -69 },
      { sectionId: 'b', name: 'B', x: 765, y: 66 },
    ],
  });

  it('aggregates directed links, hides internal links and retains ungrouped nodes', () => {
    const projected = projectCollapsedSections(graph, new Set(['a', 'b']));
    expect(projected.nodes.map(n => n.id)).toEqual(['outside', 'submodel:a', 'submodel:b']);
    expect(projected.edges.find(e => e.from === 'submodel:a' && e.to === 'submodel:b')).toMatchObject({ count: 2, label: '2 connections', memberEdgeIds: ['forward1', 'forward2'] });
    expect(projected.edges.find(e => e.from === 'submodel:b' && e.to === 'submodel:a')).toMatchObject({ count: 1 });
    expect(projected.edges.some(e => e.from === e.to)).toBe(false);
    expect(projected.edges.find(e => e.from === 'outside' && e.to === 'submodel:a')).toMatchObject({ count: 1 });
  });

  it('supports partial collapse and exact nonmutating expansion after compact layout', () => {
    const before = JSON.stringify(graph);
    const partial = projectCollapsedSections(graph, new Set(['a']));
    expect(partial.nodes.find(n => n.id === 'b')).toBe(graph.nodes[2]);
    expect(partial.edges.find(e => e.id === 'unchanged')).toBe(graph.edges[5]);
    expect(partial.sectionPanels.map(p => p.sectionId)).toEqual(['b']);
    const compact = projectCollapsedSections(graph, new Set(['a', 'b']), { compact: true });
    const model = { graph: { nodes: graph.nodes } };
    expect(updateGraphLayout(model, compact, { viewport: { x: 9, y: 9, zoom: 0.1 } })).toBe(model);
    expect(compact.nodes.every(n => Number.isFinite(n.x) && Number.isFinite(n.y))).toBe(true);
    expect(projectCollapsedSections(graph)).toBe(graph);
    expect(projectCollapsedSections(graph, new Set(['missing']))).toBe(graph);
    expect(JSON.stringify(graph)).toBe(before);
  });

  it('projects all four sections of the actual supplied fixture without altering legacy data', () => {
    const model = freeze(structuredClone(fixture));
    const before = JSON.stringify(model);
    const detailed = deriveGraphFromModel(model);
    const overview = projectCollapsedSections(detailed, new Set(model.sections.map(s => s.id)), { compact: true });
    expect(overview.nodes.filter(n => n.virtual).map(n => n.label)).toEqual(['Acquisition', 'Billing & Payment', 'Collections & Arrears', 'Loss']);
    const endpoint = new Map(detailed.nodes.map(n => [n.id, n.sectionId ? `submodel:${n.sectionId}` : n.id]));
    const expected = new Map();
    detailed.edges.forEach(e => {
      const from = endpoint.get(e.from), to = endpoint.get(e.to);
      if (from === to) return;
      const key = JSON.stringify([from, to]);
      expected.set(key, (expected.get(key) || 0) + 1);
    });
    expect(new Map(overview.edges.map(e => [JSON.stringify([e.from, e.to]), e.count || 1]))).toEqual(expected);
    expect(projectCollapsedSections(detailed)).toBe(detailed);
    expect(JSON.stringify(model)).toBe(before);
    expect(validateModel(model)).toEqual({ errors: [], warnings: [] });
    expect(validateVisualGraph(detailed, model)).toEqual([]);
  });

  it('preserves real fixed-seed simulation results through repeated collapse and expansion', () => {
    const model = makeMM1Model(0.8, 1);
    const initialGraph = deriveGraphFromModel(model);
    model.sections = [{ id: 'process', name: 'Process', memberIds: initialGraph.nodes.map(n => n.refId) }];
    model.graph = { nodes: initialGraph.nodes.map((n, i) => ({ ...n, x: i * 317 - 80, y: i * 41 })) };
    const original = structuredClone(model);
    const baseline = buildEngine(original, 42, 0, 50, null, 2000, 200, true).runAll();
    const detailed = deriveGraphFromModel(freeze(model));
    for (let i = 0; i < 3; i++) {
      projectCollapsedSections(detailed, new Set(['process']), { compact: true });
      expect(projectCollapsedSections(detailed).nodes).toEqual(detailed.nodes);
    }
    const after = buildEngine(model, 42, 0, 50, null, 2000, 200, true).runAll();
    expect(baseline.summary.served).toBeGreaterThan(0);
    expect(withoutTiming(after)).toEqual(withoutTiming(baseline));
    expect(model).toEqual(original);
  });

  it('keeps actual electricity model fixed-seed results identical after overview', () => {
    const canonical = structuredClone(fixture);
    const baseline = buildEngine(canonical, 42, 0, 60, null, 5000, 200, true).runAll();
    const model = structuredClone(fixture);
    const detailed = freeze(deriveGraphFromModel(model));
    projectCollapsedSections(detailed, new Set(model.sections.map(s => s.id)), { compact: true });
    const after = buildEngine(model, 42, 0, 60, null, 5000, 200, true).runAll();
    expect(baseline.entitySummary.length).toBeGreaterThan(0);
    expect(baseline.summary.total).toBeGreaterThan(0);
    expect(baseline.log.some(entry => entry.phase === 'B')).toBe(true);
    expect(withoutTiming(after)).toEqual(withoutTiming(baseline));
    expect(model).toEqual(canonical);
  });
});
