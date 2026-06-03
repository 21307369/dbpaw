# ConnectionList.tsx Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Break ConnectionList.tsx (4,417 lines, 57 useState) into focused hooks and components, reducing it to ~1,500 lines.

**Architecture:** Extract responsibilities into custom hooks under `hooks/` and dialog components under `connection-list/`. ConnectionList.tsx becomes an orchestration layer that calls hooks and renders JSX.

**Tech Stack:** React 18, TypeScript, Tauri API, shadcn/ui, lucide-react

---

## File Map

### New Files
| File | Purpose | ~Lines |
|------|---------|--------|
| `src/components/business/Sidebar/hooks/useTreeExpansion.ts` | Tree node expansion state (7 Set states + toggle functions) | 120 |
| `src/components/business/Sidebar/hooks/useRedisKeys.ts` | Redis key scanning with cursor pagination | 120 |
| `src/components/business/Sidebar/hooks/useConnectionCrud.ts` | Connection list CRUD, connect, delete, duplicate, reconnect | 350 |
| `src/components/business/Sidebar/hooks/useTreeDataFetching.ts` | Lazy-loading tables, columns, routines, events, sequences, types, synonyms, packages | 500 |
| `src/components/business/Sidebar/hooks/useConnectionForm.ts` | Connection dialog form state, validation, test, create/edit | 450 |
| `src/components/business/Sidebar/hooks/useCreateDatabase.ts` | Create database dialog state, MySQL charset/collation, validation | 350 |
| `src/components/business/Sidebar/hooks/useImportExport.ts` | SQL import, database export, table export flows | 350 |
| `src/components/business/Sidebar/connection-list/CreateDatabaseDialog.tsx` | Create database dialog JSX | 350 |
| `src/components/business/Sidebar/connection-list/ExportDialogs.tsx` | Database + table export dialog JSX | 200 |
| `src/components/business/Sidebar/connection-list/ImportConfirmDialog.tsx` | Import confirmation dialog JSX | 60 |

### Modified Files
| File | Change |
|------|--------|
| `src/components/business/Sidebar/ConnectionList.tsx` | Remove extracted code, import hooks/components, reduce to ~1,500 lines |

### Shared Types File
| File | Purpose |
|------|---------|
| `src/components/business/Sidebar/connection-list/types.ts` | Shared interfaces (Connection, DatabaseInfo, TableInfo, RoutineInfo, SchemaInfo, CreateDatabaseForm, etc.) |

---

## Task 1: Create shared types file

**Files:**
- Create: `src/components/business/Sidebar/connection-list/types.ts`
- Modify: `src/components/business/Sidebar/ConnectionList.tsx`

- [ ] **Step 1: Create types.ts with all shared interfaces**

Extract interfaces from ConnectionList.tsx lines 117-275 into a shared types file.

