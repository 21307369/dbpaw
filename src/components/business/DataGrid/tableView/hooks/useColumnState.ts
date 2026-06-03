import { useState, useRef, useEffect, useCallback } from "react";
import { calculateAutoColumnWidths } from "../utils";

export function useColumnState({
  data,
  columns,
}: {
  data: any[];
  columns: string[];
}) {
  const [viewMode, setViewMode] = useState<"table" | "column">("table");
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({});
  const columnWidthsRef = useRef<Record<string, number>>({});
  columnWidthsRef.current = columnWidths;
  const thRefs = useRef<Record<string, HTMLTableCellElement | null>>({});
  const resizingRef = useRef<{
    column: string;
    startX: number;
    startWidth: number;
  } | null>(null);
  const prevColumnsRef = useRef<string>("");

  const DEFAULT_COL_WIDTH = 150;
  const INDEX_COL_WIDTH = 48;

  // Reset column widths when columns definition changes
  useEffect(() => {
    const colsKey = columns.join(",");
    if (prevColumnsRef.current !== colsKey) {
      setColumnWidths({});
      prevColumnsRef.current = colsKey;
    }
  }, [columns]);

  // Auto-calculate column widths based on content
  useEffect(() => {
    const newWidths = calculateAutoColumnWidths({
      data,
      columns,
      columnWidths: columnWidthsRef.current,
    });
    const hasChanges = Object.keys(newWidths).length > 0;

    if (hasChanges) {
      setColumnWidths((prev) => ({ ...prev, ...newWidths }));
    }
  }, [data, columns]);

  const getColWidth = useCallback(
    (column: string) => columnWidths[column] ?? DEFAULT_COL_WIDTH,
    [columnWidths],
  );

  const tableWidthPx =
    INDEX_COL_WIDTH + columns.reduce((sum, c) => sum + getColWidth(c), 0);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!resizingRef.current) return;
    const { column, startX, startWidth } = resizingRef.current;
    const diff = e.clientX - startX;
    const newWidth = Math.max(50, startWidth + diff);
    setColumnWidths((prev) => ({ ...prev, [column]: newWidth }));
  }, []);

  const handleMouseUp = useCallback(() => {
    resizingRef.current = null;
    document.removeEventListener("mousemove", handleMouseMove);
    document.removeEventListener("mouseup", handleMouseUp);
    document.body.style.cursor = "default";
  }, [handleMouseMove]);

  const handleMouseDown = (e: React.MouseEvent, column: string) => {
    e.preventDefault();
    e.stopPropagation();

    const currentTh = thRefs.current[column];
    const startWidth = currentTh
      ? currentTh.getBoundingClientRect().width
      : getColWidth(column);

    resizingRef.current = { column, startX: e.clientX, startWidth };
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    document.body.style.cursor = "col-resize";
  };

  // Cleanup effect for mouse listeners
  useEffect(() => {
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [handleMouseMove, handleMouseUp]);

  return {
    viewMode,
    setViewMode,
    columnWidths,
    getColWidth,
    tableWidthPx,
    thRefs,
    handleMouseDown,
    INDEX_COL_WIDTH,
  };
}
