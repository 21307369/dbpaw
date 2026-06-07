import { Palette, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  DEFAULT_FONT_FAMILY,
  MAX_EDITOR_FONT_SIZE_PX,
  MAX_FONT_SIZE_PX,
  MIN_EDITOR_FONT_SIZE_PX,
  MIN_FONT_SIZE_PX,
  useTheme,
} from "@/components/theme-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { type UpdateTaskState } from "@/services/updater";
import { api } from "@/services/api";
import { ThemeId, THEME_PRESETS } from "@/theme/themeRegistry";
import { LanguageSelector } from "./LanguageSelector";

type GeneralSettingsSectionProps = {
  autoUpdate: boolean;
  checking: boolean;
  updateTaskState: UpdateTaskState;
  showColumnComments: boolean;
  showRowNumbers: boolean;
  showZebraStripes: boolean;
  onAutoUpdateChange: (checked: boolean) => void;
  onCheckUpdate: () => void;
  onShowColumnCommentsChange: (checked: boolean) => void;
  onShowRowNumbersChange: (checked: boolean) => void;
  onShowZebraStripesChange: (checked: boolean) => void;
};

export function GeneralSettingsSection({
  autoUpdate,
  checking,
  updateTaskState,
  showColumnComments,
  showRowNumbers,
  showZebraStripes,
  onAutoUpdateChange,
  onCheckUpdate,
  onShowColumnCommentsChange,
  onShowRowNumbersChange,
  onShowZebraStripesChange,
}: GeneralSettingsSectionProps) {
  const { t } = useTranslation();
  const {
    theme,
    setTheme,
    fontSizePx,
    setFontSizePx,
    editorFontSizePx,
    setEditorFontSizePx,
    fontFamily,
    setFontFamily,
  } = useTheme();
  const [fontSizeInput, setFontSizeInput] = useState(String(fontSizePx));
  const [editorFontSizeInput, setEditorFontSizeInput] = useState(
    String(editorFontSizePx),
  );
  const [fontList, setFontList] = useState<string[]>([]);

  useEffect(() => {
    setFontSizeInput(String(fontSizePx));
  }, [fontSizePx]);

  useEffect(() => {
    setEditorFontSizeInput(String(editorFontSizePx));
  }, [editorFontSizePx]);

  const loadFonts = () => {
    if (fontList.length === 0) {
      api.system.listFonts().then(setFontList).catch(console.error);
    }
  };

  const clampFontSize = (size: number) => {
    const rounded = Math.round(size);
    return Math.min(MAX_FONT_SIZE_PX, Math.max(MIN_FONT_SIZE_PX, rounded));
  };

  const clampEditorFontSize = (size: number) => {
    const rounded = Math.round(size);
    return Math.min(
      MAX_EDITOR_FONT_SIZE_PX,
      Math.max(MIN_EDITOR_FONT_SIZE_PX, rounded),
    );
  };

  const commitFontSizeInput = () => {
    const trimmed = fontSizeInput.trim();
    if (!trimmed) {
      setFontSizeInput(String(fontSizePx));
      return;
    }

    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed)) {
      setFontSizeInput(String(fontSizePx));
      return;
    }

    const normalized = clampFontSize(parsed);
    setFontSizePx(normalized);
    setFontSizeInput(String(normalized));
  };

  const commitEditorFontSizeInput = () => {
    const trimmed = editorFontSizeInput.trim();
    if (!trimmed) {
      setEditorFontSizeInput(String(editorFontSizePx));
      return;
    }

    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed)) {
      setEditorFontSizeInput(String(editorFontSizePx));
      return;
    }

    const normalized = clampEditorFontSize(parsed);
    setEditorFontSizePx(normalized);
    setEditorFontSizeInput(String(normalized));
  };

  const checkingDisabled =
    checking ||
    updateTaskState === "checking" ||
    updateTaskState === "downloading" ||
    updateTaskState === "installing";

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <LanguageSelector />
        <h3 className="text-lg font-medium flex items-center gap-2">
          <Palette className="w-5 h-5" /> {t("settings.appearance.title")}
        </h3>

        <div className="grid grid-cols-2 gap-4 items-center">
          <div className="space-y-1">
            <Label className="text-base">
              {t("settings.appearance.themeTitle")}
            </Label>
            <p className="text-xs text-muted-foreground">
              {t("settings.appearance.themeDescription")}
            </p>
          </div>
          <Select value={theme} onValueChange={(v) => setTheme(v as ThemeId)}>
            <SelectTrigger>
              <SelectValue placeholder={t("settings.appearance.selectTheme")} />
            </SelectTrigger>
            <SelectContent>
              {Object.values(THEME_PRESETS)
                .filter((preset) => preset.appearance === "light")
                .map((preset) => (
                  <SelectItem key={preset.id} value={preset.id}>
                    {preset.label}
                  </SelectItem>
                ))}
              {Object.values(THEME_PRESETS)
                .filter((preset) => preset.appearance === "dark")
                .map((preset) => (
                  <SelectItem key={preset.id} value={preset.id}>
                    {preset.label}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-2 gap-4 items-center">
          <div className="space-y-1">
            <Label className="text-base">
              {t("settings.appearance.fontFamilyTitle")}
            </Label>
            <p className="text-xs text-muted-foreground">
              {t("settings.appearance.fontFamilyDescription")}
            </p>
          </div>
          <Select
            value={fontFamily}
            onValueChange={(v) => setFontFamily(v)}
            onOpenChange={(open) => {
              if (open) loadFonts();
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder={t("settings.appearance.selectFont")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={DEFAULT_FONT_FAMILY}>
                {t("settings.appearance.systemDefault")}
              </SelectItem>
              {fontList.map((font) => (
                <SelectItem
                  key={font}
                  value={font}
                  style={{ fontFamily: font }}
                >
                  {font}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-2 gap-4 items-center">
          <div className="space-y-1">
            <Label className="text-base">
              {t("settings.appearance.fontSizeTitle")}
            </Label>
            <p className="text-xs text-muted-foreground">
              {t("settings.appearance.fontSizeDescription", {
                min: MIN_FONT_SIZE_PX,
                max: MAX_FONT_SIZE_PX,
              })}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min={MIN_FONT_SIZE_PX}
              max={MAX_FONT_SIZE_PX}
              step={1}
              value={fontSizeInput}
              onChange={(e) => setFontSizeInput(e.target.value)}
              onBlur={commitFontSizeInput}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  commitFontSizeInput();
                }
              }}
            />
            <span className="text-sm text-muted-foreground">px</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 items-center">
          <div className="space-y-1">
            <Label className="text-base">
              {t("settings.appearance.editorFontSizeTitle")}
            </Label>
            <p className="text-xs text-muted-foreground">
              {t("settings.appearance.editorFontSizeDescription", {
                min: MIN_EDITOR_FONT_SIZE_PX,
                max: MAX_EDITOR_FONT_SIZE_PX,
              })}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min={MIN_EDITOR_FONT_SIZE_PX}
              max={MAX_EDITOR_FONT_SIZE_PX}
              step={1}
              value={editorFontSizeInput}
              onChange={(e) => setEditorFontSizeInput(e.target.value)}
              onBlur={commitEditorFontSizeInput}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  commitEditorFontSizeInput();
                }
              }}
            />
            <span className="text-sm text-muted-foreground">px</span>
          </div>
        </div>

        <DataGridSwitch
          label={t("settings.dataGrid.showColumnComments")}
          description={t("settings.dataGrid.showColumnCommentsDescription")}
          checked={showColumnComments}
          onCheckedChange={onShowColumnCommentsChange}
        />
        <DataGridSwitch
          label={t("settings.dataGrid.showRowNumbers")}
          description={t("settings.dataGrid.showRowNumbersDescription")}
          checked={showRowNumbers}
          onCheckedChange={onShowRowNumbersChange}
        />
        <DataGridSwitch
          label={t("settings.dataGrid.showZebraStripes")}
          description={t("settings.dataGrid.showZebraStripesDescription")}
          checked={showZebraStripes}
          onCheckedChange={onShowZebraStripesChange}
        />
      </div>

      <Separator />

      <div className="space-y-4">
        <h3 className="text-lg font-medium flex items-center gap-2">
          <RefreshCw className="w-5 h-5" /> {t("settings.updates.title")}
        </h3>
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <Label className="text-base">
              {t("settings.updates.autoUpdate")}
            </Label>
            <p className="text-xs text-muted-foreground">
              {t("settings.updates.autoUpdateDescription")}
            </p>
          </div>
          <Switch checked={autoUpdate} onCheckedChange={onAutoUpdateChange} />
        </div>
        <Button
          variant="outline"
          className="w-full"
          onClick={onCheckUpdate}
          disabled={checkingDisabled}
        >
          {updateTaskState === "ready_to_restart"
            ? t("settings.updates.restartNow")
            : checking
              ? t("settings.updates.checking")
              : updateTaskState === "checking" ||
                  updateTaskState === "downloading" ||
                  updateTaskState === "installing"
                ? t("settings.updates.updating")
                : t("settings.updates.checkNow")}
        </Button>
      </div>
    </div>
  );
}

type DataGridSwitchProps = {
  label: string;
  description: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
};

function DataGridSwitch({
  label,
  description,
  checked,
  onCheckedChange,
}: DataGridSwitchProps) {
  return (
    <div className="flex items-center justify-between">
      <div className="space-y-1">
        <Label className="text-base">{label}</Label>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}
