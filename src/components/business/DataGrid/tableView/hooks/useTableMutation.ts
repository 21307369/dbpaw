import { useState, useCallback } from "react";
import { save } from "@tauri-apps/plugin-dialog";
import { api, isTauri } from "@/services/api";
import type { TransferFormat } from "@/services/api";
import { toast } from "sonner";

interface UseTableMutationParams {
  tableContext?: {
    connectionId: number;
    database: string;
    schema: string;
    table: string;
    driver: string;
  };
  controlledFilter?: string;
  orderByInput: string;
  activeSortColumn?: string;
  activeSortDirection?: "asc" | "desc";
  page: number;
  pageSize: number;
}

export function useTableMutation({
  tableContext,
  controlledFilter,
  orderByInput,
  activeSortColumn,
  activeSortDirection,
  page,
  pageSize,
}: UseTableMutationParams) {
  const [isExporting, setIsExporting] = useState(false);

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

  return { isExporting, handleExport };
}
