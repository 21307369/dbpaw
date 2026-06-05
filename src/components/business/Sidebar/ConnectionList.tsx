import { useEffect, useState } from "react";

import type { ConnectionForm, RoutineType, SavedQuery } from "@/services/api";
import type { DatabaseGroupConfig } from "@/lib/tree-adapters/types";
import type { TreeCallbacks } from "@/lib/tree-adapters/types.tsx";
import { SidebarHeader } from "./connection-list/SidebarHeader";
import { SidebarSearch } from "./connection-list/SidebarSearch";
import { ConnectionTreeContent } from "./connection-list/ConnectionTreeContent";
import { ConnectionTreeDialogs } from "./connection-list/ConnectionTreeDialogs";
import type { TreeNodeDeps } from "./connection-list/TreeNodeRenderers";
import { useConnectionCrud } from "./hooks/useConnectionCrud";
import { useTreeDataFetching } from "./hooks/useTreeDataFetching";
import { useConnectionForm } from "./hooks/useConnectionForm";
import { useTranslation } from "react-i18next";
import type {
  TableInfo,
  SchemaInfo,
  DatabaseInfo,
  DatabaseExportFormat,
  Connection,
} from "./connection-list/types";
import { useTreeExpansion } from "./hooks/useTreeExpansion";
import { useRedisKeys } from "./hooks/useRedisKeys";
import { useImportExport } from "./hooks/useImportExport";
import { useCreateDatabase } from "./hooks/useCreateDatabase";
import { useSavedQueriesTree } from "./hooks/useSavedQueriesTree";
import { useConnectionTreeSearch } from "./hooks/useConnectionTreeSearch";
import { useConnectionRevealSync } from "./hooks/useConnectionRevealSync";
import { useConnectionTreeAdapters } from "./hooks/useConnectionTreeAdapters";

interface ConnectionListProps {
  onTableSelect?: (
    connection: string,
    database: string,
    table: string,
    connectionId: number,
    driver: string,
    schema?: string,
  ) => void;
  onConnect?: (form: ConnectionForm) => void;
  onCreateQuery?: (
    connectionId: number,
    databaseName: string,
    driver: string,
  ) => void;
  onRoutineSelect?: (
    connection: string,
    database: string,
    schema: string,
    name: string,
    routineType: RoutineType,
    connectionId: number,
    driver: string,
  ) => void;
  onExportTable?: (
    ctx: {
      connectionId: number;
      database: string;
      schema: string;
      table: string;
      driver: string;
    },
    format: "csv" | "json" | "sql_dml" | "sql_ddl" | "sql_full",
    filePath: string,
  ) => void;
  onExportDatabase?: (ctx: {
    connectionId: number;
    database: string;
    driver: string;
    format: DatabaseExportFormat;
    filePath: string;
  }) => void;
  onCreateTable?: (
    connectionId: number,
    database: string,
    schema: string,
    driver: string,
  ) => void;
  onAlterTable?: (
    connectionId: number,
    database: string,
    schema: string,
    table: string,
    driver: string,
  ) => void;
  activeTableTarget?: {
    connectionId: number;
    database: string;
    table: string;
    schema?: string;
  };
  sidebarRevealRequest?: {
    id: number;
    connectionId: number;
    database: string;
    table: string;
    schema?: string;
  };
  onSelectSavedQuery?: (query: SavedQuery) => void;
  lastUpdated?: number;
  showSavedQueriesInTree?: boolean;
  redisRefreshRequest?: RedisRefreshRequest;
  treeCallbacks?: TreeCallbacks;
  simpleMode?: boolean;
}

export interface RedisRefreshRequest {
  id: number;
  connectionId: number;
  database: string;
}