```typescript
// src/components/business/Sidebar/connection-list/types.ts
import type { ReactNode } from "react";
import type {
  ConnectionForm,
  Driver,
  RedisConnectionMode,
  RoutineType,
} from "@/services/api";
import type { DatabaseGroupConfig } from "@/lib/tree-adapters/types";

export interface Column {
  name: string;
  type: string;
  isPrimaryKey?: boolean;
  nullable?: boolean;
}

export interface TableInfo {
  name: string;
  schema: string;
  columns: Column[];
  isSystem?: boolean;
  indexStatus?: string | null;
  type?: string;
}

export interface RoutineInfo {
  name: string;
  schema: string;
  type: RoutineType;
}

export interface SchemaInfo {
  name: string;
  tables: TableInfo[];
  procedures: RoutineInfo[];
  functions: RoutineInfo[];
}

export interface DatabaseInfo {
  name: string;
  schemas: SchemaInfo[];
  tables: TableInfo[];
  routines: RoutineInfo[];
  redisCursor?: string;
  redisIsPartial?: boolean;
  redisRequiresPattern?: boolean;
  redisKeyCount?: number;
}

export type DatabaseExportFormat = "sql_dml" | "sql_ddl" | "sql_full";
export type TableExportFormat = "csv" | "json" | "sql_dml" | "sql_ddl" | "sql_full";

export interface Connection {
  id: string;
  name: string;
  type: Driver;
  host: string;
  port: string;
  database?: string;
  username: string;
  ssl?: boolean;
  sslMode?: "require" | "verify_ca";
  sslCaCert?: string;
  filePath?: string;
  sshEnabled?: boolean;
  sshHost?: string;
  sshPort?: number;
  sshUsername?: string;
  sshPassword?: string;
  sshKeyPath?: string;
  mode?: RedisConnectionMode;
  seedNodes?: string[];
  sentinels?: string[];
  connectTimeoutMs?: number;
  serviceName?: string;
  sentinelPassword?: string;
  authMode?: "none" | "basic" | "api_key";
  apiKeyId?: string;
  apiKeySecret?: string;
  apiKeyEncoded?: string;
  cloudId?: string;
  authSource?: string;
  databases: DatabaseInfo[];
  isConnected: boolean;
  connectState: "idle" | "connecting" | "success" | "error";
  connectError?: string;
}

export interface CreateDatabaseForm {
  name: string;
  ifNotExists: boolean;
  charset: string;
  collation: string;
  encoding: string;
  lcCollate: string;
  lcCtype: string;
}

export type SelectedTableNode = {
  key: string;
  connectionId: number;
  database: string;
  table: string;
  schema: string;
};

export interface DatasourceTreeAdapter {
  supportsSchemaNode: boolean;
  isDatabaseExpandable: boolean;
  listDatabases: () => Promise<string[]>;
  loadDatabaseChildren: (databaseName: string) => Promise<TableInfo[]>;
  shouldSkipTableColumns: boolean;
  getItemIcon: () => ReactNode;
  onItemActivate: (database: DatabaseInfo, table: TableInfo) => void;
  getDatabaseRowActions: (database: DatabaseInfo) => ReactNode | undefined;
  onDatabaseDoubleClick?: (database: DatabaseInfo) => void;
  renderDatabaseFooter: (database: DatabaseInfo, level: number) => ReactNode;
  renderTableContextMenu: (
    database: DatabaseInfo,
    table: TableInfo,
  ) => ReactNode;
  renderDatabaseContextMenu?: (databaseName: string) => ReactNode;
  databaseGroups?: DatabaseGroupConfig[];
}
```

- [ ] **Step 2: Update ConnectionList.tsx to import from types.ts**

Replace the interface definitions in ConnectionList.tsx (lines 117-275) with imports from `./connection-list/types`. Keep `groupSqlObjectsBySchema` function and the constants (`defaultCreateDatabaseForm`, `createDbNoneOption`, `postgresEncodingOptions`, etc.) in ConnectionList.tsx for now — they'll move in later tasks.

```typescript
// Replace the interface block in ConnectionList.tsx with:
import type {
  Column,
  TableInfo,
  RoutineInfo,
  SchemaInfo,
  DatabaseInfo,
  DatabaseExportFormat,
  TableExportFormat,
  Connection,
  CreateDatabaseForm,
  SelectedTableNode,
  DatasourceTreeAdapter,
} from "./connection-list/types";
```

- [ ] **Step 3: Verify**

Run: `npm run typecheck && npm run lint`
Expected: Both pass with no errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/business/Sidebar/connection-list/types.ts src/components/business/Sidebar/ConnectionList.tsx
git commit -m "refactor: extract shared types from ConnectionList to types.ts"
```

---

## Task 2: Extract useTreeExpansion hook

**Files:**
- Create: `src/components/business/Sidebar/hooks/useTreeExpansion.ts`
- Modify: `src/components/business/Sidebar/ConnectionList.tsx`

- [ ] **Step 1: Create useTreeExpansion.ts**

Extract from ConnectionList.tsx: `expandedConnections` (line 608), `expandedDatabases` (line 611), `expandedDatabaseGroups` (line 620), `expandedQueryGroups` (line 623), `expandedSchemas` (line 626), `expandedGroupNodes` (line 629), `expandedTables` (line 647), `connectionsRef` (line 616), `expandedDatabasesRef` (line 618), and all toggle functions (`toggleConnection` line 1119, `toggleDatabase` line 2197, `toggleQueryGroup` line 2231, `toggleDatabaseGroup` line 2243, `toggleSchema` line 2255, `toggleGroupNode` line 2267, `toggleTable` line 2385).

```typescript
// src/components/business/Sidebar/hooks/useTreeExpansion.ts
import { useRef, useState } from "react";
import type { Connection } from "../connection-list/types";
import { supportsSchemaBrowsing } from "@/lib/driver-registry";

