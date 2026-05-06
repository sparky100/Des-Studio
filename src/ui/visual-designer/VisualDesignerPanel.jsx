import { useEffect, useMemo, useRef, useState } from "react";
import { C, FONT } from "../shared/tokens.js";
import { Btn, Empty, SH, Tag } from "../shared/components.jsx";
import { deriveGraphFromModel, VISUAL_NODE_TYPES } from "./graph.js";
import { FlowDiagramReactFlow } from "./FlowDiagramReactFlow.jsx";
import { VisualNodeInspector } from "./VisualNodeInspector.jsx";
import {
  addVisualNode,
  connectVisualNodes,
  deleteVisualNode,
  findNodeDependents,
  updateGraphLayout,
  updateVisualNode,
  validateVisualGraph,
} from "./graph-operations.js";

const NODE_COLOR = {
  source: C.green,
  queue: C.cEvent,
  activity: C.purple,
  sink: C.red,
};

function NodeTile({ node }) {
  const color = NODE_COLOR[node.type] || C.accent;
  return (
    <div style={{
      background: C.bg,
      border: `1px solid ${color}55`,
      borderLeft: `3px solid ${color}`,
      borderRadius: 6,
      padding: 12,
      display: "flex",
      flexDirection: "column",
      gap: 8,
      minHeight: 92,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <Tag label={node.type} color={color} />
        <div style={{ color: C.text, fontFamily: FONT, fontSize: 12, fontWeight: 700 }}>{node.label}</div>
      </div>
      <div style={{ color: C.muted, fontFamily: FONT, fontSize: 11, lineHeight: 1.5 }}>{node.sublabel}</div>
      <div style={{ color: C.muted, fontFamily: FONT, fontSize: 10 }}>
        x {node.x} · y {node.y}
      </div>
    </div>
  );
}

function EdgeRow({ edge, nodeLabels }) {
  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "minmax(120px, 1fr) auto minmax(120px, 1fr) auto",
      gap: 10,
      alignItems: "center",
      background: C.bg,
      border: `1px solid ${C.border}`,
      borderRadius: 6,
      padding: "8px 10px",
      color: C.text,
      fontFamily: FONT,
      fontSize: 11,
    }}>
      <span>{nodeLabels.get(edge.from) || edge.from}</span>
      <span style={{ color: C.muted }}>to</span>
      <span>{nodeLabels.get(edge.to) || edge.to}</span>
      <Tag label={edge.source || "derived"} color={C.muted} />
    </div>
  );
}

