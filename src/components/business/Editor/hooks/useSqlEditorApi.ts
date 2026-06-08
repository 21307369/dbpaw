import { useState, useCallback, useRef } from "react";
import { save } from "@tauri-apps/plugin-dialog";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import {
  api,
  type SavedQuery,
  type TransferFormat,
  isTauri,
} from "@/services/api";
import { errorMessage } from "@/lib/errors";

export function useSqlEditorApi(props: {
  code: string;
  connectionId?: number;
  databaseName?: string;
  driver?: string;
  savedQueryId?: number;
  initialName?: string;
  initialDescription?: string;
  onSaveSuccess?: (savedQuery: SavedQuery) => void;
}) {
  const {
    code,
    connectionId,
    databaseName,
    driver,
    savedQueryId,
    initialName,
    initialDescription,
    onSaveSuccess,
  } = props;
  const { t } = useTranslation();
  const [isFormatting, setIsFormatting] = useState(false);
  const [isSaveDialogOpen, setIsSaveDialogOpen] = useState(false);
  const savedQueryIdRef = useRef(savedQueryId);

  if (savedQueryIdRef.current !== savedQueryId) {
    savedQueryIdRef.current = savedQueryId;
  }

  const executeSave = useCallback(
    async (name: string, description: string) => {
      try {
        const currentId = savedQueryIdRef.current;
        let result: SavedQuery;
        if (currentId) {
          result = await api.queries.update(currentId, {
            name,
            description,
            query: code,
            connectionId: connectionId || undefined,
            database: databaseName,
          });
        } else {
          result = await api.queries.create({
            name,
            description,
            query: code,
            connectionId: connectionId || undefined,
            database: databaseName,
          });
        }
        toast.success(t("sqlEditor.save.success"));
        if (onSaveSuccess) {
          onSaveSuccess(result);
        }
      } catch (e) {
        console.error("Failed to save query", e);
        toast.error(t("sqlEditor.save.failed"), {
          description: errorMessage(e),
        });
      }
    },
    [code, connectionId, databaseName, onSaveSuccess, t],
  );

  const triggerSave = useCallback(() => {
    const currentId = savedQueryIdRef.current;
    if (currentId) {
      executeSave(
        initialName || t("sqlEditor.untitled"),
        initialDescription || "",
      );
    } else {
      setIsSaveDialogOpen(true);
    }
  }, [initialName, initialDescription, executeSave, t]);

  const handleExportResult = useCallback(
    async (format: TransferFormat) => {
      if (!connectionId) {
        toast.error(t("sqlEditor.export.runWithSavedConnection"));
        return;
      }
      if (!isTauri()) {
        toast.error(t("sqlEditor.export.desktopOnly"));
        return;
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const defaultPath = `query_result_${timestamp}.${format}`;
      const filters =
        format === "csv"
          ? [{ name: "CSV", extensions: ["csv"] }]
          : format === "json"
            ? [{ name: "JSON", extensions: ["json"] }]
            : [{ name: "SQL", extensions: ["sql"] }];

      let filePath: string | undefined;
      try {
        const selected = await save({
          title: t("sqlEditor.export.saveFileTitle"),
          defaultPath,
          filters,
        });
        if (!selected) return;
        filePath = Array.isArray(selected) ? selected[0] : selected;
        if (!filePath) return;
      } catch (e) {
        toast.error(t("sqlEditor.export.openSaveDialogFailed"), {
          description: errorMessage(e),
        });
        return;
      }

      try {
        const result = await api.transfer.exportQueryResult({
          id: connectionId,
          database: databaseName,
          sql: code,
          driver: driver || "postgres",
          format,
          filePath,
        });
        toast.success(
          t("sqlEditor.export.completed", { count: result.rowCount }),
          {
            description: result.filePath,
          },
        );
      } catch (e) {
        toast.error(t("sqlEditor.export.failed"), {
          description: errorMessage(e),
        });
      }
    },
    [connectionId, databaseName, code, driver, t],
  );

  const handleFormat = useCallback(async (): Promise<string | undefined> => {
    if (isFormatting) return undefined;

    setIsFormatting(true);
    try {
      const { format } = await import("sql-formatter");
      const dialectMap: Record<string, string> = {
        postgres: "postgresql",
        postgresql: "postgresql",
        mysql: "mysql",
        tidb: "mysql",
        mariadb: "mysql",
        starrocks: "mysql",
        sqlite: "sqlite",
        duckdb: "sqlite",
        clickhouse: "sql",
        mssql: "transactsql",
      };
      const language = ((driver && dialectMap[driver]) || "sql") as any;
      const formatted = format(code, {
        language,
        keywordCase: "upper",
        tabWidth: 2,
      });
      return formatted;
    } catch (e) {
      console.error("Format failed:", e);
      toast.error(t("sqlEditor.error.formatFailed"), {
        description: errorMessage(e),
      });
      return undefined;
    } finally {
      setIsFormatting(false);
    }
  }, [code, driver, isFormatting, t]);

  return {
    executeSave,
    triggerSave,
    handleExportResult,
    handleFormat,
    isFormatting,
    isSaveDialogOpen,
    setIsSaveDialogOpen,
  };
}
