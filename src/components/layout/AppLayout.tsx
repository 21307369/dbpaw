import { lazy, MouseEvent, Suspense, type ReactNode } from "react";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { Sidebar } from "@/components/business/Sidebar/Sidebar";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { TabItem } from "@/types/tab";
import { useTranslation } from "react-i18next";

const AISidebar = lazy(async () => {
  const mod = await import("@/components/business/Sidebar/AISidebar");
  return { default: mod.AISidebar };
});

function LazyPanelFallback({ label }: { label: string }) {
  return (
    <div className="h-full flex items-center justify-center text-muted-foreground">
      {label}
    </div>
  );
}

interface AppLayoutProps {
  aiVisible: boolean;
  isFullscreen: boolean;
  sidebarLayout: "tabs" | "tree";
  sidebarProps: any;
  activeTabItem?: TabItem;
  windowActions: ReactNode;
  children: ReactNode;
}

const handleWindowDragStart = (event: MouseEvent<HTMLDivElement>) => {
  if (event.button !== 0) return;
  const target = event.target as HTMLElement;
  if (!event.currentTarget.contains(target)) return;
  if (target.closest('[data-no-drag="true"]')) return;
  getCurrentWindow()
    .startDragging()
    .catch(() => {});
};

export function AppLayout({
  aiVisible,
  isFullscreen,
  sidebarLayout,
  sidebarProps,
  activeTabItem,
  windowActions,
  children,
}: AppLayoutProps) {
  const { t } = useTranslation();

  return (
    <div className="h-screen w-screen flex flex-col bg-muted/30">
      {!isFullscreen && (
        <div
          data-tauri-drag-region
          className="relative h-9 bg-background border-b border-border flex items-center pl-20 pr-2 select-none cursor-grab active:cursor-grabbing"
          onMouseDown={handleWindowDragStart}
        >
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <span className="text-xs font-medium text-muted-foreground">
              DbPaw
            </span>
          </div>
          <div
            data-no-drag="true"
            className="ml-auto flex items-center gap-1 shrink-0"
          >
            {windowActions}
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 overflow-hidden">
        <ResizablePanelGroup
          direction="horizontal"
          autoSaveId={aiVisible ? "main-layout-with-ai" : "main-layout"}
        >
          {/* Left Sidebar - Database Connections */}
          <ResizablePanel
            id="left-sidebar"
            order={1}
            defaultSize={20}
            minSize={15}
            maxSize={30}
          >
            <Sidebar {...sidebarProps} layoutMode={sidebarLayout} />
          </ResizablePanel>

          <ResizableHandle />

          {/* Main Panel */}
          <ResizablePanel
            id="main-panel"
            order={2}
            defaultSize={60}
            minSize={40}
          >
            {children}
          </ResizablePanel>

          <ResizableHandle />

          {/* Right Sidebar - AI Assistant */}
          {aiVisible && (
            <ResizablePanel
              id="ai-sidebar"
              order={3}
              defaultSize={20}
              minSize={20}
              maxSize={40}
            >
              <Suspense
                fallback={<LazyPanelFallback label={t("common.loading")} />}
              >
                <AISidebar
                  connectionId={activeTabItem?.connectionId}
                  database={activeTabItem?.database}
                  schemaOverview={activeTabItem?.type === "editor" ? activeTabItem.schemaOverview : undefined}
                />
              </Suspense>
            </ResizablePanel>
          )}
        </ResizablePanelGroup>
      </div>
    </div>
  );
}
