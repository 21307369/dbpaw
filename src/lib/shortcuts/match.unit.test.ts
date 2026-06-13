import { describe, expect, test } from "bun:test";

import {
  comboFromEvent,
  comboToCodeMirror,
  comboToDisplay,
  isMacOS,
  matchShortcut,
  normalizeCombo,
} from "./match";

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

describe("normalizeCombo", () => {
  test("sorts modifiers alphabetically and dedupes", () => {
    expect(normalizeCombo("Shift+Mod+S")).toBe("Mod+Shift+S");
    expect(normalizeCombo("Mod+Shift+Mod+S")).toBe("Mod+Shift+S");
  });

  test("preserves bare keys", () => {
    expect(normalizeCombo("Tab")).toBe("Tab");
    expect(normalizeCombo("Escape")).toBe("Escape");
  });

  test("lowercases the trailing key", () => {
    expect(normalizeCombo("Mod+F5")).toBe("Mod+F5");
  });

  test("trims whitespace", () => {
    expect(normalizeCombo(" Mod + S ")).toBe("Mod+S");
  });
});

describe("matchShortcut", () => {
  test("Mod+S matches Cmd-only on macOS", () => {
    const e = makeEvent({ code: "KeyS", metaKey: true, ctrlKey: false });
    expect(matchShortcut(e, "Mod+S", { isMacOS: true })).toBe(true);
  });

  test("Mod+S matches Ctrl-only on Windows/Linux", () => {
    const e = makeEvent({ code: "KeyS", metaKey: false, ctrlKey: true });
    expect(
      matchShortcut(e, "Mod+S", { isMacOS: false }),
    ).toBe(true);
  });

  test("Mod+S does not match both Cmd+Ctrl held", () => {
    const e = makeEvent({
      code: "KeyS",
      metaKey: true,
      ctrlKey: true,
    });
    expect(
      matchShortcut(e, "Mod+S", { isMacOS: true }),
    ).toBe(false);
    expect(
      matchShortcut(e, "Mod+S", { isMacOS: false }),
    ).toBe(false);
  });

  test("Extra Shift on Mod+S binding returns false", () => {
    const e = makeEvent({
      code: "KeyS",
      metaKey: false,
      ctrlKey: true,
      shiftKey: true,
    });
    expect(
      matchShortcut(e, "Mod+S", { isMacOS: false }),
    ).toBe(false);
  });

  test("Mod+Shift+BracketRight matches BracketRight with Shift", () => {
    const e = makeEvent({
      code: "BracketRight",
      metaKey: false,
      ctrlKey: true,
      shiftKey: true,
    });
    expect(
      matchShortcut(e, "Mod+Shift+BracketRight", { isMacOS: false }),
    ).toBe(true);
  });

  test("none returns false for any event", () => {
    const e = makeEvent({ code: "KeyS", metaKey: false, ctrlKey: true });
    expect(
      matchShortcut(e, "none", { isMacOS: false }),
    ).toBe(false);
  });

  test("F5 round-trips", () => {
    const e = makeEvent({ code: "F5" });
    expect(matchShortcut(e, "F5", { isMacOS: false })).toBe(true);
  });

  test("Tab round-trips without modifiers", () => {
    const e = makeEvent({ code: "Tab" });
    expect(matchShortcut(e, "Tab", { isMacOS: false })).toBe(true);
  });

  test("Escape round-trips without modifiers", () => {
    const e = makeEvent({ code: "Escape" });
    expect(matchShortcut(e, "Escape", { isMacOS: false })).toBe(true);
  });

  test("Mod+Enter matches Enter code with primary modifier", () => {
    const e = makeEvent({
      code: "Enter",
      metaKey: false,
      ctrlKey: true,
    });
    expect(
      matchShortcut(e, "Mod+Enter", { isMacOS: false }),
    ).toBe(true);
  });
});

