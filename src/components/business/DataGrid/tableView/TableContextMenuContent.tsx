import { memo } from "react";
import { useTranslation } from "react-i18next";
import {
  Filter,
  Copy,
  Table as TableIcon,
  Files,
  Undo2,
} from "lucide-react";
import {
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
} from "@/components/ui/context-menu";
import type { ColumnInfo } from "@/services/api";
import type { PendingChange } from "./hooks/useCellEditing";
import {
  formatCellValue,
  isNumericType,
  isStringType,
  isDateType,
} from "./utils";

interface TableContextMenuContentProps {
  contextMenuRow: number | null;
  currentData: any[];
  selectedRows: Set<number>;
  selectedCell: { row: number; col: string } | null;
  columns: string[];
  tableColumns: ColumnInfo[];
  tableContext?: {
    connectionId: number;
    database: string;
    schema: string;
    table: string;
    driver: string;
  };
  canUpdateDelete: boolean;
  onFilterChange?: (filter: string, orderBy: string) => void;
  orderByInput: string;
  getNormalizedCellRange: () => {
    minRow: number;
    maxRow: number;
    minCol: number;
    maxCol: number;
  } | null;
  handleCopy: (text: string, label?: string) => void;
  handleCopySelection: () => void;
  buildSelectionCSV: () => string;
  buildSelectionInsertSQL: () => string;
  buildSelectionUpdateSQL: () => string;
  buildRowsTSV: (rowIndexes: number[]) => string;
  buildRowsCSV: (rowIndexes: number[]) => string;
  buildRowsInsertSQL: (rowIndexes: number[]) => string;
  buildRowsUpdateSQL: (rowIndexes: number[]) => string;
  getCellDisplayValue: (
    rowIndex: number,
    column: string,
    originalValue: any,
  ) => any;
  isCellModified: (rowIndex: number, column: string) => boolean;
  applyFilter: (operator: string) => void;
  setPendingChanges: React.Dispatch<
    React.SetStateAction<Map<string, PendingChange>>
  >;
}

