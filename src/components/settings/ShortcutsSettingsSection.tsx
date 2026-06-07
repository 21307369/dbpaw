import { Command } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { useShortcuts } from "@/contexts/ShortcutsContext";
import { SHORTCUT_DEFAULTS, SCOPE_GROUP_ORDER } from "@/lib/shortcuts/defaults";
import { ShortcutRecorder } from "@/lib/shortcuts/recorder";
import type { ShortcutId } from "@/lib/shortcuts/types";

export function ShortcutsSettingsSection() {
  const { t } = useTranslation();
  const { ready, resetAll } = useShortcuts();
  const [confirming, setConfirming] = useState(false);

  if (!ready) {
    return (
      <div className="rounded-md border p-4 text-sm text-muted-foreground">
        {t("settings.shortcuts.loading")}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium flex items-center gap-2">
          <Command className="w-5 h-5" /> {t("settings.shortcuts.title")}
        </h3>
        {!confirming ? (
          <Button
            size="sm"
            variant="outline"
            onClick={() => setConfirming(true)}
          >
            {t("settings.shortcuts.resetAll")}
          </Button>
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              {t("settings.shortcuts.resetAllConfirm")}
            </span>
            <Button
              size="sm"
              variant="destructive"
              onClick={async () => {
                await resetAll();
                setConfirming(false);
              }}
            >
              {t("settings.shortcuts.confirmResetAll")}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setConfirming(false)}
            >
              {t("settings.shortcuts.cancel")}
            </Button>
          </div>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        {t("settings.shortcuts.hint")}
      </p>
      <div className="space-y-4">
        {SCOPE_GROUP_ORDER.filter((g) => g.scope !== "input").map((group) => {
          const idsInScope = (
            Object.keys(SHORTCUT_DEFAULTS) as ShortcutId[]
          ).filter((id) => SHORTCUT_DEFAULTS[id].scope === group.scope);
          if (idsInScope.length === 0) return null;
          return (
            <div key={group.scope} className="rounded-md border">
              <div className="border-b bg-muted/40 px-3 py-2 text-sm font-medium text-foreground">
                {t(group.titleKey)}
              </div>
              <div className="divide-y">
                {idsInScope.map((id) => (
                  <div
                    key={id}
                    className="grid grid-cols-1 gap-2 px-3 py-2 sm:grid-cols-[1.2fr_auto]"
                  >
                    <div className="space-y-0.5">
                      <div className="text-sm text-foreground">
                        {t(SHORTCUT_DEFAULTS[id].labelKey)}
                      </div>
                      {SHORTCUT_DEFAULTS[id].noteKey && (
                        <div className="text-xs text-muted-foreground">
                          {t(SHORTCUT_DEFAULTS[id].noteKey)}
                        </div>
                      )}
                    </div>
                    <div className="flex justify-end">
                      <ShortcutRecorder id={id} def={SHORTCUT_DEFAULTS[id]} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
