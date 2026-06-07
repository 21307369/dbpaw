import { Bot, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { type AIProviderConfig, type AIProviderType } from "@/services/api";
import {
  AI_PROVIDER_OPTIONS,
  AI_PROVIDER_OPTIONS_BY_TYPE,
} from "./aiProviderOptions";

type AIProviderSettingsSectionProps = {
  providers: AIProviderConfig[];
  deletingProviderId: number | null;
  selectedProviderType: AIProviderType;
  providerBaseUrl: string;
  providerModel: string;
  providerApiKeyInput: string;
  providerHasApiKey: boolean;
  showProviderApiKey: boolean;
  onProviderTypeChange: (value: string) => void;
  onBaseUrlChange: (value: string) => void;
  onModelChange: (value: string) => void;
  onApiKeyInputChange: (value: string) => void;
  onShowApiKeyChange: (updater: (value: boolean) => boolean) => void;
  onClearProviderApiKey: () => void;
  onSaveProvider: () => void;
  onDeleteProvider: (id: number) => void;
};

export function AIProviderSettingsSection({
  providers,
  deletingProviderId,
  selectedProviderType,
  providerBaseUrl,
  providerModel,
  providerApiKeyInput,
  providerHasApiKey,
  showProviderApiKey,
  onProviderTypeChange,
  onBaseUrlChange,
  onModelChange,
  onApiKeyInputChange,
  onShowApiKeyChange,
  onClearProviderApiKey,
  onSaveProvider,
  onDeleteProvider,
}: AIProviderSettingsSectionProps) {
  const { t } = useTranslation();

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-medium flex items-center gap-2">
        <Bot className="w-5 h-5" /> {t("settings.aiProviders.title")}
      </h3>

      <div className="space-y-2 border rounded-md p-3">
        <div className="grid grid-cols-1 gap-2">
          <Select
            value={selectedProviderType}
            onValueChange={onProviderTypeChange}
          >
            <SelectTrigger>
              <SelectValue
                placeholder={t("settings.aiProviders.selectProvider")}
              />
            </SelectTrigger>
            <SelectContent>
              {AI_PROVIDER_OPTIONS.map((item) => (
                <SelectItem key={item.type} value={item.type}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            placeholder={t("settings.aiProviders.baseUrl")}
            value={providerBaseUrl}
            onChange={(e) => onBaseUrlChange(e.target.value)}
          />
          <Input
            placeholder={t("settings.aiProviders.model")}
            value={providerModel}
            onChange={(e) => onModelChange(e.target.value)}
          />
          <div className="flex gap-2">
            <Input
              placeholder={t("settings.aiProviders.apiKey")}
              type={showProviderApiKey ? "text" : "password"}
              value={providerApiKeyInput}
              onChange={(e) => onApiKeyInputChange(e.target.value)}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onShowApiKeyChange((v) => !v)}
            >
              {showProviderApiKey
                ? t("settings.aiProviders.hide")
                : t("settings.aiProviders.show")}
            </Button>
          </div>
          {providerHasApiKey && !providerApiKeyInput.trim() && (
            <div className="text-xs text-muted-foreground">
              {t("settings.aiProviders.keySavedHint")}
            </div>
          )}
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={onClearProviderApiKey}
            disabled={!providerHasApiKey}
          >
            {t("settings.aiProviders.clearKey")}
          </Button>
          <Button onClick={onSaveProvider} className="flex-1">
            {t("settings.aiProviders.saveProvider")}
          </Button>
        </div>
      </div>

      <div className="rounded-md border p-3 text-xs text-muted-foreground">
        <div>
          {t("settings.aiProviders.configured", {
            count: providers.length,
          })}
        </div>
        <div className="mt-2 border-t border-border/60 pt-2">
          <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground/90">
            {t("settings.aiProviders.configuredDetails")}
          </div>
          {providers.length > 0 ? (
            <div className="space-y-1">
              {providers.map((provider) => {
                const label =
                  AI_PROVIDER_OPTIONS_BY_TYPE[provider.providerType]?.label ||
                  provider.name ||
                  provider.providerType;
                return (
                  <div
                    key={provider.id}
                    className="flex items-center justify-between gap-2 rounded-sm bg-muted/40 px-2 py-1"
                  >
                    <span className="truncate">
                      {label} · {provider.model}
                    </span>
                    <div className="flex shrink-0 items-center gap-1">
                      {provider.isDefault && (
                        <span className="rounded border border-primary/40 bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                          {t("settings.aiProviders.default")}
                        </span>
                      )}
                      <button
                        type="button"
                        disabled={deletingProviderId === provider.id}
                        onClick={() => onDeleteProvider(provider.id)}
                        className="rounded-sm p-0.5 text-muted-foreground/60 transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-40 disabled:pointer-events-none"
                        title={t("settings.aiProviders.deleteProvider")}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div>{t("settings.aiProviders.empty")}</div>
          )}
        </div>
      </div>
    </div>
  );
}
