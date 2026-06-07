import { useCallback, useEffect, useState } from "react";
import { api } from "@/services/api";
import type { RedisKeyInfo } from "@/services/api";
import { handleApiError } from "@/lib/errors";
import { useTranslation } from "react-i18next";
import { isRedisClusterDatabaseList } from "../redis-utils";

const SCAN_LIMIT = 200;

interface UseRedisKeyScanParams {
  connectionId: number;
  database: string;
}

export function useRedisKeyScan({ connectionId, database }: UseRedisKeyScanParams) {
  const { t } = useTranslation();
  const [pattern, setPattern] = useState("");
  const [keys, setKeys] = useState<RedisKeyInfo[]>([]);
  const [cursor, setCursor] = useState("0");
  const [isPartial, setIsPartial] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isClusterMode, setIsClusterMode] = useState(false);
  const [requiresPattern, setRequiresPattern] = useState(false);

  const scan = useCallback(
    async (pat: string, cur: string, append: boolean) => {
      if (isClusterMode && !pat.trim()) {
        setKeys([]);
        setCursor("0");
        setIsPartial(false);
        setRequiresPattern(true);
        return;
      }
      setIsLoading(true);
      try {
        const res = await api.redis.scanKeys({
          id: connectionId,
          database,
          cursor: cur,
          pattern: pat.trim() || undefined,
          limit: SCAN_LIMIT,
        });
        setKeys((prev) => (append ? [...prev, ...res.keys] : res.keys));
        setCursor(res.cursor);
        setIsPartial(res.isPartial);
        setRequiresPattern(false);
      } catch (e) {
        handleApiError(t("redis.browser.scanFailed"), e);
      } finally {
        setIsLoading(false);
      }
    },
    [connectionId, database, isClusterMode, t],
  );

  useEffect(() => {
    let cancelled = false;
    const init = async () => {
      try {
        const databases = await api.redis.listDatabases(connectionId);
        if (cancelled) return;
        const clusterMode = isRedisClusterDatabaseList(databases);
        setIsClusterMode(clusterMode);
        setRequiresPattern(clusterMode);
        if (!clusterMode) {
          await scan("", "0", false);
        } else {
          setKeys([]);
          setCursor("0");
          setIsPartial(false);
        }
      } catch (e) {
        handleApiError(t("redis.browser.loadDatabasesFailed"), e);
      }
    };
    void init();
    return () => {
      cancelled = true;
    };
  }, [connectionId, scan, t]);

  const handleSearch = () => {
    void scan(pattern, "0", false);
  };

  const handleLoadMore = () => void scan(pattern, cursor, true);

  return {
    pattern,
    setPattern,
    keys,
    setKeys,
    cursor,
    isPartial,
    isLoading,
    isClusterMode,
    requiresPattern,
    scan,
    handleSearch,
    handleLoadMore,
  };
}
