import { useCallback, useMemo, useRef, useState } from "react";
import {
  Background,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Panel,
  Position,
  ReactFlow,
  SelectionMode as ReactFlowSelectionMode,
  useReactFlow,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { validateVisualConnection } from "./graph-operations.js";
import { useTheme } from "../shared/ThemeContext.jsx";

function colorForNodeType(type, C) {
  return { source: C.green, queue: C.cEvent, activity: C.purple, sink: C.red }[type] || C.accent;
}

function DesNode({ data, selected }) {
  const { C, FONT } = useTheme();
  const color = colorForNodeType(data.type, C);
  const hasTarget = data.type !== "source";
  const hasSource = data.type !== "sink";
  const hasError = !!data.hasError;
  return (
    <div style={{
      position: "relative",
      width: 142,
      minHeight: 68,
      background: C.surface,
      border: `1.5px solid ${hasError && !selected ? C.red : selected ? color : `${color}44`}`,
      borderLeft: `4px solid ${hasError && !selected ? C.red : color}`,
      borderRadius: 6,
      boxShadow: selected
        ? `0 0 0 3px ${color}88, 0 0 10px ${color}44`
        : hasError
          ? `0 0 0 2px ${C.red}44`
          : "none",
      color: C.text,
      display: "flex",
      flexDirection: "column",
      gap: 5,
      padding: 8,
      fontFamily: FONT,
      fontSize: 10,
    }}>
      {hasError && (
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            top: -5,
            right: -5,
            width: 14,
            height: 14,
            borderRadius: "50%",
            background: C.red,
            border: `2px solid ${C.bg}`,
            color: C.bg,
            fontSize: 8,
            fontWeight: 900,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >!</div>
      )}
      {!hasError && data.sectionColor && (
        <div
          aria-hidden="true"
          title={`Section: ${data.sectionId || ""}`}
          style={{
            position: "absolute",
            top: -4,
            right: -4,
            width: 10,
            height: 10,
            borderRadius: "50%",
            background: data.sectionColor,
            border: `1.5px solid ${C.bg}`,
          }}
        />
      )}
      {hasTarget && (
        <Handle
          type="target"
          position={Position.Left}
          style={{ width: 9, height: 9, background: color, borderColor: C.bg }}
        />
      )}
      <div style={{
        color,
        fontSize: 8,
        fontWeight: 700,
        letterSpacing: 1,
        textTransform: "uppercase",
      }}>
        {data.type}
      </div>
      <div style={{ fontSize: 11, fontWeight: 700, lineHeight: 1.3 }}>{data.label}</div>
      {!!data.sublabel && (
        <div style={{ color: C.muted, fontSize: 9, lineHeight: 1.35 }}>{data.sublabel}</div>
      )}
      {!!data.badges?.length && (
        <div style={{ display: "flex", gap: 3, flexWrap: "wrap", marginTop: 2 }}>
          {data.badges.map(badge => (
            <span
              key={badge}
              style={{
                background: badge === "when" ? `${C.amber}22` : `${C.accent}22`,
                border: `1px solid ${badge === "when" ? C.amber : C.accent}`,
                borderRadius: 999,
                color: badge === "when" ? C.amber : C.accent,
                fontSize: 8,
                fontWeight: 700,
                padding: "1px 5px",
                letterSpacing: 0.5,
              }}
            >
              {badge}
            </span>
          ))}
        </div>
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

function toFlowEdge(edge, C, FONT) {
  const label = edge.label || edge.source || undefined;
  const isLoop = edge.loop === true;
  const isFallback = edge.label === "fallback";
  return {
    id: edge.id,
    source: edge.from,
    target: edge.to,
    label: isLoop ? `↻ rework (max ${edge.maxLoopCount || 3}x)` : label,
    markerEnd: {
      type: MarkerType.ArrowClosed,
      color: isLoop ? C.amber : isFallback ? C.muted : C.muted,
    },
    style: {
      stroke: isLoop ? C.amber : isFallback ? C.muted : C.muted,
      strokeWidth: isLoop ? 2 : 1.5,
      strokeDasharray: isLoop ? "8,4" : isFallback ? "5,3" : undefined,
    },
    labelStyle: {
      fill: isLoop ? C.amber : isFallback ? C.amber : C.muted,
      fontFamily: FONT,
      fontSize: 10,
      fontWeight: isLoop ? 700 : undefined,
    },
    labelBgStyle: { fill: C.bg, fillOpacity: 0.9 },
  };
}

function CanvasControls({ canEdit, onResetLayout, connecting, fitNodeRef }) {
  const { C, FONT } = useTheme();
  const panelBtnStyle = {
    background: C.surface, border: `1px solid ${C.border}`, borderRadius: 4,
    color: C.muted, cursor: "pointer", fontFamily: FONT,
    fontSize: 10, fontWeight: 600, letterSpacing: 0.5, padding: "5px 9px",
  };
  const { fitView, getNode, setCenter, getViewport } = useReactFlow();

  // Pan to a specific node without re-zooming the whole canvas.
  // Using setCenter instead of fitView prevents the "whole diagram shifts" effect
  // that occurs when fitView recalculates bounds for a single node with large padding.
  if (fitNodeRef) {
    fitNodeRef.current = (nodeId) => {
      if (nodeId) {
        const node = getNode(nodeId);
        if (node) {
          const { zoom } = getViewport();
          const w = node.measured?.width ?? node.width ?? 160;
          const h = node.measured?.height ?? node.height ?? 40;
          setCenter(node.position.x + w / 2, node.position.y + h / 2, {
            zoom: Math.max(zoom, 0.6),
            duration: 350,
          });
          return;
        }
      }
      fitView({ padding: 0.15, duration: 350 });
    };
  }

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
  selectedNodeIds = [],
  selectionMode = "pan",
  errorNodeIds,
  fitNodeRef,
  onNodeSelect,
  onNodeSelectionChange,
  onNodeMove,
  onNodesMove,
  onViewportChange,
  onConnectNodes,
  onDropNode,
  onDeleteEdge,
  onResetLayout,
}) {
  const { C, FONT } = useTheme();
  const [dragOver, setDragOver] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const suppressViewportSyncRef = useRef(true);
  const nodeClickHandledRef = useRef(false);
  const selectedSet = useMemo(() => new Set(selectedNodeIds.length ? selectedNodeIds : (selectedNodeId ? [selectedNodeId] : [])), [selectedNodeId, selectedNodeIds]);

  // Attach hasError flag to each node so DesNode can show the error badge.
  // This is derived state — never stored in model_json.
  const nodes = useMemo(
    () => (graph.nodes || []).map(node => {
      const base = toFlowNode(node);
      return { ...base, data: { ...base.data, hasError: errorNodeIds ? errorNodeIds.has(node.id) : false } };
    }),
    [graph.nodes, errorNodeIds]
  );

  const edges = useMemo(() => (graph.edges || []).map(e => toFlowEdge(e, C, FONT)), [graph.edges, C, FONT]);

  const isValidConnection = useCallback(connection => {
    const validation = validateVisualConnection(graph, connection.source, connection.target);
    connection._validation = validation;
    return validation.ok;
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
        const type = event.dataTransfer.getData("application/simmodlr-node");
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
        height: "clamp(400px, calc(100vh - 260px), 900px)",
        minHeight: 380,
        width: "100%",
        background: dragOver ? `${C.accent}06` : C.bg,
        border: `1px solid ${C.border}`,
        borderRadius: 6,
        overflow: "hidden",
        boxShadow: dragOver ? `inset 0 0 0 2px ${C.accent}` : "none",
      }}
    >
      <ReactFlow
        nodes={nodes.map(node => ({ ...node, selected: selectedSet.has(node.id) }))}
        edges={edges}
        nodeTypes={nodeTypes}
        defaultViewport={graph.viewport || { x: 0, y: 0, zoom: 1 }}
        minZoom={0.3}
        maxZoom={1.5}
        nodesDraggable={canEdit}
        nodesConnectable={canEdit}
        deleteKeyCode={null}
        elementsSelectable
        selectionOnDrag={canEdit && selectionMode === "select"}
        selectionMode={ReactFlowSelectionMode.Full}
        panOnDrag={selectionMode !== "select"}
        multiSelectionKeyCode={["Shift", "Control", "Meta"]}
        panOnScroll
        isValidConnection={isValidConnection}
        onNodeClick={(event, node) => {
          nodeClickHandledRef.current = true;
          const toggle = selectionMode === "select" || event?.shiftKey || event?.ctrlKey || event?.metaKey;
          onNodeSelect?.(node.id, { toggle });
        }}
        onPaneClick={() => onNodeSelect?.(null)}
        onSelectionChange={({ nodes: selectedNodes = [] }) => {
          // onNodeClick handles single-node selection; skip here to avoid overwriting it
          // with stale controlled `selected` props before React re-renders
          if (nodeClickHandledRef.current) {
            nodeClickHandledRef.current = false;
            return;
          }
          // Box-selection: use ReactFlow's internal selected flag (not our controlled prop)
          onNodeSelectionChange?.(selectedNodes.filter(node => node.selected).map(node => node.id));
        }}
        onNodeDragStop={(_, node, movedNodes = []) => {
          const moved = movedNodes.length ? movedNodes : [node];
          const movedPositions = moved.map(item => ({ id: item.id, x: item.position.x, y: item.position.y }));
          if (onNodesMove) onNodesMove(movedPositions);
          else if (!movedNodes.length) onNodeMove?.(node.id, node.position);
        }}
        onMoveEnd={(_, viewport) => {
          if (suppressViewportSyncRef.current) {
            suppressViewportSyncRef.current = false;
            return;
          }
          onViewportChange?.(viewport);
        }}
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
          nodeColor={node => colorForNodeType(node.data?.type, C)}
          maskColor={C.overlay}
        />
        <CanvasControls
          canEdit={canEdit}
          onResetLayout={onResetLayout}
          connecting={connecting}
          fitNodeRef={fitNodeRef}
        />
      </ReactFlow>
    </div>
  );
}
