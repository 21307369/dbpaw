import { memo, useCallback, type ReactNode, type RefObject } from "react";
import { Key, Play, Loader2 } from "lucide-react";
import { ContextMenu, ContextMenuContent, ContextMenuTrigger } from "@/components/ui/context-menu";
import { Button } from "@/components/ui/button";
import { TreeNode } from "./TreeNode";
import type {
  Connection,
  DatabaseInfo,
  TableInfo,
  DatasourceTreeAdapter,
} from "./types";
import type { DatabaseGroupConfig } from "@/lib/tree-adapters/types";
import type { TFunction } from "i18next";

const loadingSpinner = (
  <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
);

interface TreeNodeDeps {
  connections: Connection[];
  expandedTables: Set<string>;
  selectedTableKey: string | null;
  loadingTableKeys: Set<string>;
  expandedGroupNodes: Set<string>;
  tableNodeRefs: RefObject<Record<string, HTMLDivElement | null>>;
  getDatasourceTreeAdapter: (connection: Connection) => DatasourceTreeAdapter;
  toggleTable: (key: string, onExpand?: () => void) => void;
  toggleGroupNode: (key: string) => void;
  setLoadingTableKeys: React.Dispatch<React.SetStateAction<Set<string>>>;
  fetchAndSetTableColumns: (
    connectionId: string,
    database: string,
    schema: string,
    table: string,
  ) => Promise<void>;
  handleTableClick: (
    connection: Connection,
    database: DatabaseInfo,
    table: TableInfo,
  ) => void;
  renderTableContextMenu: (
    datasourceAdapter: DatasourceTreeAdapter,
    database: DatabaseInfo,
    table: TableInfo,
  ) => ReactNode;
  t: TFunction;
}

export const SimpleNodeRenderer = memo(function SimpleNodeRenderer({
  itemKey,
  level,
  icon,
  name,
}: {
  itemKey: string;
  level: number;
  icon: ReactNode;
  name: string;
}) {
  return (
    <TreeNode key={itemKey} level={level} icon={icon} label={name} hideToggle>
      {null}
    </TreeNode>
  );
});

function ExpandableLeafNode({
  nodeKey,
  level,
  icon,
  name,
  isExpanded,
  connections,
  connectionId,
  databaseName,
  itemSchema,
  itemName,
  getDatasourceTreeAdapter,
  toggleTable,
  setLoadingTableKeys,
  fetchAndSetTableColumns,
}: {
  nodeKey: string;
  level: number;
  icon: ReactNode;
  name: string;
  isExpanded: boolean;
  connections: Connection[];
  connectionId: string;
  databaseName: string;
  itemSchema: string;
  itemName: string;
} & Pick<TreeNodeDeps, "getDatasourceTreeAdapter" | "toggleTable" | "setLoadingTableKeys" | "fetchAndSetTableColumns">) {
  const handleToggle = useCallback(() => {
    toggleTable(nodeKey, () => {
      const c = connections.find((x) => x.id === connectionId);
      if (c && getDatasourceTreeAdapter(c).shouldSkipTableColumns) {
        return;
      }
      setLoadingTableKeys((prev) => new Set(prev).add(nodeKey));
      fetchAndSetTableColumns(
        connectionId,
        databaseName,
        itemSchema,
        itemName,
      ).finally(() => {
        setLoadingTableKeys((prev) => {
          const next = new Set(prev);
          next.delete(nodeKey);
          return next;
        });
      });
    });
  }, [nodeKey, connectionId, databaseName, itemSchema, itemName, connections, getDatasourceTreeAdapter, toggleTable, setLoadingTableKeys, fetchAndSetTableColumns]);

  return (
    <TreeNode
      key={nodeKey}
      level={level}
      icon={icon}
      label={name}
      isExpanded={isExpanded}
      onToggle={handleToggle}
    >
      {null}
    </TreeNode>
  );
}

