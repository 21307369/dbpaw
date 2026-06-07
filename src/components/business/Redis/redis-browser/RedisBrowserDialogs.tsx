import { Copy, FileDown, Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { handleApiError } from "@/lib/errors";
import { useTranslation } from "react-i18next";

interface RedisBrowserDialogsProps {
  expireDialogOpen: boolean;
  expireTtl: string;
  onExpireDialogOpenChange: (open: boolean) => void;
  onExpireTtlChange: (ttl: string) => void;
  onExpireSubmit: () => void;
  mgetDialogOpen: boolean;
  mgetData: string;
  onMgetDialogOpenChange: (open: boolean) => void;
  msetDialogOpen: boolean;
  msetImportText: string;
  msetLoading: boolean;
  onMsetDialogOpenChange: (open: boolean) => void;
  onMsetImportTextChange: (text: string) => void;
  onMsetSubmit: () => void;
  onMsetFileImport: () => void;
  selectedCount: number;
  batchLoading: boolean;
}

export function RedisBrowserDialogs({
  expireDialogOpen,
  expireTtl,
  onExpireDialogOpenChange,
  onExpireTtlChange,
  onExpireSubmit,
  mgetDialogOpen,
  mgetData,
  onMgetDialogOpenChange,
  msetDialogOpen,
  msetImportText,
  msetLoading,
  onMsetDialogOpenChange,
  onMsetImportTextChange,
  onMsetSubmit,
  onMsetFileImport,
  selectedCount,
  batchLoading,
}: RedisBrowserDialogsProps) {
  const { t } = useTranslation();

  return (
    <>
      <Dialog open={expireDialogOpen} onOpenChange={onExpireDialogOpenChange}>
        <DialogContent className="sm:max-w-xs">
          <DialogHeader>
            <DialogTitle>Set TTL</DialogTitle>
            <DialogDescription>
              Set expiry for {selectedCount} selected key(s)
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="expire-ttl">TTL (seconds)</Label>
            <Input
              id="expire-ttl"
              type="number"
              min="1"
              value={expireTtl}
              onChange={(e) => onExpireTtlChange(e.target.value)}
              placeholder="3600"
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onExpireDialogOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={
                batchLoading || !expireTtl.trim() || Number(expireTtl) <= 0
              }
              onClick={onExpireSubmit}
            >
              Set TTL
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={mgetDialogOpen} onOpenChange={onMgetDialogOpenChange}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("redis.browser.mgetExport")}</DialogTitle>
            <DialogDescription>
              {t("redis.browser.mgetDescription", { count: selectedCount })}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Textarea
              value={mgetData}
              readOnly
              className="min-h-[200px] font-mono text-xs"
            />
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(mgetData);
                    toast.success(t("redis.browser.copiedToClipboard"));
                  } catch {
                    toast.error(t("redis.browser.copyFailed"));
                  }
                }}
              >
                <Copy className="w-3.5 h-3.5 mr-1.5" />
                {t("redis.browser.copy")}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  try {
                    const { save } = await import("@tauri-apps/plugin-dialog");
                    const { writeTextFile } =
                      await import("@tauri-apps/plugin-fs");
                    const filePath = await save({
                      defaultPath: "redis-mget-export.json",
                      filters: [{ name: "JSON", extensions: ["json"] }],
                    });
                    if (filePath) {
                      await writeTextFile(filePath, mgetData);
                      toast.success(t("redis.browser.exportedSuccessfully"));
                    }
                  } catch (e) {
                    handleApiError(t("redis.browser.exportFailed"), e);
                  }
                }}
              >
                <FileDown className="w-3.5 h-3.5 mr-1.5" />
                {t("redis.browser.saveToFile")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={msetDialogOpen} onOpenChange={onMsetDialogOpenChange}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("redis.browser.msetImport")}</DialogTitle>
            <DialogDescription>
              {t("redis.browser.msetDescription")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label>Data</Label>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-xs"
                  onClick={onMsetFileImport}
                >
                  <Upload className="w-3 h-3 mr-1" />
                  {t("redis.browser.importFile")}
                </Button>
              </div>
              <Textarea
                value={msetImportText}
                onChange={(e) => onMsetImportTextChange(e.target.value)}
                className="min-h-[180px] font-mono text-xs"
                placeholder={
                  '{"key1": "value1", "key2": "value2"}\nor\nkey1: value1\nkey2: value2'
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onMsetDialogOpenChange(false)}
            >
              {t("common.cancel")}
            </Button>
            <Button
              size="sm"
              disabled={msetLoading || !msetImportText.trim()}
              onClick={onMsetSubmit}
            >
              {msetLoading && (
                <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
              )}
              {t("redis.browser.import")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
