import { useEffect, useMemo, useRef, useState } from "react";
import { Tag, Btn, SH, InfoBox, Empty, CommitInput } from "../shared/components.jsx";
import { deriveGraphFromModel, VISUAL_NODE_TYPES } from "./graph.js";
import { buildModelDefinitionHtml } from "../../reports/reportGenerator.js";
import { validateVisualGraph, addVisualNode, addVisualPattern, deleteVisualNode, deleteVisualNodes, duplicateVisualNodes, connectVisualNodes, updateVisualNode, deleteVisualEdge, updateProbabilisticBranchProbability, findNodeDependents, updateGraphLayout, validateVisualConnection, VISUAL_PATTERNS } from "./graph-operations.js";
import { FlowDiagramReactFlow } from "./FlowDiagramReactFlow.jsx";
import { VisualNodeInspector } from "./VisualNodeInspector.jsx";
import { validateModel } from "../../engine/validation.js";
import { renameEntityType } from "../../engine/queue-refs.js";
import { useTheme } from "../shared/ThemeContext.jsx";

function DeleteNodeDialog({ node, nodes = [], dependents, onConfirm, onCancel }) {
  const { C, FONT } = useTheme();
  const count = nodes.length || (node ? 1 : 0);
  const title = count > 1 ? `Delete ${count} selected nodes?` : `Delete ${node?.label || "node"}?`;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Confirm node deletion"
      onClick={e => { if (e.target === e.currentTarget) onCancel(); }}
      style={{
        position: "fixed",
        inset: 0,
        background: C.overlay,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
      }}
    >
      <div style={{
        background: C.surface,
        border: `1px solid ${C.red}55`,
        borderRadius: 8,
        padding: 24,
        maxWidth: 440,
        width: "90%",
        display: "flex",
        flexDirection: "column",
        gap: 14,
        fontFamily: FONT,
      }}>
        <div style={{ color: C.red, fontSize: 13, fontWeight: 700 }}>
          {title}
        </div>
        {dependents.length > 0 && (
          <>
            <div style={{ color: C.text, fontSize: 12 }}>
              Deleting this node will also affect:
            </div>
            <ul style={{ margin: 0, padding: "0 0 0 16px", display: "flex", flexDirection: "column", gap: 5 }}>
              {dependents.map((dep, i) => (
                <li key={i} style={{ color: C.muted, fontSize: 11 }}>
                  <span style={{ color: C.text, fontWeight: 600 }}>{dep.name}</span>
                  {" "}
                  <span style={{ color: C.muted }}>({dep.elementType})</span>
                  {" — "}
                  <span>{dep.description}</span>
                </li>
              ))}
            </ul>
          </>
        )}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <Btn small variant="ghost" onClick={onCancel}>Cancel</Btn>
          <Btn small variant="danger" onClick={onConfirm}>Delete</Btn>
        </div>
      </div>
    </div>
  );
}

// Maps a validateModel error/warning to the canvas nodes that own it,
// using structured affectedIds (eventIds, queueIds, entityTypeIds) matched against node refId.
// Returns an array of matching graph node IDs (may be empty).
function findNodesForError(item, graph) {
  const nodes = graph?.nodes || [];
  const ids = new Set();

  if (item.affectedIds?.eventIds?.length) {
    const eventIdSet = new Set(item.affectedIds.eventIds);
    if (item.tab === "cevents") {
      nodes
        .filter(n => n.type === VISUAL_NODE_TYPES.ACTIVITY && eventIdSet.has(n.refId))
        .forEach(n => ids.add(n.id));
    } else if (item.tab === "bevents") {
      nodes
        .filter(n => (n.type === VISUAL_NODE_TYPES.SOURCE || n.type === VISUAL_NODE_TYPES.SINK) && eventIdSet.has(n.refId))
        .forEach(n => ids.add(n.id));
    }
  }

  if (item.affectedIds?.queueIds?.length) {
    const queueIdSet = new Set(item.affectedIds.queueIds);
    if (item.tab === "queues") {
      nodes
        .filter(n => n.type === VISUAL_NODE_TYPES.QUEUE && queueIdSet.has(n.refId))
        .forEach(n => ids.add(n.id));
    }
  }

  if (!ids.size) {
    const match = (item.message || "").match(/'([^']+)'/);
    const name = match?.[1];
    if (!name) return [];
    let found = null;
    if (item.tab === "cevents") {
      found = nodes.find(n => n.type === VISUAL_NODE_TYPES.ACTIVITY && n.label === name);
    } else if (item.tab === "bevents") {
      found = nodes.find(n => (n.type === VISUAL_NODE_TYPES.SOURCE || n.type === VISUAL_NODE_TYPES.SINK) && n.label === name);
    } else if (item.tab === "queues") {
      found = nodes.find(n => n.type === VISUAL_NODE_TYPES.QUEUE && n.label === name);
    }
    if (found) ids.add(found.id);
  }

  return [...ids];
}

