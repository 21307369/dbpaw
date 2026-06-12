import { useState } from "react";
import type { RedisZRangeByScoreResult } from "@/services/api";

interface ZSetMember {
  member: string;
  score: number;
}

export function useZSetRangeQuery(
  onZRangeByScore?: (
    min: string,
    max: string,
  ) => Promise<RedisZRangeByScoreResult>,
) {
  const [filterMin, setFilterMin] = useState("-inf");
  const [filterMax, setFilterMax] = useState("+inf");
  const [filterActive, setFilterActive] = useState(false);
  const [filteredMembers, setFilteredMembers] = useState<ZSetMember[] | null>(
    null,
  );
  const [filterTotal, setFilterTotal] = useState<number | null>(null);
  const [isFiltering, setIsFiltering] = useState(false);

  const handleFilter = async () => {
    if (!onZRangeByScore) return;
    setIsFiltering(true);
    try {
      const result = await onZRangeByScore(filterMin, filterMax);
      setFilteredMembers(result.members);
      setFilterTotal(result.total);
      setFilterActive(true);
    } catch {
      // Error handled by caller
    } finally {
      setIsFiltering(false);
    }
  };

  const clearFilter = () => {
    setFilterActive(false);
    setFilteredMembers(null);
    setFilterTotal(null);
  };

  return {
    filterMin,
    filterMax,
    filterActive,
    filteredMembers,
    filterTotal,
    isFiltering,
    setFilterMin,
    setFilterMax,
    handleFilter,
    clearFilter,
  };
}
