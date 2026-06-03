import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useTranslation } from "react-i18next";
import { Skeleton } from "@/components/ui/skeleton";
import { VirtualTableBody } from "./tableView/VirtualTableBody";
import { ColumnViewBody } from "./tableView/ColumnViewBody";
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
import { isEditableTarget } from "@/lib/keyboard";
import { useShortcutMatcher } from "@/contexts/ShortcutsContext";
import {
  buildFilterExpression,
  cellValueToString,
  getQualifiedTableName,
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
import { TableToolbar } from "./tableView/TableToolbar";
import { useTableSort } from "./tableView/hooks/useTableSort";
import { useTablePagination } from "./tableView/hooks/useTablePagination";
import { useColumnState } from "./tableView/hooks/useColumnState";
import { useCellSelection } from "./tableView/hooks/useCellSelection";
import { useCellEditing } from "./tableView/hooks/useCellEditing";
import type { PendingChange } from "./tableView/hooks/useCellEditing";
import { useTableMutation } from "./tableView/hooks/useTableMutation";
import { useTableSearch } from "./tableView/hooks/useTableSearch";
import { TableStatusBar } from "./tableView/TableStatusBar";
import { toast } from "sonner";


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
  const [complexViewer, setComplexViewer] = useState<{
    value: unknown;
    columnName: string;
  } | null>(null);
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
    whereInput,
    orderByInput,
    pageInput,
    pageSizeInput,
    page,
    pageSize,
  });

  // --- Search hook ---
  const {
    isSearchOpen,
    setIsSearchOpen,
    searchKeyword,
    setSearchKeyword,
    searchCursorIndex,
    searchInputRef,
    normalizedSearchKeyword,
    searchMatches,
    matchedRows,
    matchedCellKeys,
    currentSearchMatch,
    focusSearchInput,
    handleSearchEnter,
  } = useTableSearch({
    currentData,
    columns,
    editingCell,
    commitEdit,
    getCellDisplayValue,
    setSelectedCell,
    containerRef,
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

  const { isExporting, handleExport } = useTableMutation({
    tableContext,
    controlledFilter,
    orderByInput,
    activeSortColumn,
    activeSortDirection,
    page,
    pageSize,
  });

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

  // Correctly calculate start index for display
  const startIndex = (page - 1) * pageSize;

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
      <TableToolbar
        hideHeader={hideHeader}
        page={page}
        totalPages={totalPages}
        pageInput={pageInput}
        pageSizeInput={pageSizeInput}
        PAGE_SIZE_OPTIONS={PAGE_SIZE_OPTIONS}
        handlePrevPage={handlePrevPage}
        handleNextPage={handleNextPage}
        handlePageInputCommit={handlePageInputCommit}
        setPageInput={setPageInput}
        handlePageSizeChange={handlePageSizeChange}
        tableContext={tableContext}
        isRefreshing={isRefreshing}
        handleRefreshClick={handleRefreshClick}
        viewMode={viewMode}
        setViewMode={setViewMode}
        isSearchOpen={isSearchOpen}
        setIsSearchOpen={setIsSearchOpen}
        searchKeyword={searchKeyword}
        setSearchKeyword={setSearchKeyword}
        normalizedSearchKeyword={normalizedSearchKeyword}
        matchedRowsSize={matchedRows.size}
        searchMatchesLength={searchMatches.length}
        currentSearchMatch={currentSearchMatch}
        searchCursorIndex={searchCursorIndex}
        handleSearchEnter={handleSearchEnter}
        searchInputRef={searchInputRef}
        onCreateQuery={onCreateQuery}
        onShowDDL={handleShowDDL}
        onOpenERDiagram={onOpenERDiagram}
        canInsert={canInsert}
        canUpdateDelete={canUpdateDelete}
        hasPendingChanges={hasPendingChanges}
        pendingMutationCount={pendingMutationCount}
        isSaving={isSaving}
        isDeleting={isDeleting}
        selectedRowsSize={selectedRows.size}
        saveButtonRef={saveButtonRef}
        handleAddDraftRow={handleAddDraftRow}
        setDeleteDialogOpen={setDeleteDialogOpen}
        handleSave={handleSave}
        handleDiscardChanges={handleDiscardChanges}
        isExporting={isExporting}
        handleExport={handleExport}
        whereInput={whereInput}
        setWhereInput={setWhereInput}
        orderByInput={orderByInput}
        setOrderByInput={setOrderByInput}
        onFilterChange={onFilterChange}
        columnAutocompleteOptions={columnAutocompleteOptions}
        mutabilityHint={mutabilityHint}
      />

      <div ref={scrollContainerRef} className="flex-1 overflow-auto">
        {viewMode === "column" ? (
          <ColumnViewBody
            columns={columns}
            currentData={currentData}
            startIndex={startIndex}
            showRowNumbers={showRowNumbers}
            showZebraStripes={showZebraStripes}
            showColumnComments={showColumnComments}
            columnComments={columnComments}
            normalizedSearchKeyword={normalizedSearchKeyword}
            matchedCellKeys={matchedCellKeys}
            isEditableForUpdates={isEditableForUpdates}
            editingCell={editingCell}
            selectedCell={selectedCell}
            editValue={editValue}
            editInputRef={editInputRef}
            cellSelectionRange={cellSelectionRange}
            getCellDisplayValue={getCellDisplayValue}
            isCellModified={isCellModified}
            handleCellClick={handleCellClick}
            handleCellDoubleClick={handleCellDoubleClick}
            handleCellMouseDownForRange={handleCellMouseDownForRange}
            handleCellMouseMoveForRange={handleCellMouseMoveForRange}
            handleEditKeyDown={handleEditKeyDown}
            setEditValue={setEditValue}
            commitEdit={commitEdit}
            setComplexViewer={setComplexViewer}
          />
        ) : (
          <VirtualTableBody
            columns={columns}
            currentData={currentData}
            virtualizer={virtualizer}
            startIndex={startIndex}
            showRowNumbers={showRowNumbers}
            showZebraStripes={showZebraStripes}
            showColumnComments={showColumnComments}
            columnComments={columnComments}
            getColWidth={getColWidth}
            tableWidthPx={tableWidthPx}
            INDEX_COL_WIDTH={INDEX_COL_WIDTH}
            thRefs={thRefs}
            activeSortColumn={activeSortColumn}
            activeSortDirection={activeSortDirection}
            selectedCell={selectedCell}
            selectedRows={selectedRows}
            editingCell={editingCell}
            editValue={editValue}
            cellSelectionRange={cellSelectionRange}
            normalizedSearchKeyword={normalizedSearchKeyword}
            matchedCellKeys={matchedCellKeys}
            currentSearchMatch={currentSearchMatch}
            isEditableForUpdates={isEditableForUpdates}
            editInputRef={editInputRef}
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
            handleSortClick={handleSortClick}
            handleHeaderCopy={handleHeaderCopy}
            handleMouseDown={handleMouseDown}
            insertDraftRows={insertDraftRows}
            handleDraftValueChange={handleDraftValueChange}
            contextMenuRow={contextMenuRow}
            tableColumns={tableColumns}
            tableContext={tableContext}
            canUpdateDelete={canUpdateDelete}
            onFilterChange={onFilterChange}
            orderByInput={orderByInput}
            getNormalizedCellRange={getNormalizedCellRange}
            handleCopy={handleCopy}
            handleCopySelection={handleCopySelection}
            buildSelectionCSV={buildSelectionCSV}
            buildSelectionInsertSQL={buildSelectionInsertSQL}
            buildSelectionUpdateSQL={buildSelectionUpdateSQL}
            buildRowsTSV={buildRowsTSV}
            buildRowsCSV={buildRowsCSV}
            buildRowsInsertSQL={buildRowsInsertSQL}
            buildRowsUpdateSQL={buildRowsUpdateSQL}
            applyFilter={applyFilter}
            setPendingChanges={setPendingChanges}
            headerClickStateRef={headerClickStateRef}
            t={t}
          />
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

      <TableStatusBar
        executionTimeMs={executionTimeMs}
        sortedDataLength={sortedData.length}
        normalizedSearchKeyword={normalizedSearchKeyword}
        matchedRowsSize={matchedRows.size}
        searchKeyword={searchKeyword}
        isRefreshing={isRefreshing}
        lastRefreshedAt={lastRefreshedAt}
        hasPendingChanges={hasPendingChanges}
        pendingMutationCount={pendingMutationCount}
      />
    </div>
  );
}