export const TableContextMenuContent = memo(function TableContextMenuContent({
  contextMenuRow,
  currentData,
  selectedRows,
  selectedCell,
  columns,
  tableColumns,
  tableContext,
  canUpdateDelete,
  onFilterChange,
  getNormalizedCellRange,
  handleCopy,
  handleCopySelection,
  buildSelectionCSV,
  buildSelectionInsertSQL,
  buildSelectionUpdateSQL,
  buildRowsTSV,
  buildRowsCSV,
  buildRowsInsertSQL,
  buildRowsUpdateSQL,
  getCellDisplayValue,
  isCellModified,
  applyFilter,
  setPendingChanges,
}: TableContextMenuContentProps) {
  const { t } = useTranslation();

  return (
    <ContextMenuContent>
      {contextMenuRow !== null &&
        (() => {
          const rowIndex = contextMenuRow;
          const row = currentData[rowIndex];
          if (!row || typeof row !== "object") return null;
          const isRowSelected = selectedRows.has(rowIndex);
          const isMultiRowCopyTarget =
            isRowSelected && selectedRows.size > 1;
          const copyTargetRows = isMultiRowCopyTarget
            ? Array.from(selectedRows)
            : [rowIndex];

          return (
            <>
              {!!tableContext &&
                onFilterChange &&
                selectedCell &&
                (() => {
                  const cellValue =
                    currentData[selectedCell.row]?.[selectedCell.col];
                  const colMeta = tableColumns.find(
                    (c) => c.name === selectedCell.col,
                  );
                  const columnType = colMeta?.type || "";
                  const isNull =
                    cellValue === null || cellValue === undefined;
                  const displayValue = isNull
                    ? "NULL"
                    : formatCellValue(cellValue);
                  const truncatedValue =
                    displayValue.length > 30
                      ? displayValue.substring(0, 30) + "..."
                      : displayValue;
                  const isNumeric = isNumericType(columnType);
                  const isString = isStringType(columnType);
                  const isDate = isDateType(columnType);
                  const showComparable =
                    isNumeric ||
                    isDate ||
                    (!isString &&
                      !isNull &&
                      typeof cellValue === "number");

                  return (
                    <>
                      <ContextMenuSub>
                        <ContextMenuSubTrigger>
                          <Filter className="w-4 h-4 mr-2" />
                          {t("datagrid.filter.title", "Filter")}
                        </ContextMenuSubTrigger>
                        <ContextMenuSubContent>
                          <ContextMenuItem
                            onClick={() => applyFilter("=")}
                          >
                            = {truncatedValue}
                          </ContextMenuItem>
                          <ContextMenuItem
                            onClick={() => applyFilter("<>")}
                          >
                            &lt;&gt; {truncatedValue}
                          </ContextMenuItem>
                          {showComparable && !isNull && (
                            <>
                              <ContextMenuSeparator />
                              <ContextMenuItem
                                onClick={() => applyFilter(">")}
                              >
                                &gt; {truncatedValue}
                              </ContextMenuItem>
                              <ContextMenuItem
                                onClick={() => applyFilter(">=")}
                              >
                                &gt;= {truncatedValue}
                              </ContextMenuItem>
                              <ContextMenuItem
                                onClick={() => applyFilter("<")}
                              >
                                &lt; {truncatedValue}
                              </ContextMenuItem>
                              <ContextMenuItem
                                onClick={() => applyFilter("<=")}
                              >
                                &lt;= {truncatedValue}
                              </ContextMenuItem>
                            </>
                          )}
                          {isString && !isNull && (
                            <>
                              <ContextMenuSeparator />
                              <ContextMenuItem
                                onClick={() =>
                                  applyFilter("LIKE_CONTAINS")
                                }
                              >
                                LIKE %{truncatedValue}%
                              </ContextMenuItem>
                              <ContextMenuItem
                                onClick={() =>
                                  applyFilter("LIKE_STARTS")
                                }
                              >
                                LIKE {truncatedValue}%
                              </ContextMenuItem>
                              <ContextMenuItem
                                onClick={() =>
                                  applyFilter("LIKE_ENDS")
                                }
                              >
                                LIKE %{truncatedValue}
                              </ContextMenuItem>
                            </>
                          )}
                          <ContextMenuSeparator />
                          <ContextMenuItem
                            onClick={() => applyFilter("IS NULL")}
                          >
                            IS NULL
                          </ContextMenuItem>
                          <ContextMenuItem
                            onClick={() =>
                              applyFilter("IS NOT NULL")
                            }
                          >
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
                {getNormalizedCellRange()
                  ? "Copy Selection"
                  : "Copy Cell"}
              </ContextMenuItem>
              {getNormalizedCellRange() ? (
                <ContextMenuSub>
                  <ContextMenuSubTrigger>
                    <Files className="w-4 h-4 mr-2" />
                    Copy Selection as
                  </ContextMenuSubTrigger>
                  <ContextMenuSubContent>
                    <ContextMenuItem
                      onClick={() =>
                        handleCopy(
                          buildSelectionCSV(),
                          "Selection copied as CSV",
                        )
                      }
                    >
                      CSV
                    </ContextMenuItem>
                    {!!tableContext && (
                      <ContextMenuItem
                        onClick={() =>
                          handleCopy(
                            buildSelectionInsertSQL(),
                            "Selection copied as Insert SQL",
                          )
                        }
                      >
                        Insert SQL
                      </ContextMenuItem>
                    )}
                    {canUpdateDelete && (
                      <ContextMenuItem
                        onClick={() =>
                          handleCopy(
                            buildSelectionUpdateSQL(),
                            "Selection copied as Update SQL",
                          )
                        }
                      >
                        Update SQL
                      </ContextMenuItem>
                    )}
                  </ContextMenuSubContent>
                </ContextMenuSub>
              ) : (
                <>
                  <ContextMenuItem
                    onClick={() => {
                      if (isMultiRowCopyTarget) {
                        handleCopy(
                          buildRowsTSV(copyTargetRows),
                          `Copied ${copyTargetRows.length} row(s)`,
                        );
                        return;
                      }
                      const values = columns
                        .map((col) => {
                          const val = getCellDisplayValue(
                            rowIndex,
                            col,
                            row[col],
                          );
                          return val === null || val === undefined
                            ? ""
                            : String(val);
                        })
                        .join("\t");
                      handleCopy(values, "Row copied");
                    }}
                  >
                    <TableIcon className="w-4 h-4 mr-2" />
                    {isMultiRowCopyTarget
                      ? "Copy Selected Rows"
                      : "Copy Row"}
                  </ContextMenuItem>
                  <ContextMenuSeparator />
                  {canUpdateDelete &&
                    isCellModified(
                      rowIndex,
                      selectedCell?.col || "",
                    ) && (
                      <>
                        <ContextMenuItem
                          onClick={() => {
                            if (
                              selectedCell &&
                              selectedCell.row === rowIndex
                            ) {
                              const key = `${rowIndex}_${selectedCell.col}`;
                              setPendingChanges((prev) => {
                                const next = new Map(prev);
                                next.delete(key);
                                return next;
                              });
                            }
                          }}
                        >
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
                      <ContextMenuItem
                        onClick={() =>
                          handleCopy(
                            buildRowsCSV(copyTargetRows),
                            isMultiRowCopyTarget
                              ? "Copied as CSV"
                              : "Row copied as CSV",
                          )
                        }
                      >
                        {isMultiRowCopyTarget
                          ? "Copy Selected as CSV"
                          : "Copy as CSV"}
                      </ContextMenuItem>
                      {!!tableContext && (
                        <ContextMenuItem
                          onClick={() => {
                            const sql =
                              buildRowsInsertSQL(copyTargetRows);
                            handleCopy(
                              sql,
                              isMultiRowCopyTarget
                                ? "Copied as Insert SQL"
                                : "Row copied as Insert SQL",
                            );
                          }}
                        >
                          {isMultiRowCopyTarget
                            ? "Copy Selected as Insert SQL"
                            : "Copy as Insert SQL"}
                        </ContextMenuItem>
                      )}
                      {canUpdateDelete && (
                        <ContextMenuItem
                          onClick={() => {
                            const sql =
                              buildRowsUpdateSQL(copyTargetRows);
                            handleCopy(
                              sql,
                              isMultiRowCopyTarget
                                ? "Copied as Update SQL"
                                : "Row copied as Update SQL",
                            );
                          }}
                        >
                          {isMultiRowCopyTarget
                            ? "Copy Selected as Update SQL"
                            : "Copy as Update SQL"}
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
  );
});
