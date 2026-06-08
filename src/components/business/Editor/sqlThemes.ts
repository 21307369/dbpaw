import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";
import { oneDark } from "@codemirror/theme-one-dark";
import type { Extension } from "@uiw/react-codemirror";
import { getThemePreset, type ThemeId } from "@/theme/themeRegistry";
import { sqlEditorThemeDark, sqlEditorThemeLight } from "./codemirrorTheme";

export type SqlSyntaxPalette = {
  keyword: string;
  function: string;
  type: string;
  string: string;
  number: string;
  variable: string;
  operator: string;
  comment: string;
  constant: string;
};

export const createSqlSyntaxTheme = (palette: SqlSyntaxPalette): Extension[] => [
  syntaxHighlighting(
    HighlightStyle.define([
      { tag: t.keyword, color: palette.keyword },
      { tag: t.operatorKeyword, color: palette.keyword },
      { tag: t.typeName, color: palette.type },
      { tag: t.className, color: palette.type },
      { tag: t.function(t.variableName), color: palette.function },
      { tag: t.function(t.propertyName), color: palette.function },
      { tag: t.name, color: palette.variable },
      { tag: t.propertyName, color: palette.variable },
      { tag: t.variableName, color: palette.variable },
      { tag: t.string, color: palette.string },
      { tag: t.special(t.string), color: palette.string },
      { tag: t.number, color: palette.number },
      { tag: t.bool, color: palette.constant },
      { tag: t.atom, color: palette.constant },
      { tag: t.operator, color: palette.operator },
      { tag: t.comment, color: palette.comment, fontStyle: "italic" },
    ]),
  ),
];

export const SQL_SYNTAX_THEME_MAP: Record<ThemeId, Extension[]> = {
  default: [],
  "one-dark": [oneDark],
  "github-light": createSqlSyntaxTheme({
    keyword: "#cf222e",
    function: "#8250df",
    type: "#0550ae",
    string: "#0a3069",
    number: "#0550ae",
    variable: "#24292f",
    operator: "#57606a",
    comment: "#6e7781",
    constant: "#953800",
  }),
  "github-dark": createSqlSyntaxTheme({
    keyword: "#ff7b72",
    function: "#d2a8ff",
    type: "#79c0ff",
    string: "#a5d6ff",
    number: "#79c0ff",
    variable: "#c9d1d9",
    operator: "#8b949e",
    comment: "#8b949e",
    constant: "#ffa657",
  }),
  "monokai-pro": createSqlSyntaxTheme({
    keyword: "#ff6188",
    function: "#a9dc76",
    type: "#78dce8",
    string: "#ffd866",
    number: "#ab9df2",
    variable: "#fcfcfa",
    operator: "#f8f8f2",
    comment: "#939293",
    constant: "#fc9867",
  }),
  "night-owl": createSqlSyntaxTheme({
    keyword: "#c792ea",
    function: "#82aaff",
    type: "#7fdbca",
    string: "#ecc48d",
    number: "#f78c6c",
    variable: "#d6deeb",
    operator: "#7fdbca",
    comment: "#637777",
    constant: "#ff5874",
  }),
  "shades-of-purple": createSqlSyntaxTheme({
    keyword: "#ff9d00",
    function: "#b362ff",
    type: "#9effff",
    string: "#a5ff90",
    number: "#ff628c",
    variable: "#ffffff",
    operator: "#ff9d00",
    comment: "#b9b4f5",
    constant: "#fad000",
  }),
  palenight: createSqlSyntaxTheme({
    keyword: "#c792ea",
    function: "#82aaff",
    type: "#89ddff",
    string: "#c3e88d",
    number: "#f78c6c",
    variable: "#c7cbe6",
    operator: "#89ddff",
    comment: "#7f85a3",
    constant: "#ffcb6b",
  }),
  cyberpunk: createSqlSyntaxTheme({
    keyword: "#ff2bd6",
    function: "#00f5ff",
    type: "#7df9ff",
    string: "#ffe66d",
    number: "#ff8fab",
    variable: "#f8f7ff",
    operator: "#00f5ff",
    comment: "#9f88c5",
    constant: "#faff00",
  }),
  nord: createSqlSyntaxTheme({
    keyword: "#81a1c1",
    function: "#88c0d0",
    type: "#8fbcbb",
    string: "#a3be8c",
    number: "#b48ead",
    variable: "#eceff4",
    operator: "#d8dee9",
    comment: "#616e88",
    constant: "#ebcb8b",
  }),
  dracula: createSqlSyntaxTheme({
    keyword: "#ff79c6",
    function: "#50fa7b",
    type: "#8be9fd",
    string: "#f1fa8c",
    number: "#bd93f9",
    variable: "#f8f8f2",
    operator: "#ff79c6",
    comment: "#6272a4",
    constant: "#ffb86c",
  }),
};

export function getEditorTheme(theme: string): Extension[] {
  const preset = getThemePreset(theme as ThemeId);
  const syntaxTheme = SQL_SYNTAX_THEME_MAP[preset.editorTheme] ?? [];
  return preset.appearance === "dark"
    ? [...syntaxTheme, sqlEditorThemeDark]
    : [...syntaxTheme, sqlEditorThemeLight];
}
