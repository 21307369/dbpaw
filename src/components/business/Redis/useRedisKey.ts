import { useEffect, useState } from "react";
import { api } from "@/services/api";
import type { RedisKeyValue, RedisValue } from "@/services/api";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { errorMessage, handleApiError } from "@/lib/errors";
import {
  countRedisValueItems,
  isRedisValuePagePartial,
  parseRedisTtlSeconds,
} from "./redis-utils";
import { TYPE_BADGE } from "./redis-type-colors";
import {
  mergeValues,
  isValueUnchanged,
  getJsonValidationError,
  buildPatch,
} from "./redis-patch";

type RedisKind = RedisValue["kind"];

const EDITABLE_KINDS: RedisKind[] = [
  "string",
  "hash",
  "list",
  "set",
  "zSet",
  "stream",
  "json",
];

const KIND_DEFAULT: Record<RedisKind, RedisValue> = {
  string: { kind: "string", value: "" },
  hash: { kind: "hash", value: {} },
  list: { kind: "list", value: [] },
  set: { kind: "set", value: [] },
  zSet: { kind: "zSet", value: [] },
  stream: { kind: "stream", value: [] },
  json: { kind: "json", value: "{}" },
  none: { kind: "none" },
};

interface UseRedisKeyParams {
  connectionId: number;
  database: string;
  redisKey: string;
  onDeleted?: () => void;
  onSavedKeyChange?: (key: string) => void;
}

