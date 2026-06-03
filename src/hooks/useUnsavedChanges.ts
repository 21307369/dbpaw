import { useState, useCallback, useRef } from "react";
import type { TabItem } from "@/App";

interface UseUnsavedChangesParams {
  tabs: TabItem[];
  closeTabNow: (tabId: string) => void;
  saveEditorTab: (tab: TabItem, name: string, description: string) => Promise<void>;
}

export function useUnsavedChanges({
  tabs,
  closeTabNow,
  saveEditorTab,
}: UseUnsavedChangesParams) {
  const [pendingCloseTabIds, setPendingCloseTabIds] = useState<string[]>([]);
  const [currentCloseTabId, setCurrentCloseTabId] = useState<string | null>(
    null,
  );
  const [isUnsavedConfirmOpen, setIsUnsavedConfirmOpen] = useState(false);
  const [isCloseSaveDialogOpen, setIsCloseSaveDialogOpen] = useState(false);

  const closeSaveCompletedRef = useRef(false);
  const unsavedConfirmActionRef = useRef<"save" | "discard" | null>(null);

  const resetCloseFlow = useCallback(() => {
    setPendingCloseTabIds([]);
    setCurrentCloseTabId(null);
    setIsUnsavedConfirmOpen(false);
    setIsCloseSaveDialogOpen(false);
    closeSaveCompletedRef.current = false;
    unsavedConfirmActionRef.current = null;
  }, []);

  const continueCloseFlow = useCallback(
    (queue: string[]) => {
      if (queue.length === 0) {
        resetCloseFlow();
        return;
      }

      const [nextTabId, ...rest] = queue;
      const nextTab = tabs.find((t) => t.id === nextTabId);
      if (!nextTab) {
        continueCloseFlow(rest);
        return;
      }

      if (nextTab.type === "editor" && nextTab.isDirty) {
        setPendingCloseTabIds(queue);
        setCurrentCloseTabId(nextTabId);
        setIsUnsavedConfirmOpen(true);
        setIsCloseSaveDialogOpen(false);
        return;
      }

      closeTabNow(nextTabId);
      continueCloseFlow(rest);
    },
    [tabs, closeTabNow, resetCloseFlow],
  );

  const requestCloseTabs = useCallback(
    (tabIds: string[]) => {
      const existingTabIds = tabIds.filter((id) =>
        tabs.some((t) => t.id === id),
      );
      if (existingTabIds.length === 0) return;
      continueCloseFlow(existingTabIds);
    },
    [tabs, continueCloseFlow],
  );

  const handleCloseTab = useCallback(
    (tabId: string) => {
      requestCloseTabs([tabId]);
    },
    [requestCloseTabs],
  );

  const handleCloseOtherTabs = useCallback(
    (tabId: string) => {
      requestCloseTabs(tabs.filter((t) => t.id !== tabId).map((t) => t.id));
    },
    [requestCloseTabs, tabs],
  );

  const handleUnsavedCloseCancel = useCallback(() => {
    resetCloseFlow();
  }, [resetCloseFlow]);

  const handleUnsavedCloseWithoutSave = useCallback(() => {
    unsavedConfirmActionRef.current = "discard";
    if (!currentCloseTabId) {
      resetCloseFlow();
      return;
    }

    closeTabNow(currentCloseTabId);
    const currentIndex = pendingCloseTabIds.indexOf(currentCloseTabId);
    const rest =
      currentIndex >= 0
        ? pendingCloseTabIds.slice(currentIndex + 1)
        : pendingCloseTabIds.filter((id) => id !== currentCloseTabId);
    continueCloseFlow(rest);
  }, [
    closeTabNow,
    continueCloseFlow,
    currentCloseTabId,
    pendingCloseTabIds,
    resetCloseFlow,
  ]);

  const handleUnsavedCloseSave = useCallback(() => {
    unsavedConfirmActionRef.current = "save";
    setIsUnsavedConfirmOpen(false);
    setIsCloseSaveDialogOpen(true);
  }, []);

  const handleCloseSaveDialogOpenChange = useCallback(
    (open: boolean) => {
      setIsCloseSaveDialogOpen(open);
      if (open) return;
      if (closeSaveCompletedRef.current) {
        closeSaveCompletedRef.current = false;
        return;
      }
      resetCloseFlow();
    },
    [resetCloseFlow],
  );

  const handleCloseFlowSave = useCallback(
    async (name: string, description: string) => {
      if (!currentCloseTabId) {
        resetCloseFlow();
        return;
      }

      const currentTab = tabs.find((t) => t.id === currentCloseTabId);
      if (!currentTab || currentTab.type !== "editor") {
        closeSaveCompletedRef.current = true;
        const currentIndex = pendingCloseTabIds.indexOf(currentCloseTabId);
        const rest =
          currentIndex >= 0
            ? pendingCloseTabIds.slice(currentIndex + 1)
            : pendingCloseTabIds.filter((id) => id !== currentCloseTabId);
        continueCloseFlow(rest);
        return;
      }

      await saveEditorTab(currentTab, name, description);

      closeSaveCompletedRef.current = true;
      closeTabNow(currentCloseTabId);
      const currentIndex = pendingCloseTabIds.indexOf(currentCloseTabId);
      const rest =
        currentIndex >= 0
          ? pendingCloseTabIds.slice(currentIndex + 1)
          : pendingCloseTabIds.filter((id) => id !== currentCloseTabId);
      continueCloseFlow(rest);
    },
    [
      closeTabNow,
      continueCloseFlow,
      currentCloseTabId,
      pendingCloseTabIds,
      resetCloseFlow,
      saveEditorTab,
      tabs,
    ],
  );

  const currentCloseTab = currentCloseTabId
    ? tabs.find((t) => t.id === currentCloseTabId)
    : undefined;

  return {
    pendingCloseTabIds,
    currentCloseTabId,
    isUnsavedConfirmOpen,
    isCloseSaveDialogOpen,
    currentCloseTab,
    requestCloseTabs,
    handleCloseTab,
    handleCloseOtherTabs,
    handleUnsavedCloseCancel,
    handleUnsavedCloseWithoutSave,
    handleUnsavedCloseSave,
    handleCloseSaveDialogOpenChange,
    handleCloseFlowSave,
    setIsUnsavedConfirmOpen,
    resetCloseFlow,
  };
}
