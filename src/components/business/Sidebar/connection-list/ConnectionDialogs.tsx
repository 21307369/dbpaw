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
import { useTranslation } from "react-i18next";
import { CreateElasticsearchIndexDialog } from "@/components/business/Elasticsearch/CreateElasticsearchIndexDialog";
import type { DatabaseExportFormat } from "./types";
import { CreateDatabaseDialog } from "./CreateDatabaseDialog";
import { TableExportDialog, DatabaseExportDialog } from "./ExportDialogs";
import { ImportConfirmDialog } from "./ImportConfirmDialog";

interface ConnectionDialogsProps {
  createEsIndexDialogOpen: boolean;
  createEsIndexConnectionId: string | null;
  onCreateEsIndexDialogOpenChange: (open: boolean) => void;
  onEsIndexCreated: () => Promise<void>;
  isCreateDbDialogOpen: boolean;
  onCloseCreateDbDialog: () => void;
  createDbForm: any;
  setCreateDbForm: (form: any) => void;
  showCreateDbAdvanced: boolean;
  setShowCreateDbAdvanced: (v: boolean | ((prev: boolean) => boolean)) => void;
  createDbValidationMsg: string | null;
  isCreatingDatabase: boolean;
  mysqlCharsets: string[];
  mysqlCollations: string[];
  loadingMysqlOptions: boolean;
  isMySqlFamilyCreateDb: boolean;
  isPostgresCreateDb: boolean;
  isMssqlCreateDb: boolean;
  onCreateDatabase: () => Promise<void>;
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
  setTableExportFormat: (format: "csv" | "json" | "sql_dml" | "sql_ddl" | "sql_full") => void;
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

export function ConnectionDialogs({
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
  onCreateDatabase,
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
}: ConnectionDialogsProps) {
  const { t } = useTranslation();

  return (
    <>
      <CreateElasticsearchIndexDialog
        open={createEsIndexDialogOpen}
        connectionId={
          createEsIndexConnectionId ? Number(createEsIndexConnectionId) : null
        }
        onOpenChange={onCreateEsIndexDialogOpenChange}
        onCreated={onEsIndexCreated}
      />
      <CreateDatabaseDialog
        isOpen={isCreateDbDialogOpen}
        onClose={onCloseCreateDbDialog}
        form={createDbForm}
        setForm={setCreateDbForm}
        showAdvanced={showCreateDbAdvanced}
        setShowAdvanced={setShowCreateDbAdvanced}
        validationMsg={createDbValidationMsg}
        isCreating={isCreatingDatabase}
        mysqlCharsets={mysqlCharsets}
        mysqlCollations={mysqlCollations}
        loadingMysqlOptions={loadingMysqlOptions}
        isMySqlFamily={isMySqlFamilyCreateDb}
        isPostgres={isPostgresCreateDb}
        isMssql={isMssqlCreateDb}
        onCreate={onCreateDatabase}
      />
      <AlertDialog
        open={!!deleteTargetConnectionId}
        onOpenChange={(open) => {
          if (!open) {
            onDeleteTargetChange(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("connection.deleteDialog.title")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("connection.deleteDialog.description")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>
              {t("common.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={isDeleting || !deleteTargetConnectionId}
              onClick={async (e) => {
                e.preventDefault();
                if (!deleteTargetConnectionId) return;
                await onDeleteConnection(deleteTargetConnectionId);
              }}
            >
              {isDeleting
                ? t("connection.deleteDialog.deleting")
                : t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <ImportConfirmDialog
        isOpen={isImportConfirmOpen}
        isImporting={isImportingSql}
        databaseName={pendingImportDatabaseName}
        filePath={pendingImportFilePath}
        onConfirm={onConfirmImport}
        onCancel={() => {
          onImportConfirmOpenChange(false);
          if (!isImportingSql) {
            onClearPendingImport();
          }
        }}
      />
      <TableExportDialog
        isOpen={isTableExportDialogOpen}
        onClose={() => {
          onTableExportDialogOpenChange(false);
          if (!isExportingTable) {
            onClearPendingTableExport();
          }
        }}
        format={tableExportFormat}
        setFormat={setTableExportFormat}
        isExporting={isExportingTable}
        onConfirm={onTableExportConfirm}
        tableName={pendingTableExportTableName}
      />
      <DatabaseExportDialog
        isOpen={isDatabaseExportDialogOpen}
        onClose={() => {
          onDatabaseExportDialogOpenChange(false);
          if (!isExportingDatabaseSql) {
            onClearPendingDatabaseExport();
          }
        }}
        isExporting={isExportingDatabaseSql}
        onConfirm={onConfirmDatabaseExport}
        databaseName={pendingDatabaseExportName}
        format={pendingDatabaseExportFormat}
        onFormatChange={onDatabaseExportFormatChange}
      />
    </>
  );
}
