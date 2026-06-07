import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/utils";
import type { RedisKeyInfo } from "@/services/api";
import { TYPE_COLORS, TYPE_DISPLAY_LABEL } from "../redis-type-colors";

function formatTtlShort(ttl: number): string {
  if (ttl <= -2) return "exp";
  if (ttl === -1) return "";
  if (ttl < 60) return `${ttl}s`;
  if (ttl < 3600) return `${Math.floor(ttl / 60)}m`;
  return `${Math.floor(ttl / 3600)}h`;
}

interface KeyListPanelProps {
  keys: RedisKeyInfo[];
  selectedKeys: Set<string>;
  selectedKey: string | null;
  onSelectKey: (key: string, index: number, e: React.MouseEvent) => void;
  onCheckboxToggle: (key: string, index: number) => void;
  isLoading: boolean;
  isPartial: boolean;
  onLoadMore: () => void;
  requiresPattern: boolean;
}

export function KeyListPanel({
  keys,
  selectedKeys,
  selectedKey,
  onSelectKey,
  onCheckboxToggle,
  isLoading,
  isPartial,
  onLoadMore,
  requiresPattern,
}: KeyListPanelProps) {
  const selectedCount = selectedKeys.size;

  return (
    <div className="flex-1 overflow-y-auto">
      {keys.length === 0 && !isLoading && (
        <div className="p-6 text-center text-xs text-muted-foreground">
          {requiresPattern
            ? "Redis Cluster browsing requires a search pattern"
            : "No keys found"}
        </div>
      )}

      {keys.map((k, index) => {
        const ttlLabel = formatTtlShort(k.ttl);
        const isSelected = selectedKeys.has(k.key);
        return (
          <div
            key={k.key}
            className={cn(
              "flex items-center gap-2 px-3 py-1.5 cursor-pointer hover:bg-muted/50 border-b border-border/30 text-xs",
              selectedKey === k.key && selectedCount === 0 && "bg-accent/50",
              isSelected && "bg-primary/10",
            )}
            onClick={(e) => onSelectKey(k.key, index, e)}
          >
            <Checkbox
              checked={isSelected}
              onCheckedChange={() => onCheckboxToggle(k.key, index)}
              onClick={(e) => e.stopPropagation()}
              className="shrink-0 h-3.5 w-3.5"
            />
            <span
              className={cn(
                "shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium",
                TYPE_COLORS[k.keyType] ?? "bg-muted text-muted-foreground",
              )}
            >
              {TYPE_DISPLAY_LABEL[k.keyType] ?? k.keyType}
            </span>
            <span
              className="flex-1 truncate font-mono text-foreground"
              title={k.key}
            >
              {k.key}
            </span>
            {ttlLabel && (
              <span
                className={cn(
                  "shrink-0 text-[10px] tabular-nums",
                  k.ttl <= -2 ? "text-destructive" : "text-muted-foreground",
                )}
              >
                {ttlLabel}
              </span>
            )}
          </div>
        );
      })}

      {isPartial && !isLoading && (
        <div className="p-2 text-center">
          <Button
            variant="ghost"
            size="sm"
            className="text-xs h-6"
            onClick={onLoadMore}
          >
            Load more
          </Button>
        </div>
      )}

      {requiresPattern && (
        <div className="p-3 text-xs text-muted-foreground border-t">
          Enter a pattern like <span className="font-mono">user:*</span>{" "}
          before browsing cluster keys. Full-cluster wildcard scans are blocked.
        </div>
      )}
    </div>
  );
}
