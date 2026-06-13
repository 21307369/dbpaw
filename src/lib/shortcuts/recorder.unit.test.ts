import { describe, expect, test } from "bun:test";

import {
  isModifierless,
  isShortcutDisabled,
  matchesBinding,
  validateRecording,
  findConflict,
  type ConflictInfo,
} from "./recorder";
import { SHORTCUT_DEFAULTS } from "./defaults";
import { DISABLED_BINDING, type ShortcutBindings } from "./types";

function makeEvent(
  partial: Partial<KeyboardEvent> & { code: string },
): KeyboardEvent {
  return {
    code: partial.code,
    key: partial.key ?? "",
    metaKey: partial.metaKey ?? false,
    ctrlKey: partial.ctrlKey ?? false,
    altKey: partial.altKey ?? false,
    shiftKey: partial.shiftKey ?? false,
  } as KeyboardEvent;
}

const base: ShortcutBindings = Object.fromEntries(
  Object.keys(SHORTCUT_DEFAULTS).map((id) => [
    id,
    SHORTCUT_DEFAULTS[id as keyof typeof SHORTCUT_DEFAULTS].combo,
  ]),
) as ShortcutBindings;

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

  test("empty string returns false (falsy)", () => {
    expect(isModifierless("")).toBe(false);
  });

  test("single modifier token is modifierless", () => {
    expect(isModifierless("Mod")).toBe(true);
    expect(isModifierless("Shift")).toBe(true);
    expect(isModifierless("Alt")).toBe(true);
  });

  test("Enter is modifierless", () => {
    expect(isModifierless("Enter")).toBe(true);
  });

  test("Space is modifierless", () => {
    expect(isModifierless("Space")).toBe(true);
  });

  test("Mod+Shift+Alt+S is not modifierless (three modifiers)", () => {
    expect(isModifierless("Mod+Shift+Alt+S")).toBe(false);
  });
});

describe("isShortcutDisabled", () => {
  test("returns true for disabled binding", () => {
    expect(isShortcutDisabled(DISABLED_BINDING)).toBe(true);
    expect(isShortcutDisabled("none")).toBe(true);
  });

  test("returns false for valid combos", () => {
    expect(isShortcutDisabled("Mod+S")).toBe(false);
    expect(isShortcutDisabled("Ctrl+Shift+K")).toBe(false);
    expect(isShortcutDisabled("F5")).toBe(false);
    expect(isShortcutDisabled("Escape")).toBe(false);
    expect(isShortcutDisabled("Tab")).toBe(false);
  });

  test("returns false for empty string", () => {
    expect(isShortcutDisabled("")).toBe(false);
  });
});

describe("matchesBinding", () => {
  test("returns true when event matches combo on Windows/Linux", () => {
    const e = makeEvent({ code: "KeyS", ctrlKey: true });
    expect(matchesBinding(e, "Mod+S")).toBe(true);
  });

  test("returns false for disabled binding", () => {
    const e = makeEvent({ code: "KeyS", ctrlKey: true });
    expect(matchesBinding(e, DISABLED_BINDING)).toBe(false);
    expect(matchesBinding(e, "none")).toBe(false);
  });

  test("returns false for empty combo", () => {
    const e = makeEvent({ code: "KeyS", ctrlKey: true });
    expect(matchesBinding(e, "")).toBe(false);
  });

  test("returns false when modifiers do not match", () => {
    const e = makeEvent({ code: "KeyS", ctrlKey: true, shiftKey: true });
    expect(matchesBinding(e, "Mod+S")).toBe(false);
  });

  test("returns false when key does not match", () => {
    const e = makeEvent({ code: "KeyD", ctrlKey: true });
    expect(matchesBinding(e, "Mod+S")).toBe(false);
  });

  test("matches bare function keys", () => {
    const e = makeEvent({ code: "F5" });
    expect(matchesBinding(e, "F5")).toBe(true);
  });

  test("matches Escape without modifiers", () => {
    const e = makeEvent({ code: "Escape" });
    expect(matchesBinding(e, "Escape")).toBe(true);
  });

  test("matches multi-modifier combo", () => {
    const e = makeEvent({
      code: "BracketRight",
      ctrlKey: true,
      shiftKey: true,
    });
    expect(matchesBinding(e, "Mod+Shift+BracketRight")).toBe(true);
  });
});

