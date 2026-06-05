import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { errorMessage } from "@/lib/errors";
import { api } from "@/services/api";
import type { SavedQuery } from "@/services/api";

export function useSavedQueriesTree(options: {
  showSavedQueriesInTree: boolean;
  lastUpdated?: number;
}) {
  const { showSavedQueriesInTree, lastUpdated } = options;
  const { t } = useTranslation();
  const [isLoadingQueries, setIsLoadingQueries] = useState(false);
  const [savedQueriesByConnection, setSavedQueriesByConnection] = useState<
    Record<string, SavedQuery[]>
  >({});

  useEffect(() => {
    if (!showSavedQueriesInTree) return;
    void fetchSavedQueriesByConnection();
  }, [showSavedQueriesInTree, lastUpdated]);

  const fetchSavedQueriesByConnection = async () => {
    setIsLoadingQueries(true);
    try {
      const queries = await api.queries.list();
      const grouped: Record<string, SavedQuery[]> = {};
      queries.forEach((query) => {
        if (!query.connectionId) return;
        const key = String(query.connectionId);
        if (!grouped[key]) grouped[key] = [];
        grouped[key].push(query);
      });
      Object.values(grouped).forEach((items) =>
        items.sort((a, b) => a.name.localeCompare(b.name)),
      );
      setSavedQueriesByConnection(grouped);
    } catch (e) {
      const message = errorMessage(e);
      console.error("Failed to fetch saved queries for tree", message);
      toast.error(t("connection.toast.loadQueriesFailed"), {
        description: message,
      });
    } finally {
      setIsLoadingQueries(false);
    }
  };

  return {
    isLoadingQueries,
    savedQueriesByConnection,
    fetchSavedQueriesByConnection,
  };
}
