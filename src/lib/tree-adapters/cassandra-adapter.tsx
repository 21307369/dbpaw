import { Table, Database, FileCode, Copy, Trash2, Scissors } from "lucide-react";
import type {
  TreeConfig,
  TreeMenuItem,
  DatabaseContext,
  LeafContext,
} from "./types";

export function createCassandraTreeConfig(callbacks: {
  onCreateQuery?: (ctx: DatabaseContext) => void;
  onTruncateTable?: (ctx: LeafContext) => void;
  onDropKeyspace?: (ctx: DatabaseContext) => void;
  onCopyCql?: (ctx: LeafContext) => void;
}): TreeConfig {
  return {
    supportsSavedQueries: true,
    databaseExpandable: true,
    supportsSchemaNode: false,
    leafNodeType: "table",
    leafNodeIcon: () => <Table className="w-4 h-4" />,
    databaseNodeIcon: () => <Database className="w-4 h-4" />,

    getDatabaseContextMenuItems: (ctx) => {
      const items: TreeMenuItem[] = [];

      if (callbacks.onCreateQuery) {
        items.push({
          key: "new-query",
          label: "New Query",
          icon: <FileCode className="mr-2 h-4 w-4" />,
          onClick: () =>
            callbacks.onCreateQuery!({
              connectionId: ctx.connectionId,
              connectionName: ctx.connectionName,
              connectionType: ctx.connectionType,
              driverKind: ctx.driverKind,
              databaseName: ctx.databaseName,
            }),
        });
      }

      if (callbacks.onDropKeyspace) {
        items.push({
          key: "drop-keyspace",
          label: "Drop Keyspace",
          icon: <Trash2 className="mr-2 h-4 w-4" />,
          destructive: true,
          onClick: () => callbacks.onDropKeyspace!(ctx),
        });
      }

      return items;
    },

    getLeafContextMenuItems: (ctx) => {
      const items: TreeMenuItem[] = [];

      if (callbacks.onCreateQuery) {
        items.push({
          key: "new-query",
          label: "New Query",
          icon: <FileCode className="mr-2 h-4 w-4" />,
          onClick: () =>
            callbacks.onCreateQuery!({
              connectionId: ctx.connectionId,
              connectionName: ctx.connectionName,
              connectionType: ctx.connectionType,
              driverKind: ctx.driverKind,
              databaseName: ctx.databaseName,
            }),
        });
      }

      if (callbacks.onCopyCql) {
        items.push({
          key: "copy-cql",
          label: "Copy CQL",
          icon: <Copy className="mr-2 h-4 w-4" />,
          onClick: () => callbacks.onCopyCql!(ctx),
        });
      }

      if (callbacks.onTruncateTable) {
        items.push({
          key: "truncate-table",
          label: "Truncate Table",
          icon: <Scissors className="mr-2 h-4 w-4" />,
          destructive: true,
          onClick: () => callbacks.onTruncateTable!(ctx),
        });
      }

      return items;
    },
  };
}
