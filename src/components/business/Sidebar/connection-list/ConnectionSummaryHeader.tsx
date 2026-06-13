import { Button } from "@/components/ui/button";
import type { Driver } from "@/services/api";

interface ConnectionSummaryHeaderProps {
  driverConfig: { icon: () => React.ReactNode; label: string };
  dialogMode: "create" | "edit";
  onBackToType: () => void;
  backLabel: string;
}

export function ConnectionSummaryHeader({
  driverConfig,
  dialogMode,
  onBackToType,
  backLabel,
}: ConnectionSummaryHeaderProps) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border bg-muted/20 px-4 py-3">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg border bg-background">
          {driverConfig.icon()}
        </div>
        <div className="font-medium">{driverConfig.label}</div>
      </div>
      {dialogMode === "create" ? (
        <Button type="button" variant="ghost" onClick={onBackToType}>
          {backLabel}
        </Button>
      ) : null}
    </div>
  );
}
