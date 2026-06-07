import { useState } from "react";
import { api } from "@/services/api";
import { handleApiError } from "@/lib/errors";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { parseMsetInput } from "../redis-utils";

interface UseRedisBatchOpsParams {
  connectionId: number;
  database: string;
  selectedKeys: Set<string>;
  onScanRefresh: () => void;
  onKeysDeleted: () => void;
}

export function useRedisBatchOps({
  connectionId,
  database,
  selectedKeys,
  onScanRefresh,
  onKeysDeleted,
}: UseRedisBatchOpsParams) {
  const { t } = useTranslation();
  const [batchLoading, setBatchLoading] = useState(false);

  const runBatchOp = async (
    op: "del" | "unlink" | "expire" | "persist",
    ttlSeconds?: number,
  ) => {
    if (selectedKeys.size === 0) return;
    setBatchLoading(true);
    try {
      const operations = Array.from(selectedKeys).map((key) => ({
        op,
        key,
        ttlSeconds,
      }));
      const results = await api.redis.batchKeyOps(
        connectionId,
        database,
        operations,
      );
      const succeeded = results.filter((r) => r.success).length;
      const failed = results.filter((r) => !r.success);
      if (succeeded > 0) {
        toast.success(`Batch ${op.toUpperCase()}: ${succeeded} key(s)`);
      }
      if (failed.length > 0) {
        toast.error(t("redis.browser.batchKeysFailed", { count: failed.length }));
      }
      if (op === "del" || op === "unlink") {
        onKeysDeleted();
      }
      onScanRefresh();
    } catch (e) {
      handleApiError(t("redis.browser.batchOperationFailed"), e);
    } finally {
      setBatchLoading(false);
    }
  };

  const handleMgetExport = async (): Promise<string | null> => {
    if (selectedKeys.size === 0) return null;
    const keysArr = Array.from(selectedKeys);
    setBatchLoading(true);
    try {
      const entries = await api.redis.mget(connectionId, database, keysArr);
      const result = JSON.stringify(entries, null, 2);
      return result;
    } catch (e) {
      handleApiError(t("redis.browser.mgetFailed"), e);
      return null;
    } finally {
      setBatchLoading(false);
    }
  };

  const handleMsetImport = async (text: string): Promise<boolean> => {
    const entries = parseMsetInput(text);
    if (!entries || Object.keys(entries).length === 0) {
      toast.error(t("redis.browser.invalidFormat"), {
        description: "Expected JSON object or lines of key:value",
      });
      return false;
    }
    setBatchLoading(true);
    try {
      await api.redis.mset(connectionId, database, entries);
      const count = Object.keys(entries).length;
      toast.success(`MSET: ${count} key(s) written`);
      onScanRefresh();
      return true;
    } catch (e) {
      handleApiError(t("redis.browser.msetFailed"), e);
      return false;
    } finally {
      setBatchLoading(false);
    }
  };

  const handleMsetFileImport = async (): Promise<string | null> => {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const { readTextFile } = await import("@tauri-apps/plugin-fs");
      const selected = await open({
        multiple: false,
        filters: [
          { name: "JSON", extensions: ["json"] },
          { name: "Text", extensions: ["txt"] },
          { name: "All", extensions: ["*"] },
        ],
      });
      if (!selected) return null;
      const content = await readTextFile(selected as string);
      return content;
    } catch (e) {
      handleApiError(t("redis.browser.readFileFailed"), e);
      return null;
    }
  };

  return {
    batchLoading,
    runBatchOp,
    handleMgetExport,
    handleMsetImport,
    handleMsetFileImport,
  };
}
