import { lazy, Suspense } from "react";
import { TabsContent } from "@/components/ui/tabs";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { TableView } from "@/components/business/DataGrid/TableView";
import { TableMetadataView } from "@/components/business/Metadata/TableMetadataView";
import { RoutineMetadataView } from "@/components/business/Metadata/RoutineMetadataView";
import { FileCode } from "lucide-react";
import { resolveTableScope } from "@/lib/driver-registry";
import { api } from "@/services/api";
import { useTranslation } from "react-i18next";
import {
  TabActionsProvider,
  useEditorActions,
  useRedisActions,
  useSchemaActions,
  useTabActions,
  useTableActions,
  type OpenErDiagramContext,
  type TableDdlContext,
  type TableRefreshOverrides,
} from "./tab-contexts";
import type {
  TabItem,
  EditorTabItem,
  TableTabItem,
  DdlTabItem,
  RoutineTabItem,
  CreateTableTabItem,
  AlterTableTabItem,
  RedisKeyTabItem,
  RedisConsoleTabItem,
  RedisBrowserTabItem,
  RedisServerInfoTabItem,
  ElasticsearchIndexTabItem,
  ERDiagramTabItem,
} from "@/types/tab";

const SqlEditor = lazy(async () => {
  const mod = await import("@/components/business/Editor/SqlEditor");
  return { default: mod.SqlEditor };
});

const CreateTableView = lazy(async () => {
  const mod = await import("@/components/business/CreateTable/CreateTableView");
  return { default: mod.CreateTableView };
});

const AlterTableView = lazy(async () => {
  const mod = await import("@/components/business/CreateTable/AlterTableView");
  return { default: mod.AlterTableView };
});

const RedisKeyView = lazy(async () => {
  const mod = await import("@/components/business/Redis/RedisKeyView");
  return { default: mod.RedisKeyView };
});

const RedisConsole = lazy(async () => {
  const mod = await import("@/components/business/Redis/RedisConsole");
  return { default: mod.RedisConsole };
});

const RedisBrowserView = lazy(async () => {
  const mod = await import("@/components/business/Redis/RedisBrowserView");
  return { default: mod.RedisBrowserView };
});

const RedisServerInfoView = lazy(async () => {
  const mod = await import("@/components/business/Redis/RedisServerInfoView");
  return { default: mod.RedisServerInfoView };
});

const ElasticsearchIndexView = lazy(async () => {
  const mod =
    await import("@/components/business/Elasticsearch/ElasticsearchIndexView");
  return { default: mod.ElasticsearchIndexView };
});

const ERDiagramView = lazy(async () => {
  const mod = await import("@/components/business/ERDiagram/ERDiagramView");
  return { default: mod.default };
});

function LazyPanelFallback({
  label,
  className = "h-full",
}: {
  label: string;
  className?: string;
}) {
  return (
    <div
      className={`${className} flex items-center justify-center text-sm text-muted-foreground`}
    >
      {label}
    </div>
  );
}

export interface TabContentRendererProps {
  tabs: TabItem[];
  activeTab: string;
  handleExecuteQuery: (tabId: string, sql: string) => Promise<void>;
  handleSqlChange: (tabId: string, sql: string) => void;
  handleEditorDatabaseChange: (
    tabId: string,
    database: string,
  ) => Promise<void>;
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
  handleCloseTab: (tabId: string) => void;
  handleCreateTableSuccess: (
    tabId: string,
    connectionId: number,
    database: string,
    schema: string | undefined,
    tableName: string,
    driver: string,
  ) => void;
  handleAlterTableSuccess: (tabId: string) => void;
  handleOpenRedisConsole: (
    connection: string,
    database: string,
    connectionId: number,
    driver: string,
  ) => void;
  notifyRedisRefresh: (connectionId: number, database: string) => void;
  setQueriesLastUpdated: (timestamp: number) => void;
  setTabs: React.Dispatch<React.SetStateAction<TabItem[]>>;
  isDefaultQueryTitle: (title?: string) => boolean;
  showColumnComments: boolean;
  showRowNumbers: boolean;
  showZebraStripes: boolean;
}

