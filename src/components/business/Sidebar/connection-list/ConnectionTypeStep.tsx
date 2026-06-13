import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/components/ui/utils";
import { DRIVER_REGISTRY } from "@/lib/driver-registry";
import type { Driver } from "@/services/api";

interface ConnectionTypeStepProps {
  selectedDriver: Driver;
  onSelect: (driver: Driver) => void;
  previewLabel: string;
}

const isPreviewDriver = (driver: Driver) =>
  DRIVER_REGISTRY.find((item) => item.id === driver)?.importCapability ===
  "unsupported";

export function ConnectionTypeStep({
  selectedDriver,
  onSelect,
  previewLabel,
}: ConnectionTypeStepProps) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {DRIVER_REGISTRY.map((driver) => (
        <button
          key={driver.id}
          type="button"
          className="text-left"
          onClick={() => onSelect(driver.id)}
        >
          <Card
            className={cn(
              "relative h-full transition-colors hover:border-primary/50 hover:bg-accent/30",
              selectedDriver === driver.id && "border-primary bg-accent/20",
            )}
          >
            <CardContent className="flex h-full flex-col gap-3 p-4">
              {isPreviewDriver(driver.id) ? (
                <Badge
                  variant="outline"
                  className="absolute top-3 right-3 font-normal"
                >
                  {previewLabel}
                </Badge>
              ) : null}
              <div className="flex h-full flex-col items-center justify-center gap-3 py-1 text-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl border bg-muted/40 [&_svg]:h-8 [&_svg]:w-8">
                  {driver.icon()}
                </div>
                <div className="text-base font-medium">{driver.label}</div>
              </div>
            </CardContent>
          </Card>
        </button>
      ))}
    </div>
  );
}
