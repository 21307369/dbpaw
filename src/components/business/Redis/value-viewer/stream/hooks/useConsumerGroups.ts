import { useCallback, useState } from "react";
import { toast } from "sonner";
import {
  api,
  type RedisXPendingEntry,
  type RedisXPendingSummary,
} from "@/services/api";
import { handleApiError } from "@/lib/errors";
import { useTranslation } from "react-i18next";

interface UseConsumerGroupsOptions {
  connectionId: number;
  database: string;
  redisKey: string;
  refreshView: () => Promise<void>;
}

export function useConsumerGroups({
  connectionId,
  database,
  redisKey,
  refreshView,
}: UseConsumerGroupsOptions) {
  const { t } = useTranslation();

  const [showCreateGroupDialog, setShowCreateGroupDialog] = useState(false);
  const [deleteGroupTarget, setDeleteGroupTarget] = useState<string | null>(
    null,
  );
  const [resetGroupTarget, setResetGroupTarget] = useState<string | null>(null);
  const [expandedGroupNames, setExpandedGroupNames] = useState<Set<string>>(
    new Set(),
  );
  const [pendingData, setPendingData] = useState<
    Record<string, RedisXPendingSummary | RedisXPendingEntry[] | null>
  >({});
  const [pendingLoading, setPendingLoading] = useState<Record<string, boolean>>(
    {},
  );
  const [selectedPendingIds, setSelectedPendingIds] = useState<Set<string>>(
    new Set(),
  );
  const [claimTarget, setClaimTarget] = useState<{
    group: string;
    entry: RedisXPendingEntry;
  } | null>(null);
  const [showTrimDialog, setShowTrimDialog] = useState(false);

  const handleCreateGroup = async (
    groupName: string,
    startId: string,
    mkstream: boolean,
  ) => {
    try {
      await api.redis.xgroupCreate(
        connectionId,
        database,
        redisKey,
        groupName,
        startId,
        mkstream,
      );
      toast.success(`Group "${groupName}" created`);
      setShowCreateGroupDialog(false);
      await refreshView();
    } catch (e) {
      handleApiError(t("redis.stream.createGroupFailed"), e);
    }
  };

  const handleDeleteGroup = async () => {
    if (!deleteGroupTarget) return;
    try {
      await api.redis.xgroupDel(
        connectionId,
        database,
        redisKey,
        deleteGroupTarget,
      );
      toast.success(`Group "${deleteGroupTarget}" deleted`);
      setDeleteGroupTarget(null);
      setExpandedGroupNames((s) => {
        const n = new Set(s);
        n.delete(deleteGroupTarget);
        return n;
      });
      setPendingData((s) => {
        const n = { ...s };
        delete n[deleteGroupTarget];
        return n;
      });
      await refreshView();
    } catch (e) {
      handleApiError(t("redis.stream.deleteGroupFailed"), e);
    }
  };

  const handleResetGroup = async (startId: string) => {
    if (!resetGroupTarget) return;
    try {
      await api.redis.xgroupSetId(
        connectionId,
        database,
        redisKey,
        resetGroupTarget,
        startId,
      );
      toast.success(`Group "${resetGroupTarget}" cursor reset`);
      setResetGroupTarget(null);
      await refreshView();
    } catch (e) {
      handleApiError(t("redis.stream.resetCursorFailed"), e);
    }
  };

  const toggleGroupExpand = async (groupName: string) => {
    let shouldLoad = false;
    setExpandedGroupNames((current) => {
      const next = new Set(current);
      if (next.has(groupName)) {
        next.delete(groupName);
      } else {
        next.add(groupName);
        if (!current.has(groupName) && !pendingData[groupName]) {
          shouldLoad = true;
        }
      }
      return next;
    });

    if (shouldLoad) {
      setPendingLoading((s) => ({ ...s, [groupName]: true }));
      try {
        const result = await api.redis.xpending(
          connectionId,
          database,
          redisKey,
          groupName,
        );
        setPendingData((s) => ({
          ...s,
          [groupName]: result as RedisXPendingSummary,
        }));
      } catch (e) {
        handleApiError(t("redis.stream.loadPendingFailed"), e);
      } finally {
        setPendingLoading((s) => ({ ...s, [groupName]: false }));
      }
    }
  };

  const loadPendingDetails = async (groupName: string) => {
    setPendingLoading((s) => ({ ...s, [groupName]: true }));
    try {
      const result = await api.redis.xpending(
        connectionId,
        database,
        redisKey,
        groupName,
        "-",
        "+",
        100,
      );
      setPendingData((s) => ({
        ...s,
        [groupName]: result as RedisXPendingEntry[],
      }));
      setSelectedPendingIds(new Set());
    } catch (e) {
      handleApiError(t("redis.stream.loadPendingEntriesFailed"), e);
    } finally {
      setPendingLoading((s) => ({ ...s, [groupName]: false }));
    }
  };

  const handleAck = async (groupName: string, ids: string[]) => {
    try {
      const count = await api.redis.xack(
        connectionId,
        database,
        redisKey,
        groupName,
        ids,
      );
      toast.success(`Acknowledged ${count} message(s)`);
      setSelectedPendingIds(new Set());
      await loadPendingDetails(groupName);
      await refreshView();
    } catch (e) {
      handleApiError(t("redis.stream.acknowledgeFailed"), e);
    }
  };

  const handleClaim = async (
    groupName: string,
    consumer: string,
    entryId: string,
  ) => {
    try {
      await api.redis.xclaim(
        connectionId,
        database,
        redisKey,
        groupName,
        consumer,
        0,
        [entryId],
      );
      toast.success(`Entry claimed by "${consumer}"`);
      setClaimTarget(null);
      await loadPendingDetails(groupName);
    } catch (e) {
      handleApiError(t("redis.stream.claimFailed"), e);
    }
  };

  const onTogglePendingSelect = useCallback((id: string) => {
    setSelectedPendingIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleTrim = async (strategy: string, threshold: string) => {
    try {
      const trimmed = await api.redis.xtrim(
        connectionId,
        database,
        redisKey,
        strategy,
        threshold,
      );
      toast.success(`Trimmed ${trimmed} entries`);
      setShowTrimDialog(false);
      await refreshView();
    } catch (e) {
      handleApiError(t("redis.stream.trimFailed"), e);
    }
  };

  const reset = useCallback(() => {
    setExpandedGroupNames(new Set());
    setPendingData({});
    setSelectedPendingIds(new Set());
    setPendingLoading({});
    setClaimTarget(null);
    setShowTrimDialog(false);
    setDeleteGroupTarget(null);
    setResetGroupTarget(null);
    setShowCreateGroupDialog(false);
  }, []);

  return {
    showCreateGroupDialog,
    setShowCreateGroupDialog,
    deleteGroupTarget,
    setDeleteGroupTarget,
    resetGroupTarget,
    setResetGroupTarget,
    expandedGroupNames,
    toggleGroupExpand,
    pendingData,
    pendingLoading,
    selectedPendingIds,
    handleCreateGroup,
    handleDeleteGroup,
    handleResetGroup,
    loadPendingDetails,
    handleAck,
    handleClaim,
    onTogglePendingSelect,
    claimTarget,
    setClaimTarget,
    showTrimDialog,
    setShowTrimDialog,
    handleTrim,
    reset,
  };
}
