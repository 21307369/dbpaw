import { memo } from "react";

interface TableStatusBarProps {
  executionTimeMs: number;
  sortedDataLength: number;
  normalizedSearchKeyword: string;
  matchedRowsSize: number;
  searchKeyword: string;
  isRefreshing: boolean;
  lastRefreshedAt: Date | null;
  hasPendingChanges: boolean;
  pendingMutationCount: number;
}

export const TableStatusBar = memo(function TableStatusBar({
  executionTimeMs,
  sortedDataLength,
  normalizedSearchKeyword,
  matchedRowsSize,
  searchKeyword,
  isRefreshing,
  lastRefreshedAt,
  hasPendingChanges,
  pendingMutationCount,
}: TableStatusBarProps) {
  return (
    <div className="flex items-center px-4 py-1 border-t border-border bg-muted/40">
      <div className="text-sm text-muted-foreground">
        Query executed in{" "}
        {executionTimeMs ? (executionTimeMs / 1000).toFixed(3) : "0.000"}s •{" "}
        {sortedDataLength} rows returned
        {normalizedSearchKeyword && (
          <span className="ml-2">
            • {matchedRowsSize} row(s) matched "{searchKeyword.trim()}"
          </span>
        )}
        {isRefreshing && <span className="ml-2">• Refreshing…</span>}
        {lastRefreshedAt && !isRefreshing && (
          <span className="ml-2">
            • Updated {lastRefreshedAt.toLocaleTimeString()}
          </span>
        )}
        {hasPendingChanges && (
          <span className="text-orange-600 dark:text-orange-400 ml-2">
            • {pendingMutationCount} unsaved change(s)
          </span>
        )}
      </div>
    </div>
  );
});
