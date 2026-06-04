# ConnectionList.tsx Split Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split ConnectionList.tsx (1,998 lines) by extracting `getDatasourceTreeAdapter`, inline context menu, and dialogs into separate files.

**Architecture:** Pure refactor — no behavior changes. Extract 3 independent units into `connection-list/` subdirectory, update imports in ConnectionList.tsx.

**Tech Stack:** React, TypeScript, existing `connection-list/` pattern

---

### Task 1: Extract getDatasourceTreeAdapter.ts

**Files:**
- Create: `src/components/business/Sidebar/connection-list/getDatasourceTreeAdapter.ts`
- Modify: `src/components/business/Sidebar/ConnectionList.tsx`

- [ ] **Step 1: Create the new file with the function**

Read `ConnectionList.tsx` lines 634-990 (the `getDatasourceTreeAdapter` function). Create `connection-list/getDatasourceTreeAdapter.ts` with:

```ts
import type { ReactNode } from "react";
import type { Connection, DatabaseInfo, TableInfo, DatasourceTreeAdapter } from "./types";
import type { TreeCallbacks } from "@/lib/tree-adapters/types.tsx";
import type { ElasticsearchIndexAction } from "@/components/business/Elasticsearch/elasticsearch-index-management";

export interface GetDatasourceTreeAdapterDeps {
  onTableSelect: (
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
  ) => Promise<void>;
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
}

export function getDatasourceTreeAdapter(params: {
  connection: Connection;
  treeCallbacks?: TreeCallbacks;
  deps: GetDatasourceTreeAdapterDeps;
}): DatasourceTreeAdapter {
  // Copy the entire function body from ConnectionList.tsx lines 634-990
  // Replace direct references to state/props with params.deps.*
  // Example: onTableSelect → params.deps.onTableSelect
  // Example: treeCallbacks → params.treeCallbacks
  // Example: connection → params.connection
}
```

- [ ] **Step 2: Copy function body from ConnectionList.tsx**

Copy lines 634-990 of ConnectionList.tsx into the new function. Adjust references:
- `connection` → `params.connection`
- `treeCallbacks` → `params.treeCallbacks`
- `onTableSelect` → `params.deps.onTableSelect`
- `loadRedisKeysPage` → `params.deps.loadRedisKeysPage`
- `handleRefreshDatabaseTables` → `params.deps.handleRefreshDatabaseTables`
- `openCreateElasticsearchIndexDialog` → `params.deps.openCreateElasticsearchIndexDialog`
- `handleElasticsearchIndexAction` → `params.deps.handleElasticsearchIndexAction`
- `handleOpenERDiagram` → `params.deps.handleOpenERDiagram`
- `showElasticsearchSystemIndices` → `params.deps.showElasticsearchSystemIndices`
- `showMongoSystemCollections` → `params.deps.showMongoSystemCollections`
- `searchTerm` → `params.deps.searchTerm`
- `t` → `params.deps.t`

- [ ] **Step 3: Update ConnectionList.tsx to import and use the new function**

In ConnectionList.tsx:
1. Add import: `import { getDatasourceTreeAdapter } from "./connection-list/getDatasourceTreeAdapter";`
2. Replace the inline `getDatasourceTreeAdapter` function (lines 634-990) with a call to the imported function, passing the required params.
3. The call site should wrap connections in a callback:

```ts
const getAdapter = useCallback(
  (connection: Connection) => getDatasourceTreeAdapter({
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
  ],
);
```

4. Replace all `getDatasourceTreeAdapter(connection)` calls with `getAdapter(connection)`.

- [ ] **Step 4: Verify**

Run: `npm run typecheck && npm run lint`
Expected: PASS

---

### Task 2: Extract InlineContextMenu.tsx

**Files:**
- Create: `src/components/business/Sidebar/connection-list/InlineContextMenu.tsx`
- Modify: `src/components/business/Sidebar/ConnectionList.tsx`

- [ ] **Step 1: Create the component file**

