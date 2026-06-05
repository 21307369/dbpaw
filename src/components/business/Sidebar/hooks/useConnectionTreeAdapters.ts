import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import {
  elasticsearchIndexActionSuccessMessage,
  executeElasticsearchIndexAction,
  type ElasticsearchIndexAction,
} from "@/components/business/Elasticsearch/elasticsearch-index-management";
import { errorMessage } from "@/lib/errors";
import type { TreeCallbacks } from "@/lib/tree-adapters/types.tsx";
import { getDatasourceTreeAdapter as getDatasourceTreeAdapterFn } from "../connection-list/getDatasourceTreeAdapter";
import type {
  Connection,
  DatabaseInfo,
  DatasourceTreeAdapter,
  TableInfo,
} from "../connection-list/types";

type ContextMenuState = {
  visible: boolean;
  x: number;
  y: number;
  connectionId: string | null;
  databaseName?: string | null;
  schemaName?: string | null;
  type: "connection" | "database" | "schema";
};

export function useConnectionTreeAdapters(options: {
  connections: Connection[];
  expandedDatabases: Set<string>;
  treeCallbacks?: TreeCallbacks;
  onTableSelect?: (
    connection: string,
    database: string,
    table: string,
    connectionId: number,
    driver: string,
    schema?: string,
  ) => void;
  onCreateQuery?: (
    connectionId: number,
    databaseName: string,
    driver: string,
  ) => void;
  onAlterTable?: (
    connectionId: number,
    database: string,
    schema: string,
    table: string,
    driver: string,
  ) => void;
  searchTerm: string;
  loadRedisKeysPage: (
    connectionId: string,
    databaseName: string,
    cursor: string,
    append: boolean,
  ) => Promise<TableInfo[]>;
  handleRefreshDatabaseTables: (
    connectionId: string,
    databaseName: string,
  ) => Promise<void>;
  fetchSqlTablesAsTableInfo: (
    connectionId: string,
    databaseName: string,
  ) => Promise<TableInfo[]>;
  handleTableExportDialog: (
    connection: Connection,
    database: DatabaseInfo,
    table: TableInfo,
  ) => void;
  setContextMenu: React.Dispatch<React.SetStateAction<ContextMenuState>>;
}) {
  const {
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
  } = options;
  const { t } = useTranslation();
  const [showElasticsearchSystemIndices, setShowElasticsearchSystemIndices] =
    useState(false);
  const [showMongoSystemCollections, setShowMongoSystemCollections] =
    useState(false);
  const [createEsIndexConnectionId, setCreateEsIndexConnectionId] = useState<
    string | null
  >(null);
  const [isCreateEsIndexDialogOpen, setIsCreateEsIndexDialogOpen] =
    useState(false);

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
    [treeCallbacks],
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

      onCreateQuery(
        Number(connectionId),
        resolvedDatabaseName,
        connection.type,
      );
    },
    [onCreateQuery, connections, t],
  );

  const getAdapter = useCallback(
    (connection: Connection): DatasourceTreeAdapter =>
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
      setContextMenu,
    ],
  );

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

  return {
    getAdapter,
    createEsIndexConnectionId,
    setCreateEsIndexConnectionId,
    isCreateEsIndexDialogOpen,
    setIsCreateEsIndexDialogOpen,
    handleCreateQueryFromContext,
  };
}