export function TableNodeRenderer({
  table,
  tableLevel,
  database,
  connection,
  customIcon,
  deps,
}: {
  table: TableInfo;
  tableLevel: number;
  database: DatabaseInfo;
  connection: Connection;
  customIcon?: ReactNode;
  deps: TreeNodeDeps;
}) {
  const {
    selectedTableKey,
    expandedTables,
    loadingTableKeys,
    tableNodeRefs,
    getDatasourceTreeAdapter,
    toggleTable,
    setLoadingTableKeys,
    fetchAndSetTableColumns,
    handleTableClick,
    renderTableContextMenu,
    connections,
  } = deps;

  const datasourceAdapter = getDatasourceTreeAdapter(connection);
  const tableKey = `${connection.id}-${database.name}-${table.schema}-${table.name}`;

  return (
    <ContextMenu key={tableKey}>
      <ContextMenuTrigger asChild>
        <div
          ref={(el) => {
            tableNodeRefs.current[tableKey] = el;
          }}
        >
          <TreeNode
            level={tableLevel}
            icon={customIcon || datasourceAdapter.getItemIcon()}
            label={table.name}
            isSelected={selectedTableKey === tableKey}
            isExpanded={expandedTables.has(tableKey)}
            toggleOnRowClick={false}
            onToggle={() => {
              toggleTable(tableKey, () => {
                const conn = connections.find((c) => c.id === connection.id);
                if (conn && getDatasourceTreeAdapter(conn).shouldSkipTableColumns) {
                  return;
                }
                if (table.columns.length === 0) {
                  setLoadingTableKeys((prev) => new Set(prev).add(tableKey));
                  fetchAndSetTableColumns(
                    connection.id,
                    database.name,
                    table.schema,
                    table.name,
                  ).finally(() => {
                    setLoadingTableKeys((prev) => {
                      const next = new Set(prev);
                      next.delete(tableKey);
                      return next;
                    });
                  });
                }
              });
            }}
            onDoubleClick={() => {
              handleTableClick(connection, database, table);
            }}
            statusIndicator={
              loadingTableKeys.has(tableKey) ||
              table.isSystem ||
              table.indexStatus === "close" ? (
                <span className="inline-flex items-center gap-1">
                  {table.indexStatus === "close" ? (
                    <span className="rounded border px-1 text-[10px] leading-4 text-muted-foreground">
                      closed
                    </span>
                  ) : null}
                  {table.isSystem ? (
                    <span className="rounded border px-1 text-[10px] leading-4 text-muted-foreground">
                      system
                    </span>
                  ) : null}
                  {loadingTableKeys.has(tableKey) ? loadingSpinner : null}
                </span>
              ) : undefined
            }
            actions={
              <div onClick={(e) => e.stopPropagation()}>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0"
                  onClick={() => handleTableClick(connection, database, table)}
                >
                  <Play className="w-3 h-3" />
                </Button>
              </div>
            }
          >
            {table.columns.map((column) => (
              <div
                key={column.name}
                className="flex items-center gap-1 px-2 py-1 hover:bg-accent text-xs"
                style={{
                  paddingLeft: `${(tableLevel + 1) * 12 + 8}px`,
                }}
              >
                <span className="w-4" />
                {column.isPrimaryKey ? (
                  <Key className="w-3 h-3 text-yellow-600 shrink-0" />
                ) : (
                  <span className="w-3 shrink-0" />
                )}
                <span className="flex-1 truncate text-foreground">
                  {column.name}
                </span>
                <span className="text-muted-foreground text-xs shrink-0">
                  {column.type}
                </span>
              </div>
            ))}
          </TreeNode>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        {renderTableContextMenu(datasourceAdapter, database, table)}
      </ContextMenuContent>
    </ContextMenu>
  );
}

export function GroupNodeRenderer({
  group,
  items,
  groupLevel,
  dbKey,
  connection,
  database,
  deps,
}: {
  group: DatabaseGroupConfig;
  items: { name: string; schema?: string; type?: string; [key: string]: any }[];
  groupLevel: number;
  dbKey: string;
  connection: Connection;
  database: DatabaseInfo;
  deps: TreeNodeDeps;
}) {
  const { expandedGroupNodes, toggleGroupNode, expandedTables, getDatasourceTreeAdapter, t } = deps;
  const groupNodeKey = `${dbKey}::${group.id}`;

  const renderItem = (item: any, itemLevel: number) => {
    switch (group.source) {
      case "events": {
        const eventKey = `${connection.id}-${database.name}::event::${item.name}`;
        return (
          <SimpleNodeRenderer
            key={eventKey}
            itemKey={eventKey}
            level={itemLevel}
            icon={group.leafIcon}
            name={item.name}
          />
        );
      }
      case "sequences": {
        const seqKey = `${connection.id}-${database.name}::sequence::${item.name}`;
        return (
          <SimpleNodeRenderer
            key={seqKey}
            itemKey={seqKey}
            level={itemLevel}
            icon={group.leafIcon}
            name={item.name}
          />
        );
      }
      case "types": {
        const typeKey = `${connection.id}-${database.name}::type::${item.name}`;
        return (
          <SimpleNodeRenderer
            key={typeKey}
            itemKey={typeKey}
            level={itemLevel}
            icon={group.leafIcon}
            name={item.name}
          />
        );
      }
      case "synonyms":
      case "packages": {
        const nodeKey = `${connection.id}-${database.name}-${item.schema}-${item.name}`;
        return (
          <ExpandableLeafNode
            key={nodeKey}
            nodeKey={nodeKey}
            level={itemLevel}
            icon={group.leafIcon}
            name={item.name}
            isExpanded={expandedTables.has(nodeKey)}
            connections={deps.connections}
            connectionId={connection.id}
            databaseName={database.name}
            itemSchema={item.schema}
            itemName={item.name}
            getDatasourceTreeAdapter={getDatasourceTreeAdapter}
            toggleTable={deps.toggleTable}
            setLoadingTableKeys={deps.setLoadingTableKeys}
            fetchAndSetTableColumns={deps.fetchAndSetTableColumns}
          />
        );
      }
      default:
        return (
          <TableNodeRenderer
            key={`${connection.id}-${database.name}-${item.schema || database.name}-${item.name}`}
            table={{ ...item, schema: item.schema || database.name } as TableInfo}
            tableLevel={itemLevel}
            database={database}
            connection={connection}
            customIcon={group.leafIcon}
            deps={deps}
          />
        );
    }
  };

  return (
    <TreeNode
      key={groupNodeKey}
      level={groupLevel}
      icon={group.icon}
      label={t(group.label)}
      isExpanded={expandedGroupNodes.has(groupNodeKey)}
      onToggle={() => toggleGroupNode(groupNodeKey)}
    >
      {items.length === 0 ? (
        <div
          className="px-2 py-1 text-xs text-muted-foreground"
          style={{ paddingLeft: `${(groupLevel + 1) * 12 + 8}px` }}
        >
          {t(`connection.tree.no${group.id.charAt(0).toUpperCase() + group.id.slice(1)}`)}
        </div>
      ) : (
        items.map((item) => renderItem(item, groupLevel + 1))
      )}
    </TreeNode>
  );
}

export type { TreeNodeDeps };