Read `ConnectionList.tsx` lines 1634-1878 (the inline context menu JSX). Create `connection-list/InlineContextMenu.tsx`:

```tsx
import {
  Edit3,
  Copy,
  Plus,
  RefreshCw,
  Trash2,
  FileCode,
  Download,
  Upload,
} from "lucide-react";
import type { Connection, DatabaseInfo } from "./types";
import type { ImportDriverCapability } from "@/services/api";
import { getImportDriverCapability } from "@/services/api";
import { useTranslation } from "react-i18next";

export interface ContextMenuState {
  visible: boolean;
  x: number;
  y: number;
  connectionId: string | null;
  databaseName?: string | null;
  schemaName?: string | null;
  type: "connection" | "database" | "schema";
}

interface InlineContextMenuProps {
  contextMenu: ContextMenuState;
  onClose: () => void;
  connections: Connection[];
  onEdit: (connectionId: string) => void;
  onDuplicate: (connectionId: string) => void;
  onReconnect: (connectionId: string) => void;
  onDelete: (connectionId: string) => void;
  onCreateQuery: (connectionId: string, databaseName?: string) => void;
  onCreateDatabase: (connectionId: string) => void;
  supportsCreateDatabase: (driver: string) => boolean;
  onRefreshTables: (connectionId: string, databaseName: string) => void;
  onImportSql: (connectionId: string, databaseName: string) => void;
  onExportDatabase: (connectionId: string, databaseName: string) => void;
  onCreateTable: (connectionId: string, databaseName: string, schemaName: string) => void;
  renderDatabaseContextMenu?: (databaseName: string) => React.ReactNode;
}

export function InlineContextMenu({
  contextMenu,
  onClose,
  connections,
  onEdit,
  onDuplicate,
  onReconnect,
  onDelete,
  onCreateQuery,
  onCreateDatabase,
  supportsCreateDatabase,
  onRefreshTables,
  onImportSql,
  onExportDatabase,
  onCreateTable,
  renderDatabaseContextMenu,
}: InlineContextMenuProps) {
  const { t } = useTranslation();
  
  if (!contextMenu.visible) return null;

  const contextMenuConnection = contextMenu.connectionId
    ? connections.find((conn) => conn.id === contextMenu.connectionId)
    : null;

  return (
    <div
      className="fixed z-50 min-w-[140px] bg-popover border border-border rounded-md shadow-lg py-1"
      style={{ left: contextMenu.x, top: contextMenu.y }}
    >
      {/* Copy the JSX from ConnectionList.tsx lines 1639-1878 */}
      {/* Replace direct function calls with props */}
      {/* Example: openEditDialog(id) → onEdit(id) */}
      {/* Example: handleDuplicateConnection(id) → onDuplicate(id) */}
    </div>
  );
}
```

- [ ] **Step 2: Copy JSX body from ConnectionList.tsx**

Copy the JSX from lines 1639-1878 into the component. Adjust:
- `openEditDialog(contextMenu.connectionId)` → `onEdit(contextMenu.connectionId!)`
- `handleDuplicateConnection(contextMenu.connectionId)` → `onDuplicate(contextMenu.connectionId!)`
- `handleReconnect(contextMenu.connectionId)` → `onReconnect(contextMenu.connectionId!)`
- `setDeleteTargetConnectionId(contextMenu.connectionId)` → `onDelete(contextMenu.connectionId!)`
- `handleCreateQueryFromContext(...)` → `onCreateQuery(...)`
- `openCreateDatabaseDialog(contextMenuConnection.id)` → `onCreateDatabase(contextMenuConnection.id)`
- `handleRefreshDatabaseTables(...)` → `onRefreshTables(...)`
- `handleDatabaseImport(...)` → `onImportSql(...)`
- `handleDatabaseExport(connection, database)` → `onExportDatabase(contextMenu.connectionId!, contextMenu.databaseName!)`
- `onCreateTable(...)` → `onCreateTable(...)`
- `setContextMenu((prev) => ({ ...prev, visible: false }))` → `onClose()`

