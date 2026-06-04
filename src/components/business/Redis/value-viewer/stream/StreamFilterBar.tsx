import { type Dispatch, type SetStateAction } from "react";
import { Filter, Loader2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { RedisStreamGroup } from "@/services/api";
import type { StreamBrowserState } from "./utils";

export function StreamFilterBar({
  browser,
  isLoading,
  onChange,
  onApply,
  onReset,
  readMode,
  onReadModeChange,
  xrgGroup,
  onXrgGroupChange,
  xrgConsumer,
  onXrgConsumerChange,
  xrgStartId,
  onXrgStartIdChange,
  groups,
  onXreadgroupApply,
  isLoadingXrg,
}: {
  browser: StreamBrowserState;
  isLoading: boolean;
  onChange: Dispatch<SetStateAction<StreamBrowserState>>;
  onApply: () => void;
  onReset: () => void;
  readMode: "xrange" | "xreadgroup";
  onReadModeChange: (mode: "xrange" | "xreadgroup") => void;
  xrgGroup: string;
  onXrgGroupChange: (v: string) => void;
  xrgConsumer: string;
  onXrgConsumerChange: (v: string) => void;
  xrgStartId: string;
  onXrgStartIdChange: (v: string) => void;
  groups: RedisStreamGroup[];
  onXreadgroupApply: () => void;
  isLoadingXrg: boolean;
}) {
  return (
    <div className="space-y-2 rounded-md border bg-muted/20 p-3">
      <div className="flex items-center gap-2">
        <button
          className={`rounded px-2 py-1 text-xs font-medium transition-colors ${readMode === "xrange" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}
          onClick={() => onReadModeChange("xrange")}
        >
          XRANGE
        </button>
        <button
          className={`rounded px-2 py-1 text-xs font-medium transition-colors ${readMode === "xreadgroup" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}
          onClick={() => onReadModeChange("xreadgroup")}
        >
          Consumer Group
        </button>
      </div>

      {readMode === "xrange" ? (
        <div className="grid gap-2 md:grid-cols-[1fr_1fr_120px_auto_auto]">
          <Input
            className="h-8 font-mono text-xs"
            value={browser.startIdInput}
            onChange={(e) =>
              onChange((current) => ({
                ...current,
                startIdInput: e.target.value,
              }))
            }
            placeholder="Start ID (-)"
          />
          <Input
            className="h-8 font-mono text-xs"
            value={browser.endIdInput}
            onChange={(e) =>
              onChange((current) => ({
                ...current,
                endIdInput: e.target.value,
              }))
            }
            placeholder="End ID (+)"
          />
          <Input
            className="h-8 font-mono text-xs"
            value={browser.countInput}
            onChange={(e) =>
              onChange((current) => ({
                ...current,
                countInput: e.target.value,
              }))
            }
            placeholder="Count"
            inputMode="numeric"
          />
          <Button
            variant="outline"
            size="sm"
            className="h-8"
            onClick={onApply}
            disabled={isLoading}
          >
            {isLoading ? (
              <Loader2 className="mr-1 h-3 w-3 animate-spin" />
            ) : (
              <Filter className="mr-1 h-3 w-3" />
            )}
            Apply
          </Button>
          <Button variant="ghost" size="sm" className="h-8" onClick={onReset}>
            <RotateCcw className="mr-1 h-3 w-3" />
            Reset
          </Button>
        </div>
      ) : (
        <div className="grid gap-2 md:grid-cols-[1fr_1fr_120px_auto]">
          <Select value={xrgGroup} onValueChange={onXrgGroupChange}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="Select group" />
            </SelectTrigger>
            <SelectContent>
              {groups.map((g) => (
                <SelectItem key={g.name} value={g.name}>
                  {g.name}
                </SelectItem>
              ))}
              {groups.length === 0 && (
                <SelectItem value="__none" disabled>
                  No groups available
                </SelectItem>
              )}
            </SelectContent>
          </Select>
          <Input
            className="h-8 font-mono text-xs"
            value={xrgConsumer}
            onChange={(e) => onXrgConsumerChange(e.target.value)}
            placeholder="Consumer name"
          />
          <Select value={xrgStartId} onValueChange={onXrgStartIdChange}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="&gt;">New messages only (&gt;)</SelectItem>
              <SelectItem value="0">Pending messages (0)</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            className="h-8"
            onClick={onXreadgroupApply}
            disabled={isLoadingXrg || !xrgGroup || !xrgConsumer}
          >
            {isLoadingXrg ? (
              <Loader2 className="mr-1 h-3 w-3 animate-spin" />
            ) : (
              <Filter className="mr-1 h-3 w-3" />
            )}
            Read
          </Button>
        </div>
      )}
    </div>
  );
}
