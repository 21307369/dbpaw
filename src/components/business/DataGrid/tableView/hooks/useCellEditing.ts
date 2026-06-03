import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { api } from "@/services/api";
import type { ColumnInfo } from "@/services/api";
import { cellValueToString, escapeSQL, formatSQLValue, formatInsertSQLValue, getQualifiedTableName, quoteIdent, isInsertColumnRequired, isClickHouseMergeTreeEngine, canMutateClickHouseTable, buildUpdateStatement, buildDeleteStatement } from "../utils";
import type { ColumnAutocompleteOption } from "../columnAutocomplete";

export interface PendingChange {
  rowIndex: number;
  sourceRowIndex: number;
  column: string;
  originalValue: any;
  newValue: string;
}

export interface InsertDraftRow {
  tempId: string;
  values: Record<string, string>;
}

interface UseCellEditingParams {
  data: any[];
  currentData: any[];
  columns: string[];
  tableContext?: {
    connectionId: number;
    database: string;
    schema: string;
    table: string;
    driver: string;
  };
  onDataRefresh?: (params?: {
    page?: number;
    limit?: number;
    filter?: string;
    orderBy?: string;
  }) => void | Promise<unknown>;
  selectedCell: { row: number; col: string } | null;
  selectedCellRef: React.MutableRefObject<{ row: number; col: string } | null>;
  selectedRows: Set<number>;
  selectedRowsRef: React.MutableRefObject<Set<number>>;
  setSelectedCell: (cell: { row: number; col: string } | null) => void;
  setSelectedRows: (rows: Set<number>) => void;
  clearSelection: () => void;
  hasLocalClientSort: boolean;
}