// Clickable checklist combining visual-graph warnings with canonical model errors/warnings.
// Each row with a known nodeId pans the canvas to that node and selects it.
function ValidationChecklist({ visualIssues, modelErrors, modelWarnings, graph, onFocusNode }) {
  const { C, FONT } = useTheme();
  const items = [
    ...visualIssues.map((issue, i) => ({
      key: `vis-${i}`,
      message: issue.message,
      nodeId: issue.nodeId ?? null,
      severity: "warning",
    })),
    ...modelErrors.map((err, i) => ({
      key: `err-${err.code}-${i}`,
      message: `[${err.code}] ${err.message}`,
      nodeId: findNodesForError(err, graph)[0] || null,
      severity: "error",
    })),
    ...modelWarnings.map((warn, i) => ({
      key: `warn-${warn.code}-${i}`,
      message: `[${warn.code}] ${warn.message}`,
      nodeId: findNodesForError(warn, graph)[0] || null,
      severity: "warning",
    })),
  ];

  const hasIssues = items.length > 0;
  const errCount = modelErrors.length;
  const warnCount = visualIssues.length + modelWarnings.length;

  return (
    <div
      aria-label="Validation checklist"
      style={{
        background: !hasIssues ? `${C.green}10` : `${C.amber}08`,
        border: `1px solid ${!hasIssues ? `${C.green}44` : `${C.border}`}`,
        borderRadius: 6,
        fontFamily: FONT,
        overflow: "hidden",
      }}
    >
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 6,
        padding: "7px 10px",
        borderBottom: hasIssues ? `1px solid ${C.border}` : "none",
        flexWrap: "wrap",
      }}>
        <span style={{
          color: !hasIssues ? C.green : C.muted,
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: 1,
          textTransform: "uppercase",
        }}>
          Validation
        </span>
        {!hasIssues && (
          <span style={{ color: C.green, fontSize: 10 }}>✓ clear</span>
        )}
        {hasIssues && (
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {errCount > 0 && <Tag label={`${errCount} error${errCount > 1 ? "s" : ""}`} color={C.red} />}
            {warnCount > 0 && <Tag label={`${warnCount} warning${warnCount > 1 ? "s" : ""}`} color={C.amber} />}
          </div>
        )}
      </div>
      {hasIssues && (
        <div role="list" style={{ maxHeight: 180, overflowY: "auto" }}>
          {items.map(item => (
            <button
              key={item.key}
              type="button"
              title={item.message}
              aria-label={item.message}
              onClick={() => item.nodeId && onFocusNode?.(item.nodeId)}
              style={{
                alignItems: "flex-start",
                background: "transparent",
                border: "none",
                borderBottom: `1px solid ${C.border}`,
                color: item.severity === "error" ? C.red : C.amber,
                cursor: item.nodeId ? "pointer" : "default",
                display: "flex",
                fontFamily: FONT,
                fontSize: 10,
                gap: 6,
                padding: "7px 10px",
                textAlign: "left",
                width: "100%",
              }}
            >
              <span style={{ flexShrink: 0, lineHeight: "14px" }}>
                {item.severity === "error" ? "●" : "◆"}
              </span>
              <span style={{
                color: item.nodeId ? C.text : C.muted,
                lineHeight: 1.4,
                wordBreak: "break-word",
                minWidth: 0,
              }}>
                {item.message}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function VisualDesignerPanel({ model, canEdit = false, onModelChange, onModelInit, flowKey = 0, fitAllRef }) {
  const { C, FONT } = useTheme();
  const PALETTE_ITEMS = [
    { type: VISUAL_NODE_TYPES.SOURCE,   label: "Add Source",   icon: "S", color: C.green },
    { type: VISUAL_NODE_TYPES.QUEUE,    label: "Add Queue",    icon: "Q", color: C.cEvent },
    { type: VISUAL_NODE_TYPES.ACTIVITY, label: "Add Activity", icon: "A", color: C.purple },
    { type: VISUAL_NODE_TYPES.SINK,     label: "Add Sink",     icon: "✕", color: C.red },
  ];
  const ICON_BTN_BASE = {
    background: "transparent", border: "none", borderRadius: 3,
    color: C.muted, cursor: "pointer", fontFamily: FONT,
    fontSize: 13, lineHeight: 1, padding: "2px 5px",
  };
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [selectedNodeIds, setSelectedNodeIds] = useState([]);
  const [selectedEdgeId, setSelectedEdgeId] = useState(null);
  const [message, setMessage] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [selectedPatternId, setSelectedPatternId] = useState(VISUAL_PATTERNS[0]?.id || "");
  const [paletteCollapsed, setPaletteCollapsed] = useState(() => {
    try { return localStorage.getItem("des.palette.collapsed") === "1"; } catch { return false; }
  });
  const [showSections, setShowSections] = useState(() => {
    try { return localStorage.getItem("des.sections.show") !== "0"; } catch { return true; }
  });
  const [inspectorCollapsed, setInspectorCollapsed] = useState(false);
  const [expandedShiftIds, setExpandedShiftIds] = useState(new Set());
  const toggleShiftExpand = (id) => setExpandedShiftIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const addShiftPeriod = (entityIdx) => {
    const next = [...(model.entityTypes || [])];
    const schedule = [...(next[entityIdx].shiftSchedule || [])];
    const last = schedule[schedule.length - 1];
    schedule.push({ time: last ? String((parseFloat(last.time) || 0) + 60) : "0", capacity: last?.capacity || next[entityIdx].count || "1" });
    next[entityIdx] = { ...next[entityIdx], shiftSchedule: schedule };
    applyModel({ ...model, entityTypes: next });
  };
  const updShiftPeriod = (entityIdx, periodIdx, patch) => {
    const next = [...(model.entityTypes || [])];
    const schedule = [...(next[entityIdx].shiftSchedule || [])];
    schedule[periodIdx] = { ...schedule[periodIdx], ...patch };
    next[entityIdx] = { ...next[entityIdx], shiftSchedule: schedule };
    applyModel({ ...model, entityTypes: next });
  };
  const remShiftPeriod = (entityIdx, periodIdx) => {
    const next = [...(model.entityTypes || [])];
    next[entityIdx] = { ...next[entityIdx], shiftSchedule: (next[entityIdx].shiftSchedule || []).filter((_, idx) => idx !== periodIdx) };
    applyModel({ ...model, entityTypes: next });
  };
  const enableShiftSchedule = (entityIdx, enable) => {
    const next = [...(model.entityTypes || [])];
    next[entityIdx] = { ...next[entityIdx], shiftSchedule: enable
      ? (Array.isArray(next[entityIdx].shiftSchedule) && next[entityIdx].shiftSchedule.length
          ? next[entityIdx].shiftSchedule
          : [{ time: "0", capacity: next[entityIdx].count || "1" }])
      : undefined };
    applyModel({ ...model, entityTypes: next });
  };
  // Ref set by CanvasControls (inside ReactFlow) to expose fitView for specific nodes
  const fitNodeRef = useRef(null);
  const graph = useMemo(() => deriveGraphFromModel(model || {}), [model]);
  const storedViewport = useMemo(() => {
    try { return JSON.parse(localStorage.getItem(`des.vp.${model?.id}`) || 'null'); } catch { return null; }
  }, [model?.id]);
  const graphWithViewport = useMemo(() =>
    storedViewport ? { ...graph, viewport: storedViewport } : graph,
  [graph, storedViewport]);
  const visualIssues = useMemo(() => validateVisualGraph(graph), [graph]);
  const modelValidation = useMemo(() => validateModel(model || {}), [model]);
  // Derived map of canvas node ID -> validation messages — never stored in model_json.
  // A Map (not just a Set) so the canvas badge can show the message on hover instead of
  // forcing the user to switch to the Validate tab to learn why a node is flagged.
  const errorNodeIds = useMemo(() => {
    const messagesByNode = new Map();
    const addMessage = (nodeId, message) => {
      if (!nodeId || !message) return;
      const existing = messagesByNode.get(nodeId) || [];
      if (!existing.includes(message)) messagesByNode.set(nodeId, [...existing, message]);
    };
    visualIssues.forEach(issue => addMessage(issue.nodeId, issue.message));
    [...modelValidation.errors, ...modelValidation.warnings].forEach(item => {
      findNodesForError(item, graph).forEach(id => addMessage(id, item.message));
    });
    return messagesByNode;
  }, [visualIssues, modelValidation, graph]);

  const isStarterBlank = !(model?.queues || []).length &&
    !(model?.bEvents || []).length &&
    !(model?.cEvents || []).length;
  const applyModel = nextModel => {
    setMessage(null);
    onModelChange?.(nextModel);
  };
  const selectedNodes = useMemo(() => {
    const ids = new Set(selectedNodeIds);
    return (graph.nodes || []).filter(node => ids.has(node.id));
  }, [graph.nodes, selectedNodeIds]);
  const inspectorNodeId = selectedNodeIds.length === 1 ? selectedNodeIds[0] : null;

  const clearSelection = () => {
    setSelectedNodeIds([]);
    setSelectedNodeId(null);
    setSelectedEdgeId(null);
  };

  // Single selection model: node(s) XOR edge — selecting one clears the other.
  const selectEdge = (edgeId) => {
    setSelectedEdgeId(edgeId);
    if (edgeId) {
      setSelectedNodeIds([]);
      setSelectedNodeId(null);
    }
  };

  const selectNode = (nodeId, options = {}) => {
    if (!nodeId) {
      clearSelection();
      return;
    }
    setSelectedEdgeId(null);
    if (options.toggle) {
      setSelectedNodeIds(prev => {
        const set = new Set(prev);
        if (set.has(nodeId)) set.delete(nodeId);
        else set.add(nodeId);
        const next = [...set];
        setSelectedNodeId(next.includes(nodeId) ? nodeId : (next[0] || null));
        return next;
      });
      return;
    }
    setSelectedNodeIds([nodeId]);
    setSelectedNodeId(nodeId);
  };

  const syncSelection = ids => {
    const next = [...new Set(ids || [])];
    setSelectedNodeIds(prev =>
      prev.length === next.length && next.every(id => prev.includes(id)) ? prev : next
    );
    setSelectedNodeId(current => next.includes(current) ? current : (next[0] || null));
  };

  // Auto-open inspector whenever a node is selected
  useEffect(() => {
    if (inspectorNodeId) setInspectorCollapsed(false);
  }, [inspectorNodeId]);

  useEffect(() => {
    const validIds = new Set((graph.nodes || []).map(node => node.id));
    setSelectedNodeIds(prev => prev.filter(id => validIds.has(id)));
    setSelectedNodeId(prev => prev && validIds.has(prev) ? prev : null);
  }, [graph.nodes]);

  useEffect(() => {
    const validEdgeIds = new Set((graph.edges || []).map(edge => edge.id));
    setSelectedEdgeId(prev => prev && validEdgeIds.has(prev) ? prev : null);
  }, [graph.edges]);

  const togglePalette = () => {
    setPaletteCollapsed(prev => {
      const next = !prev;
      try { localStorage.setItem("des.palette.collapsed", next ? "1" : "0"); } catch {}
      return next;
    });
  };


  function doDelete(targetNode, targetNodes = null) {
    const nodesToDelete = targetNodes?.length ? targetNodes : (targetNode ? [targetNode] : []);
    const nextModel = nodesToDelete.length > 1
      ? deleteVisualNodes(model, nodesToDelete)
      : deleteVisualNode(model, targetNode);
    clearSelection();
    setPendingDelete(null);
    applyModel(nextModel);
  }

  function deleteNode(targetNode) {
    if (!targetNode) return;
    const deps = findNodeDependents(model, targetNode);
    if (deps.length > 0) {
      setPendingDelete({ node: targetNode, dependents: deps });
    } else {
      doDelete(targetNode);
    }
  }

  function deleteSelectedNodes() {
    if (!canEdit || selectedNodes.length === 0) return;
    const deps = selectedNodes.flatMap(node => findNodeDependents(model, node));
    if (deps.length > 0 || selectedNodes.length > 1) {
      setPendingDelete({ node: selectedNodes[0], nodes: selectedNodes, dependents: deps });
    } else {
      doDelete(selectedNodes[0], selectedNodes);
    }
  }

  // Clipboard holds a snapshot of copied nodes (not live refs) so later edits to the
  // originals don't change what gets pasted; pasteOffsetRef grows with each repeated
  // paste so copies don't stack exactly on top of each other or the previous paste.
  const clipboardRef = useRef([]);
  const pasteOffsetRef = useRef(0);

  function copySelectedNodes() {
    if (selectedNodes.length === 0) return;
    clipboardRef.current = selectedNodes.map(node => ({ type: node.type, refId: node.refId, x: node.x, y: node.y }));
    pasteOffsetRef.current = 0;
    setMessage({ state: "success", text: `Copied ${selectedNodes.length} node${selectedNodes.length > 1 ? "s" : ""}.` });
  }

  function pasteFromClipboard() {
    if (!canEdit || clipboardRef.current.length === 0) return;
    pasteOffsetRef.current += 1;
    const offset = { x: 48 * pasteOffsetRef.current, y: 48 * pasteOffsetRef.current };
    const { model: next, newNodeIds } = duplicateVisualNodes(model, clipboardRef.current, offset);
    if (newNodeIds.length === 0) return;
    applyModel(next);
    syncSelection(newNodeIds);
    setMessage({ state: "success", text: `Pasted ${newNodeIds.length} node${newNodeIds.length > 1 ? "s" : ""}.` });
  }

  function duplicateSelectedNodes() {
    if (!canEdit || selectedNodes.length === 0) return;
    const { model: next, newNodeIds } = duplicateVisualNodes(model, selectedNodes);
    if (newNodeIds.length === 0) return;
    applyModel(next);
    syncSelection(newNodeIds);
    setMessage({ state: "success", text: `Duplicated ${newNodeIds.length} node${newNodeIds.length > 1 ? "s" : ""}.` });
  }

  // Ref holds latest closures so keydown/keyup listeners never go stale.
  const kbRef = useRef(null);

  useEffect(() => {
    const ARROW_DELTA = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
    const onKeyDown = e => {
      const tag = e.target?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return;
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        const { canEdit: ce, selectedEdgeId: edgeId, deleteEdge: delEdge } = kbRef.current;
        if (ce && edgeId) {
          delEdge(edgeId);
          return;
        }
        kbRef.current.deleteSelectedNodes();
        return;
      }
      if (e.key === "Escape") {
        kbRef.current.clearSelection();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "c") {
        kbRef.current.copySelectedNodes();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "v") {
        e.preventDefault();
        kbRef.current.pasteFromClipboard();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "d") {
        e.preventDefault();
        kbRef.current.duplicateSelectedNodes();
        return;
      }
      const delta = ARROW_DELTA[e.key];
      if (delta) {
        e.preventDefault();
        const { canEdit: ce, graph: g, selectedNodeIds: ids, moveNodes: mv } = kbRef.current;
        if (!ce || !ids.length) return;
        const step = e.shiftKey ? 24 : 1;
        const moved = ids
          .map(id => g.nodes.find(n => n.id === id))
          .filter(Boolean)
          .map(n => ({ id: n.id, x: n.x + delta[0] * step, y: n.y + delta[1] * step }));
        mv(moved);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const addNode = (type, position = null) => {
    if (!canEdit) return;
    let next = addVisualNode(model, type, position);
    let nextGraph = deriveGraphFromModel(next);
    const newest = [...nextGraph.nodes].reverse().find(node => node.type === type);
    const selectedNode = inspectorNodeId ? graph.nodes.find(node => node.id === inspectorNodeId) : null;
    const autoLinkTypes = [VISUAL_NODE_TYPES.SOURCE, VISUAL_NODE_TYPES.ACTIVITY];
    if (selectedNode && newest && selectedNode.id !== newest.id && autoLinkTypes.includes(selectedNode.type)) {
      const validation = validateVisualConnection(nextGraph, selectedNode.id, newest.id);
      if (validation.ok) {
        next = connectVisualNodes(next, nextGraph, selectedNode.id, newest.id).model;
        nextGraph = deriveGraphFromModel(next);
        const linkedNewest = nextGraph.nodes.find(node => node.id === newest.id);
        applyModel(next);
        selectNode(linkedNewest?.id || newest.id);
        setMessage({
          state: "success",
          text: `${selectedNode.label} linked to ${linkedNewest?.label || newest.label}.`,
        });
        return;
      }
    }
    applyModel(next);
    if (newest?.id) selectNode(newest.id);
  };
  const addPattern = () => {
    if (!canEdit || !selectedPatternId) return;
    const pattern = VISUAL_PATTERNS.find(item => item.id === selectedPatternId);
    const selectedNode = inspectorNodeId ? graph.nodes.find(node => node.id === inspectorNodeId) : null;
    const result = addVisualPattern(model, selectedPatternId, { anchorNode: selectedNode });
    applyModel(result.model);
    clearSelection();
    setMessage({
      state: "success",
      text: result.appliedToSelection
        ? `${pattern?.label || "Pattern"} applied to selected flow. Review names and timing before running.`
        : `${pattern?.label || "Pattern"} added. Review names and timing before running.`,
    });
  };
  const moveNode = (nodeId, position) => {
    if (!canEdit) return;
    applyModel(updateGraphLayout(model, graph, { nodes: [{ id: nodeId, x: position.x, y: position.y }] }));
  };
  const moveNodes = (nodes) => {
    if (!canEdit || !nodes?.length) return;
    applyModel(updateGraphLayout(model, graph, { nodes }));
  };
  const changeViewport = viewport => {
    if (!canEdit || !viewport) return;
    try { localStorage.setItem(`des.vp.${model?.id}`, JSON.stringify(viewport)); } catch {}
  };
  const connectNodes = (from, to) => {
    if (!canEdit) return;
    const result = connectVisualNodes(model, graph, from, to);
    if (!result.validation.ok) {
      setMessage({ state: "error", text: result.validation.message });
      return;
    }
    applyModel(result.model);
    if (result.validation.loop) {
      setMessage({ state: "success", text: `Loop back-edge created — configure rework limit in the B-Event editor (max ${result.validation.maxLoopCount || 3}x).` });
    } else {
      setMessage({ state: "success", text: "Connection applied to the canonical model." });
    }
  };
  const patchNode = (node, patch) => {
    if (!canEdit) return;
    const next = updateVisualNode(model, node, patch);
    applyModel(next);
    const updated = deriveGraphFromModel(next).nodes.find(item => item.refId === node.refId && item.type === node.type);
    if (updated) selectNode(updated.id);
  };
  const deleteEdge = (edgeId) => {
    if (!canEdit) return;
    const nextModel = deleteVisualEdge(model, graph, edgeId);
    applyModel(nextModel);
    setMessage({ state: "success", text: "Connection removed." });
  };
  const editProbability = (edge, probability) => {
    if (!canEdit) return;
    applyModel(updateProbabilisticBranchProbability(model, edge, probability));
  };
  kbRef.current = { deleteSelectedNodes, graph, selectedNodeIds, moveNodes, canEdit, selectedEdgeId, deleteEdge, clearSelection, copySelectedNodes, pasteFromClipboard, duplicateSelectedNodes };
  const resetLayout = () => {
    if (!canEdit) return;
    applyModel({ ...model, graph: model.graph ? { ...model.graph, nodes: [] } : undefined });
  };

  // Pan/zoom the canvas to a node and open its inspector.
  const focusNode = (nodeId) => {
    selectNode(nodeId);
    fitNodeRef.current?.(nodeId);
  };

  // Auto-dismiss the canvas status message after a short delay.
  useEffect(() => {
    if (!message) return;
    const ms = message.state === "error" ? 4000 : 2000;
    const timer = setTimeout(() => setMessage(null), ms);
    return () => clearTimeout(timer);
  }, [message]);

  const inspectorOpen = Boolean(inspectorNodeId) && !inspectorCollapsed;

  return (
    <div aria-label="Visual Designer" style={{ display: "flex", flexDirection: "column", gap: 14 }}>

      <div style={{ display: "flex", gap: 12, alignItems: "stretch", minWidth: 0 }}>

        {/* ── Node Palette ── */}
        <div style={{
          flexShrink: 0,
          width: paletteCollapsed ? 44 : 240,
          transition: "width 220ms cubic-bezier(0.4,0,0.2,1)",
          overflow: "hidden",
        }}>
          {paletteCollapsed ? (
            /* Collapsed icon strip */
            <div style={{
              width: 44,
              background: C.panel,
              border: `1px solid ${C.border}`,
              borderRadius: 6,
              padding: "8px 4px",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 6,
            }}>
              <button
                type="button"
                onClick={togglePalette}
                title="Expand palette"
                aria-label="Expand node palette"
                style={{
                  ...ICON_BTN_BASE,
                  border: `1px solid ${C.border}`,
                  borderRadius: 4,
                  padding: "4px 6px",
                  fontSize: 12,
                }}
              >›</button>
              {PALETTE_ITEMS.map(item => (
                <button
                  key={item.type}
                  type="button"
                  draggable={canEdit}
                  disabled={!canEdit}
                  title={item.label}
                  aria-label={item.label}
                  onDragStart={e => {
                    e.dataTransfer.setData("application/simmodlr-node", item.type);
                    e.dataTransfer.effectAllowed = "copy";
                  }}
                  onClick={() => addNode(item.type)}
                  style={{
                    background: `${item.color}18`,
                    border: `1px solid ${item.color}55`,
                    borderRadius: 4,
                    color: item.color,
                    cursor: canEdit ? "grab" : "not-allowed",
                    fontFamily: FONT,
                    fontSize: 11,
                    fontWeight: 700,
                    lineHeight: 1,
                    opacity: canEdit ? 1 : 0.45,
                    padding: "6px 0",
                    textAlign: "center",
                    width: 32,
                  }}
                >{item.icon}</button>
              ))}
            </div>
          ) : (
            /* Expanded palette */
            <div style={{
              width: 240,
              background: C.panel,
              border: `1px solid ${C.border}`,
              borderRadius: 6,
              padding: 12,
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ color: C.muted, fontFamily: FONT, fontSize: 10, letterSpacing: 1.5, fontWeight: 700 }}>NODE PALETTE</span>
                <button
                  type="button"
                  onClick={togglePalette}
                  title="Collapse palette"
                  aria-label="Collapse node palette"
                  style={ICON_BTN_BASE}
                >‹</button>
              </div>

              {PALETTE_ITEMS.map(item => (
                <button
                  key={item.type}
                  type="button"
                  draggable={canEdit}
                  disabled={!canEdit}
                  onDragStart={e => {
                    e.dataTransfer.setData("application/simmodlr-node", item.type);
                    e.dataTransfer.effectAllowed = "copy";
                  }}
                  onClick={() => addNode(item.type)}
                  style={{
                    background: C.surfaceHover,
                    color: item.color,
                    border: `1px solid ${item.color}66`,
                    borderRadius: 5,
                    padding: "4px 10px",
                    fontSize: 11,
                    fontWeight: 600,
                    fontFamily: FONT,
                    cursor: canEdit ? "grab" : "not-allowed",
                    opacity: canEdit ? 1 : 0.45,
                    textAlign: "left",
                  }}
                >{item.label}</button>
              ))}

              <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 8, marginTop: 2, display: "flex", flexDirection: "column", gap: 6 }}>
                <label htmlFor="visual-pattern-select" style={{ color: C.muted, fontFamily: FONT, fontSize: 10, letterSpacing: 1.5, fontWeight: 700 }}>
                  ADD PATTERN
                </label>
                <select
                  id="visual-pattern-select"
                  value={selectedPatternId}
                  disabled={!canEdit}
                  onChange={e => setSelectedPatternId(e.target.value)}
                  style={{
                    width: "100%",
                    background: C.bg,
                    border: `1px solid ${C.border}`,
                    borderRadius: 4,
                    color: C.text,
                    fontFamily: FONT,
                    fontSize: 11,
                    padding: "5px 7px",
                    outline: "none",
                  }}
                >
                  {VISUAL_PATTERNS.map(pattern => (
                    <option key={pattern.id} value={pattern.id}>{pattern.label}</option>
                  ))}
                </select>
                <div style={{ color: C.muted, fontFamily: FONT, fontSize: 9, lineHeight: 1.4 }}>
                  {selectedNodeIds.length > 0
                    ? "Selection-aware: compatible patterns update the selected node or flow."
                    : VISUAL_PATTERNS.find(pattern => pattern.id === selectedPatternId)?.hint}
                </div>
                <Btn small variant="ghost" disabled={!canEdit || !selectedPatternId} onClick={addPattern}>
                  Add pattern
                </Btn>
              </div>

              {/* Entity Types section */}
              <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 8, marginTop: 4 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <span style={{ color: C.muted, fontFamily: FONT, fontSize: 10, letterSpacing: 1.5, fontWeight: 700 }}>ENTITY TYPES</span>
                  {canEdit && <Btn small variant="ghost" onClick={() => {
                    const next = [...(model.entityTypes || []), { id: "et" + Date.now(), name: "", role: "customer", count: "1", attrDefs: [] }];
                    applyModel({ ...model, entityTypes: next });
                  }}>+ Add</Btn>}
                </div>
                {(model.entityTypes || []).length === 0 && (
                  <div style={{ color: C.muted, fontFamily: FONT, fontSize: 9, fontStyle: "italic" }}>
                    No entity types defined.
                  </div>
                )}
                {(model.entityTypes || []).map((et, i) => {
                  const hasShifts = et.role === "server" && Array.isArray(et.shiftSchedule) && et.shiftSchedule.length > 0;
                  const shiftFirstCap = hasShifts ? parseInt(et.shiftSchedule[0]?.capacity, 10) || 1 : null;
                  const shiftLastCap = hasShifts ? parseInt(et.shiftSchedule[et.shiftSchedule.length - 1]?.capacity, 10) || 1 : null;
                  const shiftSummary = hasShifts ? (shiftFirstCap === shiftLastCap ? shiftFirstCap : `${shiftFirstCap}-${shiftLastCap}`) : null;
                  const isShiftExpanded = expandedShiftIds.has(et.id);
                  const gridCols = et.role === "server" && hasShifts
                    ? "minmax(0, 1fr) 66px minmax(0, 1fr) 20px 14px"
                    : et.role === "server"
                      ? "minmax(0, 1fr) 66px 44px 14px"
                      : "minmax(0, 1fr) 66px 14px";
                  return (
                  <div key={et.id || i}>
                    <div style={{
                      display: "grid",
                      gridTemplateColumns: gridCols,
                      alignItems: "center", gap: 4, padding: "3px 4px",
                      background: C.bg, borderRadius: 4, marginBottom: 1,
                      border: `1px solid ${et.role === "server" ? C.server + "44" : C.cEvent + "33"}`,
                      borderLeft: `2px solid ${et.role === "server" ? C.server : C.cEvent}`,
                    }}>
                      <CommitInput
                        value={et.name}
                        onCommit={value => {
                          const oldName = et.name || "";
                          const next = [...(model.entityTypes || [])];
                          next[i] = { ...next[i], name: value };
                          const renamed = value && oldName && value !== oldName
                            ? renameEntityType({ ...model, entityTypes: next }, oldName, value, et.role || "customer")
                            : { ...model, entityTypes: next };
                          applyModel(renamed);
                        }}
                        placeholder="Name"
                        maxLength={20}
                        disabled={!canEdit}
                        ariaLabel={`Entity type ${i + 1} name`}
                        style={{ width: "100%", minWidth: 0, background: "transparent", border: "none", color: C.text, fontFamily: FONT, fontSize: 10, padding: "2px 4px", outline: "none" }}
                      />
                      <select value={et.role || "customer"} onChange={e => {
                        const next = [...(model.entityTypes || [])];
                        next[i] = { ...next[i], role: e.target.value, count: e.target.value === "server" ? (next[i].count || "1") : "" };
                        applyModel({ ...model, entityTypes: next });
                      }}
                        style={{ width: "100%", background: "transparent", border: `1px solid ${C.border}`, borderRadius: 3, color: et.role === "server" ? C.server : C.cEvent, fontFamily: FONT, fontSize: 9, padding: "1px 3px", outline: "none" }}>
                        <option value="customer">Entity</option>
                        <option value="server">Server</option>
                      </select>
                      {et.role === "server" && !hasShifts && (
                        <input type="number" min="1" value={et.count || "1"} onChange={e => {
                          const next = [...(model.entityTypes || [])];
                          next[i] = { ...next[i], count: parseInt(e.target.value, 10) || "1" };
                          applyModel({ ...model, entityTypes: next });
                        }}
                          style={{ width: "100%", boxSizing: "border-box", background: "transparent", border: `1px solid ${C.border}`, borderRadius: 3, color: C.amber, fontFamily: FONT, fontSize: 10, padding: "2px 3px", outline: "none", textAlign: "center" }}
                        />
                      )}
                      {et.role === "server" && hasShifts && (
                        <span title={`${et.shiftSchedule.length} shift period${et.shiftSchedule.length !== 1 ? "s" : ""} — pool varies from ${shiftFirstCap} to ${shiftLastCap}`}
                          style={{ fontSize: 10, color: C.server, fontFamily: FONT, fontWeight: 700, textAlign: "center", background: `${C.server}15`, borderRadius: 3, padding: "2px 4px", cursor: "pointer", whiteSpace: "nowrap" }}
                          onClick={() => toggleShiftExpand(et.id)}>
                          {shiftSummary} shifts
                        </span>
                      )}
                      {et.role === "server" && hasShifts && (
                        <button type="button" onClick={() => toggleShiftExpand(et.id)}
                          title={isShiftExpanded ? "Hide shift periods" : "Show shift periods"}
                          style={{ background: "none", border: "none", color: isShiftExpanded ? C.server : C.muted, cursor: "pointer", fontSize: 11, padding: "0 2px", lineHeight: 1 }}>
                          {isShiftExpanded ? "▾" : "▸"}
                        </button>
                      )}
                      {canEdit && (
                        <button type="button" onClick={() => {
                          const next = (model.entityTypes || []).filter((_, idx) => idx !== i);
                          applyModel({ ...model, entityTypes: next });
                        }}
                          style={{ background: "none", border: "none", color: C.red, cursor: "pointer", fontSize: 11, padding: "0 2px", lineHeight: 1 }}>✕</button>
                      )}
                    </div>
                    {et.role === "server" && hasShifts && isShiftExpanded && (
                      <div style={{
                        background: `${C.server}08`,
                        border: `1px solid ${C.server}22`,
                        borderTop: "none",
                        borderRadius: "0 0 4px 4px",
                        padding: "8px 10px",
                        marginBottom: 4,
                        display: "flex",
                        flexDirection: "column",
                        gap: 6,
                      }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                          <span style={{ fontSize: 9, color: C.muted, fontFamily: FONT, letterSpacing: 1, fontWeight: 700 }}>SHIFT SCHEDULE</span>
                          {canEdit && (
                            <label style={{ display: "flex", alignItems: "center", gap: 4, cursor: "pointer", fontFamily: FONT, fontSize: 9, color: C.muted }}>
                              <input type="checkbox" checked={hasShifts} onChange={e => enableShiftSchedule(i, e.target.checked)} style={{ accentColor: C.server }} />
                              Enabled
                            </label>
                          )}
                        </div>
                        {canEdit && (
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <span style={{ fontSize: 9, color: C.muted, fontFamily: FONT, whiteSpace: "nowrap" }}>On downshift:</span>
                            <select value={et.shiftBehavior || "delay"} onChange={e => {
                              const next = [...(model.entityTypes || [])];
                              next[i] = { ...next[i], shiftBehavior: e.target.value };
                              applyModel({ ...model, entityTypes: next });
                            }}
                              style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 3, color: C.text, fontFamily: FONT, fontSize: 9, padding: "2px 4px", outline: "none" }}>
                              <option value="delay">Delay</option>
                              <option value="preempt">Preempt</option>
                              <option value="suspend">Suspend</option>
                            </select>
                          </div>
                        )}
                        {(et.shiftSchedule || []).map((step, j) => {
                          const time = parseFloat(step.time);
                          const prev = j > 0 ? parseFloat(et.shiftSchedule[j - 1].time) : null;
                          const capacity = Number(step.capacity);
                          const invalidTime = !Number.isFinite(time) || (j === 0 && time !== 0) || (j > 0 && Number.isFinite(prev) && time < prev);
                          const invalidCapacity = !Number.isInteger(capacity) || capacity < 1;
                          return (
                            <div key={j} style={{ display: "flex", gap: 6, alignItems: "center" }}>
                              <span style={{ fontSize: 9, color: C.muted, fontFamily: FONT, whiteSpace: "nowrap" }}>t={j === 0 ? "0" : time || ""}</span>
                              <input type="number" value={step.time ?? ""} disabled={j === 0} onChange={e => updShiftPeriod(i, j, { time: e.target.value })}
                                style={{ width: 52, background: "transparent", border: `1px solid ${invalidTime ? C.red : C.border}`, borderRadius: 3, color: C.amber, fontFamily: FONT, fontSize: 10, padding: "2px 4px", outline: "none", opacity: j === 0 ? 0.7 : 1 }}
                              />
                              <span style={{ fontSize: 9, color: C.muted, fontFamily: FONT, whiteSpace: "nowrap" }}>cap:</span>
                              <input type="number" value={step.capacity ?? ""} onChange={e => updShiftPeriod(i, j, { capacity: e.target.value })}
                                style={{ width: 44, background: "transparent", border: `1px solid ${invalidCapacity ? C.red : C.border}`, borderRadius: 3, color: C.server, fontFamily: FONT, fontSize: 10, padding: "2px 4px", outline: "none" }}
                              />
                              {canEdit && <button type="button" onClick={() => remShiftPeriod(i, j)}
                                style={{ background: "none", border: "none", color: C.red, cursor: "pointer", fontSize: 10, padding: 0, lineHeight: 1 }}>✕</button>}
                            </div>
                          );
                        })}
                        {canEdit && (
                          <button type="button" onClick={() => addShiftPeriod(i)}
                            style={{ background: "none", border: `1px dashed ${C.border}`, borderRadius: 3, color: C.muted, cursor: "pointer", fontFamily: FONT, fontSize: 9, padding: "3px 8px", alignSelf: "flex-start" }}>
                            + Add Period
                          </button>
                        )}
                        <div style={{ fontSize: 9, color: C.muted, fontFamily: FONT, fontStyle: "italic", lineHeight: 1.4 }}>
                          The first period sets the starting pool size. Shift changes add or remove idle servers at the scheduled times.
                        </div>
                      </div>
                    )}
                  </div>
                );})}
              </div>

              {(visualIssues.length > 0 || modelValidation.errors.length > 0 || modelValidation.warnings.length > 0) && (
                <ValidationChecklist
                  visualIssues={visualIssues}
                  modelErrors={modelValidation.errors}
                  modelWarnings={modelValidation.warnings}
                  graph={graph}
                  onFocusNode={focusNode}
                />
              )}
              <div style={{ color: C.muted, fontFamily: FONT, fontSize: 10, lineHeight: 1.5 }}>
                Click to add quickly, or drag onto the canvas to choose the starting position.
              </div>
            </div>
          )}
        </div>

        {/* ── Canvas ── */}
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{
            alignItems: "center",
            display: "flex",
            gap: 8,
            justifyContent: "space-between",
            minHeight: 34,
          }}>
            <div style={{ color: C.muted, fontFamily: FONT, fontSize: 10, fontWeight: 600 }}>
              {canEdit ? "Drag to select · Space or middle-drag to pan" : "Drag or scroll to pan · Click a node to inspect"}
            </div>

            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              {(model?.sections || []).length > 0 && (
                <button
                  type="button"
                  aria-pressed={showSections}
                  onClick={() => setShowSections(prev => {
                    const next = !prev;
                    try { localStorage.setItem("des.sections.show", next ? "1" : "0"); } catch {}
                    return next;
                  })}
                  title={showSections ? "Hide section overlays" : "Show section overlays"}
                  style={{
                    background: showSections ? `${C.accent}22` : "transparent",
                    border: `1px solid ${showSections ? C.accent : C.border}`,
                    borderRadius: 4,
                    color: showSections ? C.accent : C.muted,
                    cursor: "pointer",
                    fontFamily: FONT,
                    fontSize: 10,
                    fontWeight: 700,
                    padding: "5px 10px",
                  }}
                >
                  Sections
                </button>
              )}

              {selectedNodeIds.length > 0 && (
                <div
                  aria-label="Selection actions"
                  style={{
                    alignItems: "center",
                    background: C.panel,
                    border: `1px solid ${C.border}`,
                    borderRadius: 6,
                    display: "flex",
                    flexWrap: "wrap",
                    gap: 6,
                    justifyContent: "flex-end",
                    padding: "4px 6px",
                  }}
                >
                  <span style={{ color: C.muted, fontFamily: FONT, fontSize: 10, fontWeight: 700 }}>
                    {selectedNodeIds.length} selected
                  </span>
                  {canEdit && (
                    <Btn small variant="ghost" onClick={duplicateSelectedNodes}>
                      Duplicate
                    </Btn>
                  )}
                  <Btn small variant="ghost" onClick={copySelectedNodes}>
                    Copy
                  </Btn>
                  {canEdit && (
                    <Btn small variant="danger" onClick={deleteSelectedNodes}>
                      Delete
                    </Btn>
                  )}
                  <Btn small variant="ghost" onClick={clearSelection}>
                    Clear selection
                  </Btn>
                </div>
              )}
            </div>
          </div>
          {message && (
            <div role={message.state === "error" ? "alert" : "status"} style={{
              background: message.state === "error" ? C.red + "16" : C.green + "16",
              border: `1px solid ${message.state === "error" ? C.red : C.green}55`,
              borderRadius: 6,
              color: message.state === "error" ? C.red : C.green,
              fontFamily: FONT,
              fontSize: 11,
              padding: "8px 10px",
            }}>
              {message.text}
            </div>
          )}
          <div style={{ position: "relative", flex: 1, minHeight: 0 }}>
            <FlowDiagramReactFlow
              key={flowKey}
              graph={graphWithViewport}
              canEdit={canEdit}
              selectedNodeId={inspectorNodeId}
              selectedNodeIds={selectedNodeIds}
              selectedEdgeId={selectedEdgeId}
              errorNodeIds={errorNodeIds}
              fitNodeRef={fitNodeRef}
              fitAllRef={fitAllRef}
              showSections={showSections}
              onNodeSelect={selectNode}
              onNodeSelectionChange={syncSelection}
              onEdgeSelect={selectEdge}
              onDeleteEdge={canEdit ? deleteEdge : null}
              onEditProbability={editProbability}
              onNodeMove={moveNode}
              onNodesMove={moveNodes}
              onViewportChange={changeViewport}
              onConnectNodes={connectNodes}
              onDropNode={addNode}
              onResetLayout={canEdit ? resetLayout : null}
            />
            {isStarterBlank && canEdit && (
              <div style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 12,
                pointerEvents: "none",
              }}>
                <div style={{
                  background: C.panel,
                  border: `1px solid ${C.border}`,
                  borderRadius: 10,
                  padding: "20px 28px",
                  textAlign: "center",
                  pointerEvents: "auto",
                  maxWidth: 320,
                }}>
                  <div style={{ color: C.text, fontFamily: FONT, fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
                    Canvas is empty
                  </div>
                  <div style={{ color: C.muted, fontFamily: FONT, fontSize: 11, lineHeight: 1.5, marginBottom: 14 }}>
                    Pick a pattern from the left panel to build a flow instantly, or drag individual nodes onto the canvas to start from scratch.
                  </div>
                  <Btn small variant="primary" onClick={() => {
                    const patternId = selectedPatternId || "single-queue";
                    const result = addVisualPattern(model || {}, patternId);
                    applyModel(result.model);
                  }}>
                    Add "{(VISUAL_PATTERNS.find(p => p.id === selectedPatternId) || VISUAL_PATTERNS[0]).label}"
                  </Btn>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Inspector (width-animated, auto-hides when no node selected) ── */}
        <div style={{
          flexShrink: 0,
          width: inspectorOpen ? 280 : 0,
          transition: "width 220ms cubic-bezier(0.4,0,0.2,1)",
          overflow: "hidden",
        }}>
          {/* Fixed inner width prevents content reflow during the slide animation */}
          <div style={{ width: 280, borderLeft: `1px solid ${C.border}`, height: "100%", display: "flex", flexDirection: "column" }}>
            <VisualNodeInspector
              model={model}
              graph={graph}
              selectedNodeId={inspectorNodeId}
              canEdit={canEdit}
              onPatchNode={patchNode}
              onDeleteNode={canEdit ? deleteNode : null}
              onClose={() => setInspectorCollapsed(true)}
            />
          </div>
        </div>

        {/* Inspector re-open handle — visible when a node is selected but the inspector is dismissed */}
        {inspectorNodeId && inspectorCollapsed && (
          <button
            type="button"
            onClick={() => setInspectorCollapsed(false)}
            title="Open inspector"
            aria-label="Open inspector"
            style={{
              alignSelf: "flex-start",
              background: C.panel,
              border: `1px solid ${C.border}`,
              borderLeft: "none",
              borderRadius: "0 5px 5px 0",
              color: C.muted,
              cursor: "pointer",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              fontFamily: FONT,
              fontSize: 9,
              fontWeight: 700,
              gap: 4,
              letterSpacing: 1,
              padding: "10px 4px",
              textTransform: "uppercase",
              writingMode: "vertical-lr",
            }}
          >Inspector ›</button>
        )}

      </div>

      {pendingDelete && (
        <DeleteNodeDialog
          node={pendingDelete.node}
          nodes={pendingDelete.nodes || []}
          dependents={pendingDelete.dependents}
          onConfirm={() => doDelete(pendingDelete.node, pendingDelete.nodes)}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </div>
  );
}
