import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import { api, type RedisStreamEntry } from "@/services/api";
import { handleApiError } from "@/lib/errors";
import { useTranslation } from "react-i18next";
import { resolvePageSize } from "../utils";

interface UseXreadgroupOptions {
  connectionId: number;
  database: string;
  redisKey: string;
  countInput: string;
  value: RedisStreamEntry[];
}

export function useXreadgroup({
  connectionId,
  database,
  redisKey,
  countInput,
  value,
}: UseXreadgroupOptions) {
  const { t } = useTranslation();

  const [readMode, setReadMode] = useState<"xrange" | "xreadgroup">("xrange");
  const [xrgGroup, setXrgGroup] = useState("");
  const [xrgConsumer, setXrgConsumer] = useState("");
  const [xrgStartId, setXrgStartId] = useState(">");
  const [xrgEntries, setXrgEntries] = useState<RedisStreamEntry[] | null>(null);
  const [isLoadingXrg, setIsLoadingXrg] = useState(false);

  const handleXreadgroup = useCallback(async () => {
    if (!xrgGroup || !xrgConsumer) {
      toast.error(t("redis.stream.selectGroupRequired"));
      return;
    }
    setIsLoadingXrg(true);
    try {
      const count = resolvePageSize(countInput);
      const entries = await api.redis.xreadgroup(
        connectionId,
        database,
        redisKey,
        xrgGroup,
        xrgConsumer,
        xrgStartId,
        count,
      );
      setXrgEntries(entries);
    } catch (e) {
      handleApiError(t("redis.stream.readFromGroupFailed"), e);
    } finally {
      setIsLoadingXrg(false);
    }
  }, [connectionId, database, redisKey, xrgGroup, xrgConsumer, xrgStartId, countInput, t]);

  const displayEntries = useMemo(
    () => (readMode === "xreadgroup" && xrgEntries !== null ? xrgEntries : value),
    [readMode, xrgEntries, value],
  );

  const reset = useCallback(() => {
    setXrgEntries(null);
    setXrgGroup("");
    setXrgConsumer("");
    setXrgStartId(">");
  }, []);

  return {
    readMode,
    setReadMode,
    xrgGroup,
    setXrgGroup,
    xrgConsumer,
    setXrgConsumer,
    xrgStartId,
    setXrgStartId,
    xrgEntries,
    isLoadingXrg,
    handleXreadgroup,
    displayEntries,
    reset,
  };
}
