import { Search, RefreshCw, Loader2, CheckSquare, Terminal, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface KeySearchPanelProps {
  pattern: string;
  onPatternChange: (p: string) => void;
  isLoading: boolean;
  onSearch: () => void;
  keyCount: number;
  isPartial: boolean;
  selectedCount: number;
  onSelectAll: () => void;
  onClearSelection: () => void;
  onOpenConsole?: () => void;
  onNewKey: () => void;
}

export function KeySearchPanel({
  pattern,
  onPatternChange,
  isLoading,
  onSearch,
  keyCount,
  isPartial,
  selectedCount,
  onSelectAll,
  onClearSelection,
  onOpenConsole,
  onNewKey,
}: KeySearchPanelProps) {
  return (
    <div className="p-3 border-b space-y-2 shrink-0">
      <div className="flex gap-1.5">
        <div className="relative flex-1">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
          <Input
            className="h-7 pl-7 text-xs font-mono"
            placeholder="Pattern (user:* or *)"
            value={pattern}
            onChange={(e) => onPatternChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onSearch();
            }}
          />
        </div>
        <Button
          variant="outline"
          size="sm"
          className="h-7 w-7 p-0 shrink-0"
          onClick={onSearch}
          disabled={isLoading}
          title="Search / Refresh"
        >
          {isLoading ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <RefreshCw className="w-3.5 h-3.5" />
          )}
        </Button>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">
          {keyCount} keys{isPartial ? "+" : ""}
        </span>
        <div className="flex items-center gap-1.5">
          <Button
            variant={selectedCount > 0 ? "default" : "outline"}
            size="sm"
            className="h-6 px-2 text-xs"
            onClick={selectedCount > 0 ? onClearSelection : onSelectAll}
            title={selectedCount > 0 ? "Clear selection" : "Select all"}
          >
            <CheckSquare className="w-3 h-3 mr-1" />
            {selectedCount > 0 ? "Clear" : "Select"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-6 px-2 text-xs"
            onClick={onOpenConsole}
            title="Open Console"
          >
            <Terminal className="w-3 h-3 mr-1" />
            Console
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-6 px-2 text-xs"
            onClick={onNewKey}
          >
            <Plus className="w-3 h-3 mr-1" />
            New key
          </Button>
        </div>
      </div>
    </div>
  );
}