export function useCellEditing({
  data,
  currentData,
  columns,
  tableContext,
  onDataRefresh,
  selectedCell: _selectedCell,
  selectedCellRef,
  selectedRows,
  selectedRowsRef,
  setSelectedCell,
  setSelectedRows,
  clearSelection,
  hasLocalClientSort,
}: UseCellEditingParams) {
  const [editingCell, setEditingCell] = useState<{
    row: number;
    col: string;
  } | null>(null);
  const [editValue, setEditValue] = useState<string>("");
  const [pendingChanges, setPendingChanges] = useState<
    Map<string, PendingChange>
  >(new Map());
  const [insertDraftRows, setInsertDraftRows] = useState<InsertDraftRow[]>([]);
  const [primaryKeys, setPrimaryKeys] = useState<string[]>([]);
  const [clickhouseEngine, setClickhouseEngine] = useState<string | null>(null);
  const [tableColumns, setTableColumns] = useState<ColumnInfo[]>([]);
  const [columnComments, setColumnComments] = useState<Record<string, string>>(
    {},
  );
  const [isSaving, setIsSaving] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [pendingFocusDraftId, setPendingFocusDraftId] = useState<string | null>(
    null,
  );

  const editInputRef = useRef<HTMLInputElement>(null);
  const saveButtonRef = useRef<HTMLButtonElement>(null);
  const editingCellRef = useRef<{ row: number; col: string } | null>(null);
  const commitEditRef = useRef<(() => void) | null>(null);
  const pendingChangesRef = useRef<Map<string, PendingChange>>(new Map());
  const editValueRef = useRef("");

  useEffect(() => {
    editingCellRef.current = editingCell;
  }, [editingCell]);

  useEffect(() => {
    pendingChangesRef.current = pendingChanges;
  }, [pendingChanges]);

  useEffect(() => {
    editValueRef.current = editValue;
  }, [editValue]);

  const columnAutocompleteOptions = useMemo<ColumnAutocompleteOption[]>(() => {
    if (tableColumns.length > 0) {
      return tableColumns.map((column) => ({
        name: column.name,
        type: column.type,
      }));
    }
    return columns.map((column) => ({ name: column }));
  }, [columns, tableColumns]);

  // --- Fetch primary keys when tableContext is available ---
  useEffect(() => {
    if (!tableContext) {
      setPrimaryKeys([]);
      setClickhouseEngine(null);
      setTableColumns([]);
      setColumnComments({});
      return;
    }
    api.metadata
      .getTableMetadata(
        tableContext.connectionId,
        tableContext.database,
        tableContext.schema,
        tableContext.table,
      )
      .then((meta) => {
        const pks = meta.columns.filter((c) => c.primaryKey).map((c) => c.name);
        setPrimaryKeys(pks);
        setClickhouseEngine(meta.clickhouseExtra?.engine || null);
        setTableColumns(meta.columns);

        const comments: Record<string, string> = {};
        meta.columns.forEach((c) => {
          const comment = c.comment?.trim();
          if (comment) {
            comments[c.name] = comment;
          }
        });
        setColumnComments(comments);
      })
      .catch((e) => {
        console.error("Failed to fetch primary keys:", e);
        setPrimaryKeys([]);
        setClickhouseEngine(null);
        setTableColumns([]);
        setColumnComments({});
      });
  }, [
    tableContext?.connectionId,
    tableContext?.database,
    tableContext?.schema,
    tableContext?.table,
  ]);

  // Clear pending changes when data/page changes
  useEffect(() => {
    setPendingChanges(new Map());
    setInsertDraftRows([]);
    setEditingCell(null);
    clearSelection();
    setDeleteDialogOpen(false);
    setIsDeleting(false);
    setSaveError(null);
  }, [data, currentData, clearSelection]);

  const isClickHouseDriver = tableContext?.driver === "clickhouse";
  const hasPrimaryKeys = primaryKeys.length > 0;
  const canInsert =
    !!tableContext &&
    (isClickHouseDriver
      ? isClickHouseMergeTreeEngine(clickhouseEngine)
      : hasPrimaryKeys);
  const canUpdateDelete =
    !!tableContext &&
    (isClickHouseDriver
      ? canMutateClickHouseTable(clickhouseEngine, primaryKeys)
      : hasPrimaryKeys);
  const isEditableForUpdates = canUpdateDelete && !hasLocalClientSort;
  const mutabilityHint = useMemo(() => {
    if (!tableContext) return null;
    if (hasLocalClientSort) {
      return "Inline cell editing is disabled while client-side sorting is active.";
    }
    if (isClickHouseDriver) {
      if (!isClickHouseMergeTreeEngine(clickhouseEngine)) {
        return "ClickHouse inline write is only enabled for MergeTree-family tables.";
      }
      if (!hasPrimaryKeys) {
        return "ClickHouse table update/delete requires primary key columns.";
      }
      return null;
    }
    if (!hasPrimaryKeys) {
      return "This table has no primary key and does not support inline editing";
    }
    return null;
  }, [
    tableContext,
    hasLocalClientSort,
    isClickHouseDriver,
    clickhouseEngine,
    hasPrimaryKeys,
  ]);
  const pendingMutationCount = pendingChanges.size + insertDraftRows.length;
  const hasPendingChanges = pendingMutationCount > 0;

  // --- Cell interaction handlers ---
  const handleCellDoubleClick = useCallback(
    (rowIndex: number, col: string, currentValue: any) => {
      if (!isEditableForUpdates) return;
      const key = `${rowIndex}_${col}`;
      const pending = pendingChangesRef.current.get(key);
      const value = pending
        ? pending.newValue
        : cellValueToString(currentValue);
      setEditingCell({ row: rowIndex, col });
      setEditValue(value);
      setSelectedCell({ row: rowIndex, col });
      setTimeout(() => editInputRef.current?.focus(), 0);
    },
    [isEditableForUpdates, setSelectedCell],
  );

  const commitEdit = useCallback(() => {
    const ec = editingCellRef.current;
    if (!ec) return;
    const { row, col } = ec;
    const originalRow = currentData[row];
    if (!originalRow) {
      setEditingCell(null);
      return;
    }
    const sourceRowIndex = data.indexOf(originalRow);
    const originalValue = originalRow[col];
    const originalStr = cellValueToString(originalValue);
    const key = `${row}_${col}`;
    const currentEditValue = editValueRef.current;

    if (currentEditValue !== originalStr) {
      setPendingChanges((prev) => {
        const next = new Map(prev);
        next.set(key, {
          rowIndex: row,
          sourceRowIndex: sourceRowIndex >= 0 ? sourceRowIndex : row,
          column: col,
          originalValue,
          newValue: currentEditValue,
        });
        return next;
      });
    } else {
      setPendingChanges((prev) => {
        const next = new Map(prev);
        next.delete(key);
        return next;
      });
    }
    setEditingCell(null);
  }, [data, currentData]);
  commitEditRef.current = commitEdit;

  const cancelEdit = useCallback(() => {
    setEditingCell(null);
  }, []);

  const handleEditKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        commitEditRef.current?.();
      } else if (e.key === "Escape") {
        e.preventDefault();
        cancelEdit();
      }
    },
    [cancelEdit],
  );

  const handleDiscardChanges = useCallback(() => {
    setPendingChanges(new Map());
    setInsertDraftRows([]);
    setEditingCell(null);
    setSaveError(null);
  }, []);

  // --- SQL generation & save ---

  const generateUpdateSQL = useCallback(() => {
    if (!tableContext || !canUpdateDelete || primaryKeys.length === 0)
      return [];

    const changesByRow = new Map<number, PendingChange[]>();
    pendingChanges.forEach((change) => {
      const existing = changesByRow.get(change.sourceRowIndex) || [];
      existing.push(change);
      changesByRow.set(change.sourceRowIndex, existing);
    });

    const sqls: string[] = [];
    const { schema, table, driver } = tableContext;

    changesByRow.forEach((changes, rowIndex) => {
      const row = data[rowIndex] ?? currentData[changes[0]?.rowIndex ?? -1];
      if (!row) return;

      const setClauses = changes.map((c) => {
        const formattedValue = formatSQLValue(
          c.newValue,
          c.originalValue,
          "execution",
          tableContext.driver,
        );
        return `${quoteIdent(tableContext.driver, c.column)} = ${formattedValue}`;
      });

      const whereClauses = primaryKeys.map((pk) => {
        const pkValue = row[pk];
        if (pkValue === null || pkValue === undefined) {
          return `${quoteIdent(tableContext.driver, pk)} IS NULL`;
        }
        if (typeof pkValue === "number") {
          return `${quoteIdent(tableContext.driver, pk)} = ${pkValue}`;
        }
        return `${quoteIdent(tableContext.driver, pk)} = '${escapeSQL(String(pkValue))}'`;
      });

      const tableName = getQualifiedTableName(driver, schema, table);

      const sql = buildUpdateStatement(
        driver,
        tableName,
        setClauses.join(", "),
        whereClauses.join(" AND "),
      );
      sqls.push(sql);
    });

    return sqls;
  }, [
    tableContext,
    canUpdateDelete,
    primaryKeys,
    pendingChanges,
    data,
    currentData,
  ]);

  const generateInsertSQL = useCallback(() => {
    if (!tableContext || !canInsert || !insertDraftRows.length) return [];
    const tableName = getQualifiedTableName(
      tableContext.driver,
      tableContext.schema,
      tableContext.table,
    );
    const metadataByName = new Map(tableColumns.map((col) => [col.name, col]));
    const sqls: string[] = [];

    insertDraftRows.forEach((draft, index) => {
      const insertColumns: string[] = [];
      const insertValues: string[] = [];

      columns.forEach((columnName) => {
        const raw = draft.values[columnName] ?? "";
        const trimmed = raw.trim();
        const meta = metadataByName.get(columnName);

        if (trimmed === "") {
          if (meta && isInsertColumnRequired(meta)) {
            throw new Error(
              `Row ${index + 1}: column "${columnName}" is required`,
            );
          }
          return;
        }

        const formatted = formatInsertSQLValue(
          raw,
          { name: columnName, type: meta?.type || "text" },
          tableContext.driver,
        );
        insertColumns.push(quoteIdent(tableContext.driver, columnName));
        insertValues.push(formatted);
      });

      if (!insertColumns.length) {
        throw new Error(
          `Row ${index + 1}: at least one column value is required`,
        );
      }

      sqls.push(
        `INSERT INTO ${tableName} (${insertColumns.join(", ")}) VALUES (${insertValues.join(", ")})`,
      );
    });

    return sqls;
  }, [tableContext, canInsert, insertDraftRows, tableColumns, columns]);

  const buildDeleteSQL = useCallback(() => {
    if (
      !tableContext ||
      !canUpdateDelete ||
      !selectedRows.size ||
      primaryKeys.length === 0
    ) {
      return "";
    }

    const selectedIndexes = Array.from(selectedRows).sort((a, b) => a - b);
    const rowClauses = selectedIndexes
      .map((rowIndex) => {
        const row = currentData[rowIndex];
        if (!row) return "";
        const pkClauses = primaryKeys.map((pk) => {
          const pkValue = row[pk];
          if (pkValue === null || pkValue === undefined) {
            return `${quoteIdent(tableContext.driver, pk)} IS NULL`;
          }
          if (typeof pkValue === "number") {
            return `${quoteIdent(tableContext.driver, pk)} = ${pkValue}`;
          }
          return `${quoteIdent(tableContext.driver, pk)} = '${escapeSQL(String(pkValue))}'`;
        });
        return `(${pkClauses.join(" AND ")})`;
      })
      .filter((clause) => clause.length > 0);

    if (!rowClauses.length) return "";

    const tableName = getQualifiedTableName(
      tableContext.driver,
      tableContext.schema,
      tableContext.table,
    );
    return buildDeleteStatement(
      tableContext.driver,
      tableName,
      rowClauses.join(" OR "),
    );
  }, [tableContext, canUpdateDelete, selectedRows, primaryKeys, currentData]);

  const handleAddDraftRow = useCallback(() => {
    if (!canInsert) return;
    const tempId = `draft_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const values = columns.reduce<Record<string, string>>((acc, column) => {
      acc[column] = "";
      return acc;
    }, {});
    setInsertDraftRows((prev) => [...prev, { tempId, values }]);
    setPendingFocusDraftId(tempId);
  }, [canInsert, columns]);

  const handleDraftValueChange = useCallback(
    (tempId: string, column: string, value: string) => {
      setInsertDraftRows((prev) =>
        prev.map((draft) =>
          draft.tempId === tempId
            ? { ...draft, values: { ...draft.values, [column]: value } }
            : draft,
        ),
      );
    },
    [],
  );

  const refreshAfterMutation = useCallback(async () => {
    if (!onDataRefresh) return;
    const runRefresh = async () => {
      const ret = onDataRefresh();
      if (ret && typeof (ret as Promise<unknown>).then === "function") {
        await ret;
      }
    };

    await runRefresh();
    if (tableContext?.driver === "clickhouse") {
      await new Promise((resolve) => setTimeout(resolve, 350));
      await runRefresh();
    }
  }, [onDataRefresh, tableContext?.driver]);

  const handleConfirmDelete = useCallback(async () => {
    if (!tableContext || !canUpdateDelete || !selectedRows.size || isDeleting) {
      return;
    }

    const sql = buildDeleteSQL();
    if (!sql) {
      setDeleteDialogOpen(false);
      return;
    }

    setIsDeleting(true);
    setSaveError(null);
    try {
      await api.query.execute(
        tableContext.connectionId,
        sql,
        tableContext.database,
        "table_view_save",
      );
      setDeleteDialogOpen(false);
      const nextSelectedRows = new Set<number>();
      selectedRowsRef.current = nextSelectedRows;
      setSelectedRows(nextSelectedRows);
      selectedCellRef.current = null;
      setSelectedCell(null);
      setEditingCell(null);
      await refreshAfterMutation();
    } catch (e) {
      setSaveError(
        `Delete failed:\n${sql}\n  -> ${e instanceof Error ? e.message : String(e)}`,
      );
    } finally {
      setIsDeleting(false);
    }
  }, [
    tableContext,
    canUpdateDelete,
    selectedRows,
    isDeleting,
    buildDeleteSQL,
    refreshAfterMutation,
    selectedRowsRef,
    setSelectedRows,
    selectedCellRef,
    setSelectedCell,
  ]);

  const handleSave = useCallback(async () => {
    if (!tableContext || !hasPendingChanges) return;

    setIsSaving(true);
    setSaveError(null);

    let sqls: string[] = [];
    try {
      const updateSqls = generateUpdateSQL();
      const insertSqls = generateInsertSQL();
      sqls = [...updateSqls, ...insertSqls];
    } catch (err) {
      setIsSaving(false);
      setSaveError(err instanceof Error ? err.message : String(err));
      return;
    }

    if (sqls.length === 0) {
      setIsSaving(false);
      return;
    }

    const errors: string[] = [];
    for (const sql of sqls) {
      try {
        await api.query.execute(
          tableContext.connectionId,
          sql,
          tableContext.database,
          "table_view_save",
        );
      } catch (e) {
        errors.push(
          `${sql}\n  -> ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }

    setIsSaving(false);

    if (errors.length > 0) {
      setSaveError(
        `${errors.length} statement(s) failed:\n${errors.join("\n")}`,
      );
    } else {
      setPendingChanges(new Map());
      setInsertDraftRows([]);
      setSaveError(null);
      await refreshAfterMutation();
    }
  }, [
    tableContext,
    hasPendingChanges,
    generateUpdateSQL,
    generateInsertSQL,
    refreshAfterMutation,
  ]);

  const handleRefreshClick = useCallback(async () => {
    if (isRefreshing) return;
    if (hasPendingChanges) {
      const confirmed = window.confirm(
        "You have unsaved changes. Refreshing may discard your editing context. Continue?",
      );
      if (!confirmed) return;
    }

    if (!onDataRefresh) return;

    setIsRefreshing(true);
    try {
      const ret = onDataRefresh();
      if (ret && typeof (ret as Promise<unknown>).then === "function") {
        await ret;
      } else {
        await new Promise((r) => setTimeout(r, 300));
      }
      setLastRefreshedAt(new Date());
    } catch (e) {
      void e;
    } finally {
      setIsRefreshing(false);
    }
  }, [
    hasPendingChanges,
    onDataRefresh,
    isRefreshing,
  ]);

  // Helper: get display value for a cell (considering pending changes)
  const getCellDisplayValue = useCallback(
    (rowIndex: number, column: string, originalValue: any) => {
      const key = `${rowIndex}_${column}`;
      const pending = pendingChanges.get(key);
      if (pending) return pending.newValue;
      return originalValue;
    },
    [pendingChanges],
  );

  const isCellModified = useCallback(
    (rowIndex: number, column: string) => {
      return pendingChanges.has(`${rowIndex}_${column}`);
    },
    [pendingChanges],
  );

  return {
    // State
    editingCell,
    editValue,
    setEditValue,
    pendingChanges,
    insertDraftRows,
    primaryKeys,
    tableColumns,
    columnComments,
    clickhouseEngine,
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
    // Derived
    canInsert,
    canUpdateDelete,
    hasPendingChanges,
    pendingMutationCount,
    mutabilityHint,
    isEditableForUpdates,
    // Refs
    editInputRef,
    saveButtonRef,
    // Handlers
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
    generateUpdateSQL,
    generateInsertSQL,
    buildDeleteSQL,
    getCellDisplayValue,
    isCellModified,
    // Extra
    setEditingCell,
    setPendingChanges,
    setPendingFocusDraftId,
    editingCellRef,
    commitEditRef,
    pendingChangesRef,
    refreshAfterMutation,
  };
}
