export type ShortcutScope = "global" | "editor" | "table" | "input";

export type ShortcutId =
  | "global.openSettings"
  | "global.toggleAiSidebar"
  | "global.toggleMainSidebar"
  | "global.newQueryTab"
  | "global.closeTab"
  | "global.nextTab"
  | "global.prevTab"
  | "editor.execute"
  | "editor.save"
  | "editor.format"
  | "editor.acceptCompletion"
  | "table.save"
  | "table.openSearch"
  | "table.copySelection"
  | "table.cancelEdit";

export type KeyCombo = string;

export type ShortcutDef = {
  combo: KeyCombo;
  scope: ShortcutScope;
  labelKey: string;
  noteKey?: string;
};

export type ShortcutsRegistry = Record<ShortcutId, ShortcutDef>;

export type ShortcutBindings = Record<ShortcutId, KeyCombo>;

export const DISABLED_BINDING: KeyCombo = "none";

export const SHORTCUTS_STORE_KEY = "shortcuts.v1";
