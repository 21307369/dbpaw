import { LayoutPanelLeft } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { SidebarLayout } from "./settingsTypes";

type LayoutSettingsSectionProps = {
  layoutMode: SidebarLayout;
  onLayoutChange: (layout: SidebarLayout) => void;
};

export function LayoutSettingsSection({
  layoutMode,
  onLayoutChange,
}: LayoutSettingsSectionProps) {
  const { t } = useTranslation();

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-medium flex items-center gap-2">
        <LayoutPanelLeft className="w-5 h-5" /> {t("settings.layout.title")}
      </h3>
      <div className="grid grid-cols-2 gap-4 items-center">
        <div className="space-y-1">
          <Label className="text-base">{t("settings.layout.modeTitle")}</Label>
          <p className="text-xs text-muted-foreground">
            {t("settings.layout.modeDescription")}
          </p>
        </div>
        <Select
          value={layoutMode}
          onValueChange={(value) => onLayoutChange(value as SidebarLayout)}
        >
          <SelectTrigger>
            <SelectValue placeholder={t("settings.layout.modeTitle")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="tabs">
              {t("settings.layout.modeTabs")}
            </SelectItem>
            <SelectItem value="tree">
              {t("settings.layout.modeTree")}
            </SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