- [ ] **Step 3: Update ConnectionList.tsx**

1. Add import: `import { InlineContextMenu, type ContextMenuState } from "./connection-list/InlineContextMenu";`
2. Remove the inline context menu JSX (lines 1634-1878).
3. Replace with:

```tsx
<InlineContextMenu
  contextMenu={contextMenu}
  onClose={() => setContextMenu((prev) => ({ ...prev, visible: false }))}
  connections={connections}
  onEdit={(id) => openEditDialog(id)}
  onDuplicate={handleDuplicateConnection}
  onReconnect={handleReconnect}
  onDelete={(id) => setDeleteTargetConnectionId(id)}
  onCreateQuery={handleCreateQueryFromContext}
  onCreateDatabase={(id) => openCreateDatabaseDialog(id)}
  supportsCreateDatabase={supportsCreateDatabaseForDriver}
  onRefreshTables={handleRefreshDatabaseTables}
  onImportSql={handleDatabaseImport}
  onExportDatabase={(connId, dbName) => {
    const conn = connections.find((c) => c.id === connId);
    const db = conn?.databases.find((d) => d.name === dbName);
    if (conn && db) void handleDatabaseExport(conn, db);
  }}
  onCreateTable={(connId, dbName, schema) => {
    if (onCreateTable) onCreateTable(Number(connId), dbName, schema, connections.find(c => c.id === connId)?.type || "postgres");
  }}
  renderDatabaseContextMenu={contextMenuDatabaseAdapter?.renderDatabaseContextMenu}
/>
```

- [ ] **Step 4: Verify**

Run: `npm run typecheck && npm run lint`
Expected: PASS

---

### Task 3: Extract ConnectionDialogs.tsx

**Files:**
- Create: `src/components/business/Sidebar/connection-list/ConnectionDialogs.tsx`
- Modify: `src/components/business/Sidebar/ConnectionList.tsx`

- [ ] **Step 1: Create the component file**

Read `ConnectionList.tsx` lines 1880-1995. Create `connection-list/ConnectionDialogs.tsx`:

```tsx
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { CreateElasticsearchIndexDialog } from "@/components/business/Elasticsearch/CreateElasticsearchIndexDialog";
import { CreateDatabaseDialog } from "./CreateDatabaseDialog";
import { ImportConfirmDialog } from "./ImportConfirmDialog";
import { TableExportDialog, DatabaseExportDialog } from "./ExportDialogs";
import type { CreateDatabaseForm, DatabaseExportFormat } from "./types";
import type { TransferFormat } from "@/services/api";
import { useTranslation } from "react-i18next";

interface ConnectionDialogsProps {
  // ES index
  isCreateEsIndexDialogOpen: boolean;
  createEsIndexConnectionId: string | null;
  onCreateEsIndexOpenChange: (open: boolean) => void;
  onEsIndexCreated: () => Promise<void>;
  // Create database
  isCreateDbDialogOpen: boolean;
  onCreateDbClose: () => void;
  createDbForm: CreateDatabaseForm;
  setCreateDbForm: React.Dispatch<React.SetStateAction<CreateDatabaseForm>>;
  showCreateDbAdvanced: boolean;
  setShowCreateDbAdvanced: React.Dispatch<React.SetStateAction<boolean>>;
  createDbValidationMsg: string | null;
  isCreatingDatabase: boolean;
  mysqlCharsets: string[];
  mysqlCollations: string[];
  loadingMysqlOptions: boolean;
  isMySqlFamilyCreateDb: boolean;
  isPostgresCreateDb: boolean;
  isMssqlCreateDb: boolean;
  handleCreateDatabase: () => Promise<void>;
  // Delete connection
  deleteTargetConnectionId: string | null;
  onDeleteTargetChange: (id: string | null) => void;
  onDeleteConfirm: () => Promise<void>;
  isDeleting: boolean;
  // Import confirm
  isImportConfirmOpen: boolean;
  onImportConfirmOpenChange: (open: boolean) => void;
  onImportConfirm: () => Promise<void>;
  pendingImport: { databaseName: string; filePath: string } | null;
  setPendingImport: (val: null) => void;
  isImportingSql: boolean;
  // Table export
  isTableExportDialogOpen: boolean;
  onTableExportDialogClose: () => void;
  tableExportFormat: TransferFormat;
  setTableExportFormat: React.Dispatch<React.SetStateAction<TransferFormat>>;
  isExportingTable: boolean;
  onTableExportConfirm: () => Promise<void>;
  pendingTableExport: { table: { name: string } } | null;
  setPendingTableExport: (val: null) => void;
  // Database export
  isDatabaseExportDialogOpen: boolean;
  onDatabaseExportDialogClose: () => void;
  isExportingDatabaseSql: boolean;
  onDatabaseExportConfirm: () => Promise<void>;
  pendingDatabaseExport: { databaseName: string; format: DatabaseExportFormat } | null;
  setPendingDatabaseExport: React.Dispatch<React.SetStateAction<{ databaseName: string; format: DatabaseExportFormat } | null>>;
}

export function ConnectionDialogs(props: ConnectionDialogsProps) {
  const { t } = useTranslation();

  return (
    <>
      <CreateElasticsearchIndexDialog
        open={props.isCreateEsIndexDialogOpen}
        connectionId={props.createEsIndexConnectionId ? Number(props.createEsIndexConnectionId) : null}
        onOpenChange={props.onCreateEsIndexOpenChange}
        onCreated={props.onEsIndexCreated}
      />
      <CreateDatabaseDialog
        isOpen={props.isCreateDbDialogOpen}
        onClose={props.onCreateDbClose}
        form={props.createDbForm}
        setForm={props.setCreateDbForm}
        showAdvanced={props.showCreateDbAdvanced}
        setShowAdvanced={props.setShowCreateDbAdvanced}
        validationMsg={props.createDbValidationMsg}
        isCreating={props.isCreatingDatabase}
        mysqlCharsets={props.mysqlCharsets}
        mysqlCollations={props.mysqlCollations}
        loadingMysqlOptions={props.loadingMysqlOptions}
        isMySqlFamily={props.isMySqlFamilyCreateDb}
        isPostgres={props.isPostgresCreateDb}
        isMssql={props.isMssqlCreateDb}
        onCreate={props.handleCreateDatabase}
      />
      <AlertDialog
        open={!!props.deleteTargetConnectionId}
        onOpenChange={(open) => { if (!open) props.onDeleteTargetChange(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("connection.deleteDialog.title")}</AlertDialogTitle>
            <AlertDialogDescription>{t("connection.deleteDialog.description")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={props.isDeleting}>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              disabled={props.isDeleting || !props.deleteTargetConnectionId}
              onClick={async (e) => { e.preventDefault(); await props.onDeleteConfirm(); }}
            >
              {props.isDeleting ? t("connection.deleteDialog.deleting") : t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <ImportConfirmDialog
        isOpen={props.isImportConfirmOpen}
        isImporting={props.isImportingSql}
        databaseName={props.pendingImport?.databaseName}
        filePath={props.pendingImport?.filePath}
        onConfirm={props.onImportConfirm}
        onCancel={() => { props.onImportConfirmOpenChange(false); if (!props.isImportingSql) props.setPendingImport(null); }}
      />
      <TableExportDialog
        isOpen={props.isTableExportDialogOpen}
        onClose={() => { props.onTableExportDialogClose(); if (!props.isExportingTable) props.setPendingTableExport(null); }}
        format={props.tableExportFormat}
        setFormat={props.setTableExportFormat}
        isExporting={props.isExportingTable}
        onConfirm={props.onTableExportConfirm}
        tableName={props.pendingTableExport?.table.name}
      />
      <DatabaseExportDialog
        isOpen={props.isDatabaseExportDialogOpen}
        onClose={() => { props.onDatabaseExportDialogClose(); if (!props.isExportingDatabaseSql) props.setPendingDatabaseExport(null); }}
        isExporting={props.isExportingDatabaseSql}
        onConfirm={props.onDatabaseExportConfirm}
        databaseName={props.pendingDatabaseExport?.databaseName}
        format={props.pendingDatabaseExport?.format || "sql_full"}
        onFormatChange={(value: DatabaseExportFormat) => props.setPendingDatabaseExport((prev) => prev ? { ...prev, format: value } : prev)}
      />
    </>
  );
}
```