export function useTreeExpansion() {
  const [expandedConnections, setExpandedConnections] = useState<Set<string>>(
    new Set(),
  );
  const [expandedDatabases, setExpandedDatabases] = useState<Set<string>>(
    new Set(),
  );
  const connectionsRef = useRef<Connection[]>([]);
  const expandedDatabasesRef = useRef<Set<string>>(new Set());
  const [expandedDatabaseGroups, setExpandedDatabaseGroups] = useState<
    Set<string>
  >(new Set());
  const [expandedQueryGroups, setExpandedQueryGroups] = useState<Set<string>>(
    new Set(),
  );
  const [expandedSchemas, setExpandedSchemas] = useState<Set<string>>(
    new Set(),
  );
  const [expandedGroupNodes, setExpandedGroupNodes] = useState<Set<string>>(
    new Set(),
  );
  const [expandedTables, setExpandedTables] = useState<Set<string>>(new Set());

  const toggleConnection = (id: string, connections: Connection[]) => {
    const connection = connections.find((conn) => conn.id === id);
    if (!connection) return;
    if (connection.connectState !== "success") return;
    setExpandedConnections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleDatabase = (
    key: string,
    onNeedsLoading: (connId: string, dbName: string, key: string) => void,
  ) => {
    setExpandedDatabases((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
        const [connId, ...dbNameParts] = key.split("-");
        const dbName = dbNameParts.join("-");
        onNeedsLoading(connId, dbName, key);
      }
      return next;
    });
  };

  const toggleQueryGroup = (key: string) => {
    setExpandedQueryGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleDatabaseGroup = (key: string) => {
    setExpandedDatabaseGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleSchema = (schemaKey: string) => {
    setExpandedSchemas((prev) => {
      const next = new Set(prev);
      if (next.has(schemaKey)) next.delete(schemaKey);
      else next.add(schemaKey);
      return next;
    });
  };

  const toggleGroupNode = (groupKey: string) => {
    setExpandedGroupNodes((prev) => {
      const next = new Set(prev);
      if (next.has(groupKey)) next.delete(groupKey);
      else next.add(groupKey);
      return next;
    });
  };

  const toggleTable = (tableKey: string) => {
    setExpandedTables((prev) => {
      const next = new Set(prev);
      if (next.has(tableKey)) next.delete(tableKey);
      else next.add(tableKey);
      return next;
    });
  };

  return {
    expandedConnections,
    setExpandedConnections,
    expandedDatabases,
    setExpandedDatabases,
    expandedDatabaseGroups,
    expandedQueryGroups,
    expandedSchemas,
    expandedGroupNodes,
    expandedTables,
    connectionsRef,
    expandedDatabasesRef,
    toggleConnection,
    toggleDatabase,
    toggleQueryGroup,
    toggleDatabaseGroup,
    toggleSchema,
    toggleGroupNode,
    toggleTable,
  };
}
```

- [ ] **Step 2: Update ConnectionList.tsx**

Remove the extracted state declarations and toggle functions. Import and call `useTreeExpansion()`. The `toggleDatabase` signature changed — it now takes a callback `onNeedsLoading` instead of directly calling `fetchAndSetTables`. Pass the loading logic as the callback in ConnectionList.

- [ ] **Step 3: Verify**

Run: `npm run typecheck && npm run lint`
Expected: Both pass.

- [ ] **Step 4: Commit**

```bash
git add src/components/business/Sidebar/hooks/useTreeExpansion.ts src/components/business/Sidebar/ConnectionList.tsx
git commit -m "refactor: extract useTreeExpansion hook from ConnectionList"
```

---

## Task 3: Extract useRedisKeys hook

**Files:**
- Create: `src/components/business/Sidebar/hooks/useRedisKeys.ts`
- Modify: `src/components/business/Sidebar/ConnectionList.tsx`

- [ ] **Step 1: Create useRedisKeys.ts**

Extract from ConnectionList.tsx: `loadRedisKeysPage` (line 1280, useCallback) and the `redisKeyToTableInfo` helper.

```typescript
// src/components/business/Sidebar/hooks/useRedisKeys.ts
import { useCallback } from "react";
import { api } from "@/services/api";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import type { TableInfo, Connection } from "../connection-list/types";
import { isRedisClusterDatabaseList } from "@/components/business/Redis/redis-utils";

export function useRedisKeys() {
  const { t } = useTranslation();

  const redisKeyToTableInfo = (key: string): TableInfo => ({
    name: key,
    schema: "",
    columns: [],
    type: "redis_key",
  });

  const loadRedisKeysPage = useCallback(
    async (
      connectionId: string,
      databaseName: string,
      cursor: number,
      append: boolean,
      pattern?: string,
      connections?: Connection[],
      setConnections?: (fn: (prev: Connection[]) => Connection[]) => void,
    ) => {
      // ... full implementation from lines 1280-1357
    },
    [t],
  );

  return { loadRedisKeysPage, redisKeyToTableInfo };
}
```

Note: The full implementation must include the cursor-based scan, cluster detection, and state update logic from lines 1280-1357.

- [ ] **Step 2: Update ConnectionList.tsx**

Remove `loadRedisKeysPage` useCallback and `redisKeyToTableInfo`. Import from `useRedisKeys`.

- [ ] **Step 3: Verify**

Run: `npm run typecheck && npm run lint`

- [ ] **Step 4: Commit**

```bash
git add src/components/business/Sidebar/hooks/useRedisKeys.ts src/components/business/Sidebar/ConnectionList.tsx
git commit -m "refactor: extract useRedisKeys hook from ConnectionList"
```

---

## Task 4: Extract useConnectionCrud hook

**Files:**
- Create: `src/components/business/Sidebar/hooks/useConnectionCrud.ts`
- Modify: `src/components/business/Sidebar/ConnectionList.tsx`

- [ ] **Step 1: Create useConnectionCrud.ts**

Extract from ConnectionList.tsx: `connections` state (line 607), `isLoadingConnections` (line 712), `isDeleting` (line 683), `deleteTargetConnectionId` (line 686), `fetchConnections` (line 1047), `connectConnection` (line 1197), `fetchAndSetDatabases` (line 1133), `clearConnectionTreeCache` (line 2466), `handleReconnect` (line 2689), `buildDuplicateConnectionName` (line 2693), `handleDuplicateConnection` (line 2704), `handleDeleteConnection` (line 2729), `mapSavedConnection` (line 465).

```typescript
// src/components/business/Sidebar/hooks/useConnectionCrud.ts
import { useState } from "react";
import { api } from "@/services/api";
import type { SavedConnection } from "@/services/api";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import type { Connection, DatabaseInfo } from "../connection-list/types";
import { mergeConnections } from "../connection-list/helpers";

export function useConnectionCrud() {
  const { t } = useTranslation();
  const [connections, setConnections] = useState<Connection[]>([]);
  const [isLoadingConnections, setIsLoadingConnections] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteTargetConnectionId, setDeleteTargetConnectionId] = useState<
    string | null
  >(null);

  // ... all CRUD functions

  return {
    connections,
    setConnections,
    isLoadingConnections,
    isDeleting,
    setIsDeleting,
    deleteTargetConnectionId,
    setDeleteTargetConnectionId,
    fetchConnections,
    connectConnection,
    fetchAndSetDatabases,
    clearConnectionTreeCache,
    handleReconnect,
    handleDuplicateConnection,
    handleDeleteConnection,
    buildDuplicateConnectionName,
  };
}
```

- [ ] **Step 2: Update ConnectionList.tsx**

Remove extracted state and functions. Import and call `useConnectionCrud()`.

- [ ] **Step 3: Verify**

Run: `npm run typecheck && npm run lint`

- [ ] **Step 4: Commit**

```bash
git add src/components/business/Sidebar/hooks/useConnectionCrud.ts src/components/business/Sidebar/ConnectionList.tsx
git commit -m "refactor: extract useConnectionCrud hook from ConnectionList"
```

---

## Task 5: Extract useTreeDataFetching hook

**Files:**
- Create: `src/components/business/Sidebar/hooks/useTreeDataFetching.ts`
- Modify: `src/components/business/Sidebar/ConnectionList.tsx`

- [ ] **Step 1: Create useTreeDataFetching.ts**

Extract from ConnectionList.tsx: `loadingDatabaseKeys` (line 671), `loadingTableKeys` (line 674), `databaseEvents` (line 632), `databaseSequences` (line 635), `databaseTypes` (line 638), `databaseSynonyms` (line 641), `databasePackages` (line 644), `fetchSqlTablesAsTableInfo` (line 1359), `fetchSqlRoutinesAsRoutineInfo` (line 1375), `fetchEvents` (line 1400), `fetchSequences` (line 1412), `fetchTypes` (line 1424), `fetchSynonyms` (line 1436), `fetchPackages` (line 1448), `fetchAndSetTables` (line 1867), `fetchAndSetTableColumns` (line 2321), `handleRefreshDatabaseTables` (line 2142).

The hook takes `expansion` state from `useTreeExpansion` and `connections`/`setConnections` from `useConnectionCrud` as parameters.

```typescript
// src/components/business/Sidebar/hooks/useTreeDataFetching.ts
export function useTreeDataFetching(params: {
  connections: Connection[];
  setConnections: (fn: (prev: Connection[]) => Connection[]) => void;
  expandedDatabases: Set<string>;
  expandedDatabasesRef: React.MutableRefObject<Set<string>>;
  expandedTables: Set<string>;
  setExpandedTables: (fn: (prev: Set<string>) => Set<string>) => void;
  setExpandedSchemas: (fn: (prev: Set<string>) => Set<string>) => void;
}) {
  // ... all state + fetch functions
}
```

- [ ] **Step 2: Update ConnectionList.tsx**

Remove extracted state and functions. Import and call `useTreeDataFetching()`.

- [ ] **Step 3: Verify**

Run: `npm run typecheck && npm run lint`

- [ ] **Step 4: Commit**

```bash
git add src/components/business/Sidebar/hooks/useTreeDataFetching.ts src/components/business/Sidebar/ConnectionList.tsx
git commit -m "refactor: extract useTreeDataFetching hook from ConnectionList"
```

---

## Task 6: Extract useConnectionForm hook

**Files:**
- Create: `src/components/business/Sidebar/hooks/useConnectionForm.ts`
- Modify: `src/components/business/Sidebar/ConnectionList.tsx`

- [ ] **Step 1: Create useConnectionForm.ts**

Extract from ConnectionList.tsx: `isDialogOpen` (line 664), `isImportDialogOpen` (line 665), `dialogMode` (line 666), `createStep` (line 667), `editingConnectionId` (line 668), `isTesting` (line 680), `isConnecting` (line 681), `isSavingEdit` (line 682), `testMsg` (line 714), `validationMsg` (line 719), `form` (line 720), `normalizedForm` (line 946), `validationIssues` (line 950), `requiredOk` (line 958), `validateSslSettings` (line 962), `pickSingleFile` (line 980), `handlePickSslCaCertFile` (line 1006), `handlePickSshKeyFile` (line 1028), `handlePickDatabaseFile` (line 1066), `handleTestConnection` (line 2549), `handleConnect` (line 2577), `handleSaveEdit` (line 2606), `handleDialogSubmit` (line 2635), `resetConnectionDialogFeedback` (line 2644), `closeConnectionDialog` (line 2649), `openCreateDialog` (line 2658), `openEditDialog` (line 2667), `handleCreateDriverSelect` (line 2679).

Also extract constants: `defaultCreateDatabaseForm` (line 277), `buildFormFromConnection` (line 399).

```typescript
// src/components/business/Sidebar/hooks/useConnectionForm.ts
export function useConnectionForm(params: {
  onConnectionCreated: (conn: SavedConnection) => void;
  onConnectionUpdated: (conn: SavedConnection) => void;
}) {
  // ... all state + form functions
}
```

- [ ] **Step 2: Update ConnectionList.tsx**

Remove extracted state and functions. Import and call `useConnectionForm()`.

- [ ] **Step 3: Verify**

Run: `npm run typecheck && npm run lint`

- [ ] **Step 4: Commit**

```bash
git add src/components/business/Sidebar/hooks/useConnectionForm.ts src/components/business/Sidebar/ConnectionList.tsx
git commit -m "refactor: extract useConnectionForm hook from ConnectionList"
```

---

## Task 7: Extract useCreateDatabase hook

**Files:**
- Create: `src/components/business/Sidebar/hooks/useCreateDatabase.ts`
- Modify: `src/components/business/Sidebar/ConnectionList.tsx`

- [ ] **Step 1: Create useCreateDatabase.ts**

Extract from ConnectionList.tsx: `createDbConnectionId` (line 689), `isCreateDbDialogOpen` (line 692), `showCreateDbAdvanced` (line 693), `createDbValidationMsg` (line 694), `createDbForm` (line 697), `mysqlCharsets` (line 709), `mysqlCollations` (line 710), `loadingMysqlOptions` (line 711), `isCreatingDatabase` (line 684), `createDbTargetConnection` (line 766), `openCreateDatabaseDialog` (line 2454), `handleCreateDatabase` (line 2486), and the constants `createDbNoneOption`, `postgresEncodingOptions`, `postgresLocaleOptions`, `mssqlCollationOptions`, `defaultCreateDatabaseForm`.

Also extract the MySQL charset/collation fetching effects.

- [ ] **Step 2: Update ConnectionList.tsx**

Remove extracted state, effects, and functions. Import and call `useCreateDatabase(connections)`.

- [ ] **Step 3: Verify**

Run: `npm run typecheck && npm run lint`

- [ ] **Step 4: Commit**

```bash
git add src/components/business/Sidebar/hooks/useCreateDatabase.ts src/components/business/Sidebar/ConnectionList.tsx
git commit -m "refactor: extract useCreateDatabase hook from ConnectionList"
```

---

## Task 8: Extract useImportExport hook

**Files:**
- Create: `src/components/business/Sidebar/hooks/useImportExport.ts`
- Modify: `src/components/business/Sidebar/ConnectionList.tsx`

- [ ] **Step 1: Create useImportExport.ts**

Extract from ConnectionList.tsx: `pendingImport` (line 727), `isImportConfirmOpen` (line 733), `isImportingSql` (line 685), `pendingDatabaseExport` (line 734), `isExportingDatabaseSql` (line 742), `pendingTableExport` (line 743), `isTableExportDialogOpen` (line 748), `isExportingTable` (line 749), `tableExportFormat` (line 752 — infer from context), `handleDatabaseImport` (line 2818), `handleConfirmImport` (line 2920), `handleDatabaseExport` (line 2856), `handleConfirmDatabaseExport` (line 2875), `handleTableExportDialog` (line 2768), `handleTableExportConfirm` (line 2783).

- [ ] **Step 2: Update ConnectionList.tsx**

Remove extracted state and functions. Import and call `useImportExport(connections)`.

- [ ] **Step 3: Verify**

Run: `npm run typecheck && npm run lint`

- [ ] **Step 4: Commit**

```bash
git add src/components/business/Sidebar/hooks/useImportExport.ts src/components/business/Sidebar/ConnectionList.tsx
git commit -m "refactor: extract useImportExport hook from ConnectionList"
```

---

## Task 9: Extract CreateDatabaseDialog component

**Files:**
- Create: `src/components/business/Sidebar/connection-list/CreateDatabaseDialog.tsx`
- Modify: `src/components/business/Sidebar/ConnectionList.tsx`

- [ ] **Step 1: Create CreateDatabaseDialog.tsx**

Extract the create database dialog JSX from ConnectionList.tsx (lines ~3809-4115). The component receives props from the `useCreateDatabase` hook return value.

```typescript
// src/components/business/Sidebar/connection-list/CreateDatabaseDialog.tsx
import type { CreateDatabaseForm, Connection } from "./types";

interface CreateDatabaseDialogProps {
  isOpen: boolean;
  onClose: () => void;
  connectionId: string | null;
  connections: Connection[];
  form: CreateDatabaseForm;
  setForm: (fn: (prev: CreateDatabaseForm) => CreateDatabaseForm) => void;
  showAdvanced: boolean;
  setShowAdvanced: (v: boolean) => void;
  validationMsg: string | null;
  isCreating: boolean;
  mysqlCharsets: string[];
  mysqlCollations: string[];
  loadingMysqlOptions: boolean;
  targetConnection: Connection | undefined;
  onCreate: () => void;
  onSuccess: () => void;
}

export function CreateDatabaseDialog(props: CreateDatabaseDialogProps) {
  // ... JSX from lines 3809-4115
}
```

- [ ] **Step 2: Update ConnectionList.tsx**

Replace the inline create database dialog JSX with `<CreateDatabaseDialog {...props} />`.

- [ ] **Step 3: Verify**

Run: `npm run typecheck && npm run lint`

- [ ] **Step 4: Commit**

```bash
git add src/components/business/Sidebar/connection-list/CreateDatabaseDialog.tsx src/components/business/Sidebar/ConnectionList.tsx
git commit -m "refactor: extract CreateDatabaseDialog component from ConnectionList"
```

---

## Task 10: Extract ExportDialogs and ImportConfirmDialog components

**Files:**
- Create: `src/components/business/Sidebar/connection-list/ExportDialogs.tsx`
- Create: `src/components/business/Sidebar/connection-list/ImportConfirmDialog.tsx`
- Modify: `src/components/business/Sidebar/ConnectionList.tsx`

- [ ] **Step 1: Create ExportDialogs.tsx**

Extract the table export dialog (lines ~4198-4314) and database export dialog (lines ~4315-4414) into a single file with two exported components.

- [ ] **Step 2: Create ImportConfirmDialog.tsx**

Extract the import confirmation AlertDialog (lines ~4152-4197).

- [ ] **Step 3: Update ConnectionList.tsx**

Replace inline dialog JSX with imported components.

- [ ] **Step 4: Verify**

Run: `npm run typecheck && npm run lint`

- [ ] **Step 5: Commit**

```bash
git add src/components/business/Sidebar/connection-list/ExportDialogs.tsx src/components/business/Sidebar/connection-list/ImportConfirmDialog.tsx src/components/business/Sidebar/ConnectionList.tsx
git commit -m "refactor: extract ExportDialogs and ImportConfirmDialog from ConnectionList"
```

---

## Task 11: Clean up and verify final ConnectionList.tsx

**Files:**
- Modify: `src/components/business/Sidebar/ConnectionList.tsx`

- [ ] **Step 1: Remove unused imports**

Check ConnectionList.tsx for any imports that are no longer needed after the extraction.

- [ ] **Step 2: Verify line count**

Run: `wc -l src/components/business/Sidebar/ConnectionList.tsx`
Expected: ~1,500 lines (down from 4,417).

- [ ] **Step 3: Full verification**

Run: `npm run typecheck && npm run lint`
Expected: Both pass.

- [ ] **Step 4: Commit**

```bash
git add src/components/business/Sidebar/ConnectionList.tsx
git commit -m "refactor: clean up ConnectionList imports after hook extraction"
```

---

## Task 12: Final smoke test

- [ ] **Step 1: Run the app**

Run: `npm run dev`
Verify the app starts without errors.

- [ ] **Step 2: Verify typecheck and lint one final time**

Run: `npm run typecheck && npm run lint`

- [ ] **Step 3: Final commit with all files**

```bash
git add -A
git commit -m "refactor: complete ConnectionList.tsx decomposition into hooks and components"
```
