import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Tabs } from "@/components/ui/tabs";
import type { RedisRefreshRequest } from "@/components/business/Sidebar/ConnectionList";
import { Loader2 } from "lucide-react";
import { isTauri } from "@/services/api";
import { listen } from "@tauri-apps/api/event";
import { useTranslation } from "react-i18next";

import { useTabManager } from "@/hooks/useTabManager";
import { useQueryEditor } from "@/hooks/useQueryEditor";
import { useTableViewer } from "@/hooks/useTableViewer";
import { useUnsavedChanges } from "@/hooks/useUnsavedChanges";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { useTabFactory } from "@/hooks/useTabFactory";
import { useTreeCallbacks } from "@/hooks/useTreeCallbacks";
import { useAppSettings } from "@/hooks/useAppSettings";
import { useWindowFullscreen } from "@/hooks/useWindowFullscreen";

import { UpdaterChecker } from "@/components/updater-checker";
import { AppLayout } from "@/components/layout/AppLayout";
import { TabBar } from "@/components/layout/TabBar";
import { TabContentRenderer } from "@/components/layout/TabContentRenderer";
import { UnsavedChangesDialog } from "@/components/layout/UnsavedChangesDialog";
import { WindowActions } from "@/components/layout/WindowActions";

import type { TabItem } from "@/types/tab";

type ActiveTableTarget = {
  connectionId: number;
  database: string;
  table: string;
  schema?: string;
};

type SidebarRevealRequest = ActiveTableTarget & {
  id: number;
};

const SettingsDialog = lazy(async () => {
  const mod = await import("@/components/settings/SettingsDialog");
  return { default: mod.SettingsDialog };
});

function getTableTargetFromTab(tab?: TabItem): ActiveTableTarget | undefined {
  if (
    tab &&
    (tab.type === "table" || tab.type === "ddl") &&
    tab.connectionId &&
    tab.database &&
    tab.tableName
  ) {
    return {
      connectionId: tab.connectionId,
      database: tab.database,
      table: tab.tableName,
      schema: tab.schema,
    };
  }
  return undefined;
}

