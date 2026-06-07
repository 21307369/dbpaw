import { useState, useEffect, type FormEvent } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { isModKey } from "@/lib/keyboard";
import { useTranslation } from "react-i18next";

interface SaveQueryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (name: string, description: string) => void | Promise<void>;
  initialName?: string;
  initialDescription?: string;
}

export function SaveQueryDialog({
  open,
  onOpenChange,
  onSave,
  initialName = "",
  initialDescription = "",
}: SaveQueryDialogProps) {
  const { t } = useTranslation();
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription);
  const [isSaving, setIsSaving] = useState(false);
  const canSave = name.trim().length > 0;

  useEffect(() => {
    if (open) {
      setName(initialName);
      setDescription(initialDescription);
    }
  }, [open, initialName, initialDescription]);

  const submitSave = async () => {
    if (!canSave || isSaving) return;
    setIsSaving(true);
    try {
      await onSave(name, description);
      onOpenChange(false);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    void submitSave();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{t("saveQueryDialog.title")}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="name">{t("saveQueryDialog.name")}</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("saveQueryDialog.namePlaceholder")}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="description">
                {t("saveQueryDialog.description")}
              </Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key !== "Enter") return;
                  if (e.shiftKey && !isModKey(e)) return;
                  e.preventDefault();
                  void submitSave();
                }}
                placeholder={t("saveQueryDialog.descriptionPlaceholder")}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={!canSave || isSaving}>
              {t("common.save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
