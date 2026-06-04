import {
  Check,
  ChevronDown,
  ChevronRight,
  Clock,
  Loader2,
  RotateCcw,
  ShieldCheck,
  Trash2,
  UserPlus,
  Users,
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
import type {
  RedisStreamGroup,
  RedisXPendingEntry,
  RedisXPendingSummary,
} from "@/services/api";
import { formatIdleMs } from "./utils";

export function StreamGroupsTable({
  groups,
  expandedGroupNames,
  pendingData,
  pendingLoading,
  selectedPendingIds,
  onToggleGroup,
  onCreateGroup,
  onDeleteGroup,
  onResetGroup,
  onLoadPendingDetails,
  onAck,
  onClaim,
  onTogglePendingSelect,
}: {
  groups: RedisStreamGroup[];
  expandedGroupNames: Set<string>;
  pendingData: Record<
    string,
    RedisXPendingSummary | RedisXPendingEntry[] | null
  >;
  pendingLoading: Record<string, boolean>;
  selectedPendingIds: Set<string>;
  onToggleGroup: (name: string) => void;
  onCreateGroup: () => void;
  onDeleteGroup: (name: string) => void;
  onResetGroup: (name: string) => void;
  onLoadPendingDetails: (name: string) => void;
  onAck: (group: string, ids: string[]) => void;
  onClaim: (group: string, entry: RedisXPendingEntry) => void;
  onTogglePendingSelect: (id: string) => void;
}) {
  return (
    <div className="rounded-md border">
      <div className="flex items-center justify-between border-b px-3 py-2">
        <div className="flex items-center gap-2 text-sm">
          <Users className="h-4 w-4 text-muted-foreground" />
          <span>Consumer groups</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {groups.length} groups
          </span>
          <Button
            variant="outline"
            size="sm"
            className="h-6 px-2 text-xs"
            onClick={onCreateGroup}
          >
            <UserPlus className="mr-1 h-3 w-3" />
            Create
          </Button>
        </div>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[32px]" />
            <TableHead className="text-xs">Group</TableHead>
            <TableHead className="text-xs">Consumers</TableHead>
            <TableHead className="text-xs">Pending</TableHead>
            <TableHead className="text-xs">Last delivered ID</TableHead>
            <TableHead className="text-xs">Lag</TableHead>
            <TableHead className="w-[80px]" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {groups.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={7}
                className="py-5 text-center text-sm text-muted-foreground"
              >
                No consumer groups
              </TableCell>
            </TableRow>
          ) : (
            groups.flatMap((group) => {
              const expanded = expandedGroupNames.has(group.name);
              const rows = [
                <TableRow
                  key={group.name}
                  className="cursor-pointer hover:bg-muted/30"
                  onClick={() => onToggleGroup(group.name)}
                >
                  <TableCell className="py-1.5">
                    {expanded ? (
                      <ChevronDown className="h-3 w-3" />
                    ) : (
                      <ChevronRight className="h-3 w-3" />
                    )}
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {group.name}
                  </TableCell>
                  <TableCell className="text-xs">{group.consumers}</TableCell>
                  <TableCell className="text-xs">
                    <span
                      className={
                        group.pending > 0 ? "text-orange-500 font-medium" : ""
                      }
                    >
                      {group.pending}
                    </span>
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {group.lastDeliveredId || "n/a"}
                  </TableCell>
                  <TableCell className="text-xs">
                    {group.lag ?? group.entriesRead ?? "n/a"}
                  </TableCell>
                  <TableCell className="py-1.5">
                    <div
                      className="flex gap-1"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        title="Reset cursor"
                        onClick={() => onResetGroup(group.name)}
                      >
                        <RotateCcw className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        title="Delete group"
                        onClick={() => onDeleteGroup(group.name)}
                      >
                        <Trash2 className="h-3 w-3 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>,
              ];

              if (expanded) {
                rows.push(
                  <TableRow
                    key={`${group.name}-pending`}
                    className="bg-muted/10"
                  >
                    <TableCell colSpan={7} className="p-0">
                      <StreamPendingPanel
                        data={pendingData[group.name] ?? null}
                        isLoading={!!pendingLoading[group.name]}
                        selectedIds={selectedPendingIds}
                        onLoadDetails={() =>
                          void onLoadPendingDetails(group.name)
                        }
                        onAck={(ids) => onAck(group.name, ids)}
                        onClaim={(entry) => onClaim(group.name, entry)}
                        onToggleSelect={onTogglePendingSelect}
                      />
                    </TableCell>
                  </TableRow>,
                );
              }
              return rows;
            })
          )}
        </TableBody>
      </Table>
    </div>
  );
}

