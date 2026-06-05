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
import { SaveQueryDialog } from "@/components/business/Editor/SaveQueryDialog";
import { useTranslation } from "react-i18next";
import type { TabItem } from "@/types/tab";

interface UnsavedChangesDialogProps {
  isUnsavedConfirmOpen: boolean;
  isCloseSaveDialogOpen: boolean;
  currentCloseTab?: TabItem;
  onCancel: () => void;
  onDiscard: () => void;
  onSave: () => void;
  onSaveDialogOpenChange: (open: boolean) => void;
  onSaveComplete: (name: string, description: string) => Promise<void>;
  isDefaultQueryTitle: (title?: string) => boolean;
}

export function UnsavedChangesDialog({
  isUnsavedConfirmOpen,
  isCloseSaveDialogOpen,
  currentCloseTab,
  onCancel,
  onDiscard,
  onSave,
  onSaveDialogOpenChange,
  onSaveComplete,
  isDefaultQueryTitle,
}: UnsavedChangesDialogProps) {
  const { t } = useTranslation();

  return (
    <>
      <AlertDialog
        open={isUnsavedConfirmOpen}
        onOpenChange={(open) => {
          if (!open) {
            onCancel();
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("app.dialog.unsavedTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("app.dialog.unsavedDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={onCancel}>
              {t("common.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction onClick={onDiscard}>
              {t("app.dialog.dontSave")}
            </AlertDialogAction>
            <AlertDialogAction onClick={onSave}>
              {t("common.save")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <SaveQueryDialog
        open={isCloseSaveDialogOpen}
        onOpenChange={onSaveDialogOpenChange}
        onSave={onSaveComplete}
        initialName={
          currentCloseTab && !isDefaultQueryTitle(currentCloseTab.title)
            ? currentCloseTab.title
            : ""
        }
        initialDescription={currentCloseTab?.type === "editor" ? currentCloseTab.savedQueryDescription : undefined}
      />
    </>
  );
}
