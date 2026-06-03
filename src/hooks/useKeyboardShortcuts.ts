import { useEffect } from "react";

import { isModKey, shouldIgnoreGlobalShortcut } from "@/lib/keyboard";
import { useShortcutMatcher } from "@/contexts/ShortcutsContext";
import type { TabItem } from "@/App";

interface UseKeyboardShortcutsParams {
  tabs: TabItem[];
  activeTab: string;
  handleCycleTabs: (direction: 1 | -1) => void;
  handleCloseTab: (tabId: string) => void;
  handleCreateQuery: (
    connectionId: number,
    database: string,
    driver: string,
  ) => void;
  setAiVisible: React.Dispatch<React.SetStateAction<boolean>>;
  setOpenSettings: React.Dispatch<React.SetStateAction<boolean>>;
}

export function useKeyboardShortcuts({
  tabs,
  activeTab,
  handleCycleTabs,
  handleCloseTab,
  handleCreateQuery,
  setAiVisible,
  setOpenSettings,
}: UseKeyboardShortcutsParams) {
  const match = useShortcutMatcher();

  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (!isModKey(e) || shouldIgnoreGlobalShortcut(e)) return;

      if (match(e, "global.nextTab")) {
        e.preventDefault();
        handleCycleTabs(1);
        return;
      }

      if (match(e, "global.prevTab")) {
        e.preventDefault();
        handleCycleTabs(-1);
        return;
      }

      if (match(e, "global.closeTab")) {
        e.preventDefault();
        if (activeTab) {
          handleCloseTab(activeTab);
        }
        return;
      }

      if (match(e, "global.newQueryTab")) {
        e.preventDefault();
        const currentTab = tabs.find((t) => t.id === activeTab);
        if (
          currentTab &&
          currentTab.connectionId &&
          currentTab.database &&
          currentTab.driver
        ) {
          handleCreateQuery(
            currentTab.connectionId,
            currentTab.database,
            currentTab.driver,
          );
        }
        return;
      }

      if (match(e, "global.toggleAiSidebar")) {
        e.preventDefault();
        setAiVisible((v) => !v);
        return;
      }

      if (match(e, "global.openSettings")) {
        e.preventDefault();
        setOpenSettings(true);
        return;
      }
    };

    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => {
      window.removeEventListener("keydown", handleGlobalKeyDown);
    };
  }, [
    activeTab,
    tabs,
    match,
    handleCycleTabs,
    handleCloseTab,
    handleCreateQuery,
    setAiVisible,
    setOpenSettings,
  ]);
}
