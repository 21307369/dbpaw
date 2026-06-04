import { useCallback, useEffect, useMemo, useState } from "react";
import { api, type RedisKeyExtra, type RedisStreamEntry } from "@/services/api";
import { handleApiError } from "@/lib/errors";
import { useTranslation } from "react-i18next";
import {
  createInitialBrowserState,
  mapViewResultToBrowserState,
  parseFieldsRaw,
  resolvePageSize,
  type StreamBrowserState,
} from "../utils";

interface UseStreamBrowserOptions {
  connectionId: number;
  database: string;
  redisKey: string;
  value: RedisStreamEntry[];
  onChange: (v: RedisStreamEntry[]) => void;
  totalLen?: number | null;
  extra?: RedisKeyExtra | null;
  isCreateMode?: boolean;
}

export function useStreamBrowser({
  connectionId,
  database,
  redisKey,
  value,
  onChange,
  totalLen,
  extra,
  isCreateMode,
}: UseStreamBrowserOptions) {
  const { t } = useTranslation();

  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [showNewRow, setShowNewRow] = useState(false);
  const [newId, setNewId] = useState("*");
  const [newFieldsRaw, setNewFieldsRaw] = useState("");
  const [browser, setBrowser] = useState<StreamBrowserState>(() =>
    createInitialBrowserState(value, totalLen, extra),
  );
  const [isLoadingView, setIsLoadingView] = useState(false);

  useEffect(() => {
    setBrowser(createInitialBrowserState(value, totalLen, extra));
    setExpandedIds(new Set());
    setShowNewRow(false);
    setNewId("*");
    setNewFieldsRaw("");
  }, [connectionId, database, redisKey, totalLen, extra]);

  const hasMore = useMemo(() => {
    if (isCreateMode) return false;
    if (browser.nextStartId) return true;
    return browser.totalLen !== null && value.length < browser.totalLen;
  }, [browser.nextStartId, browser.totalLen, isCreateMode, value.length]);

  const refreshView = useCallback(async () => {
    try {
      const result = await api.redis.getStreamView(
        connectionId,
        database,
        redisKey,
        browser.appliedStartId,
        browser.appliedEndId,
        browser.pageSize,
      );
      onChange(result.entries);
      setBrowser((current) => mapViewResultToBrowserState(result, current));
    } catch {
      // silent — caller can show toast
    }
  }, [
    connectionId,
    database,
    redisKey,
    browser.appliedStartId,
    browser.appliedEndId,
    browser.pageSize,
    onChange,
  ]);

  const loadStreamView = async (
    mode: "replace" | "append",
    overrides?: { startId?: string; endId?: string; count?: number },
  ) => {
    if (isCreateMode) return;

    let count: number;
    try {
      count = overrides?.count ?? resolvePageSize(browser.countInput);
    } catch (e) {
      handleApiError(t("redis.stream.invalidRange"), e);
      return;
    }

    const startId =
      mode === "append"
        ? browser.nextStartId ||
          (value.length > 0
            ? `(${value[value.length - 1].id}`
            : browser.appliedStartId)
        : (overrides?.startId ?? browser.startIdInput.trim()) || "-";
    const endId = (overrides?.endId ?? browser.endIdInput.trim()) || "+";

    setIsLoadingView(true);
    try {
      const result = await api.redis.getStreamView(
        connectionId,
        database,
        redisKey,
        startId,
        endId,
        count,
      );
      onChange(
        mode === "append" ? [...value, ...result.entries] : result.entries,
      );
      setBrowser((current) => mapViewResultToBrowserState(result, current));
    } catch (e) {
      handleApiError(
        mode === "append"
          ? t("redis.stream.loadMoreFailed")
          : t("redis.stream.loadFailed"),
        e,
      );
    } finally {
      setIsLoadingView(false);
    }
  };

  const toggleExpand = (id: string) => {
    setExpandedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const deleteEntry = (id: string) => {
    onChange(value.filter((entry) => entry.id !== id));
  };

  const addEntry = () => {
    const fields = parseFieldsRaw(newFieldsRaw);
    if (!fields) return;
    onChange([{ id: newId.trim() || "*", fields }, ...value]);
    setShowNewRow(false);
    setNewId("*");
    setNewFieldsRaw("");
  };

  const reset = useCallback(() => {
    setExpandedIds(new Set());
    setShowNewRow(false);
    setNewId("*");
    setNewFieldsRaw("");
    setBrowser(createInitialBrowserState(value, totalLen, extra));
  }, [value, totalLen, extra]);

  return {
    browser,
    setBrowser,
    isLoadingView,
    hasMore,
    loadStreamView,
    refreshView,
    expandedIds,
    toggleExpand,
    showNewRow,
    setShowNewRow,
    newId,
    setNewId,
    newFieldsRaw,
    setNewFieldsRaw,
    addEntry,
    deleteEntry,
    reset,
  };
}
