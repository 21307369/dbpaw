import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { useShortcuts } from "@/contexts/ShortcutsContext";
import { SHORTCUT_DEFAULTS } from "./defaults";
import { comboFromEvent, comboToDisplay, matchShortcut } from "./match";
import {
  DISABLED_BINDING,
  type KeyCombo,
  type ShortcutBindings,
  type ShortcutDef,
  type ShortcutId,
  type ShortcutsRegistry,
} from "./types";

export type ConflictInfo = {
  otherId: ShortcutId;
  otherLabelKey: string;
};

export type ValidationResult =
  | { outcome: "cancel" }
  | { outcome: "reject"; error: "noModifier" }
  | { outcome: "commit" }
  | { outcome: "conflict"; conflict: ConflictInfo };

export function isModifierless(combo: KeyCombo): boolean {
  if (!combo || combo === DISABLED_BINDING) return false;
  const parts = combo.split("+").map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) return true;
  return parts.length === 1;
}

export function findConflict(
  targetId: ShortcutId,
  candidate: KeyCombo,
  bindings: ShortcutBindings,
  registry: ShortcutsRegistry,
): ConflictInfo | null {
  if (candidate === DISABLED_BINDING) return null;
  for (const id of Object.keys(registry) as ShortcutId[]) {
    if (id === targetId) continue;
    const existing = bindings[id];
    if (!existing || existing === DISABLED_BINDING) continue;
    if (existing === candidate) {
      return {
        otherId: id,
        otherLabelKey: registry[id].labelKey,
      };
    }
  }
  return null;
}

type ValidateInput = {
  pressedCombo: KeyCombo;
  isEscape: boolean;
  targetId: ShortcutId;
  bindings: ShortcutBindings;
  registry: ShortcutsRegistry;
};

export function validateRecording(input: ValidateInput): ValidationResult {
  if (input.isEscape) return { outcome: "cancel" };
  if (isModifierless(input.pressedCombo)) {
    return { outcome: "reject", error: "noModifier" };
  }
  const conflict = findConflict(
    input.targetId,
    input.pressedCombo,
    input.bindings,
    input.registry,
  );
  if (conflict) return { outcome: "conflict", conflict };
  return { outcome: "commit" };
}

type RecorderState =
  | { mode: "idle" }
  | { mode: "recording" }
  | {
      mode: "confirming";
      candidate: KeyCombo;
      conflict: ConflictInfo;
    }
  | { mode: "error"; messageKey: "noModifier" };

export type ShortcutRecorderProps = {
  id: ShortcutId;
  def: ShortcutDef;
};