describe("findConflict", () => {
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

  test("returns null when candidate is disabled", () => {
    const conflict = findConflict(
      "global.newQueryTab",
      DISABLED_BINDING,
      base,
      SHORTCUT_DEFAULTS,
    );
    expect(conflict).toBeNull();
  });

  test("returns null for empty candidate", () => {
    const conflict = findConflict(
      "global.newQueryTab",
      "",
      base,
      SHORTCUT_DEFAULTS,
    );
    expect(conflict).toBeNull();
  });

  test("returns conflict info with correct label key", () => {
    const conflict = findConflict(
      "table.save",
      "Mod+S",
      base,
      SHORTCUT_DEFAULTS,
    );
    expect(conflict).not.toBeNull();
    expect(conflict?.otherLabelKey).toBe(
      SHORTCUT_DEFAULTS["editor.save"].labelKey,
    );
  });

  test("finds first conflict when multiple ids share same combo", () => {
    const mutated: ShortcutBindings = {
      ...base,
      "global.newQueryTab": "Mod+S",
    };
    const conflict = findConflict(
      "editor.save",
      "Mod+S",
      mutated,
      SHORTCUT_DEFAULTS,
    );
    expect(conflict).not.toBeNull();
    expect(["table.save", "global.newQueryTab"]).toContain(conflict?.otherId);
  });
});

describe("validateRecording", () => {
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

  test("disabled candidate commits (not modifierless, no conflict)", () => {
    const result = validateRecording({
      pressedCombo: DISABLED_BINDING,
      isEscape: false,
      targetId: "editor.save",
      bindings: base,
      registry: SHORTCUT_DEFAULTS,
    });
    expect(result.outcome).toBe("commit");
  });

  test("empty string candidate commits (not modifierless, no conflict)", () => {
    const result = validateRecording({
      pressedCombo: "",
      isEscape: false,
      targetId: "editor.save",
      bindings: base,
      registry: SHORTCUT_DEFAULTS,
    });
    expect(result.outcome).toBe("commit");
  });

  test("Tab alone is rejected as modifierless", () => {
    const result = validateRecording({
      pressedCombo: "Tab",
      isEscape: false,
      targetId: "editor.acceptCompletion",
      bindings: base,
      registry: SHORTCUT_DEFAULTS,
    });
    expect(result.outcome).toBe("reject");
    expect(result.error).toBe("noModifier");
  });

  test("Escape with isEscape=false is rejected as modifierless", () => {
    const result = validateRecording({
      pressedCombo: "Escape",
      isEscape: false,
      targetId: "table.cancelEdit",
      bindings: base,
      registry: SHORTCUT_DEFAULTS,
    });
    expect(result.outcome).toBe("reject");
    expect(result.error).toBe("noModifier");
  });

  test("same combo as current binding commits (re-assign)", () => {
    const result = validateRecording({
      pressedCombo: "Mod+Enter",
      isEscape: false,
      targetId: "editor.execute",
      bindings: base,
      registry: SHORTCUT_DEFAULTS,
    });
    expect(result.outcome).toBe("commit");
  });

  test("Alt+Shift+F conflicts with editor.format on different target", () => {
    const result = validateRecording({
      pressedCombo: "Shift+Alt+F",
      isEscape: false,
      targetId: "global.newQueryTab",
      bindings: base,
      registry: SHORTCUT_DEFAULTS,
    });
    expect(result.outcome).toBe("conflict");
    const conflict = (result as { outcome: "conflict"; conflict: ConflictInfo })
      .conflict;
    expect(conflict.otherId).toBe("editor.format");
  });

  test("conflict with first matching id when multiple share same combo", () => {
    const mutated: ShortcutBindings = {
      ...base,
      "global.newQueryTab": "Mod+S",
    };
    const result = validateRecording({
      pressedCombo: "Mod+S",
      isEscape: false,
      targetId: "editor.save",
      bindings: mutated,
      registry: SHORTCUT_DEFAULTS,
    });
    expect(result.outcome).toBe("conflict");
    const conflict = (result as { outcome: "conflict"; conflict: ConflictInfo })
      .conflict;
    expect(["table.save", "global.newQueryTab"]).toContain(conflict?.otherId);
  });
});
