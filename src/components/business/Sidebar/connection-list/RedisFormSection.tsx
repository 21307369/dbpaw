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
import { Textarea } from "@/components/ui/textarea";
import { getDefaultPort } from "@/lib/driver-registry";
import {
  formatRedisNodeList,
  getRedisConnectionMode,
  normalizeRedisNodeListInput,
} from "@/lib/connection-form/rules";
import { useFormField } from "@/lib/connection-form/use-form-field";
import type { ConnectionForm } from "@/services/api";

interface RedisFormSectionProps {
  form: ConnectionForm;
  setForm: Dispatch<SetStateAction<ConnectionForm>>;
}

export function RedisFormSection({ form, setForm }: RedisFormSectionProps) {
  const { t } = useTranslation();
  const redisMode = getRedisConnectionMode(form);
  const [connectTimeoutMs, onConnectTimeoutMsChange] = useFormField(
    form,
    setForm,
    "connectTimeoutMs",
    (v) => Number(v) || undefined,
  );

  return (
    <div className="space-y-3 rounded-md border bg-muted/20 p-3">
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="redisMode">
            {t("connection.dialog.fields.redisMode")}
          </Label>
          <Select
            value={redisMode}
            onValueChange={(
              value: "standalone" | "cluster" | "sentinel",
            ) =>
              setForm((current) => ({
                ...current,
                mode: value,
                host: value === "standalone" ? current.host : "",
                port:
                  value === "standalone"
                    ? current.port || getDefaultPort("redis") || undefined
                    : undefined,
              }))
            }
          >
            <SelectTrigger id="redisMode">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="standalone">
                {t("connection.dialog.redisMode.standalone")}
              </SelectItem>
              <SelectItem value="cluster">
                {t("connection.dialog.redisMode.cluster")}
              </SelectItem>
              <SelectItem value="sentinel">
                {t("connection.dialog.redisMode.sentinel")}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="connectTimeoutMs">
            {t("connection.dialog.fields.connectTimeoutMs")}
          </Label>
          <Input
            id="connectTimeoutMs"
            placeholder="5000"
            value={String(connectTimeoutMs || "")}
            onChange={onConnectTimeoutMsChange}
          />
        </div>
      </div>
      {redisMode === "standalone" ? (
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="host">
              {t("connection.dialog.fields.host")}{" "}
              <span className="text-red-600">*</span>
            </Label>
            <Input
              id="host"
              placeholder="127.0.0.1"
              value={form.host || ""}
              onChange={(e) =>
                setForm((current) => ({
                  ...current,
                  host: e.target.value,
                }))
              }
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="port">
              {t("connection.dialog.fields.port")}{" "}
              <span className="text-red-600">*</span>
            </Label>
            <Input
              id="port"
              placeholder={String(getDefaultPort("redis") ?? "")}
              value={String(form.port || "")}
              onChange={(e) =>
                setForm((current) => ({
                  ...current,
                  port: Number(e.target.value) || undefined,
                }))
              }
            />
          </div>
        </div>
      ) : null}
      {redisMode === "cluster" ? (
        <div className="grid gap-2">
          <Label htmlFor="seedNodes">
            {t("connection.dialog.fields.seedNodes")}{" "}
            <span className="text-red-600">*</span>
          </Label>
          <Textarea
            id="seedNodes"
            rows={4}
            placeholder={t("connection.dialog.placeholders.seedNodes")}
            value={formatRedisNodeList(form.seedNodes)}
            onChange={(e) =>
              setForm((current) => ({
                ...current,
                seedNodes: normalizeRedisNodeListInput(e.target.value),
              }))
            }
          />
        </div>
      ) : null}
      {redisMode === "sentinel" ? (
        <div className="space-y-3">
          <div className="grid gap-2">
            <Label htmlFor="sentinels">
              {t("connection.dialog.fields.sentinels")}{" "}
              <span className="text-red-600">*</span>
            </Label>
            <Textarea
              id="sentinels"
              rows={4}
              placeholder={t("connection.dialog.placeholders.sentinels")}
              value={formatRedisNodeList(form.sentinels)}
              onChange={(e) =>
                setForm((current) => ({
                  ...current,
                  sentinels: normalizeRedisNodeListInput(e.target.value),
                }))
              }
            />
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="serviceName">
                {t("connection.dialog.fields.serviceName")}
              </Label>
              <Input
                id="serviceName"
                placeholder={t("connection.dialog.placeholders.serviceName")}
                value={form.serviceName || ""}
                onChange={(e) =>
                  setForm((current) => ({
                    ...current,
                    serviceName: e.target.value,
                  }))
                }
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="sentinelPassword">
                {t("connection.dialog.fields.sentinelPassword")}
              </Label>
              <Input
                id="sentinelPassword"
                type="password"
                placeholder={t(
                  "connection.dialog.placeholders.sentinelPassword",
                )}
                value={form.sentinelPassword || ""}
                onChange={(e) =>
                  setForm((current) => ({
                    ...current,
                    sentinelPassword: e.target.value,
                  }))
                }
              />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
