import { DISABLED_BINDING, type KeyCombo } from "./types";

const MODIFIER_ORDER = ["Mod", "Alt", "Ctrl", "Meta", "Shift"] as const;
type ModifierToken = (typeof MODIFIER_ORDER)[number];

export function isMacOS(): boolean {
  if (typeof navigator === "undefined") return false;
  const nd = navigator as Navigator & { userAgentData?: { platform?: string } };
  if (nd.userAgentData?.platform) {
    return /mac/i.test(nd.userAgentData.platform);
  }
  const platform = nd.platform ?? "";
  const userAgent = nd.userAgent ?? "";
  return (
    /Mac|iPhone|iPad|iPod/i.test(platform) || /Mac OS X/i.test(userAgent)
  );
}

function splitCombo(combo: KeyCombo): {
  modifiers: ModifierToken[];
  key: string;
} {
  const parts = combo
    .split("+")
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
  if (parts.length === 0) {
    return { modifiers: [], key: "" };
  }
  const key = parts[parts.length - 1];
  const modifiers = parts
    .slice(0, -1)
    .map((m) => m.charAt(0).toUpperCase() + m.slice(1).toLowerCase()) as ModifierToken[];
  return { modifiers, key };
}

function normalizeKeyCode(code: string): string {
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit\d$/.test(code)) return code.slice(5);
  if (/^Numpad\d$/.test(code)) return "Num" + code.slice(6);
  return code;
}

function equivalentKey(want: string, actualCode: string): boolean {
  if (want === actualCode) return true;
  if (normalizeKeyCode(actualCode) === want) return true;
  return false;
}

export function normalizeCombo(combo: KeyCombo): KeyCombo {
  if (combo === DISABLED_BINDING) return DISABLED_BINDING;
  const { modifiers, key } = splitCombo(combo);
  if (!key) return "";
  const seen = new Set<ModifierToken>();
  const ordered: ModifierToken[] = [];
  for (const m of MODIFIER_ORDER) {
    if (modifiers.includes(m) && !seen.has(m)) {
      seen.add(m);
      ordered.push(m);
    }
  }
  for (const m of modifiers) {
    if (!seen.has(m)) {
      seen.add(m);
      ordered.push(m);
    }
  }
  if (ordered.length === 0) return key;
  return [...ordered, key].join("+");
}

function heldModifiers(e: KeyboardEvent, isMac: boolean): Set<string> {
  const held = new Set<string>();
  if (e.altKey) held.add("Alt");
  if (e.shiftKey) held.add("Shift");
  if (isMac) {
    if (e.metaKey) held.add("Mod");
    if (e.ctrlKey) held.add("Ctrl");
  } else {
    if (e.ctrlKey) held.add("Mod");
    if (e.metaKey) held.add("Meta");
  }
  return held;
}

export function matchShortcut(
  e: KeyboardEvent,
  combo: KeyCombo,
  options: { isMacOS: boolean } = { isMacOS: isMacOS() },
): boolean {
  if (combo === DISABLED_BINDING) return false;
  const normalized = normalizeCombo(combo);
  if (!normalized) return false;
  const { modifiers: wantMods, key: wantKey } = splitCombo(normalized);
  const held = heldModifiers(e, options.isMacOS);

  if (wantMods.includes("Mod")) {
    if (!held.has("Mod")) return false;
  } else {
    if (held.has("Mod")) return false;
  }
  if (wantMods.includes("Alt") !== held.has("Alt")) return false;
  if (wantMods.includes("Shift") !== held.has("Shift")) return false;
  if (wantMods.includes("Ctrl") !== held.has("Ctrl")) return false;
  if (wantMods.includes("Meta") !== held.has("Meta")) return false;

  return equivalentKey(wantKey, e.code);
}

export function comboFromEvent(
  e: KeyboardEvent,
  macOverride?: boolean,
): KeyCombo {
  const isMac = macOverride ?? isMacOS();
  const held = heldModifiers(e, isMac);
  const mods: ModifierToken[] = [];
  if (held.has("Mod")) mods.push("Mod");
  if (held.has("Alt")) mods.push("Alt");
  if (held.has("Ctrl")) mods.push("Ctrl");
  if (held.has("Meta")) mods.push("Meta");
  if (held.has("Shift")) mods.push("Shift");
  return normalizeCombo([...mods, normalizeKeyCode(e.code)].join("+"));
}

const MAC_GLYPHS: Record<string, string> = {
  Mod: "⌘",
  Alt: "⌥",
  Ctrl: "⌃",
  Meta: "⌃",
  Shift: "⇧",
};

const WIN_LABELS: Record<string, string> = {
  Mod: "Ctrl",
  Alt: "Alt",
  Ctrl: "Ctrl",
  Meta: "Win",
  Shift: "Shift",
};

const BRACKET_DISPLAY: Record<string, string> = {
  BracketRight: "]",
  BracketLeft: "[",
  Backslash: "\\",
  Slash: "/",
  Comma: ",",
  Period: ".",
  Semicolon: ";",
  Quote: "'",
  Backquote: "`",
  Minus: "-",
  Equal: "=",
};

function keyToDisplay(token: string): string {
  const bracketed = BRACKET_DISPLAY[token];
  if (bracketed) return bracketed;
  if (/^Key[A-Z]$/.test(token)) return token.slice(3);
  if (/^Digit\d$/.test(token)) return token.slice(5);
  if (/^Numpad\d$/.test(token)) return "Num " + token.slice(6);
  if (token.startsWith("Arrow")) return token;
  return token;
}

export function comboToDisplay(
  combo: KeyCombo,
  macOverride?: boolean,
): string {
  if (combo === DISABLED_BINDING) return "Disabled";
  const isMac = macOverride ?? isMacOS();
  const { modifiers, key } = splitCombo(normalizeCombo(combo));
  if (!key) return "";
  const labels = isMac ? MAC_GLYPHS : WIN_LABELS;
  const parts = modifiers.map((m) => labels[m] ?? m);
  parts.push(keyToDisplay(key));
  return parts.join(" + ");
}

export function comboToCodeMirror(combo: KeyCombo): string {
  if (!combo || combo === DISABLED_BINDING) return "";
  const { modifiers, key } = splitCombo(normalizeCombo(combo));
  if (!key) return "";
  const tail =
    /^Key[A-Z]$/.test(key) || /^Digit\d$/.test(key)
      ? key.slice(/^Key/.test(key) ? 3 : 5).toLowerCase()
      : key;
  return [...modifiers, tail].join("-");
}
