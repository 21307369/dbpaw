import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Info, Loader2, SlidersHorizontal } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type {
  RedisKeyExtra,
  RedisZRangeByLexResult,
  RedisZRangeByScoreResult,
} from "@/services/api";

import { useZSetEditing } from "./redis-zset/hooks/useZSetEditing";
import { useZSetRangeQuery } from "./redis-zset/hooks/useZSetRangeQuery";
import { useZSetRankScore } from "./redis-zset/hooks/useZSetRankScore";
import { useZSetLexRange } from "./redis-zset/hooks/useZSetLexRange";
import { useZSetPop } from "./redis-zset/hooks/useZSetPop";

import { ZSetToolbar } from "./redis-zset/components/ZSetToolbar";
import { ZSetQueryPanel } from "./redis-zset/components/ZSetQueryPanel";
import { ZSetRows } from "./redis-zset/components/ZSetRows";

interface ZSetMember {
  member: string;
  score: number;
}

interface Props {
  value: ZSetMember[];
  onChange: (v: ZSetMember[]) => void;
  extra?: RedisKeyExtra | null;
  onZsetIncrBy?: (member: string, amount: number) => void;
  onZRangeByScore?: (
    min: string,
    max: string,
  ) => Promise<RedisZRangeByScoreResult>;
  onZRank?: (member: string, reverse: boolean) => Promise<number | null>;
  onZScore?: (member: string) => Promise<number | null>;
  onZMScore?: (members: string[]) => Promise<(number | null)[]>;
  onZRangeByLex?: (min: string, max: string) => Promise<RedisZRangeByLexResult>;
  onZPopMin?: (count?: number) => Promise<void>;
  onZPopMax?: (count?: number) => Promise<void>;
}

export function RedisZSetViewer({
  value,
  onChange,
  extra,
  onZsetIncrBy,
  onZRangeByScore,
  onZRank,
  onZScore,
  onZMScore,
  onZRangeByLex,
  onZPopMin,
  onZPopMax,
}: Props) {
  const { t } = useTranslation();
  const [sortAsc, setSortAsc] = useState(true);
  const [showQueryPanel, setShowQueryPanel] = useState(false);
  const isGeo = extra?.subtype === "geo";

  const editing = useZSetEditing(value, onChange);
  const rangeQuery = useZSetRangeQuery(onZRangeByScore);
  const rankScore = useZSetRankScore(onZRank, onZScore, onZMScore);
  const lexRange = useZSetLexRange(onZRangeByLex);
  const pop = useZSetPop(onZPopMin, onZPopMax);

  const displayMembers =
    rangeQuery.filterActive && rangeQuery.filteredMembers
      ? rangeQuery.filteredMembers
      : [...value].sort((a, b) =>
          sortAsc ? a.score - b.score : b.score - a.score,
        );

  const hasQueryCapability =
    !!(onZRangeByScore || onZRank || onZScore || onZMScore || onZRangeByLex);
  const hasPopCapability = !!(onZPopMin || onZPopMax);

  return (
    <div className="space-y-2">
      {isGeo && (
        <div className="flex items-center gap-2 text-xs text-teal-700 bg-teal-50 dark:bg-teal-950/30 border border-teal-200 dark:border-teal-900 rounded px-3 py-2">
          <Info className="w-3.5 h-3.5 shrink-0" />
          <span>{t("redis.zset.geoHint")}</span>
          <Badge
            variant="outline"
            className="text-xs text-teal-600 border-teal-200 ml-auto"
          >
            Geo
          </Badge>
        </div>
      )}

      <ZSetToolbar
        memberCount={value.length}
        sortAsc={sortAsc}
        onToggleSort={() => setSortAsc((a) => !a)}
        showQueryPanel={showQueryPanel}
        hasQueryCapability={hasQueryCapability}
        onToggleQuery={() => setShowQueryPanel((v) => !v)}
        onAddNew={() => editing.setShowNewRow(true)}
        showNewRow={editing.showNewRow}
        hasPopCapability={hasPopCapability}
        onPopMin={() => pop.openPopDialog("min")}
        onPopMax={() => pop.openPopDialog("max")}
        valueEmpty={value.length === 0}
      />

      {showQueryPanel && (
        <ZSetQueryPanel
          rangeQuery={{
            ...rangeQuery,
            hasCapability: !!onZRangeByScore,
          }}
          rankScore={{
            ...rankScore,
            hasRankCapability: !!onZRank,
            hasScoreCapability: !!(onZScore || onZMScore),
            onZScore,
            onZMScore,
          }}
          lexRange={{
            ...lexRange,
            hasCapability: !!onZRangeByLex,
          }}
        />
      )}

      {rangeQuery.filterActive && (
        <div className="flex items-center gap-2 text-xs rounded-md border border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/20 px-3 py-1.5">
          <SlidersHorizontal className="w-3 h-3 text-blue-500" />
          <span className="text-blue-700 dark:text-blue-300">
            {t("redis.zset.filteredBanner", {
              min: rangeQuery.filterMin,
              max: rangeQuery.filterMax,
              count: rangeQuery.filteredMembers?.length ?? 0,
            })}
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="h-5 px-1.5 ml-auto text-xs text-blue-600 dark:text-blue-400"
            onClick={rangeQuery.clearFilter}
          >
            {t("redis.zset.showAll")}
          </Button>
        </div>
      )}

      <ZSetRows
        members={displayMembers}
        editing={editing}
        onZsetIncrBy={onZsetIncrBy}
        filterActive={rangeQuery.filterActive}
        lexActive={lexRange.lexActive}
      />

      {lexRange.lexActive && (
        <div className="flex items-center gap-2 text-xs rounded-md border border-purple-200 dark:border-purple-800 bg-purple-50/50 dark:bg-purple-950/20 px-3 py-1.5">
          <SlidersHorizontal className="w-3 h-3 text-purple-500" />
          <span className="text-purple-700 dark:text-purple-300">
            {t("redis.zset.lexBanner", {
              min: lexRange.lexMin,
              max: lexRange.lexMax,
              count: lexRange.lexMembers?.length ?? 0,
            })}
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="h-5 px-1.5 ml-auto text-xs text-purple-600 dark:text-purple-400"
            onClick={lexRange.clearLex}
          >
            {t("redis.zset.showAll")}
          </Button>
        </div>
      )}

      <AlertDialog
        open={!!pop.popDialog}
        onOpenChange={(open) => {
          if (!open) pop.closePopDialog();
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pop.popDialog?.type === "min" ? "ZPOPMIN" : "ZPOPMAX"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("redis.zset.popConfirmDescription", {
                score: t(
                  pop.popDialog?.type === "min"
                    ? "redis.zset.lowestScore"
                    : "redis.zset.highestScore",
                ),
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pop.isPopping}>
              {t("common.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void pop.handlePop()}
              disabled={pop.isPopping}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {pop.isPopping ? (
                <Loader2 className="w-3 h-3 mr-1 animate-spin" />
              ) : null}
              {t(
                pop.popDialog?.type === "min"
                  ? "redis.zset.popMin"
                  : "redis.zset.popMax",
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
