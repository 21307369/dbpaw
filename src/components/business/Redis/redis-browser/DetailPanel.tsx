import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RedisKeyView } from "../RedisKeyView";

type DetailState =
  | { mode: "none" }
  | { mode: "new" }
  | { mode: "view"; key: string };

interface DetailPanelProps {
  detail: DetailState;
  connectionId: number;
  database: string;
  onNewKey: () => void;
  onKeyDeleted: () => void;
  onKeySaved: (key: string) => void;
}

export function DetailPanel({
  detail,
  connectionId,
  database,
  onNewKey,
  onKeyDeleted,
  onKeySaved,
}: DetailPanelProps) {
  if (detail.mode === "none") {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-2 text-muted-foreground">
        <p className="text-sm">Select a key to view and edit</p>
        <Button variant="outline" size="sm" onClick={onNewKey}>
          <Plus className="w-4 h-4 mr-2" />
          New key
        </Button>
      </div>
    );
  }

  return (
    <RedisKeyView
      key={detail.mode === "new" ? "__new__" : detail.key}
      connectionId={connectionId}
      database={database}
      redisKey={detail.mode === "new" ? "" : detail.key}
      onDeleted={onKeyDeleted}
      onSavedKeyChange={onKeySaved}
    />
  );
}
