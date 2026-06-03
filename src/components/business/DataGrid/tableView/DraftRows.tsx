import { memo } from "react";
import type { InsertDraftRow } from "./hooks/useCellEditing";

interface DraftRowProps {
  draft: InsertDraftRow;
  columns: string[];
  showRowNumbers: boolean;
  getColWidth: (column: string) => number;
  handleDraftValueChange: (tempId: string, column: string, value: string) => void;
}

export const DraftRow = memo(function DraftRow({
  draft,
  columns,
  showRowNumbers,
  getColWidth,
  handleDraftValueChange,
}: DraftRowProps) {
  return (
    <tr
      key={draft.tempId}
      className="border-b border-border bg-emerald-500/5"
    >
      {showRowNumbers && (
        <td className="px-4 py-2 text-xs text-emerald-700 dark:text-emerald-300 border-r border-border font-medium">
          new
        </td>
      )}
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
  );
});

interface DraftRowsProps {
  insertDraftRows: InsertDraftRow[];
  columns: string[];
  showRowNumbers: boolean;
  getColWidth: (column: string) => number;
  handleDraftValueChange: (tempId: string, column: string, value: string) => void;
}

export const DraftRows = memo(function DraftRows({
  insertDraftRows,
  columns,
  showRowNumbers,
  getColWidth,
  handleDraftValueChange,
}: DraftRowsProps) {
  return (
    <>
      {insertDraftRows.map((draft) => (
        <DraftRow
          key={draft.tempId}
          draft={draft}
          columns={columns}
          showRowNumbers={showRowNumbers}
          getColWidth={getColWidth}
          handleDraftValueChange={handleDraftValueChange}
        />
      ))}
    </>
  );
});
