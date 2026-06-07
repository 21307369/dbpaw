import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { saveSetting } from "@/services/store";
import { AboutSection } from "./AboutSection";
import { AIProviderSettingsSection } from "./AIProviderSettingsSection";
import { GeneralSettingsSection } from "./GeneralSettingsSection";
import { LayoutSettingsSection } from "./LayoutSettingsSection";
import { McpSettings } from "./McpSettings";
import { SettingsNav } from "./SettingsNav";
import { ShortcutsSettingsSection } from "./ShortcutsSettingsSection";
import type { SettingsSection, SidebarLayout } from "./settingsTypes";
import { useAIProviderSettings } from "./useAIProviderSettings";
import { useSettingsUpdates } from "./useSettingsUpdates";

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sidebarLayout?: SidebarLayout;
  onSidebarLayoutChange?: (layout: SidebarLayout) => void;
  showColumnComments?: boolean;
  onShowColumnCommentsChange?: (v: boolean) => void;
  showRowNumbers?: boolean;
  onShowRowNumbersChange?: (v: boolean) => void;
  showZebraStripes?: boolean;
  onShowZebraStripesChange?: (v: boolean) => void;
}

export function SettingsDialog({
  open,
  onOpenChange,
  sidebarLayout = "tabs",
  onSidebarLayoutChange,
  showColumnComments: showColumnCommentsProp = false,
  onShowColumnCommentsChange,
  showRowNumbers: showRowNumbersProp = true,
  onShowRowNumbersChange,
  showZebraStripes: showZebraStripesProp = false,
  onShowZebraStripesChange,
}: SettingsDialogProps) {
  const { t } = useTranslation();
  const [activeSection, setActiveSection] =
    useState<SettingsSection>("general");
  const [layoutMode, setLayoutMode] = useState<SidebarLayout>(sidebarLayout);
  const [showColumnComments, setShowColumnComments] = useState(false);
  const [showRowNumbers, setShowRowNumbers] = useState(true);
  const [showZebraStripes, setShowZebraStripes] = useState(false);
  const updateSettings = useSettingsUpdates(open);
  const aiProviderSettings = useAIProviderSettings(open);

  useEffect(() => {
    if (!open) return;

    setActiveSection("general");
    setLayoutMode(sidebarLayout);
    setShowColumnComments(showColumnCommentsProp);
    setShowRowNumbers(showRowNumbersProp);
    setShowZebraStripes(showZebraStripesProp);
  }, [
    open,
    showColumnCommentsProp,
    showRowNumbersProp,
    showZebraStripesProp,
    sidebarLayout,
  ]);

  const handleLayoutChange = async (value: SidebarLayout) => {
    setLayoutMode(value);
    await saveSetting("sidebarLayout", value);
    onSidebarLayoutChange?.(value);
  };

  const toggleShowColumnComments = async (checked: boolean) => {
    setShowColumnComments(checked);
    await saveSetting("showColumnComments", checked);
    onShowColumnCommentsChange?.(checked);
  };

  const toggleShowRowNumbers = async (checked: boolean) => {
    setShowRowNumbers(checked);
    await saveSetting("showRowNumbers", checked);
    onShowRowNumbersChange?.(checked);
  };

  const toggleShowZebraStripes = async (checked: boolean) => {
    setShowZebraStripes(checked);
    await saveSetting("showZebraStripes", checked);
    onShowZebraStripesChange?.(checked);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[860px] w-[92vw] h-[80vh] max-h-[80vh] flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>{t("settings.title")}</DialogTitle>
          <DialogDescription>{t("settings.description")}</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 sm:grid-cols-[190px_1fr] gap-4 py-2 min-h-0 flex-1">
          <SettingsNav
            activeSection={activeSection}
            onSectionChange={setActiveSection}
          />

          <div className="border rounded-lg p-4 overflow-y-auto min-h-0">
            {activeSection === "general" && (
              <GeneralSettingsSection
                autoUpdate={updateSettings.autoUpdate}
                checking={updateSettings.checking}
                updateTaskState={updateSettings.updateTaskState}
                showColumnComments={showColumnComments}
                showRowNumbers={showRowNumbers}
                showZebraStripes={showZebraStripes}
                onAutoUpdateChange={(checked) => {
                  void updateSettings.toggleAutoUpdate(checked);
                }}
                onCheckUpdate={() => {
                  void updateSettings.handleCheckUpdate();
                }}
                onShowColumnCommentsChange={(checked) => {
                  void toggleShowColumnComments(checked);
                }}
                onShowRowNumbersChange={(checked) => {
                  void toggleShowRowNumbers(checked);
                }}
                onShowZebraStripesChange={(checked) => {
                  void toggleShowZebraStripes(checked);
                }}
              />
            )}

            {activeSection === "layout" && (
              <LayoutSettingsSection
                layoutMode={layoutMode}
                onLayoutChange={(value) => {
                  void handleLayoutChange(value);
                }}
              />
            )}

            {activeSection === "ai" && (
              <AIProviderSettingsSection
                providers={aiProviderSettings.providers}
                deletingProviderId={aiProviderSettings.deletingProviderId}
                selectedProviderType={aiProviderSettings.selectedProviderType}
                providerBaseUrl={aiProviderSettings.providerBaseUrl}
                providerModel={aiProviderSettings.providerModel}
                providerApiKeyInput={aiProviderSettings.providerApiKeyInput}
                providerHasApiKey={aiProviderSettings.providerHasApiKey}
                showProviderApiKey={aiProviderSettings.showProviderApiKey}
                onProviderTypeChange={
                  aiProviderSettings.handleProviderTypeChange
                }
                onBaseUrlChange={aiProviderSettings.setProviderBaseUrl}
                onModelChange={aiProviderSettings.setProviderModel}
                onApiKeyInputChange={aiProviderSettings.setProviderApiKeyInput}
                onShowApiKeyChange={aiProviderSettings.setShowProviderApiKey}
                onClearProviderApiKey={() => {
                  void aiProviderSettings.handleClearProviderApiKey();
                }}
                onSaveProvider={() => {
                  void aiProviderSettings.handleSaveProvider();
                }}
                onDeleteProvider={(id) => {
                  void aiProviderSettings.handleDeleteProvider(id);
                }}
              />
            )}

            {activeSection === "shortcuts" && <ShortcutsSettingsSection />}

            {activeSection === "mcp" && <McpSettings />}

            {activeSection === "about" && <AboutSection />}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
