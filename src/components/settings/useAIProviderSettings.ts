import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  type AIProviderConfig,
  type AIProviderForm,
  type AIProviderType,
  api,
} from "@/services/api";
import { errorMessage } from "@/lib/errors";
import {
  AI_PROVIDER_OPTIONS,
  AI_PROVIDER_OPTIONS_BY_TYPE,
} from "./aiProviderOptions";

export function useAIProviderSettings(open: boolean) {
  const { t } = useTranslation();
  const [providers, setProviders] = useState<AIProviderConfig[]>([]);
  const [deletingProviderId, setDeletingProviderId] = useState<number | null>(
    null,
  );
  const [selectedProviderType, setSelectedProviderType] =
    useState<AIProviderType>(AI_PROVIDER_OPTIONS[0].type);
  const [providerBaseUrl, setProviderBaseUrl] = useState(
    AI_PROVIDER_OPTIONS[0].baseUrl,
  );
  const [providerModel, setProviderModel] = useState(
    AI_PROVIDER_OPTIONS[0].model,
  );
  const [providerApiKeyInput, setProviderApiKeyInput] = useState("");
  const [providerHasApiKey, setProviderHasApiKey] = useState(false);
  const [showProviderApiKey, setShowProviderApiKey] = useState(false);

  function applyProviderToForm(
    providerType: AIProviderType,
    source: AIProviderConfig[],
  ) {
    const option =
      AI_PROVIDER_OPTIONS_BY_TYPE[providerType] ?? AI_PROVIDER_OPTIONS[0];
    const existing = source.find((p) => p.providerType === providerType);
    setSelectedProviderType(option.type);
    setProviderBaseUrl(existing?.baseUrl ?? option.baseUrl);
    setProviderModel(existing?.model ?? option.model);
    setProviderHasApiKey(existing?.hasApiKey ?? false);
    setProviderApiKeyInput("");
    setShowProviderApiKey(false);
  }

  useEffect(() => {
    if (!open) return;

    api.ai.providers
      .list()
      .then((list) => {
        setProviders(list);
        const selected = list.find((p) => p.isDefault) ?? list[0];
        if (selected && AI_PROVIDER_OPTIONS_BY_TYPE[selected.providerType]) {
          applyProviderToForm(selected.providerType, list);
        } else {
          applyProviderToForm(AI_PROVIDER_OPTIONS[0].type, list);
        }
      })
      .catch((e) => {
        console.error(e);
        toast.error(t("settings.aiProviders.loadFailed"));
      });
  }, [open, t]);

  const reloadProviders = async () => {
    const list = await api.ai.providers.list();
    setProviders(list);
    return list;
  };

  const handleProviderTypeChange = (value: string) => {
    applyProviderToForm(value as AIProviderType, providers);
  };

  const handleSaveProvider = async () => {
    try {
      const selectedOption =
        AI_PROVIDER_OPTIONS_BY_TYPE[selectedProviderType] ??
        AI_PROVIDER_OPTIONS[0];
      const existing = providers.find(
        (p) => p.providerType === selectedProviderType,
      );
      const apiKey = providerApiKeyInput.trim();
      const requireApiKey = !existing || !existing.hasApiKey;
      if (
        !providerBaseUrl.trim() ||
        !providerModel.trim() ||
        (requireApiKey && !apiKey)
      ) {
        toast.error(t("settings.aiProviders.fillRequired"));
        return;
      }

      const payload: AIProviderForm = {
        name: selectedOption.label,
        providerType: selectedProviderType,
        baseUrl: providerBaseUrl.trim(),
        model: providerModel.trim(),
        enabled: true,
        isDefault: true,
        ...(apiKey ? { apiKey } : {}),
      };

      if (existing) {
        await api.ai.providers.update(existing.id, payload);
      } else {
        await api.ai.providers.create(payload);
      }
      const updated = await reloadProviders();
      applyProviderToForm(selectedProviderType, updated);
      toast.success(t("settings.aiProviders.saveSuccess"));
    } catch (e) {
      toast.error(t("settings.aiProviders.saveFailed"), {
        description: errorMessage(e),
      });
    }
  };

  const handleClearProviderApiKey = async () => {
    if (!providerHasApiKey) return;
    try {
      await api.ai.providers.clearApiKey(selectedProviderType);
      const updated = await reloadProviders();
      applyProviderToForm(selectedProviderType, updated);
      toast.success(t("settings.aiProviders.clearSuccess"));
    } catch (e) {
      toast.error(t("settings.aiProviders.clearFailed"), {
        description: errorMessage(e),
      });
    }
  };

  const handleDeleteProvider = async (id: number) => {
    if (deletingProviderId != null) return;
    setDeletingProviderId(id);
    try {
      await api.ai.providers.delete(id);
      const updated = await reloadProviders();
      applyProviderToForm(selectedProviderType, updated);
      toast.success(t("settings.aiProviders.deleteSuccess"));
    } catch (e) {
      toast.error(t("settings.aiProviders.deleteFailed"), {
        description: errorMessage(e),
      });
    } finally {
      setDeletingProviderId(null);
    }
  };

  return {
    providers,
    deletingProviderId,
    selectedProviderType,
    providerBaseUrl,
    providerModel,
    providerApiKeyInput,
    providerHasApiKey,
    showProviderApiKey,
    handleProviderTypeChange,
    handleSaveProvider,
    handleClearProviderApiKey,
    handleDeleteProvider,
    setProviderBaseUrl,
    setProviderModel,
    setProviderApiKeyInput,
    setShowProviderApiKey,
  };
}
