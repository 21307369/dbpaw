import { createContext, useContext, type ReactNode } from "react";
import type { TabItem } from "@/types/tab";
import type { TabContentRendererProps } from "./TabContentRenderer";

export type TableRefreshOverrides = {
  page?: number;
  limit?: number;
  filter?: string;
  orderBy?: string;
};

export type TableDdlContext = {
  connectionId: number;
  database: string;
  schema: string;
  table: string;
};

export type TableErDiagramContext = TableDdlContext & {
  driver: string;
};

export type OpenErDiagramContext = {
  connectionId?: number;
  database?: string;
  schema?: string;
};

// ── Editor Actions ──
interface EditorActions {
  handleExecuteQuery: (tabId: string, sql: string) => Promise<void>;
  handleSqlChange: (tabId: string, sql: string) => void;
  handleEditorDatabaseChange: (
    tabId: string,
    database: string,
  ) => Promise<void>;
  setQueriesLastUpdated: (timestamp: number) => void;
  setTabs: React.Dispatch<React.SetStateAction<TabItem[]>>;
  isDefaultQueryTitle: (title?: string) => boolean;
}

const EditorActionsContext = createContext<EditorActions | null>(null);

// ── Table Actions ──
interface TableActions {
  handlePageChange: (tabId: string, page: number) => Promise<void>;
  handlePageSizeChange: (tabId: string, pageSize: number) => Promise<void>;
  handleSortChange: (
    tabId: string,
    column: string,
    direction: "asc" | "desc",
  ) => Promise<void>;
  handleFilterChange: (
    tabId: string,
    filter: string,
    orderBy: string,
  ) => Promise<void>;
  handleTableRefresh: (
    tabId: string,
    overrides?: TableRefreshOverrides,
  ) => Promise<void>;
  handleOpenTableDDL: (ctx: TableDdlContext) => void;
  handleOpenERDiagram: (ctx?: OpenErDiagramContext) => void;
  handleCreateQuery: (
    connectionId: number,
    databaseName: string,
    driver: string,
  ) => void;
  showColumnComments: boolean;
  showRowNumbers: boolean;
  showZebraStripes: boolean;
}

const TableActionsContext = createContext<TableActions | null>(null);

// ── Redis Actions ──
interface RedisActions {
  handleOpenRedisConsole: (
    connection: string,
    database: string,
    connectionId: number,
    driver: string,
  ) => void;
  notifyRedisRefresh: (connectionId: number, database: string) => void;
}

const RedisActionsContext = createContext<RedisActions | null>(null);

// ── Schema Actions ──
interface SchemaActions {
  handleCreateTableSuccess: (
    tabId: string,
    connectionId: number,
    database: string,
    schema: string | undefined,
    tableName: string,
    driver: string,
  ) => void;
  handleAlterTableSuccess: (tabId: string) => void;
}

const SchemaActionsContext = createContext<SchemaActions | null>(null);

// ── Tab Actions ──
interface TabActions {
  handleCloseTab: (tabId: string) => void;
  setTabs: React.Dispatch<React.SetStateAction<TabItem[]>>;
}

const TabActionsContext = createContext<TabActions | null>(null);

// ── Hooks ──

export function useEditorActions(): EditorActions {
  const ctx = useContext(EditorActionsContext);
  if (!ctx)
    throw new Error("useEditorActions must be used within TabActionsProvider");
  return ctx;
}

export function useTableActions(): TableActions {
  const ctx = useContext(TableActionsContext);
  if (!ctx)
    throw new Error("useTableActions must be used within TabActionsProvider");
  return ctx;
}

export function useRedisActions(): RedisActions {
  const ctx = useContext(RedisActionsContext);
  if (!ctx)
    throw new Error("useRedisActions must be used within TabActionsProvider");
  return ctx;
}

export function useSchemaActions(): SchemaActions {
  const ctx = useContext(SchemaActionsContext);
  if (!ctx)
    throw new Error("useSchemaActions must be used within TabActionsProvider");
  return ctx;
}

export function useTabActions(): TabActions {
  const ctx = useContext(TabActionsContext);
  if (!ctx)
    throw new Error("useTabActions must be used within TabActionsProvider");
  return ctx;
}

// ── Provider ──

type TabActionsProviderProps = Omit<
  TabContentRendererProps,
  "tabs" | "activeTab"
> & {
  children: ReactNode;
};

export function TabActionsProvider({
  children,
  ...p
}: TabActionsProviderProps) {
  return (
    <TabActionsContext.Provider
      value={{ handleCloseTab: p.handleCloseTab, setTabs: p.setTabs }}
    >
      <EditorActionsContext.Provider
        value={{
          handleExecuteQuery: p.handleExecuteQuery,
          handleSqlChange: p.handleSqlChange,
          handleEditorDatabaseChange: p.handleEditorDatabaseChange,
          setQueriesLastUpdated: p.setQueriesLastUpdated,
          setTabs: p.setTabs,
          isDefaultQueryTitle: p.isDefaultQueryTitle,
        }}
      >
        <TableActionsContext.Provider
          value={{
            handlePageChange: p.handlePageChange,
            handlePageSizeChange: p.handlePageSizeChange,
            handleSortChange: p.handleSortChange,
            handleFilterChange: p.handleFilterChange,
            handleTableRefresh: p.handleTableRefresh,
            handleOpenTableDDL: p.handleOpenTableDDL,
            handleOpenERDiagram: p.handleOpenERDiagram,
            handleCreateQuery: p.handleCreateQuery,
            showColumnComments: p.showColumnComments,
            showRowNumbers: p.showRowNumbers,
            showZebraStripes: p.showZebraStripes,
          }}
        >
          <RedisActionsContext.Provider
            value={{
              handleOpenRedisConsole: p.handleOpenRedisConsole,
              notifyRedisRefresh: p.notifyRedisRefresh,
            }}
          >
            <SchemaActionsContext.Provider
              value={{
                handleCreateTableSuccess: p.handleCreateTableSuccess,
                handleAlterTableSuccess: p.handleAlterTableSuccess,
              }}
            >
              {children}
            </SchemaActionsContext.Provider>
          </RedisActionsContext.Provider>
        </TableActionsContext.Provider>
      </EditorActionsContext.Provider>
    </TabActionsContext.Provider>
  );
}
