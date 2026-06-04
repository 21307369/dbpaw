import { Scissors } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { RedisKeyExtra, RedisStreamGroup } from "@/services/api";

export function StreamSummaryCards({
  entryCount,
  totalLen,
  streamInfo,
  groups,
  appliedStartId,
  appliedEndId,
  onTrim,
}: {
  entryCount: number;
  totalLen: number | null;
  streamInfo: RedisKeyExtra["streamInfo"];
  groups: RedisStreamGroup[];
  appliedStartId: string;
  appliedEndId: string;
  onTrim: () => void;
}) {
  return (
    <div className="flex items-start gap-2">
      <div className="grid flex-1 gap-2 md:grid-cols-4">
        <div className="rounded-md border bg-card px-3 py-2 text-xs">
          <div className="text-muted-foreground">Length</div>
          <div className="mt-1 font-mono text-sm">
            {(streamInfo?.length ?? totalLen ?? entryCount).toLocaleString()}
          </div>
        </div>
        <div className="rounded-md border bg-card px-3 py-2 text-xs">
          <div className="text-muted-foreground">Groups</div>
          <div className="mt-1 font-mono text-sm">
            {(streamInfo?.groups ?? groups.length).toLocaleString()}
          </div>
        </div>
        <div className="rounded-md border bg-card px-3 py-2 text-xs">
          <div className="text-muted-foreground">Last generated ID</div>
          <div className="mt-1 truncate font-mono text-sm">
            {streamInfo?.lastGeneratedId || "n/a"}
          </div>
        </div>
        <div className="rounded-md border bg-card px-3 py-2 text-xs">
          <div className="text-muted-foreground">Current range</div>
          <div className="mt-1 font-mono text-sm">
            {appliedStartId} .. {appliedEndId}
          </div>
        </div>
      </div>
      <Button
        variant="outline"
        size="sm"
        className="h-auto shrink-0 px-2 py-2"
        onClick={onTrim}
        title="Trim stream"
      >
        <Scissors className="h-4 w-4" />
      </Button>
    </div>
  );
}