export function ConnectionList({
  onTableSelect,
  onConnect,
  onCreateQuery,
  onExportTable,
  onExportDatabase,
  onCreateTable,
  onAlterTable,
  activeTableTarget,
  sidebarRevealRequest,
  onSelectSavedQuery,
  lastUpdated,
  showSavedQueriesInTree = false,
  redisRefreshRequest,
  treeCallbacks,
  simpleMode = false,
}: ConnectionListProps) {
  const { t } = useTranslation();
  const {
    expandedConnections,
    setExpandedConnections,
    expandedDatabases,
    setExpandedDatabases,
    expandedDatabaseGroups,
    setExpandedDatabaseGroups,
    expandedQueryGroups,
    setExpandedQueryGroups,
    expandedSchemas,
    setExpandedSchemas,
    expandedGroupNodes,
    expandedTables,
    setExpandedTables,
    connectionsRef,
    expandedDatabasesRef,
    toggleConnection,
    toggleDatabase,
    toggleQueryGroup,
    toggleDatabaseGroup,
    toggleSchema,
    toggleGroupNode,
    toggleTable,
  } = useTreeExpansion();

  const {
    connections,
    setConnections,
    isLoadingConnections,
    isDeleting,
    deleteTargetConnectionId,
    setDeleteTargetConnectionId,
    fetchConnections,
    connectConnection,
    fetchAndSetDatabases,
    clearConnectionTreeCache,
    handleReconnect,
    handleDuplicateConnection,
    handleDeleteConnection,
  } = useConnectionCrud({
    setExpandedConnections,
    setExpandedDatabases,
    setExpandedSchemas,
    setExpandedTables,
    listDatabases: (connection) => getAdapter(connection).listDatabases(),
  });

  const {
    databaseEvents,
    databaseSequences,
    databaseTypes,
    databaseSynonyms,
    databasePackages,
    loadingDatabaseKeys,
    setLoadingDatabaseKeys,
    loadingTableKeys,
    setLoadingTableKeys,
    fetchSqlTablesAsTableInfo,
    fetchAndSetTables,
    fetchAndSetTableColumns,
    handleRefreshDatabaseTables,
  } = useTreeDataFetching({
    connections,
    setConnections,
    setExpandedSchemas,
    setExpandedTables,
    getAdapter: (connection) => getAdapter(connection),
  });

  const {
    isDialogOpen,
    setIsDialogOpen,
    isImportDialogOpen,
    setIsImportDialogOpen,
    dialogMode,
    createStep,
    setCreateStep,
    form,
    setForm,
    validationMsg,
    testMsg,
    requiredOk,
    isTesting,
    isConnecting,
    isSavingEdit,
    handleTestConnection,
    handleDialogSubmit,
    closeConnectionDialog,
    openCreateDialog,
    openEditDialog,
    handleCreateDriverSelect,
    handlePickSslCaCertFile,
    handlePickSshKeyFile,
    handlePickDatabaseFile,
  } = useConnectionForm({
    connections,
    setConnections,
    fetchConnections,
    onConnect,
  });

  const {
    isCreatingDatabase,
    isCreateDbDialogOpen,
    showCreateDbAdvanced,
    setShowCreateDbAdvanced,
    createDbValidationMsg,
    createDbForm,
    setCreateDbForm,
    mysqlCharsets,
    mysqlCollations,
    loadingMysqlOptions,
    supportsCreateDatabaseForDriver,
    isMySqlFamilyCreateDb,
    isPostgresCreateDb,
    isMssqlCreateDb,
    openCreateDatabaseDialog,
    handleCreateDatabase,
    closeCreateDbDialog,
  } = useCreateDatabase({
    connections,
    setExpandedConnections,
    clearConnectionTreeCache,
    fetchAndSetDatabases,
  });

  // Update refs every render so effects can read latest values without
  // listing them as deps (avoids re-firing on every connection state update).
  connectionsRef.current = connections;
  expandedDatabasesRef.current = expandedDatabases;
  const [contextMenu, setContextMenu] = useState<{
    visible: boolean;
    x: number;
    y: number;
    connectionId: string | null;
    databaseName?: string | null;
    schemaName?: string | null;
    type: "connection" | "database" | "schema";
  }>({ visible: false, x: 0, y: 0, connectionId: null, type: "connection" });
  const { isLoadingQueries, savedQueriesByConnection } = useSavedQueriesTree({
    showSavedQueriesInTree,
    lastUpdated,
  });
  const { searchTerm, setSearchTerm, filteredConnections } =
    useConnectionTreeSearch({
      connections,
      savedQueriesByConnection,
      showSavedQueriesInTree,
      setExpandedConnections,
      setExpandedDatabases,
      setExpandedSchemas,
      setExpandedDatabaseGroups,
      setExpandedQueryGroups,
    });
  const { loadRedisKeysPage } = useRedisKeys({
    connectionsRef,
    setConnections,
    searchTerm,
  });

  const {
    isImportingSql,
    pendingImport,
    setPendingImport,
    isImportConfirmOpen,
    setIsImportConfirmOpen,
    pendingDatabaseExport,
    setPendingDatabaseExport,
    isDatabaseExportDialogOpen,
    setIsDatabaseExportDialogOpen,
    isExportingDatabaseSql,
    pendingTableExport,
    setPendingTableExport,
    isTableExportDialogOpen,
    setIsTableExportDialogOpen,
    isExportingTable,
    tableExportFormat,
    setTableExportFormat,
    handleTableExportDialog,
    handleTableExportConfirm,
    handleDatabaseImport,
    handleDatabaseExport,
    handleConfirmDatabaseExport,
    handleConfirmImport,
  } = useImportExport({
    connections,
    onExportTable,
    onExportDatabase,
    handleRefreshDatabaseTables,
  });

  const {
    getAdapter,
    createEsIndexConnectionId,
    setCreateEsIndexConnectionId,
    isCreateEsIndexDialogOpen,
    setIsCreateEsIndexDialogOpen,
    handleCreateQueryFromContext,
  } = useConnectionTreeAdapters({
    connections,
    expandedDatabases,
    treeCallbacks,
    onTableSelect,
    onCreateQuery,
    onAlterTable,
    searchTerm,
    loadRedisKeysPage,
    handleRefreshDatabaseTables,
    fetchSqlTablesAsTableInfo,
    handleTableExportDialog,
    setContextMenu,
  });

  const { tableNodeRefs, selectedTableKey } = useConnectionRevealSync({
    activeTableTarget,
    sidebarRevealRequest,
    redisRefreshRequest,
    connections,
    connectionsRef,
    expandedDatabasesRef,
    searchTerm,
    setExpandedConnections,
    setExpandedDatabases,
    setExpandedSchemas,
    fetchAndSetTables,
    loadRedisKeysPage,
  });

  useEffect(() => {
    fetchConnections();
  }, []);

  const handleTableClick = (
    connection: Connection,
    database: DatabaseInfo,
    table: TableInfo,
  ) => {
    getAdapter(connection).onItemActivate(database, table);
  };

  const treeNodeDeps: TreeNodeDeps = {
    connections,
    expandedTables,
    selectedTableKey,
    loadingTableKeys,
    expandedGroupNodes,
    tableNodeRefs,
    getDatasourceTreeAdapter: getAdapter,
    toggleTable,
    toggleGroupNode,
    setLoadingTableKeys,
    fetchAndSetTableColumns,
    handleTableClick,
    renderTableContextMenu: (adapter, database, table) =>
      adapter.renderTableContextMenu(database, table),
    t,
  };

  const getGroupItems = (
    database: DatabaseInfo,
    group: DatabaseGroupConfig,
    dbKey: string,
    schema?: SchemaInfo,
  ): { name: string; [key: string]: any }[] => {
    switch (group.source) {
      case "tables": {
        const tables = schema ? schema.tables : database.tables || [];
        return group.sourceFilter
          ? tables.filter((t) => t.type === group.sourceFilter)
          : tables.filter((t) => t.type === "table" || t.type === "BASE TABLE");
      }
      case "routines": {
        if (schema) {
          const routines =
            group.sourceFilter === "procedure"
              ? schema.procedures
              : schema.functions;
          return routines;
        }
        const routines = database.routines || [];
        return group.sourceFilter
          ? routines.filter((r) => r.type === group.sourceFilter)
          : routines;
      }
      case "events":
        return databaseEvents.get(dbKey) || [];
      case "sequences":
        return databaseSequences.get(dbKey) || [];
      case "types":
        return databaseTypes.get(dbKey) || [];
      case "synonyms":
        return databaseSynonyms.get(dbKey) || [];
      case "packages":
        return databasePackages.get(dbKey) || [];
      default:
        return [];
    }
  };

  const contextMenuConnection = contextMenu.connectionId
    ? connections.find((conn) => conn.id === contextMenu.connectionId)
    : null;
  const contextMenuDatabaseAdapter = contextMenuConnection
    ? getAdapter(contextMenuConnection)
    : null;

  return (
    <div className="h-full flex flex-col bg-background border-r border-border">
      <SidebarHeader
        isLoadingConnections={isLoadingConnections}
        isLoadingQueries={isLoadingQueries}
        onRefresh={fetchConnections}
        isDialogOpen={isDialogOpen}
        onDialogOpenChange={(open) => {
          if (!open) {
            closeConnectionDialog();
            return;
          }
          setIsDialogOpen(true);
        }}
        dialogMode={dialogMode}
        createStep={createStep}
        form={form}
        setForm={setForm}
        validationMsg={validationMsg}
        testMsg={testMsg}
        requiredOk={requiredOk}
        isTesting={isTesting}
        isConnecting={isConnecting}
        isSavingEdit={isSavingEdit}
        onSubmit={handleDialogSubmit}
        onClose={closeConnectionDialog}
        onTestConnection={handleTestConnection}
        onCreateDriverSelect={handleCreateDriverSelect}
        onBackToType={() => setCreateStep("type")}
        onPickSslCaCertFile={() => void handlePickSslCaCertFile()}
        onPickSshKeyFile={() => void handlePickSshKeyFile()}
        onPickDatabaseFile={(driver) => void handlePickDatabaseFile(driver)}
        openCreateDialog={openCreateDialog}
        isImportDialogOpen={isImportDialogOpen}
        onImportDialogOpenChange={setIsImportDialogOpen}
        onImported={fetchConnections}
      />
      <SidebarSearch
        searchTerm={searchTerm}
        onSearchTermChange={setSearchTerm}
      />
      <ConnectionTreeContent
        connections={connections}
        filteredConnections={filteredConnections}
        savedQueriesByConnection={savedQueriesByConnection}
        searchTerm={searchTerm}
        expandedConnections={expandedConnections}
        expandedDatabases={expandedDatabases}
        expandedSchemas={expandedSchemas}
        expandedQueryGroups={expandedQueryGroups}
        expandedDatabaseGroups={expandedDatabaseGroups}
        loadingDatabaseKeys={loadingDatabaseKeys}
        toggleConnection={toggleConnection}
        toggleDatabase={toggleDatabase}
        toggleSchema={toggleSchema}
        toggleQueryGroup={toggleQueryGroup}
        toggleDatabaseGroup={toggleDatabaseGroup}
        connectConnection={connectConnection}
        fetchAndSetTables={fetchAndSetTables}
        setLoadingDatabaseKeys={setLoadingDatabaseKeys}
        getAdapter={getAdapter}
        treeNodeDeps={treeNodeDeps}
        showSavedQueriesInTree={showSavedQueriesInTree}
        simpleMode={simpleMode}
        onContextMenuChange={setContextMenu}
        onSelectSavedQuery={onSelectSavedQuery}
        getGroupItems={getGroupItems}
        onNewConnection={openCreateDialog}
        onImportConnection={() => setIsImportDialogOpen(true)}
      />
      <ConnectionTreeDialogs
        contextMenu={contextMenu}
        onCloseContextMenu={() =>
          setContextMenu((prev) => ({ ...prev, visible: false }))
        }
        connections={connections}
        contextMenuConnection={contextMenuConnection}
        contextMenuDatabaseAdapter={contextMenuDatabaseAdapter}
        onEdit={openEditDialog}
        onDuplicate={handleDuplicateConnection}
        onReconnect={handleReconnect}
        onCreateQuery={handleCreateQueryFromContext}
        onCreateDatabase={openCreateDatabaseDialog}
        onDelete={setDeleteTargetConnectionId}
        supportsCreateDatabaseForDriver={supportsCreateDatabaseForDriver}
        onRefreshDatabaseTables={handleRefreshDatabaseTables}
        onDatabaseImport={handleDatabaseImport}
        onDatabaseExport={handleDatabaseExport}
        onCreateTable={onCreateTable}
        createEsIndexDialogOpen={isCreateEsIndexDialogOpen}
        createEsIndexConnectionId={createEsIndexConnectionId}
        onCreateEsIndexDialogOpenChange={(open) => {
          setIsCreateEsIndexDialogOpen(open);
          if (!open) setCreateEsIndexConnectionId(null);
        }}
        onEsIndexCreated={async () => {
          if (createEsIndexConnectionId) {
            await handleRefreshDatabaseTables(
              createEsIndexConnectionId,
              "Indices",
            );
          }
        }}
        isCreateDbDialogOpen={isCreateDbDialogOpen}
        onCloseCreateDbDialog={closeCreateDbDialog}
        createDbForm={createDbForm}
        setCreateDbForm={setCreateDbForm}
        showCreateDbAdvanced={showCreateDbAdvanced}
        setShowCreateDbAdvanced={setShowCreateDbAdvanced}
        createDbValidationMsg={createDbValidationMsg}
        isCreatingDatabase={isCreatingDatabase}
        mysqlCharsets={mysqlCharsets}
        mysqlCollations={mysqlCollations}
        loadingMysqlOptions={loadingMysqlOptions}
        isMySqlFamilyCreateDb={isMySqlFamilyCreateDb}
        isPostgresCreateDb={isPostgresCreateDb}
        isMssqlCreateDb={isMssqlCreateDb}
        onCreateDatabaseSubmit={handleCreateDatabase}
        deleteTargetConnectionId={deleteTargetConnectionId}
        onDeleteTargetChange={setDeleteTargetConnectionId}
        isDeleting={isDeleting}
        onDeleteConnection={handleDeleteConnection}
        isImportConfirmOpen={isImportConfirmOpen}
        isImportingSql={isImportingSql}
        pendingImportDatabaseName={pendingImport?.databaseName}
        pendingImportFilePath={pendingImport?.filePath}
        onConfirmImport={handleConfirmImport}
        onImportConfirmOpenChange={setIsImportConfirmOpen}
        onClearPendingImport={() => setPendingImport(null)}
        isTableExportDialogOpen={isTableExportDialogOpen}
        isExportingTable={isExportingTable}
        pendingTableExportTableName={pendingTableExport?.table.name}
        onTableExportDialogOpenChange={setIsTableExportDialogOpen}
        onClearPendingTableExport={() => setPendingTableExport(null)}
        tableExportFormat={tableExportFormat}
        setTableExportFormat={setTableExportFormat}
        onTableExportConfirm={handleTableExportConfirm}
        isDatabaseExportDialogOpen={isDatabaseExportDialogOpen}
        isExportingDatabaseSql={isExportingDatabaseSql}
        pendingDatabaseExportName={pendingDatabaseExport?.databaseName}
        pendingDatabaseExportFormat={
          pendingDatabaseExport?.format || "sql_full"
        }
        onDatabaseExportDialogOpenChange={setIsDatabaseExportDialogOpen}
        onClearPendingDatabaseExport={() => setPendingDatabaseExport(null)}
        onDatabaseExportFormatChange={(value: DatabaseExportFormat) =>
          setPendingDatabaseExport((prev) =>
            prev ? { ...prev, format: value } : prev,
          )
        }
        onConfirmDatabaseExport={handleConfirmDatabaseExport}
      />
    </div>
  );
}
