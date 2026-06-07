import { useCallback, useEffect, useState } from "react";
import type { RedisKeyInfo } from "@/services/api";

type DetailState =
  | { mode: "none" }
  | { mode: "new" }
  | { mode: "view"; key: string };

interface UseRedisSelectionParams {
  keys: RedisKeyInfo[];
  onScanRefresh: () => void;
}

export function useRedisSelection({ keys, onScanRefresh }: UseRedisSelectionParams) {
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [lastClickedIndex, setLastClickedIndex] = useState<number | null>(null);
  const [detail, setDetail] = useState<DetailState>({ mode: "none" });

  // Prune selectedKeys when keys change (new scan, load more, external delete).
  useEffect(() => {
    setSelectedKeys((prev) => {
      if (prev.size === 0) return prev;
      const valid = new Set(keys.map((k) => k.key));
      const next = new Set([...prev].filter((k) => valid.has(k)));
      return next.size === prev.size ? prev : next;
    });
  }, [keys]);

  const handleSelectKey = useCallback(
    (key: string, index: number, e: React.MouseEvent) => {
      if (selectedKeys.size > 0) {
        if (e.shiftKey && lastClickedIndex !== null) {
          const start = Math.min(lastClickedIndex, index);
          const end = Math.max(lastClickedIndex, index);
          const rangeKeys = keys.slice(start, end + 1).map((k) => k.key);
          setSelectedKeys((prev) => {
            const next = new Set(prev);
            for (const k of rangeKeys) next.add(k);
            return next;
          });
          setLastClickedIndex(index);
          return;
        }
        setSelectedKeys((prev) => {
          const next = new Set(prev);
          if (next.has(key)) next.delete(key);
          else next.add(key);
          return next;
        });
        setLastClickedIndex(index);
        return;
      }
      setDetail({ mode: "view", key });
    },
    [selectedKeys.size, lastClickedIndex, keys],
  );

  const handleNewKey = useCallback(() => setDetail({ mode: "new" }), []);

  const handleKeyDeleted = useCallback(() => {
    setDetail({ mode: "none" });
    onScanRefresh();
  }, [onScanRefresh]);

  const handleKeySaved = useCallback(
    (newKey: string) => {
      if (detail.mode === "new") {
        setDetail({ mode: "view", key: newKey });
      } else if (detail.mode === "view" && newKey !== detail.key) {
        setDetail({ mode: "view", key: newKey });
      }
      onScanRefresh();
    },
    [detail, onScanRefresh],
  );

  const clearSelection = useCallback(() => {
    setSelectedKeys(new Set());
    setLastClickedIndex(null);
  }, []);

  const selectAll = useCallback(() => {
    setSelectedKeys(new Set(keys.map((k) => k.key)));
  }, [keys]);

  const selectedKey = detail.mode === "view" ? detail.key : null;
  const selectedCount = selectedKeys.size;

  return {
    selectedKeys,
    lastClickedIndex,
    detail,
    // Raw setters exposed because the Task 10 orchestrator calls them directly.
    // Will be removed once the orchestrator is refactored to use handleNewKey/handleKeySaved.
    setSelectedKeys,
    setDetail,
    handleSelectKey,
    handleNewKey,
    handleKeyDeleted,
    handleKeySaved,
    clearSelection,
    selectAll,
    selectedKey,
    selectedCount,
  };
}
