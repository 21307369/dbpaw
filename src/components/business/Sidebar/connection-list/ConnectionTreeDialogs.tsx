import { InlineContextMenu, type ContextMenuState } from "./InlineContextMenu";
import { ConnectionDialogs } from "./ConnectionDialogs";
import type { Connection, DatabaseInfo, DatasourceTreeAdapter } from "./types";
import type { DatabaseExportFormat } from "./types";

interface ConnectionTreeDialogsProps {
  // InlineContextMenu
  contextMenu: ContextMenuState;
  onCloseContextMenu: () => void;
  connections: Connection[];
  contextMenuConnection: Connection | null | undefined;
  contextMenuDatabaseAdapter: DatasourceTreeAdapter | null;
  onEdit: (id: string) => void;
  onDuplicate: (id: string) => void;
  onReconnect: (id: string) => void;
  onCreateQuery: (
    connectionId: string | null | undefined,
    databaseName?: string | null,
  ) => void;
  onCreateDatabase: (id: string) => void;
  onDelete: (id: string | null) => void;
  supportsCreateDatabaseForDriver: (driver: string) => boolean;
  onRefreshDatabaseTables: (
    connectionId: string,
    databaseName: string,
  ) => void;
  onDatabaseImport: (connectionId: string, databaseName: string) => void;
  onDatabaseExport: (
    connection: Connection,
    database: DatabaseInfo,
  ) => void;
  onCreateTable?: (
    connectionId: number,
    database: string,
    schema: string,
    driver: string,
  ) => void;
  // ConnectionDialogs
  createEsIndexDialogOpen: boolean;
  createEsIndexConnectionId: string | null;
  onCreateEsIndexDialogOpenChange: (open: boolean) => void;
  onEsIndexCreated: () => Promise<void>;
  isCreateDbDialogOpen: boolean;
  onCloseCreateDbDialog: () => void;
  createDbForm: any;
  setCreateDbForm: (form: any) => void;
  showCreateDbAdvanced: boolean;
  setShowCreateDbAdvanced: (
    v: boolean | ((prev: boolean) => boolean),
  ) => void;
  createDbValidationMsg: string | null;
  isCreatingDatabase: boolean;
  mysqlCharsets: string[];
  mysqlCollations: string[];
  loadingMysqlOptions: boolean;
  isMySqlFamilyCreateDb: boolean;
  isPostgresCreateDb: boolean;
  isMssqlCreateDb: boolean;
  onCreateDatabaseSubmit: () => Promise<void>;
  deleteTargetConnectionId: string | null;
  onDeleteTargetChange: (id: string | null) => void;
  isDeleting: boolean;
  onDeleteConnection: (id: string) => Promise<void>;
  isImportConfirmOpen: boolean;
  isImportingSql: boolean;
  pendingImportDatabaseName?: string;
  pendingImportFilePath?: string;
  onConfirmImport: () => Promise<void>;
  onImportConfirmOpenChange: (open: boolean) => void;
  onClearPendingImport: () => void;
  isTableExportDialogOpen: boolean;
  isExportingTable: boolean;
  pendingTableExportTableName?: string;
  onTableExportDialogOpenChange: (open: boolean) => void;
  onClearPendingTableExport: () => void;
  tableExportFormat: "csv" | "json" | "sql_dml" | "sql_ddl" | "sql_full";
  setTableExportFormat: (
    format: "csv" | "json" | "sql_dml" | "sql_ddl" | "sql_full",
  ) => void;
  onTableExportConfirm: () => Promise<void>;
  isDatabaseExportDialogOpen: boolean;
  isExportingDatabaseSql: boolean;
  pendingDatabaseExportName?: string;
  pendingDatabaseExportFormat: DatabaseExportFormat;
  onDatabaseExportDialogOpenChange: (open: boolean) => void;
  onClearPendingDatabaseExport: () => void;
  onDatabaseExportFormatChange: (value: DatabaseExportFormat) => void;
  onConfirmDatabaseExport: () => Promise<void>;
}