function DeleteNodeDialog({ node, dependents, onConfirm, onCancel }) {
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

function ValidationSummary({ issues, onSelectNode }) {
  const hasIssues = issues.length > 0;
  return (
    <div style={{
      background: hasIssues ? C.amber + "12" : C.green + "12",
      border: `1px solid ${hasIssues ? C.amber : C.green}55`,
      borderRadius: 6,
      padding: "9px 10px",
      display: "flex",
      flexDirection: "column",
      gap: 7,
      fontFamily: FONT,
      fontSize: 11,
      color: C.text,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
        <strong style={{ color: hasIssues ? C.amber : C.green }}>Visual validation</strong>
        <Tag label={hasIssues ? `${issues.length} warnings` : "clear"} color={hasIssues ? C.amber : C.green} />
      </div>
      {!hasIssues && <span style={{ color: C.muted }}>Graph has a source, a sink, and routed visual nodes.</span>}
      {issues.slice(0, 4).map((issue, idx) => (
        <button
          key={`${issue.nodeId || "model"}-${idx}`}
          type="button"
          onClick={() => issue.nodeId && onSelectNode?.(issue.nodeId)}
          style={{
            background: C.bg,
            border: `1px solid ${C.border}`,
            borderRadius: 5,
            color: issue.nodeId ? C.amber : C.muted,
            cursor: issue.nodeId ? "pointer" : "default",
            fontFamily: FONT,
            fontSize: 10,
            padding: "6px 8px",
            textAlign: "left",
          }}
        >
          {issue.message}
        </button>
      ))}
    </div>
  );
}

export function VisualDesignerPanel({ model, canEdit = false, onModelChange }) {
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [message, setMessage] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(null);
  const graph = useMemo(() => deriveGraphFromModel(model || {}), [model]);
  const visualIssues = useMemo(() => validateVisualGraph(graph), [graph]);
  const nodeLabels = useMemo(
    () => new Map((graph.nodes || []).map(node => [node.id, node.label || node.id])),
    [graph.nodes]
  );
  const counts = (graph.nodes || []).reduce((acc, node) => ({
    ...acc,
    [node.type]: (acc[node.type] || 0) + 1,
  }), {});
  const applyModel = nextModel => {
    setMessage(null);
    onModelChange?.(nextModel);
  };

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
    const next = addVisualNode(model, type, position);
    applyModel(next);
    const nextGraph = deriveGraphFromModel(next);
    const newest = [...nextGraph.nodes].reverse().find(node => node.type === type);
    setSelectedNodeId(newest?.id || null);
  };
  const moveNode = (nodeId, position) => {
    if (!canEdit) return;
    applyModel(updateGraphLayout(model, graph, { nodes: [{ id: nodeId, x: position.x, y: position.y }] }));
  };
  const changeViewport = viewport => {
    if (!canEdit || !viewport) return;
    applyModel(updateGraphLayout(model, graph, { viewport }));
  };
  const connectNodes = (from, to) => {
    if (!canEdit) return;
    const result = connectVisualNodes(model, graph, from, to);
    if (!result.validation.ok) {
      setMessage({ state: "error", text: result.validation.message });
      return;
    }
    applyModel(result.model);
    setMessage({ state: "success", text: "Connection applied to the canonical model." });
  };
  const patchNode = (node, patch) => {
    if (!canEdit) return;
    const next = updateVisualNode(model, node, patch);
    applyModel(next);
    const updated = deriveGraphFromModel(next).nodes.find(item => item.refId === node.refId && item.type === node.type);
    if (updated) setSelectedNodeId(updated.id);
  };

  return (
    <div aria-label="Visual Designer" style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 1280 }}>
      <SH label="Visual Designer" color={C.accent}>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
          <Tag label={`${graph.nodes.length} nodes`} color={C.accent} />
          <Tag label={`${graph.edges.length} edges`} color={C.muted} />
        </div>
      </SH>

      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
        gap: 10,
      }}>
        {["source", "queue", "activity", "sink"].map(type => (
          <div key={type} style={{
            background: C.panel,
            border: `1px solid ${(NODE_COLOR[type] || C.accent)}33`,
            borderRadius: 6,
            padding: "10px 12px",
          }}>
            <div style={{ color: NODE_COLOR[type] || C.accent, fontFamily: FONT, fontSize: 20, fontWeight: 700 }}>
              {counts[type] || 0}
            </div>
            <div style={{ color: C.muted, fontFamily: FONT, fontSize: 11 }}>{type}</div>
          </div>
        ))}
      </div>

      <div style={{
        display: "grid",
        gridTemplateColumns: "180px minmax(0, 1fr) 320px",
        gap: 12,
        alignItems: "stretch",
      }}>
        <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 6, padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ color: C.muted, fontFamily: FONT, fontSize: 10, letterSpacing: 1.5, fontWeight: 700 }}>NODE PALETTE</div>
          {[
            { type: VISUAL_NODE_TYPES.SOURCE, label: "Add Source", color: C.green },
            { type: VISUAL_NODE_TYPES.QUEUE, label: "Add Queue", color: C.cEvent },
            { type: VISUAL_NODE_TYPES.ACTIVITY, label: "Add Activity", color: C.purple },
            { type: VISUAL_NODE_TYPES.SINK, label: "Add Sink", color: C.red },
          ].map(item => (
            <button
              key={item.type}
              type="button"
              draggable={canEdit}
              disabled={!canEdit}
              onDragStart={event => {
                event.dataTransfer.setData("application/des-studio-node", item.type);
                event.dataTransfer.effectAllowed = "copy";
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
            >
              {item.label}
            </button>
          ))}
          <ValidationSummary issues={visualIssues} onSelectNode={setSelectedNodeId} />
          <div style={{ color: C.muted, fontFamily: FONT, fontSize: 10, lineHeight: 1.5 }}>
            Click to add quickly, or drag onto the canvas to choose the starting position.
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }}>
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
            graph={graph}
            canEdit={canEdit}
            selectedNodeId={selectedNodeId}
            onNodeSelect={setSelectedNodeId}
            onNodeMove={moveNode}
            onViewportChange={changeViewport}
            onConnectNodes={connectNodes}
            onDropNode={addNode}
          />
        </div>

        <VisualNodeInspector
          model={model}
          graph={graph}
          selectedNodeId={selectedNodeId}
          canEdit={canEdit}
          onPatchNode={patchNode}
          onDeleteNode={canEdit ? deleteNode : null}
        />
      </div>

      <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ color: C.muted, fontFamily: FONT, fontSize: 10, letterSpacing: 1.5, fontWeight: 700 }}>NODES</div>
        {!graph.nodes.length && <Empty icon="Nodes" msg="No visual nodes can be derived from this model yet." />}
        {!!graph.nodes.length && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
            {graph.nodes.map(node => <NodeTile key={node.id} node={node} />)}
          </div>
        )}
      </section>

      <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ color: C.muted, fontFamily: FONT, fontSize: 10, letterSpacing: 1.5, fontWeight: 700 }}>DERIVED CONNECTIONS</div>
        {!graph.edges.length && <Empty icon="Edges" msg="No visual connections can be derived from this model yet." />}
        {graph.edges.map(edge => <EdgeRow key={edge.id} edge={edge} nodeLabels={nodeLabels} />)}
      </section>

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