export function ShortcutRecorder({ id, def }: ShortcutRecorderProps) {
  const { t } = useTranslation();
  const { bindings, setBinding, resetBinding } = useShortcuts();
  const current = bindings[id] ?? def.combo;
  const isCustomized = current !== def.combo;
  const [state, setState] = useState<RecorderState>({ mode: "idle" });
  const [lastNonNone, setLastNonNone] = useState<KeyCombo>(def.combo);
  const armedRef = useRef(false);

  useEffect(() => {
    if (current !== DISABLED_BINDING && current !== lastNonNone) {
      setLastNonNone(current);
    }
  }, [current, lastNonNone]);

  useEffect(() => {
    if (state.mode !== "recording") return;
    armedRef.current = true;
    const onKeyDown = (e: KeyboardEvent) => {
      if (!armedRef.current) return;
      armedRef.current = false;
      e.preventDefault();
      e.stopPropagation();
      const combo = comboFromEvent(e);
      if (e.key === "Escape") {
        setState({ mode: "idle" });
        return;
      }
      const result = validateRecording({
        pressedCombo: combo,
        isEscape: false,
        targetId: id,
        bindings,
        registry: SHORTCUT_DEFAULTS,
      });
      switch (result.outcome) {
        case "cancel":
          setState({ mode: "idle" });
          break;
        case "reject":
          setState({ mode: "error", messageKey: result.error });
          break;
        case "commit":
          void setBinding(id, combo);
          setLastNonNone(combo);
          setState({ mode: "idle" });
          break;
        case "conflict":
          setState({
            mode: "confirming",
            candidate: combo,
            conflict: result.conflict,
          });
          break;
      }
    };
    window.addEventListener("keydown", onKeyDown, { capture: true });
    return () => {
      armedRef.current = false;
      window.removeEventListener("keydown", onKeyDown, { capture: true });
    };
  }, [state.mode, id, bindings, setBinding]);

  if (current === DISABLED_BINDING) {
    return (
      <div className="flex items-center gap-2">
        <span className="rounded border bg-muted/50 px-2 py-1 text-xs text-muted-foreground">
          {t("settings.shortcuts.disabled")}
        </span>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            const restore = lastNonNone === DISABLED_BINDING
              ? def.combo
              : lastNonNone;
            void setBinding(id, restore);
          }}
        >
          {t("settings.shortcuts.enable")}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => void resetBinding(id)}
        >
          {t("settings.shortcuts.resetOne")}
        </Button>
      </div>
    );
  }

  if (state.mode === "recording") {
    return (
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <span className="rounded border border-dashed border-primary bg-primary/10 px-2 py-1 text-xs font-mono text-primary">
            {t("settings.shortcuts.recording")}
          </span>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setState({ mode: "idle" })}
          >
            {t("settings.shortcuts.cancel")}
          </Button>
        </div>
        {state.mode === "recording" && null}
        <span className="text-xs text-muted-foreground">
          {t("settings.shortcuts.recordingHint")}
        </span>
      </div>
    );
  }

  if (state.mode === "confirming") {
    const { candidate, conflict } = state;
    return (
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <span className="rounded border bg-muted/40 px-2 py-1 text-xs font-mono">
            {comboToDisplay(candidate)}
          </span>
          <span className="text-xs text-amber-600 dark:text-amber-400">
            {t("settings.shortcuts.conflictPrompt", {
              other: t(conflict.otherLabelKey),
            })}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="destructive"
            onClick={async () => {
              const otherId = conflict.otherId;
              await setBinding(id, candidate);
              await setBinding(otherId, DISABLED_BINDING);
              setLastNonNone(candidate);
              setState({ mode: "idle" });
            }}
          >
            {t("settings.shortcuts.confirmReplace")}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setState({ mode: "idle" })}
          >
            {t("settings.shortcuts.cancel")}
          </Button>
        </div>
      </div>
    );
  }

  if (state.mode === "error") {
    return (
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <span className="rounded border border-destructive/40 bg-destructive/10 px-2 py-1 text-xs text-destructive">
            {t("settings.shortcuts.errorNoModifier")}
          </span>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setState({ mode: "recording" })}
          >
            {t("settings.shortcuts.record")}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setState({ mode: "idle" })}
          >
            {t("settings.shortcuts.cancel")}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <span
        className={`rounded border px-2 py-1 text-xs font-mono ${
          isCustomized
            ? "border-primary/40 bg-primary/5 text-primary"
            : "bg-muted/40 text-foreground"
        }`}
        data-testid={`shortcut-display-${id}`}
      >
        {comboToDisplay(current)}
      </span>
      <Button
        size="sm"
        variant="outline"
        onClick={() => setState({ mode: "recording" })}
        data-testid={`shortcut-record-${id}`}
      >
        {t("settings.shortcuts.record")}
      </Button>
      <Button
        size="sm"
        variant="ghost"
        onClick={() => void resetBinding(id)}
        disabled={!isCustomized}
      >
        {t("settings.shortcuts.resetOne")}
      </Button>
      <Button
        size="sm"
        variant="ghost"
        onClick={() => void setBinding(id, DISABLED_BINDING)}
      >
        {t("settings.shortcuts.disable")}
      </Button>
    </div>
  );
}

export function isShortcutDisabled(combo: KeyCombo): boolean {
  return combo === DISABLED_BINDING;
}

export function matchesBinding(
  e: KeyboardEvent,
  combo: KeyCombo,
): boolean {
  if (!combo || combo === DISABLED_BINDING) return false;
  return matchShortcut(e, combo);
}
