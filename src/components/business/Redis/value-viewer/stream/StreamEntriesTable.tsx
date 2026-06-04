import { memo } from "react";
import {
  Check,
  ChevronDown,
  ChevronRight,
  Trash2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { RedisStreamEntry } from "@/services/api";
import { formatFields } from "./utils";

export function StreamEntriesTable({
  entries,
  expandedIds,
  onToggleExpand,
  onDelete,
  pendingAckIds,
  onAckSingle,
}: {
  entries: RedisStreamEntry[];
  expandedIds: Set<string>;
  onToggleExpand: (id: string) => void;
  onDelete: (id: string) => void;
  pendingAckIds?: Set<string>;
  onAckSingle?: (id: string) => void;
}) {
  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[40px]" />
            <TableHead className="text-xs">Entry ID</TableHead>
            <TableHead className="text-xs">Field count</TableHead>
            <TableHead className="text-xs">Fields</TableHead>
            <TableHead className="w-[72px]" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {entries.length === 0 && (
            <TableRow>
              <TableCell
                colSpan={5}
                className="py-6 text-center text-sm text-muted-foreground"
              >
                No entries in this range
              </TableCell>
            </TableRow>
          )}
          {entries.map((entry) => (
            <StreamEntryRow
              key={entry.id}
              entry={entry}
              expanded={expandedIds.has(entry.id)}
              onToggle={() => onToggleExpand(entry.id)}
              onDelete={() => onDelete(entry.id)}
              isPending={pendingAckIds?.has(entry.id)}
              onAck={onAckSingle ? () => onAckSingle(entry.id) : undefined}
            />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

const StreamEntryRow = memo(function StreamEntryRow({
  entry,
  expanded,
  onToggle,
  onDelete,
  isPending,
  onAck,
}: {
  entry: RedisStreamEntry;
  expanded: boolean;
  onToggle: () => void;
  onDelete: () => void;
  isPending?: boolean;
  onAck?: () => void;
}) {
  return (
    <>
      <TableRow className="group">
        <TableCell className="py-1.5">
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5"
            onClick={onToggle}
          >
            {expanded ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )}
          </Button>
        </TableCell>
        <TableCell className="max-w-0 truncate py-1.5 font-mono text-xs text-muted-foreground">
          <span title={entry.id} className="inline-flex items-center gap-1">
            {entry.id}
            {isPending && (
              <Badge
                variant="outline"
                className="h-4 px-1 text-[9px] text-orange-500 border-orange-300"
              >
                pending
              </Badge>
            )}
          </span>
        </TableCell>
        <TableCell className="py-1.5 text-xs">
          {Object.keys(entry.fields).length}
        </TableCell>
        <TableCell className="py-1.5">
          <span
            className="block cursor-pointer truncate font-mono text-xs hover:text-foreground/70"
            title={formatFields(entry.fields)}
            onClick={onToggle}
          >
            {formatFields(entry.fields)}
          </span>
        </TableCell>
        <TableCell className="py-1.5">
          <div className="flex gap-1">
            {onAck && (
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 opacity-0 transition-opacity group-hover:opacity-100"
                title="ACK this entry"
                onClick={onAck}
              >
                <Check className="h-3 w-3 text-green-500" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 opacity-0 transition-opacity group-hover:opacity-100"
              onClick={onDelete}
            >
              <Trash2 className="h-3 w-3 text-destructive" />
            </Button>
          </div>
        </TableCell>
      </TableRow>
      {expanded && (
        <TableRow className="bg-muted/20">
          <TableCell colSpan={5} className="py-2">
            <div className="space-y-1 px-2">
              {Object.entries(entry.fields).map(([key, fieldValue]) => (
                <div key={key} className="flex gap-2 text-xs">
                  <span className="min-w-[80px] font-mono text-muted-foreground">
                    {key}
                  </span>
                  <span className="font-mono">{fieldValue}</span>
                </div>
              ))}
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  );
});
