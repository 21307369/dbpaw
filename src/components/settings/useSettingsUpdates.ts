import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { getSetting, saveSetting } from "@/services/store";
import {
  checkForUpdates,
  getUpdateTaskSnapshot,
  relaunchAfterUpdate,
  startBackgroundInstall,
  subscribeUpdateTask,
  type UpdateTaskState,
} from "@/services/updater";

export function useSettingsUpdates(open: boolean) {
  const { t } = useTranslation();
  const [autoUpdate, setAutoUpdate] = useState(true);
  const [checking, setChecking] = useState(false);
  const [updateTaskState, setUpdateTaskState] = useState<UpdateTaskState>(
    getUpdateTaskSnapshot().state,
  );

  useEffect(() => {
    const unsubscribe = subscribeUpdateTask((snapshot) => {
      setUpdateTaskState(snapshot.state);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (open) {
      getSetting("autoUpdate", true).then(setAutoUpdate);
    }
  }, [open]);

  const toggleAutoUpdate = async (checked: boolean) => {
    setAutoUpdate(checked);
    await saveSetting("autoUpdate", checked);
  };

  const handleCheckUpdate = async () => {
    if (checking) return;
    if (updateTaskState === "ready_to_restart") {
      await relaunchAfterUpdate();
      return;
    }
    if (
      updateTaskState === "checking" ||
      updateTaskState === "downloading" ||
      updateTaskState === "installing"
    ) {
      toast.info(t("settings.updates.inBackgroundProgress"));
      return;
    }

    setChecking(true);
    try {
      const result = await checkForUpdates();
      if (result.state === "available" && result.update) {
        toast.info(
          t("settings.updates.available", { version: result.update.version }),
          {
            action: {
              label: t("settings.updates.updateAction"),
              onClick: () => {
                const startResult = startBackgroundInstall(result.update);
                if (!startResult.started) {
                  toast.info(t("settings.updates.inBackgroundProgress"));
                  return;
                }
                toast.success(t("settings.updates.backgroundStarted"));
              },
            },
          },
        );
      } else {
        toast.success(result.message ?? t("settings.updates.latest"));
      }
    } catch (error) {
      console.error(error);
      toast.error(t("settings.updates.failedCheck"));
    } finally {
      setChecking(false);
    }
  };

  return {
    autoUpdate,
    checking,
    updateTaskState,
    handleCheckUpdate,
    toggleAutoUpdate,
  };
}
