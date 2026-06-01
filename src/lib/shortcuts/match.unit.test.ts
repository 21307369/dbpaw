import { describe, expect, test } from "bun:test";

import {
  comboFromEvent,
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
});
