import { useCallback } from "react";
import { api } from "@/services/api";
import { toast } from "sonner";
import { errorMessage } from "@/lib/errors";
import type { TabItem, TableTabItem } from "@/types/tab";

export type TableRefreshOverrides = {
  page?: number;
  limit?: number;
  filter?: string;
  orderBy?: string;
};

interface UseTableViewerParams {
  tabs: TabItem[];
  setTabs: React.Dispatch<React.SetStateAction<TabItem[]>>;
  setActiveTab: React.Dispatch<React.SetStateAction<string>>;
  resolveTableScope: (
    driver: string,
    database?: string,
    schemaOverride?: string,
  ) => { schema: string; dbParam: string | undefined };
  t: (key: string, options?: any) => string;
}

export function useTableViewer({
  tabs,
  setTabs,
  setActiveTab,
  resolveTableScope,
  t,
}: UseTableViewerParams) {
  const handleTableSelect = useCallback(
    async (
      connection: string,
      database: string,
      table: string,
      connectionId: number,
      driver: string,
      schemaName?: string,
    ) => {
      const tabId = `${connection}-${database}-${schemaName || ""}-${table}`;
      const existingTab = tabs.find((t) => t.id === tabId);
      if (existingTab) {
        setActiveTab(tabId);
        return;
      }

      // Immediately create a placeholder tab and switch to it for instant feedback
      setTabs((prev) => [
        ...prev,
        {
          id: tabId,
          type: "table",
          title: table,
          connection,
          database,
          connectionId,
          driver,
          isLoading: true,
        } satisfies TableTabItem,
      ]);
      setActiveTab(tabId);

      try {
        const { schema, dbParam } = resolveTableScope(
          driver,
          database,
          schemaName,
        );

        const resp = await api.tableData.get({
          id: connectionId,
          database: dbParam,
          schema,
          table,
          page: 1,
          limit: 100,
        });
        let columns: string[] = [];
        try {
          const meta = await api.metadata.getTableMetadata(
            connectionId,
            database,
            schema,
            table,
          );
          if (meta && meta.columns) {
            columns = meta.columns.map((c) => c.name);
          }
        } catch (e) {
          console.warn("Failed to fetch metadata for table columns:", e);
        }

        if (columns.length === 0) {
          columns = resp.data.length > 0 ? Object.keys(resp.data[0]) : [];
        }

        setTabs((prev) =>
          prev.map((t) => {
            if (t.id !== tabId) return t;
            if (t.type !== "table") return t;
            return {
              ...t,
              isLoading: false,
              schema,
              tableName: table,
              data: resp.data,
              columns,
              total: resp.total,
              page: resp.page,
              pageSize: resp.limit,
              executionTimeMs: resp.executionTimeMs,
            };
          }),
        );
      } catch (e) {
        const message = errorMessage(e);
        console.error("get_table_data failed", message);
        setTabs((prev) =>
          prev.map((t) => {
            if (t.id !== tabId) return t;
            if (t.type !== "table") return t;
            return { ...t, isLoading: false };
          }),
        );
        toast.error(t("app.error.loadTableData"), {
          description: message,
        });
      }
    },
    [tabs, setTabs, setActiveTab, resolveTableScope, t],
  );

  const handleTableRefresh = useCallback(
    async (tabId: string, overrides?: TableRefreshOverrides) => {
      const tab = tabs.find((t) => t.id === tabId);
      if (!tab || tab.type !== "table") return;
      if (!tab.connectionId || !tab.driver || !tab.tableName) return;

      const hasOwn = <K extends keyof TableRefreshOverrides>(key: K) =>
        !!overrides && Object.prototype.hasOwnProperty.call(overrides, key);

      const nextPage = overrides?.page ?? tab.page ?? 1;
      const nextLimit = overrides?.limit ?? tab.pageSize ?? 100;
      const nextFilter = hasOwn("filter") ? overrides?.filter : tab.filter;
      const nextOrderBy = hasOwn("orderBy") ? overrides?.orderBy : tab.orderBy;

      try {
        const { schema, dbParam } = resolveTableScope(
          tab.driver,
          tab.database,
          tab.schema,
        );
        const resp = await api.tableData.get({
          id: tab.connectionId,
          database: dbParam,
          schema,
          table: tab.tableName,
          page: nextPage,
          limit: nextLimit,
          filter: nextFilter || undefined,
          sortColumn: tab.sortColumn,
          sortDirection: tab.sortDirection,
          orderBy: nextOrderBy || undefined,
        });

        setTabs((prev) =>
          prev.map((t) => {
            if (t.id !== tabId) return t;
            if (t.type !== "table") return t;
            return {
              ...t,
              data: resp.data,
              total: resp.total,
              page: resp.page,
              pageSize: resp.limit,
              executionTimeMs: resp.executionTimeMs,
              filter: nextFilter,
              orderBy: nextOrderBy,
            };
          }),
        );
      } catch (e) {
        const message = errorMessage(e);
        console.error("handleTableRefresh failed", message);
        toast.error(t("app.error.refreshTable"), {
          description: message,
        });
      }
    },
    [tabs, setTabs, resolveTableScope, t],
  );

  const handlePageChange = useCallback(
    async (tabId: string, page: number) => {
      const tab = tabs.find((t) => t.id === tabId);
      if (!tab || tab.type !== "table") return;
      if (!tab.connectionId || !tab.driver || !tab.tableName) return;

      try {
        const { schema, dbParam } = resolveTableScope(
          tab.driver,
          tab.database,
          tab.schema,
        );
        const resp = await api.tableData.get({
          id: tab.connectionId,
          database: dbParam,
          schema,
          table: tab.tableName,
          page,
          limit: tab.pageSize || 100,
          filter: tab.filter,
          sortColumn: tab.sortColumn,
          sortDirection: tab.sortDirection,
          orderBy: tab.orderBy,
        });

        setTabs((prev) =>
          prev.map((t) => {
            if (t.id !== tabId) return t;
            if (t.type !== "table") return t;
            return {
              ...t,
              data: resp.data,
              total: resp.total,
              page: resp.page,
              executionTimeMs: resp.executionTimeMs,
            };
          }),
        );
      } catch (e) {
        const message = errorMessage(e);
        console.error("handlePageChange failed", message);
        toast.error(t("app.error.changePage"), {
          description: message,
        });
      }
    },
    [tabs, setTabs, resolveTableScope, t],
  );

  const handlePageSizeChange = useCallback(
    async (tabId: string, pageSize: number) => {
      const tab = tabs.find((t) => t.id === tabId);
      if (!tab || tab.type !== "table") return;
      if (!tab.connectionId || !tab.driver || !tab.tableName) return;

      try {
        const { schema, dbParam } = resolveTableScope(
          tab.driver,
          tab.database,
          tab.schema,
        );
        const resp = await api.tableData.get({
          id: tab.connectionId,
          database: dbParam,
          schema,
          table: tab.tableName,
          page: 1,
          limit: pageSize,
          filter: tab.filter,
          sortColumn: tab.sortColumn,
          sortDirection: tab.sortDirection,
          orderBy: tab.orderBy,
        });

        setTabs((prev) =>
          prev.map((t) => {
            if (t.id !== tabId) return t;
            if (t.type !== "table") return t;
            return {
              ...t,
              data: resp.data,
              total: resp.total,
              page: resp.page,
              pageSize: resp.limit,
              executionTimeMs: resp.executionTimeMs,
            };
          }),
        );
      } catch (e) {
        const message = errorMessage(e);
        console.error("handlePageSizeChange failed", message);
        toast.error(t("app.error.changePageSize"), {
          description: message,
        });
      }
    },
    [tabs, setTabs, resolveTableScope, t],
  );

  const handleSortChange = useCallback(
    async (tabId: string, column: string, direction: "asc" | "desc") => {
      const tab = tabs.find((t) => t.id === tabId);
      if (!tab || tab.type !== "table") return;
      if (!tab.connectionId || !tab.driver || !tab.tableName) return;

      // Optimistically update sort state
      setTabs((prev) =>
        prev.map((t) => {
          if (t.id !== tabId) return t;
          if (t.type !== "table") return t;
          return { ...t, sortColumn: column, sortDirection: direction };
        }),
      );

      try {
        const { schema, dbParam } = resolveTableScope(
          tab.driver,
          tab.database,
          tab.schema,
        );
        const resp = await api.tableData.get({
          id: tab.connectionId,
          database: dbParam,
          schema,
          table: tab.tableName,
          page: 1, // Reset to first page on sort change
          limit: tab.pageSize || 100,
          filter: tab.filter,
          sortColumn: column,
          sortDirection: direction,
          orderBy: tab.orderBy,
        });

        setTabs((prev) =>
          prev.map((t) => {
            if (t.id !== tabId) return t;
            if (t.type !== "table") return t;
            return {
              ...t,
              data: resp.data,
              total: resp.total,
              page: resp.page,
              executionTimeMs: resp.executionTimeMs,
              sortColumn: column,
              sortDirection: direction,
            };
          }),
        );
      } catch (e) {
        const message = errorMessage(e);
        console.error("handleSortChange failed", message);
        toast.error(t("app.error.sortTable"), {
          description: message,
        });
      }
    },
    [tabs, setTabs, resolveTableScope, t],
  );

  const handleFilterChange = useCallback(
    async (tabId: string, filter: string, orderBy: string) => {
      const tab = tabs.find((t) => t.id === tabId);
      if (!tab || tab.type !== "table") return;
      if (!tab.connectionId || !tab.driver || !tab.tableName) return;

      // Optimistically update filter/orderBy state
      setTabs((prev) =>
        prev.map((t) => {
          if (t.id !== tabId) return t;
          if (t.type !== "table") return t;
          return { ...t, filter, orderBy };
        }),
      );

      try {
        const { schema, dbParam } = resolveTableScope(
          tab.driver,
          tab.database,
          tab.schema,
        );
        const resp = await api.tableData.get({
          id: tab.connectionId,
          database: dbParam,
          schema,
          table: tab.tableName,
          page: 1, // Reset to first page on filter change
          limit: tab.pageSize || 100,
          filter: filter || undefined,
          sortColumn: tab.sortColumn,
          sortDirection: tab.sortDirection,
          orderBy: orderBy || undefined,
        });

        setTabs((prev) =>
          prev.map((t) => {
            if (t.id !== tabId) return t;
            if (t.type !== "table") return t;
            return {
              ...t,
              data: resp.data,
              columns: t.columns,
              total: resp.total,
              page: resp.page,
              executionTimeMs: resp.executionTimeMs,
              filter,
              orderBy,
            };
          }),
        );
      } catch (e) {
        const message = errorMessage(e);
        console.error("handleFilterChange failed", message);
        toast.error(t("app.error.filterTable"), {
          description: message,
        });
      }
    },
    [tabs, setTabs, resolveTableScope, t],
  );

  return {
    handleTableSelect,
    handleTableRefresh,
    handlePageChange,
    handlePageSizeChange,
    handleSortChange,
    handleFilterChange,
  };
}
