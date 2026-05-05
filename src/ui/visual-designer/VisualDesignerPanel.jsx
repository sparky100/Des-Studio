import { useMemo, useState } from "react";
import { C, FONT } from "../shared/tokens.js";
import { Btn, Empty, SH, Tag } from "../shared/components.jsx";
import { deriveGraphFromModel, VISUAL_NODE_TYPES } from "./graph.js";
import { FlowDiagramReactFlow } from "./FlowDiagramReactFlow.jsx";
import { VisualNodeInspector } from "./VisualNodeInspector.jsx";
import {
  addVisualNode,
  connectVisualNodes,
  updateGraphLayout,
  updateVisualNode,
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

export function VisualDesignerPanel({ model, canEdit = false, onModelChange }) {
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [message, setMessage] = useState(null);
  const graph = useMemo(() => deriveGraphFromModel(model || {}), [model]);
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
  const addNode = type => {
    if (!canEdit) return;
    const next = addVisualNode(model, type);
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
            <Btn key={item.type} small variant="ghost" disabled={!canEdit} onClick={() => addNode(item.type)} style={{ justifyContent: "flex-start", borderColor: `${item.color}66`, color: item.color }}>
              {item.label}
            </Btn>
          ))}
          <div style={{ color: C.muted, fontFamily: FONT, fontSize: 10, lineHeight: 1.5 }}>
            Connections update canonical model logic. Edges are re-derived after each edit.
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
          />
        </div>

        <VisualNodeInspector
          model={model}
          graph={graph}
          selectedNodeId={selectedNodeId}
          canEdit={canEdit}
          onPatchNode={patchNode}
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
    </div>
  );
}
