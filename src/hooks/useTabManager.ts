import { useState, useCallback } from "react";
import type { DragEndEvent } from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import type { TabItem } from "@/App";

export function useTabManager() {
  const [tabs, setTabs] = useState<TabItem[]>([]);
  const [activeTab, setActiveTab] = useState<string>("");

  const handleMainTabChange = useCallback((tabId: string) => {
    setActiveTab(tabId);
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (over && active.id !== over.id) {
        setTabs((items) => {
          const oldIndex = items.findIndex((item) => item.id === active.id);
          const newIndex = items.findIndex((item) => item.id === over.id);
          return arrayMove(items, oldIndex, newIndex);
        });
      }
    },
    [],
  );

  const handleCycleTabs = useCallback(
    (direction: 1 | -1) => {
      if (tabs.length < 2) return;
      const currentIndex = tabs.findIndex((t) => t.id === activeTab);
      const startIndex = currentIndex >= 0 ? currentIndex : 0;
      const nextIndex = (startIndex + direction + tabs.length) % tabs.length;
      setActiveTab(tabs[nextIndex].id);
    },
    [tabs, activeTab],
  );

  const closeTabNow = useCallback(
    (
      tabId: string,
      onSidebarReveal?: (tabId: string, tabs: TabItem[]) => void,
    ) => {
      setTabs((prev) => {
        const newTabs = prev.filter((t) => t.id !== tabId);
        setActiveTab((currentActiveTab) => {
          if (currentActiveTab !== tabId) return currentActiveTab;
          const nextActiveTab = newTabs[newTabs.length - 1]?.id || "";
          if (nextActiveTab && onSidebarReveal) {
            onSidebarReveal(nextActiveTab, newTabs);
          }
          return nextActiveTab;
        });
        return newTabs;
      });
    },
    [],
  );

  return {
    tabs,
    setTabs,
    activeTab,
    setActiveTab,
    handleMainTabChange,
    handleDragEnd,
    handleCycleTabs,
    closeTabNow,
  };
}
