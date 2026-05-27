import { memo } from "react";
import { Handle, Position } from "@xyflow/react";

interface ColumnData {
  name: string;
  type: string;
  isForeignKey: boolean;
}

interface TableNodeData {
  label: string;
  columns: ColumnData[];
  [key: string]: unknown;
}

function TableNode({ data }: { data: TableNodeData }) {
  return (
    <div className="rounded-lg border border-border bg-card shadow-md min-w-[200px]">
      <Handle type="target" position={Position.Top} className="!bg-transparent" />
      <div className="px-3 py-2 bg-primary/10 border-b border-border rounded-t-lg">
        <span className="font-semibold text-sm truncate block max-w-[180px]">
          {data.label}
        </span>
      </div>
      <div className="px-2 py-1">
        {data.columns.map((col) => (
          <div
            key={col.name}
            className="flex items-center gap-1.5 py-0.5 text-xs"
          >
            {col.isForeignKey && (
              <span className="inline-block w-4 text-center text-[10px] font-bold text-blue-500 bg-blue-500/10 rounded px-0.5">
                FK
              </span>
            )}
            {!col.isForeignKey && (
              <span className="inline-block w-4" />
            )}
            <span className="text-foreground truncate max-w-[100px]">
              {col.name}
            </span>
            <span className="ml-auto text-muted-foreground text-[11px]">
              {col.type}
            </span>
          </div>
        ))}
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-transparent" />
    </div>
  );
}

export default memo(TableNode);
