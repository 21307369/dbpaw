import type { Dispatch, SetStateAction } from "react";
import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useFormField } from "@/lib/connection-form/use-form-field";
import type { ConnectionForm } from "@/services/api";

interface ElasticsearchFormSectionProps {
  form: ConnectionForm;
  setForm: Dispatch<SetStateAction<ConnectionForm>>;
  dialogMode: "create" | "edit";
}

export function ElasticsearchFormSection({
  form,
  setForm,
  dialogMode,
}: ElasticsearchFormSectionProps) {
  const { t } = useTranslation();
  const [cloudId, onCloudIdChange] = useFormField(form, setForm, "cloudId");
  const [authMode, _onAuthModeChange] = useFormField(
    form,
    setForm,
    "authMode",
    (v) => v as "none" | "basic" | "api_key",
  );
  const [username, onUsernameChange] = useFormField(form, setForm, "username");
  const [password, onPasswordChange] = useFormField(form, setForm, "password");
  const [apiKeyEncoded, onApiKeyEncodedChange] = useFormField(
    form,
    setForm,
    "apiKeyEncoded",
  );
  const [apiKeyId, onApiKeyIdChange] = useFormField(form, setForm, "apiKeyId");
  const [apiKeySecret, onApiKeySecretChange] = useFormField(
    form,
    setForm,
    "apiKeySecret",
  );

  return (
    <>
      <div className="space-y-3 rounded-md border bg-muted/20 p-3">
        <div className="grid gap-2">
          <Label htmlFor="cloudId">
            {t("connection.dialog.fields.cloudId")}
          </Label>
          <Input
            id="cloudId"
            placeholder={t("connection.dialog.placeholders.cloudId")}
            value={cloudId || ""}
            onChange={onCloudIdChange}
          />
        </div>
      </div>

      <div className="space-y-3 rounded-md border bg-muted/20 p-3">
        <div className="grid gap-2">
          <Label htmlFor="authMode">
            {t("connection.dialog.fields.authMode")}
          </Label>
          <Select
            value={authMode || "none"}
            onValueChange={(v) =>
              setForm((current) => ({
                ...current,
                authMode: v as "none" | "basic" | "api_key",
              }))
            }
          >
            <SelectTrigger id="authMode">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">
                {t("connection.dialog.authMode.none")}
              </SelectItem>
              <SelectItem value="basic">
                {t("connection.dialog.authMode.basic")}
              </SelectItem>
              <SelectItem value="api_key">
                {t("connection.dialog.authMode.apiKey")}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
        {authMode === "basic" ? (
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="username">
                {t("connection.dialog.fields.username")}{" "}
                <span className="text-red-600">*</span>
              </Label>
              <Input
                id="username"
                value={username || ""}
                onChange={onUsernameChange}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="password">
                {t("connection.dialog.fields.password")}
              </Label>
              <Input
                id="password"
                type="password"
                placeholder={
                  dialogMode === "edit"
                    ? t("connection.dialog.placeholders.keepPassword")
                    : undefined
                }
                value={password || ""}
                onChange={onPasswordChange}
              />
            </div>
          </div>
        ) : null}
        {authMode === "api_key" ? (
          <div className="space-y-3">
            <div className="grid gap-2">
              <Label htmlFor="apiKeyEncoded">
                {t("connection.dialog.fields.apiKeyEncoded")}
              </Label>
              <Input
                id="apiKeyEncoded"
                type="password"
                placeholder={
                  dialogMode === "edit"
                    ? t("connection.dialog.placeholders.keepApiKey")
                    : undefined
                }
                value={apiKeyEncoded || ""}
                onChange={onApiKeyEncodedChange}
              />
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="apiKeyId">
                  {t("connection.dialog.fields.apiKeyId")}
                </Label>
                <Input
                  id="apiKeyId"
                  value={apiKeyId || ""}
                  onChange={onApiKeyIdChange}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="apiKeySecret">
                  {t("connection.dialog.fields.apiKeySecret")}
                </Label>
                <Input
                  id="apiKeySecret"
                  type="password"
                  placeholder={
                    dialogMode === "edit"
                      ? t("connection.dialog.placeholders.keepApiKey")
                      : undefined
                  }
                  value={apiKeySecret || ""}
                  onChange={onApiKeySecretChange}
                />
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </>
  );
}