function StreamPendingPanel({
  data,
  isLoading,
  selectedIds,
  onLoadDetails,
  onAck,
  onClaim,
  onToggleSelect,
}: {
  data: RedisXPendingSummary | RedisXPendingEntry[] | null;
  isLoading: boolean;
  selectedIds: Set<string>;
  onLoadDetails: () => void;
  onAck: (ids: string[]) => void;
  onClaim: (entry: RedisXPendingEntry) => void;
  onToggleSelect: (id: string) => void;
}) {
  if (isLoading) {
    return (
      <div className="flex items-center gap-2 px-4 py-3 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading pending info…
      </div>
    );
  }

  if (!data) {
    return (
      <div className="px-4 py-3 text-sm text-muted-foreground">
        No pending data
      </div>
    );
  }

  // Summary mode
  if ("minId" in data) {
    const summary = data as RedisXPendingSummary;
    return (
      <div className="space-y-2 px-4 py-3">
        <div className="grid gap-2 md:grid-cols-4">
          <div className="text-xs">
            <span className="text-muted-foreground">Total pending: </span>
            <span className="font-mono font-medium">{summary.count}</span>
          </div>
          <div className="text-xs">
            <span className="text-muted-foreground">Min ID: </span>
            <span className="font-mono">{summary.minId || "n/a"}</span>
          </div>
          <div className="text-xs">
            <span className="text-muted-foreground">Max ID: </span>
            <span className="font-mono">{summary.maxId || "n/a"}</span>
          </div>
          <div className="text-xs">
            <span className="text-muted-foreground">Consumers: </span>
            {summary.consumers.length === 0
              ? "none"
              : summary.consumers.map(([name, cnt]) => (
                  <Badge
                    key={name}
                    variant="secondary"
                    className="ml-1 text-[10px]"
                  >
                    {name}: {cnt}
                  </Badge>
                ))}
          </div>
        </div>
        {summary.count > 0 && (
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={onLoadDetails}
          >
            View Details
          </Button>
        )}
      </div>
    );
  }

  // Entries mode
  const entries = data as RedisXPendingEntry[];
  const hasSelection = selectedIds.size > 0;

  return (
    <div className="space-y-2 px-4 py-3">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">
          {entries.length} pending entries
        </span>
        {hasSelection && (
          <Button
            variant="outline"
            size="sm"
            className="h-6 text-xs"
            onClick={() => onAck(Array.from(selectedIds))}
          >
            <ShieldCheck className="mr-1 h-3 w-3" />
            ACK selected ({selectedIds.size})
          </Button>
        )}
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[32px]" />
            <TableHead className="text-xs">Entry ID</TableHead>
            <TableHead className="text-xs">Consumer</TableHead>
            <TableHead className="text-xs">Idle</TableHead>
            <TableHead className="text-xs">Deliveries</TableHead>
            <TableHead className="w-[80px]" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {entries.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={6}
                className="py-3 text-center text-xs text-muted-foreground"
              >
                No pending entries
              </TableCell>
            </TableRow>
          ) : (
            entries.map((entry) => (
              <TableRow key={entry.id} className="group">
                <TableCell className="py-1">
                  <input
                    type="checkbox"
                    className="h-3.5 w-3.5"
                    checked={selectedIds.has(entry.id)}
                    onChange={() => onToggleSelect(entry.id)}
                  />
                </TableCell>
                <TableCell className="font-mono text-xs">{entry.id}</TableCell>
                <TableCell className="font-mono text-xs">
                  {entry.consumer}
                </TableCell>
                <TableCell className="text-xs">
                  <span className="inline-flex items-center gap-1">
                    <Clock className="h-3 w-3 text-muted-foreground" />
                    {formatIdleMs(entry.idleMs)}
                  </span>
                </TableCell>
                <TableCell className="text-xs">{entry.deliveryCount}</TableCell>
                <TableCell className="py-1">
                  <div className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      title="ACK this entry"
                      onClick={() => onAck([entry.id])}
                    >
                      <Check className="h-3 w-3 text-green-500" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      title="Claim to another consumer"
                      onClick={() => onClaim(entry)}
                    >
                      <RotateCcw className="h-3 w-3" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
