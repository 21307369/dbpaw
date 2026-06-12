import { useState } from "react";
import type { RedisZRangeByLexResult } from "@/services/api";

export function useZSetLexRange(
  onZRangeByLex?: (
    min: string,
    max: string,
  ) => Promise<RedisZRangeByLexResult>,
) {
  const [lexMin, setLexMin] = useState("-");
  const [lexMax, setLexMax] = useState("+");
  const [lexActive, setLexActive] = useState(false);
  const [lexMembers, setLexMembers] = useState<string[] | null>(null);
  const [lexTotal, setLexTotal] = useState<number | null>(null);
  const [isLexing, setIsLexing] = useState(false);

  const handleLexRange = async () => {
    if (!onZRangeByLex) return;
    setIsLexing(true);
    try {
      const result = await onZRangeByLex(lexMin, lexMax);
      setLexMembers(result.members);
      setLexTotal(result.total);
      setLexActive(true);
    } catch {
      setLexMembers(null);
    } finally {
      setIsLexing(false);
    }
  };

  const clearLex = () => {
    setLexActive(false);
    setLexMembers(null);
    setLexTotal(null);
  };

  return {
    lexMin,
    lexMax,
    lexActive,
    lexMembers,
    lexTotal,
    isLexing,
    setLexMin,
    setLexMax,
    handleLexRange,
    clearLex,
  };
}
