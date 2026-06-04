import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function StreamAddEntryForm({
  newId,
  newFieldsRaw,
  onIdChange,
  onFieldsChange,
  onAdd,
  onCancel,
}: {
  newId: string;
  newFieldsRaw: string;
  onIdChange: (value: string) => void;
  onFieldsChange: (value: string) => void;
  onAdd: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="space-y-2 rounded-md border bg-muted/20 p-3">
      <Input
        className="h-7 w-40 font-mono text-xs"
        value={newId}
        onChange={(e) => onIdChange(e.target.value)}
        placeholder="ID (* = auto)"
      />
      <textarea
        className="h-20 w-full resize-y rounded-md border bg-background px-3 py-2 text-xs font-mono"
        value={newFieldsRaw}
        onChange={(e) => onFieldsChange(e.target.value)}
        placeholder={"field1=value1\nfield2=value2"}
      />
      <div className="flex gap-2">
        <Button variant="ghost" size="sm" className="h-7" onClick={onAdd}>
          <Check className="mr-1 h-3 w-3 text-green-500" />
          Add
        </Button>
        <Button variant="ghost" size="sm" className="h-7" onClick={onCancel}>
          <X className="mr-1 h-3 w-3 text-muted-foreground" />
          Cancel
        </Button>
      </div>
    </div>
  );
}