- [ ] **Step 2: Update ConnectionList.tsx**

1. Add import: `import { ConnectionDialogs } from "./connection-list/ConnectionDialogs";`
2. Remove the dialog JSX (lines 1880-1995).
3. Replace with:

```tsx
<ConnectionDialogs
  isCreateEsIndexDialogOpen={isCreateEsIndexDialogOpen}
  createEsIndexConnectionId={createEsIndexConnectionId}
  onCreateEsIndexOpenChange={(open) => {
    setIsCreateEsIndexDialogOpen(open);
    if (!open) setCreateEsIndexConnectionId(null);
  }}
  onEsIndexCreated={async () => {
    if (createEsIndexConnectionId) {
      await handleRefreshDatabaseTables(createEsIndexConnectionId, "Indices");
    }
  }}
  isCreateDbDialogOpen={isCreateDbDialogOpen}
  onCreateDbClose={closeCreateDbDialog}
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
  handleCreateDatabase={handleCreateDatabase}
  deleteTargetConnectionId={deleteTargetConnectionId}
  onDeleteTargetChange={setDeleteTargetConnectionId}
  onDeleteConfirm={() => handleDeleteConnection(deleteTargetConnectionId!)}
  isDeleting={isDeleting}
  isImportConfirmOpen={isImportConfirmOpen}
  onImportConfirmOpenChange={setIsImportConfirmOpen}
  onImportConfirm={handleConfirmImport}
  pendingImport={pendingImport}
  setPendingImport={setPendingImport}
  isImportingSql={isImportingSql}
  isTableExportDialogOpen={isTableExportDialogOpen}
  onTableExportDialogClose={() => setIsTableExportDialogOpen(false)}
  tableExportFormat={tableExportFormat}
  setTableExportFormat={setTableExportFormat}
  isExportingTable={isExportingTable}
  onTableExportConfirm={handleTableExportConfirm}
  pendingTableExport={pendingTableExport}
  setPendingTableExport={setPendingTableExport}
  isDatabaseExportDialogOpen={isDatabaseExportDialogOpen}
  onDatabaseExportDialogClose={() => setIsDatabaseExportDialogOpen(false)}
  isExportingDatabaseSql={isExportingDatabaseSql}
  onDatabaseExportConfirm={handleConfirmDatabaseExport}
  pendingDatabaseExport={pendingDatabaseExport}
  setPendingDatabaseExport={setPendingDatabaseExport}
/>
```

- [ ] **Step 3: Verify**

Run: `npm run typecheck && npm run lint`
Expected: PASS

---

### Task 4: Final verification

**Files:**
- None (verification only)

- [ ] **Step 1: Run full checks**

```bash
npm run typecheck && npm run lint
```

Expected: PASS

- [ ] **Step 2: Manual smoke test**

1. Open the app with `bun tauri dev`
2. Connect to a database
3. Expand tree nodes (connections, databases, tables)
4. Right-click on connection → verify menu works (edit, duplicate, delete, new query)
5. Right-click on database → verify menu works (refresh, import, export, new query, new table)
6. Right-click on table → verify menu works (new query, export, alter table)
7. Verify all dialogs open/close correctly (delete confirm, create database, import confirm, export)

- [ ] **Step 3: Verify line count reduction**

```bash
wc -l src/components/business/Sidebar/ConnectionList.tsx
```

Expected: ~1,350 lines (down from 1,998)
