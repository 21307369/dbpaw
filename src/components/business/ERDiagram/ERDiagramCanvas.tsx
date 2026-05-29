import { useMemo } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  MarkerType,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import TableNode from "./TableNode";
import { computeLayout } from "./erDiagramLayout";
import type { ERDiagramData } from "./types";

const nodeTypes = { table: TableNode };

interface ERDiagramCanvasProps {
  data: ERDiagramData;
}

export default function ERDiagramCanvas({ data }: ERDiagramCanvasProps) {
  const initialNodes: Node[] = useMemo(
    () =>
      data.nodes.map((n) => ({
        id: n.id,
        type: "table",
        position: { x: 0, y: 0 },
        data: {
          label: n.name,
          columns: n.columns,
        },
      })),
    [data.nodes],
  );

  const initialEdges: Edge[] = useMemo(
    () =>
      data.edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        type: "smoothstep",
        animated: true,
        markerEnd: { type: MarkerType.ArrowClosed, color: "var(--primary)" },
        style: { stroke: "var(--primary)" },
        label: e.fkName,
        data: {
          onUpdate: e.onUpdate,
          onDelete: e.onDelete,
        },
      })),
    [data.edges],
  );

  const { nodes: layoutedNodes, edges: layoutedEdges } = useMemo(
    () => computeLayout(initialNodes, initialEdges),
    [initialNodes, initialEdges],
  );

  const [nodes, , onNodesChange] = useNodesState(layoutedNodes);
  const [edges, , onEdgesChange] = useEdgesState(layoutedEdges);

  return (
    <div className="w-full h-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        fitView
        attributionPosition="bottom-left"
      >
        <Background />
        <Controls />
        <MiniMap
          nodeColor="var(--primary)"
          maskColor="color-mix(in srgb, var(--background) 80%, transparent)"
          style={{ background: "var(--card)" }}
        />
      </ReactFlow>
    </div>
  );
}