describe("comboFromEvent", () => {
  test("Cmd+S on Mac becomes Mod+S", () => {
    const e = makeEvent({ code: "KeyS", metaKey: true, ctrlKey: false });
    expect(comboFromEvent(e, true)).toBe("Mod+S");
  });

  test("Ctrl+S on Win/Linux becomes Mod+S", () => {
    const e = makeEvent({ code: "KeyS", metaKey: false, ctrlKey: true });
    expect(comboFromEvent(e, false)).toBe("Mod+S");
  });

  test("Cmd+Shift+] on Mac becomes Mod+Shift+BracketRight", () => {
    const e = makeEvent({
      code: "BracketRight",
      metaKey: true,
      ctrlKey: false,
      shiftKey: true,
    });
    expect(comboFromEvent(e, true)).toBe("Mod+Shift+BracketRight");
  });

  test("Ctrl+Shift+F on Win/Linux becomes Mod+Shift+F", () => {
    const e = makeEvent({
      code: "KeyF",
      metaKey: false,
      ctrlKey: true,
      shiftKey: true,
    });
    expect(comboFromEvent(e, false)).toBe("Mod+Shift+F");
  });

  test("Bare F5 stays F5", () => {
    const e = makeEvent({ code: "F5" });
    expect(comboFromEvent(e, false)).toBe("F5");
  });
});

describe("comboToDisplay", () => {
  test("Cmd symbol on macOS for Mod", () => {
    expect(comboToDisplay("Mod+S", true)).toBe("⌘ + S");
  });

  test("Ctrl word on Windows for Mod", () => {
    expect(comboToDisplay("Mod+S", false)).toBe("Ctrl + S");
  });

  test("Shift becomes ⇧ on Mac, Shift on Win", () => {
    expect(comboToDisplay("Mod+Shift+BracketRight", true)).toBe(
      "⌘ + ⇧ + ]",
    );
    expect(comboToDisplay("Mod+Shift+BracketRight", false)).toBe(
      "Ctrl + Shift + ]",
    );
  });

  test("Alt becomes ⌥ on Mac, Alt on Win", () => {
    expect(comboToDisplay("Alt+F4", true)).toBe("⌥ + F4");
    expect(comboToDisplay("Alt+F4", false)).toBe("Alt + F4");
  });

  test("Bare Tab on Mac", () => {
    expect(comboToDisplay("Tab", true)).toBe("Tab");
  });

  test("none shows 'Disabled'", () => {
    expect(comboToDisplay("none", true)).toBe("Disabled");
    expect(comboToDisplay("none", false)).toBe("Disabled");
  });

  test("empty string returns empty", () => {
    expect(comboToDisplay("", false)).toBe("");
  });

  test("Meta becomes ⌃ on Mac, Win on Windows", () => {
    expect(comboToDisplay("Meta+S", true)).toBe("⌃ + S");
    expect(comboToDisplay("Meta+S", false)).toBe("Win + S");
  });

  test("Ctrl becomes ⌃ on Mac", () => {
    expect(comboToDisplay("Ctrl+S", true)).toBe("⌃ + S");
  });

  test("Digit keys display correctly", () => {
    expect(comboToDisplay("Mod+Digit1", false)).toBe("Ctrl + 1");
  });

  test("Numpad keys display with Num prefix", () => {
    expect(comboToDisplay("Mod+Numpad5", false)).toBe("Ctrl + Num 5");
  });

  test("Arrow keys display as-is", () => {
    expect(comboToDisplay("Mod+ArrowUp", false)).toBe("Ctrl + ArrowUp");
  });

  test("BracketLeft displays as [", () => {
    expect(comboToDisplay("Mod+BracketLeft", false)).toBe("Ctrl + [");
  });

  test("Backslash displays as \\", () => {
    expect(comboToDisplay("Mod+\\", false)).toBe("Ctrl + \\");
  });

  test("Comma displays as ,", () => {
    expect(comboToDisplay("Mod+,", false)).toBe("Ctrl + ,");
  });
});

describe("comboToCodeMirror", () => {
  test("Mod+S stays Mod-S (single uppercase letter)", () => {
    expect(comboToCodeMirror("Mod+S")).toBe("Mod-S");
  });

  test("Mod+Shift+K stays Mod-Shift-K", () => {
    expect(comboToCodeMirror("Mod+Shift+K")).toBe("Mod-Shift-K");
  });

  test("Mod+Enter stays Mod-Enter", () => {
    expect(comboToCodeMirror("Mod+Enter")).toBe("Mod-Enter");
  });

  test("bare Tab stays Tab", () => {
    expect(comboToCodeMirror("Tab")).toBe("Tab");
  });

  test("bare Escape stays Escape", () => {
    expect(comboToCodeMirror("Escape")).toBe("Escape");
  });

  test("Mod+Digit1 becomes Mod-1 (Digit prefix stripped and lowercased)", () => {
    expect(comboToCodeMirror("Mod+Digit1")).toBe("Mod-1");
  });

  test("disabled binding returns empty", () => {
    expect(comboToCodeMirror("none")).toBe("");
  });

  test("empty string returns empty", () => {
    expect(comboToCodeMirror("")).toBe("");
  });

  test("Shift+Alt+F normalizes modifier order", () => {
    expect(comboToCodeMirror("Shift+Alt+F")).toBe("Alt-Shift-F");
  });

  test("Mod+BracketRight stays Mod-BracketRight", () => {
    expect(comboToCodeMirror("Mod+BracketRight")).toBe("Mod-BracketRight");
  });

  test("bare F5 stays F5", () => {
    expect(comboToCodeMirror("F5")).toBe("F5");
  });

  test("Mod+Enter uses modifiers joined with dash", () => {
    expect(comboToCodeMirror("Mod+Shift+Enter")).toBe("Mod-Shift-Enter");
  });
});