function isDefaultQueryTitle(title?: string) {
  return !!title && /^(Query \(|查询（|クエリ（)/.test(title);
}

export default function App() {
  const { t } = useTranslation();

  const [aiVisible, setAiVisible] = useState(false);
  const [sidebarRevealRequest, setSidebarRevealRequest] =
    useState<SidebarRevealRequest>();
  const [openSettings, setOpenSettings] = useState(false);
  const [queriesLastUpdated, setQueriesLastUpdated] = useState(0);
  const redisRefreshIdRef = useRef(0);
  const [redisRefreshRequest, setRedisRefreshRequest] = useState<
    RedisRefreshRequest | undefined
  >(undefined);
  const sidebarRevealRequestIdRef = useRef(0);

  const {
    sidebarLayout,
    setSidebarLayout,
    showColumnComments,
    setShowColumnComments,
    showRowNumbers,
    setShowRowNumbers,
    showZebraStripes,
    setShowZebraStripes,
  } = useAppSettings();
  const isFullscreen = useWindowFullscreen();

  const {
    tabs,
    setTabs,
    activeTab,
    setActiveTab,
    handleDragEnd,
    handleCycleTabs: baseHandleCycleTabs,
    closeTabNow: baseCloseTabNow,
  } = useTabManager();

  const {
    handleCreateQuery,
    handleOpenSavedQuery,
    handleSqlChange,
    handleExecuteQuery,
    handleEditorDatabaseChange,
    saveEditorTab,
  } = useQueryEditor({
    tabs,
    setTabs,
    setActiveTab,
    setQueriesLastUpdated,
    t,
  });

  const {
    handleTableSelect,
    handleTableRefresh,
    handlePageChange,
    handlePageSizeChange,
    handleSortChange,
    handleFilterChange,
  } = useTableViewer({
    tabs,
    setTabs,
    setActiveTab,
    t,
  });

  const {
    handleCloseTab,
    handleCloseOtherTabs,
    isUnsavedConfirmOpen,
    isCloseSaveDialogOpen,
    currentCloseTab,
    handleUnsavedCloseCancel,
    handleUnsavedCloseWithoutSave,
    handleUnsavedCloseSave,
    handleCloseSaveDialogOpenChange,
    handleCloseFlowSave,
  } = useUnsavedChanges({
    tabs,
    closeTabNow: baseCloseTabNow,
    saveEditorTab,
  });

  const {
    openRedisConsole,
    openRedisBrowser,
    openRedisServerInfo,
    openRedisKey,
    openElasticsearchIndex,
    openTableDDL,
    openRoutine,
    openCreateTable,
    openAlterTable,
    openERDiagram,
    exportTable,
    exportDatabase,
  } = useTabFactory({ tabs, setTabs, setActiveTab, t });

  const treeCallbacks = useTreeCallbacks({
    openRedisKey,
    openRedisBrowser,
    openRedisConsole,
    openRedisServerInfo,
    openElasticsearchIndex,
  });

  const revealSidebarForTab = useCallback(
    (tabId: string, sourceTabs = tabs) => {
      const target = getTableTargetFromTab(
        sourceTabs.find((tab) => tab.id === tabId),
      );
      if (!target) return;
      setSidebarRevealRequest({
        ...target,
        id: ++sidebarRevealRequestIdRef.current,
      });
    },
    [tabs],
  );

  const handleMainTabChange = useCallback(
    (tabId: string) => {
      setActiveTab(tabId);
      revealSidebarForTab(tabId);
    },
    [setActiveTab, revealSidebarForTab],
  );

  const closeTabNow = useCallback(
    (tabId: string) => {
      baseCloseTabNow(tabId, revealSidebarForTab);
    },
    [baseCloseTabNow, revealSidebarForTab],
  );

  const handleCycleTabs = useCallback(
    (direction: 1 | -1) => {
      baseHandleCycleTabs(direction);
      const nextIndex =
        (tabs.findIndex((item) => item.id === activeTab) +
          direction +
          tabs.length) %
        tabs.length;
      if (tabs[nextIndex]) {
        revealSidebarForTab(tabs[nextIndex].id);
      }
    },
    [baseHandleCycleTabs, tabs, activeTab, revealSidebarForTab],
  );

  const handleCloseOtherTabsWithReveal = useCallback(
    (tabId: string) => {
      handleCloseOtherTabs(tabId);
      setActiveTab(tabId);
      revealSidebarForTab(tabId);
    },
    [handleCloseOtherTabs, setActiveTab, revealSidebarForTab],
  );

  useKeyboardShortcuts({
    tabs,
    activeTab,
    handleCycleTabs,
    handleCloseTab,
    handleCreateQuery,
    setAiVisible,
    setOpenSettings,
  });

  const handleCreateTableSuccess = useCallback(
    (
      tabId: string,
      connectionId: number,
      database: string,
      schema: string | undefined,
      tableName: string,
      driver: string,
    ) => {
      closeTabNow(tabId);
      void handleTableSelect(
        String(connectionId),
        database,
        tableName,
        connectionId,
        driver,
        schema,
      );
      setSidebarRevealRequest({
        id: Date.now(),
        connectionId,
        database,
        table: tableName,
        schema,
      });
    },
    [closeTabNow, handleTableSelect],
  );

  const handleAlterTableSuccess = useCallback(
    (tabId: string) => {
      closeTabNow(tabId);
    },
    [closeTabNow],
  );

  const notifyRedisRefresh = useCallback(
    (connectionId: number, database: string) => {
      setRedisRefreshRequest({
        id: ++redisRefreshIdRef.current,
        connectionId,
        database,
      });
    },
    [],
  );

  useEffect(() => {
    if (!isTauri()) return;
    const unlistenSettings = listen("open-settings", () =>
      setOpenSettings(true),
    );
    return () => {
      unlistenSettings.then((f) => f());
    };
  }, []);

  const activeTabItem = tabs.find((item) => item.id === activeTab);
  const activeTableTarget = useMemo<ActiveTableTarget | undefined>(() => {
    return getTableTargetFromTab(activeTabItem);
  }, [activeTabItem]);
  const tableTabTitleCounts = useMemo(() => {
    const counts = new Map<string, number>();
    tabs.forEach((tab) => {
      if (tab.type !== "table") return;
      counts.set(tab.title, (counts.get(tab.title) || 0) + 1);
    });
    return counts;
  }, [tabs]);

  return (
    <AppLayout
      aiVisible={aiVisible}
      isFullscreen={isFullscreen}
      sidebarLayout={sidebarLayout}
      activeTabItem={activeTabItem}
      windowActions={
        <WindowActions
          aiVisible={aiVisible}
          onToggleAi={() => setAiVisible((v) => !v)}
          onOpenSettings={() => setOpenSettings(true)}
        />
      }
      sidebarProps={{
        onTableSelect: handleTableSelect,
        onConnect: () => {},
        onCreateQuery: handleCreateQuery,
        onRoutineSelect: openRoutine,
        onExportTable: exportTable,
        onExportDatabase: exportDatabase,
        onCreateTable: openCreateTable,
        onAlterTable: openAlterTable,
        onSelectSavedQuery: handleOpenSavedQuery,
        lastUpdated: queriesLastUpdated,
        activeTableTarget,
        sidebarRevealRequest,
        redisRefreshRequest,
        treeCallbacks,
      }}
    >
      <Tabs
        value={activeTab}
        onValueChange={handleMainTabChange}
        className="h-full flex flex-col"
      >
        <div className="bg-background border-b border-border flex items-center h-9">
          <div className="min-w-0 flex-1">
            <TabBar
              tabs={tabs}
              activeTab={activeTab}
              onTabChange={handleMainTabChange}
              onDragEnd={handleDragEnd}
              onCloseTab={handleCloseTab}
              onCloseOtherTabs={handleCloseOtherTabsWithReveal}
              tableTabTitleCounts={tableTabTitleCounts}
            />
          </div>
          {isFullscreen && (
            <div
              data-no-drag="true"
              className="flex items-center gap-1 shrink-0 pr-2"
            >
              <WindowActions
                aiVisible={aiVisible}
                onToggleAi={() => setAiVisible((v) => !v)}
                onOpenSettings={() => setOpenSettings(true)}
              />
            </div>
          )}
        </div>

        <div className="flex-1 overflow-hidden relative">
          <TabContentRenderer
            tabs={tabs}
            activeTab={activeTab}
            handleExecuteQuery={handleExecuteQuery}
            handleSqlChange={handleSqlChange}
            handleEditorDatabaseChange={handleEditorDatabaseChange}
            handlePageChange={handlePageChange}
            handlePageSizeChange={handlePageSizeChange}
            handleSortChange={handleSortChange}
            handleFilterChange={handleFilterChange}
            handleTableRefresh={handleTableRefresh}
            handleOpenTableDDL={openTableDDL}
            handleOpenERDiagram={openERDiagram}
            handleCreateQuery={handleCreateQuery}
            handleCloseTab={handleCloseTab}
            handleCreateTableSuccess={handleCreateTableSuccess}
            handleAlterTableSuccess={handleAlterTableSuccess}
            handleOpenRedisConsole={openRedisConsole}
            notifyRedisRefresh={notifyRedisRefresh}
            setQueriesLastUpdated={setQueriesLastUpdated}
            setTabs={setTabs}
            isDefaultQueryTitle={isDefaultQueryTitle}
            showColumnComments={showColumnComments}
            showRowNumbers={showRowNumbers}
            showZebraStripes={showZebraStripes}
          />
        </div>
      </Tabs>
      <UnsavedChangesDialog
        isUnsavedConfirmOpen={isUnsavedConfirmOpen}
        isCloseSaveDialogOpen={isCloseSaveDialogOpen}
        currentCloseTab={currentCloseTab}
        onCancel={handleUnsavedCloseCancel}
        onDiscard={handleUnsavedCloseWithoutSave}
        onSave={handleUnsavedCloseSave}
        onSaveDialogOpenChange={handleCloseSaveDialogOpenChange}
        onSaveComplete={handleCloseFlowSave}
        isDefaultQueryTitle={isDefaultQueryTitle}
      />
      {openSettings && (
        <Suspense
          fallback={
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          }
        >
          <SettingsDialog
            open={openSettings}
            onOpenChange={setOpenSettings}
            sidebarLayout={sidebarLayout}
            onSidebarLayoutChange={setSidebarLayout}
            showColumnComments={showColumnComments}
            onShowColumnCommentsChange={setShowColumnComments}
            showRowNumbers={showRowNumbers}
            onShowRowNumbersChange={setShowRowNumbers}
            showZebraStripes={showZebraStripes}
            onShowZebraStripesChange={setShowZebraStripes}
          />
        </Suspense>
      )}
      <UpdaterChecker />
    </AppLayout>
  );
}

export type { TabItem } from "@/types/tab";
