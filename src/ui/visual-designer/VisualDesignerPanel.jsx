import { useEffect, useMemo, useRef, useState } from "react";
;
import { Tag, Btn, SH, InfoBox, Empty, CommitInput } from "../shared/components.jsx";
import { deriveGraphFromModel, VISUAL_NODE_TYPES } from "./graph.js";
import { validateVisualGraph, addVisualNode, createStarterFlowModel, deleteVisualNode, connectVisualNodes, updateVisualNode, deleteVisualEdge, findNodeDependents, updateGraphLayout, validateVisualConnection } from "./graph-operations.js";
import { FlowDiagramReactFlow } from "./FlowDiagramReactFlow.jsx";
import { VisualNodeInspector } from "./VisualNodeInspector.jsx";
import { validateModel } from "../../engine/validation.js";
import { renameEntityType } from "../../engine/queue-refs.js";
import { useTheme } from "../shared/ThemeContext.jsx";

function DeleteNodeDialog({ node, dependents, onConfirm, onCancel }) {
  const { C, FONT } = useTheme();
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Confirm node deletion"
      onClick={e => { if (e.target === e.currentTarget) onCancel(); }}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.65)",
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
          Delete {node.label}?
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

// Maps a validateModel error/warning to the canvas node that owns it,
// by extracting the element name from the message and matching against graph nodes.
function findNodeForError(item, graph) {
  const match = (item.message || "").match(/'([^']+)'/);
  const name = match?.[1];
  if (!name) return null;
  const nodes = graph?.nodes || [];
  if (item.tab === "cevents") {
    return nodes.find(n => n.type === VISUAL_NODE_TYPES.ACTIVITY && n.label === name)?.id ?? null;
  }
  if (item.tab === "bevents") {
    return nodes.find(
      n => (n.type === VISUAL_NODE_TYPES.SOURCE || n.type === VISUAL_NODE_TYPES.SINK) && n.label === name
    )?.id ?? null;
  }
  if (item.tab === "queues") {
    return nodes.find(n => n.type === VISUAL_NODE_TYPES.QUEUE && n.label === name)?.id ?? null;
  }
  return null;
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
      nodeId: findNodeForError(err, graph),
      severity: "error",
    })),
    ...modelWarnings.map((warn, i) => ({
      key: `warn-${warn.code}-${i}`,
      message: `[${warn.code}] ${warn.message}`,
      nodeId: findNodeForError(warn, graph),
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

export function VisualDesignerPanel({ model, canEdit = false, onModelChange, onModelInit }) {
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
  const [message, setMessage] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [paletteCollapsed, setPaletteCollapsed] = useState(() => {
    try { return localStorage.getItem("des.palette.collapsed") === "1"; } catch { return false; }
  });
  const [inspectorCollapsed, setInspectorCollapsed] = useState(false);
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
  // Derived set of canvas node IDs that have active validation issues — never stored in model_json
  const errorNodeIds = useMemo(() => {
    const ids = new Set();
    visualIssues.forEach(issue => { if (issue.nodeId) ids.add(issue.nodeId); });
    [...modelValidation.errors, ...modelValidation.warnings].forEach(item => {
      const id = findNodeForError(item, graph);
      if (id) ids.add(id);
    });
    return ids;
  }, [visualIssues, modelValidation, graph]);

  const isStarterBlank = !(model?.queues || []).length &&
    !(model?.bEvents || []).length &&
    !(model?.cEvents || []).length;
  const applyModel = nextModel => {
    setMessage(null);
    onModelChange?.(nextModel);
  };

  // Auto-open inspector whenever a node is selected
  useEffect(() => {
    if (selectedNodeId) setInspectorCollapsed(false);
  }, [selectedNodeId]);

  const togglePalette = () => {
    setPaletteCollapsed(prev => {
      const next = !prev;
      try { localStorage.setItem("des.palette.collapsed", next ? "1" : "0"); } catch {}
      return next;
    });
  };

  useEffect(() => {
    if (!canEdit || !isStarterBlank) return;
    const starterModel = createStarterFlowModel(model || {});
    if (onModelInit) {
      onModelInit(starterModel);
    } else {
      applyModel(starterModel);
    }
  }, [canEdit, isStarterBlank]); // eslint-disable-line react-hooks/exhaustive-deps

  function doDelete(targetNode) {
    const nextModel = deleteVisualNode(model, targetNode);
    setSelectedNodeId(null);
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

  // Ref holds the latest delete-triggering closure so the keydown listener never goes stale.
  const deleteKeyHandlerRef = useRef(null);
  deleteKeyHandlerRef.current = () => {
    if (!canEdit || !selectedNodeId) return;
    const targetNode = (graph.nodes || []).find(n => n.id === selectedNodeId);
    if (!targetNode) return;
    const deps = findNodeDependents(model, targetNode);
    if (deps.length > 0) {
      setPendingDelete({ node: targetNode, dependents: deps });
    } else {
      doDelete(targetNode);
    }
  };

  useEffect(() => {
    const handler = e => {
      if (e.key !== "Delete") return;
      const tag = e.target?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return;
      e.preventDefault();
      deleteKeyHandlerRef.current();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const addNode = (type, position = null) => {
    if (!canEdit) return;
    let next = addVisualNode(model, type, position);
    let nextGraph = deriveGraphFromModel(next);
    const newest = [...nextGraph.nodes].reverse().find(node => node.type === type);
    const selectedNode = selectedNodeId ? graph.nodes.find(node => node.id === selectedNodeId) : null;
    const autoLinkTypes = [VISUAL_NODE_TYPES.SOURCE, VISUAL_NODE_TYPES.ACTIVITY];
    if (selectedNode && newest && selectedNode.id !== newest.id && autoLinkTypes.includes(selectedNode.type)) {
      const validation = validateVisualConnection(nextGraph, selectedNode.id, newest.id);
      if (validation.ok) {
        next = connectVisualNodes(next, nextGraph, selectedNode.id, newest.id).model;
        nextGraph = deriveGraphFromModel(next);
        const linkedNewest = nextGraph.nodes.find(node => node.id === newest.id);
        applyModel(next);
        setSelectedNodeId(linkedNewest?.id || newest.id);
        setMessage({
          state: "success",
          text: `${selectedNode.label} linked to ${linkedNewest?.label || newest.label}.`,
        });
        return;
      }
    }
    applyModel(next);
    setSelectedNodeId(newest?.id || null);
  };
  const moveNode = (nodeId, position) => {
    if (!canEdit) return;
    applyModel(updateGraphLayout(model, graph, { nodes: [{ id: nodeId, x: position.x, y: position.y }] }));
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
    if (updated) setSelectedNodeId(updated.id);
  };
  const deleteEdge = (edgeId) => {
    if (!canEdit) return;
    const nextModel = deleteVisualEdge(model, graph, edgeId);
    applyModel(nextModel);
    setMessage({ state: "success", text: "Connection removed." });
  };
  const resetLayout = () => {
    if (!canEdit) return;
    applyModel({ ...model, graph: model.graph ? { ...model.graph, nodes: [] } : undefined });
  };

  // Pan/zoom the canvas to a node and open its inspector.
  const focusNode = (nodeId) => {
    setSelectedNodeId(nodeId);
    fitNodeRef.current?.(nodeId);
  };

  // Auto-dismiss the canvas status message after a short delay.
  useEffect(() => {
    if (!message) return;
    const ms = message.state === "error" ? 4000 : 2000;
    const timer = setTimeout(() => setMessage(null), ms);
    return () => clearTimeout(timer);
  }, [message]);

  const inspectorOpen = Boolean(selectedNodeId) && !inspectorCollapsed;

  return (
    <div aria-label="Visual Designer" style={{ display: "flex", flexDirection: "column", gap: 14 }}>

      <div style={{ display: "flex", gap: 12, alignItems: "stretch", minWidth: 0 }}>

        {/* ── Node Palette ── */}
        <div style={{
          flexShrink: 0,
          width: paletteCollapsed ? 44 : 160,
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
                    e.dataTransfer.setData("application/des-studio-node", item.type);
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
              width: 160,
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
                    e.dataTransfer.setData("application/des-studio-node", item.type);
                    e.dataTransfer.effectAllowed = "copy";
                  }}
                  onClick={() => addNode(item.type)}
                  style={{
                    background: "#ffffff08",
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
                {(model.entityTypes || []).map((et, i) => (
                  <div key={et.id || i} style={{
                    display: "flex", alignItems: "center", gap: 4, padding: "3px 4px",
                    background: C.bg, borderRadius: 4, marginBottom: 3,
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
                      style={{ width: 60, background: "transparent", border: "none", color: C.text, fontFamily: FONT, fontSize: 10, padding: "2px 4px", outline: "none" }}
                    />
                    <select value={et.role || "customer"} onChange={e => {
                      const next = [...(model.entityTypes || [])];
                      next[i] = { ...next[i], role: e.target.value, count: e.target.value === "server" ? (next[i].count || "1") : "" };
                      applyModel({ ...model, entityTypes: next });
                    }}
                      style={{ width: 56, background: "transparent", border: `1px solid ${C.border}`, borderRadius: 3, color: et.role === "server" ? C.server : C.cEvent, fontFamily: FONT, fontSize: 9, padding: "1px 3px", outline: "none" }}>
                      <option value="customer">Entity</option>
                      <option value="server">Server</option>
                    </select>
                    {et.role === "server" && (
                      <input type="number" min="1" value={et.count || "1"} onChange={e => {
                        const next = [...(model.entityTypes || [])];
                        next[i] = { ...next[i], count: e.target.value };
                        applyModel({ ...model, entityTypes: next });
                      }}
                        style={{ width: 30, background: "transparent", border: "none", color: C.amber, fontFamily: FONT, fontSize: 10, padding: "2px", outline: "none", textAlign: "center" }}
                      />
                    )}
                    {canEdit && (
                      <button type="button" onClick={() => {
                        const next = (model.entityTypes || []).filter((_, idx) => idx !== i);
                        applyModel({ ...model, entityTypes: next });
                      }}
                        style={{ background: "none", border: "none", color: C.red, cursor: "pointer", fontSize: 11, padding: "0 2px", lineHeight: 1 }}>✕</button>
                    )}
                  </div>
                ))}
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
          <FlowDiagramReactFlow
            graph={graphWithViewport}
            canEdit={canEdit}
            selectedNodeId={selectedNodeId}
            errorNodeIds={errorNodeIds}
            fitNodeRef={fitNodeRef}
            onNodeSelect={setSelectedNodeId}
            onNodeMove={moveNode}
            onViewportChange={changeViewport}
            onConnectNodes={connectNodes}
            onDropNode={addNode}
            onDeleteEdge={canEdit ? deleteEdge : null}
            onResetLayout={canEdit ? resetLayout : null}
          />
        </div>

        {/* ── Inspector (width-animated, auto-hides when no node selected) ── */}
        <div style={{
          flexShrink: 0,
          width: inspectorOpen ? 280 : 0,
          transition: "width 220ms cubic-bezier(0.4,0,0.2,1)",
          overflow: "hidden",
        }}>
          {/* Fixed inner width prevents content reflow during the slide animation */}
          <div style={{ width: 280 }}>
            <VisualNodeInspector
              model={model}
              graph={graph}
              selectedNodeId={selectedNodeId}
              canEdit={canEdit}
              onPatchNode={patchNode}
              onDeleteNode={canEdit ? deleteNode : null}
              onClose={() => setInspectorCollapsed(true)}
            />
          </div>
        </div>

        {/* Inspector re-open handle — visible when a node is selected but the inspector is dismissed */}
        {selectedNodeId && inspectorCollapsed && (
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
          dependents={pendingDelete.dependents}
          onConfirm={() => doDelete(pendingDelete.node)}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </div>
  );
}
