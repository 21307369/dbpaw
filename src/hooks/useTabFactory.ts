import { useCallback } from "react";
import { api } from "@/services/api";
import { toast } from "sonner";
import { errorMessage } from "@/lib/errors";
import type { RoutineType } from "@/services/api";
import type { TabItem } from "@/types/tab";

interface UseTabFactoryParams {
  tabs: TabItem[];
  setTabs: React.Dispatch<React.SetStateAction<TabItem[]>>;
  setActiveTab: React.Dispatch<React.SetStateAction<string>>;
  t: (key: string, options?: any) => string;
}

export function useTabFactory({
  tabs,
  setTabs,
  setActiveTab,
  t,
}: UseTabFactoryParams) {
  const openOrCreateTab = useCallback(
    (tabId: string, tabData: Omit<TabItem, "id">) => {
      const existing = tabs.find((item) => item.id === tabId);
      if (existing) {
        setActiveTab(tabId);
        return;
      }
      setTabs((prev) => [...prev, { id: tabId, ...tabData }]);
      setActiveTab(tabId);
    },
    [tabs, setTabs, setActiveTab],
  );

  const openRedisConsole = useCallback(
    (connection: string, database: string, connectionId: number, driver: string) => {
      openOrCreateTab(`redis-console-${connectionId}-${database}`, {
        type: "redis-console",
        title: `Console · ${database}`,
        connection,
        database,
        connectionId,
        driver,
      } as Omit<TabItem, "id">);
    },
    [openOrCreateTab],
  );

  const openRedisBrowser = useCallback(
    (connection: string, database: string, connectionId: number, driver: string) => {
      openOrCreateTab(`redis-browser-${connectionId}-${database}`, {
        type: "redis-browser",
        title: `Browser · ${database}`,
        connection,
        database,
        connectionId,
        driver,
      } as Omit<TabItem, "id">);
    },
    [openOrCreateTab],
  );

  const openRedisServerInfo = useCallback(
    (connection: string, database: string, connectionId: number, driver: string) => {
      openOrCreateTab(`redis-server-info-${connectionId}-${database}`, {
        type: "redis-server-info",
        title: `Server Info · ${database}`,
        connection,
        database,
        connectionId,
        driver,
      } as Omit<TabItem, "id">);
    },
    [openOrCreateTab],
  );

  const openElasticsearchIndex = useCallback(
    (connection: string, index: string, connectionId: number, driver: string) => {
      openOrCreateTab(`elasticsearch-${connectionId}-${index}`, {
        type: "elasticsearch-index",
        title: index,
        connection,
        connectionId,
        driver,
        elasticsearchIndex: index,
      } as Omit<TabItem, "id">);
    },
    [openOrCreateTab],
  );

  const openTableDDL = useCallback(
    (ctx: { connectionId: number; database: string; schema: string; table: string }) => {
      openOrCreateTab(
        `ddl-${ctx.connectionId}-${ctx.database}-${ctx.schema}-${ctx.table}`,
        {
          type: "ddl",
          title: t("app.tab.ddlTitle", { table: ctx.table }),
          connectionId: ctx.connectionId,
          database: ctx.database,
          schema: ctx.schema,
          tableName: ctx.table,
        } as Omit<TabItem, "id">,
      );
    },
    [openOrCreateTab, t],
  );

  const openRoutine = useCallback(
    (
      connection: string,
      database: string,
      schema: string,
      name: string,
      routineType: RoutineType,
      connectionId: number,
      driver: string,
    ) => {
      openOrCreateTab(
        `routine-${connectionId}-${database}-${schema}-${routineType}-${name}`,
        {
          type: "routine",
          title: name,
          connection,
          database,
          schema,
          routineName: name,
          routineType,
          connectionId,
          driver,
        } as Omit<TabItem, "id">,
      );
    },
    [openOrCreateTab],
  );

  const openCreateTable = useCallback(
    (connectionId: number, database: string, schema: string, driver: string) => {
      const tabId = `create-table-${connectionId}-${database}-${schema}-${Date.now()}`;
      openOrCreateTab(tabId, {
        type: "create-table",
        title: t("createTable.tab.title", { database: database || "—" }),
        connectionId,
        database,
        schema,
        driver,
      } as Omit<TabItem, "id">);
    },
    [openOrCreateTab, t],
  );

  const openAlterTable = useCallback(
    (
      connectionId: number,
      database: string,
      schema: string,
      table: string,
      driver: string,
    ) => {
      openOrCreateTab(
        `alter-table-${connectionId}-${database}-${schema}-${table}`,
        {
          type: "alter-table",
          title: t("alterTable.tab.title", { table }),
          connectionId,
          database,
          schema,
          tableName: table,
          driver,
        } as Omit<TabItem, "id">,
      );
    },
    [openOrCreateTab, t],
  );

  const openRedisKey = useCallback(
    (
      connection: string,
      database: string,
      redisKey: string,
      connectionId: number,
      driver: string,
    ) => {
      openOrCreateTab(`redis-${connectionId}-${database}-${redisKey}`, {
        type: "redis-key",
        title: redisKey || "New Redis key",
        connection,
        database,
        redisKey,
        connectionId,
        driver,
      } as Omit<TabItem, "id">);
    },
    [openOrCreateTab],
  );

  const openERDiagram = useCallback(
    (ctx?: { connectionId?: number; database?: string; schema?: string }) => {
      const connectionId = ctx?.connectionId;
      const database = ctx?.database;
      if (!connectionId || !database) return;

      openOrCreateTab(`er-diagram-${database}`, {
        type: "er-diagram",
        title: `ER - ${database}`,
        connectionId,
        database,
        schema: ctx?.schema,
      } as Omit<TabItem, "id">);
    },
    [openOrCreateTab],
  );

  const exportTable = useCallback(
    async (
      ctx: {
        connectionId: number;
        database: string;
        schema: string;
        table: string;
        driver: string;
      },
      format: "csv" | "json" | "sql_dml" | "sql_ddl" | "sql_full",
      filePath: string,
    ) => {
      try {
        const result = await api.transfer.exportTable({
          id: ctx.connectionId,
          database: ctx.database,
          schema: ctx.schema,
          table: ctx.table,
          driver: ctx.driver,
          format,
          scope: "full_table",
          filePath,
        });
        toast.success(
          t("app.success.exportCompleted", { count: result.rowCount }),
          { description: result.filePath },
        );
      } catch (e) {
        toast.error(t("app.error.exportFailed"), {
          description: errorMessage(e),
        });
      }
    },
    [t],
  );

  const exportDatabase = useCallback(
    async (ctx: {
      connectionId: number;
      database: string;
      driver: string;
      format: "sql_dml" | "sql_ddl" | "sql_full";
      filePath: string;
    }) => {
      try {
        const result = await api.transfer.exportDatabase({
          id: ctx.connectionId,
          database: ctx.database,
          driver: ctx.driver,
          format: ctx.format,
          filePath: ctx.filePath,
        });
        toast.success(
          t("app.success.exportCompleted", { count: result.rowCount }),
          { description: result.filePath },
        );
      } catch (e) {
        toast.error(t("app.error.exportFailed"), {
          description: errorMessage(e),
        });
      }
    },
    [t],
  );

  return {
    openRedisConsole,
    openRedisBrowser,
    openRedisServerInfo,
    openRedisKey,
    openElasticsearchIndex,
    openTableDDL,
    openRoutine,
    openCreateTable,
    openAlterTable,
    openERDiagram,
    exportTable,
    exportDatabase,
  };
}