function EditorTab({ tab }: { tab: EditorTabItem }) {
  const { t } = useTranslation();
  const {
    handleExecuteQuery,
    handleSqlChange,
    handleEditorDatabaseChange,
    setQueriesLastUpdated,
    setTabs,
    isDefaultQueryTitle,
  } = useEditorActions();
  return (
    <Suspense fallback={<LazyPanelFallback label={t("common.loading")} />}>
      <SqlEditor
        databaseName={tab.database}
        availableDatabases={tab.availableDatabases}
        onExecute={(sql) => handleExecuteQuery(tab.id, sql)}
        onCancel={() =>
          tab.connectionId && tab.activeQueryId
            ? api.query.cancel(String(tab.connectionId), tab.activeQueryId)
            : Promise.resolve(false)
        }
        isExecuting={!!tab.activeQueryId}
        queryResults={tab.queryResults}
        value={tab.sqlContent}
        onChange={(sql) => handleSqlChange(tab.id, sql)}
        onDatabaseChange={(database) =>
          void handleEditorDatabaseChange(tab.id, database)
        }
        connectionId={tab.connectionId}
        driver={tab.driver}
        schemaOverview={tab.schemaOverview}
        savedQueryId={tab.savedQueryId}
        initialName={isDefaultQueryTitle(tab.title) ? "" : tab.title}
        initialDescription={tab.savedQueryDescription}
        onSaveSuccess={(savedQuery) => {
          setQueriesLastUpdated(Date.now());
          setTabs((prev) =>
            prev.map((t) => {
              if (t.id === tab.id) {
                return {
                  ...t,
                  savedQueryId: savedQuery.id,
                  title: savedQuery.name,
                  savedQueryDescription: savedQuery.description || undefined,
                  sqlContent: savedQuery.query,
                  lastSavedSql: savedQuery.query,
                  isDirty: false,
                };
              }
              return t;
            }),
          );
        }}
      />
    </Suspense>
  );
}

function TableTab({ tab }: { tab: TableTabItem }) {
  const {
    handlePageChange,
    handlePageSizeChange,
    handleSortChange,
    handleFilterChange,
    handleTableRefresh,
    handleOpenTableDDL,
    handleOpenERDiagram,
    handleCreateQuery,
    showColumnComments,
    showRowNumbers,
    showZebraStripes,
  } = useTableActions();
  return (
    <TableView
      isLoading={tab.isLoading}
      data={tab.data}
      columns={tab.columns}
      total={tab.total}
      page={tab.page}
      pageSize={tab.pageSize}
      executionTimeMs={tab.executionTimeMs}
      onPageChange={(p) => handlePageChange(tab.id, p)}
      onPageSizeChange={(size) => handlePageSizeChange(tab.id, size)}
      sortColumn={tab.sortColumn}
      sortDirection={tab.sortDirection}
      onSortChange={(col, dir) => handleSortChange(tab.id, col, dir)}
      filter={tab.filter}
      orderBy={tab.orderBy}
      onFilterChange={(f, ob) => handleFilterChange(tab.id, f, ob)}
      onOpenDDL={handleOpenTableDDL}
      onOpenERDiagram={(ctx) => {
        handleOpenERDiagram({
          connectionId: ctx.connectionId,
          database: ctx.database,
        });
      }}
      onDataRefresh={(params) => handleTableRefresh(tab.id, params)}
      onCreateQuery={handleCreateQuery}
      tableContext={
        tab.connectionId && tab.database && tab.tableName && tab.driver
          ? {
              connectionId: tab.connectionId,
              database: tab.database,
              schema: resolveTableScope(tab.driver, tab.database, tab.schema)
                .schema,
              table: tab.tableName,
              driver: tab.driver,
            }
          : undefined
      }
      showColumnComments={showColumnComments}
      showRowNumbers={showRowNumbers}
      showZebraStripes={showZebraStripes}
    />
  );
}