export function ConnectionTreeDialogs({
  contextMenu,
  onCloseContextMenu,
  connections,
  contextMenuConnection,
  contextMenuDatabaseAdapter,
  onEdit,
  onDuplicate,
  onReconnect,
  onCreateQuery,
  onCreateDatabase,
  onDelete,
  supportsCreateDatabaseForDriver,
  onRefreshDatabaseTables,
  onDatabaseImport,
  onDatabaseExport,
  onCreateTable,
  createEsIndexDialogOpen,
  createEsIndexConnectionId,
  onCreateEsIndexDialogOpenChange,
  onEsIndexCreated,
  isCreateDbDialogOpen,
  onCloseCreateDbDialog,
  createDbForm,
  setCreateDbForm,
  showCreateDbAdvanced,
  setShowCreateDbAdvanced,
  createDbValidationMsg,
  isCreatingDatabase,
  mysqlCharsets,
  mysqlCollations,
  loadingMysqlOptions,
  isMySqlFamilyCreateDb,
  isPostgresCreateDb,
  isMssqlCreateDb,
  onCreateDatabaseSubmit: handleCreateDatabase,
  deleteTargetConnectionId,
  onDeleteTargetChange,
  isDeleting,
  onDeleteConnection,
  isImportConfirmOpen,
  isImportingSql,
  pendingImportDatabaseName,
  pendingImportFilePath,
  onConfirmImport,
  onImportConfirmOpenChange,
  onClearPendingImport,
  isTableExportDialogOpen,
  isExportingTable,
  pendingTableExportTableName,
  onTableExportDialogOpenChange,
  onClearPendingTableExport,
  tableExportFormat,
  setTableExportFormat,
  onTableExportConfirm,
  isDatabaseExportDialogOpen,
  isExportingDatabaseSql,
  pendingDatabaseExportName,
  pendingDatabaseExportFormat,
  onDatabaseExportDialogOpenChange,
  onClearPendingDatabaseExport,
  onDatabaseExportFormatChange,
  onConfirmDatabaseExport,
}: ConnectionTreeDialogsProps) {
  return (
    <>
      <InlineContextMenu
        contextMenu={contextMenu}
        onClose={onCloseContextMenu}
        connections={connections}
        contextMenuConnection={contextMenuConnection}
        contextMenuDatabaseAdapter={contextMenuDatabaseAdapter}
        onEdit={onEdit}
        onDuplicate={onDuplicate}
        onReconnect={onReconnect}
        onCreateQuery={onCreateQuery}
        onCreateDatabase={onCreateDatabase}
        onDelete={onDelete}
        supportsCreateDatabaseForDriver={supportsCreateDatabaseForDriver}
        onRefreshDatabaseTables={onRefreshDatabaseTables}
        onDatabaseImport={onDatabaseImport}
        onDatabaseExport={onDatabaseExport}
        onCreateTable={onCreateTable}
      />
      <ConnectionDialogs
        createEsIndexDialogOpen={createEsIndexDialogOpen}
        createEsIndexConnectionId={createEsIndexConnectionId}
        onCreateEsIndexDialogOpenChange={onCreateEsIndexDialogOpenChange}
        onEsIndexCreated={onEsIndexCreated}
        isCreateDbDialogOpen={isCreateDbDialogOpen}
        onCloseCreateDbDialog={onCloseCreateDbDialog}
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
        onDeleteTargetChange={onDeleteTargetChange}
        isDeleting={isDeleting}
        onDeleteConnection={onDeleteConnection}
        isImportConfirmOpen={isImportConfirmOpen}
        isImportingSql={isImportingSql}
        pendingImportDatabaseName={pendingImportDatabaseName}
        pendingImportFilePath={pendingImportFilePath}
        onConfirmImport={onConfirmImport}
        onImportConfirmOpenChange={onImportConfirmOpenChange}
        onClearPendingImport={onClearPendingImport}
        isTableExportDialogOpen={isTableExportDialogOpen}
        isExportingTable={isExportingTable}
        pendingTableExportTableName={pendingTableExportTableName}
        onTableExportDialogOpenChange={onTableExportDialogOpenChange}
        onClearPendingTableExport={onClearPendingTableExport}
        tableExportFormat={tableExportFormat}
        setTableExportFormat={setTableExportFormat}
        onTableExportConfirm={onTableExportConfirm}
        isDatabaseExportDialogOpen={isDatabaseExportDialogOpen}
        isExportingDatabaseSql={isExportingDatabaseSql}
        pendingDatabaseExportName={pendingDatabaseExportName}
        pendingDatabaseExportFormat={pendingDatabaseExportFormat}
        onDatabaseExportDialogOpenChange={onDatabaseExportDialogOpenChange}
        onClearPendingDatabaseExport={onClearPendingDatabaseExport}
        onDatabaseExportFormatChange={onDatabaseExportFormatChange}
        onConfirmDatabaseExport={onConfirmDatabaseExport}
      />
    </>
  );
}
