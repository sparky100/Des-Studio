import { useCallback, useMemo, useState } from "react";
import {
  Background,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Panel,
  Position,
  ReactFlow,
  useReactFlow,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { C, FONT } from "../shared/tokens.js";
import { validateVisualConnection } from "./graph-operations.js";

const NODE_COLOR = {
  source: C.green,
  queue: C.cEvent,
  activity: C.purple,
  sink: C.red,
};

function DesNode({ data, selected }) {
  const color = NODE_COLOR[data.type] || C.accent;
  const hasTarget = data.type !== "source";
  const hasSource = data.type !== "sink";
  return (
    <div style={{
      width: 160,
      minHeight: 78,
      background: C.surface,
      border: `1.5px solid ${selected ? color : `${color}44`}`,
      borderLeft: `4px solid ${color}`,
      borderRadius: 6,
      boxShadow: selected ? `0 0 0 3px ${color}88, 0 0 10px ${color}44` : "none",
      color: C.text,
      display: "flex",
      flexDirection: "column",
      gap: 6,
      padding: 10,
      fontFamily: FONT,
      fontSize: 11,
    }}>
      {hasTarget && (
        <Handle
          type="target"
          position={Position.Left}
          style={{ width: 9, height: 9, background: color, borderColor: C.bg }}
        />
      )}
      <div style={{
        color,
        fontSize: 9,
        fontWeight: 700,
        letterSpacing: 1.2,
        textTransform: "uppercase",
      }}>
        {data.type}
      </div>
      <div style={{ fontSize: 12, fontWeight: 700, lineHeight: 1.35 }}>{data.label}</div>
      {!!data.sublabel && (
        <div style={{ color: C.muted, fontSize: 10, lineHeight: 1.4 }}>{data.sublabel}</div>
      )}
      {hasSource && (
        <Handle
          type="source"
          position={Position.Right}
          style={{ width: 9, height: 9, background: color, borderColor: C.bg }}
        />
      )}
    </div>
  );
}

const nodeTypes = { desNode: DesNode };

function toFlowNode(node) {
  return {
    id: node.id,
    type: "desNode",
    position: { x: node.x || 0, y: node.y || 0 },
    data: node,
  };
}

function toFlowEdge(edge) {
  return {
    id: edge.id,
    source: edge.from,
    target: edge.to,
    label: edge.source || undefined,
    markerEnd: { type: MarkerType.ArrowClosed, color: C.muted },
    style: { stroke: C.muted, strokeWidth: 1.5 },
    labelStyle: { fill: C.muted, fontFamily: FONT, fontSize: 10 },
    labelBgStyle: { fill: C.bg, fillOpacity: 0.9 },
  };
}

const panelBtnStyle = {
  background: C.surface,
  border: `1px solid ${C.border}`,
  borderRadius: 4,
  color: C.muted,
  cursor: "pointer",
  fontFamily: FONT,
  fontSize: 10,
  fontWeight: 600,
  letterSpacing: 0.5,
  padding: "5px 9px",
};

function CanvasControls({ canEdit, onResetLayout, connecting }) {
  const { fitView } = useReactFlow();
  return (
    <>
      <Panel position="top-left" style={{ display: "flex", gap: 5 }}>
        <button
          type="button"
          style={panelBtnStyle}
          title="Fit all nodes within the canvas viewport"
          onClick={() => fitView({ padding: 0.15, duration: 300 })}
        >
          ⊡ Fit
        </button>
        {canEdit && onResetLayout && (
          <button
            type="button"
            style={panelBtnStyle}
            title="Clear saved positions and re-derive the auto-layout"
            onClick={onResetLayout}
          >
            ↺ Layout
          </button>
        )}
      </Panel>
      {connecting && (
        <Panel position="top-center">
          <div style={{
            background: C.surface,
            border: `1px solid ${C.accent}55`,
            borderRadius: 5,
            color: C.accent,
            fontFamily: FONT,
            fontSize: 10,
            fontWeight: 600,
            padding: "5px 12px",
            pointerEvents: "none",
            whiteSpace: "nowrap",
          }}>
            Drag to a compatible handle to connect
          </div>
        </Panel>
      )}
    </>
  );
}

export function FlowDiagramReactFlow({
  graph,
  canEdit = false,
  selectedNodeId = null,
  onNodeSelect,
  onNodeMove,
  onViewportChange,
  onConnectNodes,
  onDropNode,
  onDeleteEdge,
  onResetLayout,
}) {
  const [dragOver, setDragOver] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const nodes = useMemo(() => (graph.nodes || []).map(toFlowNode), [graph.nodes]);
  const edges = useMemo(() => (graph.edges || []).map(toFlowEdge), [graph.edges]);

  const isValidConnection = useCallback(connection => {
    const { ok } = validateVisualConnection(graph, connection.source, connection.target);
    return ok;
  }, [graph]);

  return (
    <div
      aria-label="Visual Designer canvas"
      onDragOver={event => {
        if (!canEdit) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={event => {
        setDragOver(false);
        if (!canEdit) return;
        const type = event.dataTransfer.getData("application/des-studio-node");
        if (!type) return;
        event.preventDefault();
        const rect = event.currentTarget.getBoundingClientRect();
        const viewport = graph.viewport || { x: 0, y: 0, zoom: 1 };
        const zoom = viewport.zoom || 1;
        onDropNode?.(type, {
          x: Math.round((event.clientX - rect.left - (viewport.x || 0)) / zoom),
          y: Math.round((event.clientY - rect.top - (viewport.y || 0)) / zoom),
        });
      }}
      style={{
        height: 520,
        minHeight: 360,
        width: "100%",
        background: dragOver ? `${C.accent}06` : C.bg,
        border: `1px solid ${C.border}`,
        borderRadius: 6,
        overflow: "hidden",
        boxShadow: dragOver ? `inset 0 0 0 2px ${C.accent}` : "none",
      }}
    >
      <ReactFlow
        nodes={nodes.map(node => ({ ...node, selected: node.id === selectedNodeId }))}
        edges={edges}
        nodeTypes={nodeTypes}
        defaultViewport={graph.viewport || { x: 0, y: 0, zoom: 1 }}
        minZoom={0.3}
        maxZoom={1.5}
        nodesDraggable={canEdit}
        nodesConnectable={canEdit}
        deleteKeyCode={null}
        elementsSelectable
        panOnScroll
        isValidConnection={isValidConnection}
        onNodeClick={(_, node) => onNodeSelect?.(node.id)}
        onPaneClick={() => onNodeSelect?.(null)}
        onNodeDragStop={(_, node) => onNodeMove?.(node.id, node.position)}
        onMoveEnd={(_, viewport) => onViewportChange?.(viewport)}
        onConnect={connection => onConnectNodes?.(connection.source, connection.target)}
        onConnectStart={() => setConnecting(true)}
        onConnectEnd={() => setConnecting(false)}
        onEdgeContextMenu={(event, edge) => {
          if (!canEdit || !onDeleteEdge) return;
          event.preventDefault();
          if (window.confirm("Remove this connection?")) {
            onDeleteEdge(edge.id);
          }
        }}
        proOptions={{ hideAttribution: true }}
      >
        <Background color={C.border} gap={24} size={1} />
        <Controls showInteractive={false} />
        <MiniMap
          pannable
          zoomable
          nodeColor={node => NODE_COLOR[node.data?.type] || C.accent}
          maskColor="rgba(8, 12, 16, 0.72)"
        />
        <CanvasControls canEdit={canEdit} onResetLayout={onResetLayout} connecting={connecting} />
      </ReactFlow>
    </div>
  );
}
