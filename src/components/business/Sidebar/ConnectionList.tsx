import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  Database,
  Plus,
  RefreshCw,
  Loader2,
  FileCode,
  Search,
  FolderOpen,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/services/api";
import type {
  ConnectionForm,
  Driver,
  RoutineType,
  SavedQuery,
} from "@/services/api";
import type { DatabaseGroupConfig } from "@/lib/tree-adapters/types";
import {
  getConnectionIcon,
  supportsSchemaBrowsing,
} from "@/lib/driver-registry";
import type { TreeCallbacks } from "@/lib/tree-adapters/types.tsx";
import { toast } from "sonner";
import { TreeNode } from "./connection-list/TreeNode";
import { GroupNodeRenderer, type TreeNodeDeps } from "./connection-list/TreeNodeRenderers";
import { ConnectionDialog } from "./connection-list/ConnectionDialog";
import { ImportDialog } from "./ImportDialog";
import { ConnectionContextMenu } from "./ConnectionContextMenu";
import { getConnectionStatusLabelI18n, renderConnectionStatusIndicator } from "./connection-list/helpers";
import { getDatasourceTreeAdapter as getDatasourceTreeAdapterFn } from "./connection-list/getDatasourceTreeAdapter";
import { useConnectionCrud } from "./hooks/useConnectionCrud";
import { useTreeDataFetching } from "./hooks/useTreeDataFetching";
import { useConnectionForm } from "./hooks/useConnectionForm";
import { useTranslation } from "react-i18next";
import {
  elasticsearchIndexActionSuccessMessage,
  executeElasticsearchIndexAction,
  type ElasticsearchIndexAction,
} from "@/components/business/Elasticsearch/elasticsearch-index-management";
import type {
  TableInfo,
  SchemaInfo,
  DatabaseInfo,
  DatabaseExportFormat,
  Connection,
  SelectedTableNode,
} from "./connection-list/types";
import { useTreeExpansion } from "./hooks/useTreeExpansion";
import { useRedisKeys } from "./hooks/useRedisKeys";
import { useImportExport } from "./hooks/useImportExport";
import { useCreateDatabase } from "./hooks/useCreateDatabase";
import { InlineContextMenu } from "./connection-list/InlineContextMenu";
import { ConnectionDialogs } from "./connection-list/ConnectionDialogs";
import { errorMessage } from "@/lib/errors";

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
  const tableNodeRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const handledRevealRequestIdRef = useRef<number | null>(null);
  const handledRedisRefreshIdRef = useRef<number | null>(null);
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
    listDatabases: (connection) =>
      getAdapter(connection).listDatabases(),
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
  const [selectedTableNode, setSelectedTableNode] =
    useState<SelectedTableNode | null>(null);
  const selectedTableKey = selectedTableNode?.key ?? null;
  const [autoScrollRequest, setAutoScrollRequest] = useState<{
    key: string;
    id: number;
  } | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    visible: boolean;
    x: number;
    y: number;
    connectionId: string | null;
    databaseName?: string | null;
    schemaName?: string | null;
    type: "connection" | "database" | "schema";
  }>({ visible: false, x: 0, y: 0, connectionId: null, type: "connection"   });
  const loadingSpinner = (
    <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
  );
  const [showElasticsearchSystemIndices, setShowElasticsearchSystemIndices] =
    useState(false);
  const [showMongoSystemCollections, setShowMongoSystemCollections] =
    useState(false);
  const [createEsIndexConnectionId, setCreateEsIndexConnectionId] = useState<
    string | null
  >(null);
  const [isCreateEsIndexDialogOpen, setIsCreateEsIndexDialogOpen] =
    useState(false);
  const [isLoadingQueries, setIsLoadingQueries] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const { loadRedisKeysPage } = useRedisKeys({
    connectionsRef,
    setConnections,
    searchTerm,
  });
  const [savedQueriesByConnection, setSavedQueriesByConnection] = useState<
    Record<string, SavedQuery[]>
  >({});

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


  const supportsSchemaNodeForDriver = (driver: Driver) =>
    supportsSchemaBrowsing(driver);
  const getSchemaNodeKey = (databaseKey: string, schema: string) =>
    `${databaseKey}::${schema}`;
  const getTableNodeKey = (
    connectionId: string,
    databaseName: string,
    schemaName: string,
    tableName: string,
  ) => `${connectionId}-${databaseName}-${schemaName}-${tableName}`;

  const filteredConnections = useMemo(() => {
    if (!searchTerm) return connections;
    const lowerTerm = searchTerm.toLowerCase();
    return connections
      .map((conn) => {
        const filteredDbs = conn.databases
          .map((db) => {
            const filteredSchemas = db.schemas
              .map((schema) => {
                const filteredTables = schema.tables.filter((t) =>
                  t.name.toLowerCase().includes(lowerTerm),
                );
                const filteredProcedures = schema.procedures.filter((routine) =>
                  routine.name.toLowerCase().includes(lowerTerm),
                );
                const filteredFunctions = schema.functions.filter((routine) =>
                  routine.name.toLowerCase().includes(lowerTerm),
                );
                if (
                  filteredTables.length > 0 ||
                  filteredProcedures.length > 0 ||
                  filteredFunctions.length > 0
                ) {
                  return {
                    ...schema,
                    tables: filteredTables,
                    procedures: filteredProcedures,
                    functions: filteredFunctions,
                  };
                }
                return null;
              })
              .filter(Boolean) as SchemaInfo[];
            const filteredTables = db.tables.filter((t) =>
              t.name.toLowerCase().includes(lowerTerm),
            );
            if (filteredSchemas.length > 0 || filteredTables.length > 0) {
              return {
                ...db,
                schemas: filteredSchemas,
                tables: filteredTables,
              };
            }
            return null;
          })
          .filter(Boolean) as DatabaseInfo[];

        const hasMatchingQuery =
          showSavedQueriesInTree &&
          (savedQueriesByConnection[conn.id] || []).some((query) =>
            query.name.toLowerCase().includes(lowerTerm),
          );

        if (filteredDbs.length > 0 || hasMatchingQuery) {
          return { ...conn, databases: filteredDbs };
        }
        return null;
      })
      .filter(Boolean) as Connection[];
  }, [
    connections,
    savedQueriesByConnection,
    searchTerm,
    showSavedQueriesInTree,
  ]);

  useEffect(() => {
    if (searchTerm) {
      setExpandedConnections((prev) => {
        const next = new Set(prev);
        filteredConnections.forEach((conn) => {
          next.add(conn.id);
        });
        return next;
      });
      setExpandedDatabases((prev) => {
        const next = new Set(prev);
        filteredConnections.forEach((conn) => {
          conn.databases.forEach((db) => {
            next.add(`${conn.id}-${db.name}`);
          });
        });
        return next;
      });
      setExpandedSchemas((prev) => {
        const next = new Set(prev);
        filteredConnections.forEach((conn) => {
          conn.databases.forEach((db) => {
            const databaseKey = `${conn.id}-${db.name}`;
            db.schemas.forEach((schema) => {
              next.add(getSchemaNodeKey(databaseKey, schema.name));
            });
          });
      });
      return next;
    });
    if (showSavedQueriesInTree) {
        setExpandedDatabaseGroups((prev) => {
          const next = new Set(prev);
          filteredConnections.forEach((conn) => {
            next.add(`${conn.id}::databases`);
          });
          return next;
        });
        setExpandedQueryGroups((prev) => {
          const next = new Set(prev);
          filteredConnections.forEach((conn) => {
            next.add(`${conn.id}::queries`);
          });
          return next;
        });
      }
    }
  }, [searchTerm, filteredConnections, showSavedQueriesInTree]);

  useEffect(() => {
    fetchConnections();
  }, []);

  useEffect(() => {
    if (!showSavedQueriesInTree) return;
    void fetchSavedQueriesByConnection();
  }, [showSavedQueriesInTree, lastUpdated]);

  const fetchSavedQueriesByConnection = async () => {
    setIsLoadingQueries(true);
    try {
      const queries = await api.queries.list();
      const grouped: Record<string, SavedQuery[]> = {};
      queries.forEach((query) => {
        if (!query.connectionId) return;
        const key = String(query.connectionId);
        if (!grouped[key]) grouped[key] = [];
        grouped[key].push(query);
      });
      Object.values(grouped).forEach((items) =>
        items.sort((a, b) => a.name.localeCompare(b.name)),
      );
      setSavedQueriesByConnection(grouped);
    } catch (e) {
      const message = errorMessage(e);
      console.error("Failed to fetch saved queries for tree", message);
      toast.error(t("connection.toast.loadQueriesFailed"), {
        description: message,
      });
    } finally {
      setIsLoadingQueries(false);
    }
  };

  useEffect(() => {
    connectionsRef.current.forEach((conn) => {
      if (getAdapter(conn).isDatabaseExpandable) return;
      conn.databases.forEach((db) => {
        const dbKey = `${conn.id}-${db.name}`;
        if (!expandedDatabasesRef.current.has(dbKey) || db.tables.length === 0)
          return;
        void loadRedisKeysPage(conn.id, db.name, "0", false);
      });
    });
  }, [searchTerm, loadRedisKeysPage]);

  const openCreateElasticsearchIndexDialog = useCallback(
    (connectionId: string, _databaseName = "Indices") => {
      const connection = connections.find((conn) => conn.id === connectionId);
      if (!connection || connection.type !== "elasticsearch") return;
      setCreateEsIndexConnectionId(connectionId);
      setIsCreateEsIndexDialogOpen(true);
    },
    [connections],
  );

  const handleElasticsearchIndexAction = useCallback(
    async (
      connectionId: string,
      databaseName: string,
      index: string,
      action: ElasticsearchIndexAction,
    ) => {
      if (action === "delete" && !window.confirm(`Delete index "${index}"?`)) {
        return;
      }

      try {
        await executeElasticsearchIndexAction(
          Number(connectionId),
          index,
          action,
        );
        toast.success(elasticsearchIndexActionSuccessMessage(action, index));
        await handleRefreshDatabaseTables(connectionId, databaseName);
      } catch (e) {
        toast.error(`Failed to ${action} Elasticsearch index`, {
          description: errorMessage(e),
        });
      }
    },
    [handleRefreshDatabaseTables],
  );

  const handleOpenERDiagram = useCallback(
    (connectionId: string, database: string) => {
      treeCallbacks?.onOpenERDiagram?.({
        connectionId,
        connectionName: "",
        connectionType: "" as any,
        driverKind: "sql" as any,
        databaseName: database,
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const handleCreateQueryFromContext = useCallback(
    (connectionId: string | null | undefined, databaseName?: string | null) => {
      if (!onCreateQuery || !connectionId) return;
      const connection = connections.find((c) => c.id === connectionId);
      if (!connection) return;

      const explicitDatabaseName = (databaseName || "").trim();
      const fallbackDatabaseName =
        (connection.database || "").trim() ||
        connection.databases.find((db) => db.name.trim().length > 0)?.name ||
        (connection.type === "sqlite" || connection.type === "duckdb"
          ? "main"
          : "");
      const resolvedDatabaseName = explicitDatabaseName || fallbackDatabaseName;

      if (!resolvedDatabaseName) {
        toast.error(t("connection.toast.newQueryNoDatabase"));
        return;
      }

      onCreateQuery(Number(connectionId), resolvedDatabaseName, connection.type);
    },
    [onCreateQuery, connections, t],
  );

  const getAdapter = useCallback(
    (connection: Connection) =>
      getDatasourceTreeAdapterFn({
        connection,
        treeCallbacks,
        deps: {
          onTableSelect,
          loadRedisKeysPage,
          handleRefreshDatabaseTables,
          openCreateElasticsearchIndexDialog,
          handleElasticsearchIndexAction,
          handleOpenERDiagram,
          showElasticsearchSystemIndices,
          showMongoSystemCollections,
          searchTerm,
          t,
          fetchSqlTablesAsTableInfo,
          handleCreateQueryFromContext,
          handleTableExportDialog,
          onAlterTable,
          setShowElasticsearchSystemIndices,
          setShowMongoSystemCollections,
          setContextMenu,
        },
      }),
    [
      treeCallbacks,
      onTableSelect,
      loadRedisKeysPage,
      handleRefreshDatabaseTables,
      openCreateElasticsearchIndexDialog,
      handleElasticsearchIndexAction,
      handleOpenERDiagram,
      showElasticsearchSystemIndices,
      showMongoSystemCollections,
      searchTerm,
      t,
      fetchSqlTablesAsTableInfo,
      handleCreateQueryFromContext,
      handleTableExportDialog,
      onAlterTable,
      setShowElasticsearchSystemIndices,
      setShowMongoSystemCollections,
      setContextMenu,
    ],
  );

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

  // Sync UI state (expansion, selection) and load data if needed.
  useEffect(() => {
    if (!activeTableTarget) {
      setSelectedTableNode(null);
      return;
    }

    const connectionId = String(activeTableTarget.connectionId);
    const databaseName = activeTableTarget.database;
    const tableName = activeTableTarget.table;
    const schemaName = activeTableTarget.schema || "";
    const dbKey = `${connectionId}-${databaseName}`;
    let cancelled = false;

    setExpandedConnections((prev) => {
      const next = new Set(prev);
      next.add(connectionId);
      return next;
    });
    setExpandedDatabases((prev) => {
      const next = new Set(prev);
      next.add(dbKey);
      return next;
    });

    const ensureDatabaseTablesLoaded = async () => {
      const targetConnection = connections.find(
        (conn) => conn.id === connectionId,
      );
      const targetDatabase = targetConnection?.databases.find(
        (db) => db.name === databaseName,
      );
      if (!targetDatabase) return;

      const supportsSchemaNode = supportsSchemaNodeForDriver(
        targetConnection?.type || "postgres",
      );
      const hasLoadedTables = supportsSchemaNode
        ? targetDatabase.schemas.length > 0
        : targetDatabase.tables.length > 0;
      let availableTables = supportsSchemaNode
        ? targetDatabase.schemas.flatMap((schema) => schema.tables)
        : targetDatabase.tables;
      if (!hasLoadedTables) {
        availableTables = await fetchAndSetTables(connectionId, databaseName);
      }
      if (cancelled) return;
      const resolvedSchema =
        schemaName ||
        availableTables.find((table) => table.name === tableName)?.schema ||
        "";
      if (supportsSchemaNode && resolvedSchema) {
        setExpandedSchemas((prev) => {
          const next = new Set(prev);
          next.add(getSchemaNodeKey(dbKey, resolvedSchema));
          return next;
        });
      }
      const resolvedTableKey = getTableNodeKey(
        connectionId,
        databaseName,
        resolvedSchema,
        tableName,
      );
      setSelectedTableNode({
        key: resolvedTableKey,
        connectionId: activeTableTarget.connectionId,
        database: databaseName,
        table: tableName,
        schema: resolvedSchema,
      });
    };

    void ensureDatabaseTablesLoaded();
    return () => {
      cancelled = true;
    };
  }, [activeTableTarget, connections]);

  useEffect(() => {
    if (!sidebarRevealRequest || !activeTableTarget || !selectedTableNode)
      return;
    if (handledRevealRequestIdRef.current === sidebarRevealRequest.id) return;
    if (
      sidebarRevealRequest.connectionId !== activeTableTarget.connectionId ||
      sidebarRevealRequest.database !== activeTableTarget.database ||
      sidebarRevealRequest.table !== activeTableTarget.table
    ) {
      return;
    }
    if (
      selectedTableNode.connectionId !== sidebarRevealRequest.connectionId ||
      selectedTableNode.database !== sidebarRevealRequest.database ||
      selectedTableNode.table !== sidebarRevealRequest.table
    ) {
      return;
    }
    if (
      sidebarRevealRequest.schema &&
      sidebarRevealRequest.schema !== selectedTableNode.schema
    ) {
      return;
    }

    handledRevealRequestIdRef.current = sidebarRevealRequest.id;
    setAutoScrollRequest({
      key: selectedTableNode.key,
      id: sidebarRevealRequest.id,
    });
  }, [activeTableTarget, selectedTableNode, sidebarRevealRequest]);

  useEffect(() => {
    if (!redisRefreshRequest) return;
    if (handledRedisRefreshIdRef.current === redisRefreshRequest.id) return;
    handledRedisRefreshIdRef.current = redisRefreshRequest.id;
    const dbKey = `${String(redisRefreshRequest.connectionId)}-${redisRefreshRequest.database}`;
    if (!expandedDatabasesRef.current.has(dbKey)) return;
    void loadRedisKeysPage(
      String(redisRefreshRequest.connectionId),
      redisRefreshRequest.database,
      "0",
      false,
    );
  }, [redisRefreshRequest, loadRedisKeysPage]);

  useEffect(() => {
    if (!autoScrollRequest) return;
    let cancelled = false;
    let retriesLeft = 12;
    let frame1 = 0;
    let frame2 = 0;

    const run = () => {
      frame1 = requestAnimationFrame(() => {
        frame2 = requestAnimationFrame(() => {
          if (cancelled) return;
          const target = tableNodeRefs.current[autoScrollRequest.key];
          if (target) {
            target.scrollIntoView({
              block: "center",
              inline: "nearest",
              behavior: "auto",
            });
            setAutoScrollRequest((prev) =>
              prev?.id === autoScrollRequest.id ? null : prev,
            );
            return;
          }

          retriesLeft -= 1;
          if (retriesLeft > 0) {
            run();
            return;
          }

          setAutoScrollRequest((prev) =>
            prev?.id === autoScrollRequest.id ? null : prev,
          );
        });
      });
    };

    run();

    return () => {
      cancelled = true;
      if (frame1) cancelAnimationFrame(frame1);
      if (frame2) cancelAnimationFrame(frame2);
    };
  }, [autoScrollRequest]);

  useEffect(() => {
    connections
      .filter(
        (connection) =>
          connection.type === "elasticsearch" &&
          connection.connectState === "success" &&
          expandedDatabases.has(`${connection.id}-Indices`),
      )
      .forEach((connection) => {
        void handleRefreshDatabaseTables(connection.id, "Indices");
      });
    // Re-apply the client-side system-index filter for already opened ES trees.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showElasticsearchSystemIndices]);

  useEffect(() => {
    connections
      .filter(
        (connection) =>
          connection.type === "mongodb" &&
          connection.connectState === "success",
      )
      .forEach((connection) => {
        connection.databases.forEach((db) => {
          if (expandedDatabases.has(`${connection.id}-${db.name}`)) {
            void handleRefreshDatabaseTables(connection.id, db.name);
          }
        });
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showMongoSystemCollections]);

  const getGroupItems = (
    database: DatabaseInfo,
    group: DatabaseGroupConfig,
    dbKey: string,
    schema?: SchemaInfo,
  ): { name: string; [key: string]: any }[] => {
    switch (group.source) {
      case "tables": {
        const tables = schema ? schema.tables : (database.tables || []);
        return group.sourceFilter
          ? tables.filter((t) => t.type === group.sourceFilter)
          : tables.filter(
              (t) => t.type === "table" || t.type === "BASE TABLE",
            );
      }
      case "routines": {
        if (schema) {
          const routines = group.sourceFilter === "procedure" 
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
      <div className="px-2 py-1 border-b border-border flex items-center justify-between h-8">
        <div className="flex items-center gap-2">
          <h2 className="font-semibold text-sm">{t("connection.title")}</h2>
          {isLoadingQueries && (
            <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
          )}
        </div>
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0"
            onClick={fetchConnections}
            loading={isLoadingConnections}
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </Button>
          <ConnectionDialog
            open={isDialogOpen}
            onOpenChange={(open) => {
              if (!open) {
                closeConnectionDialog();
                return;
              }
              setIsDialogOpen(true);
            }}
            trigger={
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0"
                onClick={openCreateDialog}
              >
                <Plus className="w-3.5 h-3.5" />
              </Button>
            }
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
          />
          <ImportDialog
            open={isImportDialogOpen}
            onOpenChange={setIsImportDialogOpen}
            onImported={fetchConnections}
          />
        </div>
      </div>

      <div className="p-2 border-b border-border">
        <div className="relative">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={t("connection.searchTables")}
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
            }}
            className="pl-8"
          />
        </div>
      </div>
      <ConnectionContextMenu
        onNewConnection={openCreateDialog}
        onImportConnection={() => setIsImportDialogOpen(true)}
      >
        {({ onContextMenu }) => (
          <div
            className="flex-1 overflow-auto"
            onClick={() => setContextMenu((prev) => ({ ...prev, visible: false }))}
            onContextMenu={onContextMenu}
          >
            {filteredConnections.map((connection) => {
          const datasourceAdapter = getAdapter(connection);
          const queriesForConnection = (
            savedQueriesByConnection[connection.id] || []
          ).filter((query) =>
            query.name.toLowerCase().includes(searchTerm.toLowerCase()),
          );
          const visibleDatabases = connection.databases.filter(
            (database) =>
              !["information_schema", "performance_schema"].includes(
                database.name.toLowerCase(),
              ),
          );

          const renderDatabaseTreeNode = (
            database: DatabaseInfo,
            level: number,
          ) => {
            const dbKey = `${connection.id}-${database.name}`;
            const supportsSchemaNode = datasourceAdapter.supportsSchemaNode;

            return (
              <TreeNode
                key={dbKey}
                level={level}
                icon={<Database className="w-4 w-4" />}
                label={
                  <>
                    {(connection.type === "sqlite" ||
                      connection.type === "duckdb") &&
                    database.name === "main"
                      ? t(
                          connection.type === "duckdb"
                            ? "connection.duckdbMainLabel"
                            : "connection.sqliteMainLabel",
                        )
                      : database.name}
                    {connection.type === "redis" &&
                      database.redisKeyCount != null && (
                        <span className="ml-1.5 text-[10px] text-muted-foreground font-normal">
                          · {database.redisKeyCount.toLocaleString()}
                        </span>
                      )}
                  </>
                }
                isExpanded={
                  datasourceAdapter.isDatabaseExpandable
                    ? expandedDatabases.has(dbKey)
                    : false
                }
                onToggle={() => toggleDatabase(dbKey, (connId, dbName, key) => {
                  const conn = connections.find((c) => c.id === connId);
                  if (conn) {
                    const db = conn.databases.find((d) => d.name === dbName);
                    if (
                      db &&
                      (supportsSchemaNodeForDriver(conn.type)
                        ? db.schemas.length === 0
                        : db.tables.length === 0)
                    ) {
                      setLoadingDatabaseKeys((prev) => new Set(prev).add(key));
                      fetchAndSetTables(connId, dbName).finally(() => {
                        setLoadingDatabaseKeys((prev) => {
                          const next = new Set(prev);
                          next.delete(key);
                          return next;
                        });
                      });
                    }
                  }
                })}
                toggleOnRowClick={datasourceAdapter.isDatabaseExpandable}
                hideToggle={!datasourceAdapter.isDatabaseExpandable}
                statusIndicator={
                  loadingDatabaseKeys.has(dbKey) ? loadingSpinner : undefined
                }
                actions={datasourceAdapter.getDatabaseRowActions(database)}
                onDoubleClick={
                  datasourceAdapter.onDatabaseDoubleClick
                    ? () => datasourceAdapter.onDatabaseDoubleClick?.(database)
                    : undefined
                }
                onContextMenu={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setContextMenu({
                    visible: true,
                    x: e.clientX,
                    y: e.clientY,
                    connectionId: connection.id,
                    databaseName: database.name,
                    type: "database",
                  });
                }}
              >
                {(() => {
                  const allGroups = datasourceAdapter.databaseGroups || [];
                  const dbGroups = simpleMode
                    ? allGroups.filter((g) => g.source === "tables" && !g.sourceFilter)
                    : allGroups;
                  return supportsSchemaNode ? (
                    database.schemas.map((schemaNode) => {
                      const schemaKey = getSchemaNodeKey(dbKey, schemaNode.name);
                      return (
                        <TreeNode
                          key={schemaKey}
                          level={level + 1}
                          icon={<FolderOpen className="w-4 h-4" />}
                          label={schemaNode.name}
                          isExpanded={expandedSchemas.has(schemaKey)}
                          onToggle={() => toggleSchema(schemaKey)}
                          onContextMenu={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setContextMenu({
                              visible: true,
                              x: e.clientX,
                              y: e.clientY,
                              connectionId: connection.id,
                              databaseName: database.name,
                              schemaName: schemaNode.name,
                              type: "schema",
                            });
                          }}
                        >
                          {dbGroups.map((group) => {
                            const items = getGroupItems(database, group, dbKey, schemaNode);
                            return <GroupNodeRenderer key={`${dbKey}::${group.id}`} group={group} items={items} groupLevel={level + 2} dbKey={dbKey} connection={connection} database={database} deps={treeNodeDeps} />;
                          })}
                        </TreeNode>
                      );
                    })
                  ) : (
                    <>
                      {dbGroups.map((group) => {
                        const items = getGroupItems(database, group, dbKey);
                        return <GroupNodeRenderer key={`${dbKey}::${group.id}`} group={group} items={items} groupLevel={level + 1} dbKey={dbKey} connection={connection} database={database} deps={treeNodeDeps} />;
                      })}
                    {datasourceAdapter.renderDatabaseFooter(database, level)}
                  </>
                  );
                })()}
              </TreeNode>
            );
          };

          return (
            <TreeNode
              key={connection.id}
              level={0}
              icon={getConnectionIcon(connection.type)}
              label={connection.name}
              isExpanded={expandedConnections.has(connection.id)}
              toggleOnRowClick={connection.connectState === "success"}
              onToggle={() => toggleConnection(connection.id, connections)}
              onDoubleClick={() => {
                void connectConnection(connection.id);
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setContextMenu({
                  visible: true,
                  x: e.clientX,
                  y: e.clientY,
                  connectionId: connection.id,
                  type: "connection",
                });
              }}
              leadingIndicator={
                <span
                  className="inline-flex items-center justify-center shrink-0"
                  role="status"
                  aria-label={getConnectionStatusLabelI18n(connection, t)}
                  title={getConnectionStatusLabelI18n(connection, t)}
                >
                  {renderConnectionStatusIndicator(connection)}
                </span>
              }
            >
              <>
                {showSavedQueriesInTree ? (
                  <TreeNode
                    level={1}
                    icon={<FileCode className="w-4 h-4" />}
                    label={t("connection.tree.queries")}
                    isExpanded={expandedQueryGroups.has(
                      `${connection.id}::queries`,
                    )}
                    onToggle={() =>
                      toggleQueryGroup(`${connection.id}::queries`)
                    }
                    forceShowToggle={queriesForConnection.length > 0}
                    canToggle={queriesForConnection.length > 0}
                  >
                    {queriesForConnection.map((query) => (
                      <TreeNode
                        key={`conn-query-${query.id}`}
                        level={2}
                        icon={<FileCode className="w-4 h-4" />}
                        label={query.name}
                        toggleOnRowClick={false}
                        canToggle={false}
                        onDoubleClick={() => onSelectSavedQuery?.(query)}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                        }}
                      >
                        {null}
                      </TreeNode>
                    ))}
                  </TreeNode>
                ) : null}

                {connection.connectState === "success" ? (
                  showSavedQueriesInTree ? (
                    <TreeNode
                      level={1}
                      icon={<Database className="w-4 h-4" />}
                      label={t("connection.tree.database")}
                      isExpanded={expandedDatabaseGroups.has(
                        `${connection.id}::databases`,
                      )}
                      onToggle={() =>
                        toggleDatabaseGroup(`${connection.id}::databases`)
                      }
                      forceShowToggle={visibleDatabases.length > 0}
                      canToggle={visibleDatabases.length > 0}
                    >
                      {visibleDatabases.map((database) =>
                        renderDatabaseTreeNode(database, 2),
                      )}
                    </TreeNode>
                  ) : (
                    visibleDatabases.map((database) =>
                      renderDatabaseTreeNode(database, 1),
                    )
                  )
                ) : null}
              </>
            </TreeNode>
          );
        })}
          </div>
        )}
      </ConnectionContextMenu>

      <InlineContextMenu
        contextMenu={contextMenu}
        onClose={() => setContextMenu((prev) => ({ ...prev, visible: false }))}
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
      />
      <ConnectionDialogs
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
        onCreateDatabase={handleCreateDatabase}
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
        pendingDatabaseExportFormat={pendingDatabaseExport?.format || "sql_full"}
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
