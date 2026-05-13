import {
  Key,
  Database,
  Plus,
  LayoutDashboard,
  Terminal,
  Server,
} from "lucide-react";
import type { TreeConfig, TreeMenuItem, DatabaseContext } from "./types";

export function createRedisTreeConfig(callbacks: {
  onCreateKey?: (ctx: DatabaseContext) => void;
  onOpenBrowser?: (ctx: DatabaseContext) => void;
  onOpenConsole?: (ctx: DatabaseContext) => void;
  onOpenServerInfo?: (ctx: DatabaseContext) => void;
}): TreeConfig {
  return {
    supportsSavedQueries: false,
    databaseExpandable: false,
    supportsSchemaNode: false,
    leafNodeType: "key",
    leafNodeIcon: () => <Key className="w-4 h-4" />,
    databaseNodeIcon: () => <Database className="w-4 h-4" />,

    getDatabaseLabel: (name, meta) => {
      if (meta?.redisKeyCount != null) {
        return `${name} · ${meta.redisKeyCount}`;
      }
      return null;
    },

    getDatabaseActions: (ctx) => {
      if (!callbacks.onCreateKey) return undefined;
      return (
        <div onClick={(e) => e.stopPropagation()}>
          <button
            className="h-6 w-6 p-0 inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
            onClick={() => callbacks.onCreateKey!(ctx)}
          >
            <Plus className="w-3 h-3" />
          </button>
        </div>
      );
    },

    onDatabaseDoubleClick: callbacks.onOpenBrowser
      ? (ctx) => callbacks.onOpenBrowser!(ctx)
      : undefined,

    getDatabaseContextMenuItems: (ctx) => {
      const items: TreeMenuItem[] = [];

      if (callbacks.onCreateKey) {
        items.push({
          key: "new-key",
          label: "New key",
          icon: <Plus className="h-4 w-4" />,
          onClick: () => callbacks.onCreateKey!(ctx),
        });
      }

      if (callbacks.onOpenBrowser) {
        items.push({
          key: "browser",
          label: "Open browser",
          icon: <LayoutDashboard className="h-4 w-4" />,
          onClick: () => callbacks.onOpenBrowser!(ctx),
        });
      }

      if (callbacks.onOpenConsole) {
        items.push({
          key: "console",
          label: "Open console",
          icon: <Terminal className="h-4 w-4" />,
          onClick: () => callbacks.onOpenConsole!(ctx),
        });
      }

      if (callbacks.onOpenServerInfo) {
        items.push({
          key: "server-info",
          label: "Server Info",
          icon: <Server className="h-4 w-4" />,
          onClick: () => callbacks.onOpenServerInfo!(ctx),
        });
      }

      return items;
    },

    getLeafContextMenuItems: () => [],
  };
}
