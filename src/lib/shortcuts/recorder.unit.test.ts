import { describe, expect, test } from "bun:test";

import {
  isModifierless,
  validateRecording,
  findConflict,
  type ConflictInfo,
} from "./recorder";
import { SHORTCUT_DEFAULTS } from "./defaults";
import { DISABLED_BINDING, type ShortcutBindings } from "./types";

describe("isModifierless", () => {
  test("bare Tab is modifierless", () => {
    expect(isModifierless("Tab")).toBe(true);
  });

  test("F5 is modifierless", () => {
    expect(isModifierless("F5")).toBe(true);
  });

  test("Escape is modifierless", () => {
    expect(isModifierless("Escape")).toBe(true);
  });

  test("Mod+S is not modifierless", () => {
    expect(isModifierless("Mod+S")).toBe(false);
  });

  test("Shift+Alt+F is not modifierless", () => {
    expect(isModifierless("Shift+Alt+F")).toBe(false);
  });

  test("none is not modifierless (it is disabled)", () => {
    expect(isModifierless(DISABLED_BINDING)).toBe(false);
  });
});

describe("findConflict", () => {
  const base: ShortcutBindings = Object.fromEntries(
    Object.keys(SHORTCUT_DEFAULTS).map((id) => [id, SHORTCUT_DEFAULTS[id as keyof typeof SHORTCUT_DEFAULTS].combo]),
  ) as ShortcutBindings;

  test("finds conflict with same combo on another id", () => {
    const conflict = findConflict(
      "table.save",
      "Mod+S",
      base,
      SHORTCUT_DEFAULTS,
    );
    expect(conflict).not.toBeNull();
    expect(conflict?.otherId).toBe("editor.save");
  });

  test("returns null when no other id has the combo", () => {
    const conflict = findConflict(
      "global.openSettings",
      "Mod+Shift+K",
      base,
      SHORTCUT_DEFAULTS,
    );
    expect(conflict).toBeNull();
  });

  test("does not flag the same id as a conflict with itself", () => {
    const conflict = findConflict(
      "global.openSettings",
      "Mod+,",
      base,
      SHORTCUT_DEFAULTS,
    );
    expect(conflict).toBeNull();
  });

  test("ignores disabled entries when scanning", () => {
    const mutated: ShortcutBindings = {
      ...base,
      "editor.save": DISABLED_BINDING,
    };
    const conflict = findConflict(
      "table.save",
      "Mod+S",
      mutated,
      SHORTCUT_DEFAULTS,
    );
    expect(conflict).toBeNull();
  });
});

describe("validateRecording", () => {
  const base: ShortcutBindings = Object.fromEntries(
    Object.keys(SHORTCUT_DEFAULTS).map((id) => [id, SHORTCUT_DEFAULTS[id as keyof typeof SHORTCUT_DEFAULTS].combo]),
  ) as ShortcutBindings;

  test("Escape cancels without commit and no error", () => {
    const result = validateRecording({
      pressedCombo: "Escape",
      isEscape: true,
      targetId: "editor.save",
      bindings: base,
      registry: SHORTCUT_DEFAULTS,
    });
    expect(result.outcome).toBe("cancel");
  });

  test("modifierless new binding is rejected with no-modifier error", () => {
    const result = validateRecording({
      pressedCombo: "F5",
      isEscape: false,
      targetId: "editor.format",
      bindings: base,
      registry: SHORTCUT_DEFAULTS,
    });
    expect(result.outcome).toBe("reject");
    expect(result.error).toBe("noModifier");
  });

  test("conflict requires explicit confirmation", () => {
    const result = validateRecording({
      pressedCombo: "Mod+S",
      isEscape: false,
      targetId: "global.newQueryTab",
      bindings: base,
      registry: SHORTCUT_DEFAULTS,
    });
    expect(result.outcome).toBe("conflict");
    const conflict = (result as { outcome: "conflict"; conflict: ConflictInfo })
      .conflict;
    expect(conflict.otherId).toBe("editor.save");
  });

  test("uncontested new binding commits directly", () => {
    const result = validateRecording({
      pressedCombo: "Mod+Shift+K",
      isEscape: false,
      targetId: "global.newQueryTab",
      bindings: base,
      registry: SHORTCUT_DEFAULTS,
    });
    expect(result.outcome).toBe("commit");
  });
});