function RedisKeyTab({ tab }: { tab: RedisKeyTabItem }) {
  const { setTabs, handleCloseTab } = useTabActions();
  const { notifyRedisRefresh } = useRedisActions();
  if (
    tab.connectionId === undefined ||
    !tab.database ||
    tab.redisKey === undefined
  ) {
    return null;
  }
  const connectionId = tab.connectionId;
  const database = tab.database;
  return (
    <Suspense fallback={<LazyPanelFallback label="Loading Redis key..." />}>
      <RedisKeyView
        connectionId={connectionId}
        database={database}
        redisKey={tab.redisKey}
        onSavedKeyChange={(key) => {
          setTabs((prev) =>
            prev.map((item) =>
              item.id === tab.id
                ? { ...item, title: key, redisKey: key }
                : item,
            ),
          );
          notifyRedisRefresh(connectionId, database);
        }}
        onDeleted={() => {
          handleCloseTab(tab.id);
          notifyRedisRefresh(connectionId, database);
        }}
      />
    </Suspense>
  );
}

function RedisConsoleTab({ tab }: { tab: RedisConsoleTabItem }) {
  if (tab.connectionId === undefined || !tab.database) return null;
  return (
    <Suspense fallback={<LazyPanelFallback label="Loading Redis Console..." />}>
      <RedisConsole connectionId={tab.connectionId} database={tab.database} />
    </Suspense>
  );
}

function RedisBrowserTab({ tab }: { tab: RedisBrowserTabItem }) {
  const { handleOpenRedisConsole } = useRedisActions();
  if (
    tab.connectionId === undefined ||
    !tab.connection ||
    !tab.database ||
    !tab.driver
  ) {
    return null;
  }
  const connection = tab.connection;
  const connectionId = tab.connectionId;
  const database = tab.database;
  const driver = tab.driver;
  return (
    <Suspense fallback={<LazyPanelFallback label="Loading Redis Browser..." />}>
      <RedisBrowserView
        connectionId={connectionId}
        database={database}
        onOpenConsole={() =>
          handleOpenRedisConsole(connection, database, connectionId, driver)
        }
      />
    </Suspense>
  );
}

function RedisServerInfoTab({ tab }: { tab: RedisServerInfoTabItem }) {
  if (tab.connectionId === undefined || !tab.database) return null;
  return (
    <Suspense fallback={<LazyPanelFallback label="Loading Server Info..." />}>
      <RedisServerInfoView
        connectionId={tab.connectionId}
        database={tab.database}
      />
    </Suspense>
  );
}

function ElasticsearchIndexTab({ tab }: { tab: ElasticsearchIndexTabItem }) {
  if (tab.connectionId === undefined || !tab.elasticsearchIndex) return null;
  return (
    <Suspense
      fallback={<LazyPanelFallback label="Loading Elasticsearch index..." />}
    >
      <ElasticsearchIndexView
        connectionId={tab.connectionId}
        index={tab.elasticsearchIndex}
      />
    </Suspense>
  );
}

function ERDiagramTab({ tab }: { tab: ERDiagramTabItem }) {
  const { t } = useTranslation();
  if (tab.connectionId === undefined) return null;
  return (
    <Suspense fallback={<LazyPanelFallback label={t("erDiagram.loading")} />}>
      <ERDiagramView
        connectionId={tab.connectionId}
        database={tab.database}
        schema={tab.schema}
      />
    </Suspense>
  );
}

