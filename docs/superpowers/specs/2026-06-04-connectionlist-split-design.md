# ConnectionList.tsx Split Design

## Problem

`src/components/business/Sidebar/ConnectionList.tsx` is 1,998 lines. Previous refactoring already extracted 7 custom hooks, but the file still contains:

- `getDatasourceTreeAdapter` function (~350 lines) — creates tree adapter with callbacks
- Inline context menu JSX (~245 lines) — connection/database/schema right-click menus
- Dialog components (~115 lines) — delete confirm, import confirm, export dialogs, ES index dialog

## Scope

Extract 3 independent units from ConnectionList.tsx. No behavior changes.

## Target File Structure

```
src/components/business/Sidebar/connection-list/
├── ConnectionDialog.tsx           # Existing
├── CreateDatabaseDialog.tsx       # Existing
├── ExportDialogs.tsx              # Existing
├── ImportConfirmDialog.tsx        # Existing
├── TreeNode.tsx                   # Existing
├── TreeNodeRenderers.tsx          # Existing
├── helpers.tsx                    # Existing
├── types.ts                       # Existing
├── getDatasourceTreeAdapter.ts    # NEW
├── InlineContextMenu.tsx          # NEW
└── ConnectionDialogs.tsx          # NEW
```

## Extraction 1: getDatasourceTreeAdapter.ts

### Current

Defined inline in ConnectionList.tsx (lines 634-990). Creates a `DatasourceTreeAdapter` object with methods for listing databases, loading children, rendering context menus, etc. Uses closures over `connection`, `treeCallbacks`, and many handler functions.

### Target

`connection-list/getDatasourceTreeAdapter.ts` — pure function file.

### Signature

```ts
export function getDatasourceTreeAdapter(params: {
  connection: Connection;
  treeCallbacks?: TreeCallbacks;
  deps: {
    onTableSelect: (connection: string, database: string, table: string, connectionId: number, driver: string, schema?: string) => void;
    loadRedisKeysPage: (connectionId: string, databaseName: string, cursor: string, append: boolean) => Promise<void>;
    handleRefreshDatabaseTables: (connectionId: string, databaseName: string) => Promise<void>;
    openCreateElasticsearchIndexDialog: (connectionId: string, databaseName?: string) => void;
    handleElasticsearchIndexAction: (connectionId: string, databaseName: string, index: string, action: ElasticsearchIndexAction) => Promise<void>;
    handleOpenERDiagram: (connectionId: string, database: string) => void;
    showElasticsearchSystemIndices: boolean;
    showMongoSystemCollections: boolean;
    searchTerm: string;
    t: (key: string) => string;
  };
}): DatasourceTreeAdapter
```

### Usage in ConnectionList.tsx

```ts
const getAdapter = useCallback(
  (connection: Connection) => getDatasourceTreeAdapter({
    connection,
    treeCallbacks,
    deps: { onTableSelect, loadRedisKeysPage, ... },
  }),
  [treeCallbacks, onTableSelect, loadRedisKeysPage, ...]
);
```

### Lines saved: ~350

## Extraction 2: InlineContextMenu.tsx

### Current

ConnectionList.tsx lines 1634-1878. A fixed-position div that renders different button sets based on `contextMenu.type` (connection | database | schema).

### Target

`connection-list/InlineContextMenu.tsx`

### Props

```ts
interface InlineContextMenuProps {
  contextMenu: {
    visible: boolean;
    x: number;
    y: number;
    connectionId: string | null;
    databaseName?: string | null;
    schemaName?: string | null;
    type: "connection" | "database" | "schema";
  };
  onClose: () => void;
  connections: Connection[];
  // Connection-level actions
  onEdit: (connectionId: string) => void;
  onDuplicate: (connectionId: string) => void;
  onReconnect: (connectionId: string) => void;
  onDelete: (connectionId: string) => void;
  onCreateQuery: (connectionId: string, databaseName?: string) => void;
  onCreateDatabase: (connectionId: string) => void;
  supportsCreateDatabase: (driver: string) => boolean;
  // Database/schema-level actions
  onRefreshTables: (connectionId: string, databaseName: string) => void;
  onImportSql: (connectionId: string, databaseName: string) => void;
  onExportDatabase: (connectionId: string, databaseName: string) => void;
  onCreateTable: (connectionId: string, databaseName: string, schemaName: string) => void;
  getImportDriverCapability: (driver: string) => ImportDriverCapability;
  // Adapter-provided database context menu
  renderDatabaseContextMenu?: (databaseName: string) => React.ReactNode;
}
```

### Usage in ConnectionList.tsx

```tsx
<InlineContextMenu
  contextMenu={contextMenu}
  onClose={() => setContextMenu(prev => ({ ...prev, visible: false }))}
  connections={connections}
  onEdit={(id) => openEditDialog(id)}
  onDuplicate={handleDuplicateConnection}
  // ...
/>
```

### Lines saved: ~245

## Extraction 3: ConnectionDialogs.tsx

### Current

ConnectionList.tsx lines 1880-1995. Renders 5 dialog/modal components.

### Target

`connection-list/ConnectionDialogs.tsx`

### Props

```ts
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
  setCreateDbForm: Dispatch<SetStateAction<CreateDatabaseForm>>;
  showCreateDbAdvanced: boolean;
  setShowCreateDbAdvanced: Dispatch<SetStateAction<boolean>>;
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
  setTableExportFormat: Dispatch<SetStateAction<TransferFormat>>;
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
  setPendingDatabaseExport: Dispatch<SetStateAction<...>>;
}
```

### Usage in ConnectionList.tsx

```tsx
<ConnectionDialogs {...dialogProps} />
```

### Lines saved: ~115

## Expected Outcome

| Metric | Before | After |
|--------|--------|-------|
| ConnectionList.tsx lines | 1,998 | ~1,350 |
| New files | 0 | 3 |
| Lines moved out | 0 | ~710 |

## Verification

1. `npm run typecheck` passes
2. `npm run lint` passes
3. Manual smoke test: connect, expand tree, right-click menus, dialogs

## Implementation Order

1. Extract `getDatasourceTreeAdapter.ts` (no UI, pure function)
2. Extract `InlineContextMenu.tsx` (depends on types)
3. Extract `ConnectionDialogs.tsx` (depends on types)
4. Update ConnectionList.tsx imports and usage
5. Verify