describe("normalizeCombo edge cases", () => {
  test("disabled binding passes through", () => {
    expect(normalizeCombo("none")).toBe("none");
  });

  test("empty string returns empty", () => {
    expect(normalizeCombo("")).toBe("");
  });

  test("whitespace-only returns empty", () => {
    expect(normalizeCombo("   ")).toBe("");
  });

  test("preserves modifier order: Mod, Alt, Ctrl, Meta, Shift", () => {
    expect(normalizeCombo("Shift+Meta+Alt+Ctrl+Mod+S")).toBe(
      "Mod+Alt+Ctrl+Meta+Shift+S",
    );
  });

  test("unknown modifiers are preserved after known ones", () => {
    expect(normalizeCombo("Hyper+Mod+S")).toBe("Mod+Hyper+S");
  });

  test("single modifier returns just the modifier", () => {
    expect(normalizeCombo("Mod")).toBe("Mod");
  });
});

describe("matchShortcut edge cases", () => {
  test("empty combo returns false", () => {
    const e = makeEvent({ code: "KeyS", ctrlKey: true });
    expect(matchShortcut(e, "", { isMacOS: false })).toBe(false);
  });

  test("bare key requires no modifiers held", () => {
    const e = makeEvent({ code: "F5", shiftKey: true });
    expect(matchShortcut(e, "F5", { isMacOS: false })).toBe(false);
  });

  test("Ctrl on Mac does not match Mod (which maps to Meta)", () => {
    const e = makeEvent({ code: "KeyS", ctrlKey: true, metaKey: false });
    expect(matchShortcut(e, "Mod+S", { isMacOS: true })).toBe(false);
  });

  test("Alt+key matches Alt binding", () => {
    const e = makeEvent({ code: "KeyF4", altKey: true });
    expect(matchShortcut(e, "Alt+KeyF4", { isMacOS: false })).toBe(true);
  });

  test("Digit code normalizes correctly", () => {
    const e = makeEvent({ code: "Digit5", ctrlKey: true });
    expect(matchShortcut(e, "Mod+Digit5", { isMacOS: false })).toBe(true);
  });

  test("Numpad code normalizes correctly", () => {
    const e = makeEvent({ code: "Numpad5" });
    expect(matchShortcut(e, "Numpad5", { isMacOS: false })).toBe(true);
  });
});

describe("comboFromEvent edge cases", () => {
  test("modifier-only press (Ctrl only) generates Mod+ControlLeft", () => {
    const e = makeEvent({ code: "ControlLeft", ctrlKey: true });
    expect(comboFromEvent(e, false)).toBe("Mod+ControlLeft");
  });

  test("modifier-only press (Shift only) generates Shift+ShiftLeft", () => {
    const e = makeEvent({ code: "ShiftLeft", shiftKey: true });
    expect(comboFromEvent(e, false)).toBe("Shift+ShiftLeft");
  });

  test("bare key without modifiers", () => {
    const e = makeEvent({ code: "KeyA" });
    expect(comboFromEvent(e, false)).toBe("A");
  });

  test("all modifiers held on Windows", () => {
    const e = makeEvent({
      code: "KeyS",
      ctrlKey: true,
      altKey: true,
      shiftKey: true,
    });
    expect(comboFromEvent(e, false)).toBe("Mod+Alt+Shift+S");
  });

  test("Cmd+Ctrl on Mac puts both Mod and Ctrl", () => {
    const e = makeEvent({ code: "KeyS", metaKey: true, ctrlKey: true });
    expect(comboFromEvent(e, true)).toBe("Mod+Ctrl+S");
  });
});