export function useRedisKey({
  connectionId,
  database,
  redisKey,
  onDeleted,
  onSavedKeyChange,
}: UseRedisKeyParams) {
  const { t } = useTranslation();
  const [record, setRecord] = useState<RedisKeyValue | null>(null);
  const [value, setValue] = useState<RedisValue>({ kind: "string", value: "" });
  const [originalValue, setOriginalValue] = useState<RedisValue>({
    kind: "string",
    value: "",
  });
  const [originalLoadedCount, setOriginalLoadedCount] = useState(0);
  const [keyName, setKeyName] = useState(redisKey);
  const [ttl, setTtl] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [pendingAction, setPendingAction] = useState<
    "delete" | "overwrite" | "binary_overwrite" | "force_rename" | null
  >(null);
  const [valueIsPartial, setValueIsPartial] = useState(false);
  const [valueTotalLen, setValueTotalLen] = useState<number | null>(null);
  const [loadedOffset, setLoadedOffset] = useState(0);
  const [loadedCount, setLoadedCount] = useState(0);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  interface SetOptions {
    expanded: boolean;
    nx: boolean;
    xx: boolean;
    px: string;
    keepttl: boolean;
  }

  const [setOptions, setSetOptions] = useState<SetOptions>({
    expanded: false,
    nx: false,
    xx: false,
    px: "",
    keepttl: false,
  });

  const handleSetOptionsChange = (patch: Partial<SetOptions>) =>
    setSetOptions((prev) => ({ ...prev, ...patch }));

  const isCreateMode = redisKey.trim().length === 0;
  const jsonValidationError = getJsonValidationError(value);
  const jsonModuleMissing =
    value.kind === "json" && record?.extra?.subtype === "json-module-missing";

  const load = async () => {
    if (isCreateMode) {
      setRecord(null);
      setKeyName("");
      setTtl("");
      setValue({ kind: "string", value: "" });
      setValueIsPartial(false);
      setValueTotalLen(null);
      return;
    }
    setIsLoading(true);
    try {
      const next = await api.redis.getKey(connectionId, database, redisKey);
      setRecord(next);
      const v = next.value;
      const resolvedKind = EDITABLE_KINDS.includes(v.kind) ? v.kind : "string";
      setValue(resolvedKind === v.kind ? v : KIND_DEFAULT[resolvedKind]);
      setKeyName(next.key);
      setTtl(next.ttl > 0 ? String(next.ttl) : "");
      const count = countRedisValueItems(v);
      setLoadedCount(count);
      const total = next.valueTotalLen ?? null;
      setValueTotalLen(total);
      setValueIsPartial(
        isRedisValuePagePartial(v, total, next.valueOffset, count),
      );
      setLoadedOffset(next.valueOffset);
      setOriginalValue(
        resolvedKind === v.kind ? v : KIND_DEFAULT[resolvedKind],
      );
      setOriginalLoadedCount(count);
    } catch (e) {
      handleApiError(t("redis.key.loadFailed"), e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [connectionId, database, redisKey, isCreateMode]);

  const handleLoadMore = async () => {
    if (!record) return;
    setIsLoadingMore(true);
    try {
      const page = await api.redis.getKeyPage(
        connectionId,
        database,
        redisKey,
        loadedOffset,
        200,
      );
      const merged = mergeValues(value, page.value);
      setValue(merged);
      const newCount = countRedisValueItems(merged);
      setLoadedCount(newCount);
      setLoadedOffset(page.valueOffset);
      setValueIsPartial(
        isRedisValuePagePartial(
          page.value,
          page.valueTotalLen,
          page.valueOffset,
          newCount,
        ),
      );
    } catch (e) {
      handleApiError(t("redis.key.loadMoreFailed"), e);
    } finally {
      setIsLoadingMore(false);
    }
  };

  const doSave = async (forceRename?: boolean) => {
    const normalizedKey = keyName.trim();
    if (!normalizedKey) throw new Error("Redis key cannot be empty");
    if (value.kind === "json") {
      if (jsonModuleMissing) {
        throw new Error(
          "RedisJSON module is unavailable for this key. Saving is disabled.",
        );
      }
      if (jsonValidationError) {
        throw new Error(`Invalid JSON: ${jsonValidationError}`);
      }
    }
    const parsedTtl = parseRedisTtlSeconds(ttl);
    if (!isCreateMode && normalizedKey !== redisKey) {
      try {
        await api.redis.renameKey(
          connectionId,
          database,
          redisKey,
          normalizedKey,
          forceRename,
        );
      } catch (e) {
        const msg = errorMessage(e);
        if (msg.includes("already exists") && !forceRename) {
          setPendingAction("force_rename");
          return;
        }
        throw e;
      }
    }
    const ttlOnly =
      !isCreateMode &&
      normalizedKey === redisKey &&
      isValueUnchanged(originalValue, value);

    if (isCreateMode) {
      const pxValue = setOptions.px.trim() ? parseInt(setOptions.px, 10) : undefined;
      await api.redis.setKey(connectionId, database, {
        key: normalizedKey,
        value,
        ttlSeconds: parsedTtl,
        setNx: setOptions.nx || undefined,
        setXx: setOptions.xx || undefined,
        setPx: pxValue && pxValue > 0 ? pxValue : undefined,
        setKeepttl: setOptions.keepttl || undefined,
      });
    } else if (ttlOnly) {
      await api.redis.setTtl(connectionId, database, normalizedKey, parsedTtl);
      toast.success("TTL updated");
      await load();
      return;
    } else if (value.kind === "json") {
      await api.redis.updateKey(connectionId, database, {
        key: normalizedKey,
        value,
        ttlSeconds: parsedTtl,
      });
    } else if (valueIsPartial) {
      const originalTtl = record?.ttl ?? -1;
      const patchTtlSeconds: number | null = ttl.trim()
        ? parsedTtl
        : originalTtl > 0
          ? 0
          : null;
      const patch = buildPatch(
        normalizedKey,
        patchTtlSeconds,
        originalValue,
        value,
        originalLoadedCount,
      );
      await api.redis.patchKey(connectionId, database, patch);
    } else {
      await api.redis.updateKey(connectionId, database, {
        key: normalizedKey,
        value,
        ttlSeconds: parsedTtl,
      });
    }
    toast.success("Redis key saved");
    if (normalizedKey !== redisKey) {
      onSavedKeyChange?.(normalizedKey);
    } else if (!isCreateMode) {
      await load();
    }
  };

  const handleApplyTtl = async () => {
    let parsedTtl: number | null;
    try {
      parsedTtl = parseRedisTtlSeconds(ttl);
    } catch (e) {
      handleApiError(t("redis.key.invalidTtl"), e);
      return;
    }
    setIsSaving(true);
    try {
      await api.redis.setTtl(connectionId, database, redisKey, parsedTtl);
      toast.success("TTL updated");
      await load();
    } catch (e) {
      handleApiError(t("redis.key.updateTtlFailed"), e);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSave = async () => {
    if (value.kind === "json" && jsonValidationError) {
      toast.error(t("redis.key.saveFailed"), {
        description: `Invalid JSON: ${jsonValidationError}`,
      });
      return;
    }
    if (jsonModuleMissing) {
      toast.error(t("redis.key.saveFailed"), {
        description:
          "RedisJSON module is unavailable for this key. Saving is disabled.",
      });
      return;
    }
    if (isCreateMode) {
      setIsSaving(true);
      try {
        await doSave();
      } catch (e) {
        handleApiError(t("redis.key.saveFailed"), e);
      } finally {
        setIsSaving(false);
      }
      return;
    }
    try {
      parseRedisTtlSeconds(ttl);
    } catch (e) {
      handleApiError(t("redis.key.saveFailed"), e);
      return;
    }
    const ttlOnly =
      keyName.trim() === redisKey && isValueUnchanged(originalValue, value);
    if (valueIsPartial || ttlOnly) {
      setIsSaving(true);
      try {
        await doSave();
      } catch (e) {
        handleApiError(t("redis.key.saveFailed"), e);
      } finally {
        setIsSaving(false);
      }
      return;
    }
    if (record?.isBinary) {
      setPendingAction("binary_overwrite");
    } else {
      setPendingAction("overwrite");
    }
  };

  const doDelete = async () => {
    await api.redis.deleteKey(connectionId, database, redisKey);
    toast.success("Redis key deleted");
    onDeleted?.();
  };

  const handleConfirm = async () => {
    setIsSaving(true);
    try {
      if (pendingAction === "delete") {
        await doDelete();
      } else if (pendingAction === "force_rename") {
        await doSave(true);
      } else {
        await doSave();
      }
    } catch (e) {
      handleApiError(t("redis.key.operationFailed"), e);
    } finally {
      setIsSaving(false);
      setPendingAction(null);
    }
  };

  const handleKindChange = (newKind: RedisKind) => {
    setValue(KIND_DEFAULT[newKind]);
  };

  const typeBadge = record ? TYPE_BADGE[record.value.kind] : null;

  return {
    record,
    value,
    setValue,
    originalValue,
    originalLoadedCount,
    keyName,
    setKeyName,
    ttl,
    setTtl,
    isLoading,
    isSaving,
    pendingAction,
    setPendingAction,
    valueIsPartial,
    valueTotalLen,
    loadedOffset,
    loadedCount,
    isLoadingMore,
    setOptions,
    handleSetOptionsChange,
    isCreateMode,
    jsonValidationError,
    jsonModuleMissing,
    typeBadge,
    load,
    handleLoadMore,
    handleSave,
    handleApplyTtl,
    handleConfirm,
    handleKindChange,
  };
}
