import type { ShortcutsRegistry } from "./types";

export const SHORTCUT_DEFAULTS: ShortcutsRegistry = {
  "global.openSettings": {
    combo: "Mod+,",
    scope: "global",
    labelKey: "settings.shortcuts.label.openSettings",
  },
  "global.toggleAiSidebar": {
    combo: "Mod+\\",
    scope: "global",
    labelKey: "settings.shortcuts.label.toggleAiSidebar",
  },
  "global.toggleMainSidebar": {
    combo: "Mod+B",
    scope: "global",
    labelKey: "settings.shortcuts.label.toggleMainSidebar",
  },
  "global.newQueryTab": {
    combo: "Mod+N",
    scope: "global",
    labelKey: "settings.shortcuts.label.newQueryTab",
  },
  "global.closeTab": {
    combo: "Mod+W",
    scope: "global",
    labelKey: "settings.shortcuts.label.closeTab",
  },
  "global.nextTab": {
    combo: "Mod+Shift+BracketRight",
    scope: "global",
    labelKey: "settings.shortcuts.label.nextTab",
  },
  "global.prevTab": {
    combo: "Mod+Shift+BracketLeft",
    scope: "global",
    labelKey: "settings.shortcuts.label.prevTab",
  },
  "editor.execute": {
    combo: "Mod+Enter",
    scope: "editor",
    labelKey: "settings.shortcuts.label.execute",
  },
  "editor.save": {
    combo: "Mod+S",
    scope: "editor",
    labelKey: "settings.shortcuts.label.saveQuery",
  },
  "editor.format": {
    combo: "Shift+Alt+F",
    scope: "editor",
    labelKey: "settings.shortcuts.label.format",
  },
  "editor.acceptCompletion": {
    combo: "Tab",
    scope: "editor",
    labelKey: "settings.shortcuts.label.acceptCompletion",
  },
  "table.save": {
    combo: "Mod+S",
    scope: "table",
    labelKey: "settings.shortcuts.label.saveChanges",
  },
  "table.openSearch": {
    combo: "Mod+F",
    scope: "table",
    labelKey: "settings.shortcuts.label.openSearch",
  },
  "table.copySelection": {
    combo: "Mod+C",
    scope: "table",
    labelKey: "settings.shortcuts.label.copySelection",
  },
  "table.cancelEdit": {
    combo: "Escape",
    scope: "table",
    labelKey: "settings.shortcuts.label.cancelEdit",
  },
};

export const SCOPE_GROUP_ORDER: ReadonlyArray<{
  scope: ShortcutsRegistry[keyof ShortcutsRegistry]["scope"];
  titleKey: string;
}> = [
  { scope: "global", titleKey: "settings.shortcuts.group.global" },
  { scope: "editor", titleKey: "settings.shortcuts.group.editor" },
  { scope: "table", titleKey: "settings.shortcuts.group.table" },
  { scope: "input", titleKey: "settings.shortcuts.group.input" },
];
