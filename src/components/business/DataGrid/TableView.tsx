import { useState, useRef, useEffect, useCallback, useMemo, memo } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useTranslation } from "react-i18next";
import { save } from "@tauri-apps/plugin-dialog";
import {
  Download,
  Filter,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  ArrowUpDown,
  Copy,
  Table as TableIcon,
  Columns,
  Rows,
  Files,
  FileCode,
  Save,
  Undo2,
  Loader2,
  RotateCw,
  Search,
  Plus,
  SquareTerminal,
  Trash2,
  X,
  Table,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
} from "@/components/ui/context-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { api, isTauri } from "@/services/api";
import type { TransferFormat } from "@/services/api";
import { isEditableTarget } from "@/lib/keyboard";
import { useShortcutMatcher } from "@/contexts/ShortcutsContext";
import {
  buildFilterExpression,
  collectSearchMatches,
  createSingleAndDoubleClickHandler,
  cellValueToString,
  formatCellValue,
  getQualifiedTableName,
  isComplexValue,
  isDateType,
  isNumericType,
  isStringType,
  formatSQLValue,
  quoteIdent,
  escapeSQL,
  buildUpdateStatement,
  sortRows,
} from "./tableView/utils";
import {
  getNormalizedCellRange as normalizeRange,
  buildRangeCSV,
  buildRangeInsertSQL,
  buildRangeUpdateSQL,
  buildRowsTSV as buildRowsTSVFn,
  buildRowsCSV as buildRowsCSVFn,
  buildRowsInsertSQL as buildRowsInsertSQLFn,
  buildRowsUpdateSQL as buildRowsUpdateSQLFn,
} from "./tableView/selectionCopy";
import { ComplexValueViewer } from "./ComplexValueViewer";
import { ColumnAutocompleteInput } from "./tableView/ColumnAutocompleteInput";
import { useTableSort } from "./tableView/hooks/useTableSort";
import { useTablePagination } from "./tableView/hooks/useTablePagination";
import { useColumnState } from "./tableView/hooks/useColumnState";
import { useCellSelection } from "./tableView/hooks/useCellSelection";
import { useCellEditing } from "./tableView/hooks/useCellEditing";
import type { PendingChange } from "./tableView/hooks/useCellEditing";
import { toast } from "sonner";

function isCellInRange(
  rowIndex: number,
  colIndex: number,
  range: {
    anchor: { row: number; colIndex: number };
    tip: { row: number; colIndex: number };
  } | null,
): boolean {
  if (!range) return false;
  const minRow = Math.min(range.anchor.row, range.tip.row);
  const maxRow = Math.max(range.anchor.row, range.tip.row);
  const minCol = Math.min(range.anchor.colIndex, range.tip.colIndex);
  const maxCol = Math.max(range.anchor.colIndex, range.tip.colIndex);
  return (
    rowIndex >= minRow &&
    rowIndex <= maxRow &&
    colIndex >= minCol &&
    colIndex <= maxCol
  );
}

interface DataRowProps {
  rowIndex: number;
  row: Record<string, any>;
  columns: string[];
  showRowNumbers: boolean;
  showZebraStripes: boolean;
  startIndex: number;
  isRowSelected: boolean;
  isMultiRowSelection: boolean;
  editingCell: { row: number; col: string } | null;
  selectedCell: { row: number; col: string } | null;
  cellSelectionRange: {
    anchor: { row: number; colIndex: number };
    tip: { row: number; colIndex: number };
  } | null;
  normalizedSearchKeyword: string;
  matchedCellKeys: Set<string>;
  currentSearchMatch: { row: number; col: string } | null;
  isEditableForUpdates: boolean;
  editValue: string;
  editInputRef: React.RefObject<HTMLInputElement | null>;
  getColWidth: (column: string) => number;
  getCellDisplayValue: (
    rowIndex: number,
    column: string,
    originalValue: any,
  ) => any;
  isCellModified: (rowIndex: number, column: string) => boolean;
  handleCellClick: (rowIndex: number, col: string) => void;
  handleCellDoubleClick: (
    rowIndex: number,
    col: string,
    currentValue: any,
  ) => void;
  handleCellMouseDownForRange: (
    e: React.MouseEvent,
    rowIndex: number,
    colIndex: number,
  ) => void;
  handleCellMouseMoveForRange: (rowIndex: number, colIndex: number) => void;
  handleIndexMouseDown: (e: React.MouseEvent, rowIndex: number) => void;
  handleIndexMouseEnter: (rowIndex: number) => void;
  handleEditKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  setEditValue: (value: string) => void;
  commitEdit: () => void;
  setComplexViewer: (
    viewer: { value: any; columnName: string } | null,
  ) => void;
  setContextMenuRow: (row: number | null) => void;
}

