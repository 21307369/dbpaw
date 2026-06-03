import { useState, useCallback } from "react";

interface UseTableSortParams {
  controlledSortColumn?: string;
  controlledSortDirection?: "asc" | "desc";
  onSortChange?: (column: string, direction: "asc" | "desc") => void;
}

export function useTableSort({
  controlledSortColumn,
  controlledSortDirection,
  onSortChange,
}: UseTableSortParams) {
  const [internalSortColumn, setInternalSortColumn] = useState<
    string | undefined
  >();
  const [internalSortDirection, setInternalSortDirection] = useState<
    "asc" | "desc" | undefined
  >();

  const isControlledSort = !!onSortChange;
  const activeSortColumn = isControlledSort
    ? controlledSortColumn
    : internalSortColumn;
  const activeSortDirection = isControlledSort
    ? controlledSortDirection
    : internalSortDirection;
  const hasLocalClientSort =
    !isControlledSort && !!activeSortColumn && !!activeSortDirection;

  const handleSortClick = useCallback(
    (column: string) => {
      if (isControlledSort) {
        if (activeSortColumn === column) {
          onSortChange(
            column,
            activeSortDirection === "asc" ? "desc" : "asc",
          );
        } else {
          onSortChange(column, "asc");
        }
      } else {
        if (internalSortColumn === column) {
          setInternalSortDirection((prev) =>
            prev === "asc" ? "desc" : "asc",
          );
        } else {
          setInternalSortColumn(column);
          setInternalSortDirection("asc");
        }
      }
    },
    [
      isControlledSort,
      activeSortColumn,
      activeSortDirection,
      onSortChange,
      internalSortColumn,
    ],
  );

  return {
    activeSortColumn,
    activeSortDirection,
    handleSortClick,
    hasLocalClientSort,
    isControlledSort,
  };
}