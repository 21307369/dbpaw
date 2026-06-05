import type { Dispatch, FormEvent, SetStateAction } from "react";
import { Plus, RefreshCw, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTranslation } from "react-i18next";
import { ConnectionDialog } from "./ConnectionDialog";
import { ImportDialog } from "../ImportDialog";
import type { ConnectionForm, Driver } from "@/services/api";
import type { ConnectionDialogTestMessage } from "./ConnectionDialog";

interface SidebarHeaderProps {
  isLoadingConnections: boolean;
  isLoadingQueries: boolean;
  onRefresh: () => void;
  // ConnectionDialog
  isDialogOpen: boolean;
  onDialogOpenChange: (open: boolean) => void;
  dialogMode: "create" | "edit";
  createStep: "type" | "details";
  form: ConnectionForm;
  setForm: Dispatch<SetStateAction<ConnectionForm>>;
  validationMsg: string | null;
  testMsg: ConnectionDialogTestMessage | null;
  requiredOk: boolean;
  isTesting: boolean;
  isConnecting: boolean;
  isSavingEdit: boolean;
  onSubmit: (e: FormEvent<HTMLFormElement>) => void;
  onClose: () => void;
  onTestConnection: () => void;
  onCreateDriverSelect: (driver: Driver) => void;
  onBackToType: () => void;
  onPickSslCaCertFile: () => void;
  onPickSshKeyFile: () => void;
  onPickDatabaseFile: (driver: Driver) => void;
  openCreateDialog: () => void;
  // ImportDialog
  isImportDialogOpen: boolean;
  onImportDialogOpenChange: (open: boolean) => void;
  onImported: () => void;
}

export function SidebarHeader({
  isLoadingConnections,
  isLoadingQueries,
  onRefresh,
  isDialogOpen,
  onDialogOpenChange,
  dialogMode,
  createStep,
  form,
  setForm,
  validationMsg,
  testMsg,
  requiredOk,
  isTesting,
  isConnecting,
  isSavingEdit,
  onSubmit,
  onClose,
  onTestConnection,
  onCreateDriverSelect,
  onBackToType,
  onPickSslCaCertFile,
  onPickSshKeyFile,
  onPickDatabaseFile,
  openCreateDialog,
  isImportDialogOpen,
  onImportDialogOpenChange,
  onImported,
}: SidebarHeaderProps) {
  const { t } = useTranslation();

  return (
    <div className="px-2 py-1 border-b border-border flex items-center justify-between h-8">
      <div className="flex items-center gap-2">
        <h2 className="font-semibold text-sm">{t("connection.title")}</h2>
        {isLoadingQueries && (
          <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
        )}
      </div>
      <div className="flex gap-1">
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0"
          onClick={onRefresh}
          loading={isLoadingConnections}
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </Button>
        <ConnectionDialog
          open={isDialogOpen}
          onOpenChange={onDialogOpenChange}
          trigger={
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0"
              onClick={openCreateDialog}
            >
              <Plus className="w-3.5 h-3.5" />
            </Button>
          }
          dialogMode={dialogMode}
          createStep={createStep}
          form={form}
          setForm={setForm}
          validationMsg={validationMsg}
          testMsg={testMsg}
          requiredOk={requiredOk}
          isTesting={isTesting}
          isConnecting={isConnecting}
          isSavingEdit={isSavingEdit}
          onSubmit={onSubmit}
          onClose={onClose}
          onTestConnection={onTestConnection}
          onCreateDriverSelect={onCreateDriverSelect}
          onBackToType={onBackToType}
          onPickSslCaCertFile={onPickSslCaCertFile}
          onPickSshKeyFile={onPickSshKeyFile}
          onPickDatabaseFile={onPickDatabaseFile}
        />
        <ImportDialog
          open={isImportDialogOpen}
          onOpenChange={onImportDialogOpenChange}
          onImported={onImported}
        />
      </div>
    </div>
  );
}