const DataRow = memo(function DataRow({
  rowIndex,
  row,
  columns,
  showRowNumbers,
  showZebraStripes,
  startIndex,
  isRowSelected,
  isMultiRowSelection,
  editingCell,
  selectedCell,
  cellSelectionRange,
  normalizedSearchKeyword,
  matchedCellKeys,
  currentSearchMatch,
  isEditableForUpdates,
  editValue,
  editInputRef,
  getColWidth,
  getCellDisplayValue,
  isCellModified,
  handleCellClick,
  handleCellDoubleClick,
  handleCellMouseDownForRange,
  handleCellMouseMoveForRange,
  handleIndexMouseDown,
  handleIndexMouseEnter,
  handleEditKeyDown,
  setEditValue,
  commitEdit,
  setComplexViewer,
  setContextMenuRow,
}: DataRowProps) {
  const isEditing = useCallback(
    (col: string) =>
      editingCell?.row === rowIndex && editingCell?.col === col,
    [editingCell, rowIndex],
  );
  const isSelected = useCallback(
    (col: string) =>
      selectedCell?.row === rowIndex && selectedCell?.col === col,
    [selectedCell, rowIndex],
  );

  return (
    <tr
      className={[
        "hover:bg-muted/50 border-b border-border group",
        showZebraStripes && rowIndex % 2 === 1 ? "bg-muted/30" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {showRowNumbers && (
        <td
          className={[
            "px-4 py-2 text-xs text-muted-foreground border-r border-border cursor-pointer select-none",
            isRowSelected ? "bg-accent text-accent-foreground" : "",
          ]
            .filter(Boolean)
            .join(" ")}
          onMouseDown={(e) => handleIndexMouseDown(e, rowIndex)}
          onMouseEnter={() => handleIndexMouseEnter(rowIndex)}
        >
          {startIndex + rowIndex + 1}
        </td>
      )}
      {columns.map((column, colIndex) => {
        const modified = isCellModified(rowIndex, column);
        const displayValue = getCellDisplayValue(
          rowIndex,
          column,
          row[column],
        );
        const editing = isEditing(column);
        const selected = isSelected(column);
        const inRange = isCellInRange(rowIndex, colIndex, cellSelectionRange);
        const matched =
          normalizedSearchKeyword.length > 0 &&
          matchedCellKeys.has(`${rowIndex}::${column}`);
        const activeSearchMatch =
          !!currentSearchMatch &&
          currentSearchMatch.row === rowIndex &&
          currentSearchMatch.col === column;

        return (
          <td
            key={column}
            data-row-index={rowIndex}
            data-col-index={colIndex}
            className={[
              "px-0 py-0 text-sm text-foreground font-mono border-r border-border relative group transition-all duration-150 ease-out",
              selected && !editing ? "bg-accent text-accent-foreground" : "",
              inRange && !selected && !editing ? "bg-accent" : "",
              isRowSelected && !selected && !editing && !inRange
                ? "bg-accent/60"
                : "",
              matched && !editing
                ? "bg-amber-100/60 dark:bg-amber-900/20"
                : "",
              activeSearchMatch && !editing
                ? "border-b-2 border-b-amber-500/70"
                : "",
              modified && !editing ? "border-l-2 border-l-orange-400" : "",
              isEditableForUpdates ? "cursor-pointer" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            style={{
              width: getColWidth(column),
              minWidth: 50,
            }}
            onMouseDown={(e) =>
              handleCellMouseDownForRange(e, rowIndex, colIndex)
            }
            onMouseEnter={() =>
              handleCellMouseMoveForRange(rowIndex, colIndex)
            }
            onClick={() => handleCellClick(rowIndex, column)}
            onContextMenu={() => {
              if (isMultiRowSelection) {
                return;
              }
              handleCellClick(rowIndex, column);
              setContextMenuRow(rowIndex);
            }}
            onDoubleClick={() =>
              handleCellDoubleClick(rowIndex, column, row[column])
            }
          >
            {editing ? (
              <input
                ref={editInputRef}
                type="text"
                autoCapitalize="none"
                className="w-full h-full px-4 py-2 bg-background border-2 border-primary outline-none font-mono text-sm shadow-[0_0_0_3px_rgba(var(--primary)_0.15)] animate-in fade-in zoom-in-95 duration-150"
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onKeyDown={handleEditKeyDown}
                onBlur={commitEdit}
              />
            ) : (
              <div className="px-4 py-2 truncate">
                {displayValue !== null && displayValue !== undefined ? (
                  <span
                    className={
                      modified ? "text-orange-600 dark:text-orange-400" : ""
                    }
                  >
                    {formatCellValue(displayValue)}
                  </span>
                ) : (
                  <span className="text-muted-foreground italic">NULL</span>
                )}
                {isComplexValue(displayValue) && (
                  <button
                    className="absolute right-1 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground bg-background/80 rounded px-0.5 transition-opacity"
                    title="View structured data"
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      setComplexViewer({
                        value: displayValue,
                        columnName: column,
                      });
                    }}
                  >
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                    </svg>
                  </button>
                )}
              </div>
            )}
          </td>
        );
      })}
    </tr>
  );
});

interface TableViewProps {
  data?: any[];
  columns?: string[];
  hideHeader?: boolean;
  total?: number;
  page?: number;
  pageSize?: number;
  executionTimeMs?: number;
  onPageChange?: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
  sortColumn?: string;
  sortDirection?: "asc" | "desc";
  onSortChange?: (column: string, direction: "asc" | "desc") => void;
  filter?: string;
  orderBy?: string;
  onFilterChange?: (filter: string, orderBy: string) => void;
  onOpenDDL?: (ctx: {
    connectionId: number;
    database: string;
    schema: string;
    table: string;
  }) => void;
  onOpenERDiagram?: (ctx: {
    connectionId: number;
    database: string;
    schema: string;
    table: string;
    driver: string;
  }) => void;
  onDataRefresh?: (params?: {
    page?: number;
    limit?: number;
    filter?: string;
    orderBy?: string;
  }) => void | Promise<unknown>;
  onCreateQuery?: (
    connectionId: number,
    database: string,
    driver: string,
  ) => void;
  tableContext?: {
    connectionId: number;
    database: string;
    schema: string;
    table: string;
    driver: string;
  };
  isLoading?: boolean;
  showColumnComments?: boolean;
  showRowNumbers?: boolean;
  showZebraStripes?: boolean;
}

export function TableView({
  data = [],
  columns = [],
  hideHeader = false,
  total = 0,
  page = 1,
  pageSize = 100,
  executionTimeMs = 0,
  onPageChange,
  onPageSizeChange,
  sortColumn: controlledSortColumn,
  sortDirection: controlledSortDirection,
  onSortChange,
  filter: controlledFilter,
  orderBy: controlledOrderBy,
  onFilterChange,
  onOpenDDL,
  onOpenERDiagram,
  onDataRefresh,
  onCreateQuery,
  tableContext,
  isLoading,
  showColumnComments = false,
  showRowNumbers = true,
  showZebraStripes = false,
}: TableViewProps) {
  const { t } = useTranslation();
  const [viewMode, setViewMode] = useState<"table" | "column">("table");
  const {
    getColWidth,
    tableWidthPx,
    thRefs,
    handleMouseDown,
    INDEX_COL_WIDTH,
  } = useColumnState({ data, columns });
  const headerClickStateRef = useRef<
    Record<string, { timerId: ReturnType<typeof setTimeout> | null }>
  >({});

  // --- Cell selection & editing state ---
  const {
    selectedCell,
    selectedCellRef,
    setSelectedCell,
    selectedRows,
    selectedRowsRef,
    setSelectedRows,
    cellSelectionRange,
    cellSelectionRangeRef,
    handleCellClick: handleCellClickBase,
    handleCellMouseDownForRange: handleCellMouseDownForRangeBase,
    handleCellMouseMoveForRange,
    handleCellMouseUpForRange,
    handleIndexMouseDown,
    handleIndexMouseEnter,
    clearSelection,
  } = useCellSelection();
  const [isExporting, setIsExporting] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchKeyword, setSearchKeyword] = useState("");
  const [searchCursorIndex, setSearchCursorIndex] = useState(-1);
  const [complexViewer, setComplexViewer] = useState<{
    value: unknown;
    columnName: string;
  } | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [contextMenuRow, setContextMenuRow] = useState<number | null>(null);

  const {
    activeSortColumn,
    activeSortDirection,
    handleSortClick,
    hasLocalClientSort,
    isControlledSort,
  } = useTableSort({
    controlledSortColumn,
    controlledSortDirection,
    onSortChange,
  });

  // Client-side sorting (used in uncontrolled mode, e.g. SQL query results)
  const sortedData = useMemo(() => {
    if (isControlledSort || !activeSortColumn || !activeSortDirection) {
      return data;
    }
    return sortRows(data, activeSortColumn, activeSortDirection);
  }, [data, isControlledSort, activeSortColumn, activeSortDirection]);

  // If external pagination is used (onPageChange provided), we assume data is already the current page
  // Otherwise we slice locally
  const currentData = useMemo(
    () =>
      onPageChange
        ? sortedData
        : sortedData.slice((page - 1) * pageSize, page * pageSize),
    [onPageChange, page, pageSize, sortedData],
  );

  // If using external pagination, totalPages is based on total count
  // Otherwise fallback to filtered data length
  const totalPages = Math.ceil((total || sortedData.length) / pageSize);

  const {
    whereInput,
    setWhereInput,
    orderByInput,
    setOrderByInput,
    pageInput,
    setPageInput,
    pageSizeInput,
    handlePageInputCommit,
    handlePageSizeChange,
    handlePrevPage,
    handleNextPage,
    PAGE_SIZE_OPTIONS,
  } = useTablePagination({
    page,
    pageSize,
    controlledFilter,
    controlledOrderBy,
    totalPages,
    onPageChange,
    onPageSizeChange,
  });

  // --- Cell editing hook ---
  const {
    editingCell,
    editValue,
    setEditValue,
    insertDraftRows,
    primaryKeys,
    tableColumns,
    columnComments,
    columnAutocompleteOptions,
    isSaving,
    isRefreshing,
    isDeleting,
    deleteDialogOpen,
    setDeleteDialogOpen,
    lastRefreshedAt,
    saveError,
    setSaveError,
    pendingFocusDraftId,
    setPendingFocusDraftId,
    canInsert,
    canUpdateDelete,
    hasPendingChanges,
    pendingMutationCount,
    mutabilityHint,
    isEditableForUpdates,
    editInputRef,
    saveButtonRef,
    commitEdit,
    cancelEdit,
    handleEditKeyDown,
    handleCellDoubleClick,
    handleSave,
    handleConfirmDelete,
    handleDiscardChanges,
    handleAddDraftRow,
    handleDraftValueChange,
    handleRefreshClick,
    getCellDisplayValue,
    isCellModified,
    setPendingChanges,
    editingCellRef,
    commitEditRef,
  } = useCellEditing({
    data,
    currentData,
    columns,
    tableContext,
    onDataRefresh,
    selectedCell,
    selectedCellRef,
    selectedRows,
    selectedRowsRef,
    setSelectedCell,
    setSelectedRows,
    clearSelection,
    hasLocalClientSort,
  });

  // Virtual scrolling — only render visible rows
  const virtualizer = useVirtualizer({
    count: currentData.length,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: () => 36,
    overscan: 20,
  });

  const handleShowDDL = () => {
    if (!tableContext) return;
    onOpenDDL?.(tableContext);
  };

  const handleExport = useCallback(
    async (
      scope: "current_page" | "filtered" | "full_table",
      format: TransferFormat,
    ) => {
      if (!tableContext) return;
      if (!isTauri()) {
        toast.error("Export dialog is only available in Tauri desktop mode.");
        return;
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const defaultPath = `${tableContext.table}_${timestamp}.${format}`;
      const filters =
        format === "csv"
          ? [{ name: "CSV", extensions: ["csv"] }]
          : format === "json"
            ? [{ name: "JSON", extensions: ["json"] }]
            : [{ name: "SQL", extensions: ["sql"] }];

      let filePath: string | undefined;
      try {
        const selected = await save({
          title: "Save Export File",
          defaultPath,
          filters,
        });
        if (!selected) return;
        filePath = Array.isArray(selected) ? selected[0] : selected;
        if (!filePath) return;
      } catch (e) {
        toast.error("Failed to open save dialog", {
          description: e instanceof Error ? e.message : String(e),
        });
        return;
      }

      setIsExporting(true);
      try {
        const result = await api.transfer.exportTable({
          id: tableContext.connectionId,
          database: tableContext.database,
          schema: tableContext.schema,
          table: tableContext.table,
          driver: tableContext.driver,
          format,
          scope,
          filter: controlledFilter || undefined,
          orderBy: orderByInput || undefined,
          sortColumn: activeSortColumn,
          sortDirection: activeSortDirection,
          page,
          limit: pageSize,
          filePath,
        });
        toast.success(`Export completed (${result.rowCount} rows)`, {
          description: result.filePath,
        });
      } catch (e) {
        toast.error("Export failed", {
          description: e instanceof Error ? e.message : String(e),
        });
      } finally {
        setIsExporting(false);
      }
    },
    [
      tableContext,
      controlledFilter,
      orderByInput,
      activeSortColumn,
      activeSortDirection,
      page,
      pageSize,
    ],
  );

  // --- Cell interaction handlers ---
  const handleCellClick = useCallback(
    (rowIndex: number, col: string) => {
      // If clicking a different cell while editing, commit current edit first
      const ec = editingCellRef.current;
      if (ec && (ec.row !== rowIndex || ec.col !== col)) {
        commitEditRef.current?.();
      }
      handleCellClickBase(rowIndex, col);
    },
    [handleCellClickBase],
  );

  const handleCellMouseDownForRange = useCallback(
    (e: React.MouseEvent, rowIndex: number, colIndex: number) => {
      if (editingCellRef.current) return;
      handleCellMouseDownForRangeBase(e, rowIndex, colIndex, columns);
    },
    [handleCellMouseDownForRangeBase, columns],
  );

  const handleCopy = useCallback((text: string, label?: string) => {
    void navigator.clipboard.writeText(text).then(() => {
      if (label) {
        toast.success(label);
      }
    }).catch((error) => {
      toast.error("Failed to copy", {
        description: error instanceof Error ? error.message : String(error),
      });
    });
  }, []);

  const handleHeaderCopy = useCallback(
    (column: string) => {
      void navigator.clipboard
        .writeText(column)
        .then(() => {
          toast.success(
            t("tableView.toast.columnNameCopied", {
              column,
            }),
          );
        })
        .catch((error) => {
          toast.error("Failed to copy", {
            description: error instanceof Error ? error.message : String(error),
          });
        });
    },
    [t],
  );

  const buildRowsTSV = useCallback(
    (rowIndexes: number[]) => buildRowsTSVFn(rowIndexes, columns, currentData, getCellDisplayValue, cellValueToString),
    [columns, currentData, getCellDisplayValue],
  );

  const getSelectedCellCopyText = useCallback(() => {
    const selectedCell = selectedCellRef.current;
    if (!selectedCell) return null;
    const row = currentData[selectedCell.row];
    if (!row) return null;
    const value = getCellDisplayValue(
      selectedCell.row,
      selectedCell.col,
      row[selectedCell.col],
    );
    if (value === null || value === undefined) return "";
    return cellValueToString(value);
  }, [currentData, getCellDisplayValue]);

  // --- Cell range copy & paste ---
  const getNormalizedCellRange = useCallback(() => {
    if (!cellSelectionRange) return null;
    return normalizeRange(cellSelectionRange.anchor, cellSelectionRange.tip);
  }, [cellSelectionRange]);

  const handleCopySelection = useCallback(() => {
    const range = getNormalizedCellRange();
    if (!range) {
      const text = getSelectedCellCopyText();
      if (text !== null) handleCopy(text, "Cell copied");
      return;
    }
    const lines: string[] = [];
    for (let r = range.minRow; r <= range.maxRow; r++) {
      const row = currentData[r];
      if (!row) continue;
      const cells: string[] = [];
      for (let c = range.minCol; c <= range.maxCol; c++) {
        const col = columns[c];
        const val = getCellDisplayValue(r, col, row[col]);
        cells.push(
          val === null || val === undefined ? "" : cellValueToString(val),
        );
      }
      lines.push(cells.join("\t"));
    }
    const rowCount = range.maxRow - range.minRow + 1;
    const colCount = range.maxCol - range.minCol + 1;
    handleCopy(lines.join("\n"), `Copied ${rowCount}×${colCount} cells`);
  }, [
    getNormalizedCellRange,
    currentData,
    columns,
    getCellDisplayValue,
    handleCopy,
    getSelectedCellCopyText,
  ]);

  const buildSelectionCSV = useCallback(() => {
    const range = getNormalizedCellRange();
    if (!range) return "";
    return buildRangeCSV(range, columns, currentData, getCellDisplayValue, cellValueToString);
  }, [getNormalizedCellRange, currentData, columns, getCellDisplayValue]);

  const buildSelectionInsertSQL = useCallback(() => {
    const range = getNormalizedCellRange();
    if (!range || !tableContext) return "";
    const { schema, table, driver } = tableContext;
    const tableName = getQualifiedTableName(driver, schema, table);
    return buildRangeInsertSQL(range, columns, currentData, getCellDisplayValue, formatSQLValue, quoteIdent, driver, tableName);
  }, [getNormalizedCellRange, currentData, columns, getCellDisplayValue, tableContext]);

  const buildSelectionUpdateSQL = useCallback(() => {
    const range = getNormalizedCellRange();
    if (!range || !tableContext || !canUpdateDelete || primaryKeys.length === 0) return "";
    const { schema, table, driver } = tableContext;
    const tableName = getQualifiedTableName(driver, schema, table);
    return buildRangeUpdateSQL(range, columns, currentData, primaryKeys, getCellDisplayValue, formatSQLValue, quoteIdent, escapeSQL, buildUpdateStatement, driver, tableName);
  }, [getNormalizedCellRange, currentData, columns, getCellDisplayValue, canUpdateDelete, primaryKeys, tableContext]);

  const applyFilter = useCallback(
    (operator: string) => {
      if (!selectedCell || !tableContext || !onFilterChange) return;

      const cellValue = currentData[selectedCell.row]?.[selectedCell.col];
      const colMeta = tableColumns.find((c) => c.name === selectedCell.col);
      const columnType = colMeta?.type || "";

      const expression = buildFilterExpression(
        tableContext.driver,
        selectedCell.col,
        operator,
        cellValue,
        columnType,
      );

      setWhereInput(expression);
      onFilterChange(expression, orderByInput);
    },
    [
      selectedCell,
      currentData,
      tableColumns,
      tableContext,
      orderByInput,
      onFilterChange,
    ],
  );

  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      if (!isEditableForUpdates) return;
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return;
      const text = e.clipboardData.getData("text/plain");
      if (!text) return;
      e.preventDefault();

      const baseCell = selectedCellRef.current;
      if (!baseCell) return;
      const baseColIndex = columns.indexOf(baseCell.col);
      if (baseColIndex < 0) return;

      const rows = text.split("\n");
      const newChanges = new Map<string, PendingChange>();

      for (let dr = 0; dr < rows.length; dr++) {
        const line = rows[dr];
        if (line === "" && dr === rows.length - 1) break;
        const cells = line.split("\t");
        const targetRow = baseCell.row + dr;
        if (targetRow >= currentData.length) break;
        const originalRow = currentData[targetRow];
        if (!originalRow) continue;
        const sourceRowIndex = data.indexOf(originalRow);

        for (let dc = 0; dc < cells.length; dc++) {
          const targetColIdx = baseColIndex + dc;
          if (targetColIdx >= columns.length) break;
          const col = columns[targetColIdx];
          const newValue = cells[dc];
          const originalValue = originalRow[col];
          const originalStr = cellValueToString(originalValue);

          if (newValue !== originalStr) {
            const key = `${targetRow}_${col}`;
            newChanges.set(key, {
              rowIndex: targetRow,
              sourceRowIndex: sourceRowIndex >= 0 ? sourceRowIndex : targetRow,
              column: col,
              originalValue,
              newValue,
            });
          }
        }
      }

      if (newChanges.size > 0) {
        setPendingChanges((prev) => {
          const next = new Map(prev);
          newChanges.forEach((v, k) => next.set(k, v));
          return next;
        });
        toast.success(`Pasted ${newChanges.size} cell(s)`);
      }
    },
    [isEditableForUpdates, columns, currentData, data],
  );

  const buildRowsCSV = useCallback(
    (rowIndexes: number[]) => buildRowsCSVFn(rowIndexes, columns, currentData, getCellDisplayValue, cellValueToString),
    [columns, currentData, getCellDisplayValue],
  );

  const buildRowsInsertSQL = useCallback(
    (rowIndexes: number[]) => {
      if (!tableContext) return "";
      const { schema, table, driver } = tableContext;
      const tableName = getQualifiedTableName(driver, schema, table);
      return buildRowsInsertSQLFn(rowIndexes, columns, currentData, getCellDisplayValue, formatSQLValue, quoteIdent, driver, tableName);
    },
    [columns, currentData, getCellDisplayValue, tableContext],
  );

  const buildRowsUpdateSQL = useCallback(
    (rowIndexes: number[]) => {
      if (!tableContext || !canUpdateDelete || primaryKeys.length === 0) return "";
      const { schema, table, driver } = tableContext;
      const tableName = getQualifiedTableName(driver, schema, table);
      return buildRowsUpdateSQLFn(rowIndexes, columns, currentData, primaryKeys, getCellDisplayValue, formatSQLValue, quoteIdent, escapeSQL, buildUpdateStatement, driver, tableName);
    },
    [columns, currentData, getCellDisplayValue, canUpdateDelete, primaryKeys, tableContext],
  );

  const normalizedSearchKeyword = searchKeyword.trim().toLowerCase();

  const searchMatches = useMemo(() => {
    return collectSearchMatches(
      currentData,
      columns,
      normalizedSearchKeyword,
      getCellDisplayValue,
    );
  }, [normalizedSearchKeyword, currentData, columns, getCellDisplayValue]);

  const matchedRows = useMemo(() => {
    const rows = new Set<number>();
    searchMatches.forEach((match) => {
      rows.add(match.row);
    });
    return rows;
  }, [searchMatches]);

  const matchedCellKeys = useMemo(() => {
    const keys = new Set<string>();
    searchMatches.forEach((match) => {
      keys.add(`${match.row}::${match.col}`);
    });
    return keys;
  }, [searchMatches]);

  const currentSearchMatch =
    searchCursorIndex >= 0 && searchCursorIndex < searchMatches.length
      ? searchMatches[searchCursorIndex]
      : null;

  // Correctly calculate start index for display
  const startIndex = (page - 1) * pageSize;

  const focusSearchInput = useCallback(() => {
    setTimeout(() => searchInputRef.current?.focus(), 0);
  }, []);

  const jumpToSearchMatch = useCallback(
    (matchIndex: number) => {
      if (!searchMatches.length) return;
      const safeIndex =
        ((matchIndex % searchMatches.length) + searchMatches.length) %
        searchMatches.length;
      const nextMatch = searchMatches[safeIndex];

      if (editingCell) {
        commitEdit();
      }

      setSelectedCell({ row: nextMatch.row, col: nextMatch.col });
      setSearchCursorIndex(safeIndex);

      requestAnimationFrame(() => {
        const row = nextMatch.row;
        const colIndex = nextMatch.colIndex;
        const target = containerRef.current?.querySelector<HTMLElement>(
          `td[data-row-index="${row}"][data-col-index="${colIndex}"]`,
        );
        target?.scrollIntoView({
          behavior: "smooth",
          block: "nearest",
          inline: "nearest",
        });
      });
    },
    [searchMatches, editingCell, commitEdit],
  );

  const handleSearchEnter = useCallback(() => {
    if (!searchMatches.length) return;
    const nextIndex = searchCursorIndex < 0 ? 0 : searchCursorIndex + 1;
    jumpToSearchMatch(nextIndex);
  }, [searchMatches, searchCursorIndex, jumpToSearchMatch]);

  useEffect(() => {
    const clickStates = headerClickStateRef.current;
    return () => {
      Object.values(clickStates).forEach((state) => {
        if (state.timerId) {
          clearTimeout(state.timerId);
          state.timerId = null;
        }
      });
    };
  }, []);

  useEffect(() => {
    setSearchCursorIndex(-1);
  }, [normalizedSearchKeyword]);

  useEffect(() => {
    if (!searchMatches.length) {
      setSearchCursorIndex(-1);
      return;
    }
    if (searchCursorIndex >= searchMatches.length) {
      setSearchCursorIndex(0);
    }
  }, [searchMatches, searchCursorIndex]);

  useEffect(() => {
    if (isSearchOpen) {
      focusSearchInput();
    }
  }, [isSearchOpen, focusSearchInput]);

  useEffect(() => {
    if (!pendingFocusDraftId) return;
    const selector = `input[data-draft-id="${pendingFocusDraftId}"][data-draft-col-index="0"]`;
    requestAnimationFrame(() => {
      const target =
        containerRef.current?.querySelector<HTMLInputElement>(selector);
      if (!target) return;
      target.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
        inline: "nearest",
      });
      target.focus();
      setPendingFocusDraftId(null);
    });
  }, [insertDraftRows, pendingFocusDraftId]);

  const match = useShortcutMatcher();

  useEffect(() => {
    const handleTableHotkeys = (e: KeyboardEvent) => {
      const container = containerRef.current;
      if (!container) return;

      const eventTarget = e.target instanceof Node ? e.target : null;
      const eventInsideTable = eventTarget
        ? container.contains(eventTarget)
        : false;

      // Only handle save when actively editing or having pending changes
      const shouldHandleSave =
        eventInsideTable || !!editingCell || hasPendingChanges;

      if (match(e, "table.save")) {
        if (!shouldHandleSave) return;
        e.preventDefault();
        if (hasPendingChanges && !isSaving) {
          saveButtonRef.current?.click();
        }
        return;
      }

      if (match(e, "table.openSearch")) {
        if (isEditableTarget(e.target)) return;
        e.preventDefault();
        setIsSearchOpen(true);
        focusSearchInput();
        return;
      }

      if (match(e, "table.copySelection")) {
        if (isEditableTarget(e.target)) {
          return;
        }
        const selectedRows = selectedRowsRef.current;
        if (selectedRows.size) {
          e.preventDefault();
          const tsv = buildRowsTSV(Array.from(selectedRows));
          if (tsv) {
            handleCopy(tsv);
          }
          return;
        }
        const range = cellSelectionRangeRef.current;
        if (range) {
          e.preventDefault();
          handleCopySelection();
          return;
        }
        const selectedCellText = getSelectedCellCopyText();
        if (selectedCellText !== null) {
          e.preventDefault();
          handleCopy(selectedCellText);
        }
        return;
      }

      // Only handle Escape when actively editing, inside table, or having pending changes
      const shouldHandleEscape =
        eventInsideTable || !!editingCell || hasPendingChanges;

      if (match(e, "table.cancelEdit")) {
        if (!shouldHandleEscape) return;

        if (editingCell) {
          e.preventDefault();
          cancelEdit();
          return;
        }

        if (hasPendingChanges && !isEditableTarget(e.target)) {
          e.preventDefault();
          handleDiscardChanges();
        }
      }
    };

    window.addEventListener("keydown", handleTableHotkeys, true);
    return () => {
      window.removeEventListener("keydown", handleTableHotkeys, true);
    };
  }, [
    selectedCell,
    selectedRows,
    hasPendingChanges,
    isSaving,
    editingCell,
    cancelEdit,
    handleDiscardChanges,
    focusSearchInput,
    buildRowsTSV,
    getSelectedCellCopyText,
    handleCopy,
    handleCopySelection,
    match,
  ]);

  if (isLoading) {
    return (
      <div className="flex flex-col gap-3 p-4">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-6 w-full" />
        <Skeleton className="h-6 w-full" />
        <Skeleton className="h-6 w-full" />
        <Skeleton className="h-6 w-3/4" />
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="h-full flex flex-col bg-background"
      onMouseUp={handleCellMouseUpForRange}
      onPaste={isEditableForUpdates ? handlePaste : undefined}
    >
      {!hideHeader && (
        <div className="flex flex-col gap-1.5 px-4 py-2 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-20">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              {/* Modern pagination control */}
              <div className="flex items-center gap-1 bg-muted/40 rounded-lg p-0.5 border border-border/50">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0 hover:bg-background"
                  onClick={handlePrevPage}
                  disabled={page <= 1}
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </Button>
                <div className="flex items-center gap-1 px-1">
                  <span className="text-xs text-muted-foreground">Page</span>
                  <Input
                    type="text"
                    inputMode="numeric"
                    className="h-5 w-10 px-1.5 text-xs text-center bg-background border-border/50"
                    value={pageInput}
                    onChange={(e) =>
                      setPageInput(e.target.value.replace(/\D/g, ""))
                    }
                    onBlur={handlePageInputCommit}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        handlePageInputCommit();
                      }
                    }}
                  />
                  <span className="text-xs text-muted-foreground">
                    / {totalPages}
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0 hover:bg-background"
                  onClick={handleNextPage}
                  disabled={page >= totalPages}
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </Button>
              </div>

              {/* Page size selector */}
              <div className="flex items-center gap-2 ml-1">
                <span className="text-xs text-muted-foreground">Limit</span>
                <Select
                  value={pageSizeInput}
                  onValueChange={handlePageSizeChange}
                >
                  <SelectTrigger
                    size="sm"
                    className="w-[70px] text-xs border-border/50 bg-muted/40 [&_svg]:size-3 px-2 gap-1 data-[size=sm]:h-6 data-[size=sm]:py-0"
                  >
                    <SelectValue placeholder="100" />
                  </SelectTrigger>
                  <SelectContent>
                    {PAGE_SIZE_OPTIONS.map((size) => (
                      <SelectItem key={size} value={size} className="text-xs">
                        {size}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {tableContext && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0 hover:bg-muted/60"
                  onClick={handleRefreshClick}
                  disabled={isRefreshing}
                  title={isRefreshing ? "Refreshing..." : "Refresh"}
                >
                  <RotateCw
                    className={[
                      "w-3.5 h-3.5",
                      isRefreshing ? "animate-spin" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  />
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0 hover:bg-muted/60"
                onClick={() =>
                  setViewMode(viewMode === "table" ? "column" : "table")
                }
                title={
                  viewMode === "table"
                    ? "Switch to column view"
                    : "Switch to table view"
                }
              >
                {viewMode === "table" ? (
                  <Columns className="w-3.5 h-3.5" />
                ) : (
                  <Rows className="w-3.5 h-3.5" />
                )}
              </Button>
              <Popover open={isSearchOpen} onOpenChange={setIsSearchOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant={isSearchOpen ? "secondary" : "ghost"}
                    size="sm"
                    className="h-6 w-6 p-0 hover:bg-muted/60"
                    title="Search in current table (Ctrl/Cmd+F)"
                  >
                    <Search className="w-3.5 h-3.5" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent
                  align="start"
                  side="bottom"
                  sideOffset={6}
                  className="w-[320px] p-3 space-y-2 shadow-lg"
                >
                  <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                      <Input
                        ref={searchInputRef}
                        type="text"
                        placeholder="Search keyword..."
                        className="h-8 pl-8 pr-8 text-xs"
                        value={searchKeyword}
                        onChange={(e) => setSearchKeyword(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            handleSearchEnter();
                          } else if (e.key === "Escape") {
                            e.preventDefault();
                            setIsSearchOpen(false);
                          }
                        }}
                      />
                      {searchKeyword && (
                        <button
                          onClick={() => setSearchKeyword("")}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                  {normalizedSearchKeyword ? (
                    <div className="text-[11px] text-muted-foreground">
                      {matchedRows.size} row(s), {searchMatches.length}{" "}
                      match(es)
                      {currentSearchMatch
                        ? ` • ${searchCursorIndex + 1}/${searchMatches.length}`
                        : ""}
                    </div>
                  ) : (
                    <div className="text-[11px] text-muted-foreground">
                      Enter keyword, press Enter to jump next match
                    </div>
                  )}
                  {normalizedSearchKeyword && searchMatches.length === 0 && (
                    <div className="text-[11px] text-muted-foreground">
                      No matches in current table view
                    </div>
                  )}
                </PopoverContent>
              </Popover>
            </div>

            <div className="flex items-center gap-1.5">
              {tableContext && onCreateQuery && (
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 gap-1 px-2 text-xs hover:bg-muted/60"
                    onClick={() =>
                      onCreateQuery(
                        tableContext.connectionId,
                        tableContext.database,
                        tableContext.driver,
                      )
                    }
                    title={t("connection.menu.newQuery")}
                  >
                    <SquareTerminal className="w-3.5 h-3.5" />
                    {t("connection.menu.newQuery")}
                  </Button>

                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 gap-1 px-2 hover:bg-muted/60"
                    onClick={handleShowDDL}
                    title="View Table Structure (DDL)"
                  >
                    <FileCode className="w-3.5 h-3.5" />
                    <span className="text-xs font-medium leading-none">
                      ddl
                    </span>
                  </Button>

                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 gap-1 px-2 hover:bg-muted/60"
                    onClick={() => {
                      if (tableContext && onOpenERDiagram) {
                        onOpenERDiagram(tableContext);
                      }
                    }}
                    title="Open ER Diagram"
                  >
                    <Table className="w-3.5 h-3.5" />
                    <span className="text-xs font-medium leading-none">
                      ER
                    </span>
                  </Button>
                </>
              )}
              {(canInsert || canUpdateDelete) && (
                <>
                  {canInsert && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0 hover:bg-muted/60"
                      onClick={handleAddDraftRow}
                      disabled={isSaving || isDeleting}
                      title="Add a new row draft"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </Button>
                  )}
                  {canUpdateDelete && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0 hover:bg-destructive/10 text-destructive disabled:text-muted-foreground"
                      onClick={() => setDeleteDialogOpen(true)}
                      disabled={!selectedRows.size || isSaving || isDeleting}
                      title={
                        selectedRows.size
                          ? `Delete ${selectedRows.size} selected row(s)`
                          : "Select rows to delete"
                      }
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  )}
                </>
              )}

              {hasPendingChanges && (
                <div className="flex items-center gap-1 bg-amber-500/10 rounded-lg p-0.5 border border-amber-500/20">
                  <Button
                    ref={saveButtonRef}
                    variant="ghost"
                    size="sm"
                    className="h-6 gap-1.5 text-xs hover:bg-amber-500/20 text-amber-700 dark:text-amber-400"
                    onClick={handleSave}
                    disabled={isSaving}
                    title="Save changes (Cmd/Ctrl+S)"
                  >
                    {isSaving ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Save className="w-3.5 h-3.5" />
                    )}
                    Save
                    <span className="bg-amber-500/20 text-amber-700 dark:text-amber-400 text-[10px] px-1.5 py-0 rounded-full font-medium">
                      {pendingMutationCount}
                    </span>
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0 hover:bg-amber-500/20 text-amber-700 dark:text-amber-400"
                    onClick={handleDiscardChanges}
                    disabled={isSaving}
                    title="Discard changes (Esc)"
                  >
                    <Undo2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              )}

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0 hover:bg-muted/60"
                    disabled={!tableContext || isExporting}
                    title="Export data"
                  >
                    <Download className="w-3.5 h-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger>
                      Export Current Page
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent>
                      <DropdownMenuItem
                        onClick={() => void handleExport("current_page", "csv")}
                      >
                        CSV
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() =>
                          void handleExport("current_page", "json")
                        }
                      >
                        JSON
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() =>
                          void handleExport("current_page", "sql_dml")
                        }
                      >
                        SQL
                      </DropdownMenuItem>
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger>
                      Export Filtered Result
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent>
                      <DropdownMenuItem
                        onClick={() => void handleExport("filtered", "csv")}
                      >
                        CSV
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => void handleExport("filtered", "json")}
                      >
                        JSON
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => void handleExport("filtered", "sql_dml")}
                      >
                        SQL
                      </DropdownMenuItem>
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger>
                      Export Full Table
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent>
                      <DropdownMenuItem
                        onClick={() => void handleExport("full_table", "csv")}
                      >
                        CSV
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => void handleExport("full_table", "json")}
                      >
                        JSON
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() =>
                          void handleExport("full_table", "sql_dml")
                        }
                      >
                        SQL
                      </DropdownMenuItem>
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {tableContext && onFilterChange ? (
            <div className="pt-1 border-t border-border/40 flex items-center gap-2">
              <div className="relative flex-1 min-w-0">
                <Filter className="absolute left-2 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <ColumnAutocompleteInput
                  placeholder="WHERE ..."
                  className="pl-8 h-7 w-full font-mono text-xs"
                  value={whereInput}
                  onValueChange={setWhereInput}
                  onSubmit={() => onFilterChange(whereInput, orderByInput)}
                  options={columnAutocompleteOptions}
                />
              </div>
              <div className="relative flex-1 min-w-0">
                <ArrowUpDown className="absolute left-2 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <ColumnAutocompleteInput
                  placeholder="ORDER BY ..."
                  className="pl-8 h-7 w-full font-mono text-xs"
                  value={orderByInput}
                  onValueChange={setOrderByInput}
                  onSubmit={() => onFilterChange(whereInput, orderByInput)}
                  options={columnAutocompleteOptions}
                />
              </div>
              {tableContext && mutabilityHint && (
                <span
                  className="text-xs text-muted-foreground italic"
                  title={mutabilityHint}
                >
                  {canInsert ? "Partial write" : "Read-only"}
                </span>
              )}
            </div>
          ) : (
            tableContext &&
            mutabilityHint && (
              <span
                className="text-xs text-muted-foreground italic"
                title={mutabilityHint}
              >
                {canInsert ? "Partial write" : "Read-only"}
              </span>
            )
          )}
        </div>
      )}

      <div ref={scrollContainerRef} className="flex-1 overflow-auto">
        {viewMode === "column" ? (
          <table className="border-collapse w-auto">
            <colgroup>
              {showRowNumbers && <col style={{ width: 50 }} />}
              <col />
              {currentData.map((_, idx) => (
                <col key={idx} />
              ))}
            </colgroup>
            <thead className="bg-muted/90 sticky top-0 z-10">
              <tr>
                {showRowNumbers && (
                  <th className="px-4 py-2 text-left text-xs font-semibold text-muted-foreground border-b border-r border-border">
                    #
                  </th>
                )}
                <th className="px-4 py-2 text-left text-xs font-semibold text-muted-foreground border-b border-r border-border">
                  Column
                </th>
                {currentData.map((_, rowIndex) => (
                  <th
                    key={rowIndex}
                    className="px-4 py-2 text-left text-xs font-semibold text-muted-foreground border-b border-r border-border"
                  >
                    Record {startIndex + rowIndex + 1}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {columns.map((column, colIndex) => (
                <tr
                  key={column}
                  className={[
                    "hover:bg-muted/50 border-b border-border",
                    showZebraStripes && colIndex % 2 === 1 ? "bg-muted/30" : "",
                  ].filter(Boolean).join(" ")}
                >
                  {showRowNumbers && (
                    <td className="px-4 py-2 text-xs text-muted-foreground border-r border-border">
                      {colIndex + 1}
                    </td>
                  )}
                  <td className="px-4 py-2 text-xs font-semibold text-foreground border-r border-border bg-muted/30">
                    <div>{column}</div>
                    {showColumnComments && columnComments[column] && (
                      <span className="block truncate text-[10px] text-muted-foreground/60 leading-tight font-normal">
                        {columnComments[column]}
                      </span>
                    )}
                  </td>
                  {currentData.map((row, rowIndex) => {
                    const modified = isCellModified(rowIndex, column);
                    const displayValue = getCellDisplayValue(
                      rowIndex,
                      column,
                      row[column],
                    );
                    const editing =
                      editingCell?.row === rowIndex &&
                      editingCell?.col === column;
                    const selected =
                      selectedCell?.row === rowIndex &&
                      selectedCell?.col === column;
                    const inRange = isCellInRange(rowIndex, colIndex, cellSelectionRange);
                    const matched =
                      normalizedSearchKeyword.length > 0 &&
                      matchedCellKeys.has(`${rowIndex}::${column}`);

                    return (
                      <td
                        key={rowIndex}
                        className={[
                          "px-0 py-0 text-sm text-foreground font-mono border-r border-border relative group transition-all duration-150 ease-out",
                          selected && !editing
                            ? "bg-accent text-accent-foreground"
                            : "",
                          inRange && !selected && !editing
                            ? "bg-accent"
                            : "",
                          matched && !editing
                            ? "bg-amber-100/60 dark:bg-amber-900/20"
                            : "",
                          modified && !editing
                            ? "border-l-2 border-l-orange-400"
                            : "",
                          isEditableForUpdates ? "cursor-pointer" : "",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                        onMouseDown={(e) =>
                          handleCellMouseDownForRange(e, rowIndex, colIndex)
                        }
                        onMouseEnter={() =>
                          handleCellMouseMoveForRange(rowIndex, colIndex)
                        }
                        onClick={() => handleCellClick(rowIndex, column)}
                        onDoubleClick={() =>
                          handleCellDoubleClick(rowIndex, column, row[column])
                        }
                      >
                        {editing ? (
                          <input
                            ref={editInputRef}
                            type="text"
                            autoCapitalize="none"
                            className="w-full h-full px-4 py-2 bg-background border-2 border-primary outline-none font-mono text-sm shadow-[0_0_0_3px_rgba(var(--primary)_0.15)] animate-in fade-in zoom-in-95 duration-150"
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onKeyDown={handleEditKeyDown}
                            onBlur={commitEdit}
                          />
                        ) : (
                          <div className="px-4 py-2 truncate">
                            {displayValue !== null &&
                            displayValue !== undefined ? (
                              <span
                                className={
                                  modified
                                    ? "text-orange-600 dark:text-orange-400"
                                    : ""
                                }
                              >
                                {formatCellValue(displayValue)}
                              </span>
                            ) : (
                              <span className="text-muted-foreground italic">
                                NULL
                              </span>
                            )}
                            {isComplexValue(displayValue) && (
                              <button
                                className="absolute right-1 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground bg-background/80 rounded px-0.5 transition-opacity"
                                title="View structured data"
                                onMouseDown={(e) => e.stopPropagation()}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setComplexViewer({
                                    value: displayValue,
                                    columnName: column,
                                  });
                                }}
                              >
                                <svg
                                  width="12"
                                  height="12"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="2"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                >
                                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                                </svg>
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <ContextMenu onOpenChange={(open) => { if (!open) setContextMenuRow(null); }}>
          <ContextMenuTrigger asChild>
          <table
            className="border-collapse table-fixed"
            style={{
              width: tableWidthPx,
            }}
          >
            <colgroup>
              {showRowNumbers && <col className="w-12" style={{ width: INDEX_COL_WIDTH }} />}
              {columns.map((column) => (
                <col
                  key={column}
                  style={{
                    width: getColWidth(column),
                    minWidth: 50,
                  }}
                />
              ))}
            </colgroup>
            <thead className="bg-muted/90 sticky top-0 z-10">
              <tr>
                {showRowNumbers && (
                  <th className="px-4 py-2 text-left text-xs font-semibold text-muted-foreground border-b border-r border-border w-12">
                    #
                  </th>
                )}
                {columns.map((column) => {
                  const isSorted = activeSortColumn === column;
                  const direction = isSorted ? activeSortDirection : undefined;
                  const comment = columnComments[column]?.trim();
                  const headerTooltip = comment || column;
                  const headerActionLabel = t("tableView.header.actionHint", {
                    column,
                  });
                  const headerClickState =
                    headerClickStateRef.current[column] ??
                    (headerClickStateRef.current[column] = { timerId: null });
                  const headerInteraction = createSingleAndDoubleClickHandler(
                    headerClickState,
                    () => handleHeaderCopy(column),
                    () => handleSortClick(column),
                  );
                  return (
                    <th
                      key={column}
                      ref={(el) => {
                        thRefs.current[column] = el;
                      }}
                      className="px-4 py-2 text-left text-xs font-semibold text-muted-foreground border-b border-r border-border relative group select-none"
                      style={{
                        width: getColWidth(column),
                        minWidth: 50,
                      }}
                    >
                      <div className="flex items-center justify-between pr-2">
                        <button
                          type="button"
                          className="flex flex-col items-start cursor-pointer hover:text-foreground transition-colors min-w-0 flex-1 overflow-hidden"
                          title={`${headerTooltip}\n${headerActionLabel}`}
                          aria-label={headerActionLabel}
                          onClick={headerInteraction.handleClick}
                          onDoubleClick={headerInteraction.handleDoubleClick}
                        >
                          <div className="flex items-center gap-1 w-full">
                            <span className="truncate" title={headerTooltip}>
                              {column}
                            </span>
                            <span className="flex-shrink-0 w-3.5 h-3.5 flex items-center justify-center">
                              {isSorted ? (
                                direction === "asc" ? (
                                  <ChevronUp className="w-3.5 h-3.5 text-primary" />
                                ) : (
                                  <ChevronDown className="w-3.5 h-3.5 text-primary" />
                                )
                              ) : (
                                <ArrowUpDown className="w-3 h-3 text-muted-foreground/40 opacity-0 group-hover:opacity-100 transition-opacity" />
                              )}
                            </span>
                          </div>
                          {showColumnComments && comment && (
                            <span className="block truncate text-[10px] text-muted-foreground/60 leading-tight font-normal">
                              {comment}
                            </span>
                          )}
                        </button>
                        <div
                          className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-primary/50 group-hover:bg-muted-foreground/20 select-none touch-none"
                          onMouseDown={(e) => handleMouseDown(e, column)}
                        />
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {(() => {
                const virtualItems = virtualizer.getVirtualItems();
                const lastItemEnd = virtualItems.length > 0 ? virtualItems[virtualItems.length - 1].end : 0;
                const bottomSpacerHeight = virtualizer.getTotalSize() - lastItemEnd;
                const draftRowsHeight = insertDraftRows.length * 36;
                return (
                  <>
                    {/* Top spacer for virtual scroll */}
                    {virtualItems.length > 0 && (
                      <tr>
                        <td
                          colSpan={columns.length + (showRowNumbers ? 1 : 0)}
                          style={{ height: virtualItems[0]?.start ?? 0, padding: 0, border: 'none' }}
                        />
                      </tr>
                    )}
                    {virtualItems.map((virtualRow) => {
                      const rowIndex = virtualRow.index;
                      const row = currentData[rowIndex];
                      if (!row || typeof row !== "object") return null;
                      const isRowSelected = selectedRows.has(rowIndex);

                      return (
                        <DataRow
                          key={rowIndex}
                          rowIndex={rowIndex}
                          row={row}
                          columns={columns}
                          showRowNumbers={showRowNumbers}
                          showZebraStripes={showZebraStripes}
                          startIndex={startIndex}
                          isRowSelected={isRowSelected}
                          isMultiRowSelection={isRowSelected && selectedRows.size > 1}
                          editingCell={editingCell}
                          selectedCell={selectedCell}
                          cellSelectionRange={cellSelectionRange}
                          normalizedSearchKeyword={normalizedSearchKeyword}
                          matchedCellKeys={matchedCellKeys}
                          currentSearchMatch={currentSearchMatch}
                          isEditableForUpdates={isEditableForUpdates}
                          editValue={editValue}
                          editInputRef={editInputRef}
                          getColWidth={getColWidth}
                          getCellDisplayValue={getCellDisplayValue}
                          isCellModified={isCellModified}
                          handleCellClick={handleCellClick}
                          handleCellDoubleClick={handleCellDoubleClick}
                          handleCellMouseDownForRange={handleCellMouseDownForRange}
                          handleCellMouseMoveForRange={handleCellMouseMoveForRange}
                          handleIndexMouseDown={handleIndexMouseDown}
                          handleIndexMouseEnter={handleIndexMouseEnter}
                          handleEditKeyDown={handleEditKeyDown}
                          setEditValue={setEditValue}
                          commitEdit={commitEdit}
                          setComplexViewer={setComplexViewer}
                          setContextMenuRow={setContextMenuRow}
                        />
                      );
                    })}
                    {/* Bottom spacer for virtual scroll */}
                    {bottomSpacerHeight - draftRowsHeight > 0 && (
                      <tr>
                        <td
                          colSpan={columns.length + (showRowNumbers ? 1 : 0)}
                          style={{ height: bottomSpacerHeight - draftRowsHeight, padding: 0, border: 'none' }}
                        />
                      </tr>
                    )}
                  </>
                );
              })()}
              {insertDraftRows.map((draft, draftIndex) => (
                <tr
                  key={draft.tempId}
                  className="border-b border-border bg-emerald-500/5"
                >
                  <td className="px-4 py-2 text-xs text-emerald-700 dark:text-emerald-300 border-r border-border font-medium">
                    new
                    {insertDraftRows.length > 1 ? ` ${draftIndex + 1}` : ""}
                  </td>
                  {columns.map((column, colIndex) => (
                    <td
                      key={`${draft.tempId}_${column}`}
                      className="px-0 py-0 text-sm text-foreground font-mono border-r border-border"
                      style={{
                        width: getColWidth(column),
                        minWidth: 50,
                      }}
                    >
                      <input
                        type="text"
                        autoCapitalize="none"
                        data-draft-id={draft.tempId}
                        data-draft-col-index={colIndex}
                        className="w-full h-full px-4 py-2 bg-transparent outline-none"
                        placeholder={column}
                        value={draft.values[column] ?? ""}
                        onChange={(e) =>
                          handleDraftValueChange(
                            draft.tempId,
                            column,
                            e.target.value,
                          )
                        }
                      />
                    </td>
                  ))}
                </tr>
              ))}
              {/* Bottom spacer for virtual scroll */}
              {virtualizer.getVirtualItems().length > 0 && (
                <tr>
                  <td
                    colSpan={columns.length + (showRowNumbers ? 1 : 0)}
                    style={{ height: virtualizer.getTotalSize() - (virtualizer.getVirtualItems().slice(-1)[0]?.end ?? 0), padding: 0, border: 'none' }}
                  />
                </tr>
              )}
            </tbody>
          </table>
          </ContextMenuTrigger>
          <ContextMenuContent>
            {contextMenuRow !== null && (() => {
              const rowIndex = contextMenuRow;
              const row = currentData[rowIndex];
              if (!row || typeof row !== "object") return null;
              const isRowSelected = selectedRows.has(rowIndex);
              const isMultiRowCopyTarget = isRowSelected && selectedRows.size > 1;
              const copyTargetRows = isMultiRowCopyTarget ? Array.from(selectedRows) : [rowIndex];

              return (
                <>
                  {!!tableContext && onFilterChange && selectedCell && (() => {
                    const cellValue = currentData[selectedCell.row]?.[selectedCell.col];
                    const colMeta = tableColumns.find((c) => c.name === selectedCell.col);
                    const columnType = colMeta?.type || "";
                    const isNull = cellValue === null || cellValue === undefined;
                    const displayValue = isNull ? "NULL" : formatCellValue(cellValue);
                    const truncatedValue = displayValue.length > 30
                      ? displayValue.substring(0, 30) + "..."
                      : displayValue;
                    const isNumeric = isNumericType(columnType);
                    const isString = isStringType(columnType);
                    const isDate = isDateType(columnType);
                    const showComparable = isNumeric || isDate || (!isString && !isNull && typeof cellValue === "number");

                    return (
                      <>
                        <ContextMenuSub>
                          <ContextMenuSubTrigger>
                            <Filter className="w-4 h-4 mr-2" />
                            {t("datagrid.filter.title", "Filter")}
                          </ContextMenuSubTrigger>
                          <ContextMenuSubContent>
                            <ContextMenuItem onClick={() => applyFilter("=")}>
                              = {truncatedValue}
                            </ContextMenuItem>
                            <ContextMenuItem onClick={() => applyFilter("<>")}>
                              &lt;&gt; {truncatedValue}
                            </ContextMenuItem>
                            {showComparable && !isNull && (
                              <>
                                <ContextMenuSeparator />
                                <ContextMenuItem onClick={() => applyFilter(">")}>
                                  &gt; {truncatedValue}
                                </ContextMenuItem>
                                <ContextMenuItem onClick={() => applyFilter(">=")}>
                                  &gt;= {truncatedValue}
                                </ContextMenuItem>
                                <ContextMenuItem onClick={() => applyFilter("<")}>
                                  &lt; {truncatedValue}
                                </ContextMenuItem>
                                <ContextMenuItem onClick={() => applyFilter("<=")}>
                                  &lt;= {truncatedValue}
                                </ContextMenuItem>
                              </>
                            )}
                            {isString && !isNull && (
                              <>
                                <ContextMenuSeparator />
                                <ContextMenuItem onClick={() => applyFilter("LIKE_CONTAINS")}>
                                  LIKE %{truncatedValue}%
                                </ContextMenuItem>
                                <ContextMenuItem onClick={() => applyFilter("LIKE_STARTS")}>
                                  LIKE {truncatedValue}%
                                </ContextMenuItem>
                                <ContextMenuItem onClick={() => applyFilter("LIKE_ENDS")}>
                                  LIKE %{truncatedValue}
                                </ContextMenuItem>
                              </>
                            )}
                            <ContextMenuSeparator />
                            <ContextMenuItem onClick={() => applyFilter("IS NULL")}>
                              IS NULL
                            </ContextMenuItem>
                            <ContextMenuItem onClick={() => applyFilter("IS NOT NULL")}>
                              IS NOT NULL
                            </ContextMenuItem>
                          </ContextMenuSubContent>
                        </ContextMenuSub>
                        <ContextMenuSeparator />
                      </>
                    );
                  })()}
                  <ContextMenuItem onClick={() => handleCopySelection()}>
                    <Copy className="w-4 h-4 mr-2" />
                    {getNormalizedCellRange() ? "Copy Selection" : "Copy Cell"}
                  </ContextMenuItem>
                  {getNormalizedCellRange() ? (
                    <ContextMenuSub>
                      <ContextMenuSubTrigger>
                        <Files className="w-4 h-4 mr-2" />
                        Copy Selection as
                      </ContextMenuSubTrigger>
                      <ContextMenuSubContent>
                        <ContextMenuItem onClick={() => handleCopy(buildSelectionCSV(), "Selection copied as CSV")}>
                          CSV
                        </ContextMenuItem>
                        {!!tableContext && (
                          <ContextMenuItem onClick={() => handleCopy(buildSelectionInsertSQL(), "Selection copied as Insert SQL")}>
                            Insert SQL
                          </ContextMenuItem>
                        )}
                        {canUpdateDelete && (
                          <ContextMenuItem onClick={() => handleCopy(buildSelectionUpdateSQL(), "Selection copied as Update SQL")}>
                            Update SQL
                          </ContextMenuItem>
                        )}
                      </ContextMenuSubContent>
                    </ContextMenuSub>
                  ) : (
                    <>
                      <ContextMenuItem onClick={() => {
                        if (isMultiRowCopyTarget) {
                          handleCopy(buildRowsTSV(copyTargetRows), `Copied ${copyTargetRows.length} row(s)`);
                          return;
                        }
                        const values = columns.map((col) => {
                          const val = getCellDisplayValue(rowIndex, col, row[col]);
                          return val === null || val === undefined ? "" : String(val);
                        }).join("\t");
                        handleCopy(values, "Row copied");
                      }}>
                        <TableIcon className="w-4 h-4 mr-2" />
                        {isMultiRowCopyTarget ? "Copy Selected Rows" : "Copy Row"}
                      </ContextMenuItem>
                      <ContextMenuSeparator />
                      {canUpdateDelete && isCellModified(rowIndex, selectedCell?.col || "") && (
                        <>
                          <ContextMenuItem onClick={() => {
                            if (selectedCell && selectedCell.row === rowIndex) {
                              const key = `${rowIndex}_${selectedCell.col}`;
                              setPendingChanges((prev) => {
                                const next = new Map(prev);
                                next.delete(key);
                                return next;
                              });
                            }
                          }}>
                            <Undo2 className="w-4 h-4 mr-2" />
                            Undo This Cell
                          </ContextMenuItem>
                          <ContextMenuSeparator />
                        </>
                      )}
                      <ContextMenuSub>
                        <ContextMenuSubTrigger>
                          <Files className="w-4 h-4 mr-2" />
                          Copy as
                        </ContextMenuSubTrigger>
                        <ContextMenuSubContent>
                          <ContextMenuItem onClick={() => handleCopy(buildRowsCSV(copyTargetRows), isMultiRowCopyTarget ? "Copied as CSV" : "Row copied as CSV")}>
                            {isMultiRowCopyTarget ? "Copy Selected as CSV" : "Copy as CSV"}
                          </ContextMenuItem>
                          {!!tableContext && (
                            <ContextMenuItem onClick={() => {
                              const sql = buildRowsInsertSQL(copyTargetRows);
                              handleCopy(sql, isMultiRowCopyTarget ? "Copied as Insert SQL" : "Row copied as Insert SQL");
                            }}>
                              {isMultiRowCopyTarget ? "Copy Selected as Insert SQL" : "Copy as Insert SQL"}
                            </ContextMenuItem>
                          )}
                          {canUpdateDelete && (
                            <ContextMenuItem onClick={() => {
                              const sql = buildRowsUpdateSQL(copyTargetRows);
                              handleCopy(sql, isMultiRowCopyTarget ? "Copied as Update SQL" : "Row copied as Update SQL");
                            }}>
                              {isMultiRowCopyTarget ? "Copy Selected as Update SQL" : "Copy as Update SQL"}
                            </ContextMenuItem>
                          )}
                        </ContextMenuSubContent>
                      </ContextMenuSub>
                    </>
                  )}
                </>
              );
            })()}
          </ContextMenuContent>
          </ContextMenu>
        )}
      </div>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete selected rows?</AlertDialogTitle>
            <AlertDialogDescription>
              This action will permanently delete {selectedRows.size} row(s)
              from the table.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={isDeleting}
              onClick={async (e) => {
                e.preventDefault();
                await handleConfirmDelete();
              }}
            >
              {isDeleting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {saveError && (
        <div className="px-4 py-2 border-t border-destructive/30 bg-destructive/10 text-destructive text-xs font-mono whitespace-pre-wrap">
          {saveError}
          <button
            className="ml-2 underline hover:no-underline"
            onClick={() => setSaveError(null)}
          >
            Close
          </button>
        </div>
      )}

      {complexViewer && (
        <ComplexValueViewer
          value={complexViewer.value}
          columnName={complexViewer.columnName}
          open={true}
          onOpenChange={(open) => {
            if (!open) setComplexViewer(null);
          }}
        />
      )}

      <div className="flex items-center px-4 py-1 border-t border-border bg-muted/40">
        <div className="text-sm text-muted-foreground">
          Query executed in{" "}
          {executionTimeMs ? (executionTimeMs / 1000).toFixed(3) : "0.000"}s •{" "}
          {sortedData.length} rows returned
          {normalizedSearchKeyword && (
            <span className="ml-2">
              • {matchedRows.size} row(s) matched "{searchKeyword.trim()}"
            </span>
          )}
          {isRefreshing && <span className="ml-2">• Refreshing…</span>}
          {lastRefreshedAt && !isRefreshing && (
            <span className="ml-2">
              • Updated {lastRefreshedAt.toLocaleTimeString()}
            </span>
          )}
          {hasPendingChanges && (
            <span className="text-orange-600 dark:text-orange-400 ml-2">
              • {pendingMutationCount} unsaved change(s)
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
