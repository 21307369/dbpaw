import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  horizontalListSortingStrategy,
} from "@dnd-kit/sortable";
import {
  FileCode,
  FileSearch,
  KeyRound,
  LayoutDashboard,
  Server,
  Table,
  X,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { SortableTab } from "@/components/ui/sortable-tab";
import type { TabItem } from "@/App";

const TAB_TRIGGER_CLASS =
  "gap-2 group relative pr-8 bg-transparent data-[state=active]:bg-background border-b-2 border-b-transparent data-[state=active]:border-b-accent rounded-none h-9 hover:bg-muted/50 border-r border-r-border/40 last:border-r-0 shrink-0";

export interface TabBarProps {
  tabs: TabItem[];
  activeTab: string;
  onTabChange: (tabId: string) => void;
  onDragEnd: (event: DragEndEvent) => void;
  onCloseTab: (tabId: string) => void;
  onCloseOtherTabs: (tabId: string) => void;
  tableTabTitleCounts: Map<string, number>;
}

export function TabBar({
  tabs,
  activeTab: _activeTab,
  onTabChange: _onTabChange,
  onDragEnd,
  onCloseTab,
  onCloseOtherTabs,
  tableTabTitleCounts,
}: TabBarProps) {
  const { t } = useTranslation();

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
  );

  return (
    <TabsList className="h-9 min-w-0 w-full justify-start gap-0 bg-transparent border-none p-0 overflow-x-auto">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={onDragEnd}
      >
        <SortableContext
          items={tabs.map((t) => t.id)}
          strategy={horizontalListSortingStrategy}
        >
          {tabs.map((tab) => {
            const title =
              tab.type === "table" &&
              (tableTabTitleCounts.get(tab.title) || 0) > 1 &&
              tab.database
                ? `${tab.database}.${tab.title}`
                : tab.title;
            return (
              <SortableTab key={tab.id} id={tab.id}>
                <ContextMenu>
                  <ContextMenuTrigger asChild>
                    <span className="contents">
                      <TabsTrigger
                        value={tab.id}
                        className={TAB_TRIGGER_CLASS}
                        asChild
                        onMouseDown={(e) => {
                          if (e.button === 1) {
                            e.preventDefault();
                            onCloseTab(tab.id);
                          }
                        }}
                      >
                        <div className="relative inline-flex items-center gap-2 min-w-0">
                          {tab.type === "table" ? (
                            <Table className="w-4 h-4 text-accent" />
                          ) : tab.type === "redis-key" ? (
                            <KeyRound className="w-4 h-4 text-accent" />
                          ) : tab.type === "redis-browser" ? (
                            <LayoutDashboard className="w-4 h-4 text-accent" />
                          ) : tab.type === "redis-server-info" ? (
                            <Server className="w-4 h-4 text-accent" />
                          ) : tab.type === "elasticsearch-index" ? (
                            <FileSearch className="w-4 h-4 text-accent" />
                          ) : (
                            <FileCode className="w-4 h-4 text-accent" />
                          )}
                          <span className="max-w-[120px] flex items-center">
                            <span className="truncate">
                              {title}
                            </span>
                            {tab.type === "editor" && tab.isDirty && (
                              <span
                                className="inline-block w-1.5 h-1.5 rounded-full bg-amber-500 ml-1 shrink-0"
                                aria-label={t("app.tab.unsavedChanges")}
                              />
                            )}
                          </span>
                          <button
                            type="button"
                            aria-label={t("app.tab.closeAria", { title })}
                            className="absolute right-1 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 p-1 hover:bg-accent rounded-sm cursor-pointer transition-opacity"
                            onClick={(e) => {
                              e.stopPropagation();
                              onCloseTab(tab.id);
                            }}
                          >
                            <X className="w-3 h-3 text-muted-foreground" />
                          </button>
                        </div>
                      </TabsTrigger>
                    </span>
                  </ContextMenuTrigger>
                  <ContextMenuContent>
                    <ContextMenuItem onClick={() => onCloseTab(tab.id)}>
                      {t("app.tab.closeTab")}
                    </ContextMenuItem>
                    <ContextMenuItem onClick={() => onCloseOtherTabs(tab.id)}>
                      {t("app.tab.closeOtherTabs")}
                    </ContextMenuItem>
                  </ContextMenuContent>
                </ContextMenu>
              </SortableTab>
            );
          })}
        </SortableContext>
      </DndContext>
    </TabsList>
  );
}
