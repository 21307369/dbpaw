import {
  FileCode,
  Download,
  Table2 as TableIcon,
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { ContextMenuItem } from "@/components/ui/context-menu";
import { api } from "@/services/api";
import { getTreeConfig } from "@/lib/driver-registry";
import type { TreeCallbacks } from "@/lib/tree-adapters/types.tsx";
import type { ElasticsearchIndexAction } from "@/components/business/Elasticsearch/elasticsearch-index-management";
import type {
  Connection,
  DatabaseInfo,
  TableInfo,
  DatasourceTreeAdapter,
} from "./types";

export interface GetDatasourceTreeAdapterDeps {
  onTableSelect?: (
    connection: string,
    database: string,
    table: string,
    connectionId: number,
    driver: string,
    schema?: string,
  ) => void;
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
  openCreateElasticsearchIndexDialog: (
    connectionId: string,
    databaseName?: string,
  ) => void;
  handleElasticsearchIndexAction: (
    connectionId: string,
    databaseName: string,
    index: string,
    action: ElasticsearchIndexAction,
  ) => Promise<void>;
  handleOpenERDiagram: (connectionId: string, database: string) => void;
  showElasticsearchSystemIndices: boolean;
  showMongoSystemCollections: boolean;
  searchTerm: string;
  t: (key: string) => string;
  fetchSqlTablesAsTableInfo: (
    connectionId: string,
    databaseName: string,
  ) => Promise<TableInfo[]>;
  handleCreateQueryFromContext: (
    connectionId: string | null | undefined,
    databaseName?: string | null,
  ) => void;
  handleTableExportDialog: (
    connection: Connection,
    database: DatabaseInfo,
    table: TableInfo,
  ) => void;
  onAlterTable?: (
    connectionId: number,
    database: string,
    schema: string,
    table: string,
    driver: string,
  ) => void;
  setShowElasticsearchSystemIndices: (checked: boolean) => void;
  setShowMongoSystemCollections: (checked: boolean) => void;
  setContextMenu: React.Dispatch<
    React.SetStateAction<{
      visible: boolean;
      x: number;
      y: number;
      connectionId: string | null;
      databaseName?: string | null;
      schemaName?: string | null;
      type: "connection" | "database" | "schema";
    }>
  >;
}

export function getDatasourceTreeAdapter(params: {
  connection: Connection;
  treeCallbacks?: TreeCallbacks;
  deps: GetDatasourceTreeAdapterDeps;
}): DatasourceTreeAdapter {
  const { connection, treeCallbacks, deps } = params;
  const driverKind =
    connection.type === "redis"
      ? "kv"
      : connection.type === "elasticsearch"
        ? "search"
        : connection.type === "mongodb"
          ? "document"
          : "sql";

  const buildContext = () => ({
    connectionId: connection.id,
    connectionName: connection.name,
    connectionType: connection.type,
    driverKind: driverKind as any,
  });

  const enhancedCallbacks = {
    ...treeCallbacks,
    onOpenERDiagram: (ctx: any) => {
      deps.handleOpenERDiagram(ctx.connectionId, ctx.databaseName);
    },
    onCreateIndex: (ctx: any) => {
      deps.openCreateElasticsearchIndexDialog(
        ctx.connectionId,
        ctx.databaseName,
      );
      treeCallbacks?.onCreateIndex?.(ctx);
    },
    onIndexAction: async (
      ctx: any,
      action: "refresh" | "open" | "close" | "delete",
    ) => {
      await deps.handleElasticsearchIndexAction(
        ctx.connectionId,
        ctx.databaseName,
        ctx.leafName,
        action,
      );
      treeCallbacks?.onIndexAction?.(ctx, action);
    },
  };

  const config = getTreeConfig(connection.type, enhancedCallbacks);

  return {
    supportsSchemaNode: config.supportsSchemaNode,
    isDatabaseExpandable: config.databaseExpandable,
    listDatabases: async () => {
      if (config.virtualDatabases) {
        return config.virtualDatabases;
      }
      if (connection.type === "redis") {
        return (await api.redis.listDatabases(Number(connection.id))).map(
          (db) => db.name,
        );
      }
      if (connection.type === "mongodb") {
        return (await api.mongodb.listDatabases(Number(connection.id))).map(
          (db) => db.name,
        );
      }
      return api.metadata.listDatabasesById(Number(connection.id));
    },
    loadDatabaseChildren: async (databaseName: string) => {
      if (connection.type === "redis") {
        await deps.loadRedisKeysPage(connection.id, databaseName, "0", false);
        return [];
      }
      if (connection.type === "elasticsearch") {
        const indices = await api.elasticsearch.listIndices(
          Number(connection.id),
        );
        return indices
          .filter(
            (index) =>
              deps.showElasticsearchSystemIndices ||
              !index.isSystem ||
              deps.searchTerm.trim().startsWith("."),
          )
          .map((index) => ({
            name: index.name,
            schema: "Indices",
            columns: [],
            isSystem: index.isSystem,
            indexStatus: index.status,
          }));
      }
      if (connection.type === "mongodb") {
        const collections = await api.mongodb.listCollections(
          Number(connection.id),
          databaseName,
        );
        return collections
          .filter(
            (col) =>
              deps.showMongoSystemCollections ||
              !col.name.startsWith("system.") ||
              deps.searchTerm.trim().startsWith("system"),
          )
          .map((col) => ({
            name: col.name,
            schema: databaseName,
            columns: [],
            isSystem: col.name.startsWith("system."),
          }));
      }
      return deps.fetchSqlTablesAsTableInfo(connection.id, databaseName);
    },
    shouldSkipTableColumns: driverKind !== "sql",
    getItemIcon: config.leafNodeIcon,
    onItemActivate: (database, table) => {
      const ctx = {
        ...buildContext(),
        databaseName: database.name,
        leafName: table.name,
        leafSchema: table.schema,
        leafMeta: {
          isSystem: table.isSystem,
          indexStatus: table.indexStatus,
        },
      };

      if (config.onLeafActivate) {
        config.onLeafActivate(ctx);
        return;
      }

      if (driverKind === "sql") {
        deps.onTableSelect?.(
          connection.name,
          database.name,
          table.name,
          Number(connection.id),
          connection.type,
          table.schema,
        );
      }
    },
    getDatabaseRowActions: (database) => {
      if (!config.getDatabaseActions) return undefined;
      const ctx = {
        ...buildContext(),
        databaseName: database.name,
        databaseMeta: {
          redisKeyCount: database.redisKeyCount,
          redisCursor: database.redisCursor,
          redisIsPartial: database.redisIsPartial,
          redisRequiresPattern: database.redisRequiresPattern,
        },
      };
      return config.getDatabaseActions(ctx);
    },
    onDatabaseDoubleClick: config.onDatabaseDoubleClick
      ? (database) => {
          const ctx = {
            ...buildContext(),
            databaseName: database.name,
            databaseMeta: {
              redisKeyCount: database.redisKeyCount,
            },
          };
          config.onDatabaseDoubleClick!(ctx);
        }
      : undefined,
    renderDatabaseFooter: (database, level) => {
      if (connection.type === "redis") {
        const indent = `${(level + 1) * 12 + 8}px`;
        if (database.redisRequiresPattern) {
          return (
            <span
              key="redis-pattern-required"
              className="block px-3 py-1 text-xs text-muted-foreground"
              style={{ paddingLeft: indent }}
            >
              Enter a search pattern to browse cluster keys safely
            </span>
          );
        }
        if (!database.redisIsPartial) return null;
        return database.redisCursor !== "0" ? (
          <button
            key="redis-load-more"
            className="block w-full px-3 py-1 text-left text-xs text-muted-foreground hover:text-foreground"
            style={{ paddingLeft: indent }}
            onClick={() =>
              void deps.loadRedisKeysPage(
                connection.id,
                database.name,
                database.redisCursor!,
                true,
              )
            }
          >
            Load more…
          </button>
        ) : (
          <span
            key="redis-capped"
            className="block px-3 py-1 text-xs text-muted-foreground"
            style={{ paddingLeft: indent }}
          >
            Results capped — use a pattern to narrow down
          </span>
        );
      }

      if (connection.type === "elasticsearch") {
        return (
          <label
            key="elasticsearch-system-indices"
            className="flex items-center gap-2 px-3 py-1 text-xs text-muted-foreground"
            style={{ paddingLeft: `${(level + 1) * 12 + 8}px` }}
            onClick={(e) => e.stopPropagation()}
          >
            <Checkbox
              checked={deps.showElasticsearchSystemIndices}
              onCheckedChange={(checked) =>
                deps.setShowElasticsearchSystemIndices(checked === true)
              }
            />
            Show system indices
          </label>
        );
      }

      if (connection.type === "mongodb") {
        return (
          <label
            key="mongodb-system-collections"
            className="flex items-center gap-2 px-3 py-1 text-xs text-muted-foreground"
            style={{ paddingLeft: `${(level + 1) * 12 + 8}px` }}
            onClick={(e) => e.stopPropagation()}
          >
            <Checkbox
              checked={deps.showMongoSystemCollections}
              onCheckedChange={(checked) =>
                deps.setShowMongoSystemCollections(checked === true)
              }
            />
            Show system collections
          </label>
        );
      }

      return null;
    },
    renderTableContextMenu: (database, table) => {
      if (driverKind === "sql") {
        return (
          <>
            <ContextMenuItem
              onClick={() =>
                deps.handleCreateQueryFromContext(connection.id, database.name)
              }
            >
              <FileCode className="mr-2 h-4 w-4" />
              {deps.t("connection.menu.newQuery")}
            </ContextMenuItem>
            <ContextMenuItem
              onClick={() =>
                deps.handleTableExportDialog(connection, database, table)
              }
            >
              <Download className="mr-2 h-4 w-4" />
              {deps.t("connection.menu.exportTable")}
            </ContextMenuItem>
            {deps.onAlterTable ? (
              <ContextMenuItem
                onClick={() =>
                  deps.onAlterTable!(
                    Number(connection.id),
                    database.name,
                    table.schema ?? "",
                    table.name,
                    connection.type,
                  )
                }
              >
                <TableIcon className="mr-2 h-4 w-4" />
                {deps.t("connection.menu.alterTable")}
              </ContextMenuItem>
            ) : null}
          </>
        );
      }

      if (!config.getLeafContextMenuItems) return null;
      const ctx = {
        ...buildContext(),
        databaseName: database.name,
        leafName: table.name,
        leafSchema: table.schema,
        leafMeta: {
          isSystem: table.isSystem,
          indexStatus: table.indexStatus,
        },
      };
      const items = config.getLeafContextMenuItems(ctx);
      if (items.length === 0) return null;
      return (
        <>
          {items.map((item) => (
            <ContextMenuItem
              key={item.key}
              className={item.destructive ? "text-destructive" : ""}
              onClick={item.onClick}
            >
              {item.icon}
              {item.label}
            </ContextMenuItem>
          ))}
        </>
      );
    },
    renderDatabaseContextMenu:
      config.getDatabaseContextMenuItems
        ? (databaseName) => {
            const ctx = {
              ...buildContext(),
              databaseName,
            };
            const items =
              config.getDatabaseContextMenuItems!(ctx);
            return (
              <>
                {items.map((item) => (
                  <button
                    key={item.key}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-accent"
                    onClick={() => {
                      item.onClick();
                      deps.setContextMenu((prev) => ({
                        ...prev,
                        visible: false,
                      }));
                    }}
                  >
                    {item.icon}
                    {item.label}
                  </button>
                ))}
              </>
            );
          }
        : undefined,
    databaseGroups: config.databaseGroups,
  };
}