function CreateTableTab({ tab }: { tab: CreateTableTabItem }) {
  const { t } = useTranslation();
  const { handleCreateTableSuccess } = useSchemaActions();
  const { handleCloseTab } = useTabActions();
  if (tab.connectionId === undefined || !tab.database || !tab.driver)
    return null;
  const connectionId = tab.connectionId;
  const database = tab.database;
  const driver = tab.driver;
  return (
    <Suspense fallback={<LazyPanelFallback label={t("common.loading")} />}>
      <CreateTableView
        connectionId={connectionId}
        database={database}
        schema={tab.schema ?? ""}
        driver={driver}
        onSuccess={(tableName) =>
          handleCreateTableSuccess(
            tab.id,
            connectionId,
            database,
            tab.schema,
            tableName,
            driver,
          )
        }
        onCancel={() => handleCloseTab(tab.id)}
      />
    </Suspense>
  );
}

function AlterTableTab({ tab }: { tab: AlterTableTabItem }) {
  const { t } = useTranslation();
  const { handleAlterTableSuccess } = useSchemaActions();
  const { handleCloseTab } = useTabActions();
  if (
    tab.connectionId === undefined ||
    !tab.database ||
    !tab.tableName ||
    !tab.driver
  )
    return null;
  const connectionId = tab.connectionId;
  const database = tab.database;
  const tableName = tab.tableName;
  const driver = tab.driver;
  return (
    <Suspense fallback={<LazyPanelFallback label={t("common.loading")} />}>
      <AlterTableView
        connectionId={connectionId}
        database={database}
        schema={tab.schema ?? ""}
        table={tableName}
        driver={driver}
        onSuccess={() => handleAlterTableSuccess(tab.id)}
        onCancel={() => handleCloseTab(tab.id)}
      />
    </Suspense>
  );
}

function RoutineTab({ tab }: { tab: RoutineTabItem }) {
  if (
    tab.connectionId === undefined ||
    !tab.database ||
    !tab.schema ||
    !tab.routineName ||
    !tab.routineType
  ) {
    return null;
  }
  return (
    <RoutineMetadataView
      connectionId={tab.connectionId}
      database={tab.database}
      schema={tab.schema}
      name={tab.routineName}
      routineType={tab.routineType}
    />
  );
}

function MetadataFallbackTab({ tab }: { tab: DdlTabItem }) {
  if (!tab.connectionId || !tab.database || !tab.schema || !tab.tableName)
    return null;
  return (
    <TableMetadataView
      connectionId={tab.connectionId}
      database={tab.database}
      schema={tab.schema}
      table={tab.tableName}
    />
  );
}

function renderTab(tab: TabItem) {
  switch (tab.type) {
    case "editor":
      return <EditorTab tab={tab} />;
    case "table":
      return <TableTab tab={tab} />;
    case "routine":
      return <RoutineTab tab={tab} />;
    case "redis-key":
      return <RedisKeyTab tab={tab} />;
    case "redis-console":
      return <RedisConsoleTab tab={tab} />;
    case "redis-browser":
      return <RedisBrowserTab tab={tab} />;
    case "redis-server-info":
      return <RedisServerInfoTab tab={tab} />;
    case "elasticsearch-index":
      return <ElasticsearchIndexTab tab={tab} />;
    case "er-diagram":
      return <ERDiagramTab tab={tab} />;
    case "create-table":
      return <CreateTableTab tab={tab} />;
    case "alter-table":
      return <AlterTableTab tab={tab} />;
    case "ddl":
      return <MetadataFallbackTab tab={tab} />;
  }
}

export function TabContentRenderer({
  tabs,
  activeTab: _activeTab,
  ...rest
}: TabContentRendererProps) {
  const { t } = useTranslation();

  if (tabs.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground">
        <div className="text-center">
          <FileCode className="w-12 h-12 mx-auto mb-2 opacity-50" />
          <p>{t("app.empty.hint")}</p>
        </div>
      </div>
    );
  }

  return (
    <TabActionsProvider {...rest}>
      {tabs.map((tab) => {
        return (
          <TabsContent
            key={tab.id}
            value={tab.id}
            forceMount
            className="h-full m-0"
          >
            <ErrorBoundary>{renderTab(tab)}</ErrorBoundary>
          </TabsContent>
        );
      })}
    </TabActionsProvider>
  );
}
