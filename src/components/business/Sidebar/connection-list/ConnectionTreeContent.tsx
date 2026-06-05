import { Database, FileCode, FolderOpen, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { DatabaseGroupConfig } from "@/lib/tree-adapters/types";
import { getConnectionIcon, supportsSchemaBrowsing, type Driver } from "@/lib/driver-registry";
import { TreeNode } from "./TreeNode";
import { GroupNodeRenderer, type TreeNodeDeps } from "./TreeNodeRenderers";
import type {
  Connection,
  DatabaseInfo,
  SchemaInfo,
  TableInfo,
  DatasourceTreeAdapter,
} from "./types";
import type { SavedQuery } from "@/services/api";
import { ConnectionContextMenu } from "../ConnectionContextMenu";
import type { ContextMenuState } from "./InlineContextMenu";
import {
  getConnectionStatusLabelI18n,
  renderConnectionStatusIndicator,
} from "./helpers";

interface ConnectionTreeContentProps {
  // 数据
  connections: Connection[];
  filteredConnections: Connection[];
  savedQueriesByConnection: Record<string, SavedQuery[]>;
  searchTerm: string;
  // 展开状态
  expandedConnections: Set<string>;
  expandedDatabases: Set<string>;
  expandedSchemas: Set<string>;
  expandedQueryGroups: Set<string>;
  expandedDatabaseGroups: Set<string>;
  // Loading 状态
  loadingDatabaseKeys: Set<string>;
  // 切换回调
  toggleConnection: (id: string, connections: Connection[]) => void;
  toggleDatabase: (key: string, onNeedsLoading?: (connId: string, dbName: string, key: string) => void) => void;
  toggleSchema: (key: string) => void;
  toggleQueryGroup: (key: string) => void;
  toggleDatabaseGroup: (key: string) => void;
  // 数据加载回调
  connectConnection: (id: string) => void;
  fetchAndSetTables: (connectionId: string, databaseName: string) => Promise<TableInfo[]>;
  setLoadingDatabaseKeys: (fn: (prev: Set<string>) => Set<string>) => void;
  // 适配器
  getAdapter: (connection: Connection) => DatasourceTreeAdapter;
  treeNodeDeps: TreeNodeDeps;
  // 配置
  showSavedQueriesInTree: boolean;
  simpleMode: boolean;
  // 回调
  onContextMenuChange: React.Dispatch<React.SetStateAction<ContextMenuState>>;
  onSelectSavedQuery?: (query: SavedQuery) => void;
  // Database group helpers
  getGroupItems: (database: DatabaseInfo, group: DatabaseGroupConfig, dbKey: string, schema?: SchemaInfo) => { name: string; [key: string]: any }[];
  // Context menu actions
  onNewConnection: () => void;
  onImportConnection: () => void;
}

const loadingSpinner = (
  <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
);

export function ConnectionTreeContent(props: ConnectionTreeContentProps) {
  const { t } = useTranslation();
  const {
    connections,
    filteredConnections,
    savedQueriesByConnection,
    searchTerm,
    expandedConnections,
    expandedDatabases,
    expandedSchemas,
    expandedQueryGroups,
    expandedDatabaseGroups,
    loadingDatabaseKeys,
    toggleConnection,
    toggleDatabase,
    toggleSchema,
    toggleQueryGroup,
    toggleDatabaseGroup,
    connectConnection,
    fetchAndSetTables,
    setLoadingDatabaseKeys,
    getAdapter,
    treeNodeDeps,
    showSavedQueriesInTree,
    simpleMode,
    onContextMenuChange,
    onSelectSavedQuery,
    getGroupItems,
    onNewConnection,
    onImportConnection,
  } = props;

  const supportsSchemaNodeForDriver = (driver: Driver) =>
    supportsSchemaBrowsing(driver);

  const getSchemaNodeKey = (databaseKey: string, schema: string) =>
    `${databaseKey}::${schema}`;

  const renderDatabaseTreeNode = (
    connection: Connection,
    database: DatabaseInfo,
    level: number,
  ) => {
    const dbKey = `${connection.id}-${database.name}`;
    const datasourceAdapter = getAdapter(connection);

    return (
      <TreeNode
        key={dbKey}
        level={level}
        icon={<Database className="w-4 w-4" />}
        label={
          <>
            {(connection.type === "sqlite" || connection.type === "duckdb") &&
            database.name === "main"
              ? t(
                  connection.type === "duckdb"
                    ? "connection.duckdbMainLabel"
                    : "connection.sqliteMainLabel",
                )
              : database.name}
            {connection.type === "redis" && database.redisKeyCount != null && (
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
        onToggle={() =>
          toggleDatabase(dbKey, (connId, dbName, key) => {
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
          })
        }
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
          onContextMenuChange({
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
          return datasourceAdapter.supportsSchemaNode ? (
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
                    onContextMenuChange({
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
                    return (
                      <GroupNodeRenderer
                        key={`${dbKey}::${group.id}`}
                        group={group}
                        items={items}
                        groupLevel={level + 2}
                        dbKey={dbKey}
                        connection={connection}
                        database={database}
                        deps={treeNodeDeps}
                      />
                    );
                  })}
                </TreeNode>
              );
            })
          ) : (
            <>
              {dbGroups.map((group) => {
                const items = getGroupItems(database, group, dbKey);
                return (
                  <GroupNodeRenderer
                    key={`${dbKey}::${group.id}`}
                    group={group}
                    items={items}
                    groupLevel={level + 1}
                    dbKey={dbKey}
                    connection={connection}
                    database={database}
                    deps={treeNodeDeps}
                  />
                );
              })}
              {datasourceAdapter.renderDatabaseFooter(database, level)}
            </>
          );
        })()}
      </TreeNode>
    );
  };

  return (
    <ConnectionContextMenu
      onNewConnection={onNewConnection}
      onImportConnection={onImportConnection}
    >
      {({ onContextMenu }) => (
        <div
          className="flex-1 overflow-auto"
          onClick={() =>
            onContextMenuChange((prev) => ({ ...prev, visible: false }))
          }
          onContextMenu={onContextMenu}
        >
          {filteredConnections.map((connection) => {
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
                  onContextMenuChange({
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
                          renderDatabaseTreeNode(connection, database, 2),
                        )}
                      </TreeNode>
                    ) : (
                      visibleDatabases.map((database) =>
                        renderDatabaseTreeNode(connection, database, 1),
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
  );
}
