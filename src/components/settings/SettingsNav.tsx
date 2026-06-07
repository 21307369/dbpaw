import {
  Bot,
  Command,
  Info,
  LayoutPanelLeft,
  Server,
  Settings2,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import type { SettingsSection } from "./settingsTypes";

type SettingsNavProps = {
  activeSection: SettingsSection;
  onSectionChange: (section: SettingsSection) => void;
};

const NAV_ITEMS = [
  {
    section: "general",
    icon: Settings2,
    labelKey: "settings.sections.general",
  },
  {
    section: "layout",
    icon: LayoutPanelLeft,
    labelKey: "settings.sections.layout",
  },
  {
    section: "ai",
    icon: Bot,
    labelKey: "settings.sections.ai",
  },
  {
    section: "shortcuts",
    icon: Command,
    labelKey: "settings.sections.shortcuts",
  },
  {
    section: "mcp",
    icon: Server,
    labelKey: "settings.sections.mcp",
  },
  {
    section: "about",
    icon: Info,
    labelKey: "settings.sections.about",
  },
] satisfies {
  section: SettingsSection;
  icon: typeof Settings2;
  labelKey: string;
}[];

export function SettingsNav({
  activeSection,
  onSectionChange,
}: SettingsNavProps) {
  const { t } = useTranslation();

  return (
    <div className="border rounded-lg p-2 bg-muted/25 h-fit">
      <div className="space-y-1">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.section}
              className={`w-full text-left rounded-md px-3 py-2 text-sm transition-colors flex items-center gap-2 ${
                activeSection === item.section
                  ? "bg-background shadow-sm text-foreground"
                  : "text-muted-foreground hover:bg-muted/60"
              }`}
              onClick={() => onSectionChange(item.section)}
            >
              <Icon className="w-4 h-4" />
              {t(item.labelKey)}
            </button>
          );
        })}
      </div>
    </div>
  );
}
