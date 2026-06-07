import { Trash2, Unlink, Clock, LockOpen, FileDown, FileUp } from "lucide-react";
import { Button } from "@/components/ui/button";

interface BatchOperationsToolbarProps {
  selectedCount: number;
  batchLoading: boolean;
  onRunBatchOp: (op: "del" | "unlink" | "persist") => void;
  onOpenExpireDialog: () => void;
  onMgetExport: () => void;
  onOpenMsetDialog: () => void;
}

export function BatchOperationsToolbar({
  selectedCount,
  batchLoading,
  onRunBatchOp,
  onOpenExpireDialog,
  onMgetExport,
  onOpenMsetDialog,
}: BatchOperationsToolbarProps) {
  return (
    <div className="px-3 py-2 border-b bg-muted/30 space-y-1.5 shrink-0">
      <div className="flex items-center gap-1 flex-wrap">
        <Button
          variant="destructive"
          size="sm"
          className="h-6 px-2 text-xs"
          disabled={batchLoading}
          onClick={() => onRunBatchOp("del")}
        >
          <Trash2 className="w-3 h-3 mr-1" />
          DEL ({selectedCount})
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-6 px-2 text-xs"
          disabled={batchLoading}
          onClick={() => onRunBatchOp("unlink")}
        >
          <Unlink className="w-3 h-3 mr-1" />
          UNLINK
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-6 px-2 text-xs"
          disabled={batchLoading}
          onClick={onOpenExpireDialog}
        >
          <Clock className="w-3 h-3 mr-1" />
          EXPIRE
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-6 px-2 text-xs"
          disabled={batchLoading}
          onClick={() => onRunBatchOp("persist")}
        >
          <LockOpen className="w-3 h-3 mr-1" />
          PERSIST
        </Button>
        <div className="w-px h-4 bg-border mx-0.5" />
        <Button
          variant="outline"
          size="sm"
          className="h-6 px-2 text-xs"
          disabled={batchLoading}
          onClick={onMgetExport}
        >
          <FileDown className="w-3 h-3 mr-1" />
          MGET
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-6 px-2 text-xs"
          disabled={batchLoading}
          onClick={onOpenMsetDialog}
        >
          <FileUp className="w-3 h-3 mr-1" />
          MSET
        </Button>
      </div>
      <p className="text-[10px] text-muted-foreground">
        Shift+click to range-select
      </p>
    </div>
  );
}
